import test from 'node:test';
import assert from 'node:assert/strict';
import { marsPoliticsHook } from './politics.js';

test('marsPoliticsHook returns success deltas for political category with success outcome', () => {
  const result = marsPoliticsHook('political', 'risky_success');
  assert.ok(result);
  assert.equal(result!.independencePressure, 0.05);
  assert.equal(result!.earthDependencyPct, -3);
});

test('marsPoliticsHook returns failure deltas for social category with failure outcome', () => {
  const result = marsPoliticsHook('social', 'risky_failure');
  assert.ok(result);
  assert.equal(result!.independencePressure, -0.03);
  assert.equal(result!.earthDependencyPct, 2);
});

test('marsPoliticsHook returns null for non-political categories', () => {
  assert.equal(marsPoliticsHook('environmental', 'risky_success'), null);
  assert.equal(marsPoliticsHook('medical', 'conservative_success'), null);
  assert.equal(marsPoliticsHook('infrastructure', 'risky_failure'), null);
});

test('marsPoliticsHook returns success deltas for conservative_success', () => {
  const result = marsPoliticsHook('political', 'conservative_success');
  assert.ok(result);
  assert.equal(result!.independencePressure, 0.05);
});
