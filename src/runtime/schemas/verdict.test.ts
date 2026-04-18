import test from 'node:test';
import assert from 'node:assert/strict';
import { VerdictSchema, VerdictScoresSchema } from './verdict.js';

const validScores = {
  a: { survival: 8, prosperity: 7, morale: 6, innovation: 9 },
  b: { survival: 7, prosperity: 6, morale: 8, innovation: 5 },
};
const validVerdict = {
  winner: 'A',
  winnerName: 'Captain Reyes',
  headline: 'Bold shield deploy paid off',
  summary: 'Reyes traded short-term morale for hull integrity; it compounded.',
  keyDivergence: 'Turn 3 shield deploy vs resupply wait',
  scores: validScores,
  reasoning: '1. Population trajectory: A +5, B +2.\n2. Morale: A dipped then recovered.',
};

test('VerdictScoresSchema accepts valid scores', () => {
  assert.equal(VerdictScoresSchema.safeParse(validScores).success, true);
});

test('VerdictScoresSchema rejects score out of [0,10]', () => {
  const bad = { a: { ...validScores.a, survival: 11 }, b: validScores.b };
  assert.equal(VerdictScoresSchema.safeParse(bad).success, false);
});

test('VerdictSchema accepts valid verdict', () => {
  assert.equal(VerdictSchema.safeParse(validVerdict).success, true);
});

test('VerdictSchema accepts tie', () => {
  const tied = { ...validVerdict, winner: 'tie', winnerName: 'Tie' };
  assert.equal(VerdictSchema.safeParse(tied).success, true);
});

test('VerdictSchema rejects winner out of domain', () => {
  const bad = { ...validVerdict, winner: 'C' };
  assert.equal(VerdictSchema.safeParse(bad).success, false);
});

test('VerdictSchema defaults reasoning to empty string', () => {
  const { reasoning: _, ...noReasoning } = validVerdict;
  const result = VerdictSchema.safeParse(noReasoning);
  assert.equal(result.success, true);
  assert.equal(result.success && result.data.reasoning, '');
});

test('VerdictSchema requires headline', () => {
  const { headline: _, ...noHeadline } = validVerdict;
  assert.equal(VerdictSchema.safeParse(noHeadline).success, false);
});
