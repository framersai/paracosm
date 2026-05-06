import test from 'node:test';
import assert from 'node:assert/strict';

import {
  quartileRanking,
  paretoFront,
  medianBenchmark,
  formatDelta,
  METRIC_DIRECTION,
} from './cohort-verdict.helpers.js';
import type { ActorRow } from '../sim/actor-table.helpers';

function row(overrides: Partial<ActorRow> = {}): ActorRow {
  return {
    id: 'r',
    name: 'R',
    archetype: 'Engineer',
    population: 0,
    morale: 0,
    deaths: 0,
    tools: 0,
    turn: 0,
    pending: false,
    ...overrides,
  };
}

test('METRIC_DIRECTION: deaths is "lower is better"', () => {
  assert.equal(METRIC_DIRECTION.deaths, 'lower');
});

test('METRIC_DIRECTION: morale / population / tools / turn are "higher is better"', () => {
  assert.equal(METRIC_DIRECTION.morale, 'higher');
  assert.equal(METRIC_DIRECTION.population, 'higher');
  assert.equal(METRIC_DIRECTION.tools, 'higher');
  assert.equal(METRIC_DIRECTION.turn, 'higher');
});

test('quartileRanking: empty rows returns empty buckets + median 0', () => {
  const r = quartileRanking([], 'morale');
  assert.deepEqual(r.top, []);
  assert.deepEqual(r.middle, []);
  assert.deepEqual(r.bottom, []);
  assert.equal(r.median, 0);
});

test('quartileRanking: morale (higher=better) puts highest values in top bucket', () => {
  const rows = [
    row({ id: 'a', morale: 10 }),
    row({ id: 'b', morale: 50 }),
    row({ id: 'c', morale: 60 }),
    row({ id: 'd', morale: 90 }),
    row({ id: 'e', morale: 95 }),
  ];
  const r = quartileRanking(rows, 'morale');
  assert.ok(r.top.some(x => x.id === 'e'), 'top should include the highest');
  assert.ok(r.bottom.some(x => x.id === 'a'), 'bottom should include the lowest');
  assert.equal(r.median, 60);
});

test('quartileRanking: deaths (lower=better) puts fewest-deaths in top bucket', () => {
  const rows = [
    row({ id: 'a', deaths: 0 }),
    row({ id: 'b', deaths: 3 }),
    row({ id: 'c', deaths: 5 }),
    row({ id: 'd', deaths: 8 }),
    row({ id: 'e', deaths: 20 }),
  ];
  const r = quartileRanking(rows, 'deaths');
  assert.ok(r.top.some(x => x.id === 'a'), 'top quartile = fewest deaths');
  assert.ok(r.bottom.some(x => x.id === 'e'), 'bottom quartile = most deaths');
});

test('paretoFront: empty input returns empty front', () => {
  assert.deepEqual(paretoFront([], ['morale']), { frontIds: [], dominationCount: {} });
});

test('paretoFront: dominated actor excluded; dominator on the front', () => {
  // a strictly dominates b on every metric; only a should be on the front.
  const rows = [
    row({ id: 'a', morale: 90, population: 100, deaths: 0,  tools: 5, turn: 6 }),
    row({ id: 'b', morale: 50, population: 50,  deaths: 10, tools: 1, turn: 6 }),
  ];
  const r = paretoFront(rows, ['morale', 'population', 'deaths', 'tools']);
  assert.deepEqual(r.frontIds, ['a']);
  assert.equal(r.dominationCount.a, 1);
  assert.equal(r.dominationCount.b, 0);
});

test('paretoFront: tradeoff actors both on the front', () => {
  // a is best on morale; b is best on deaths; neither dominates.
  const rows = [
    row({ id: 'a', morale: 95, population: 30, deaths: 5, tools: 3 }),
    row({ id: 'b', morale: 60, population: 30, deaths: 0, tools: 3 }),
  ];
  const r = paretoFront(rows, ['morale', 'deaths']);
  assert.deepEqual(new Set(r.frontIds), new Set(['a', 'b']));
});

test('paretoFront: ties on every metric → both on the front (no strict-better)', () => {
  const rows = [
    row({ id: 'a', morale: 50, deaths: 5 }),
    row({ id: 'b', morale: 50, deaths: 5 }),
  ];
  const r = paretoFront(rows, ['morale', 'deaths']);
  assert.deepEqual(new Set(r.frontIds), new Set(['a', 'b']));
});

test('paretoFront: dominationCount counts how many others each actor dominates', () => {
  const rows = [
    row({ id: 'top', morale: 90, deaths: 0 }),
    row({ id: 'mid', morale: 60, deaths: 2 }),
    row({ id: 'low', morale: 30, deaths: 8 }),
  ];
  const r = paretoFront(rows, ['morale', 'deaths']);
  assert.equal(r.dominationCount.top, 2, 'top dominates both others');
  assert.equal(r.dominationCount.mid, 1, 'mid dominates only low');
  assert.equal(r.dominationCount.low, 0);
});

test('medianBenchmark: morale delta is positive for above-median actors', () => {
  const rows = [
    row({ id: 'a', morale: 30 }),
    row({ id: 'b', morale: 60 }),
    row({ id: 'c', morale: 90 }),
  ];
  const r = medianBenchmark(rows, 'morale');
  assert.equal(r.median, 60);
  assert.equal(r.deltas.a, -30);
  assert.equal(r.deltas.b, 0);
  assert.equal(r.deltas.c, 30);
});

test('medianBenchmark: deaths delta is positive for fewer-than-median (better)', () => {
  // For "lower is better" metrics, the sign flips so positive = better.
  const rows = [
    row({ id: 'a', deaths: 0 }),
    row({ id: 'b', deaths: 5 }),
    row({ id: 'c', deaths: 10 }),
  ];
  const r = medianBenchmark(rows, 'deaths');
  assert.equal(r.median, 5);
  assert.equal(r.deltas.a, 5,  'fewer deaths than median → positive delta');
  assert.equal(r.deltas.b, 0);
  assert.equal(r.deltas.c, -5, 'more deaths than median → negative delta');
});

test('medianBenchmark: empty rows returns 0 median + empty deltas', () => {
  assert.deepEqual(medianBenchmark([], 'morale'), { metric: 'morale', median: 0, deltas: {} });
});

test('formatDelta: positive number gets a + prefix', () => {
  assert.equal(formatDelta(12), '+12');
});

test('formatDelta: negative stays negative without manual prefix', () => {
  assert.equal(formatDelta(-7), '-7');
});

test('formatDelta: tiny values render as ±0 not "0"', () => {
  assert.equal(formatDelta(0), '±0');
  assert.equal(formatDelta(0.4, 0), '±0');
});

test('formatDelta: respects decimals override', () => {
  assert.equal(formatDelta(2.345, 2), '+2.35');
  assert.equal(formatDelta(-0.1, 1), '-0.1');
});
