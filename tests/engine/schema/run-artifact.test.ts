import test from 'node:test';
import assert from 'node:assert/strict';

import { RunArtifactSchema } from '../../../src/engine/schema/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseMetadata = {
  runId: 'run-fixture-001',
  scenario: { id: 'mars', name: 'Mars Genesis' },
  startedAt: '2026-04-22T10:00:00.000Z',
  completedAt: '2026-04-22T10:05:00.000Z',
};

const turnLoopFixture = {
  metadata: { ...baseMetadata, seed: 42, mode: 'turn-loop' as const },
  overview: 'Bold expansion outpaced cautious engineering.',
  trajectory: {
    timeUnit: { singular: 'year', plural: 'years' },
    points: [
      { time: 2035, metrics: { population: 100, morale: 0.7 } },
      { time: 2043, metrics: { population: 130, morale: 0.65 } },
    ],
    timepoints: [
      { time: 2035, label: 'Year 2035', worldSnapshot: { metrics: { population: 100 } } },
      { time: 2043, label: 'Year 2043', worldSnapshot: { metrics: { population: 130 } } },
    ],
  },
  specialistNotes: [
    { domain: 'medical', summary: 'Health stable.', trajectory: 'neutral' as const },
  ],
  decisions: [
    { time: 2036, actor: 'Captain Reyes', choice: 'Reinforce from inside', outcome: 'conservative_success' as const },
    { time: 2037, actor: 'Captain Reyes', choice: 'Deploy new habitat', outcome: 'risky_success' as const },
  ],
  finalState: { metrics: { population: 130, morale: 0.65 } },
  fingerprint: { resilience: 0.8, innovation: 0.6, riskStyle: 'measured' },
  citations: [{ text: 'NASA', url: 'https://x.example', context: '' }],
  forgedTools: [{ name: 'radiation_calc', approved: true, confidence: 0.92 }],
  cost: { totalUSD: 0.32, llmCalls: 85 },
  providerError: null,
  aborted: false,
};

const batchTrajectoryFixture = {
  metadata: { ...baseMetadata, mode: 'batch-trajectory' as const },
  overview: 'Creatine + sleep hygiene yields gradual HRV recovery over 3 months.',
  assumptions: ['Adherence stays consistent.', 'No major illness events.'],
  leveragePoints: ['Morning sunlight exposure.', 'Protein timing.'],
  disclaimer: 'This simulation is for informational purposes only.',
  trajectory: {
    timeUnit: { singular: 'week', plural: 'weeks' },
    timepoints: [
      { time: 0, label: 'Now', narrative: 'Baseline.', score: { value: 68, min: 0, max: 100, label: 'Health Score' }, confidence: 1.0, reasoning: 'Starting point.' },
      { time: 2, label: '2 Weeks', narrative: 'Early adaptation.', score: { value: 70, min: 0, max: 100, label: 'Health Score' }, confidence: 0.72, reasoning: 'Expected adaptation.' },
      { time: 4, label: '1 Month', narrative: 'HRV trending up.', score: { value: 73, min: 0, max: 100, label: 'Health Score' }, confidence: 0.65, reasoning: 'Gradual gains.' },
      { time: 12, label: '3 Months', narrative: 'Steady state.', score: { value: 77, min: 0, max: 100, label: 'Health Score' }, confidence: 0.58, reasoning: 'Plateau.' },
      { time: 24, label: '6 Months', narrative: 'Sustained recovery.', score: { value: 78, min: 0, max: 100, label: 'Health Score' }, confidence: 0.5, reasoning: 'Drift risk rises.' },
    ],
  },
  specialistNotes: [
    { domain: 'sleep', summary: 'Sleep hours plateau at 7.5.', trajectory: 'positive' as const, confidence: 0.8 },
    { domain: 'nutrition', summary: 'Protein timing improves recovery.', trajectory: 'positive' as const, confidence: 0.7 },
  ],
  riskFlags: [{ label: 'Stimulant load', severity: 'medium' as const, detail: 'COMT slow metabolizer.' }],
  cost: { totalUSD: 0.04, llmCalls: 6 },
};

const batchPointFixture = {
  metadata: { ...baseMetadata, mode: 'batch-point' as const },
  overview: 'Short answer: yes, with two caveats.',
  assumptions: ['Baseline diet unchanged.'],
  leveragePoints: ['Focus on the first two weeks.'],
  specialistNotes: [{ domain: 'general', summary: 'Proceed with caution.' }],
  riskFlags: [{ label: 'Interaction', severity: 'low' as const, detail: 'Minor drug interaction noted.' }],
  cost: { totalUSD: 0.01 },
};

// ---------------------------------------------------------------------------
// Required-field tests
// ---------------------------------------------------------------------------

test('RunArtifactSchema requires metadata', () => {
  const bad = { overview: 'x' };
  assert.equal(RunArtifactSchema.safeParse(bad).success, false);
});

test('RunArtifactSchema accepts metadata-only minimal artifact', () => {
  const minimal = { metadata: { ...baseMetadata, mode: 'batch-point' as const } };
  assert.equal(RunArtifactSchema.safeParse(minimal).success, true);
});

// ---------------------------------------------------------------------------
// Per-mode fixtures
// ---------------------------------------------------------------------------

test('RunArtifactSchema accepts full turn-loop fixture', () => {
  const result = RunArtifactSchema.safeParse(turnLoopFixture);
  assert.equal(result.success, true, result.success ? '' : JSON.stringify(result.error.issues, null, 2));
});

test('RunArtifactSchema accepts full batch-trajectory fixture (digital-twin-shape)', () => {
  const result = RunArtifactSchema.safeParse(batchTrajectoryFixture);
  assert.equal(result.success, true, result.success ? '' : JSON.stringify(result.error.issues, null, 2));
});

test('RunArtifactSchema accepts full batch-point fixture', () => {
  const result = RunArtifactSchema.safeParse(batchPointFixture);
  assert.equal(result.success, true, result.success ? '' : JSON.stringify(result.error.issues, null, 2));
});

// ---------------------------------------------------------------------------
// Mode-enum tests
// ---------------------------------------------------------------------------

test('RunArtifactSchema rejects unknown mode', () => {
  const bad = { metadata: { ...baseMetadata, mode: 'streaming' } };
  assert.equal(RunArtifactSchema.safeParse(bad).success, false);
});

// ---------------------------------------------------------------------------
// providerError nullable
// ---------------------------------------------------------------------------

test('RunArtifactSchema accepts null providerError', () => {
  const artifact = { metadata: { ...baseMetadata, mode: 'turn-loop' as const }, providerError: null };
  assert.equal(RunArtifactSchema.safeParse(artifact).success, true);
});

test('RunArtifactSchema accepts populated providerError', () => {
  const artifact = {
    metadata: { ...baseMetadata, mode: 'turn-loop' as const },
    providerError: { kind: 'quota' as const, provider: 'anthropic', message: 'quota exceeded' },
  };
  assert.equal(RunArtifactSchema.safeParse(artifact).success, true);
});

// ---------------------------------------------------------------------------
// scenarioExtensions escape hatch
// ---------------------------------------------------------------------------

test('RunArtifactSchema carries scenarioExtensions at top level', () => {
  const artifact = {
    metadata: { ...baseMetadata, mode: 'batch-trajectory' as const },
    scenarioExtensions: {
      genomeMarkers: [{ rsid: 'rs4680', gene: 'COMT' }],
      marsRadiation: { cumulativeMsv: 180 },
    },
  };
  assert.equal(RunArtifactSchema.safeParse(artifact).success, true);
});
