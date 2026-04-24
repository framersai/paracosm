/**
 * Tests for the `/setup` POST fork-dispatch path (Spec 2B).
 *
 * Full HTTP-handler integration tests (multi-leader reject,
 * cross-scenario reject, missing-snapshots reject, active-run 409)
 * require spinning up the Node server + its AgentOS / runSimulation
 * imports. This unit-test layer covers the two pieces that sit
 * BELOW the handler:
 *
 * 1. `normalizeSimulationConfig` passes forkFrom + captureSnapshots
 *    through verbatim into the NormalizedSimulationConfig that
 *    `/setup` hands to `startWithConfig`.
 * 2. The fakeParentArtifact harness mirrors the structural
 *    preconditions the server checks: scenario id in metadata + an
 *    embedded kernelSnapshotsPerTurn array in scenarioExtensions.
 *
 * Spec 2A's existing `WorldModel.forkFromArtifact` tests cover the
 * same validation paths at the façade layer, so redundant
 * guardrails catch errors at two levels without duplicating the
 * runtime-heavy spin-up.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSimulationConfig } from '../../src/cli/sim-config.js';
import { marsScenario } from '../../src/engine/mars/index.js';
import { lunarScenario } from '../../src/engine/lunar/index.js';
import type { RunArtifact } from '../../src/engine/schema/index.js';

function fakeParentArtifact(overrides: {
  scenarioId?: string;
  withSnapshots?: boolean;
} = {}): RunArtifact {
  const { scenarioId = marsScenario.id, withSnapshots = true } = overrides;
  return {
    metadata: {
      runId: 'parent-1',
      scenario: { id: scenarioId, name: 'Parent Run' },
      mode: 'turn-loop',
      startedAt: '2026-04-24T00:00:00.000Z',
    },
    scenarioExtensions: withSnapshots
      ? {
          kernelSnapshotsPerTurn: [
            {
              snapshotVersion: 1,
              scenarioId,
              turn: 1,
              time: 1,
              state: {} as never,
              rngState: 0,
              startTime: 0,
              seed: 42,
            },
          ],
        }
      : {},
  } as unknown as RunArtifact;
}

function fakeLeader(name = 'Forked Leader') {
  return {
    name,
    archetype: 'Fork Test',
    unit: 'Test',
    hexaco: {
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      emotionality: 0.5,
      honestyHumility: 0.5,
    },
    instructions: '',
  };
}

test('normalizeSimulationConfig: passes forkFrom through verbatim', () => {
  const parent = fakeParentArtifact();
  const normalized = normalizeSimulationConfig({
    leaders: [fakeLeader()],
    turns: 3,
    seed: 42,
    forkFrom: { parentArtifact: parent, atTurn: 1 },
    captureSnapshots: true,
  } as never);
  assert.deepEqual(normalized.forkFrom, { parentArtifact: parent, atTurn: 1 });
  assert.equal(normalized.captureSnapshots, true);
});

test('normalizeSimulationConfig: captureSnapshots defaults to false when absent', () => {
  const normalized = normalizeSimulationConfig({
    leaders: [fakeLeader(), fakeLeader('B')],
    turns: 3,
    seed: 42,
  } as never);
  assert.equal(normalized.captureSnapshots, false);
  assert.equal(normalized.forkFrom, undefined);
});

test('normalizeSimulationConfig: forkFrom omitted when not supplied', () => {
  const normalized = normalizeSimulationConfig({
    leaders: [fakeLeader(), fakeLeader('B')],
    turns: 3,
    seed: 42,
  } as never);
  assert.equal(normalized.forkFrom, undefined);
});

test('fakeParentArtifact harness: withSnapshots=true produces embedded kernelSnapshotsPerTurn', () => {
  const a = fakeParentArtifact({ withSnapshots: true });
  const snaps = (a.scenarioExtensions as { kernelSnapshotsPerTurn?: unknown[] } | undefined)
    ?.kernelSnapshotsPerTurn;
  assert.ok(Array.isArray(snaps));
  assert.equal(snaps!.length, 1);
});

test('fakeParentArtifact harness: withSnapshots=false produces empty scenarioExtensions', () => {
  const a = fakeParentArtifact({ withSnapshots: false });
  assert.deepEqual(a.scenarioExtensions, {});
});

test('fakeParentArtifact harness: scenarioId override flows through metadata + snapshot', () => {
  const a = fakeParentArtifact({ scenarioId: lunarScenario.id });
  assert.equal(a.metadata.scenario.id, lunarScenario.id);
  const snap = (a.scenarioExtensions as { kernelSnapshotsPerTurn?: Array<{ scenarioId: string }> } | undefined)
    ?.kernelSnapshotsPerTurn?.[0];
  assert.equal(snap?.scenarioId, lunarScenario.id);
});
