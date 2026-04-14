import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSimulationConfig, type NormalizedSimulationConfig } from './sim-config.js';
import { runPairSimulations, type BroadcastFn } from './pair-runner.js';
import { marsScenario } from '../engine/mars/index.js';
import { lunarScenario } from '../engine/lunar/index.js';
import type { ScenarioPackage } from '../engine/types.js';

function projectScenarioForClient(sc: ScenarioPackage) {
  return {
    id: sc.id,
    version: sc.version,
    labels: sc.labels,
    theme: sc.theme,
    setup: sc.setup,
    departments: sc.departments.map(d => ({ id: d.id, label: d.label, role: d.role, icon: d.icon })),
    presets: sc.presets,
    ui: sc.ui,
    policies: {
      toolForging: sc.policies.toolForging.enabled,
      bulletin: sc.policies.bulletin.enabled,
      characterChat: sc.policies.characterChat.enabled,
    },
  };
}

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
  generateText?: (args: { provider: string; model: string; prompt: string }) => Promise<{ text: string }>;
  /** Max simulations per IP per day. 0 = unlimited. Default: 3. Set via RATE_LIMIT env var. */
  maxSimsPerDay?: number;
}

export interface MarsServer extends Server {
  startWithConfig: (config: NormalizedSimulationConfig) => Promise<void>;
}

export function createMarsServer(options: CreateMarsServerOptions = {}): MarsServer {
  const env = options.env ?? process.env;
  const maxSims = options.maxSimsPerDay ?? parseInt(env.RATE_LIMIT || '3', 10);
  const adminWrite = (env.ADMIN_WRITE || 'false').toLowerCase() === 'true';
  const rateLimiter = maxSims > 0 ? new IpRateLimiter(maxSims) : null;
  let simConfig: NormalizedSimulationConfig | null = null;
  let simRunning = false;
  let activeScenario: any = marsScenario;
  // In-memory custom scenarios (not persisted to disk unless ADMIN_WRITE=true)
  const memoryScenarios = new Map<string, any>();
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
  const runGenerateText = options.generateText ?? (async args => {
    const { generateText } = await import('@framers/agentos');
    return generateText(args as any);
  });

  const server = createServer(async (req, res) => {
    // CORS preflight for browser-based POST requests (compile, setup, chat, clear)
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

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

    if (req.url === '/scenario' && req.method === 'GET') {
      const payload = JSON.stringify(projectScenarioForClient(activeScenario));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(payload);
      return;
    }

    // List available built-in scenarios
    if (req.url === '/scenarios' && req.method === 'GET') {
      const scenarios = [
        { id: 'mars-genesis', name: 'Mars Genesis', description: '100-colonist Mars colony over 50 years', departments: marsScenario.departments.length },
        { id: 'lunar-outpost', name: 'Lunar Outpost', description: '50-person crew at the lunar south pole', departments: lunarScenario.departments.length },
      ];
      // Add in-memory custom scenarios
      for (const [id, sc] of memoryScenarios) {
        if (id !== 'mars-genesis' && id !== 'lunar-outpost') {
          scenarios.push({ id, name: sc.labels?.name || id, description: 'Custom scenario (in-memory)', departments: sc.departments?.length || 0 });
        }
      }
      // Add active compiled scenario if it's not already listed
      if (activeScenario.id !== 'mars-genesis' && activeScenario.id !== 'lunar-outpost' && !memoryScenarios.has(activeScenario.id)) {
        scenarios.push({ id: activeScenario.id, name: activeScenario.labels?.name || activeScenario.id, description: 'Custom compiled scenario', departments: activeScenario.departments?.length || 0 });
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ scenarios, active: activeScenario.id }));
      return;
    }

    // Admin config: tells client what's enabled
    if (req.url === '/admin-config' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ adminWrite, memoryScenarios: [...memoryScenarios.keys()] }));
      return;
    }

    // Store a scenario in memory (always allowed) or save to disk (requires ADMIN_WRITE)
    if (req.url === '/scenario/store' && req.method === 'POST') {
      try {
        const { scenario: scenarioJson, saveToDisk } = JSON.parse(await readBody(req));
        if (!scenarioJson || !scenarioJson.id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'scenario with id required' }));
          return;
        }
        // Store in memory
        memoryScenarios.set(scenarioJson.id, scenarioJson);

        // Optionally save to disk if admin
        let savedToDisk = false;
        if (saveToDisk && adminWrite) {
          const { writeFileSync, mkdirSync } = await import('node:fs');
          const scenarioDir = resolve(__dirname, '..', '..', 'scenarios');
          mkdirSync(scenarioDir, { recursive: true });
          writeFileSync(resolve(scenarioDir, `${scenarioJson.id}.json`), JSON.stringify(scenarioJson, null, 2));
          savedToDisk = true;
        }

        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ stored: true, id: scenarioJson.id, savedToDisk, adminWrite }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    // Switch active scenario
    if (req.url === '/scenario/switch' && req.method === 'POST') {
      const { id } = JSON.parse(await readBody(req));
      if (id === 'mars-genesis') activeScenario = marsScenario;
      else if (id === 'lunar-outpost') activeScenario = lunarScenario;
      else if (memoryScenarios.has(id)) activeScenario = memoryScenarios.get(id);
      else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Unknown scenario: ${id}. Use /compile or /scenario/store for custom scenarios.` }));
        return;
      }
      eventBuffer.length = 0;
      simConfig = null;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ active: activeScenario.id, name: activeScenario.labels?.name }));
      return;
    }

    // Compile a custom scenario JSON into a ScenarioPackage
    if (req.url === '/compile' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const { scenario: scenarioJson, seedText, seedUrl, webSearch } = body;
        if (!scenarioJson || typeof scenarioJson !== 'object') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'scenario JSON object required' }));
          return;
        }
        const { compileScenario } = await import('../engine/compiler/index.js');
        const provider = (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai') as any;
        const model = process.env.ANTHROPIC_API_KEY ? 'claude-sonnet-4-6' : 'gpt-5.4-mini';

        // SSE progress stream
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
        res.write('event: status\ndata: {"status":"compiling"}\n\n');

        const compiled = await compileScenario(scenarioJson, {
          provider,
          model,
          cache: true,
          seedText,
          seedUrl,
          webSearch: webSearch ?? true,
          onProgress(hookName, status) {
            res.write(`event: progress\ndata: ${JSON.stringify({ hook: hookName, status })}\n\n`);
          },
        });

        // Update the active scenario for GET /scenario
        activeScenario = compiled;

        res.write(`event: complete\ndata: ${JSON.stringify({ id: compiled.id, version: compiled.version, departments: compiled.departments.length, hooks: Object.keys(compiled.hooks).filter(k => (compiled.hooks as any)[k]).length })}\n\n`);
        res.end();
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        } else {
          res.write(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`);
          res.end();
        }
      }
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
      res.writeHead(302, { Location: '/sim?tab=settings' });
      res.end();
      return;
    }

    // Rate limit status endpoint
    // Post-simulation colonist chat
    if (req.url === '/chat' && req.method === 'POST') {
      try {
        const { agentId, message, history } = JSON.parse(await readBody(req));
        if (!agentId || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'agentId and message required' }));
          return;
        }
        // Find colonist in the last broadcast result
        const lastResultEvent = eventBuffer.find(msg => msg.includes('"finalState"'));
        if (!lastResultEvent) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No simulation data available. Run a simulation first.' }));
          return;
        }
        // Extract colonist data from broadcast events
        const simEvents = eventBuffer
          .filter(msg => msg.startsWith('event: sim\n'))
          .map(msg => { try { return JSON.parse(msg.split('data: ')[1]); } catch { return null; } })
          .filter(Boolean);
        // Find colonist reactions across all turns
        const agentReactions = simEvents
          .filter((e: any) => e.type === 'agent_reactions')
          .flatMap((e: any) => (e.data?.reactions || []).filter((r: any) => r.agentId === agentId || r.name?.toLowerCase().includes(agentId.toLowerCase())));
        const colonist = agentReactions[0];
        const allQuotes = agentReactions.map((r: any) => `Turn ${r.turn || '?'}: "${r.quote}" (${r.mood})`).join('\n');
        const chatHistory = (history || []).slice(-6).map((h: any) => `${h.role === 'user' ? 'Human' : colonist?.name || 'Colonist'}: ${h.content}`).join('\n');
        const colonistProfile = colonist ? [
          `Age: ${colonist.age ?? '?'}. ${colonist.marsborn ? 'Born on Mars.' : 'Born on Earth.'} Role: ${colonist.role || 'Unknown role'} in ${colonist.department || 'unknown department'}. Specialization: ${colonist.specialization || 'general'}.`,
          `HEXACO: O=${colonist.hexaco?.O ?? '?'} C=${colonist.hexaco?.C ?? '?'} E=${colonist.hexaco?.E ?? '?'} A=${colonist.hexaco?.A ?? '?'} Em=${colonist.hexaco?.Em ?? '?'} HH=${colonist.hexaco?.HH ?? '?'}`,
          `Psych score: ${colonist.psychScore ?? '?'}. Bone density: ${colonist.boneDensity ?? '?'}%. Radiation: ${colonist.radiation ?? '?'} mSv.`,
        ].join('\n') : '';

        const prompt = `You are ${colonist?.name || agentId}, a colonist on Mars. Stay in character.
${colonistProfile}
${allQuotes ? `Your reactions during the simulation:\n${allQuotes}` : ''}
${chatHistory ? `Conversation so far:\n${chatHistory}` : ''}

Human asks: ${message}

Respond in character as this person. Be direct, personal, emotional. Reference your actual experiences from the simulation. 2-4 sentences.`;

        const provider = (env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai') as any;
        const model = env.ANTHROPIC_API_KEY ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini';
        const result = await runGenerateText({ provider, model, prompt });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reply: result.text, colonist: colonist?.name || agentId }));
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
        res.end(JSON.stringify({ redirect: '/sim' }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(error) }));
      }
      return;
    }

    if (req.url === '/about') {
      res.writeHead(302, { Location: '/sim?tab=about' });
      res.end();
      return;
    }

    // Serve brand assets
    if (req.url?.startsWith('/brand/')) {
      const brandPath = resolve(__dirname, '..', '..', 'assets', req.url.replace('/brand/', ''));
      if (existsSync(brandPath)) {
        const ext = brandPath.split('.').pop() || '';
        const types: Record<string,string> = { svg:'image/svg+xml', png:'image/png', jpg:'image/jpeg' };
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' });
        res.end(readFileSync(brandPath));
        return;
      }
    }

    if (req.url === '/favicon.svg' || req.url === '/favicon.png' || req.url === '/favicon.ico' || req.url === '/icon.svg' || req.url === '/apple-touch-icon.png') {
      try {
        const svgPath = resolve(__dirname, '..', '..', 'assets', 'favicons', 'icon.svg');
        const fallbackSvg = resolve(__dirname, '..', '..', 'assets', 'mars-genesis-icon.svg');
        const pngPath = resolve(__dirname, '..', '..', 'assets', 'agentos-icon.png');
        // Apple touch icon as PNG
        if (req.url === '/apple-touch-icon.png') {
          const touchPath = resolve(__dirname, '..', '..', 'assets', 'favicons', 'favicon-180.png');
          if (existsSync(touchPath)) {
            res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
            res.end(readFileSync(touchPath));
            return;
          }
        }
        const iconPath = existsSync(svgPath) ? svgPath : existsSync(fallbackSvg) ? fallbackSvg : null;
        if (iconPath) {
          const svg = readFileSync(iconPath, 'utf-8');
          res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
          res.end(svg);
        } else if (existsSync(pngPath)) {
          const icon = readFileSync(pngPath);
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
          res.end(icon);
        } else {
          res.writeHead(404); res.end();
        }
      } catch {
        res.writeHead(404); res.end();
      }
      return;
    }

    // ---------------------------------------------------------------------------
    // Static file serving
    // ---------------------------------------------------------------------------
    const distDir = resolve(__dirname, 'dashboard/dist');
    const hasViteBuild = existsSync(resolve(distDir, 'index.html'));
    const pathname = (req.url || '/').split('?')[0];

    // Landing page at /
    if (pathname === '/' || pathname === '/index.html') {
      const landingPath = resolve(__dirname, 'dashboard/landing.html');
      if (existsSync(landingPath)) {
        const html = readFileSync(landingPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
        res.end(html);
        return;
      }
    }

    // API docs (TypeDoc generated)
    if (pathname.startsWith('/docs')) {
      const docsDir = resolve(__dirname, '..', '..', 'docs', 'api');
      if (pathname === '/docs' || pathname === '/docs/') {
        res.writeHead(302, { Location: '/docs/modules.html' });
        res.end();
        return;
      }
      let docPath = pathname.replace('/docs', '');
      if (!docPath || docPath === '/') docPath = '/modules.html';
      const filePath = resolve(docsDir, docPath.startsWith('/') ? docPath.slice(1) : docPath);
      try {
        const { statSync } = await import('node:fs');
        const stat = statSync(filePath);
        if (stat.isFile()) {
          const ext = filePath.split('.').pop() || '';
          const mimeTypes: Record<string, string> = {
            html: 'text/html', css: 'text/css', js: 'application/javascript',
            svg: 'image/svg+xml', png: 'image/png', json: 'application/json',
            jpg: 'image/jpeg', gif: 'image/gif', woff: 'font/woff', woff2: 'font/woff2',
          };

          if (ext === 'html') {
            // Inject Paracosm theme into TypeDoc HTML
            let html = readFileSync(filePath, 'utf-8');
            // Add our CSS override + fonts
            html = html.replace('</head>',
              `<link rel="icon" type="image/svg+xml" href="/icon.svg"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"><link rel="stylesheet" href="/docs/assets/paracosm-override.css"></head>`
            );
            // Inject nav header after <body>
            html = html.replace(/<body[^>]*>/, `$&
<div class="paracosm-docs-header">
  <div class="pdh-left">
    <a href="/" style="display:flex;align-items:center;text-decoration:none" aria-label="Paracosm home">
      <svg viewBox="0 0 64 64" width="22" height="22" style="margin-right:8px;flex-shrink:0"><defs><linearGradient id="pdl" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#e06530"/><stop offset="50%" stop-color="#e8b44a"/><stop offset="100%" stop-color="#4ca8a8"/></linearGradient></defs><circle cx="32" cy="32" r="8" fill="url(#pdl)"/><circle cx="32" cy="12" r="4" fill="#e06530" opacity=".9"/><circle cx="48" cy="20" r="4" fill="#e8b44a" opacity=".9"/><circle cx="48" cy="44" r="4" fill="#4ca8a8" opacity=".9"/><circle cx="32" cy="52" r="4" fill="#4ca8a8" opacity=".9"/><circle cx="16" cy="44" r="4" fill="#e8b44a" opacity=".9"/><circle cx="16" cy="20" r="4" fill="#e06530" opacity=".9"/><path d="M32 32L32 12M32 32L48 20M32 32L48 44M32 32L32 52M32 32L16 44M32 32L16 20" stroke="url(#pdl)" stroke-width="1.5" opacity=".4"/></svg>
      <span class="pdh-brand">PARACOSM</span>
    </a>
    <a href="https://agentos.sh" target="_blank" rel="noopener" class="pdh-tag">AGENTOS</a>
    <span class="pdh-sep">|</span>
    <span class="pdh-current">API Reference v0.1.0</span>
  </div>
  <div class="pdh-right">
    <a href="/">Home</a>
    <a href="/sim">Simulation</a>
    <a href="/docs">API Docs</a>
    <a href="https://github.com/framersai/paracosm" target="_blank" rel="noopener">GitHub</a>
    <a href="https://www.npmjs.com/package/paracosm" target="_blank" rel="noopener">npm</a>
  </div>
</div>`);
            // Inject footer before </body>
            html = html.replace('</body>',
              `<div class="paracosm-docs-footer">
  <div class="pdf-links">
    <a href="https://agentos.sh">agentos.sh</a>
    <a href="https://github.com/framersai/paracosm">GitHub</a>
    <a href="https://www.npmjs.com/package/paracosm">npm</a>
    <a href="https://frame.dev">Frame.dev</a>
    <a href="https://manic.agency">Manic Agency</a>
  </div>
  <span>Apache-2.0 &middot; <a href="https://manic.agency">Manic Agency</a> / <a href="https://frame.dev">Frame.dev</a></span>
</div></body>`);
            res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' });
            res.end(html);
            return;
          }

          const content = readFileSync(filePath);
          res.writeHead(200, {
            'Content-Type': mimeTypes[ext] || 'application/octet-stream',
            'Cache-Control': 'public, max-age=3600',
          });
          res.end(content);
          return;
        }
        // Directory: try index.html
        if (stat.isDirectory()) {
          const indexPath = resolve(filePath, 'index.html');
          if (existsSync(indexPath)) {
            const content = readFileSync(indexPath);
            res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' });
            res.end(content);
            return;
          }
        }
      } catch {}
    }

    // Vite assets (CSS, JS, fonts)
    if (req.url?.startsWith('/assets/')) {
      const assetPath = resolve(distDir, req.url.slice(1));
      if (existsSync(assetPath)) {
        const ext = assetPath.split('.').pop();
        const mimeTypes: Record<string, string> = {
          js: 'application/javascript', css: 'text/css', svg: 'image/svg+xml',
          png: 'image/png', jpg: 'image/jpeg', woff2: 'font/woff2', woff: 'font/woff',
        };
        const content = readFileSync(assetPath);
        res.writeHead(200, {
          'Content-Type': mimeTypes[ext || ''] || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
        });
        res.end(content);
        return;
      }
    }

    // Simulation dashboard at /sim (SPA)
    if (pathname === '/sim' || pathname.startsWith('/sim/') || pathname === '/sim/index.html') {
      if (hasViteBuild) {
        const html = readFileSync(resolve(distDir, 'index.html'), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }
      // Legacy fallback
      if (existsSync(resolve(__dirname, 'dashboard/index.legacy.html'))) {
        const html = readFileSync(resolve(__dirname, 'dashboard/index.legacy.html'), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }
    }

    // Legacy JS fallback
    if (req.url === '/main.js' && existsSync(resolve(__dirname, 'dashboard/main.legacy.js'))) {
      const js = readFileSync(resolve(__dirname, 'dashboard/main.legacy.js'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(js);
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
