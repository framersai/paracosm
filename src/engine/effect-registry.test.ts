import test from 'node:test';
import assert from 'node:assert/strict';
import { EffectRegistry } from './effect-registry.js';
import { MARS_CATEGORY_EFFECTS } from './mars/effects.js';

test('EffectRegistry returns base deltas for a known category', () => {
  const registry = new EffectRegistry(MARS_CATEGORY_EFFECTS);
  const base = registry.getBaseEffect('environmental');
  assert.ok(base);
  assert.equal(base.powerKw, 50);
  assert.equal(base.morale, 0.08);
  assert.equal(base.foodMonthsReserve, 1);
});

test('EffectRegistry returns fallback for unknown category', () => {
  const registry = new EffectRegistry(MARS_CATEGORY_EFFECTS);
  const base = registry.getBaseEffect('unknown_category');
  assert.ok(base);
  assert.equal(base.morale, 0.08);
});

test('EffectRegistry.applyOutcome computes risky_success multiplier', () => {
  const registry = new EffectRegistry(MARS_CATEGORY_EFFECTS);
  const deltas = registry.applyOutcome('infrastructure', 'risky_success', {
    personalityBonus: 0,
    noise: 0,
  });
  assert.equal(deltas.infrastructureModules, 5);
  assert.equal(deltas.powerKw, 150);
  assert.equal(deltas.pressurizedVolumeM3, 500);
});

test('EffectRegistry.applyOutcome computes risky_failure with negative multiplier', () => {
  const registry = new EffectRegistry(MARS_CATEGORY_EFFECTS);
  const deltas = registry.applyOutcome('resource', 'risky_failure', {
    personalityBonus: 0,
    noise: 0,
  });
  assert.equal(deltas.foodMonthsReserve, -8);
  assert.equal(deltas.waterLitersPerDay, -200);
  assert.equal(deltas.morale, -0.1);
});

test('EffectRegistry.applyOutcome applies personality bonus', () => {
  const registry = new EffectRegistry(MARS_CATEGORY_EFFECTS);
  const deltas = registry.applyOutcome('psychological', 'conservative_success', {
    personalityBonus: 0.1,
    noise: 0,
  });
  // 0.15 * (1.0 + 0.1 + 0) = 0.15 * 1.1 = 0.165, rounded to 0.17
  assert.equal(deltas.morale, 0.17);
});
