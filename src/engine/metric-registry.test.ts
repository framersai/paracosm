import test from 'node:test';
import assert from 'node:assert/strict';
import { MetricRegistry } from './metric-registry.js';
import { MARS_WORLD_METRICS, MARS_CAPACITY_METRICS, MARS_STATUS_METRICS, MARS_POLITICS_METRICS } from './mars/metrics.js';

test('MetricRegistry returns all declared metrics', () => {
  const registry = new MetricRegistry([
    ...MARS_WORLD_METRICS,
    ...MARS_CAPACITY_METRICS,
    ...MARS_STATUS_METRICS,
    ...MARS_POLITICS_METRICS,
  ]);
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
  const registry = new MetricRegistry(MARS_WORLD_METRICS);
  const morale = registry.get('morale');
  assert.ok(morale);
  assert.equal(morale!.label, 'Morale');
  assert.equal(morale!.unit, '%');
  assert.equal(morale!.initial, 0.85);
});

test('MetricRegistry.get returns undefined for unknown id', () => {
  const registry = new MetricRegistry(MARS_WORLD_METRICS);
  assert.equal(registry.get('nonexistent'), undefined);
});

test('MetricRegistry.getHeaderMetrics returns only metrics flagged for header', () => {
  const registry = new MetricRegistry(MARS_WORLD_METRICS);
  const header = registry.getHeaderMetrics();
  assert.ok(header.length > 0);
  for (const m of header) {
    assert.equal(m.showInHeader, true);
  }
});

test('Mars world metrics include all ColonySystems fields', () => {
  const ids = MARS_WORLD_METRICS.map(m => m.id);
  assert.ok(ids.includes('population'));
  assert.ok(ids.includes('powerKw'));
  assert.ok(ids.includes('foodMonthsReserve'));
  assert.ok(ids.includes('waterLitersPerDay'));
  assert.ok(ids.includes('morale'));
  assert.ok(ids.includes('infrastructureModules'));
  assert.ok(ids.includes('scienceOutput'));
});
