import test from 'node:test';
import assert from 'node:assert/strict';
import { MetricRegistry } from '../../src/engine/metric-registry.js';
import { marsScenario } from '../../src/engine/scenarios/index.js';

// Pull Mars world metrics out of the loaded scenario as a fixture.
// They live under marsScenario.world.{metrics,capacities,statuses,politics}
// — flatten into a single array since that's what MetricRegistry consumes.
const MARS_ALL_METRICS = [
  ...Object.values(marsScenario.world.metrics),
  ...Object.values(marsScenario.world.capacities),
  ...Object.values(marsScenario.world.statuses),
  ...Object.values(marsScenario.world.politics),
];

test('MetricRegistry returns all declared metrics', () => {
  const registry = new MetricRegistry(MARS_ALL_METRICS);
  const all = registry.all();
  assert.ok(all.length > 0);
  const ids = all.map(m => m.id);
  assert.ok(ids.includes('population'));
  assert.ok(ids.includes('morale'));
  assert.ok(ids.includes('lifeSupportCapacity'));
  assert.ok(ids.includes('governanceStatus'));
  assert.ok(ids.includes('earthDependencyPct'));
});

test('MetricRegistry.get returns the metric definition by id', () => {
  const registry = new MetricRegistry(MARS_ALL_METRICS);
  const morale = registry.get('morale');
  assert.ok(morale);
  assert.equal(morale!.label, 'Morale');
  assert.equal(morale!.unit, '%');
  assert.equal(morale!.initial, 0.85);
});

test('MetricRegistry.get returns undefined for unknown id', () => {
  const registry = new MetricRegistry(MARS_ALL_METRICS);
  assert.equal(registry.get('nonexistent'), undefined);
});

test('MetricRegistry.getByCategory filters by category', () => {
  const registry = new MetricRegistry(MARS_ALL_METRICS);
  const capacities = registry.getByCategory('capacity');
  assert.ok(capacities.length > 0);
  assert.ok(capacities.some(m => m.id === 'lifeSupportCapacity'));
});

test('Mars world metrics include all expected fields', () => {
  const ids = Object.keys(marsScenario.world.metrics);
  assert.ok(ids.includes('population'));
  assert.ok(ids.includes('powerKw'));
  assert.ok(ids.includes('foodMonthsReserve'));
  assert.ok(ids.includes('waterLitersPerDay'));
  assert.ok(ids.includes('morale'));
  assert.ok(ids.includes('infrastructureModules'));
  assert.ok(ids.includes('scienceOutput'));
});
