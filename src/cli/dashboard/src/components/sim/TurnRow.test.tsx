import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from 'react-dom/server';
import * as React from 'react';

import { TurnRow } from './TurnRow.js';
import type { TurnDiffEntry } from './turn-diff.js';
import type { ProcessedEvent } from '../../hooks/useGameState.js';

const sameEntry: TurnDiffEntry = {
  turn: 1,
  classification: 'same',
  titleA: 'Hurricane',
  titleB: 'Hurricane',
  outcomeA: 'risky_success',
  outcomeB: 'risky_success',
};

const diffEventEntry: TurnDiffEntry = {
  turn: 4,
  classification: 'different-event',
  titleA: 'Levee Overtopping',
  titleB: 'Phase-2 Demand Spike',
  outcomeA: 'conservative_failure',
  outcomeB: 'risky_success',
};

const noEvents: ProcessedEvent[] = [];

test('TurnRow: same → no row tint, single shared title, ✓ SAME badge', () => {
  const html = renderToString(<TurnRow entry={sameEntry} eventsA={noEvents} eventsB={noEvents} />);
  assert.match(html, /id="turn-row-1"/);
  // React SSR inserts <!-- --> between adjacent text+variable expressions
  // (e.g. `T{entry.turn}`), so the rendered HTML is `T<!-- -->1`.
  // Match the headerTurn span content directly instead of the bare `T1`.
  assert.match(html, /class="headerTurn">T<!-- -->1/);
  assert.match(html, /✓ SAME/);
  assert.match(html, /Hurricane/);
  assert.ok(!html.includes('differentOutcome'));
  assert.ok(!html.includes('differentEvent'));
});

test('TurnRow: different-event → split per-side titles, ⚠ DIFFERENT EVENT badge', () => {
  const html = renderToString(<TurnRow entry={diffEventEntry} eventsA={noEvents} eventsB={noEvents} />);
  assert.match(html, /id="turn-row-4"/);
  assert.match(html, /⚠ DIFFERENT EVENT/);
  assert.match(html, /Levee Overtopping/);
  assert.match(html, /Phase-2 Demand Spike/);
});

test('TurnRow: empty cell renders the placeholder text', () => {
  const html = renderToString(<TurnRow entry={sameEntry} eventsA={noEvents} eventsB={noEvents} />);
  const matches = html.match(/\(no events yet\)/g) ?? [];
  assert.equal(matches.length, 2);
});
