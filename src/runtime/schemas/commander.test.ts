import test from 'node:test';
import assert from 'node:assert/strict';
import { CommanderDecisionSchema, PromotionsSchema } from './commander.js';

const validDecision = {
  selectedOptionId: 'option_b',
  decision: 'Deploy the experimental shield array',
  rationale: 'Engineering is confident; benefits outweigh risk.',
  reasoning: '1. My high openness favors the bold call.\n2. Eng confidence at 0.85.',
  departmentsConsulted: ['engineering', 'medical'],
  selectedPolicies: ['emergency_shield_deploy'],
  rejectedPolicies: [{ policy: 'wait_for_resupply', reason: 'too slow' }],
  expectedTradeoffs: ['short-term morale dip'],
  watchMetricsNextTurn: ['hull integrity', 'power draw'],
};

const validPromotions = {
  promotions: [
    { agentId: 'col-1', department: 'medical', role: 'Chief Medical Officer', reason: 'Top specialization score' },
  ],
};

test('CommanderDecisionSchema accepts valid decision', () => {
  assert.equal(CommanderDecisionSchema.safeParse(validDecision).success, true);
});

test('CommanderDecisionSchema defaults reasoning to empty string', () => {
  const { reasoning: _, ...noReasoning } = validDecision;
  const result = CommanderDecisionSchema.safeParse(noReasoning);
  assert.equal(result.success, true);
  assert.equal(result.success && result.data.reasoning, '');
});

test('CommanderDecisionSchema requires decision string', () => {
  const { decision: _, ...noDecision } = validDecision;
  assert.equal(CommanderDecisionSchema.safeParse(noDecision).success, false);
});

test('CommanderDecisionSchema defaults departmentsConsulted to empty array', () => {
  const { departmentsConsulted: _, ...noDepts } = validDecision;
  const result = CommanderDecisionSchema.safeParse(noDepts);
  assert.equal(result.success, true);
  assert.deepEqual(result.success && result.data.departmentsConsulted, []);
});

test('CommanderDecisionSchema accepts selectedEffectIds optional', () => {
  const withEffects = { ...validDecision, selectedEffectIds: ['effect_1'] };
  assert.equal(CommanderDecisionSchema.safeParse(withEffects).success, true);
});

test('PromotionsSchema accepts valid promotions', () => {
  assert.equal(PromotionsSchema.safeParse(validPromotions).success, true);
});

test('PromotionsSchema defaults to empty promotions array', () => {
  const result = PromotionsSchema.safeParse({});
  assert.equal(result.success, true);
  assert.deepEqual(result.success && result.data.promotions, []);
});

test('PromotionsSchema rejects promotion missing agentId', () => {
  const bad = { promotions: [{ department: 'medical', role: 'CMO', reason: 'x' }] };
  assert.equal(PromotionsSchema.safeParse(bad).success, false);
});
