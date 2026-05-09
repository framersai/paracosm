/**
 * Tests for `SimulationKernel.toSnapshot` + `fromSnapshot`. Covers
 * the kernel-layer determinism invariant that the fork API depends
 * on: snapshot + restore + advance must match continuous advance.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { SimulationKernel } from '../../../src/engine/core/kernel.js';
import { marsScenario } from '../../../src/engine/builtin-scenarios/index.js';

function freshKernel(seed = 42): SimulationKernel {
  return new SimulationKernel(seed, 'leader-a', [], {
    startTime: marsScenario.setup.defaultStartTime,
    scenario: marsScenario,
  });
}

test('toSnapshot: snapshotVersion is 1', () => {
  const k = freshKernel();
  const snap = k.toSnapshot(marsScenario.id);
  assert.equal(snap.snapshotVersion, 1);
});

test('toSnapshot: scenarioId round-trips', () => {
  const k = freshKernel();
  const snap = k.toSnapshot(marsScenario.id);
  assert.equal(snap.scenarioId, marsScenario.id);
});

test('toSnapshot + fromSnapshot: state round-trips deep-equal', () => {
  const k = freshKernel();
  k.advanceTurn(1, marsScenario.setup.defaultStartTime + 1);
  const snap = k.toSnapshot(marsScenario.id);
  const restored = SimulationKernel.fromSnapshot(snap, marsScenario.id);
  assert.deepEqual(restored.getState(), k.getState());
});

test('toSnapshot: survives JSON.stringify round-trip', () => {
  const k = freshKernel();
  k.advanceTurn(1, marsScenario.setup.defaultStartTime + 1);
  const snap = k.toSnapshot(marsScenario.id);
  const roundtripped = JSON.parse(JSON.stringify(snap));
  const restored = SimulationKernel.fromSnapshot(roundtripped, marsScenario.id);
  assert.deepEqual(restored.getState(), k.getState());
});

test('determinism invariant: snapshot + restore + advance == continuous advance', () => {
  // Continuous: 3 turns on one kernel.
  const kContinuous = freshKernel(950);
  kContinuous.advanceTurn(1, marsScenario.setup.defaultStartTime + 1);
  kContinuous.advanceTurn(2, marsScenario.setup.defaultStartTime + 2);
  kContinuous.advanceTurn(3, marsScenario.setup.defaultStartTime + 3);

  // Forked: 1 turn, snapshot, restore, 2 more turns on the restored kernel.
  const kForked = freshKernel(950);
  kForked.advanceTurn(1, marsScenario.setup.defaultStartTime + 1);
  const snap = kForked.toSnapshot(marsScenario.id);
  const kResumed = SimulationKernel.fromSnapshot(snap, marsScenario.id);
  kResumed.advanceTurn(2, marsScenario.setup.defaultStartTime + 2);
  kResumed.advanceTurn(3, marsScenario.setup.defaultStartTime + 3);

  // Kernel-deterministic fields must match byte-for-byte.
  const sContinuous = kContinuous.getState();
  const sResumed = kResumed.getState();
  assert.deepEqual(sResumed.metrics, sContinuous.metrics);
  assert.deepEqual(sResumed.politics, sContinuous.politics);
  assert.deepEqual(sResumed.statuses, sContinuous.statuses);
  assert.deepEqual(sResumed.environment, sContinuous.environment);
  // Event-log comparison: both kernels should have the same set of
  // deterministic events (births, deaths, promotions) in the same
  // order. Non-deterministic (LLM-driven) events aren't produced in
  // this test path; the only emitter is `advanceTurn` itself.
  assert.equal(sResumed.eventLog.length, sContinuous.eventLog.length);
});

test('fromSnapshot: rejects snapshot with wrong scenarioId', () => {
  const k = freshKernel();
  const snap = k.toSnapshot(marsScenario.id);
  assert.throws(
    () => SimulationKernel.fromSnapshot(snap, 'lunar-outpost'),
    /scenarioId mismatch/,
  );
});

test('fromSnapshot: rejects unsupported snapshotVersion', () => {
  const k = freshKernel();
  const snap = k.toSnapshot(marsScenario.id);
  const v2 = { ...snap, snapshotVersion: 2 as unknown as 1 };
  assert.throws(
    () => SimulationKernel.fromSnapshot(v2, marsScenario.id),
    /snapshotVersion.*is not supported/,
  );
});
