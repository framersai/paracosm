import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, writeFileSync, renameSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSimulationConfig, applyDemoCaps, type NormalizedSimulationConfig } from './sim-config.js';
import { runPairSimulations, type BroadcastFn } from './pair-runner.js';
import { marsScenario } from '../engine/mars/index.js';
import { lunarScenario } from '../engine/lunar/index.js';
import type { ScenarioPackage } from '../engine/types.js';
import {
  describeCustomScenarioSource,
  isRunnableScenarioPackage,
  loadDiskCustomScenarios,
} from './custom-scenarios.js';

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

/** Resolved paracosm version from package.json (for docs header and API responses). */
const PARACOSM_VERSION: string = (() => {
  try {
    const pkgPath = resolve(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
})();

// ---------------------------------------------------------------------------
// IP rate limiter: max simulations per IP per day
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number; // epoch ms
}

/**
 * Supported rate-limit windows. Daily resets at next UTC midnight, hourly
 * resets on the hour, so the math is always easy to eyeball in logs.
 */
type WindowKind = 'daily' | 'hourly';

class IpRateLimiter {
  // Three independent buckets keyed by IP. Simulations spend against
  // `daily` (the most expensive action), compile spends against `compile`,
  // and chat messages spend against `chat` (hourly because users may
  // legitimately fire many messages in a short burst).
  private simStore = new Map<string, RateLimitEntry>();
  private compileStore = new Map<string, RateLimitEntry>();
  private chatStore = new Map<string, RateLimitEntry>();
  private maxPerDay: number;
  private maxCompilePerDay: number;
  private maxChatPerHour: number;
  private cleanupTimer: ReturnType<typeof setInterval>;
  /**
   * When set, rate-limit state is loaded on construct and flushed on
   * every mutation so pm2 restarts don't reset user quotas. Persistence
   * uses a plain JSON file: small payload (ip -> {count,resetAt} × 3
   * buckets), atomic write via tmp+rename, ignored on read errors so a
   * corrupt file self-heals at next mutation.
   */
  private persistencePath: string | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    maxPerDay: number = 3,
    maxCompilePerDay: number = 5,
    maxChatPerHour: number = 200,
    persistencePath: string | null = null,
  ) {
    this.maxPerDay = maxPerDay;
    this.maxCompilePerDay = maxCompilePerDay;
    this.maxChatPerHour = maxChatPerHour;
    this.persistencePath = persistencePath;
    // Purge expired entries every hour.
    this.cleanupTimer = setInterval(() => this.cleanup(), 60 * 60 * 1000);
    this.load();
  }

  /** Load persisted state from disk. Silently tolerates missing/corrupt files. */
  private load(): void {
    if (!this.persistencePath) return;
    try {
      if (!existsSync(this.persistencePath)) return;
      const raw = readFileSync(this.persistencePath, 'utf-8');
      const data = JSON.parse(raw) as {
        sim?: Record<string, RateLimitEntry>;
        compile?: Record<string, RateLimitEntry>;
        chat?: Record<string, RateLimitEntry>;
      };
      const now = Date.now();
      const hydrate = (store: Map<string, RateLimitEntry>, src: Record<string, RateLimitEntry> | undefined) => {
        if (!src) return;
        for (const [ip, entry] of Object.entries(src)) {
          // Skip already-expired entries: they'd be deleted on first
          // access anyway, and loading them wastes memory.
          if (entry?.resetAt && entry.resetAt > now) store.set(ip, entry);
        }
      };
      hydrate(this.simStore, data.sim);
      hydrate(this.compileStore, data.compile);
      hydrate(this.chatStore, data.chat);
    } catch {
      // Missing file, permission denied, corrupt JSON — start fresh.
      // The next mutation will rewrite a clean file.
    }
  }

  /** Debounced flush to disk. Writes atomically via tmp+rename. */
  private persist(): void {
    if (!this.persistencePath) return;
    if (this.persistTimer) return; // already scheduled
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      if (!this.persistencePath) return;
      try {
        const dump = (s: Map<string, RateLimitEntry>): Record<string, RateLimitEntry> => {
          const out: Record<string, RateLimitEntry> = {};
          for (const [ip, e] of s) out[ip] = e;
          return out;
        };
        const payload = JSON.stringify({
          sim: dump(this.simStore),
          compile: dump(this.compileStore),
          chat: dump(this.chatStore),
        });
        const tmp = `${this.persistencePath}.tmp`;
        writeFileSync(tmp, payload, 'utf-8');
        renameSync(tmp, this.persistencePath);
      } catch {
        // Disk full, permission denied — log would be noisy, swallow.
      }
    }, 500); // 500ms debounce covers bursts from compile+setup+chat in parallel
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

  /** Return the next reset boundary for the given window. */
  private nextReset(kind: WindowKind): number {
    if (kind === 'daily') {
      const tomorrow = new Date();
      tomorrow.setUTCHours(24, 0, 0, 0);
      return tomorrow.getTime();
    }
    // hourly
    const nextHour = new Date();
    nextHour.setUTCMinutes(60, 0, 0);
    return nextHour.getTime();
  }

  private bump(
    store: Map<string, RateLimitEntry>,
    ip: string,
    limit: number,
    kind: WindowKind,
    mutate: boolean,
  ): { allowed: boolean; remaining: number; resetAt: number; limit: number } {
    const now = Date.now();
    let entry = store.get(ip);
    let mutated = false;
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: this.nextReset(kind) };
      store.set(ip, entry);
      mutated = true;
    }
    const allowed = entry.count < limit;
    if (allowed && mutate) {
      entry.count++;
      mutated = true;
    }
    const remaining = Math.max(0, limit - entry.count);
    if (mutated) this.persist();
    return { allowed, remaining, resetAt: entry.resetAt, limit };
  }

  /** Check the simulation-per-day quota without consuming it. */
  check(ip: string): { allowed: boolean; remaining: number; resetAt: number; limit: number } {
    return this.bump(this.simStore, ip, this.maxPerDay, 'daily', false);
  }

  /** Record a simulation start. Prefer `check` + `record` for legacy callers. */
  record(ip: string): void {
    const entry = this.simStore.get(ip);
    if (entry) {
      entry.count++;
      this.persist();
    }
  }

  /**
   * Check AND consume a slot for the /compile endpoint in one call.
   * Returns false if the user is over the daily compile budget. Compile
   * is a real cost (~$0.10/call) and deserves its own bucket so nothing
   * a user does on /compile eats into their daily simulation allowance
   * or vice versa.
   */
  consumeCompile(ip: string): { allowed: boolean; remaining: number; resetAt: number; limit: number } {
    return this.bump(this.compileStore, ip, this.maxCompilePerDay, 'daily', true);
  }

  /**
   * Check AND consume a slot for the /chat endpoint. Hourly window
   * because a legitimate user exploring colonist conversations may fire
   * dozens of messages in a sitting, but none of that is unusual within
   * an hour. Prevents runaway scripts/loops without impeding real use.
   */
  consumeChat(ip: string): { allowed: boolean; remaining: number; resetAt: number; limit: number } {
    return this.bump(this.chatStore, ip, this.maxChatPerHour, 'hourly', true);
  }

  /** Get stats for monitoring */
  stats(): {
    totalIps: number;
    sim: Array<{ ip: string; count: number; resetAt: string }>;
    compile: Array<{ ip: string; count: number; resetAt: string }>;
    chat: Array<{ ip: string; count: number; resetAt: string }>;
  } {
    const dump = (s: Map<string, RateLimitEntry>) =>
      [...s.entries()].map(([ip, e]) => ({ ip, count: e.count, resetAt: new Date(e.resetAt).toISOString() }));
    return {
      totalIps: this.simStore.size + this.compileStore.size + this.chatStore.size,
      sim: dump(this.simStore),
      compile: dump(this.compileStore),
      chat: dump(this.chatStore),
    };
  }

  private cleanup(): void {
    const now = Date.now();
    let mutated = false;
    for (const store of [this.simStore, this.compileStore, this.chatStore]) {
      for (const [ip, entry] of store) {
        if (now >= entry.resetAt) {
          store.delete(ip);
          mutated = true;
        }
      }
    }
    if (mutated) this.persist();
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
  runPairSimulations?: (config: NormalizedSimulationConfig, broadcast: BroadcastFn, signal?: AbortSignal) => Promise<void>;
  generateText?: (args: { provider: string; model: string; prompt: string }) => Promise<{ text: string }>;
  compileScenario?: (scenarioJson: Record<string, unknown>, options: Record<string, unknown>) => Promise<ScenarioPackage>;
  scenarioDir?: string;
  /** Max simulations per IP per day. 0 = unlimited. Default: 3. Set via RATE_LIMIT env var. */
  maxSimsPerDay?: number;
  /**
   * Grace period (ms) between the last SSE client disconnecting and the
   * server cancelling the active simulation. Lets page refreshes and
   * brief network drops reconnect before the watchdog trips. Default
   * 3000ms: too short to interrupt a normal refresh, too long to keep
   * burning API credits on an abandoned tab.
   */
  disconnectGraceMs?: number;
}

export interface MarsServer extends Server {
  startWithConfig: (config: NormalizedSimulationConfig) => Promise<void>;
}

export function createMarsServer(options: CreateMarsServerOptions = {}): MarsServer {
  const env = options.env ?? process.env;
  // Rate limit default: 1 simulation per IP per day for the public-demo
  // path. Even on DEMO_MODELS + DEMO_EXECUTION a run costs ~$0.40 against
  // the host's keys, so 1/day caps worst-case monthly spend at roughly
  // $30 × unique-daily-IPs. Users who want more runs provide their own
  // key, which fully bypasses rate limiting. Override with RATE_LIMIT
  // env var or maxSimsPerDay option when hosting on your own infra.
  const maxSims = options.maxSimsPerDay ?? parseInt(env.RATE_LIMIT || '1', 10);
  const adminWrite = (env.ADMIN_WRITE || 'false').toLowerCase() === 'true';
  const scenarioDir = options.scenarioDir ?? resolve(__dirname, '..', '..', 'scenarios');
  // Rate-limit state survives pm2 restarts via a JSON file alongside
  // the repo. Without this, a restart gives every blocked IP a full
  // fresh quota. APP_DIR is the install location on the Linode
  // (/opt/paracosm); dev runs default to `.` so the cache file lands
  // next to the project root.
  const rateLimitStatePath = resolve(env.APP_DIR || '.', '.rate-limit.json');
  const rateLimiter = maxSims > 0
    ? new IpRateLimiter(maxSims, 5, 200, rateLimitStatePath)
    : null;

  // Output retention: sweep simulation output JSON older than
  // OUTPUT_RETENTION_DAYS on boot. /opt/paracosm/output/ otherwise
  // grows unbounded (~300KB per run × N daily runs = GB over months).
  // Default 30 days. Set to 0 to disable the sweep. Non-fatal on any
  // filesystem error — missing dir is fine, permission denied is
  // logged once and skipped.
  (() => {
    const retentionDays = parseInt(env.OUTPUT_RETENTION_DAYS || '30', 10);
    if (retentionDays <= 0) return;
    const outputDir = resolve(env.APP_DIR || resolve(__dirname, '..', '..'), 'output');
    if (!existsSync(outputDir)) return;
    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    try {
      for (const name of readdirSync(outputDir)) {
        if (!name.endsWith('.json')) continue;
        const full = resolve(outputDir, name);
        try {
          const stat = statSync(full);
          if (stat.mtimeMs < cutoffMs) {
            unlinkSync(full);
            removed++;
          }
        } catch { /* skip unreadable entry */ }
      }
      if (removed > 0) {
        console.log(`  [retention] Pruned ${removed} sim output files older than ${retentionDays} days from ${outputDir}`);
      }
    } catch (err) {
      console.log(`  [retention] Sweep failed: ${err}`);
    }
  })();
  let simConfig: NormalizedSimulationConfig | null = null;
  let simRunning = false;
  let activeScenario: ScenarioPackage = marsScenario;
  // Raw custom scenario JSON payloads authored during this session.
  const memoryScenarios = new Map<string, unknown>();
  // Runnable custom scenarios that can appear in the catalog and be switched to.
  const customScenarioCatalog = loadDiskCustomScenarios(scenarioDir);
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

  // --- Cancel-on-disconnect watchdog ---------------------------------
  //
  // While a simulation is active, watch for the SSE client set going
  // empty. If it stays empty for `disconnectGraceMs`, abort the run so
  // the server stops burning API credits on work nobody is watching.
  //
  // The event buffer stays intact: a returning user reconnects, sees
  // all events up to the cancellation point, and the dashboard labels
  // the run "Unfinished" via the sim_aborted SSE event the orchestrator
  // emits on cancel.
  //
  // Grace period handles the legitimate refresh / nav-across-tabs case:
  // EventSource disconnects briefly, then reconnects within ~1-2s. We
  // only pull the plug when no client has reconnected after 3s (default).
  const disconnectGraceMs = options.disconnectGraceMs ?? 3000;
  /** Current sim's AbortController, or null when no sim is running. */
  let activeSimAbortController: AbortController | null = null;
  /** Timer id for the pending disconnect-watchdog fire. Null when disarmed. */
  let disconnectWatchdogTimer: ReturnType<typeof setTimeout> | null = null;

  const armDisconnectWatchdog = () => {
    if (!activeSimAbortController) return; // no sim running, nothing to cancel
    if (disconnectWatchdogTimer) return;   // already armed
    disconnectWatchdogTimer = setTimeout(() => {
      disconnectWatchdogTimer = null;
      if (!activeSimAbortController) return;
      if (clients.size > 0) return; // somebody reconnected just in time
      console.log(`  [watchdog] No SSE clients for ${disconnectGraceMs}ms — aborting active simulation.`);
      activeSimAbortController.abort();
    }, disconnectGraceMs);
  };
  const disarmDisconnectWatchdog = () => {
    if (disconnectWatchdogTimer) {
      clearTimeout(disconnectWatchdogTimer);
      disconnectWatchdogTimer = null;
    }
  };
  const runGenerateText = options.generateText ?? (async args => {
    const { generateText } = await import('@framers/agentos');
    return generateText(args as any);
  });
  const runCompileScenario = options.compileScenario ?? (async (scenarioJson, compileOptions) => {
    const { compileScenario } = await import('../engine/compiler/index.js');
    return compileScenario(scenarioJson, compileOptions as any);
  });

  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
  };

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
      // Reconnection cancels any pending disconnect watchdog fire so
      // the sim keeps running once the returning user is watching again.
      disarmDisconnectWatchdog();
      req.on('close', () => {
        clients.delete(res);
        if (clients.size === 0) {
          // Start (or re-start) the grace-period countdown. If no
          // client reconnects before it fires, the watchdog aborts
          // the active sim.
          armDisconnectWatchdog();
        }
      });
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
      // Add runnable custom scenarios from memory, disk, or compilation.
      for (const [id, entry] of customScenarioCatalog) {
        const sc = entry.scenario;
        if (id !== 'mars-genesis' && id !== 'lunar-outpost') {
          scenarios.push({
            id,
            name: sc.labels?.name || id,
            description: describeCustomScenarioSource(entry.source),
            departments: sc.departments?.length || 0,
          });
        }
      }
      // Add active compiled scenario if it's not already listed
      if (activeScenario.id !== 'mars-genesis' && activeScenario.id !== 'lunar-outpost' && !customScenarioCatalog.has(activeScenario.id)) {
        scenarios.push({ id: activeScenario.id, name: activeScenario.labels?.name || activeScenario.id, description: 'Custom compiled scenario', departments: activeScenario.departments?.length || 0 });
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ scenarios, active: activeScenario.id }));
      return;
    }

    // Admin config: tells client what's enabled
    if (req.url === '/admin-config' && req.method === 'GET') {
      // Hosted-demo flag: when true, env-only API keys belong to the
      // host (not the end user), so the dashboard treats env presence as
      // "host is paying" and surfaces demo-mode UX (hidden model picker,
      // rate-limit notice). Local dev leaves this unset and the picker
      // becomes visible whenever any LLM key is configured.
      const hostedDemo = (env.PARACOSM_HOSTED_DEMO || '').toLowerCase() === 'true';
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        adminWrite,
        hostedDemo,
        memoryScenarios: [...memoryScenarios.keys()],
        keys: {
          openai: !!env.OPENAI_API_KEY,
          anthropic: !!env.ANTHROPIC_API_KEY,
          serper: !!env.SERPER_API_KEY,
          firecrawl: !!env.FIRECRAWL_API_KEY,
          tavily: !!env.TAVILY_API_KEY,
          cohere: !!env.COHERE_API_KEY,
        },
      }));
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
        // Store raw JSON in memory for this authoring session.
        memoryScenarios.set(scenarioJson.id, scenarioJson);
        const switchable = isRunnableScenarioPackage(scenarioJson);
        if (switchable) {
          customScenarioCatalog.set(scenarioJson.id, {
            scenario: scenarioJson,
            source: saveToDisk && adminWrite ? 'disk' : 'memory',
          });
        }

        // Optionally save to disk if admin
        let savedToDisk = false;
        if (saveToDisk && adminWrite) {
          const { writeFileSync, mkdirSync } = await import('node:fs');
          mkdirSync(scenarioDir, { recursive: true });
          writeFileSync(resolve(scenarioDir, `${scenarioJson.id}.json`), JSON.stringify(scenarioJson, null, 2));
          savedToDisk = true;
          if (switchable) {
            customScenarioCatalog.set(scenarioJson.id, {
              scenario: scenarioJson,
              source: 'disk',
            });
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ stored: true, id: scenarioJson.id, savedToDisk, adminWrite, switchable }));
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
      else if (customScenarioCatalog.has(id)) activeScenario = customScenarioCatalog.get(id)!.scenario;
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
        const { scenario: scenarioJson, provider: requestedProvider, model: requestedModel, seedText, seedUrl, webSearch, maxSearches, apiKey, anthropicKey } = body;
        if (!scenarioJson || typeof scenarioJson !== 'object') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'scenario JSON object required' }));
          return;
        }

        // Rate-limit compile against its own daily bucket. Each compile
        // costs ~$0.10 against the host's API key, so even 10 uncontrolled
        // hits is a real line item. Bypassed when the caller is not
        // billing the host: either a session key was supplied, or the
        // server is in local mode (PARACOSM_HOSTED_DEMO unset) where
        // env keys belong to the operator.
        const userSuppliedKey = !!(apiKey || anthropicKey);
        const isHostedDemoCompile = (env.PARACOSM_HOSTED_DEMO || '').toLowerCase() === 'true';
        const hostBilled = !userSuppliedKey && isHostedDemoCompile;
        if (rateLimiter && hostBilled) {
          const ip = IpRateLimiter.getIp(req);
          const { allowed, remaining, resetAt, limit } = rateLimiter.consumeCompile(ip);
          if (!allowed) {
            res.writeHead(429, {
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': String(limit),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Math.floor(resetAt / 1000)),
            });
            res.end(JSON.stringify({
              error: `Compile rate limit exceeded. Maximum ${limit} compiles per day. Add your own API keys to bypass.`,
              limit,
              remaining: 0,
              resetAt,
            }));
            return;
          }
          console.log(`  [rate-limit] /compile ${ip}: ${remaining} remaining of ${limit}`);
        }

        // Apply user-supplied keys to env for this request so downstream
        // LLM calls route to the user's account, not the host's. Mirrors
        // /setup behavior. Placeholder values (e.g. "sk-...") are ignored
        // so a masked display string never replaces a real key.
        if (apiKey && typeof apiKey === 'string' && !apiKey.includes('...')) {
          env.OPENAI_API_KEY = apiKey;
        }
        if (anthropicKey && typeof anthropicKey === 'string' && !anthropicKey.includes('...')) {
          env.ANTHROPIC_API_KEY = anthropicKey;
        }

        const provider = requestedProvider || (env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai');
        // Force the cheapest class only when the host is billing
        // (hosted-demo mode + no session key). Local dev and BYO-key
        // paths honor the requested model.
        const demoCompileModel = provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-5.4-nano';
        const model = !hostBilled
          ? (requestedModel || (provider === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-5.4-mini'))
          : demoCompileModel;

        // SSE progress stream
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
        res.write('event: status\ndata: {"status":"compiling"}\n\n');

        const compiled = await runCompileScenario(scenarioJson, {
          provider,
          model,
          cache: true,
          seedText,
          seedUrl,
          webSearch: webSearch ?? true,
          maxSearches,
          onProgress(hookName: string, status: string) {
            res.write(`event: progress\ndata: ${JSON.stringify({ hook: hookName, status })}\n\n`);
          },
        });

        // Update the active scenario for GET /scenario
        activeScenario = compiled;
        memoryScenarios.set(compiled.id, compiled);
        customScenarioCatalog.set(compiled.id, { scenario: compiled, source: 'compiled' });

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
      // Clear chat agent pool when simulation is cleared
      import('../runtime/chat-agents.js').then(m => m.clearPool()).catch(() => {});
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
        const { agentId, message, apiKey, anthropicKey } = JSON.parse(await readBody(req));
        if (!agentId || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'agentId and message required' }));
          return;
        }

        // Apply user-supplied keys to env for this request so the
        // downstream chat agent routes to the user's account when a
        // BYO key is present. Mirrors /setup + /compile behavior.
        // Placeholder masks like 'sk-...' are rejected so a displayed
        // masked string can never replace a real key.
        const chatUserKey = !!(apiKey || anthropicKey);
        if (apiKey && typeof apiKey === 'string' && !apiKey.includes('...')) {
          env.OPENAI_API_KEY = apiKey;
        }
        if (anthropicKey && typeof anthropicKey === 'string' && !anthropicKey.includes('...')) {
          env.ANTHROPIC_API_KEY = anthropicKey;
        }

        // Rate-limit chat per IP per hour. Runs against the host's
        // key unless a session key was provided in the request body,
        // in which case the caller is paying and the cap is bypassed
        // (same contract as /setup and /compile). 200/hour leaves
        // plenty of headroom for real host-billed users exploring
        // colonist conversations.
        if (rateLimiter && !chatUserKey) {
          const ip = IpRateLimiter.getIp(req);
          const { allowed, remaining, resetAt, limit } = rateLimiter.consumeChat(ip);
          if (!allowed) {
            res.writeHead(429, {
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': String(limit),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Math.floor(resetAt / 1000)),
            });
            res.end(JSON.stringify({
              error: `Chat rate limit exceeded. Maximum ${limit} messages per hour. Try again later.`,
              limit,
              remaining: 0,
              resetAt,
            }));
            return;
          }
          if (remaining < 20) {
            // Warn in logs when a user is nearing the cap; helps diagnose
            // legit-user complaints from actual abuse.
            console.log(`  [rate-limit] /chat ${ip}: ${remaining} remaining of ${limit}`);
          }
        }

        const hasSimData = eventBuffer.some(msg => msg.startsWith('event: result\n') || msg.includes('"agent_reactions"'));
        if (!hasSimData) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No simulation data yet. Wait for at least one turn to complete, or run a simulation first.' }));
          return;
        }

        // Import chat agent system (lazy to avoid startup cost)
        const { getOrCreateChatAgent, extractColonistMemories, extractColonistRoster } = await import('../runtime/chat-agents.js');

        // Extract sim events and find colonist profile
        const simEvents = eventBuffer
          .filter(msg => msg.startsWith('event: sim\n'))
          .map(msg => { try { return JSON.parse(msg.split('data: ')[1]); } catch { return null; } })
          .filter(Boolean);

        const agentReactions = simEvents
          .filter((e: any) => e.type === 'agent_reactions')
          .flatMap((e: any) => (e.data?.reactions || []).filter((r: any) =>
            r.agentId === agentId || String(r.name || '').toLowerCase().includes(agentId.toLowerCase())
          ));
        const colonist = agentReactions[0];

        // Build colonist profile
        const profile = {
          agentId,
          name: colonist?.name || agentId,
          age: colonist?.age,
          marsborn: colonist?.marsborn,
          role: colonist?.role,
          department: colonist?.department,
          specialization: colonist?.specialization,
          hexaco: colonist?.hexaco,
          psychScore: colonist?.psychScore,
          boneDensity: colonist?.boneDensity,
          radiation: colonist?.radiation,
        };

        // Extract simulation memories for this colonist
        const memories = extractColonistMemories(agentId, simEvents);
        // Extract the full colony roster from the latest colony_snapshot so
        // the chat agent knows who else exists. Without this, the agent
        // confabulates fake bios for any name the user invents.
        const roster = extractColonistRoster(simEvents);

        // Get or create the agent (lazy init with memory seeding)
        const provider = (simConfig?.provider || (env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY ? 'anthropic' : 'openai')) as any;
        const { session, isNew } = await getOrCreateChatAgent(profile, memories, {
          provider,
          settlementNoun: activeScenario.labels?.settlementNoun,
          populationNoun: activeScenario.labels?.populationNoun,
          roster,
        });

        // Send message through the agent session (full history + memory + RAG automatic)
        const result = await session.send(message);

        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          reply: result.text,
          colonist: profile.name,
          memorySeeded: memories.length,
          firstMessage: isNew,
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    // GET /results — full structured simulation results including verdict.
    // Reconstructs per-leader payloads from the SSE buffer so consumers
    // get the same rich data the dashboard sees, without having to scrape
    // raw events themselves.
    if (req.url === '/results' && req.method === 'GET') {
      const simEvents = eventBuffer
        .filter(msg => msg.startsWith('event: sim\n') || msg.startsWith('event: result\n') || msg.startsWith('event: verdict\n') || msg.startsWith('event: complete\n'))
        .map(msg => {
          const lines = msg.split('\n');
          const eventType = lines[0]?.replace('event: ', '') || '';
          try { return { event: eventType, data: JSON.parse(lines[1]?.replace('data: ', '') || '{}') }; }
          catch { return { event: eventType, data: {} }; }
        });
      const results = simEvents.filter(e => e.event === 'result').map(e => e.data);
      const verdict = simEvents.find(e => e.event === 'verdict')?.data || null;
      const isComplete = simEvents.some(e => e.event === 'complete');
      const turns = simEvents.filter(e => e.event === 'sim' && e.data?.type === 'turn_start').length / 2;

      // Reconstruct per-leader timelines from the sim event stream.
      // Group every sim event by leader name, then bucket interesting
      // payload types into typed lists so consumers can pull turn-by-turn
      // crisis info, dept reports, decisions, forges, citations, reactions.
      const byLeader = new Map<string, {
        events: Array<{ turn?: number; year?: number; eventIndex?: number; title?: string; category?: string; description?: string; emergent?: boolean }>;
        decisions: Array<{ turn?: number; year?: number; eventIndex?: number; decision?: string; rationale?: string; selectedPolicies?: unknown[]; outcome?: string }>;
        forges: Array<Record<string, unknown>>;
        citations: Array<{ text?: string; url?: string; doi?: string; department?: string; turn?: number }>;
        deptReports: Array<{ turn?: number; year?: number; eventIndex?: number; department?: string; summary?: string; risks?: unknown[]; recommendedActions?: unknown[]; citations?: number; toolCount?: number }>;
        agentReactions: Array<{ turn?: number; year?: number; reactions?: unknown[]; totalReactions?: number }>;
        promotions: Array<Record<string, unknown>>;
        colonySnapshots: Array<Record<string, unknown>>;
      }>();
      const ensureLeader = (name: string) => {
        if (!byLeader.has(name)) byLeader.set(name, { events: [], decisions: [], forges: [], citations: [], deptReports: [], agentReactions: [], promotions: [], colonySnapshots: [] });
        return byLeader.get(name)!;
      };
      // Track decision pending state so we can attach it to outcomes per event
      const pendingDecision = new Map<string, { decision?: string; rationale?: string; selectedPolicies?: unknown[] }>();
      for (const e of simEvents) {
        if (e.event !== 'sim') continue;
        const inner = e.data as Record<string, unknown>;
        const type = String(inner.type || '');
        const leader = String(inner.leader || '');
        if (!leader) continue;
        const slot = ensureLeader(leader);
        const data = (inner.data as Record<string, unknown>) ?? {};
        const turn = data.turn as number | undefined;
        const year = data.year as number | undefined;
        const eventIndex = data.eventIndex as number | undefined;
        const pendKey = `${leader}-${turn}-${eventIndex ?? 0}`;
        if (type === 'event_start') {
          slot.events.push({ turn, year, eventIndex, title: data.title as string, category: data.category as string, description: data.description as string, emergent: data.emergent as boolean });
        } else if (type === 'turn_start' && data.title && data.title !== 'Director generating...') {
          slot.events.push({ turn, year, title: data.title as string, category: data.category as string, description: data.crisis as string, emergent: data.emergent as boolean });
        } else if (type === 'commander_decided') {
          pendingDecision.set(pendKey, {
            decision: data.decision as string,
            rationale: data.rationale as string,
            selectedPolicies: data.selectedPolicies as unknown[],
          });
        } else if (type === 'outcome') {
          const p = pendingDecision.get(pendKey);
          slot.decisions.push({ turn, year, eventIndex, ...p, outcome: data.outcome as string });
          pendingDecision.delete(pendKey);
        } else if (type === 'dept_done') {
          const dept = data.department as string;
          const cites = (data.citationList as Array<{ text?: string; url?: string; doi?: string }>) || [];
          slot.deptReports.push({
            turn, year, eventIndex, department: dept,
            summary: data.summary as string,
            risks: data.risks as unknown[],
            recommendedActions: data.recommendedActions as unknown[],
            citations: cites.length,
            toolCount: Array.isArray(data.forgedTools) ? (data.forgedTools as unknown[]).length : 0,
          });
          for (const c of cites) {
            slot.citations.push({ ...c, department: dept, turn });
          }
        } else if (type === 'forge_attempt') {
          slot.forges.push({ turn, year, eventIndex, ...data });
        } else if (type === 'agent_reactions') {
          slot.agentReactions.push({ turn, year, reactions: data.reactions as unknown[], totalReactions: data.totalReactions as number });
        } else if (type === 'promotion') {
          slot.promotions.push({ ...data });
        } else if (type === 'colony_snapshot') {
          slot.colonySnapshots.push({ turn, year, ...data });
        }
      }
      const leaders = [...byLeader.entries()].map(([name, slot]) => ({ name, ...slot }));

      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        results,
        verdict,
        isComplete,
        turnsCompleted: Math.floor(turns),
        totalEvents: simEvents.length,
        // New: structured per-leader payloads built from the SSE buffer
        leaders,
      }));
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
        const config = JSON.parse(await readBody(req));

        // Rate limit check: bypass when user provides their own API keys
        const hasUserKeys = !!(config.apiKey || config.anthropicKey);
        if (rateLimiter && !hasUserKeys) {
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
              error: `Rate limit exceeded. Maximum ${limit} simulations per day. Add your own API keys in Settings to remove this limit.`,
              limit,
              remaining: 0,
            }));
            return;
          }
          rateLimiter.record(ip);
          console.log(`  [rate-limit] ${ip}: ${remaining - 1} remaining of ${limit}`);
        } else if (hasUserKeys) {
          console.log(`  [rate-limit] Bypassed — user provided API keys`);
        }
        if (!config.leaders || config.leaders.length < 2) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Two leaders required' }));
          return;
        }

        simConfig = normalizeSimulationConfig(config);

        // Demo-mode enforcement: clamp only when the run bills against
        // the host's provider keys AND the server is in hosted-demo
        // mode. On local dev (PARACOSM_HOSTED_DEMO unset) env keys
        // belong to the operator, so we trust the tiered defaults and
        // any model overrides the client sent. On the hosted Linode
        // this variable is set, so env-only requests get clamped.
        const isHostedDemo = (env.PARACOSM_HOSTED_DEMO || '').toLowerCase() === 'true';
        if (!hasUserKeys && isHostedDemo) {
          simConfig = applyDemoCaps(simConfig);
          console.log(
            `  [demo-mode] Capped run: turns=${simConfig.turns} pop=${simConfig.initialPopulation} ` +
            `depts=${simConfig.activeDepartments.length} models=${simConfig.models.commander}`,
          );
        }

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

        // If a run is already in flight, abort it before starting the
        // new one. Previously /setup silently no-op'd on simRunning,
        // which left the old sim draining API credits while the user
        // thought their new config had taken effect. The orchestrator
        // handles AbortSignal via its finally block in startWithConfig
        // (resets simRunning + activeSimAbortController), so awaiting
        // that unwind before starting ensures the event buffer clear +
        // new config take effect cleanly.
        if (simRunning && activeSimAbortController) {
          console.log(`  [setup] Aborting in-flight sim before launching new one`);
          activeSimAbortController.abort();
          // Wait up to 5s for the previous run's finally block to run.
          // Without this, the orchestrator's finally could reset
          // simRunning AFTER the new startWithConfig has already set
          // it, then the watchdog would never re-arm on the new sim.
          const waitStart = Date.now();
          while (simRunning && Date.now() - waitStart < 5000) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }

        void marsServer.startWithConfig(simConfig);

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
    if (req.url?.split('?')[0].startsWith('/brand/')) {
      const brandPath = resolve(__dirname, '..', '..', 'assets', req.url.split('?')[0].replace('/brand/', ''));
      if (existsSync(brandPath)) {
        const ext = brandPath.split('.').pop() || '';
        const types: Record<string,string> = { svg:'image/svg+xml', png:'image/png', jpg:'image/jpeg', css:'text/css', js:'application/javascript', woff2:'font/woff2' };
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300, s-maxage=60' });
        res.end(readFileSync(brandPath));
        return;
      }
    }

    if (req.url === '/favicon.svg' || req.url === '/favicon.png' || req.url === '/favicon.ico' || req.url === '/icon.svg' || req.url === '/apple-touch-icon.png') {
      try {
        const assetsDir = resolve(__dirname, '..', '..', 'assets');
        const favDir = resolve(assetsDir, 'favicons');
        // Apple touch icon
        if (req.url === '/apple-touch-icon.png') {
          const p = resolve(favDir, 'favicon-180.png');
          if (existsSync(p)) { res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }); res.end(readFileSync(p)); return; }
        }
        // PNG routes: serve 32px PNG
        if (req.url === '/favicon.png' || req.url === '/favicon.ico') {
          const p = resolve(favDir, 'favicon-32.png');
          if (existsSync(p)) { res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }); res.end(readFileSync(p)); return; }
        }
        // SVG routes
        const svgPath = resolve(favDir, 'icon.svg');
        const fallbackSvg = resolve(assetsDir, 'mars-genesis-icon.svg');
        const iconPath = existsSync(svgPath) ? svgPath : existsSync(fallbackSvg) ? fallbackSvg : null;
        if (iconPath) {
          res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
          res.end(readFileSync(iconPath, 'utf-8'));
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
            // Rewrite relative asset paths to absolute /docs/ paths
            html = html.replace(/href="\.\.\/assets\//g, 'href="/docs/assets/');
            html = html.replace(/src="\.\.\/assets\//g, 'src="/docs/assets/');
            html = html.replace(/href="assets\//g, 'href="/docs/assets/');
            html = html.replace(/src="assets\//g, 'src="/docs/assets/');
            html = html.replace(/href="\.\.\/media\//g, 'href="/docs/media/');
            html = html.replace(/src="\.\.\/media\//g, 'src="/docs/media/');
            html = html.replace(/href="media\//g, 'href="/docs/media/');
            html = html.replace(/src="media\//g, 'src="/docs/media/');
            // TypeDoc toolbar + page title hidden via CSS (kept in DOM so JS doesn't crash)
            // Add our CSS override + fonts + favicon + inline mobile styles
            html = html.replace('</head>',
              `<link rel="icon" href="/favicon.png" sizes="32x32"><link rel="icon" type="image/svg+xml" href="/icon.svg"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"><link rel="stylesheet" href="/docs/assets/paracosm-override.css">
<style>
/* Hamburger button (hidden on desktop) */
.pdh-hamburger{display:none;background:none;border:1px solid var(--color-text-aside);border-radius:6px;width:32px;height:32px;cursor:pointer;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:7px;flex-shrink:0;opacity:.6;transition:opacity .2s}
.pdh-hamburger:hover{opacity:1}
.pdh-hamburger span{display:block;width:16px;height:2px;background:var(--color-text);border-radius:1px;transition:transform .25s,opacity .25s}
.pdh-hamburger.open span:nth-child(1){transform:translateY(6px) rotate(45deg)}
.pdh-hamburger.open span:nth-child(2){opacity:0}
.pdh-hamburger.open span:nth-child(3){transform:translateY(-6px) rotate(-45deg)}
/* Mobile nav dropdown (site links, not API sidebar) */
.pdh-mobile-nav{display:none;position:fixed;top:44px;left:0;right:0;z-index:99999;background:var(--color-background);border-bottom:1px solid var(--color-background-active);padding:8px 16px;flex-direction:column;gap:0}
.pdh-mobile-nav.open{display:flex}
.pdh-mobile-nav a{display:block;padding:12px 8px;font-size:15px;font-weight:500;color:var(--color-text-aside);text-decoration:none;border-bottom:1px solid var(--color-background-active);font-family:'Inter',system-ui,sans-serif}
.pdh-mobile-nav a:last-child{border-bottom:none}
.pdh-mobile-nav a:hover{color:var(--color-text)}
@media(max-width:1100px){
  header.tsd-page-toolbar{height:0!important;overflow:hidden!important;visibility:hidden!important;padding:0!important;margin:0!important;border:none!important}
  .container-main{display:block!important;grid-template-columns:none!important}
  .col-sidebar{display:none!important}
  .pdh-hamburger{display:flex}
  .pdh-right a,.pdh-right .pdh-search{display:none!important}
}
</style></head>`
            );
            // Inject nav header after <body>
            html = html.replace(/<body[^>]*>/, `$&
<div class="paracosm-docs-header">
  <div class="pdh-left">
    <a href="/" style="display:flex;align-items:center;text-decoration:none" aria-label="Paracosm home">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="22" height="22" style="margin-right:8px;flex-shrink:0;display:block" role="img" aria-label="Paracosm"><style>.ph{animation:ph-p 4s ease-in-out infinite}.pg{animation:ph-g 4s ease-in-out infinite}@keyframes ph-p{0%,100%{opacity:1}50%{opacity:.75}}@keyframes ph-g{0%,100%{opacity:.06}50%{opacity:.15}}@media(prefers-reduced-motion:reduce){.ph,.pg{animation:none!important}}</style><line x1="32" y1="32" x2="37.63" y2="10.98" stroke="#f5f0e4" stroke-width="1.6" opacity=".5"/><line x1="32" y1="32" x2="53.02" y2="26.37" stroke="#f5f0e4" stroke-width="1.6" opacity=".5"/><line x1="32" y1="32" x2="47.39" y2="47.39" stroke="#f5f0e4" stroke-width="1.6" opacity=".5"/><line x1="32" y1="32" x2="26.37" y2="53.02" stroke="#f5f0e4" stroke-width="1.6" opacity=".5"/><line x1="32" y1="32" x2="10.98" y2="37.63" stroke="#f5f0e4" stroke-width="1.6" opacity=".5"/><line x1="32" y1="32" x2="16.61" y2="16.61" stroke="#f5f0e4" stroke-width="1.6" opacity=".5"/><line x1="37.63" y1="10.98" x2="47.39" y2="47.39" stroke="#f5f0e4" stroke-width="1.1" opacity=".18"/><line x1="53.02" y1="26.37" x2="26.37" y2="53.02" stroke="#f5f0e4" stroke-width="1.1" opacity=".18"/><line x1="47.39" y1="47.39" x2="10.98" y2="37.63" stroke="#f5f0e4" stroke-width="1.1" opacity=".18"/><line x1="26.37" y1="53.02" x2="16.61" y2="16.61" stroke="#f5f0e4" stroke-width="1.1" opacity=".18"/><line x1="10.98" y1="37.63" x2="37.63" y2="10.98" stroke="#f5f0e4" stroke-width="1.1" opacity=".18"/><line x1="16.61" y1="16.61" x2="53.02" y2="26.37" stroke="#f5f0e4" stroke-width="1.1" opacity=".18"/><circle class="pg" cx="32" cy="32" r="9.2" fill="#e8b44a"/><circle class="ph" cx="32" cy="32" r="5.12" fill="#e8b44a"/><circle cx="37.63" cy="10.98" r="3.52" fill="#e06530"/><circle cx="53.02" cy="26.37" r="3.52" fill="#e8b44a"/><circle cx="47.39" cy="47.39" r="3.52" fill="#4ca8a8"/><circle cx="26.37" cy="53.02" r="3.52" fill="#e06530"/><circle cx="10.98" cy="37.63" r="3.52" fill="#4ca8a8"/><circle cx="16.61" cy="16.61" r="3.52" fill="#e8b44a"/></svg>
      <span class="pdh-brand">PARA<span style="color:#e8b44a">COSM</span></span>
    </a>
    <a href="https://agentos.sh" target="_blank" rel="noopener" class="pdh-tag">AGENTOS</a>
    <span class="pdh-sep">|</span>
    <span class="pdh-current">API Reference v${PARACOSM_VERSION}</span>
  </div>
  <div class="pdh-right">
    <a href="/">Home</a>
    <a href="/sim">Simulation</a>
    <a href="/docs">API Docs</a>
    <a href="https://github.com/framersai/paracosm" target="_blank" rel="noopener">GitHub</a>
    <a href="https://www.npmjs.com/package/paracosm" target="_blank" rel="noopener">npm</a>
    <button class="pdh-search" onclick="document.getElementById('tsd-search-trigger')?.click()" aria-label="Search docs"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5"/><line x1="11" y1="11" x2="15" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
    <button class="pdh-theme" id="pdh-theme-toggle" aria-label="Toggle theme"></button>
    <button class="pdh-hamburger" id="pdh-hamburger" aria-label="Toggle menu"><span></span><span></span><span></span></button>
  </div>
</div>
<div class="pdh-mobile-nav" id="pdh-mobile-nav">
  <a href="/">Home</a>
  <a href="/sim">Simulation</a>
  <a href="/docs">API Docs</a>
  <a href="https://github.com/framersai/paracosm" target="_blank" rel="noopener">GitHub</a>
  <a href="https://www.npmjs.com/package/paracosm" target="_blank" rel="noopener">npm</a>
  <a href="https://agentos.sh" target="_blank" rel="noopener">AgentOS</a>
  <a href="https://wilds.ai/discord" target="_blank" rel="noopener">Discord</a>
</div>
<script>
(function(){
  // Search: intercept showModal -> show() so CSS can position it as popover
  var d=document.getElementById('tsd-search');
  if(d){
    d.showModal=function(){d.show();d.style.position='fixed';d.style.top='54px';d.style.right='24px';d.style.left='auto';d.style.bottom='auto';d.style.width='420px';d.style.maxWidth='calc(100vw - 48px)';d.style.maxHeight='480px';d.style.margin='0';d.style.borderRadius='8px';d.style.boxShadow='0 12px 40px rgba(0,0,0,.5)';d.style.zIndex='99999';var i=d.querySelector('input');if(i)i.focus();};
    document.addEventListener('click',function(e){if(d.open&&!d.contains(e.target)&&!e.target.closest('.pdh-search'))d.close();});
  }
  // Theme toggle
  var btn=document.getElementById('pdh-theme-toggle');
  if(btn){
    function applyTheme(t){
      document.documentElement.dataset.theme=t;
      localStorage.setItem('tsd-theme',t);
      btn.textContent=t==='dark'?'\\u2600':'\\u263D';
    }
    var saved=localStorage.getItem('tsd-theme')||'os';
    if(saved==='os') saved=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';
    applyTheme(saved);
    btn.addEventListener('click',function(){
      var next=document.documentElement.dataset.theme==='dark'?'light':'dark';
      applyTheme(next);
    });
  }
  // Hamburger: toggle mobile nav dropdown
  var hb=document.getElementById('pdh-hamburger');
  var mn=document.getElementById('pdh-mobile-nav');
  if(hb&&mn){
    hb.addEventListener('click',function(){
      hb.classList.toggle('open');
      mn.classList.toggle('open');
    });
    mn.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click',function(){hb.classList.remove('open');mn.classList.remove('open');});
    });
  }
})();
</script>`);
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
  <span><span style="font-family:'JetBrains Mono','SF Mono',Menlo,monospace;font-weight:700;letter-spacing:.08em;font-size:10px">PARA<span style="color:#e8b44a">COSM</span></span> &middot; Apache-2.0 &middot; <a href="https://manic.agency">Manic Agency</a> / <a href="https://frame.dev">Frame.dev</a></span>
</div></body>`);
            res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
            res.end(html);
            return;
          }

          const content = readFileSync(filePath);
          res.writeHead(200, {
            'Content-Type': mimeTypes[ext] || 'application/octet-stream',
            'Cache-Control': 'no-cache',
          });
          res.end(content);
          return;
        }
        // Directory: try index.html
        if (stat.isDirectory()) {
          const indexPath = resolve(filePath, 'index.html');
          if (existsSync(indexPath)) {
            const content = readFileSync(indexPath);
            res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
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
      // Per-run AbortController. Held in a local so the finally block
      // only clears the global flag when it still points to *our* run.
      // Without the identity check, a slow cleanup on an old run could
      // null the active controller of a newer run that /setup just
      // started, breaking the disconnect watchdog's abort path.
      const controller = new AbortController();
      activeSimAbortController = controller;
      try {
        await startSimulations(config, broadcast, controller.signal);
      } finally {
        disarmDisconnectWatchdog();
        if (activeSimAbortController === controller) {
          simRunning = false;
          activeSimAbortController = null;
        }
        // Else: a newer run already replaced us. Leave simRunning and
        // activeSimAbortController alone so the new run's watchdog
        // continues to work.
      }
    },
  });

  return marsServer;
}
