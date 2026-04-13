/**
 * SSE server for the Mars Genesis dashboard.
 *
 * Serves setup page, dashboard, and SSE event stream.
 * Reads .env for default API key. Setup page POSTs config to start simulation.
 *
 * Usage:
 *   npx tsx src/serve.ts [turns]
 *   Open http://localhost:3456/setup to configure, or / for dashboard
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3456', 10);

// Load .env if it exists
const envPath = resolve(__dirname, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.+?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

// Simulation config (set via /setup POST or CLI defaults)
let simConfig: {
  leaders: Array<{ name: string; archetype: string; colony: string; hexaco: any; instructions: string }>;
  turns: number;
  seed: number;
  liveSearch: boolean;
  customEvents: Array<{ turn: number; title: string; description: string }>;
  models: { commander: string; departments: string; judge: string };
} | null = null;

let simRunning = false;

// SSE clients
const clients: Set<ServerResponse> = new Set();

function broadcast(event: string, data: unknown) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(msg); } catch { clients.delete(res); }
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// HTTP server
const server = createServer(async (req, res) => {
  // SSE endpoint
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

  // Setup page
  if (req.url === '/setup' && req.method === 'GET') {
    let html = readFileSync(resolve(__dirname, 'dashboard/setup.html'), 'utf-8');
    // Inject masked API key
    const key = process.env.OPENAI_API_KEY || '';
    const masked = key ? key.slice(0, 7) + '...' + key.slice(-4) : '';
    html = html.replace('__SERVER_API_KEY__', masked);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Setup POST - receive config and start simulation
  if (req.url === '/setup' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const config = JSON.parse(body);

      // Validate
      if (!config.leaders || config.leaders.length < 2) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Two leaders required' }));
        return;
      }

      // Set API key if provided (and not masked placeholder)
      if (config.apiKey && !config.apiKey.includes('...')) {
        process.env.OPENAI_API_KEY = config.apiKey;
      }

      simConfig = {
        leaders: config.leaders,
        turns: config.turns || 12,
        seed: config.seed || 950,
        liveSearch: config.liveSearch || false,
        customEvents: config.customEvents || [],
        models: config.models || { commander: 'gpt-5.4', departments: 'gpt-5.4-mini', judge: 'gpt-5.4' },
      };

      // Start simulation in background
      if (!simRunning) {
        simRunning = true;
        runSimulations().finally(() => { simRunning = false; });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ redirect: '/' }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  if (req.url === '/about') {
    const html = readFileSync(resolve(__dirname, 'dashboard/about.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
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
});

const cliTurns = process.argv[2] ? parseInt(process.argv[2], 10) : null;

server.listen(PORT, () => {
  console.log(`\n  Mars Genesis Dashboard: http://localhost:${PORT}`);
  console.log(`  Setup page: http://localhost:${PORT}/setup`);
  console.log(`  SSE endpoint: http://localhost:${PORT}/events\n`);

  // Auto-start with defaults if turns specified via CLI (backward compat)
  if (cliTurns) {
    simConfig = {
      leaders: [
        { name: 'Aria Chen', archetype: 'The Visionary', colony: 'Ares Horizon',
          hexaco: { openness: 0.95, conscientiousness: 0.35, extraversion: 0.85, agreeableness: 0.55, emotionality: 0.3, honestyHumility: 0.65 },
          instructions: 'You are Commander Aria Chen. Bold expansion, calculated risks. Favor higher upside. Respond with JSON.' },
        { name: 'Dietrich Voss', archetype: 'The Engineer', colony: 'Meridian Base',
          hexaco: { openness: 0.25, conscientiousness: 0.97, extraversion: 0.3, agreeableness: 0.45, emotionality: 0.7, honestyHumility: 0.9 },
          instructions: 'You are Commander Dietrich Voss. Engineering discipline, safety margins. Favor lower risk. Respond with JSON.' },
      ],
      turns: cliTurns,
      seed: 950,
      liveSearch: false,
      customEvents: [],
      models: { commander: 'gpt-5.4', departments: 'gpt-5.4-mini', judge: 'gpt-5.4' },
    };
    simRunning = true;
    runSimulations().finally(() => { simRunning = false; });
  } else {
    console.log('  Waiting for setup at /setup. No simulation started yet.\n');
  }
});

async function runSimulations() {
  if (!simConfig) return;

  const { leaders, turns, seed, liveSearch, customEvents } = simConfig;
  broadcast('status', { phase: 'starting', maxTurns: turns });

  const { runSimulation } = await import('./agents/orchestrator.js');

  const KEY_PERSONNEL = [
    { name: 'Dr. Yuki Tanaka', department: 'medical' as const, role: 'Chief Medical Officer', specialization: 'Radiation Medicine', age: 38, featured: true },
    { name: 'Erik Lindqvist', department: 'engineering' as const, role: 'Chief Engineer', specialization: 'Structural Engineering', age: 45, featured: true },
    { name: 'Amara Osei', department: 'agriculture' as const, role: 'Head of Agriculture', specialization: 'Hydroponics', age: 34, featured: true },
    { name: 'Dr. Priya Singh', department: 'psychology' as const, role: 'Colony Psychologist', specialization: 'Clinical Psychology', age: 41, featured: true },
    { name: 'Carlos Fernandez', department: 'science' as const, role: 'Chief Scientist', specialization: 'Geology', age: 50, featured: true },
  ];

  const onEvent = (event: any) => broadcast('sim', event);
  broadcast('status', { phase: 'parallel', leaders: leaders.map(l => l.name) });

  console.log(`  Running: ${leaders[0].name} vs ${leaders[1].name} | ${turns} turns | seed ${seed}\n`);

  const promises = leaders.map((leader, i) => {
    const tag = i === 0 ? 'visionary' : 'engineer';
    return runSimulation(leader, KEY_PERSONNEL, { maxTurns: turns, seed, liveSearch, onEvent, customEvents }).then(
      r => { broadcast('result', { leader: tag, summary: { population: r.finalState?.colony?.population, morale: r.finalState?.colony?.morale, toolsForged: r.totalToolsForged, citations: r.totalCitations } }); },
      err => { broadcast('sim_error', { leader: tag, error: String(err) }); },
    );
  });

  await Promise.all(promises);

  broadcast('complete', { timestamp: new Date().toISOString() });
  console.log('\n  Simulations complete. Dashboard at http://localhost:' + PORT);
  console.log('  Run again at http://localhost:' + PORT + '/setup\n');
}
