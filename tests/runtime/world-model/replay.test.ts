/**
 * Tests for `WorldModel.replay`. The replay path re-executes the
 * deterministic between-turn progression hook from each recorded
 * snapshot to the next, captures fresh snapshots, and compares them to
 * the input artifact's snapshots. These tests exercise the precondition
 * checks plus the round-trip + divergence-detection invariants without
 * touching any LLM provider.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { WorldModel, WorldModelReplayError } from '../../../src/runtime/world-model/index.js';
import { SimulationKernel } from '../../../src/engine/core/kernel.js';
import { marsScenario } from '../../../src/engine/scenarios/index.js';
import { lunarScenario } from '../../../src/engine/scenarios/index.js';
import type { RunArtifact } from '../../../src/engine/schema/index.js';
import type { KernelSnapshot } from '../../../src/engine/core/snapshot.js';

function captureSnapshots(turns: number, seed = 42): KernelSnapshot[] {
  const kernel = new SimulationKernel(seed, 'leader-a', [], {
    startTime: marsScenario.setup.defaultStartTime,
    scenario: marsScenario,
  });
  const snapshots: KernelSnapshot[] = [kernel.toSnapshot(marsScenario.id)];
  for (let t = 1; t <= turns; t++) {
    kernel.advanceTurn(t, marsScenario.setup.defaultStartTime + t, marsScenario.hooks?.progressionHook);
    snapshots.push(kernel.toSnapshot(marsScenario.id));
  }
  return snapshots;
}

function syntheticArtifact(snaps: KernelSnapshot[], scenarioId = marsScenario.id): RunArtifact {
  return {
    metadata: {
      runId: 'test-replay',
      scenario: { id: scenarioId, name: marsScenario.labels.name },
      mode: 'turn-loop',
      startedAt: '2026-04-25T00:00:00.000Z',
      seed: 42,
    },
    decisions: snaps.slice(0, -1).map((_, i) => ({
      id: `dec-${i}`,
      turn: i + 1,
      label: `Test decision turn ${i + 1}`,
      chosenOptionId: 'safe',
      reasoning: 'test',
    })),
    scenarioExtensions: {
      kernelSnapshotsPerTurn: snaps,
    },
  } as unknown as RunArtifact;
}

test('WorldModel.replay matches=true when re-execution produces equal snapshots', async () => {
  const wm = WorldModel.fromScenario(marsScenario);
  const snaps = captureSnapshots(3);
  const artifact = syntheticArtifact(snaps);

  const result = await wm.replay(artifact);

  assert.equal(result.matches, true, `Expected match; divergence: ${result.divergence}`);
  assert.equal(result.divergence, '');
  assert.ok(result.artifact.metadata.runId.startsWith('replay-'));
  // Fresh snapshots count equals the input.
  const freshSnaps = (result.artifact.scenarioExtensions as { kernelSnapshotsPerTurn?: KernelSnapshot[] } | undefined)?.kernelSnapshotsPerTurn ?? [];
  assert.equal(freshSnaps.length, snaps.length);
});

test('WorldModel.replay returns matches=false with divergence path when a snapshot is mutated', async () => {
  const wm = WorldModel.fromScenario(marsScenario);
  const snaps = captureSnapshots(3);
  // Mutate the snapshot at index 2 to simulate kernel drift: shift a
  // metric so re-execution produces a different value than is recorded.
  const tampered = JSON.parse(JSON.stringify(snaps)) as KernelSnapshot[];
  (tampered[2].state as unknown as { metrics: Record<string, number> }).metrics.morale = 0.123456789;
  const artifact = syntheticArtifact(tampered);

  const result = await wm.replay(artifact);

  assert.equal(result.matches, false);
  assert.ok(result.divergence.length > 0, 'divergence string must be non-empty');
});

test('WorldModel.replay throws WorldModelReplayError when snapshots are missing', async () => {
  const wm = WorldModel.fromScenario(marsScenario);
  const noSnaps: RunArtifact = {
    metadata: { runId: 'r1', scenario: { id: marsScenario.id, name: 'Mars' }, mode: 'turn-loop', startedAt: '2026-04-25T00:00:00.000Z' },
    decisions: [{ id: 'd', turn: 1, label: 'x', chosenOptionId: 'a' }],
  } as unknown as RunArtifact;

  await assert.rejects(
    () => wm.replay(noSnaps),
    (err: unknown) => err instanceof WorldModelReplayError && /per-turn kernel snapshots/.test((err as Error).message),
  );
});

test('WorldModel.replay throws WorldModelReplayError when decisions are missing', async () => {
  const wm = WorldModel.fromScenario(marsScenario);
  const snaps = captureSnapshots(2);
  const noDecisions: RunArtifact = {
    metadata: { runId: 'r1', scenario: { id: marsScenario.id, name: 'Mars' }, mode: 'turn-loop', startedAt: '2026-04-25T00:00:00.000Z' },
    scenarioExtensions: { kernelSnapshotsPerTurn: snaps },
  } as unknown as RunArtifact;

  await assert.rejects(
    () => wm.replay(noDecisions),
    (err: unknown) => err instanceof WorldModelReplayError && /recorded decisions/.test((err as Error).message),
  );
});

test('WorldModel.replay throws WorldModelReplayError on cross-scenario mismatch', async () => {
  const wmLunar = WorldModel.fromScenario(lunarScenario);
  const snaps = captureSnapshots(2);  // captured against marsScenario
  const marsArtifact = syntheticArtifact(snaps);

  await assert.rejects(
    () => wmLunar.replay(marsArtifact),
    (err: unknown) => err instanceof WorldModelReplayError && /Scenario id mismatch/.test((err as Error).message),
  );
});
