/**
 * Smoke + type-surface tests for the `paracosm/world-model` façade.
 *
 * Does NOT call `.simulate()` or `.batch()` with real providers:
 * those hit live LLM APIs and cost money. Those paths are exercised
 * indirectly via the existing `runSimulation` / `runBatch` smoke
 * scripts. Here we only verify:
 *
 * 1. `WorldModel.fromScenario` wraps a pre-compiled scenario without I/O.
 * 2. `.scenario` exposes the underlying package unchanged.
 * 3. The façade's public methods have the expected shapes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldModel } from '../../src/runtime/world-model/index.js';
import { marsScenario } from '../../src/engine/mars/index.js';
import { lunarScenario } from '../../src/engine/lunar/index.js';

test('WorldModel.fromScenario wraps a pre-compiled scenario', () => {
  const wm = WorldModel.fromScenario(marsScenario);
  assert.ok(wm instanceof WorldModel, 'fromScenario returns a WorldModel instance');
  assert.equal(wm.scenario, marsScenario, 'underlying scenario is the same reference');
  assert.equal(wm.scenario.id, 'mars-genesis');
});

test('WorldModel.fromScenario works for lunar too (multi-scenario coverage)', () => {
  const wm = WorldModel.fromScenario(lunarScenario);
  assert.equal(wm.scenario.id, 'lunar-outpost');
});

test('WorldModel has simulate and batch methods bound to the instance', () => {
  const wm = WorldModel.fromScenario(marsScenario);
  assert.equal(typeof wm.simulate, 'function', 'simulate is a method');
  assert.equal(typeof wm.batch, 'function', 'batch is a method');
  assert.equal(wm.simulate.length, 1, 'simulate takes 1 required arg (leader)');
});

test('WorldModel.fromJson is an async static factory', () => {
  assert.equal(typeof WorldModel.fromJson, 'function');
  // constructor.length reports required params; static with defaults = 1
  assert.equal(WorldModel.fromJson.length, 1, 'fromJson takes 1 required arg (worldJson)');
});

test('scenario property is readonly at the type level (compile-time check)', () => {
  const wm = WorldModel.fromScenario(marsScenario);
  // `wm.scenario = ...` would be a TS error because scenario is `readonly`.
  // At runtime, readonly is not enforced; we just verify the value is the
  // same reference the caller passed.
  assert.strictEqual(wm.scenario, marsScenario);
});
