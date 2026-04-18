import test from 'node:test';
import assert from 'node:assert/strict';
import { MilestonesSchema, MilestoneEventSchema } from './milestones.js';

const validFounding = {
  title: 'Arrival at Mars',
  crisis: 'The colonists arrive at Mars and must choose their first strategy.',
  options: [
    { id: 'option_a', label: 'Safe Base', description: 'Conservative settlement', isRisky: false },
    { id: 'option_b', label: 'Ambitious Expansion', description: 'Aggressive expansion', isRisky: true },
  ],
  riskyOptionId: 'option_b',
  riskSuccessProbability: 0.55,
  category: 'infrastructure',
  researchKeywords: ['mars landing', 'colony foundation'],
  relevantDepartments: ['engineering', 'medical'],
  turnSummary: 'First decisions shape the colony.',
};

const validLegacy = {
  title: 'Legacy Assessment',
  crisis: 'Submit a comprehensive status report.',
  options: [
    { id: 'option_a', label: 'Honest', description: 'Factual report', isRisky: false },
    { id: 'option_b', label: 'Ambitious', description: 'Bold projection', isRisky: true },
  ],
  riskyOptionId: 'option_b',
  riskSuccessProbability: 0.5,
  category: 'political',
  researchKeywords: [],
  relevantDepartments: ['governance'],
  turnSummary: 'Time to assess the colony.',
};

test('MilestoneEventSchema accepts a canonical valid event', () => {
  const result = MilestoneEventSchema.safeParse(validFounding);
  assert.equal(result.success, true);
});

test('MilestoneEventSchema rejects when riskyOptionId does not match an isRisky option', () => {
  const bad = { ...validFounding, riskyOptionId: 'option_a' };
  const result = MilestoneEventSchema.safeParse(bad);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some(i => i.message.includes('isRisky')));
  }
});

test('MilestoneEventSchema rejects option id outside option_a/b/c', () => {
  const bad = {
    ...validFounding,
    options: [
      { id: 'option_x', label: 'x', description: 'x', isRisky: false },
      { id: 'option_b', label: 'b', description: 'b', isRisky: true },
    ],
  };
  const result = MilestoneEventSchema.safeParse(bad);
  assert.equal(result.success, false);
});

test('MilestoneEventSchema rejects riskSuccessProbability outside [0.3, 0.8]', () => {
  const tooLow = { ...validFounding, riskSuccessProbability: 0.1 };
  const tooHigh = { ...validFounding, riskSuccessProbability: 0.95 };
  assert.equal(MilestoneEventSchema.safeParse(tooLow).success, false);
  assert.equal(MilestoneEventSchema.safeParse(tooHigh).success, false);
});

test('MilestoneEventSchema fills researchKeywords default when omitted', () => {
  const { researchKeywords: _omit, ...noKeywords } = validFounding;
  const result = MilestoneEventSchema.safeParse(noKeywords);
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.researchKeywords, []);
  }
});

test('MilestonesSchema accepts object shape { founding, legacy }', () => {
  const result = MilestonesSchema.safeParse({ founding: validFounding, legacy: validLegacy });
  assert.equal(result.success, true);
});

test('MilestonesSchema rejects array shape (legacy format)', () => {
  const result = MilestonesSchema.safeParse([validFounding, validLegacy]);
  assert.equal(result.success, false);
});
