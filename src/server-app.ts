import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSimulationConfig, type NormalizedSimulationConfig } from './sim-config.js';
import { runPairSimulations, type BroadcastFn } from './pair-runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// IP rate limiter: max simulations per IP per day
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number; // epoch ms
}

class IpRateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private maxPerDay: number;
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(maxPerDay: number = 3) {
    this.maxPerDay = maxPerDay;
    // Purge expired entries every hour
    this.cleanupTimer = setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  /** Extract client IP, respecting reverse proxy headers (nginx, Cloudflare, etc.) */
  static getIp(req: IncomingMessage): string {
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
      const first = (Array.isArray(xff) ? xff[0] : xff).split(',')[0].trim();
      if (first) return first;
    }
    const realIp = req.headers['x-real-ip'];
    if (realIp) return Array.isArray(realIp) ? realIp[0] : realIp;
    const cfIp = req.headers['cf-connecting-ip'];
    if (cfIp) return Array.isArray(cfIp) ? cfIp[0] : cfIp;
    return req.socket.remoteAddress || 'unknown';
  }

  /** Check if request is allowed. Returns { allowed, remaining, resetAt } */
  check(ip: string): { allowed: boolean; remaining: number; resetAt: number; limit: number } {
    const now = Date.now();
    let entry = this.store.get(ip);

    if (!entry || now >= entry.resetAt) {
      // New window: midnight UTC tomorrow
      const tomorrow = new Date();
      tomorrow.setUTCHours(24, 0, 0, 0);
      entry = { count: 0, resetAt: tomorrow.getTime() };
      this.store.set(ip, entry);
    }

    const remaining = Math.max(0, this.maxPerDay - entry.count);
    return { allowed: entry.count < this.maxPerDay, remaining, resetAt: entry.resetAt, limit: this.maxPerDay };
  }

  /** Record a simulation start for this IP */
  record(ip: string): void {
    const entry = this.store.get(ip);
    if (entry) entry.count++;
  }

  /** Get stats for monitoring */
  stats(): { totalIps: number; entries: Array<{ ip: string; count: number; resetAt: string }> } {
    return {
      totalIps: this.store.size,
      entries: [...this.store.entries()].map(([ip, e]) => ({
        ip, count: e.count, resetAt: new Date(e.resetAt).toISOString(),
      })),
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [ip, entry] of this.store) {
      if (now >= entry.resetAt) this.store.delete(ip);
    }
  }

  destroy(): void { clearInterval(this.cleanupTimer); }
}

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
  /** Max simulations per IP per day. 0 = unlimited. Default: 3. Set via RATE_LIMIT env var. */
  maxSimsPerDay?: number;
}

export interface MarsServer extends Server {
  startWithConfig: (config: NormalizedSimulationConfig) => Promise<void>;
}

export function createMarsServer(options: CreateMarsServerOptions = {}): MarsServer {
  const env = options.env ?? process.env;
  const maxSims = options.maxSimsPerDay ?? parseInt(env.RATE_LIMIT || '3', 10);
  const rateLimiter = maxSims > 0 ? new IpRateLimiter(maxSims) : null;
  let simConfig: NormalizedSimulationConfig | null = null;
  let simRunning = false;
  const clients: Set<ServerResponse> = new Set();

  // Event buffer: stores all broadcast events so new clients can catch up
  const eventBuffer: string[] = [];

  const broadcast: BroadcastFn = (event, data) => {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    eventBuffer.push(msg);
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
      // Replay all buffered events so new clients catch up
      for (const msg of eventBuffer) {
        try { res.write(msg); } catch { break; }
      }
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (req.url === '/clear' && req.method === 'POST') {
      eventBuffer.length = 0;
      simConfig = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ cleared: true }));
      return;
    }

    if (req.url === '/setup' && req.method === 'GET') {
      res.writeHead(302, { Location: '/#settings' });
      res.end();
      return;
    }

    // Rate limit status endpoint
    // Post-simulation colonist chat
    if (req.url === '/chat' && req.method === 'POST') {
      try {
        const { colonistId, message, history } = JSON.parse(await readBody(req));
        if (!colonistId || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'colonistId and message required' }));
          return;
        }
        // Find colonist in the last broadcast result
        const lastResultEvent = eventBuffer.find(msg => msg.includes('"finalState"'));
        if (!lastResultEvent) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No simulation data available. Run a simulation first.' }));
          return;
        }
        // Lazy import to avoid loading LLM at server start
        const { generateText } = await import('@framers/agentos');
        // Extract colonist data from broadcast events
        const simEvents = eventBuffer
          .filter(msg => msg.startsWith('event: sim\n'))
          .map(msg => { try { return JSON.parse(msg.split('data: ')[1]); } catch { return null; } })
          .filter(Boolean);
        // Find colonist reactions across all turns
        const colonistReactions = simEvents
          .filter((e: any) => e.type === 'colonist_reactions')
          .flatMap((e: any) => (e.data?.reactions || []).filter((r: any) => r.colonistId === colonistId || r.name?.toLowerCase().includes(colonistId.toLowerCase())));
        const colonist = colonistReactions[0];
        const allQuotes = colonistReactions.map((r: any) => `Turn ${r.turn || '?'}: "${r.quote}" (${r.mood})`).join('\n');
        const chatHistory = (history || []).slice(-6).map((h: any) => `${h.role === 'user' ? 'Human' : colonist?.name || 'Colonist'}: ${h.content}`).join('\n');

        const prompt = `You are ${colonist?.name || colonistId}, a colonist on Mars. Stay in character.
${colonist ? `Age: ${colonist.age}. ${colonist.marsborn ? 'Born on Mars.' : 'Born on Earth.'} Role: ${colonist.role} in ${colonist.department}. Specialization: ${colonist.specialization || 'general'}.
HEXACO: O=${colonist.hexaco?.O} C=${colonist.hexaco?.C} E=${colonist.hexaco?.E} A=${colonist.hexaco?.A} Em=${colonist.hexaco?.Em} HH=${colonist.hexaco?.HH}
Psych score: ${colonist.psychScore}. Bone density: ${colonist.boneDensity}%. Radiation: ${colonist.radiation} mSv.` : ''}
${allQuotes ? `Your reactions during the simulation:\n${allQuotes}` : ''}
${chatHistory ? `Conversation so far:\n${chatHistory}` : ''}

Human asks: ${message}

Respond in character as this person. Be direct, personal, emotional. Reference your actual experiences from the simulation. 2-4 sentences.`;

        const provider = (env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai') as any;
        const model = env.ANTHROPIC_API_KEY ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini';
        const result = await generateText({ provider, model, prompt });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reply: result.text, colonist: colonist?.name || colonistId }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    if (req.url === '/rate-limit' && req.method === 'GET') {
      const clientIp = IpRateLimiter.getIp(req);
      if (!rateLimiter) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ unlimited: true, ip: clientIp }));
        return;
      }
      const status = rateLimiter.check(clientIp);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ip: clientIp, ...status, resetAtISO: new Date(status.resetAt).toISOString() }));
      return;
    }

    if (req.url === '/setup' && req.method === 'POST') {
      try {
        // Rate limit check
        if (rateLimiter) {
          const ip = IpRateLimiter.getIp(req);
          const { allowed, remaining, limit } = rateLimiter.check(ip);
          if (!allowed) {
            console.log(`  [rate-limit] Blocked ${ip} (${limit}/${limit} used)`);
            res.writeHead(429, {
              'Content-Type': 'application/json',
              'Retry-After': '86400',
              'X-RateLimit-Limit': String(limit),
              'X-RateLimit-Remaining': '0',
            });
            res.end(JSON.stringify({
              error: `Rate limit exceeded. Maximum ${limit} simulations per day. Resets at midnight UTC.`,
              limit,
              remaining: 0,
            }));
            return;
          }
          // Record the simulation attempt
          rateLimiter.record(ip);
          console.log(`  [rate-limit] ${ip}: ${remaining - 1} remaining of ${limit}`);
        }

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
        if (simConfig.firecrawlKey && !simConfig.firecrawlKey.includes('...')) {
          env.FIRECRAWL_API_KEY = simConfig.firecrawlKey;
        }
        if (simConfig.tavilyKey && !simConfig.tavilyKey.includes('...')) {
          env.TAVILY_API_KEY = simConfig.tavilyKey;
        }
        if (simConfig.cohereKey && !simConfig.cohereKey.includes('...')) {
          env.COHERE_API_KEY = simConfig.cohereKey;
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

    if (req.url === '/favicon.svg' || req.url === '/favicon.png' || req.url === '/favicon.ico') {
      try {
        const svgPath = resolve(__dirname, '..', 'assets', 'mars-genesis-icon.svg');
        const pngPath = resolve(__dirname, '..', 'assets', 'agentos-icon.png');
        if (existsSync(svgPath)) {
          const svg = readFileSync(svgPath, 'utf-8');
          res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
          res.end(svg);
        } else {
          const icon = readFileSync(pngPath);
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
          res.end(icon);
        }
      } catch {
        res.writeHead(404); res.end();
      }
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

  // Clean up rate limiter on server close
  (server as Server).on('close', () => { if (rateLimiter) rateLimiter.destroy(); });

  const marsServer = Object.assign(server, {
    async startWithConfig(config: NormalizedSimulationConfig) {
      // Clear previous run data
      eventBuffer.length = 0;
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
