import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStateShapeBlock } from '../../../src/engine/compiler/state-shape-block.js';

test('buildStateShapeBlock lists scenario-declared metric keys', () => {
  const block = buildStateShapeBlock({
    labels: { timeUnitNoun: 'quarter', timeUnitNounPlural: 'quarters' },
    world: {
      metrics: { revenue: { id: 'revenue' }, morale: { id: 'morale' } },
      capacities: {},
      statuses: {},
      politics: {},
      environment: {},
    },
  });
  assert.ok(block.includes('revenue'));
  assert.ok(block.includes('morale'));
  assert.ok(block.includes('quarter'));
  assert.ok(block.includes('quarters'));
  assert.ok(block.includes('FLAT'));
});

test('buildStateShapeBlock falls back to tick when timeUnit not set', () => {
  const block = buildStateShapeBlock({
    world: { metrics: {}, capacities: {}, statuses: {}, politics: {}, environment: {} },
  });
  assert.ok(block.includes('tick'));
  assert.ok(block.includes('ticks'));
});

test('buildStateShapeBlock renders "(none declared)" for empty bags', () => {
  const block = buildStateShapeBlock({
    world: { metrics: {}, capacities: {}, statuses: {}, politics: {}, environment: {} },
  });
  assert.ok(block.includes('(none declared)'));
});

test('buildStateShapeBlock lists capacity, politics, status, environment keys separately', () => {
  const block = buildStateShapeBlock({
    labels: { timeUnitNoun: 'year', timeUnitNounPlural: 'years' },
    world: {
      metrics: { foo: { id: 'foo' } },
      capacities: { cap1: { id: 'cap1' } },
      statuses: { stat1: { id: 'stat1' } },
      politics: { pol1: { id: 'pol1' } },
      environment: { env1: { id: 'env1' } },
    },
  });
  assert.ok(block.includes('foo'));
  assert.ok(block.includes('cap1'));
  assert.ok(block.includes('stat1'));
  assert.ok(block.includes('pol1'));
  assert.ok(block.includes('env1'));
});
