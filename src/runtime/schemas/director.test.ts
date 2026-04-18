import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DirectorEventSchema,
  DirectorEventBatchSchema,
  DirectorOptionSchema,
} from './director.js';

const validOption = {
  id: 'option_a',
  label: 'Safe path',
  description: 'Stable but slow',
  isRisky: false,
};
const riskyOption = { ...validOption, id: 'option_b', isRisky: true };
const validEvent = {
  title: 'Hull breach',
  description: 'Aft pressure hull cracked at seam 7.',
  options: [validOption, riskyOption],
  riskyOptionId: 'option_b',
  riskSuccessProbability: 0.55,
  category: 'infrastructure',
  researchKeywords: ['hull integrity'],
  relevantDepartments: ['engineering'],
  turnSummary: 'Engineering crisis',
};
const validBatch = { events: [validEvent], pacing: 'normal', reasoning: 'ramp' };

test('DirectorOptionSchema accepts valid option', () => {
  assert.equal(DirectorOptionSchema.safeParse(validOption).success, true);
});

test('DirectorOptionSchema rejects non-option_x id', () => {
  const bad = { ...validOption, id: 'option_z' };
  assert.equal(DirectorOptionSchema.safeParse(bad).success, false);
});

test('DirectorEventSchema accepts valid event', () => {
  assert.equal(DirectorEventSchema.safeParse(validEvent).success, true);
});

test('DirectorEventSchema rejects riskyOptionId pointing to non-risky option', () => {
  const bad = { ...validEvent, riskyOptionId: 'option_a' };
  const result = DirectorEventSchema.safeParse(bad);
  assert.equal(result.success, false);
  assert.ok(
    !result.success && result.error.issues.some(i => i.message.includes('riskyOptionId')),
    'expected riskyOptionId refine error',
  );
});

test('DirectorEventSchema rejects riskSuccessProbability out of [0,1]', () => {
  const bad = { ...validEvent, riskSuccessProbability: 1.5 };
  assert.equal(DirectorEventSchema.safeParse(bad).success, false);
});

test('DirectorEventSchema defaults researchKeywords to empty array', () => {
  const { researchKeywords: _, ...noKeywords } = validEvent;
  const result = DirectorEventSchema.safeParse(noKeywords);
  assert.equal(result.success, true);
  assert.deepEqual(result.success && result.data.researchKeywords, []);
});

test('DirectorEventBatchSchema accepts valid batch', () => {
  assert.equal(DirectorEventBatchSchema.safeParse(validBatch).success, true);
});

test('DirectorEventBatchSchema rejects empty events array', () => {
  const bad = { ...validBatch, events: [] };
  assert.equal(DirectorEventBatchSchema.safeParse(bad).success, false);
});

test('DirectorEventBatchSchema rejects more than 3 events', () => {
  const bad = { ...validBatch, events: [validEvent, validEvent, validEvent, validEvent] };
  assert.equal(DirectorEventBatchSchema.safeParse(bad).success, false);
});

test('DirectorEventBatchSchema rejects out-of-domain pacing', () => {
  const bad = { ...validBatch, pacing: 'frantic' };
  assert.equal(DirectorEventBatchSchema.safeParse(bad).success, false);
});

test('DirectorEventBatchSchema defaults reasoning to empty string', () => {
  const { reasoning: _, ...noReasoning } = validBatch;
  const result = DirectorEventBatchSchema.safeParse(noReasoning);
  assert.equal(result.success, true);
  assert.equal(result.success && result.data.reasoning, '');
});
