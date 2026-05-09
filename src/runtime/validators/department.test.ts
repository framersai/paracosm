import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DepartmentReportSchema,
  RiskSchema,
  OpportunitySchema,
  ForgedToolUsageSchema,
  RecommendedEffectSchema,
} from './department.js';

const validReport = {
  department: 'medical',
  summary: 'Radiation exposure is trending up; 3 near-threshold cases.',
  citations: [{ text: 'NASA HRP', url: 'https://example.com/hrp', context: 'dose study' }],
  risks: [{ severity: 'high', description: 'two crew near annual limit' }],
  opportunities: [],
  recommendedActions: ['Increase shielding on crew quarters'],
  proposedPatches: {},
  forgedToolsUsed: [],
  featuredAgentUpdates: [],
  confidence: 0.85,
  openQuestions: [],
  recommendedEffects: [],
};

test('DepartmentReportSchema accepts valid report', () => {
  assert.equal(DepartmentReportSchema.safeParse(validReport).success, true);
});

test('RiskSchema rejects out-of-domain severity', () => {
  assert.equal(RiskSchema.safeParse({ severity: 'catastrophic', description: 'x' }).success, false);
});

test('RiskSchema accepts all four severities', () => {
  for (const sev of ['low', 'medium', 'high', 'critical']) {
    assert.equal(RiskSchema.safeParse({ severity: sev, description: 'x' }).success, true);
  }
});

test('OpportunitySchema rejects out-of-domain impact', () => {
  assert.equal(OpportunitySchema.safeParse({ impact: 'massive', description: 'x' }).success, false);
});

test('ForgedToolUsageSchema rejects out-of-domain mode', () => {
  const bad = { name: 't', mode: 'script', description: 'x', output: {}, confidence: 0.5 };
  assert.equal(ForgedToolUsageSchema.safeParse(bad).success, false);
});

test('RecommendedEffectSchema rejects out-of-domain type', () => {
  const bad = { id: 'e1', type: 'magic', description: 'x' };
  assert.equal(RecommendedEffectSchema.safeParse(bad).success, false);
});

test('DepartmentReportSchema fills defaults when arrays omitted', () => {
  const minimal = {
    department: 'medical',
    summary: 'x',
    confidence: 0.7,
  };
  const result = DepartmentReportSchema.safeParse(minimal);
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.citations, []);
    assert.deepEqual(result.data.risks, []);
    assert.deepEqual(result.data.recommendedActions, []);
    assert.deepEqual(result.data.proposedPatches, {});
  }
});

test('DepartmentReportSchema rejects confidence out of [0,1]', () => {
  const bad = { ...validReport, confidence: 1.5 };
  assert.equal(DepartmentReportSchema.safeParse(bad).success, false);
});

test('DepartmentReportSchema rejects empty department string', () => {
  const bad = { ...validReport, department: '' };
  assert.equal(DepartmentReportSchema.safeParse(bad).success, false);
});
