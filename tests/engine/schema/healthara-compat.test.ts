/**
 * Digital-twin shape-compat tests.
 *
 * Verifies that a digital-twin `SimulationResponse` payload (with the
 * field renames documented in the design spec) validates cleanly as a
 * `batch-trajectory` mode `RunArtifact`.
 *
 * Field rename map from digital-twin -> paracosm universal:
 *   - timepoints -> trajectory.timepoints
 *   - leverage_points -> leveragePoints
 *   - risk_flags -> riskFlags
 *   - specialist_notes -> specialistNotes
 *   - health_score (int 0-100) -> score: { value, min: 0, max: 100, label: 'Health Score' }
 *   - body_description -> narrative
 *   - key_metrics -> highlightMetrics
 *
 * If this test ever breaks, the digital-twin adoption path is broken.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { RunArtifactSchema } from '../../../src/engine/schema/index.js';

/**
 * Mirror of a live digital-twin `SimulationResponse` payload, re-bucketed for
 * the universal schema. Same semantic content, renamed keys.
 */
const digital-twinShaped = {
  metadata: {
    runId: 'digital-twin-sim-abc123',
    scenario: {
      id: 'digital-twin-digital-twin',
      name: "Creatine + Sleep Hygiene Protocol",
    },
    mode: 'batch-trajectory' as const,
    startedAt: '2026-04-22T10:00:00.000Z',
    completedAt: '2026-04-22T10:00:04.500Z',
  },
  subject: {
    id: 'user-abc-123',
    name: 'Alice Johnson',
    profile: {
      age: 34,
      gender: 'female',
      diet: 'mediterranean',
      goals: ['improve HRV', 'better sleep quality'],
    },
    signals: [
      { label: 'HRV', value: '45 ms', recordedAt: '2026-04-21T08:00:00.000Z' },
      { label: 'Sleep', value: '7.2 hrs', recordedAt: '2026-04-21T08:00:00.000Z' },
    ],
    markers: [
      { id: 'rs4680', category: 'genome', value: 'AA', interpretation: 'Slow catecholamine clearance.' },
    ],
  },
  intervention: {
    id: 'intv-creatine-sleep',
    name: 'Creatine + Sleep Hygiene Protocol',
    description: '5g creatine daily + consistent 11pm-7am sleep schedule.',
    category: 'supplementation',
    targetBehaviors: ['Take 5g creatine with breakfast', 'Lights out by 11pm'],
    duration: { value: 12, unit: 'weeks' },
    adherenceProfile: {
      expected: 0.7,
      risks: ['Travel disrupts schedule'],
    },
  },
  overview: 'Creatine supplementation combined with consistent sleep hygiene yields gradual HRV recovery over 3 months. COMT slow metabolizer status increases stimulant sensitivity risk.',
  assumptions: [
    'Adherence stays reasonably consistent across the simulation window.',
    'No major medical events, medication changes, or injuries interrupt the scenario.',
    'Morning caffeine cut-off maintained at 10am.',
  ],
  leveragePoints: [
    'Track HRV daily rather than relying on perceived recovery.',
    'Watch for early sleep-quality signals before scaling creatine dose.',
    'Maintain protein timing around evening workout.',
  ],
  disclaimer:
    'This simulation is for informational purposes only and does not constitute medical advice. Consult a healthcare professional before making changes to your health regimen.',
  trajectory: {
    timeUnit: { singular: 'week', plural: 'weeks' },
    timepoints: [
      {
        time: 0,
        label: 'Now',
        narrative: 'Baseline: 7.2h sleep, 45ms HRV, 62bpm resting HR.',
        score: { value: 68, min: 0, max: 100, label: 'Health Score' },
        highlightMetrics: [
          { label: 'Sleep', value: '7.2 hrs', direction: 'stable' as const, color: '#2E90FA' },
          { label: 'HRV', value: '45 ms', direction: 'stable' as const, color: '#2E90FA' },
          { label: 'Resting HR', value: '62 bpm', direction: 'stable' as const, color: '#2E90FA' },
        ],
        confidence: 1.0,
        reasoning: 'Baseline observation.',
      },
      {
        time: 2,
        label: '2 Weeks',
        narrative: 'Early adaptation: sleep quality stable, small HRV gains.',
        score: { value: 70, min: 0, max: 100, label: 'Health Score' },
        highlightMetrics: [
          { label: 'Sleep', value: '7.4 hrs', direction: 'up' as const, color: '#12B76A' },
          { label: 'HRV', value: '48 ms', direction: 'up' as const, color: '#12B76A' },
          { label: 'Resting HR', value: '60 bpm', direction: 'down' as const, color: '#12B76A' },
        ],
        confidence: 0.72,
        reasoning: 'Expected gradual adaptation window.',
      },
      {
        time: 4,
        label: '1 Month',
        narrative: 'HRV trending up, sleep plateaus at 7.5h.',
        score: { value: 73, min: 0, max: 100, label: 'Health Score' },
        highlightMetrics: [
          { label: 'Sleep', value: '7.5 hrs', direction: 'up' as const, color: '#12B76A' },
          { label: 'HRV', value: '51 ms', direction: 'up' as const, color: '#12B76A' },
          { label: 'Resting HR', value: '58 bpm', direction: 'down' as const, color: '#12B76A' },
        ],
        confidence: 0.65,
        reasoning: 'Gradual accumulation of protocol effects.',
      },
      {
        time: 12,
        label: '3 Months',
        narrative: 'Steady state. Recovery capacity improved.',
        score: { value: 77, min: 0, max: 100, label: 'Health Score' },
        highlightMetrics: [
          { label: 'Sleep', value: '7.5 hrs', direction: 'stable' as const, color: '#2E90FA' },
          { label: 'HRV', value: '54 ms', direction: 'up' as const, color: '#12B76A' },
          { label: 'Resting HR', value: '56 bpm', direction: 'down' as const, color: '#12B76A' },
        ],
        confidence: 0.58,
        reasoning: 'Plateau with continued small gains.',
      },
      {
        time: 24,
        label: '6 Months',
        narrative: 'Sustained recovery; adherence drift risk rises.',
        score: { value: 78, min: 0, max: 100, label: 'Health Score' },
        highlightMetrics: [
          { label: 'Sleep', value: '7.4 hrs', direction: 'stable' as const, color: '#2E90FA' },
          { label: 'HRV', value: '54 ms', direction: 'stable' as const, color: '#2E90FA' },
          { label: 'Resting HR', value: '56 bpm', direction: 'stable' as const, color: '#2E90FA' },
        ],
        confidence: 0.5,
        reasoning: 'Long-horizon uncertainty from adherence drift.',
      },
    ],
  },
  specialistNotes: [
    {
      domain: 'Sleep',
      summary: 'Sleep hours plateau at 7.5 after week 2 with improved architecture.',
      trajectory: 'positive' as const,
      confidence: 0.8,
    },
    {
      domain: 'Nutrition',
      summary: 'Creatine loading absorbed well; protein timing supports recovery.',
      trajectory: 'positive' as const,
      confidence: 0.75,
    },
    {
      domain: 'Movement',
      summary: 'Cardiorespiratory fitness improves gradually; strength stimulus ok.',
      trajectory: 'positive' as const,
      confidence: 0.7,
    },
    {
      domain: 'Recovery',
      summary: 'HRV gains reflect reduced autonomic stress load.',
      trajectory: 'positive' as const,
      confidence: 0.7,
    },
    {
      domain: 'Risk',
      summary: 'COMT slow metabolizer means caffeine timing has outsized effect.',
      trajectory: 'mixed' as const,
      confidence: 0.85,
    },
  ],
  riskFlags: [
    { label: 'Stimulant load', severity: 'medium' as const, detail: 'COMT slow metabolizer amplifies late-day caffeine effect.' },
    { label: 'Adherence drift', severity: 'low' as const, detail: 'Long-horizon protocols typically lose 30% adherence by month 6.' },
  ],
  cost: { totalUSD: 0.04, llmCalls: 7, inputTokens: 14500, outputTokens: 3100 },
  scenarioExtensions: {
    genomeSignals: [
      { rsid: 'rs4680', gene: 'COMT', genotype: 'AA', interpretation: 'Slow catecholamine clearance.' },
    ],
    healthSignals: [
      { label: 'Sleep', value: '7.2 hrs', recorded_at: '2026-04-21T08:00:00Z' },
      { label: 'HRV', value: '45 ms', recorded_at: '2026-04-21T08:00:00Z' },
    ],
  },
};

test('digital-twin-shaped SimulationResponse validates as batch-trajectory RunArtifact', () => {
  const result = RunArtifactSchema.safeParse(digital-twinShaped);
  assert.equal(
    result.success,
    true,
    result.success ? '' : `parse failed:\n${JSON.stringify(result.error.issues, null, 2)}`,
  );
});

test('digital-twin fixture preserves all five timepoints + five specialist notes', () => {
  const result = RunArtifactSchema.safeParse(digital-twinShaped);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.trajectory?.timepoints?.length, 5);
    assert.equal(result.data.specialistNotes?.length, 5);
    assert.equal(result.data.riskFlags?.length, 2);
    assert.equal(result.data.metadata.mode, 'batch-trajectory');
  }
});

test('digital-twin scenarioExtensions.genomeSignals survives round-trip', () => {
  const result = RunArtifactSchema.safeParse(digital-twinShaped);
  assert.equal(result.success, true);
  if (result.success) {
    const genome = result.data.scenarioExtensions?.genomeSignals as Array<{ rsid: string; gene: string }>;
    assert.equal(Array.isArray(genome), true);
    assert.equal(genome[0].rsid, 'rs4680');
    assert.equal(genome[0].gene, 'COMT');
  }
});

test('digital-twin fixture carries subject + intervention through RunArtifactSchema.parse', () => {
  const result = RunArtifactSchema.safeParse(digital-twinShaped);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.subject?.id, 'user-abc-123');
    assert.equal(result.data.subject?.name, 'Alice Johnson');
    assert.equal(result.data.subject?.markers?.[0].id, 'rs4680');
    assert.equal(result.data.subject?.markers?.[0].category, 'genome');
    assert.equal(result.data.subject?.signals?.length, 2);
    assert.equal(result.data.intervention?.name, 'Creatine + Sleep Hygiene Protocol');
    assert.equal(result.data.intervention?.category, 'supplementation');
    assert.equal(result.data.intervention?.adherenceProfile?.expected, 0.7);
    assert.equal(result.data.intervention?.duration?.value, 12);
    assert.equal(result.data.intervention?.duration?.unit, 'weeks');
  }
});
