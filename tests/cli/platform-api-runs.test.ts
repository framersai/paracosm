import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handlePlatformApiRoute } from '../../src/cli/server/routes/platform-api.js';
import { createSqliteRunHistoryStore } from '../../src/cli/server/sqlite-run-history-store.js';
import type { RunRecord } from '../../src/cli/server/run-record.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    runId: `run_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    scenarioId: 'mars-genesis',
    scenarioVersion: '0.4.88',
    leaderConfigHash: 'leaders:abc',
    economicsProfile: 'balanced',
    sourceMode: 'local_demo',
    createdBy: 'anonymous',
    ...overrides,
  };
}

interface CapturedResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

function makeRes(captured: CapturedResponse): ServerResponse {
  const res = {
    writeHead(code: number, hdrs: Record<string, string>) {
      captured.statusCode = code;
      captured.headers = hdrs;
    },
    end(payload?: string) {
      captured.body = payload ?? '';
    },
  } as unknown as ServerResponse;
  return res;
}

function makeReq(url: string, method: string = 'GET', body?: string): IncomingMessage {
  if (body) {
    const reqLike = {
      url,
      method,
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(body, 'utf-8');
      },
    } as unknown as IncomingMessage;
    return reqLike;
  }
  return { url, method } as IncomingMessage;
}

const ENABLED = { paracosmRoutesEnabled: true };

test('GET /api/v1/runs returns { runs, total, hasMore } envelope', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  await store.insertRun(makeRun({ runId: 'r1', createdAt: '2026-04-24T10:00:00Z' }));
  await store.insertRun(makeRun({ runId: 'r2', createdAt: '2026-04-24T11:00:00Z' }));
  const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  const handled = await handlePlatformApiRoute(
    makeReq('/api/v1/runs'),
    makeRes(captured),
    { runHistoryStore: store, corsHeaders: {}, ...ENABLED },
  );
  assert.equal(handled, true);
  assert.equal(captured.statusCode, 200);
  const parsed = JSON.parse(captured.body);
  assert.equal(parsed.runs.length, 2);
  assert.equal(parsed.total, 2);
  assert.equal(parsed.hasMore, false);
});

test('GET /api/v1/runs respects scenario + sourceMode + leader query params', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  await store.insertRun(makeRun({ runId: 'match', scenarioId: 'mars-genesis', sourceMode: 'platform_api', leaderConfigHash: 'leaders:abc' }));
  await store.insertRun(makeRun({ runId: 'wrong', scenarioId: 'lunar-outpost', sourceMode: 'platform_api', leaderConfigHash: 'leaders:abc' }));
  const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  await handlePlatformApiRoute(
    makeReq('/api/v1/runs?scenario=mars-genesis&sourceMode=platform_api&leader=leaders%3Aabc'),
    makeRes(captured),
    { runHistoryStore: store, corsHeaders: {}, ...ENABLED },
  );
  const parsed = JSON.parse(captured.body);
  assert.equal(parsed.runs.length, 1);
  assert.equal(parsed.runs[0].runId, 'match');
  assert.equal(parsed.total, 1);
});

test('GET /api/v1/runs filters by simulation mode (?mode=)', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  await store.insertRun(makeRun({ runId: 'turn-loop-run', mode: 'turn-loop' }));
  await store.insertRun(makeRun({ runId: 'batch-run', mode: 'batch-trajectory' }));
  const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  await handlePlatformApiRoute(
    makeReq('/api/v1/runs?mode=batch-trajectory'),
    makeRes(captured),
    { runHistoryStore: store, corsHeaders: {}, ...ENABLED },
  );
  const parsed = JSON.parse(captured.body);
  assert.equal(parsed.runs.length, 1);
  assert.equal(parsed.runs[0].runId, 'batch-run');
});

test('GET /api/v1/runs paginates with limit + offset', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  for (let i = 0; i < 10; i++) {
    await store.insertRun(makeRun({ runId: `r${i.toString().padStart(2, '0')}`, createdAt: `2026-04-24T${i.toString().padStart(2, '0')}:00:00Z` }));
  }
  const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  await handlePlatformApiRoute(
    makeReq('/api/v1/runs?limit=3&offset=2'),
    makeRes(captured),
    { runHistoryStore: store, corsHeaders: {}, ...ENABLED },
  );
  const parsed = JSON.parse(captured.body);
  assert.equal(parsed.runs.length, 3);
  assert.equal(parsed.total, 10);
  assert.equal(parsed.hasMore, true);
});

test('platform-api routes return 403 when paracosmRoutesEnabled is false', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  const handled = await handlePlatformApiRoute(
    makeReq('/api/v1/runs'),
    makeRes(captured),
    { runHistoryStore: store, corsHeaders: {}, paracosmRoutesEnabled: false },
  );
  assert.equal(handled, true);
  assert.equal(captured.statusCode, 403);
  const parsed = JSON.parse(captured.body);
  assert.equal(parsed.error, 'run_history_routes_disabled');
});

test('GET /api/v1/runs/:runId returns 200 with { record, artifact } when artifact exists on disk', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'paracosm-route-test-'));
  const artifactPath = join(tmp, 'a.json');
  const artifact = { metadata: { runId: 'r-detail', scenario: { id: 'mars', name: 'Mars' }, mode: 'turn-loop', startedAt: '2026-04-25T00:00:00.000Z' } };
  writeFileSync(artifactPath, JSON.stringify(artifact));

  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  await store.insertRun(makeRun({ runId: 'r-detail', artifactPath, mode: 'turn-loop' }));

  const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  const handled = await handlePlatformApiRoute(
    makeReq('/api/v1/runs/r-detail'),
    makeRes(captured),
    { runHistoryStore: store, corsHeaders: {}, ...ENABLED },
  );
  assert.equal(handled, true);
  assert.equal(captured.statusCode, 200);
  const parsed = JSON.parse(captured.body);
  assert.equal(parsed.record.runId, 'r-detail');
  assert.equal(parsed.artifact.metadata.runId, 'r-detail');
});

test('GET /api/v1/runs/:runId returns 404 for unknown runId', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  await handlePlatformApiRoute(
    makeReq('/api/v1/runs/unknown'),
    makeRes(captured),
    { runHistoryStore: store, corsHeaders: {}, ...ENABLED },
  );
  assert.equal(captured.statusCode, 404);
  assert.match(captured.body, /not_found/);
});

test('GET /api/v1/runs/:runId returns 410 when artifactPath is missing on the record', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  await store.insertRun(makeRun({ runId: 'r-no-path' }));
  const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  await handlePlatformApiRoute(
    makeReq('/api/v1/runs/r-no-path'),
    makeRes(captured),
    { runHistoryStore: store, corsHeaders: {}, ...ENABLED },
  );
  assert.equal(captured.statusCode, 410);
  assert.match(captured.body, /artifact_unavailable/);
});

test('GET /api/v1/runs/:runId returns 410 when artifact file is unreadable', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  await store.insertRun(makeRun({ runId: 'r-bad-path', artifactPath: '/tmp/does-not-exist-xyz-test.json' }));
  const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  await handlePlatformApiRoute(
    makeReq('/api/v1/runs/r-bad-path'),
    makeRes(captured),
    { runHistoryStore: store, corsHeaders: {}, ...ENABLED },
  );
  assert.equal(captured.statusCode, 410);
  assert.match(captured.body, /artifact_unreadable/);
});

test('GET /api/v1/runs/aggregate returns sums across all runs', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  await store.insertRun(makeRun({ runId: 'a1', costUSD: 0.10, durationMs: 1000, mode: 'turn-loop' }));
  await store.insertRun(makeRun({ runId: 'a2', costUSD: 0.20, durationMs: 2000, mode: 'batch-trajectory' }));
  await store.insertRun(makeRun({ runId: 'a3', costUSD: 0.30, durationMs: 3000, mode: 'batch-trajectory' }));

  const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  await handlePlatformApiRoute(
    makeReq('/api/v1/runs/aggregate'),
    makeRes(captured),
    { runHistoryStore: store, corsHeaders: {}, ...ENABLED },
  );
  assert.equal(captured.statusCode, 200);
  const body = JSON.parse(captured.body);
  assert.equal(body.totalRuns, 3);
  assert.ok(Math.abs(body.totalCostUSD - 0.60) < 1e-9, `expected 0.60, got ${body.totalCostUSD}`);
  assert.equal(body.totalDurationMs, 6000);
});

test('GET /api/v1/runs/aggregate filters by mode', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  await store.insertRun(makeRun({ runId: 'b1', costUSD: 0.10, mode: 'turn-loop' }));
  await store.insertRun(makeRun({ runId: 'b2', costUSD: 0.20, mode: 'batch-trajectory' }));

  const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  await handlePlatformApiRoute(
    makeReq('/api/v1/runs/aggregate?mode=batch-trajectory'),
    makeRes(captured),
    { runHistoryStore: store, corsHeaders: {}, ...ENABLED },
  );
  const body = JSON.parse(captured.body);
  assert.equal(body.totalRuns, 1);
  assert.ok(Math.abs(body.totalCostUSD - 0.20) < 1e-9);
});

test('POST /api/v1/runs/:runId/replay-result increments counters via aggregate', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  await store.insertRun(makeRun({ runId: 'r-replay' }));

  const captured1: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  await handlePlatformApiRoute(
    makeReq('/api/v1/runs/r-replay/replay-result', 'POST', JSON.stringify({ matches: true })),
    makeRes(captured1),
    { runHistoryStore: store, corsHeaders: {}, ...ENABLED },
  );
  assert.equal(captured1.statusCode, 204);

  const captured2: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  await handlePlatformApiRoute(
    makeReq('/api/v1/runs/r-replay/replay-result', 'POST', JSON.stringify({ matches: false })),
    makeRes(captured2),
    { runHistoryStore: store, corsHeaders: {}, ...ENABLED },
  );
  assert.equal(captured2.statusCode, 204);

  const agg = await store.aggregateStats!();
  assert.equal(agg.replaysAttempted, 2);
  assert.equal(agg.replaysMatched, 1);
});

test('POST /api/v1/runs/:runId/replay-result returns 400 when matches is not a boolean', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  await store.insertRun(makeRun({ runId: 'r-bad-body' }));

  const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  await handlePlatformApiRoute(
    makeReq('/api/v1/runs/r-bad-body/replay-result', 'POST', JSON.stringify({ matches: 'yes' })),
    makeRes(captured),
    { runHistoryStore: store, corsHeaders: {}, ...ENABLED },
  );
  assert.equal(captured.statusCode, 400);
});
