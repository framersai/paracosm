import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CitationSchema,
  CostSchema,
  DecisionSchema,
  HighlightMetricSchema,
  ProviderErrorSchema,
  RiskFlagSchema,
  RunMetadataSchema,
  ScoreSchema,
  SimulationModeSchema,
  SpecialistNoteSchema,
  TimepointSchema,
  TrajectoryPointSchema,
  TrajectorySchema,
  WorldSnapshotSchema,
} from '../../../src/engine/schema/index.js';

// ---------------------------------------------------------------------------
// SimulationMode
// ---------------------------------------------------------------------------

test('SimulationModeSchema accepts the three valid modes', () => {
  for (const mode of ['turn-loop', 'batch-trajectory', 'batch-point']) {
    assert.equal(SimulationModeSchema.safeParse(mode).success, true, `should accept ${mode}`);
  }
});

test('SimulationModeSchema rejects unknown modes', () => {
  assert.equal(SimulationModeSchema.safeParse('streaming').success, false);
  assert.equal(SimulationModeSchema.safeParse('').success, false);
});

// ---------------------------------------------------------------------------
// RunMetadata
// ---------------------------------------------------------------------------

test('RunMetadataSchema accepts minimal valid metadata', () => {
  const metadata = {
    runId: 'run-001',
    scenario: { id: 'mars', name: 'Mars Genesis' },
    mode: 'turn-loop',
    startedAt: '2026-04-22T10:00:00.000Z',
  };
  const result = RunMetadataSchema.safeParse(metadata);
  assert.equal(result.success, true);
});

test('RunMetadataSchema accepts optional seed + completedAt + scenario.version', () => {
  const metadata = {
    runId: 'run-001',
    scenario: { id: 'mars', name: 'Mars Genesis', version: '2.1.0' },
    seed: 42,
    mode: 'turn-loop',
    startedAt: '2026-04-22T10:00:00.000Z',
    completedAt: '2026-04-22T10:05:00.000Z',
  };
  assert.equal(RunMetadataSchema.safeParse(metadata).success, true);
});

test('RunMetadataSchema rejects missing runId', () => {
  const bad = {
    scenario: { id: 'mars', name: 'Mars Genesis' },
    mode: 'turn-loop',
    startedAt: '2026-04-22T10:00:00.000Z',
  };
  assert.equal(RunMetadataSchema.safeParse(bad).success, false);
});

test('RunMetadataSchema rejects invalid startedAt (not ISO datetime)', () => {
  const bad = {
    runId: 'run-001',
    scenario: { id: 'mars', name: 'Mars Genesis' },
    mode: 'turn-loop',
    startedAt: 'yesterday',
  };
  assert.equal(RunMetadataSchema.safeParse(bad).success, false);
});

// ---------------------------------------------------------------------------
// WorldSnapshot
// ---------------------------------------------------------------------------

test('WorldSnapshotSchema accepts metrics-only snapshot', () => {
  const snap = { metrics: { population: 120, morale: 0.72 } };
  assert.equal(WorldSnapshotSchema.safeParse(snap).success, true);
});

test('WorldSnapshotSchema accepts all five bags', () => {
  const snap = {
    metrics: { population: 120 },
    capacities: { habitats: 4 },
    statuses: { governance: 'stable', ratified: true },
    politics: { independencePressure: 0.3, earthRelation: 'warm' },
    environment: { radiationMsv: 0.67, sandstorm: false },
  };
  assert.equal(WorldSnapshotSchema.safeParse(snap).success, true);
});

test('WorldSnapshotSchema rejects snapshot without metrics', () => {
  assert.equal(WorldSnapshotSchema.safeParse({}).success, false);
});

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

test('ScoreSchema accepts arbitrary bounds', () => {
  const a = { value: 72, min: 0, max: 100, label: 'Health Score' };
  const b = { value: -3, min: -10, max: 10, label: 'Realm Stability' };
  assert.equal(ScoreSchema.safeParse(a).success, true);
  assert.equal(ScoreSchema.safeParse(b).success, true);
});

test('ScoreSchema rejects empty label', () => {
  const bad = { value: 72, min: 0, max: 100, label: '' };
  assert.equal(ScoreSchema.safeParse(bad).success, false);
});

// ---------------------------------------------------------------------------
// HighlightMetric
// ---------------------------------------------------------------------------

test('HighlightMetricSchema accepts minimal + full shapes', () => {
  const minimal = { label: 'VO2 Max', value: '48.2 ml/kg/min' };
  const full = { label: 'Morale', value: '72%', direction: 'up', color: '#12B76A' };
  assert.equal(HighlightMetricSchema.safeParse(minimal).success, true);
  assert.equal(HighlightMetricSchema.safeParse(full).success, true);
});

test('HighlightMetricSchema rejects invalid direction', () => {
  const bad = { label: 'X', value: '1', direction: 'sideways' };
  assert.equal(HighlightMetricSchema.safeParse(bad).success, false);
});

// ---------------------------------------------------------------------------
// Timepoint
// ---------------------------------------------------------------------------

test('TimepointSchema accepts digital-twin 5-timepoint shape (field-renamed)', () => {
  const tp = {
    time: 14,
    label: '2 Weeks',
    narrative: 'Body adapts to protocol; small HRV gains.',
    score: { value: 74, min: 0, max: 100, label: 'Health Score' },
    highlightMetrics: [
      { label: 'HRV', value: '52 ms', direction: 'up' },
      { label: 'Sleep', value: '7.8 hrs', direction: 'up' },
      { label: 'Resting HR', value: '58 bpm', direction: 'stable' },
    ],
    confidence: 0.72,
    reasoning: 'Expected gradual adaptation.',
  };
  assert.equal(TimepointSchema.safeParse(tp).success, true);
});

test('TimepointSchema accepts paracosm-style turn snapshot', () => {
  const tp = {
    time: 2043,
    label: 'Year 2043',
    worldSnapshot: { metrics: { population: 150, morale: 0.68 } },
  };
  assert.equal(TimepointSchema.safeParse(tp).success, true);
});

test('TimepointSchema rejects empty label', () => {
  const bad = { time: 0, label: '' };
  assert.equal(TimepointSchema.safeParse(bad).success, false);
});

// ---------------------------------------------------------------------------
// TrajectoryPoint + Trajectory
// ---------------------------------------------------------------------------

test('TrajectoryPointSchema accepts sparkline-style sample', () => {
  const p = { time: 5, metrics: { population: 120, morale: 0.7 } };
  assert.equal(TrajectoryPointSchema.safeParse(p).success, true);
});

test('TrajectorySchema accepts both points and timepoints populated', () => {
  const traj = {
    timeUnit: { singular: 'year', plural: 'years' },
    points: [{ time: 0, metrics: { x: 1 } }, { time: 1, metrics: { x: 2 } }],
    timepoints: [{ time: 0, label: 'Start' }],
  };
  assert.equal(TrajectorySchema.safeParse(traj).success, true);
});

test('TrajectorySchema rejects empty timeUnit strings', () => {
  const bad = { timeUnit: { singular: '', plural: 'years' } };
  assert.equal(TrajectorySchema.safeParse(bad).success, false);
});

// ---------------------------------------------------------------------------
// Citation
// ---------------------------------------------------------------------------

test('CitationSchema accepts full citation', () => {
  const c = {
    text: 'NASA HRP study on Mars radiation',
    url: 'https://example.com/hrp',
    doi: '10.1234/abc',
    context: 'cumulative dose calculation',
  };
  assert.equal(CitationSchema.safeParse(c).success, true);
});

test('CitationSchema defaults context to empty string', () => {
  const result = CitationSchema.safeParse({ text: 'x', url: 'https://example.com' });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.context, '');
  }
});

// ---------------------------------------------------------------------------
// SpecialistNote
// ---------------------------------------------------------------------------

test('SpecialistNoteSchema accepts thin digital-twin note (no detail)', () => {
  const note = {
    domain: 'sleep',
    summary: 'Sleep hours plateau at 7.5 after week 2.',
    trajectory: 'positive',
    confidence: 0.8,
  };
  assert.equal(SpecialistNoteSchema.safeParse(note).success, true);
});

test('SpecialistNoteSchema accepts thick paracosm-style note (with detail)', () => {
  const note = {
    domain: 'medical',
    summary: 'Two crew near annual radiation limit; shielding proposed.',
    trajectory: 'mixed',
    confidence: 0.85,
    detail: {
      risks: [{ severity: 'high', description: 'two crew near limit' }],
      opportunities: [{ impact: 'medium', description: 'new shielding tech' }],
      recommendedActions: ['Increase shielding on crew quarters'],
      citations: [{ text: 'NASA', url: 'https://x.example', context: '' }],
      openQuestions: ['Is tritium shielding cost-effective?'],
    },
  };
  assert.equal(SpecialistNoteSchema.safeParse(note).success, true);
});

// ---------------------------------------------------------------------------
// RiskFlag
// ---------------------------------------------------------------------------

test('RiskFlagSchema accepts digital-twin-compatible shape', () => {
  const flag = { label: 'Stimulant load', severity: 'medium', detail: 'COMT slow metabolizer.' };
  assert.equal(RiskFlagSchema.safeParse(flag).success, true);
});

test('RiskFlagSchema rejects invalid severity', () => {
  const bad = { label: 'x', severity: 'extreme', detail: 'y' };
  assert.equal(RiskFlagSchema.safeParse(bad).success, false);
});

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

test('DecisionSchema accepts minimal decision', () => {
  const d = { time: 1, choice: 'Reinforce from inside' };
  assert.equal(DecisionSchema.safeParse(d).success, true);
});

test('DecisionSchema accepts full paracosm-style decision with CoT', () => {
  const d = {
    time: 3,
    actor: 'Captain Reyes',
    choice: 'Send exterior repair crews',
    rationale: 'Risk acceptable; delay unacceptable.',
    reasoning: '1. High openness leans toward action...',
    outcome: 'risky_success',
  };
  assert.equal(DecisionSchema.safeParse(d).success, true);
});

test('DecisionSchema rejects invalid outcome', () => {
  const bad = { time: 0, choice: 'x', outcome: 'catastrophic_success' };
  assert.equal(DecisionSchema.safeParse(bad).success, false);
});

// ---------------------------------------------------------------------------
// Cost + ProviderError
// ---------------------------------------------------------------------------

test('CostSchema accepts totalUSD-only', () => {
  assert.equal(CostSchema.safeParse({ totalUSD: 0.32 }).success, true);
});

test('CostSchema accepts full breakdown', () => {
  const c = {
    totalUSD: 0.52,
    llmCalls: 120,
    inputTokens: 15000,
    outputTokens: 3200,
    cachedReadTokens: 12000,
    cacheSavingsUSD: 0.18,
    breakdown: { director: 0.12, departments: 0.34, commander: 0.06 },
  };
  assert.equal(CostSchema.safeParse(c).success, true);
});

test('CostSchema rejects negative totals', () => {
  assert.equal(CostSchema.safeParse({ totalUSD: -1 }).success, false);
});

test('ProviderErrorSchema accepts classified shape', () => {
  const e = { kind: 'quota', provider: 'anthropic', message: 'Quota exceeded' };
  assert.equal(ProviderErrorSchema.safeParse(e).success, true);
});

test('ProviderErrorSchema rejects unknown kind', () => {
  const bad = { kind: 'malformed', provider: 'x', message: 'y' };
  assert.equal(ProviderErrorSchema.safeParse(bad).success, false);
});

// ---------------------------------------------------------------------------
// scenarioExtensions escape hatch
// ---------------------------------------------------------------------------

test('scenarioExtensions accepts arbitrary unknown payloads', () => {
  const snap = {
    metrics: { population: 120 },
    scenarioExtensions: {
      marsRadiationMsv: 0.67,
      genomeMarkers: { rs4680: { gene: 'COMT', genotype: 'AA' } },
      gameInventory: [{ item: 'medkit', count: 3 }],
    },
  };
  assert.equal(WorldSnapshotSchema.safeParse(snap).success, true);
});
