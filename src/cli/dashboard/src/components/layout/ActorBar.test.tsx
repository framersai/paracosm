import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from 'react-dom/server';
import * as React from 'react';

import { ActorBar } from './ActorBar.js';

test('ActorBar compact: MORALE displays as 0-100%, not double-scaled', () => {
  // Regression for the live SIM bug where the compact actor bar showed
  // MORALE 3200% / 2600%. moraleHistory is pre-scaled to 0-100 in
  // useGameState (Math.round(metrics.morale * 100)), so the renderer
  // must NOT multiply by 100 again.
  const html = renderToString(
    <ActorBar
      actorIndex={0}
      leader={{ name: 'Aria Chen', archetype: 'The Visionary', unit: 'Colony Alpha', hexaco: { openness: 0.95, conscientiousness: 0.35, extraversion: 0.85, agreeableness: 0.55, emotionality: 0.3, honestyHumility: 0.65 } }}
      popHistory={[100, 99, 98]}
      moraleHistory={[85, 80, 32]} // Final reading: 32 (already scaled)
      compact
    />,
  );
  assert.match(html, /MORALE (?:<!-- -->)?32(?:<!-- -->)?%/, 'expected MORALE 32%, got double-scaled');
  assert.ok(!html.includes('3200%'), 'morale must not double-scale to 3200%');
  assert.match(html, /POP (?:<!-- -->)?98/, 'POP renders the latest value');
});

test('ActorBar compact: morale of 100 renders as 100%, not 10000%', () => {
  const html = renderToString(
    <ActorBar
      actorIndex={1}
      leader={{ name: 'Voss', archetype: 'The Engineer', unit: 'Colony Beta', hexaco: { openness: 0, conscientiousness: 1, extraversion: 0, agreeableness: 0, emotionality: 0, honestyHumility: 0 } }}
      popHistory={[50]}
      moraleHistory={[100]}
      compact
    />,
  );
  assert.match(html, /MORALE (?:<!-- -->)?100(?:<!-- -->)?%/);
});

test('ActorBar compact: empty moraleHistory hides the morale stat (no NaN%)', () => {
  const html = renderToString(
    <ActorBar
      actorIndex={0}
      leader={null}
      popHistory={[]}
      moraleHistory={[]}
      compact
    />,
  );
  assert.ok(!html.includes('MORALE'), 'no morale chip when history is empty');
  assert.ok(!html.includes('NaN'));
});
