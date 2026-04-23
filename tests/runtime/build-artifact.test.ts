import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunArtifact } from '../../src/runtime/build-artifact.js';
import { RunArtifactSchema } from '../../src/engine/schema/index.js';

const baseInputs = {
  runId: 'run-001',
  scenarioId: 'mars',
  scenarioName: 'Mars Genesis',
  seed: 42,
  startedAt: '2026-04-22T10:00:00.000Z',
  completedAt: '2026-04-22T10:05:00.000Z',
  timeUnit: { singular: 'year', plural: 'years' },
  turnArtifacts: [],
  commanderDecisions: [],
  forgedToolbox: [],
  citationCatalog: [],
  agentReactions: [],
  finalState: { systems: { population: 100, morale: 0.7 }, metadata: {} },
  fingerprint: { resilience: 0.8 },
  cost: { totalUSD: 0.32, llmCalls: 85 },
  providerError: null,
  aborted: false,
};

test('buildRunArtifact produces schema-valid turn-loop artifact', () => {
  const artifact = buildRunArtifact({ ...baseInputs, mode: 'turn-loop' });
  const result = RunArtifactSchema.safeParse(artifact);
  assert.equal(result.success, true, result.success ? '' : JSON.stringify(result.error.issues, null, 2));
  assert.equal(artifact.metadata.mode, 'turn-loop');
  assert.equal(artifact.metadata.runId, 'run-001');
});

test('buildRunArtifact maps turnArtifacts to trajectory.timepoints', () => {
  const inputs = {
    ...baseInputs,
    mode: 'turn-loop' as const,
    turnArtifacts: [
      {
        turn: 1,
        year: 2035,
        stateSnapshotAfter: { population: 100, morale: 0.7 },
        departmentReports: [
          { department: 'medical', summary: 'Stable', confidence: 0.8, risks: [], opportunities: [], citations: [], recommendedActions: [], openQuestions: [] },
        ],
        commanderDecision: { decision: 'Hold course', rationale: 'Stable.', reasoning: '', selectedPolicies: [] },
        policyEffectsApplied: [],
      },
    ],
  };
  const artifact = buildRunArtifact(inputs);
  assert.equal(artifact.trajectory?.timepoints?.length, 1);
  assert.equal(artifact.trajectory?.timepoints?.[0].time, 2035);
  assert.equal(artifact.specialistNotes?.length, 1);
  assert.equal(artifact.specialistNotes?.[0].domain, 'medical');
});

test('buildRunArtifact maps commanderDecisions to decisions[]', () => {
  const inputs = {
    ...baseInputs,
    mode: 'turn-loop' as const,
    commanderDecisions: [
      { turn: 1, year: 2036, actor: 'Captain Reyes', decision: 'Reinforce', rationale: 'Safety.', reasoning: '1. ...', outcome: 'conservative_success' as const },
    ],
  };
  const artifact = buildRunArtifact(inputs);
  assert.equal(artifact.decisions?.length, 1);
  assert.equal(artifact.decisions?.[0].actor, 'Captain Reyes');
  assert.equal(artifact.decisions?.[0].choice, 'Reinforce');
  assert.equal(artifact.decisions?.[0].outcome, 'conservative_success');
});

test('buildRunArtifact maps forgedToolbox to forgedTools[]', () => {
  const inputs = {
    ...baseInputs,
    mode: 'turn-loop' as const,
    forgedToolbox: [{ name: 'radiation_calc', department: 'medical', description: 'Calc dose', approved: true, confidence: 0.9 }],
  };
  const artifact = buildRunArtifact(inputs);
  assert.equal(artifact.forgedTools?.length, 1);
  assert.equal(artifact.forgedTools?.[0].name, 'radiation_calc');
});

test('buildRunArtifact maps citationCatalog to citations[]', () => {
  const inputs = {
    ...baseInputs,
    mode: 'turn-loop' as const,
    citationCatalog: [{ text: 'NASA', url: 'https://x.example', context: 'dose study' }],
  };
  const artifact = buildRunArtifact(inputs);
  assert.equal(artifact.citations?.length, 1);
  assert.equal(artifact.citations?.[0].text, 'NASA');
});

test('buildRunArtifact stashes agentReactions under scenarioExtensions', () => {
  const inputs = {
    ...baseInputs,
    mode: 'turn-loop' as const,
    agentReactions: [{ agentId: 'a1', mood: 'hopeful', quote: 'We can do this.' }],
  };
  const artifact = buildRunArtifact(inputs);
  const ext = artifact.scenarioExtensions as { reactions?: unknown[] } | undefined;
  assert.ok(Array.isArray(ext?.reactions));
  assert.equal(ext?.reactions?.length, 1);
});

test('buildRunArtifact produces valid batch-trajectory artifact without commanderDecisions', () => {
  const artifact = buildRunArtifact({
    ...baseInputs,
    mode: 'batch-trajectory',
    commanderDecisions: [],
    turnArtifacts: [],
  });
  assert.equal(RunArtifactSchema.safeParse(artifact).success, true);
  assert.equal(artifact.metadata.mode, 'batch-trajectory');
});

test('buildRunArtifact produces valid batch-point artifact without trajectory', () => {
  const artifact = buildRunArtifact({
    ...baseInputs,
    mode: 'batch-point',
    commanderDecisions: [],
    turnArtifacts: [],
    finalState: undefined,
    fingerprint: undefined,
  });
  assert.equal(RunArtifactSchema.safeParse(artifact).success, true);
  assert.equal(artifact.trajectory, undefined);
});
