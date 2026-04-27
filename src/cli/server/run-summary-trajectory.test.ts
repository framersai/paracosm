import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSummaryTrajectory } from './run-summary-trajectory.js';

test('samples evenly across trajectory.points when present', () => {
  const artifact = {
    trajectory: {
      points: Array.from({ length: 100 }, (_, i) => ({ turn: i, value: i * 2 })),
    },
  };
  const out = extractSummaryTrajectory(artifact as never, 8);
  assert.equal(out.length, 8);
  assert.equal(out[0], 0);
  assert.equal(out[7], 198);
});

test('returns empty array when artifact has no trajectory', () => {
  assert.deepEqual(extractSummaryTrajectory({}, 8), []);
});

test('returns shorter array when fewer points than n', () => {
  const artifact = {
    trajectory: {
      points: [{ turn: 0, value: 1 }, { turn: 1, value: 2 }, { turn: 2, value: 3 }],
    },
  };
  assert.deepEqual(extractSummaryTrajectory(artifact as never, 8), [1, 2, 3]);
});

test('handles batch-point mode (no trajectory.points) by returning []', () => {
  const artifact = { metadata: { mode: 'batch-point' } };
  assert.deepEqual(extractSummaryTrajectory(artifact as never, 8), []);
});

test('coerces non-number values to 0 (defensive)', () => {
  const artifact = {
    trajectory: { points: [{ turn: 0, value: 'oops' }, { turn: 1, value: 5 }] },
  } as unknown;
  const out = extractSummaryTrajectory(artifact as never, 4);
  assert.equal(typeof out[0], 'number');
  assert.equal(out[1], 5);
});
