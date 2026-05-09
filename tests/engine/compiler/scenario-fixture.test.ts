import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildScenarioFixture } from '../../../src/engine/compiler/scenario-fixture.js';
import { marsScenario } from '../../../src/engine/builtin-scenarios/index.js';
import { lunarScenario } from '../../../src/engine/builtin-scenarios/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

function loadScenarioJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(REPO_ROOT, relativePath), 'utf8')) as Record<string, unknown>;
}

test('buildScenarioFixture: mars scenario produces metrics with every declared metric', () => {
  const fixture = buildScenarioFixture(marsScenario as unknown as Record<string, unknown>);
  const declaredKeys = Object.keys((marsScenario.world as { metrics: Record<string, unknown> }).metrics);
  for (const key of declaredKeys) {
    assert.ok(key in fixture.metrics, `mars fixture missing declared metric: ${key}`);
  }
});

test('buildScenarioFixture: runtime shape has metrics/politics/statuses/environment/agents/metadata', () => {
  const fixture = buildScenarioFixture(marsScenario as unknown as Record<string, unknown>);
  assert.equal(typeof fixture.metrics, 'object');
  assert.equal(typeof fixture.politics, 'object');
  assert.equal(typeof fixture.statuses, 'object');
  assert.equal(typeof fixture.environment, 'object');
  assert.ok(Array.isArray(fixture.agents));
  assert.equal(typeof fixture.metadata, 'object');
});

test('buildScenarioFixture: world.statuses + world.environment flow into fixture bags', () => {
  const scenario = {
    id: 'test',
    labels: { name: 'Test' },
    setup: { defaultStartTime: 0 },
    world: {
      metrics: { foo: { id: 'foo', type: 'number' as const, initial: 1 } },
      capacities: {},
      statuses: { fundingRound: { id: 'fundingRound', type: 'string' as const, initial: 'seed' } },
      politics: {},
      environment: { market: { id: 'market', type: 'number' as const, initial: 10 } },
    },
  };
  const fixture = buildScenarioFixture(scenario);
  assert.equal(fixture.statuses.fundingRound, 'seed');
  assert.equal(fixture.environment.market, 10);
});

test('buildScenarioFixture: world.capacities keys flatten into state.metrics', () => {
  const corp = loadScenarioJson('scenarios/corporate-quarterly.json');
  const fixture = buildScenarioFixture(corp);
  // world.metrics keys
  assert.ok('revenueArr' in fixture.metrics, 'revenueArr declared under world.metrics must be in state.metrics');
  assert.ok('burnRate' in fixture.metrics);
  // world.capacities keys — also flattened into state.metrics because both
  // map to runtime numbers under the same bag.
  assert.ok('deliveryCapacity' in fixture.metrics, 'deliveryCapacity declared under world.capacities must be in state.metrics');
  assert.ok('hiringCapacity' in fixture.metrics);
});

test('buildScenarioFixture: corporate-quarterly scenario produces quarterly metadata', () => {
  const corp = loadScenarioJson('scenarios/corporate-quarterly.json');
  const fixture = buildScenarioFixture(corp);
  assert.equal(fixture.metadata.startTime, 1);
  assert.equal(fixture.metadata.currentTime, 1);
  assert.equal(fixture.metadata.currentTurn, 0);
});

test('buildScenarioFixture: submarine scenario carries declared hull + oxygen metrics', () => {
  const sub = loadScenarioJson('scenarios/submarine.json');
  const fixture = buildScenarioFixture(sub);
  assert.ok('hullIntegrity' in fixture.metrics);
  assert.ok('oxygenReserveHours' in fixture.metrics);
});

test('buildScenarioFixture: Mars-heritage defaults (population, morale) always present', () => {
  // Scenario that declares only a scenario-specific metric — population
  // and morale should still be in state.metrics so hooks that read them
  // do not trip the smokeTest.
  const scenario = {
    id: 'minimal',
    labels: { name: 'Minimal' },
    setup: { defaultStartTime: 0 },
    world: {
      metrics: { onlyThing: { id: 'onlyThing', type: 'number' as const } },
      capacities: {},
      politics: {},
    },
  };
  const fixture = buildScenarioFixture(scenario);
  assert.ok('population' in fixture.metrics, 'Mars-heritage population must be present');
  assert.ok('morale' in fixture.metrics, 'Mars-heritage morale must be present');
  assert.ok('onlyThing' in fixture.metrics);
});

test('buildScenarioFixture: numeric metric without initial defaults to 0', () => {
  const scenario = {
    id: 'test',
    labels: { name: 'Test' },
    setup: { defaultStartTime: 0, defaultTimePerTurn: 1 },
    world: {
      metrics: {
        foo: { id: 'foo', label: 'Foo', unit: '', type: 'number' as const, category: 'metric' },
      },
      capacities: {},
      politics: {},
    },
  };
  const fixture = buildScenarioFixture(scenario);
  assert.equal(fixture.metrics.foo, 0);
});

test('buildScenarioFixture: scenario missing world.metrics throws clear error', () => {
  const broken = { id: 'broken', labels: { name: 'Broken' }, setup: {} };
  assert.throws(
    () => buildScenarioFixture(broken as unknown as Record<string, unknown>),
    /world\.metrics/,
  );
});

test('buildScenarioFixture: fixture includes a synthetic agent with HEXACO + lifecycle fields', () => {
  const corp = loadScenarioJson('scenarios/corporate-quarterly.json');
  const fixture = buildScenarioFixture(corp);
  assert.equal(fixture.agents.length, 1);
  const agent = fixture.agents[0];
  assert.ok(typeof agent.core.birthTime === 'number');
  assert.ok(typeof agent.health.alive === 'boolean');
  assert.ok(typeof agent.hexaco.openness === 'number');
});
