import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ListRunsFilters, RunHistoryStore } from '../run-history-store.js';
import type { ParacosmServerMode } from '../server-mode.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function clampLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(n));
}

function clampOffset(raw: string | null): number {
  if (raw === null) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export async function handlePlatformApiRoute(
  mode: ParacosmServerMode,
  req: IncomingMessage,
  res: ServerResponse,
  options: {
    runHistoryStore: RunHistoryStore;
    corsHeaders: Record<string, string>;
  },
): Promise<boolean> {
  const url = req.url ? new URL(req.url, 'http://localhost') : null;
  if (!url || !url.pathname.startsWith('/api/v1/')) return false;
  if (url.pathname === '/api/v1/demo/status') return false;

  if (mode !== 'platform_api') {
    res.writeHead(403, {
      'Content-Type': 'application/json',
      ...options.corsHeaders,
    });
    res.end(JSON.stringify({ error: 'platform_api_only', mode }));
    return true;
  }

  try {
    if (url.pathname === '/api/v1/runs' && req.method === 'GET') {
      const modeParam = url.searchParams.get('mode');
      const sourceModeParam = url.searchParams.get('sourceMode');
      const filters: ListRunsFilters = {
        mode: (modeParam === 'turn-loop' || modeParam === 'batch-trajectory' || modeParam === 'batch-point')
          ? modeParam
          : undefined,
        sourceMode: sourceModeParam ? (sourceModeParam as ParacosmServerMode) : undefined,
        scenarioId: url.searchParams.get('scenario') ?? undefined,
        leaderConfigHash: url.searchParams.get('leader') ?? undefined,
        q: url.searchParams.get('q') ?? undefined,
        limit: clampLimit(url.searchParams.get('limit')),
        offset: clampOffset(url.searchParams.get('offset')),
      };
      const runs = await options.runHistoryStore.listRuns(filters);
      const countFilters = {
        mode: filters.mode,
        sourceMode: filters.sourceMode,
        scenarioId: filters.scenarioId,
        leaderConfigHash: filters.leaderConfigHash,
        q: filters.q,
      };
      const total = options.runHistoryStore.countRuns
        ? await options.runHistoryStore.countRuns(countFilters)
        : runs.length;
      const hasMore = (filters.offset ?? 0) + runs.length < total;
      res.writeHead(200, {
        'Content-Type': 'application/json',
        ...options.corsHeaders,
      });
      res.end(JSON.stringify({ runs, total, hasMore }));
      return true;
    }
  } catch (error) {
    res.writeHead(500, {
      'Content-Type': 'application/json',
      ...options.corsHeaders,
    });
    res.end(JSON.stringify({ error: String(error) }));
    return true;
  }

  res.writeHead(404, {
    'Content-Type': 'application/json',
    ...options.corsHeaders,
  });
  res.end(JSON.stringify({ error: 'unknown_platform_route', path: url.pathname }));
  return true;
}
