/**
 * Tests for `WorldModel.simulateIntervention`. Verifies the method is
 * a thin pass-through over `simulate()` that forwards subject and
 * intervention onto the underlying RunOptions, with the rest of the
 * options preserved verbatim.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldModel } from '../../../src/runtime/world-model/index.js';
import { marsScenario } from '../../../src/engine/mars/index.js';
import type { LeaderConfig } from '../../../src/runtime/orchestrator.js';
import type { SubjectConfig, InterventionConfig, RunArtifact } from '../../../src/engine/schema/index.js';

const LEADER: LeaderConfig = {
  name: 'Intervention Leader',
  archetype: 'Tester',
  unit: 'Test Unit',
  hexaco: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5 },
  instructions: '',
};

const SUBJECT: SubjectConfig = {
  id: 'subject-1',
  kind: 'organization',
  attributes: { headcount: 100, runwayMonths: 18 },
} as unknown as SubjectConfig;

const INTERVENTION: InterventionConfig = {
  id: 'layoff-25pct',
  kind: 'policy',
  description: '25% reduction in force across all departments',
  parameters: { percent: 25 },
} as unknown as InterventionConfig;

test('WorldModel.simulateIntervention forwards subject and intervention into RunOptions', async () => {
  const wm = WorldModel.fromScenario(marsScenario);
  let captured: { subject?: SubjectConfig; intervention?: InterventionConfig } = {};
  (wm as unknown as { simulate: (l: LeaderConfig, o?: { subject?: SubjectConfig; intervention?: InterventionConfig }) => Promise<RunArtifact> }).simulate = async (_leader, opts) => {
    captured = { subject: opts?.subject, intervention: opts?.intervention };
    return {
      metadata: { runId: 'r1', scenario: { id: marsScenario.id, name: 'Mars' }, mode: 'turn-loop', startedAt: '2026-04-25T00:00:00.000Z' },
    } as unknown as RunArtifact;
  };

  await wm.simulateIntervention(SUBJECT, INTERVENTION, LEADER, { maxTurns: 3 });

  assert.deepEqual(captured.subject, SUBJECT);
  assert.deepEqual(captured.intervention, INTERVENTION);
});

test('WorldModel.simulateIntervention preserves additional simulate options', async () => {
  const wm = WorldModel.fromScenario(marsScenario);
  let capturedOpts: Record<string, unknown> = {};
  (wm as unknown as { simulate: (l: LeaderConfig, o?: Record<string, unknown>) => Promise<RunArtifact> }).simulate = async (_l, opts) => {
    capturedOpts = (opts ?? {}) as Record<string, unknown>;
    return { metadata: { runId: 'r2', scenario: { id: marsScenario.id, name: 'Mars' }, mode: 'turn-loop', startedAt: '2026-04-25T00:00:00.000Z' } } as unknown as RunArtifact;
  };

  await wm.simulateIntervention(SUBJECT, INTERVENTION, LEADER, { maxTurns: 5, seed: 7, captureSnapshots: true });

  assert.equal(capturedOpts.maxTurns, 5);
  assert.equal(capturedOpts.seed, 7);
  assert.equal(capturedOpts.captureSnapshots, true);
});
