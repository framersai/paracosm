import type { RunRecord } from './run-record.js';
import type { ParacosmServerMode } from './server-mode.js';

export interface ListRunsFilters {
  /** Filter by simulation mode (artifact.metadata.mode). For server-mode
   *  filtering use {@link sourceMode} instead. */
  mode?: 'turn-loop' | 'batch-trajectory' | 'batch-point';
  /** Filter by server mode (source_mode column). Distinct from the
   *  simulation mode above; renamed from the previous `mode` field to
   *  free up that name for the more user-relevant simulation mode. */
  sourceMode?: ParacosmServerMode;
  scenarioId?: string;
  leaderConfigHash?: string;
  /** Free-text search across scenario, leader name, leader archetype. */
  q?: string;
  limit?: number;
  offset?: number;
}

export interface RunsAggregate {
  totalRuns: number;
  totalCostUSD: number;
  totalDurationMs: number;
  replaysAttempted: number;
  replaysMatched: number;
}

export interface RunHistoryStore {
  insertRun(run: RunRecord): Promise<void>;
  listRuns(filters?: ListRunsFilters): Promise<RunRecord[]>;
  getRun(runId: string): Promise<RunRecord | null>;
  countRuns?(filters?: Pick<ListRunsFilters, 'mode' | 'sourceMode' | 'scenarioId' | 'leaderConfigHash' | 'q'>): Promise<number>;
  aggregateStats?(filters?: Pick<ListRunsFilters, 'mode' | 'sourceMode' | 'scenarioId' | 'leaderConfigHash'>): Promise<RunsAggregate>;
  recordReplayResult?(runId: string, matches: boolean): Promise<void>;
}

export function createNoopRunHistoryStore(): RunHistoryStore {
  return {
    async insertRun() {},
    async listRuns() { return []; },
    async getRun() { return null; },
    async countRuns() { return 0; },
    async aggregateStats() {
      return { totalRuns: 0, totalCostUSD: 0, totalDurationMs: 0, replaysAttempted: 0, replaysMatched: 0 };
    },
    async recordReplayResult() {},
  };
}
