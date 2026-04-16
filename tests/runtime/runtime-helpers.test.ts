import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCustomEventToCrisis, buildPromotionPrompt, buildYearSchedule } from '../../src/runtime/runtime-helpers.js';

test('buildPromotionPrompt matches the actual five-department promotion set', () => {
  const prompt = buildPromotionPrompt('candidate summary');
  assert.match(prompt, /promote 5 colonists/i);
});

test('applyCustomEventToCrisis appends matching user event text to the crisis', () => {
  const crisis = applyCustomEventToCrisis(
    { description: 'Base crisis text.', crisis: 'Base crisis text.', turnSummary: 'Base summary.' },
    [{ turn: 3, title: 'Comms blackout', description: 'Solar flare disrupts Earth comms.' }],
    3,
  );

  assert.match(crisis.crisis ?? '', /Comms blackout/);
  assert.match(crisis.turnSummary, /user event/i);
});

test('buildYearSchedule offsets the simulation timeline from the configured start year', () => {
  assert.deepEqual(buildYearSchedule(2042, 3), [2042, 2044, 2047]);
});
