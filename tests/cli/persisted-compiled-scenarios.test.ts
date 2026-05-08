import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  COMPILED_SCENARIOS_CAP,
  COMPILED_SUBDIR,
  deletePersistedCompiledScenario,
  loadPersistedCompiledDrafts,
  persistCompiledScenario,
} from '../../src/cli/persisted-compiled-scenarios.js';
import type { ScenarioPackage } from '../../src/engine/types.js';

/**
 * Minimal scenario shape good enough for the persistence module — we
 * only care that `id`, `labels`, `version` round-trip through JSON
 * and that the function-typed `hooks` field is stripped on save. The
 * full ScenarioPackage shape isn't needed because compileScenario is
 * the consumer of the round-tripped draft, not this module.
 */
function makeScenario(id: string): ScenarioPackage {
  return {
    id,
    version: '1.0.0',
    engineArchetype: 'closed_turn_based_settlement',
    labels: { name: id, shortName: id, populationNoun: 'people', settlementNoun: 'place', currency: 'USD' },
    theme: { primaryColor: '#000', accentColor: '#fff', cssVariables: {} },
    setup: { defaultTurns: 6, defaultSeed: 1, defaultStartTime: 2025, defaultPopulation: 30, configurableSections: [] },
    departments: [],
    metrics: [],
    events: [],
    effects: {},
    presets: [],
    ui: { headerMetrics: [], tooltipFields: [], reportSections: [], departmentIcons: {}, eventRenderers: {}, setupSections: [] },
    policies: {
      toolForging: { enabled: true },
      liveSearch: { enabled: false, mode: 'off' },
      bulletin: { enabled: true },
      characterChat: { enabled: true },
      sandbox: { timeoutMs: 10000, memoryMB: 128 },
    },
    knowledge: { topics: {}, categoryMapping: {} },
    world: { metrics: {}, capacities: {}, statuses: {}, politics: {}, environment: {} },
    // Function-typed; persistCompiledScenario must drop this so the
    // result round-trips through JSON.
    hooks: {
      progressionHook: () => ({}) as never,
    } as ScenarioPackage['hooks'],
  } as unknown as ScenarioPackage;
}

test('persistCompiledScenario writes to scenarios/compiled/{id}.json with hooks stripped + meta attached', () => {
  const dir = mkdtempSync(join(tmpdir(), 'paracosm-persist-'));
  try {
    const sc = makeScenario('alpha');
    const out = persistCompiledScenario(dir, sc, 'A short seed prompt about alphas.');
    assert.ok(out, 'persistCompiledScenario returned a path');
    const filePath = resolve(dir, COMPILED_SUBDIR, 'alpha.json');
    assert.ok(existsSync(filePath), 'expected JSON file present on disk');
    const drafts = loadPersistedCompiledDrafts(dir);
    assert.equal(drafts.length, 1);
    const [d] = drafts;
    assert.equal(d.id, 'alpha');
    assert.equal((d.draft as Record<string, unknown>).hooks, undefined, 'hooks must be stripped from the persisted JSON');
    assert.equal(typeof d.meta.compiledAt, 'string');
    assert.equal(d.meta.seedText, 'A short seed prompt about alphas.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('persistCompiledScenario truncates seedText to 1KB', () => {
  const dir = mkdtempSync(join(tmpdir(), 'paracosm-persist-truncate-'));
  try {
    const longSeed = 'x'.repeat(2000);
    persistCompiledScenario(dir, makeScenario('beta'), longSeed);
    const [d] = loadPersistedCompiledDrafts(dir);
    assert.equal(d.meta.seedText?.length, 1000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPersistedCompiledDrafts skips malformed files without aborting the rest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'paracosm-persist-malformed-'));
  try {
    persistCompiledScenario(dir, makeScenario('good-1'), null);
    persistCompiledScenario(dir, makeScenario('good-2'), null);
    // Drop a malformed JSON in the middle.
    writeFileSync(resolve(dir, COMPILED_SUBDIR, 'broken.json'), '{ this is not valid');
    const drafts = loadPersistedCompiledDrafts(dir);
    const ids = drafts.map((d) => d.id).sort();
    assert.deepEqual(ids, ['good-1', 'good-2']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPersistedCompiledDrafts returns empty list when directory is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'paracosm-persist-empty-'));
  try {
    // Don't call persistCompiledScenario — the compiled/ subdir never
    // gets created. loader must not throw on a missing dir.
    assert.deepEqual(loadPersistedCompiledDrafts(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deletePersistedCompiledScenario removes the file by id; idempotent on missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'paracosm-persist-delete-'));
  try {
    persistCompiledScenario(dir, makeScenario('to-drop'), null);
    assert.equal(deletePersistedCompiledScenario(dir, 'to-drop'), true);
    assert.equal(deletePersistedCompiledScenario(dir, 'to-drop'), false, 'second call returns false');
    assert.equal(deletePersistedCompiledScenario(dir, 'never-existed'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('FIFO eviction caps the directory at COMPILED_SCENARIOS_CAP entries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'paracosm-persist-cap-'));
  try {
    // Pre-stamp mtimes so the FIFO sort inside enforceCompiledCap has
    // a deterministic order — back-to-back saves on a fast filesystem
    // can land with identical mtimes, which would make the eviction
    // pick "oldest" arbitrarily and the cap-1 assertion flaky in CI.
    // Strategy: save each scenario, then immediately backdate its
    // mtime by `(total - i)` seconds so s-000 is the oldest, s-001 is
    // next-oldest, etc. The last save then triggers enforceCompiledCap
    // with a known mtime ordering.
    const total = COMPILED_SCENARIOS_CAP + 5;
    const baseSecs = Math.floor(Date.now() / 1000);
    for (let i = 0; i < total; i++) {
      const id = `s-${String(i).padStart(3, '0')}`;
      persistCompiledScenario(dir, makeScenario(id), null);
      const filePath = resolve(dir, COMPILED_SUBDIR, `${id}.json`);
      // Older index → older mtime. After the 51st save the cap
      // enforces at end of persistCompiledScenario; we pre-stamp the
      // earlier files HERE, which means the cap inside the next
      // persist call uses these stamps. Setting *just-saved* mtime
      // last keeps it the newest until the next iteration backdates
      // it via this same loop.
      const mtime = baseSecs - (total - i);
      utimesSync(filePath, mtime, mtime);
    }
    // Trigger one more save with an explicit pre-existing-files mtime
    // ordering so enforceCompiledCap has clean inputs to sort. We
    // re-save the newest id (overwriting itself) so the enforce step
    // runs over the pre-stamped state.
    persistCompiledScenario(dir, makeScenario(`s-${String(total - 1).padStart(3, '0')}`), null);

    const remaining = readdirSync(resolve(dir, COMPILED_SUBDIR)).filter((n) => n.endsWith('.json'));
    assert.equal(remaining.length, COMPILED_SCENARIOS_CAP);
    // The earliest-stamped (s-000..s-004) should have been evicted.
    assert.ok(!remaining.includes('s-000.json'), 'oldest mtime should evict');
    assert.ok(!remaining.includes('s-004.json'), '5th-oldest mtime should evict at cap+5');
    // Most recent save survives.
    assert.ok(remaining.includes(`s-${String(total - 1).padStart(3, '0')}.json`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
