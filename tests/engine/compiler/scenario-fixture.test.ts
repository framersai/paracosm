import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildScenarioFixture } from '../../../src/engine/compiler/scenario-fixture.js';
import { marsScenario } from '../../../src/engine/mars/index.js';
import { lunarScenario } from '../../../src/engine/lunar/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

function loadScenarioJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(REPO_ROOT, relativePath), 'utf8')) as Record<string, unknown>;
}

test('buildScenarioFixture: mars scenario produces systems with every declared metric', () => {
  const fixture = buildScenarioFixture(marsScenario as unknown as Record<string, unknown>);
  const declaredKeys = Object.keys((marsScenario.world as { metrics: Record<string, unknown> }).metrics);
  for (const key of declaredKeys) {
    assert.ok(key in fixture.systems, `mars fixture missing declared metric: ${key}`);
  }
});

test('buildScenarioFixture: lunar scenario produces all five world bags', () => {
  const fixture = buildScenarioFixture(lunarScenario as unknown as Record<string, unknown>);
  assert.equal(typeof fixture.systems, 'object');
  assert.equal(typeof fixture.capacities, 'object');
  assert.equal(typeof fixture.statuses, 'object');
  assert.equal(typeof fixture.politics, 'object');
  assert.equal(typeof fixture.environment, 'object');
});

test('buildScenarioFixture: corporate-quarterly scenario produces quarterly metadata', () => {
  const corp = loadScenarioJson('scenarios/corporate-quarterly.json');
  const fixture = buildScenarioFixture(corp);
  assert.equal(fixture.metadata.startTime, 1);
  assert.equal(fixture.metadata.currentTime, 1);
  assert.equal(fixture.metadata.currentTurn, 0);
  assert.ok('revenueArr' in fixture.systems);
  assert.ok('burnRate' in fixture.systems);
  assert.ok('marketShare' in fixture.systems);
});

test('buildScenarioFixture: submarine scenario carries declared hull + oxygen metrics', () => {
  const sub = loadScenarioJson('scenarios/submarine.json');
  const fixture = buildScenarioFixture(sub);
  assert.ok('hullIntegrity' in fixture.systems);
  assert.ok('oxygenReserveHours' in fixture.systems);
});

test('buildScenarioFixture: numeric metric without initial defaults to 0', () => {
  const scenario = {
    id: 'test',
    labels: { name: 'Test', timeUnitNoun: 'tick', timeUnitNounPlural: 'ticks' },
    setup: { defaultStartTime: 0, defaultTimePerTurn: 1 },
    world: {
      metrics: {
        foo: { id: 'foo', label: 'Foo', unit: '', type: 'number' as const, category: 'metric' },
      },
      capacities: {},
      statuses: {},
      politics: {},
      environment: {},
    },
  };
  const fixture = buildScenarioFixture(scenario);
  assert.equal(fixture.systems.foo, 0);
});

test('buildScenarioFixture: string status without initial defaults to empty string', () => {
  const scenario = {
    id: 'test',
    labels: { name: 'Test' },
    setup: { defaultStartTime: 0 },
    world: {
      metrics: { x: { id: 'x' } },
      capacities: {},
      statuses: {
        status: { id: 'status', label: 'Status', unit: '', type: 'string' as const, category: 'status' },
      },
      politics: {},
      environment: {},
    },
  };
  const fixture = buildScenarioFixture(scenario);
  assert.equal(fixture.statuses.status, '');
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
