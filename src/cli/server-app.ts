import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
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
import { IpRateLimiter } from './rate-limiter.js';
import {
  aggregateSchemaRetries,
  aggregateForgeStats,
  aggregateCacheStats,
  aggregateProviderErrors,
  type PerRunSchemaRetries,
  type PerRunForgeStats,
  type PerRunCacheStats,
  type PerRunProviderErrors,
} from './retry-stats.js';
import { createCompilerTelemetry, type CompilerTelemetry } from '../engine/compiler/telemetry.js';
import { openSessionStore, type SessionStore, type TimestampedEvent } from './session-store.js';
import { resolveServerMode } from './server/server-mode.js';
import { createRunRecord, hashLeaderConfig } from './server/run-record.js';
import { createNoopRunHistoryStore, type RunHistoryStore } from './server/run-history-store.js';
import { handlePublicDemoRoute } from './server/routes/public-demo.js';
import { handlePlatformApiRoute } from './server/routes/platform-api.js';

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
      // Compiled scenarios can express policies either as
      // { toolForging: true } (boolean shorthand) or as
      // { toolForging: { enabled: true } } (object with flags).
      // The server crashed with "Cannot read properties of
      // undefined (reading 'enabled')" on the shorthand form.
      // Defensive reader handles both shapes and missing entries.
      toolForging: typeof sc.policies?.toolForging === 'object'
        ? Boolean((sc.policies.toolForging as { enabled?: boolean }).enabled)
        : Boolean(sc.policies?.toolForging),
      bulletin: typeof sc.policies?.bulletin === 'object'
        ? Boolean((sc.policies.bulletin as { enabled?: boolean }).enabled)
        : Boolean(sc.policies?.bulletin),
      characterChat: typeof sc.policies?.characterChat === 'object'
        ? Boolean((sc.policies.characterChat as { enabled?: boolean }).enabled)
        : Boolean(sc.policies?.characterChat),
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
  runPairSimulations?: (config: NormalizedSimulationConfig, broadcast: BroadcastFn, signal?: AbortSignal, scenario?: ScenarioPackage) => Promise<void>;
  generateText?: (args: { provider: string; model: string; prompt: string }) => Promise<{ text: string }>;
  compileScenario?: (scenarioJson: Record<string, unknown>, options: Record<string, unknown>) => Promise<ScenarioPackage>;
  scenarioDir?: string;
  /** Max simulations per IP per day. 0 = unlimited. Default: 3. Set via RATE_LIMIT env var. */
  maxSimsPerDay?: number;
  /**
   * Grace period (ms) between the last SSE client disconnecting and the
   * server cancelling the active simulation. Default 30_000ms (30s),
   * which covers the common case of a user clicking an internal link
   * (e.g. /docs, /, another dashboard tab that triggers a full page
   * navigation) and returning within half a minute. Shorter values
   * (the previous 1500ms) surfaced "Interrupted" badges on routine
   * in-domain navigation — a bad tradeoff, since the per-LLM-call
   * abort gates in the orchestrator already cap the worst-case
   * wasted-spend at a single in-flight call regardless of how long
   * the grace window is.
   */
  disconnectGraceMs?: number;
  /**
   * Override the session store instance. Intended for tests; the
   * default production path opens a SQLite store at
   * `${APP_DIR}/data/sessions.db`.
   */
  sessionStore?: SessionStore;
  runHistoryStore?: RunHistoryStore;
}

export interface MarsServer extends Server {
  startWithConfig: (config: NormalizedSimulationConfig) => Promise<void>;
}

export function createMarsServer(options: CreateMarsServerOptions = {}): MarsServer {
  const env = options.env ?? process.env;
  const serverMode = resolveServerMode(env);
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
  // Runnable scenarios that can appear in the catalog and be switched to.
  // Disk-loaded + builtins register into the SAME map so the switch /
  // list / active-derivation code is universal — no hardcoded branches
  // for specific IDs. New builtins ship by adding one more
  // customScenarioCatalog.set(id, { scenario, source: 'builtin' }) here.
  const customScenarioCatalog = loadDiskCustomScenarios(scenarioDir);
  customScenarioCatalog.set(marsScenario.id, { scenario: marsScenario, source: 'builtin' });
  customScenarioCatalog.set(lunarScenario.id, { scenario: lunarScenario, source: 'builtin' });
  const clients: Set<ServerResponse> = new Set();

  // Event buffer: stores all broadcast events so new clients can catch up.
  // Persisted to disk so a server restart (CI/CD redeploy, pm2 reload,
  // crash) does not evaporate a completed run from the /chat and /results
  // endpoints, which otherwise would tell users "no simulation data" the
  // moment they navigate away and come back after a deploy.
  const eventBufferPath = resolve(env.APP_DIR || '.', '.event-buffer.json');
  const eventBuffer: string[] = (() => {
    try {
      if (existsSync(eventBufferPath)) {
        const raw = readFileSync(eventBufferPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          console.log(`  [event-buffer] Rehydrated ${parsed.length} buffered events from ${eventBufferPath}`);
          return parsed.filter((x: unknown): x is string => typeof x === 'string');
        }
      }
    } catch (err) {
      console.log(`  [event-buffer] Failed to rehydrate (${err}); starting empty`);
    }
    return [];
  })();
  // Parallel array of broadcast wall-clock timestamps. Index-aligned
  // with eventBuffer so /admin/sessions/save can capture per-event
  // pacing for replay. Rehydrated runs (post-deploy) start with no
  // historical timestamps — replay of those would fall back to a
  // fixed inter-event interval. Live runs after the deploy get
  // accurate pacing.
  const eventTimestamps: number[] = new Array(eventBuffer.length).fill(0);

  // Run-state flags for auto-save on clean completion. Reset inside
  // clearEventBuffer() so the next run starts fresh. See
  // docs/superpowers/specs/2026-04-18-load-menu-cached-runs-design.md.
  //
  // AUTO_SAVE_MIN_TURNS floors the run length at one completed turn:
  // accidental clicks never get saved (no turn_done → nothing to replay
  // anyway), but a legitimate 1- or 2-turn run does. The earlier value
  // of 3 silently excluded most hosted-demo runs from the cache ring,
  // which kept the LoadMenu perpetually empty for visitors.
  let currentRunAborted = false;
  let currentRunSaved = false;
  const AUTO_SAVE_MIN_TURNS = 1;

  // Persistent storage for completed sim runs. Lives at
  // `${APP_DIR}/data/sessions.db`; the directory is created on first
  // open. Cap of 10 saved sessions; oldest evicts when an admin saves
  // an 11th. The store is opened once at server start so the SQLite
  // handle and prepared statements stay warm across requests.
  let sessionStore: SessionStore | null = options.sessionStore ?? null;
  const sessionsDbPath = resolve(env.APP_DIR || '.', 'data', 'sessions.db');
  if (!sessionStore) try {
    sessionStore = openSessionStore(sessionsDbPath);
    console.log(`  [sessions] Opened session store at ${sessionsDbPath} (${sessionStore.count()} stored)`);
  } catch (err) {
    // Don't crash the server if SQLite init fails (missing native binary,
    // disk full, etc) — sims still run, the /sessions and /admin/sessions
    // routes just return 503.
    console.log(`  [sessions] Failed to open session store: ${err}`);
  }
  const runHistoryStore = options.runHistoryStore ?? createNoopRunHistoryStore();

  // Coalesce disk writes so a burst of broadcasts (e.g. 50 forge_attempt
  // events during a turn) only triggers one persist call. 500ms debounce
  // is short enough that a crash loses at most a half-second of events
  // but long enough to avoid thrashing the disk during active runs.
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  const persistBufferSoon = () => {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      try {
        writeFileSync(eventBufferPath, JSON.stringify(eventBuffer));
      } catch (err) {
        console.log(`  [event-buffer] Persist failed: ${err}`);
      }
    }, 500);
  };

  // ── Cross-run schema-retry ring buffer ─────────────────────────────
  //
  // Each completed simulation contributes its `cost.schemaRetries`
  // payload to a rotating ring of the last N runs. The `/retry-stats`
  // endpoint aggregates the ring so operators can answer "is 0.1.228 on
  // Anthropic retrying too much on CommanderDecision?" without replaying
  // individual runs. Persisted to disk so a restart doesn't wipe the
  // telemetry. 100 entries ≈ 2-3 weeks of typical demo traffic.
  const RETRY_RING_MAX = 100;
  const retryRingPath = resolve(env.APP_DIR || '.', '.retry-stats.json');

  // File format v4:
  //   { version: 4, schemas, forges, caches, providerErrors }
  // Prior formats loaded for back-compat:
  //   v1 (bare JSON array) - pre-2026-04-18
  //   v2 (object with schemas + forges) - 2026-04-18 first half
  //   v3 (+ caches) - 2026-04-18 mid
  interface RetryRingFile {
    version: number;
    schemas: PerRunSchemaRetries[];
    forges: PerRunForgeStats[];
    caches: PerRunCacheStats[];
    providerErrors: PerRunProviderErrors[];
  }

  const {
    schemas: retryRing,
    forges: forgeRing,
    caches: cacheRing,
    providerErrors: providerErrorRing,
  } = ((): RetryRingFile => {
    try {
      if (existsSync(retryRingPath)) {
        const raw = readFileSync(retryRingPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return { version: 4, schemas: parsed.slice(-RETRY_RING_MAX), forges: [], caches: [], providerErrors: [] };
        }
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.schemas)) {
          return {
            version: 4,
            schemas: parsed.schemas.slice(-RETRY_RING_MAX),
            forges: Array.isArray(parsed.forges) ? parsed.forges.slice(-RETRY_RING_MAX) : [],
            caches: Array.isArray(parsed.caches) ? parsed.caches.slice(-RETRY_RING_MAX) : [],
            providerErrors: Array.isArray(parsed.providerErrors)
              ? parsed.providerErrors.slice(-RETRY_RING_MAX)
              : [],
          };
        }
      }
    } catch { /* start empty on corrupt file */ }
    return { version: 4, schemas: [], forges: [], caches: [], providerErrors: [] };
  })();

  const persistRetryRing = () => {
    try {
      const payload: RetryRingFile = {
        version: 4,
        schemas: retryRing,
        forges: forgeRing,
        caches: cacheRing,
        providerErrors: providerErrorRing,
      };
      writeFileSync(retryRingPath, JSON.stringify(payload));
    } catch (err) { console.log(`  [retry-stats] persist failed: ${err}`); }
  };
  /**
   * Scan the current event buffer back-to-front for the first event
   * whose `_cost` payload carries a `schemaRetries` field. That event
   * has the run's terminal per-schema rollup; earlier events have
   * partial counts. Push to the ring and persist.
   */
  const captureRetrySnapshot = () => {
    let capturedSchemas = false;
    let capturedForges = false;
    let capturedCaches = false;
    let capturedProviderErrors = false;
    const allCaptured = () => capturedSchemas && capturedForges && capturedCaches && capturedProviderErrors;
    for (let i = eventBuffer.length - 1; i >= 0 && !allCaptured(); i--) {
      const msg = eventBuffer[i];
      const dataLine = msg.split('\n').find(l => l.startsWith('data: '));
      if (!dataLine) continue;
      try {
        const payload = JSON.parse(dataLine.slice(6));
        const cost = payload?.data?._cost;
        if (!cost) continue;
        if (!capturedSchemas && cost.schemaRetries && typeof cost.schemaRetries === 'object') {
          retryRing.push(cost.schemaRetries as PerRunSchemaRetries);
          if (retryRing.length > RETRY_RING_MAX) {
            retryRing.splice(0, retryRing.length - RETRY_RING_MAX);
          }
          capturedSchemas = true;
        }
        if (!capturedForges && cost.forgeStats && typeof cost.forgeStats === 'object') {
          forgeRing.push(cost.forgeStats as PerRunForgeStats);
          if (forgeRing.length > RETRY_RING_MAX) {
            forgeRing.splice(0, forgeRing.length - RETRY_RING_MAX);
          }
          capturedForges = true;
        }
        if (!capturedCaches && cost.cacheStats && typeof cost.cacheStats === 'object') {
          cacheRing.push(cost.cacheStats as PerRunCacheStats);
          if (cacheRing.length > RETRY_RING_MAX) {
            cacheRing.splice(0, cacheRing.length - RETRY_RING_MAX);
          }
          capturedCaches = true;
        }
        if (!capturedProviderErrors && cost.providerErrors && typeof cost.providerErrors === 'object') {
          providerErrorRing.push(cost.providerErrors as PerRunProviderErrors);
          if (providerErrorRing.length > RETRY_RING_MAX) {
            providerErrorRing.splice(0, providerErrorRing.length - RETRY_RING_MAX);
          }
          capturedProviderErrors = true;
        }
      } catch { /* skip malformed buffer entries */ }
    }
    if (capturedSchemas || capturedForges || capturedCaches || capturedProviderErrors) {
      persistRetryRing();
    }
  };

  /**
   * Persist the current run to the session ring when it completes
   * cleanly. Called from inside broadcast() on an `event: complete`
   * frame. Silent no-op when conditions aren't met. Errors are logged
   * but never propagate: a cache write failure must not fail the
   * client-facing broadcast.
   */
  const autoSaveOnComplete = () => {
    // Every branch logs a single [sessions] line so production can see
    // in server stderr/stdout WHY a run did or did not make it into the
    // ring. Without these, a save silently failing on a writable-but-
    // locked SQLite file (container volume quirk) looked identical to
    // a clean save from outside.
    //
    // Each skip/outcome also fires a `sim_saved` SSE event so the
    // dashboard can surface "saved as <id>" / "save skipped: <reason>"
    // without the user having to SSH the server to find out why the
    // LOAD menu is still empty after a clean run.
    const emitSaveStatus = (status: 'saved' | 'skipped' | 'failed', detail: Record<string, unknown>) => {
      // Call broadcast directly so the client sees the status on the same
      // stream as the rest of the run. Status events are included in the
      // event buffer so a returning user (SSE reconnect + replay) still
      // sees whether the prior run saved.
      try { broadcast('sim_saved', { status, ...detail }); } catch { /* never fail the server on telemetry */ }
    };
    if (!sessionStore) {
      console.log('[sessions] auto-save skipped: session store not initialized');
      emitSaveStatus('skipped', { reason: 'store_not_initialized' });
      return;
    }
    if (currentRunAborted) {
      console.log('[sessions] auto-save skipped: run was aborted');
      emitSaveStatus('skipped', { reason: 'run_aborted' });
      return;
    }
    if (currentRunSaved) {
      console.log('[sessions] auto-save skipped: already saved for this run');
      return;
    }
    if (eventBuffer.length === 0) {
      console.log('[sessions] auto-save skipped: empty event buffer');
      emitSaveStatus('skipped', { reason: 'empty_buffer' });
      return;
    }

    // Count completed turns. Two shapes are in play:
    //   1. Legacy / test shape: `broadcast('turn_done', ...)` → frame
    //      line `event: turn_done\n...`.
    //   2. Real production shape: the orchestrator wraps every engine
    //      event in `broadcast('sim', {type: 'turn_done', ...})` →
    //      frame line `event: sim\ndata: {"type":"turn_done",...}`.
    // The prior check only matched shape (1), so every prod run
    // silently skipped with `below_min_turns`. Match either shape.
    const turnDoneCount = eventBuffer.reduce((n, msg) => {
      if (msg.startsWith('event: turn_done\n')) return n + 1;
      if (msg.startsWith('event: sim\n') && msg.includes('"type":"turn_done"')) return n + 1;
      return n;
    }, 0);
    if (turnDoneCount < AUTO_SAVE_MIN_TURNS) {
      console.log(`[sessions] auto-save skipped: turn_done count ${turnDoneCount} below AUTO_SAVE_MIN_TURNS (${AUTO_SAVE_MIN_TURNS})`);
      emitSaveStatus('skipped', { reason: 'below_min_turns', turnDoneCount, minTurns: AUTO_SAVE_MIN_TURNS });
      return;
    }

    try {
      const now = Date.now();
      const events: TimestampedEvent[] = eventBuffer.map((sse, i) => ({
        ts: eventTimestamps[i] || now,
        sse,
      }));
      const result = sessionStore.saveSession(events);
      currentRunSaved = true;
      const storeCount = sessionStore.count();
      console.log(`[sessions] auto-saved run ${result.id}: ${events.length} events, ${turnDoneCount} turns (store count: ${storeCount})`);
      emitSaveStatus('saved', {
        id: result.id,
        evictedId: result.evictedId,
        eventCount: events.length,
        turnCount: turnDoneCount,
        totalStored: storeCount,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[sessions] auto-save failed:', err);
      emitSaveStatus('failed', { error: message });
    }
  };

  const broadcast: BroadcastFn = (event, data) => {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    eventBuffer.push(msg);
    eventTimestamps.push(Date.now());
    persistBufferSoon();
    for (const res of clients) {
      try {
        res.write(msg);
      } catch {
        clients.delete(res);
      }
    }
    if (event === 'sim_aborted') {
      currentRunAborted = true;
    }
    // On simulation completion, snapshot the run's schema-retry payload
    // to the cross-run ring buffer so /retry-stats can aggregate across
    // production runs. We pull schemaRetries from the MOST RECENT cost
    // payload observed in the current event buffer; the orchestrator
    // emits it on every SSE event, so the last event has the complete
    // picture.
    if (event === 'complete') {
      captureRetrySnapshot();
      autoSaveOnComplete();
    }
  };

  /**
   * Clear the in-memory event buffer AND remove the persisted snapshot on
   * disk. Without the disk drop, /clear (or a new /setup that resets the
   * buffer) would leave the old run's events on disk; a subsequent server
   * restart would rehydrate them and overwrite what the user expected to
   * be a fresh state. Cancels any pending write so the empty state wins.
   */
  const clearEventBuffer = () => {
    currentRunAborted = false;
    currentRunSaved = false;
    eventBuffer.length = 0;
    eventTimestamps.length = 0;
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    try {
      if (existsSync(eventBufferPath)) unlinkSync(eventBufferPath);
    } catch { /* nothing to clean up */ }
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
  // Grace period handles the legitimate refresh / in-domain navigation
  // case: EventSource disconnects briefly, then reconnects. The default
  // 30_000ms (30s) covers a user clicking an internal link (e.g. the
  // About tab, which redirects to `/`) and returning within half a
  // minute — the previous 1500ms surfaced "Interrupted" badges whenever
  // the user navigated away and back. Combined with the per-LLM-call
  // abort gates in the orchestrator (runtime/orchestrator.ts), at most
  // one in-flight call finishes after the watchdog trips regardless of
  // how long the grace window is, so widening it has no worst-case
  // wasted-spend cost.
  const disconnectGraceMs = options.disconnectGraceMs ?? 30_000;
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

    if (handlePublicDemoRoute(serverMode, req, res, corsHeaders)) {
      return;
    }
    if (await handlePlatformApiRoute(serverMode, req, res, { runHistoryStore, corsHeaders })) {
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
      // Replay all buffered events so new clients catch up. The trailing
      // `replay_done` marker lets the client distinguish historical-buffer
      // events from truly live ones so toasts (transient per-event
      // notifications) only fire for events that arrive AFTER the user
      // reached the page, never for the replay of a prior run.
      for (const msg of eventBuffer) {
        try { res.write(msg); } catch { break; }
      }
      try { res.write('event: replay_done\ndata: {}\n\n'); } catch {}
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

    // List scenarios that can be switched to. Builtins, disk-loaded,
    // in-memory runnable customs, and any currently-active compiled
    // scenario all live in the same catalog — this endpoint is a
    // uniform iteration over it. No hardcoded IDs.
    if (req.url === '/scenarios' && req.method === 'GET') {
      const scenarios: Array<{ id: string; name: string; description: string; departments: number; source: string }> = [];
      for (const [id, entry] of customScenarioCatalog) {
        const sc = entry.scenario;
        scenarios.push({
          id,
          name: sc.labels?.name || id,
          description: describeCustomScenarioSource(entry.source),
          departments: sc.departments?.length || 0,
          source: entry.source,
        });
      }
      // Active scenario might not be in the catalog yet (freshly
      // compiled but we haven't written it back — belt-and-suspenders).
      if (!customScenarioCatalog.has(activeScenario.id)) {
        scenarios.push({
          id: activeScenario.id,
          name: activeScenario.labels?.name || activeScenario.id,
          description: 'Custom compiled scenario',
          departments: activeScenario.departments?.length || 0,
          source: 'compiled',
        });
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
      const hostedDemo = serverMode === 'hosted_demo';
      // Expose the effective demo caps so the Settings UI can show
      // accurate `demo:N` lock labels without hardcoding the number
      // in the client. Lets operators flip the env var + pm2 restart
      // and the UI updates on the next page load without a redeploy.
      const { DEMO_EXECUTION } = await import('./sim-config.js');
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        adminWrite,
        hostedDemo,
        serverMode,
        demoCaps: {
          maxTurns: DEMO_EXECUTION.maxTurns,
          maxPopulation: DEMO_EXECUTION.maxPopulation,
          maxActiveDepartments: DEMO_EXECUTION.maxActiveDepartments,
        },
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

    // Switch active scenario. Uniform catalog lookup — builtins
    // (mars-genesis, lunar-outpost) are registered into the same map
    // at server init, so this handler has NO hardcoded IDs. Any ID
    // that resolves to a runnable entry switches; source JSONs that
    // were /scenario/store'd but never compiled get a specific
    // "needs compile" error instead of the misleading "Unknown".
    if (req.url === '/scenario/switch' && req.method === 'POST') {
      const { id } = JSON.parse(await readBody(req));
      const entry = customScenarioCatalog.get(id);
      if (entry) {
        activeScenario = entry.scenario;
      } else if (memoryScenarios.has(id)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: `Scenario "${id}" is stored but not runnable — it's a source JSON (missing hooks, world, or canonical policies shape). Click Compile in the Scenario Editor to generate hooks before switching to it.`,
          storedButUnrunnable: true,
          id,
        }));
        return;
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Unknown scenario: ${id}. Use /compile or /scenario/store for custom scenarios.` }));
        return;
      }
      clearEventBuffer();
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
        const isHostedDemoCompile = serverMode === 'hosted_demo';
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
        // LLM calls route to the user's account, not the host's. Keys are
        // snapshotted + restored after the compile completes so they don't
        // leak into subsequent unrelated requests. Placeholder values
        // (e.g. "sk-...") are ignored so a masked display string never
        // replaces a real key.
        const compileEnvSnapshot: Array<[string, string | undefined]> = [];
        const scopeCompileKey = (name: string, value: unknown) => {
          if (typeof value !== 'string' || !value || value.includes('...')) return;
          compileEnvSnapshot.push([name, env[name]]);
          env[name] = value;
        };
        scopeCompileKey('OPENAI_API_KEY', apiKey);
        scopeCompileKey('ANTHROPIC_API_KEY', anthropicKey);
        const restoreCompileEnv = () => {
          for (const [name, prior] of compileEnvSnapshot) {
            if (prior === undefined) delete env[name]; else env[name] = prior;
          }
        };

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

        // Forward every compile-hook fallback as an SSE event in real time
        // so the dashboard surfaces degraded compiles instead of showing
        // a silent success. The underlying aggregator still records the
        // attempts + fallbacks for the /retry-stats ring buffer below.
        const baseCompileTelemetry = createCompilerTelemetry();
        const compileTelemetry: CompilerTelemetry = {
          recordAttempt: (hookName, attempts, fromFallback) =>
            baseCompileTelemetry.recordAttempt(hookName, attempts, fromFallback),
          recordFallback: (hookName, details) => {
            baseCompileTelemetry.recordFallback(hookName, details);
            res.write(`event: compile_validation_fallback\ndata: ${JSON.stringify({
              hookName,
              attempts: details.attempts,
              reason: details.reason,
              rawTextExcerpt: (details.rawText ?? '').slice(-500),
            })}\n\n`);
          },
          snapshot: () => baseCompileTelemetry.snapshot(),
        };

        let compiled;
        try {
          compiled = await runCompileScenario(scenarioJson, {
            provider,
            model,
            cache: true,
            seedText,
            seedUrl,
            webSearch: webSearch ?? true,
            maxSearches,
            telemetry: compileTelemetry,
            onProgress(hookName: string, status: string) {
              res.write(`event: progress\ndata: ${JSON.stringify({ hook: hookName, status })}\n\n`);
            },
          });
        } finally {
          restoreCompileEnv();
        }

        // Update the active scenario for GET /scenario
        activeScenario = compiled;
        memoryScenarios.set(compiled.id, compiled);
        customScenarioCatalog.set(compiled.id, { scenario: compiled, source: 'compiled' });

        // Snapshot compile telemetry into the ring buffer so /retry-stats
        // aggregates compile:* schemas alongside runtime schemas, and emit
        // the rollup as SSE so the dashboard can render per-hook attempts
        // and fallbacks immediately without polling the endpoint.
        const compileSnap = compileTelemetry.snapshot();
        if (Object.keys(compileSnap.schemaRetries).length > 0) {
          retryRing.push(compileSnap.schemaRetries as PerRunSchemaRetries);
          if (retryRing.length > RETRY_RING_MAX) {
            retryRing.splice(0, retryRing.length - RETRY_RING_MAX);
          }
          persistRetryRing();
        }
        const perHookMetrics: Record<string, { attempts: number; fromFallback: boolean }> = {};
        for (const [key, bucket] of Object.entries(compileSnap.schemaRetries)) {
          perHookMetrics[key.replace(/^compile:/, '')] = {
            attempts: bucket.attempts,
            fromFallback: bucket.fallbacks > 0,
          };
        }
        res.write(`event: compile_metrics\ndata: ${JSON.stringify({
          hooks: perHookMetrics,
          totalFallbacks: compileSnap.fallbacks.length,
        })}\n\n`);

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
      clearEventBuffer();
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
      // Hoist env-scoping helpers OUTSIDE the try so the catch can
      // still call restoreChatEnv. Without this, an exception thrown
      // between scopeChatKey() and the inner restore would leak the
      // caller's keys into subsequent requests.
      const chatEnvSnapshot: Array<[string, string | undefined]> = [];
      const restoreChatEnv = () => {
        for (const [name, prior] of chatEnvSnapshot) {
          if (prior === undefined) delete env[name]; else env[name] = prior;
        }
      };
      try {
        const { agentId, message, apiKey, anthropicKey } = JSON.parse(await readBody(req));
        if (!agentId || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'agentId and message required' }));
          return;
        }

        // Apply user-supplied keys to env for this request so the
        // downstream chat agent routes to the user's account when a
        // BYO key is present. Placeholder masks like 'sk-...' are
        // rejected so a displayed masked string never replaces a real key.
        const chatUserKey = !!(apiKey || anthropicKey);
        const scopeChatKey = (name: string, value: unknown) => {
          if (typeof value !== 'string' || !value || value.includes('...')) return;
          chatEnvSnapshot.push([name, env[name]]);
          env[name] = value;
        };
        scopeChatKey('OPENAI_API_KEY', apiKey);
        scopeChatKey('ANTHROPIC_API_KEY', anthropicKey);

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

        // The chat route builds agents from the event buffer. If the
        // buffer was lost (fresh boot with no persisted snapshot on disk,
        // or the user hit /clear) there is nothing to build from. Phrase
        // the error so users understand it is a server-side emptiness,
        // not "the run you just finished is gone forever".
        if (eventBuffer.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Server has no simulation in memory right now. Run a new simulation from the Settings tab, or reload this page so your saved events restore from cache.' }));
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
        restoreChatEnv();

        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          reply: result.text,
          colonist: profile.name,
          memorySeeded: memories.length,
          firstMessage: isNew,
        }));
      } catch (err) {
        // Restore env on error path too — mutations happened before
        // whatever threw. Without this, a failed chat call leaves the
        // caller's keys persisted in env for subsequent requests.
        try { restoreChatEnv(); } catch {}
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

    // Cross-run schema-retry aggregate for production reliability
    // telemetry. Reads the rotating ring of the last N completed runs
    // and rolls up calls/attempts/fallbacks per Zod schema so operators
    // can answer "is this model retrying too much on CommanderDecision?"
    // without scraping individual run results.
    //
    // Query params:
    //   ?limit=N — only aggregate the last N runs from the ring
    // Health endpoint — lightweight liveness + version check. Used by
    // monitors + CI/CD smoke tests to confirm the server came up cleanly
    // and which paracosm build is running. Cheap to hit: no LLM calls,
    // no ring-buffer iteration, just the current counters.
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        // Cloudflare sits in front; make sure a stale health snapshot
        // does not get cached at the edge and mislead monitors.
        'Cache-Control': 'no-store, max-age=0',
        ...corsHeaders,
      });
      res.end(
        JSON.stringify({
          status: 'ok',
          version: PARACOSM_VERSION,
          uptimeSeconds: Math.round(process.uptime()),
          runCount: retryRing.length,
        }),
      );
      return;
    }

    // ── Stored sessions: save / list / replay ───────────────────────
    //
    // Lets visitors replay a previously-saved demo via SSE instead of
    // triggering a fresh LLM-powered run. Save is gated by ADMIN_WRITE
    // (existing flag) — admin runs a good demo, hits POST /admin/sessions/save,
    // the in-memory event buffer (with per-event wall-clock timestamps)
    // gets written to SQLite. Public /sessions returns the metadata
    // listing; public /sessions/:id/replay streams the events back at
    // the original pacing (or accelerated via ?speed=N).

    if (req.url === '/admin/sessions/save' && req.method === 'POST') {
      if (!adminWrite) {
        res.writeHead(403, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ error: 'ADMIN_WRITE not enabled on this server' }));
        return;
      }
      if (!sessionStore) {
        res.writeHead(503, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ error: 'session store unavailable' }));
        return;
      }
      if (eventBuffer.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ error: 'no buffered events to save' }));
        return;
      }
      try {
        // Build the timestamped event array from the parallel buffers.
        // For events whose timestamp is 0 (rehydrated from disk pre-
        // timestamp-tracking), use the next known timestamp so replay
        // pacing stays monotonic instead of bunching at the start.
        const now = Date.now();
        const events: TimestampedEvent[] = eventBuffer.map((sse, i) => ({
          ts: eventTimestamps[i] || now,
          sse,
        }));
        const result = sessionStore.saveSession(events);
        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({
          ...result,
          eventCount: events.length,
          totalStored: sessionStore.count(),
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    if (req.url === '/sessions' && req.method === 'GET') {
      if (!sessionStore) {
        res.writeHead(503, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ error: 'session store unavailable' }));
        return;
      }
      try {
        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ sessions: sessionStore.listSessions() }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    if (req.url?.startsWith('/sessions/') && req.url.endsWith('/replay') && req.method === 'GET') {
      if (!sessionStore) {
        res.writeHead(503, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ error: 'session store unavailable' }));
        return;
      }
      const url = new URL(req.url, 'http://localhost');
      const id = url.pathname.replace(/^\/sessions\//, '').replace(/\/replay$/, '');
      const speedRaw = url.searchParams.get('speed');
      const speed = Math.max(0.25, Math.min(50, speedRaw ? parseFloat(speedRaw) || 1 : 1));
      const session = sessionStore.getSession(id);
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ error: 'session not found', id }));
        return;
      }
      // SSE stream: same headers as /events. Replays on the original
      // wall-clock pacing scaled by `speed` (1 = real-time, 4 = 4x
      // faster, 0.5 = half speed). Closes the response when done.
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        ...corsHeaders,
      });
      let cancelled = false;
      req.on('close', () => { cancelled = true; });
      void (async () => {
        let prevTs = session.events[0]?.ts ?? 0;
        for (const ev of session.events) {
          if (cancelled) return;
          const delay = Math.max(0, (ev.ts - prevTs) / speed);
          if (delay > 0) await new Promise(r => setTimeout(r, delay));
          prevTs = ev.ts;
          try {
            res.write(ev.sse);
          } catch {
            return;
          }
        }
        try { res.end(); } catch { /* socket already closed */ }
      })();
      return;
    }

    if (req.url?.startsWith('/retry-stats') && req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const limitRaw = url.searchParams.get('limit');
      const limit = limitRaw ? Math.max(1, Math.min(RETRY_RING_MAX, parseInt(limitRaw, 10) || RETRY_RING_MAX)) : undefined;
      const schemaWindow = limit ? retryRing.slice(-limit) : retryRing;
      const forgeWindow = limit ? forgeRing.slice(-limit) : forgeRing;
      const cacheWindow = limit ? cacheRing.slice(-limit) : cacheRing;
      const providerErrorWindow = limit ? providerErrorRing.slice(-limit) : providerErrorRing;
      const schemaAgg = aggregateSchemaRetries(schemaWindow);
      const forgeAgg = aggregateForgeStats(forgeWindow);
      const cacheAgg = aggregateCacheStats(cacheWindow);
      const providerErrorAgg = aggregateProviderErrors(providerErrorWindow);
      res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
      res.end(JSON.stringify({
        ...schemaAgg,
        forges: forgeAgg,
        caches: cacheAgg,
        providerErrors: providerErrorAgg,
      }));
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
        const isHostedDemo = serverMode === 'hosted_demo';
        if (!hasUserKeys && isHostedDemo) {
          simConfig = applyDemoCaps(simConfig);
          console.log(
            `  [demo-mode] Capped run: turns=${simConfig.turns} pop=${simConfig.initialPopulation} ` +
            `depts=${simConfig.activeDepartments.length} models=${simConfig.models.commander}`,
          );
        }

        const runRecord = createRunRecord({
          scenarioId: activeScenario.id,
          scenarioVersion: activeScenario.version,
          leaderConfigHash: hashLeaderConfig({
            leaders: simConfig.leaders,
            turns: simConfig.turns,
            seed: simConfig.seed,
          }),
          economicsProfile: simConfig.economics.id,
          sourceMode: serverMode,
          createdBy: hasUserKeys ? 'user' : 'anonymous',
        });
        try {
          await runHistoryStore.insertRun(runRecord);
        } catch (error) {
          console.warn('[run-history] insert failed:', error);
        }

        // Key-scope safety: snapshot the env values we're about to mutate
        // so we can restore them when THIS sim ends. Without this, user A's
        // key persists in process.env after their sim completes; user B's
        // subsequent sim then silently uses A's key if B didn't provide one.
        // The restore runs in the startWithConfig().finally() below.
        const envKeysToRestore: Array<[string, string | undefined]> = [];
        const scopeKey = (envName: string, userValue: string | undefined) => {
          if (!userValue || userValue.includes('...')) return;
          envKeysToRestore.push([envName, env[envName]]);
          env[envName] = userValue;
        };
        scopeKey('OPENAI_API_KEY', simConfig.apiKey);
        scopeKey('ANTHROPIC_API_KEY', simConfig.anthropicKey);
        scopeKey('SERPER_API_KEY', simConfig.serperKey);
        scopeKey('FIRECRAWL_API_KEY', simConfig.firecrawlKey);
        scopeKey('TAVILY_API_KEY', simConfig.tavilyKey);
        scopeKey('COHERE_API_KEY', simConfig.cohereKey);
        const restoreEnv = () => {
          for (const [name, prior] of envKeysToRestore) {
            if (prior === undefined) delete env[name];
            else env[name] = prior;
          }
        };

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

        // Broadcast the scenario about to run BEFORE kicking off the
        // simulation. Closes the loop on "I uploaded Mercury JSON but
        // the run looked like Mars" — the dashboard can render a
        // prominent 'Running: Mars Genesis' banner so the user sees
        // immediately which scenario is active vs what's in their
        // editor.
        broadcast('active_scenario', {
          id: activeScenario.id,
          name: activeScenario.labels?.name ?? activeScenario.id,
          settlementNoun: activeScenario.labels?.settlementNoun,
          populationNoun: activeScenario.labels?.populationNoun,
          departments: activeScenario.departments?.length ?? 0,
        });
        console.log(`  Running scenario: "${activeScenario.labels?.name ?? activeScenario.id}" (${activeScenario.id})`);

        // Start the sim and restore env when it finishes — prevents the
        // caller's keys from leaking into any subsequent /setup from a
        // different user that doesn't pass their own keys.
        marsServer.startWithConfig(simConfig).finally(restoreEnv);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          redirect: '/sim',
          scenarioId: activeScenario.id,
          scenarioName: activeScenario.labels?.name,
          run: {
            id: runRecord.runId,
            sourceMode: runRecord.sourceMode,
            economicsProfile: runRecord.economicsProfile,
          },
        }));
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
      clearEventBuffer();
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
        // Thread the currently-active scenario through to the pair
        // runner. Without this the runner defaults to Mars regardless
        // of which scenario the user compiled — the page title would
        // show the custom name but the simulation would run Mars
        // hooks + content.
        await startSimulations(config, broadcast, controller.signal, activeScenario);
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
