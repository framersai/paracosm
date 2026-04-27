/**
 * SQLite-backed implementation of {@link RunHistoryStore}. Mirrors the
 * session-store pattern: better-sqlite3, WAL mode, prepared statements,
 * `:memory:` path support for clean test isolation.
 *
 * Single `runs` table with composite per-filter indexes. Run records are
 * tiny (~200 bytes); 100K rows fits in 20 MB. No retention cap; add
 * `PARACOSM_RUN_HISTORY_MAX_ROWS` env var if traffic ever warrants it.
 *
 * @module paracosm/cli/server/sqlite-run-history-store
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RunRecord } from './run-record.js';
import type { ListRunsFilters, RunHistoryStore, RunsAggregate } from './run-history-store.js';

export interface SqliteRunHistoryStoreOptions {
  dbPath: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function clampLimit(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(raw));
}

function clampOffset(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
}

interface RunRow {
  run_id: string;
  created_at: string;
  scenario_id: string;
  scenario_version: string;
  actor_config_hash: string;
  economics_profile: string;
  source_mode: string;
  created_by: string;
  artifact_path: string | null;
  cost_usd: number | null;
  duration_ms: number | null;
  mode: string | null;
  actor_name: string | null;
  actor_archetype: string | null;
  bundle_id: string | null;
  summary_trajectory: string | null;
  replay_attempts: number | null;
  replay_matches: number | null;
}

function rowToRecord(row: RunRow): RunRecord {
  // Omit undefined optional fields so deepEqual against records constructed
  // without those fields succeeds. Spread only when value is non-null.
  const record: RunRecord = {
    runId: row.run_id,
    createdAt: row.created_at,
    scenarioId: row.scenario_id,
    scenarioVersion: row.scenario_version,
    actorConfigHash: row.actor_config_hash,
    economicsProfile: row.economics_profile,
    sourceMode: row.source_mode as RunRecord['sourceMode'],
    createdBy: row.created_by as RunRecord['createdBy'],
  };
  if (row.artifact_path !== null) record.artifactPath = row.artifact_path;
  if (row.cost_usd !== null) record.costUSD = row.cost_usd;
  if (row.duration_ms !== null) record.durationMs = row.duration_ms;
  if (row.mode !== null) record.mode = row.mode as RunRecord['mode'];
  if (row.actor_name !== null) record.actorName = row.actor_name;
  if (row.actor_archetype !== null) record.actorArchetype = row.actor_archetype;
  if (row.bundle_id !== null) record.bundleId = row.bundle_id;
  if (row.summary_trajectory !== null) {
    try {
      const parsed = JSON.parse(row.summary_trajectory) as unknown;
      if (Array.isArray(parsed) && parsed.every(n => typeof n === 'number')) {
        record.summaryTrajectory = parsed;
      }
    } catch {
      // Corrupt JSON in older row -- skip; cell renders without sparkline.
    }
  }
  return record;
}

/**
 * v0.7 -> v0.8 in-place migration. The leader -> actor rename in 0.8.0
 * renamed three columns; legacy production databases still have the
 * old names and would crash boot when `db.prepare(INSERT ... actor_*)`
 * tries to bind those columns. Rename each in place if the legacy
 * column is present and the new column is absent. ALTER TABLE RENAME
 * COLUMN is supported on SQLite >= 3.25 (Node better-sqlite3 ships
 * 3.45+), so this is safe.
 */
function migrateLeaderColumnsToActor(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(runs)`).all() as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));
  const renames: ReadonlyArray<readonly [string, string]> = [
    ['leader_config_hash', 'actor_config_hash'],
    ['leader_name', 'actor_name'],
    ['leader_archetype', 'actor_archetype'],
  ];
  for (const [legacy, modern] of renames) {
    if (colNames.has(legacy) && !colNames.has(modern)) {
      db.exec(`ALTER TABLE runs RENAME COLUMN ${legacy} TO ${modern};`);
    }
  }
  // Drop the legacy index name if it lingered after the rename;
  // `idx_runs_leader_created` referenced the renamed column and would
  // have been auto-rewritten, but leaving the legacy name around is
  // confusing and the new index gets created by the bootstrap below.
  try {
    db.exec(`DROP INDEX IF EXISTS idx_runs_leader_created;`);
  } catch (err) {
    void err;
  }
}

/**
 * Idempotent column-add migration. SQLite raises "duplicate column name"
 * when the column already exists; we swallow that and propagate any other
 * error. Called from the schema bootstrap on every store creation; safe
 * to run repeatedly.
 */
function ensureRunsColumns(db: Database.Database): void {
  const newCols: ReadonlyArray<readonly [string, string]> = [
    ['artifact_path', 'TEXT'],
    ['cost_usd', 'REAL'],
    ['duration_ms', 'INTEGER'],
    ['mode', 'TEXT'],
    ['actor_name', 'TEXT'],
    ['actor_archetype', 'TEXT'],
    ['replay_attempts', 'INTEGER DEFAULT 0'],
    ['replay_matches', 'INTEGER DEFAULT 0'],
    ['bundle_id', 'TEXT'],
    ['summary_trajectory', 'TEXT'],
  ];
  for (const [name, type] of newCols) {
    try {
      db.exec(`ALTER TABLE runs ADD COLUMN ${name} ${type};`);
    } catch (err) {
      const msg = String((err as Error).message ?? err);
      if (!msg.includes('duplicate column name')) throw err;
    }
  }
}

export function createSqliteRunHistoryStore(options: SqliteRunHistoryStoreOptions): RunHistoryStore {
  const { dbPath } = options;
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      run_id              TEXT PRIMARY KEY NOT NULL,
      created_at          TEXT NOT NULL,
      scenario_id         TEXT NOT NULL,
      scenario_version    TEXT NOT NULL,
      actor_config_hash  TEXT NOT NULL,
      economics_profile   TEXT NOT NULL,
      source_mode         TEXT NOT NULL,
      created_by          TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runs_created_at        ON runs (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_runs_scenario_created  ON runs (scenario_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_runs_mode_created      ON runs (source_mode, created_at DESC);
  `);
  // 0.8.0 leader -> actor column rename. Must run BEFORE the prepared
  // INSERT below; better-sqlite3 throws on prepare() when it references
  // a missing column, which would crash server boot on legacy DBs.
  migrateLeaderColumnsToActor(db);
  ensureRunsColumns(db);
  // Index over actor_config_hash sits after ensureRunsColumns so legacy
  // databases that pre-date the leader -> actor rename get the column
  // added (or the column-missing error surfaced) before the index
  // creation references it. Mirrors the idx_runs_sim_mode_created
  // pattern below.
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_runs_actor_created ON runs (actor_config_hash, created_at DESC);`);
  } catch (err) {
    console.warn('[sqlite] idx_runs_actor_created skipped:', err);
  }
  // Index for filtering by simulation mode (Library tab).
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_runs_sim_mode_created ON runs (mode, created_at DESC);`);
  } catch (err) {
    // Index creation may fail if mode column was just added; ignore.
    void err;
  }
  // Index for the Compare view's bundle lookup.
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_runs_bundle_created ON runs (bundle_id, created_at ASC);`);
  } catch (err) {
    void err;
  }

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO runs
      (run_id, created_at, scenario_id, scenario_version, actor_config_hash,
       economics_profile, source_mode, created_by,
       artifact_path, cost_usd, duration_ms, mode, actor_name, actor_archetype,
       bundle_id, summary_trajectory)
    VALUES
      (@runId, @createdAt, @scenarioId, @scenarioVersion, @actorConfigHash,
       @economicsProfile, @sourceMode, @createdBy,
       @artifactPath, @costUSD, @durationMs, @mode, @actorName, @actorArchetype,
       @bundleId, @summaryTrajectory)
  `);

  function insertRowParams(run: RunRecord) {
    return {
      runId: run.runId,
      createdAt: run.createdAt,
      scenarioId: run.scenarioId,
      scenarioVersion: run.scenarioVersion,
      actorConfigHash: run.actorConfigHash,
      economicsProfile: run.economicsProfile,
      sourceMode: run.sourceMode,
      createdBy: run.createdBy,
      artifactPath: run.artifactPath ?? null,
      costUSD: run.costUSD ?? null,
      durationMs: run.durationMs ?? null,
      mode: run.mode ?? null,
      actorName: run.actorName ?? null,
      actorArchetype: run.actorArchetype ?? null,
      bundleId: run.bundleId ?? null,
      summaryTrajectory: run.summaryTrajectory ? JSON.stringify(run.summaryTrajectory) : null,
    };
  }

  const getStmt = db.prepare<unknown[], RunRow>(`SELECT * FROM runs WHERE run_id = ?`);

  function buildWhere(filters: ListRunsFilters | undefined): { where: string; params: Record<string, string> } {
    const clauses: string[] = [];
    const params: Record<string, string> = {};
    // Simulation mode filter (artifact.metadata.mode column).
    if (filters?.mode) {
      clauses.push('mode = @mode');
      params.mode = filters.mode;
    }
    // Server source mode filter (source_mode column). Distinct from above.
    if (filters?.sourceMode) {
      clauses.push('source_mode = @sourceMode');
      params.sourceMode = filters.sourceMode;
    }
    if (filters?.scenarioId) {
      clauses.push('scenario_id = @scenarioId');
      params.scenarioId = filters.scenarioId;
    }
    if (filters?.actorConfigHash) {
      clauses.push('actor_config_hash = @actorConfigHash');
      params.actorConfigHash = filters.actorConfigHash;
    }
    if (filters?.q) {
      clauses.push('(scenario_id LIKE @q OR actor_name LIKE @q OR actor_archetype LIKE @q)');
      params.q = `%${filters.q}%`;
    }
    if (filters?.bundleId) {
      clauses.push('bundle_id = @bundleId');
      params.bundleId = filters.bundleId;
    }
    return {
      where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
      params,
    };
  }

  return {
    async insertRun(run: RunRecord): Promise<void> {
      insertStmt.run(insertRowParams(run));
    },

    async listRuns(filters?: ListRunsFilters): Promise<RunRecord[]> {
      const { where, params } = buildWhere(filters);
      const limit = clampLimit(filters?.limit);
      const offset = clampOffset(filters?.offset);
      const sql = `SELECT * FROM runs ${where} ORDER BY created_at DESC LIMIT @__limit OFFSET @__offset`;
      const rows = db
        .prepare<unknown[], RunRow>(sql)
        .all({ ...params, __limit: limit, __offset: offset });
      return rows.map(rowToRecord);
    },

    async getRun(runId: string): Promise<RunRecord | null> {
      const row = getStmt.get(runId);
      return row ? rowToRecord(row) : null;
    },

    async listRunsByBundleId(bundleId: string): Promise<RunRecord[]> {
      const rows = db
        .prepare<unknown[], RunRow>(`SELECT * FROM runs WHERE bundle_id = ? ORDER BY created_at ASC`)
        .all(bundleId);
      return rows.map(rowToRecord);
    },

    async countRuns(filters?: Pick<ListRunsFilters, 'mode' | 'sourceMode' | 'scenarioId' | 'actorConfigHash' | 'q'>): Promise<number> {
      const { where, params } = buildWhere(filters);
      const sql = `SELECT COUNT(*) AS n FROM runs ${where}`;
      const row = db.prepare<unknown[], { n: number }>(sql).get(params);
      return row?.n ?? 0;
    },

    async aggregateStats(filters?: Pick<ListRunsFilters, 'mode' | 'sourceMode' | 'scenarioId' | 'actorConfigHash'>): Promise<RunsAggregate> {
      const { where, params } = buildWhere(filters);
      const sql = `
        SELECT
          COUNT(*)                         AS total_runs,
          COALESCE(SUM(cost_usd), 0)       AS total_cost_usd,
          COALESCE(SUM(duration_ms), 0)    AS total_duration_ms,
          COALESCE(SUM(replay_attempts), 0) AS replays_attempted,
          COALESCE(SUM(replay_matches), 0)  AS replays_matched
        FROM runs ${where}
      `;
      const row = db.prepare<unknown[], {
        total_runs: number;
        total_cost_usd: number;
        total_duration_ms: number;
        replays_attempted: number;
        replays_matched: number;
      }>(sql).get(params);
      return {
        totalRuns: Number(row?.total_runs ?? 0),
        totalCostUSD: Number(row?.total_cost_usd ?? 0),
        totalDurationMs: Number(row?.total_duration_ms ?? 0),
        replaysAttempted: Number(row?.replays_attempted ?? 0),
        replaysMatched: Number(row?.replays_matched ?? 0),
      };
    },

    async recordReplayResult(runId: string, matches: boolean): Promise<void> {
      db.prepare(`
        UPDATE runs
        SET replay_attempts = COALESCE(replay_attempts, 0) + 1,
            replay_matches  = COALESCE(replay_matches, 0) + ?
        WHERE run_id = ?
      `).run(matches ? 1 : 0, runId);
    },
  };
}
