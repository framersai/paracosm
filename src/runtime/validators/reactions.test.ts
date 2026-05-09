import test from 'node:test';
import assert from 'node:assert/strict';
import { ReactionEntrySchema, ReactionBatchSchema } from './reactions.js';

const validEntry = {
  agentId: 'col-1',
  quote: 'This is happening fast. I keep telling myself to breathe.',
  mood: 'anxious',
  intensity: 0.7,
};
const validBatch = { reactions: [validEntry, { ...validEntry, agentId: 'col-2' }] };

test('ReactionEntrySchema accepts valid entry', () => {
  assert.equal(ReactionEntrySchema.safeParse(validEntry).success, true);
});

test('ReactionEntrySchema rejects out-of-domain mood', () => {
  const bad = { ...validEntry, mood: 'triumphant' };
  assert.equal(ReactionEntrySchema.safeParse(bad).success, false);
});

test('ReactionEntrySchema rejects intensity > 1', () => {
  const bad = { ...validEntry, intensity: 1.5 };
  assert.equal(ReactionEntrySchema.safeParse(bad).success, false);
});

test('ReactionEntrySchema rejects intensity < 0', () => {
  const bad = { ...validEntry, intensity: -0.1 };
  assert.equal(ReactionEntrySchema.safeParse(bad).success, false);
});

test('ReactionEntrySchema accepts all 7 moods', () => {
  for (const mood of ['positive', 'negative', 'neutral', 'anxious', 'defiant', 'hopeful', 'resigned']) {
    assert.equal(ReactionEntrySchema.safeParse({ ...validEntry, mood }).success, true);
  }
});

test('ReactionBatchSchema accepts valid wrapped batch', () => {
  assert.equal(ReactionBatchSchema.safeParse(validBatch).success, true);
});

test('ReactionBatchSchema rejects root-level array', () => {
  assert.equal(ReactionBatchSchema.safeParse([validEntry]).success, false);
});

test('ReactionBatchSchema defaults reactions to empty array', () => {
  const result = ReactionBatchSchema.safeParse({});
  assert.equal(result.success, true);
  assert.deepEqual(result.success && result.data.reactions, []);
});
