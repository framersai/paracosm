import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSimulationConfig, type NormalizedSimulationConfig } from './sim-config.js';
import { runPairSimulations, type BroadcastFn } from './pair-runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolveBody(body));
    req.on('error', reject);
  });
}

export interface CreateMarsServerOptions {
  env?: NodeJS.ProcessEnv;
  runPairSimulations?: (config: NormalizedSimulationConfig, broadcast: BroadcastFn) => Promise<void>;
}

export interface MarsServer extends Server {
  startWithConfig: (config: NormalizedSimulationConfig) => Promise<void>;
}

export function createMarsServer(options: CreateMarsServerOptions = {}): MarsServer {
  const env = options.env ?? process.env;
  let simConfig: NormalizedSimulationConfig | null = null;
  let simRunning = false;
  const clients: Set<ServerResponse> = new Set();

  const broadcast: BroadcastFn = (event, data) => {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      try {
        res.write(msg);
      } catch {
        clients.delete(res);
      }
    }
  };

  const startSimulations = options.runPairSimulations ?? runPairSimulations;

  const server = createServer(async (req, res) => {
    if (req.url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write('event: connected\ndata: {}\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (req.url === '/setup' && req.method === 'GET') {
      res.writeHead(302, { Location: '/#settings' });
      res.end();
      return;
    }

    if (req.url === '/setup' && req.method === 'POST') {
      try {
        const config = JSON.parse(await readBody(req));
        if (!config.leaders || config.leaders.length < 2) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Two leaders required' }));
          return;
        }

        simConfig = normalizeSimulationConfig(config);

        if (simConfig.apiKey && !simConfig.apiKey.includes('...')) {
          env.OPENAI_API_KEY = simConfig.apiKey;
        }
        if (simConfig.anthropicKey && !simConfig.anthropicKey.includes('...')) {
          env.ANTHROPIC_API_KEY = simConfig.anthropicKey;
        }
        if (simConfig.serperKey && !simConfig.serperKey.includes('...')) {
          env.SERPER_API_KEY = simConfig.serperKey;
        }

        if (!simRunning) {
          void marsServer.startWithConfig(simConfig);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ redirect: '/' }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(error) }));
      }
      return;
    }

    if (req.url === '/about') {
      res.writeHead(302, { Location: '/#about' });
      res.end();
      return;
    }

    if (req.url === '/main.js') {
      const js = readFileSync(resolve(__dirname, 'dashboard/main.js'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(js);
      return;
    }

    if (req.url === '/' || req.url === '/index.html') {
      const html = readFileSync(resolve(__dirname, 'dashboard/index.html'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  }) as MarsServer;

  const marsServer = Object.assign(server, {
    async startWithConfig(config: NormalizedSimulationConfig) {
      simConfig = config;
      simRunning = true;
      try {
        await startSimulations(config, broadcast);
      } finally {
        simRunning = false;
      }
    },
  });

  return marsServer;
}
