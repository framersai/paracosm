import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReactionCues } from './translation.js';
import type { HexacoProfile } from '../../engine/core/state.js';

const neutral: HexacoProfile = {
  openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
  agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5,
};

test('buildReactionCues returns empty string for all-neutral HEXACO', () => {
  assert.equal(buildReactionCues(neutral), '');
});

test('buildReactionCues fires high-pole cue above 0.7', () => {
  const cue = buildReactionCues({ ...neutral, emotionality: 0.85 });
  assert.match(cue, /you feel events/);
});

test('buildReactionCues fires low-pole cue below 0.3', () => {
  const cue = buildReactionCues({ ...neutral, emotionality: 0.2 });
  assert.match(cue, /stay flat/);
});

test('buildReactionCues does not fire cue between thresholds', () => {
  const cue = buildReactionCues({ ...neutral, emotionality: 0.5 });
  assert.doesNotMatch(cue, /feel events/);
  assert.doesNotMatch(cue, /stay flat/);
});

test('buildReactionCues caps output at 3 cues', () => {
  const allHigh: HexacoProfile = {
    openness: 0.9, conscientiousness: 0.9, extraversion: 0.9,
    agreeableness: 0.9, emotionality: 0.9, honestyHumility: 0.9,
  };
  const cue = buildReactionCues(allHigh);
  const cueCount = cue.split(';').length;
  assert.ok(cueCount <= 3, `expected <= 3 cues, got ${cueCount}: ${cue}`);
});

test('buildReactionCues covers each of the six axes at both poles', () => {
  for (const trait of ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'emotionality', 'honestyHumility'] as const) {
    const high = { ...neutral, [trait]: 0.85 };
    const low = { ...neutral, [trait]: 0.15 };
    assert.notEqual(buildReactionCues(high), '', `${trait} high should fire`);
    assert.notEqual(buildReactionCues(low), '', `${trait} low should fire`);
  }
});
