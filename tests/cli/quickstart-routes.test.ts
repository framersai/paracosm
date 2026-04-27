import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  handleFetchSeed, handleCompileFromSeed, handleGenerateActors,
  type QuickstartDeps,
} from '../../src/cli/quickstart-routes.js';
import { marsScenario } from '../../src/engine/mars/index.js';

function fakeRes() {
  let status = 0;
  let headers: Record<string, string> = {};
  let body = '';
  const res = {
    writeHead: (s: number, h?: Record<string, string>) => { status = s; if (h) headers = h; },
    end: (b?: string) => { if (b) body = b; },
  } as unknown as ServerResponse;
  return {
    res,
    get: () => ({
      status,
      headers,
      body: body ? JSON.parse(body) : null,
    }),
  };
}

function fakeDeps(overrides: Partial<QuickstartDeps> = {}): QuickstartDeps {
  return {
    setActiveScenario: () => {},
    getScenarioById: (id) => id === marsScenario.id ? marsScenario : undefined,
    fetchSeedFromUrl: async () => ({ text: 'test content', title: 'T', sourceUrl: 'https://x.test' }),
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-6',
    ...overrides,
  };
}

test('fetch-seed: valid URL returns fetched content', async () => {
  const { res, get } = fakeRes();
  await handleFetchSeed({} as IncomingMessage, res, { url: 'https://example.com/article' }, fakeDeps());
  const r = get();
  assert.equal(r.status, 200);
  assert.equal(r.body.text, 'test content');
  assert.equal(r.body.truncated, false);
});

test('fetch-seed: invalid URL rejects with 400', async () => {
  const { res, get } = fakeRes();
  await handleFetchSeed({} as IncomingMessage, res, { url: 'not a url' }, fakeDeps());
  assert.equal(get().status, 400);
});

test('fetch-seed: non-http scheme rejects with 400', async () => {
  const { res, get } = fakeRes();
  await handleFetchSeed({} as IncomingMessage, res, { url: 'ftp://example.com/file' }, fakeDeps());
  assert.equal(get().status, 400);
});

test('fetch-seed: fetch failure surfaces as 502', async () => {
  const { res, get } = fakeRes();
  const deps = fakeDeps({
    fetchSeedFromUrl: async () => { throw new Error('network fail'); },
  });
  await handleFetchSeed({} as IncomingMessage, res, { url: 'https://example.com' }, deps);
  assert.equal(get().status, 502);
});

test('fetch-seed: oversized content is truncated with flag', async () => {
  const { res, get } = fakeRes();
  const deps = fakeDeps({
    fetchSeedFromUrl: async () => ({ text: 'x'.repeat(60_000), title: 'T', sourceUrl: 'https://x.test' }),
  });
  await handleFetchSeed({} as IncomingMessage, res, { url: 'https://example.com' }, deps);
  const r = get();
  assert.equal(r.status, 200);
  assert.equal(r.body.text.length, 50_000);
  assert.equal(r.body.truncated, true);
});

test('compile-from-seed: too-short seed rejects with 400', async () => {
  const { res, get } = fakeRes();
  await handleCompileFromSeed({} as IncomingMessage, res, { seedText: 'short' }, fakeDeps());
  assert.equal(get().status, 400);
});

test('compile-from-seed: too-long seed rejects with 400', async () => {
  const { res, get } = fakeRes();
  await handleCompileFromSeed({} as IncomingMessage, res, { seedText: 'x'.repeat(60_000) }, fakeDeps());
  assert.equal(get().status, 400);
});

test('generate-leaders: unknown scenarioId returns 404', async () => {
  const { res, get } = fakeRes();
  await handleGenerateActors({} as IncomingMessage, res, { scenarioId: 'unknown-xyz-scenario', count: 3 }, fakeDeps());
  assert.equal(get().status, 404);
});

test('generate-leaders: count < 2 rejected', async () => {
  const { res, get } = fakeRes();
  await handleGenerateActors({} as IncomingMessage, res, { scenarioId: marsScenario.id, count: 1 }, fakeDeps());
  assert.equal(get().status, 400);
});

test('generate-leaders: count > 50 rejected (Compare-runs UI cap)', async () => {
  const { res, get } = fakeRes();
  await handleGenerateActors({} as IncomingMessage, res, { scenarioId: marsScenario.id, count: 51 }, fakeDeps());
  assert.equal(get().status, 400);
});

test('generate-leaders: count up to 50 accepted', async () => {
  const { res, get } = fakeRes();
  // count: 50 is the cap; 50 itself should pass schema validation. The
  // handler may still 404 if the scenario is not in the catalog under
  // the test deps, but it should NOT 400 for a schema reason.
  await handleGenerateActors({} as IncomingMessage, res, { scenarioId: marsScenario.id, count: 50 }, fakeDeps());
  // Either 200 (full success) or 404/500 (downstream issue) is acceptable
  // here -- we only care that schema validation doesn't reject 50.
  assert.notEqual(get().status, 400);
});
