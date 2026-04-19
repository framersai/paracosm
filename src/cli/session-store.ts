/**
 * @fileoverview Persistent storage for completed simulation runs.
 *
 * Captures the SSE event stream of a finished sim into SQLite so visitors
 * to the hosted demo can replay a saved session at original pacing
 * instead of triggering a fresh LLM-powered run. Bounded ring of N most
 * recent saves (oldest evicted) keeps the file size predictable.
 *
 * Single-table schema with the event array stored as a JSON blob — for
 * a ring of 10 saved runs the row count is trivial and full-row reads
 * dominate access patterns. Splitting events into a per-event table
 * would add JOIN cost without any query that benefits.
 *
 * @module paracosm/cli/session-store
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/** Default ring size — pinned to the spec's "last 10 or so". */
export const DEFAULT_MAX_SESSIONS = 10;

/** A single SSE event captured at broadcast time. */
export interface TimestampedEvent {
  /** Wall-clock ms when the event was emitted. Used for replay pacing. */
  ts: number;
  /** Pre-formatted SSE message (`event: ...\ndata: ...\n\n`). */
  sse: string;
}

/**
 * Public metadata for a stored session — what `/sessions` returns to
 * the dashboard so users can pick which run to replay. Excludes the
 * events blob to keep the listing payload light.
 */
export interface SessionMeta {
  id: string;
  /** Wall-clock ms when the save endpoint was hit. */
  createdAt: number;
  scenarioId?: string;
  scenarioName?: string;
  leaderA?: string;
  leaderB?: string;
  /** Number of turns the run completed before being saved. */
  turnCount?: number;
  /** Number of SSE events captured. */
  eventCount: number;
  /** Wall-clock ms between the first and last event (sim duration). */
  durationMs?: number;
  /** Total cost in USD reported by the run's cost tracker, when available. */
  totalCostUSD?: number;
}

/** A full session record, including the event payload for replay. */
export interface StoredSession {
  meta: SessionMeta;
  events: TimestampedEvent[];
}

/** Optional metadata override accepted by `saveSession`. */
export interface SessionMetaOverride {
  scenarioId?: string;
  scenarioName?: string;
  leaderA?: string;
  leaderB?: string;
  turnCount?: number;
  totalCostUSD?: number;
}

/**
 * Lightweight session-store handle returned by {@link openSessionStore}.
 * Methods are synchronous because better-sqlite3 is synchronous and
 * paracosm's server is single-threaded — async coloring would buy
 * nothing and add boilerplate at every call site.
 */
export interface SessionStore {
  /**
   * Persist a finished sim. Generates a UUID, computes derived metadata
   * from the event stream, inserts, and evicts the oldest row when the
   * row count exceeds `maxSessions`.
   *
   * Returns the new session's id and (when applicable) the id of the
   * row evicted to make room. Caller can log or surface the eviction.
   */
  saveSession(events: TimestampedEvent[], override?: SessionMetaOverride): {
    id: string;
    evictedId?: string;
  };
  /** Returns metadata for every stored session, newest first. */
  listSessions(): SessionMeta[];
  /** Loads one session in full. Returns `null` when the id is unknown. */
  getSession(id: string): StoredSession | null;
  /** Number of currently stored sessions. Useful for tests + smoke checks. */
  count(): number;
  /** Releases the database handle. */
  close(): void;
}

/**
 * Open or create the session-store database at `dbPath`.
 *
 * Creates the parent directory when missing so the first call after
 * a fresh deploy doesn't crash on a missing `data/` folder. The
 * single-table schema is created idempotently via CREATE TABLE IF NOT
 * EXISTS, so subsequent reopens are no-ops.
 *
 * @param dbPath Filesystem path to the SQLite database file. Use
 *   `':memory:'` in tests for an isolated in-process DB.
 * @param maxSessions Maximum rows to retain. Defaults to 10. Older
 *   sessions are evicted on save.
 */
export function openSessionStore(dbPath: string, maxSessions: number = DEFAULT_MAX_SESSIONS): SessionStore {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      createdAt INTEGER NOT NULL,
      scenarioId TEXT,
      scenarioName TEXT,
      leaderA TEXT,
      leaderB TEXT,
      turnCount INTEGER,
      eventCount INTEGER NOT NULL,
      durationMs INTEGER,
      totalCostUSD REAL,
      events TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_createdAt ON sessions(createdAt);
  `);

  const insertStmt = db.prepare(`
    INSERT INTO sessions
      (id, createdAt, scenarioId, scenarioName, leaderA, leaderB, turnCount, eventCount, durationMs, totalCostUSD, events)
    VALUES
      (@id, @createdAt, @scenarioId, @scenarioName, @leaderA, @leaderB, @turnCount, @eventCount, @durationMs, @totalCostUSD, @events)
  `);
  const oldestStmt = db.prepare<unknown[], { id: string }>(
    'SELECT id FROM sessions ORDER BY createdAt ASC LIMIT 1',
  );
  const deleteStmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  const countStmt = db.prepare<unknown[], { c: number }>('SELECT COUNT(*) AS c FROM sessions');
  const listStmt = db.prepare<unknown[], SessionMetaRow>(
    `SELECT id, createdAt, scenarioId, scenarioName, leaderA, leaderB, turnCount, eventCount, durationMs, totalCostUSD
     FROM sessions ORDER BY createdAt DESC`,
  );
  const getStmt = db.prepare<[string], SessionRow>('SELECT * FROM sessions WHERE id = ?');

  return {
    saveSession(events, override) {
      const id = randomUUID();
      const createdAt = Date.now();
      const derived = deriveMetadata(events);
      const eventCount = events.length;
      const durationMs = events.length >= 2
        ? events[events.length - 1].ts - events[0].ts
        : 0;

      insertStmt.run({
        id,
        createdAt,
        scenarioId: override?.scenarioId ?? derived.scenarioId ?? null,
        scenarioName: override?.scenarioName ?? derived.scenarioName ?? null,
        leaderA: override?.leaderA ?? derived.leaderA ?? null,
        leaderB: override?.leaderB ?? derived.leaderB ?? null,
        turnCount: override?.turnCount ?? derived.turnCount ?? null,
        eventCount,
        durationMs,
        totalCostUSD: override?.totalCostUSD ?? derived.totalCostUSD ?? null,
        events: JSON.stringify(events),
      });

      let evictedId: string | undefined;
      const totalRows = countStmt.get()?.c ?? 0;
      if (totalRows > maxSessions) {
        const oldest = oldestStmt.get();
        if (oldest) {
          deleteStmt.run(oldest.id);
          evictedId = oldest.id;
        }
      }

      return evictedId === undefined ? { id } : { id, evictedId };
    },

    listSessions() {
      return listStmt.all().map(rowToMeta);
    },

    getSession(id) {
      const row = getStmt.get(id);
      if (!row) return null;
      const events = JSON.parse(row.events) as TimestampedEvent[];
      return { meta: rowToMeta(row), events };
    },

    count() {
      return countStmt.get()?.c ?? 0;
    },

    close() {
      db.close();
    },
  };
}

/** Internal row shape — narrow `unknown` to the columns we select. */
interface SessionMetaRow {
  id: string;
  createdAt: number;
  scenarioId: string | null;
  scenarioName: string | null;
  leaderA: string | null;
  leaderB: string | null;
  turnCount: number | null;
  eventCount: number;
  durationMs: number | null;
  totalCostUSD: number | null;
}

interface SessionRow extends SessionMetaRow {
  events: string;
}

function rowToMeta(row: SessionMetaRow): SessionMeta {
  const meta: SessionMeta = {
    id: row.id,
    createdAt: row.createdAt,
    eventCount: row.eventCount,
  };
  if (row.scenarioId) meta.scenarioId = row.scenarioId;
  if (row.scenarioName) meta.scenarioName = row.scenarioName;
  if (row.leaderA) meta.leaderA = row.leaderA;
  if (row.leaderB) meta.leaderB = row.leaderB;
  if (row.turnCount != null) meta.turnCount = row.turnCount;
  if (row.durationMs != null) meta.durationMs = row.durationMs;
  if (row.totalCostUSD != null) meta.totalCostUSD = row.totalCostUSD;
  return meta;
}

/**
 * Pull common metadata fields out of the raw event stream.
 *
 * The orchestrator emits `active_scenario` near the start of every run
 * with `{ name, id, ... }`, and `complete` at the end with
 * `{ totalCostUSD, ... }` on its cost payload. Leader names appear in
 * the `setup` event. We extract these by scanning the SSE blobs once
 * so the metadata in the listing endpoint is rich enough to pick a
 * session without having to load it.
 */
function deriveMetadata(events: TimestampedEvent[]): SessionMetaOverride {
  const out: SessionMetaOverride = {};
  let maxCostSeen = 0;
  for (const { sse } of events) {
    const lines = sse.split('\n');
    if (lines.length < 2) continue;
    const eventType = lines[0]?.replace(/^event:\s*/, '').trim();
    const dataLine = lines[1]?.replace(/^data:\s*/, '');
    if (!eventType || !dataLine) continue;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(dataLine);
    } catch {
      continue;
    }
    // The orchestrator wraps every engine-emitted event in
    // `broadcast('sim', {type: <realType>, ...})`. So we treat the
    // nested `type` as the authoritative event kind for sim frames,
    // and otherwise fall back to the SSE event name.
    const innerType = eventType === 'sim' && typeof data.type === 'string'
      ? data.type
      : eventType;
    if (eventType === 'active_scenario') {
      if (typeof data.id === 'string') out.scenarioId = data.id;
      if (typeof data.name === 'string') out.scenarioName = data.name;
    }
    // Two paths to the leader roster:
    //   1. Legacy SSE `event: setup` frames (kept so callers that
    //      pre-wrap-style feed events — including the test suite — keep
    //      working).
    //   2. Live prod path: pair-runner emits `event: status` with
    //      `phase: 'parallel'` at launch carrying the leaders array.
    //      The engine never actually fires an SSE `setup` event.
    if (eventType === 'setup') {
      const leaderA = (data as { leaderA?: { name?: string } }).leaderA?.name;
      const leaderB = (data as { leaderB?: { name?: string } }).leaderB?.name;
      if (typeof leaderA === 'string') out.leaderA = leaderA;
      if (typeof leaderB === 'string') out.leaderB = leaderB;
    }
    if (eventType === 'status' && data.phase === 'parallel') {
      const leaders = Array.isArray((data as { leaders?: unknown[] }).leaders)
        ? (data as { leaders: Array<{ name?: string }> }).leaders
        : [];
      if (typeof leaders[0]?.name === 'string') out.leaderA = leaders[0].name;
      if (typeof leaders[1]?.name === 'string') out.leaderB = leaders[1].name;
    }
    // Count the highest `turn` observed. innerType covers both the
    // wrapped prod shape (`event: sim` + data.type=turn_done) and the
    // unwrapped legacy shape (`event: turn_done`) via the fallback
    // above.
    if (innerType === 'turn_done') {
      const turn = (data as { turn?: number }).turn;
      if (typeof turn === 'number' && turn > (out.turnCount ?? 0)) {
        out.turnCount = turn;
      }
    }
    // Every sim event carries a cumulative `_cost` payload; `complete`
    // sometimes also carries a top-level `cost`. Track the highest
    // totalCostUSD observed across either so the metadata reflects the
    // full run cost even when the terminal `complete` itself omits it.
    const costCarrier = data as { _cost?: { totalCostUSD?: number }; cost?: { totalCostUSD?: number } };
    const seenCost = costCarrier._cost?.totalCostUSD ?? costCarrier.cost?.totalCostUSD;
    if (typeof seenCost === 'number' && seenCost > maxCostSeen) {
      maxCostSeen = seenCost;
    }
  }
  if (maxCostSeen > 0) out.totalCostUSD = maxCostSeen;
  return out;
}
