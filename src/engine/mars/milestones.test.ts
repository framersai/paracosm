import test from 'node:test';
import assert from 'node:assert/strict';
import { getMarsMilestoneCrisis, MARS_MILESTONES } from './milestones.js';

test('MARS_MILESTONES contains turn 1 (Landfall) and turn 12 (Legacy)', () => {
  assert.ok(MARS_MILESTONES.has(1));
  assert.ok(MARS_MILESTONES.has(12));
});

test('Landfall milestone has correct structure', () => {
  const landfall = MARS_MILESTONES.get(1);
  assert.ok(landfall);
  assert.equal(landfall!.title, 'Landfall');
  assert.ok(landfall!.crisis.includes('Mars orbit'));
  assert.ok(landfall!.options.length >= 2);
  assert.ok(landfall!.researchKeywords.length > 0);
});

test('getMarsMilestoneCrisis returns turn 1 crisis', () => {
  const crisis = getMarsMilestoneCrisis(1, 12);
  assert.ok(crisis);
  assert.equal(crisis!.title, 'Landfall');
  assert.equal(crisis!.category, 'infrastructure');
});

test('getMarsMilestoneCrisis returns final turn crisis', () => {
  const crisis = getMarsMilestoneCrisis(12, 12);
  assert.ok(crisis);
  assert.equal(crisis!.title, 'Legacy Assessment');
  assert.equal(crisis!.category, 'political');
});

test('getMarsMilestoneCrisis returns null for non-milestone turns', () => {
  assert.equal(getMarsMilestoneCrisis(5, 12), null);
  assert.equal(getMarsMilestoneCrisis(8, 12), null);
});

test('getMarsMilestoneCrisis adapts final turn to maxTurns', () => {
  const crisis = getMarsMilestoneCrisis(6, 6);
  assert.ok(crisis);
  assert.equal(crisis!.title, 'Legacy Assessment');
});
