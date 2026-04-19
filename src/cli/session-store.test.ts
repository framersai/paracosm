/**
 * @fileoverview Tests for the session-store SQLite wrapper. Uses
 * `:memory:` so the suite stays filesystem-free and runs fast.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { openSessionStore, type TimestampedEvent } from './session-store.js';

function makeEvent(eventName: string, data: Record<string, unknown>, ts: number): TimestampedEvent {
  return { ts, sse: `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n` };
}

const baseEvents: TimestampedEvent[] = [
  makeEvent('active_scenario', { id: 'mars', name: 'Mars Genesis' }, 1000),
  makeEvent('setup', { leaderA: { name: 'Alice' }, leaderB: { name: 'Bob' } }, 1100),
  makeEvent('turn_done', { turn: 1 }, 5000),
  makeEvent('turn_done', { turn: 2 }, 9000),
  makeEvent('complete', { cost: { totalCostUSD: 0.42 } }, 12000),
];

test('saveSession persists events + derived metadata', () => {
  const store = openSessionStore(':memory:');
  const { id } = store.saveSession(baseEvents);
  const stored = store.getSession(id);
  assert.ok(stored);
  assert.equal(stored.events.length, 5);
  assert.equal(stored.meta.scenarioId, 'mars');
  assert.equal(stored.meta.scenarioName, 'Mars Genesis');
  assert.equal(stored.meta.leaderA, 'Alice');
  assert.equal(stored.meta.leaderB, 'Bob');
  assert.equal(stored.meta.turnCount, 2);
  assert.equal(stored.meta.totalCostUSD, 0.42);
  assert.equal(stored.meta.eventCount, 5);
  assert.equal(stored.meta.durationMs, 11000);
  store.close();
});

test('listSessions returns newest-first metadata without events blob', () => {
  const store = openSessionStore(':memory:');
  store.saveSession(baseEvents);
  store.saveSession(baseEvents);
  const list = store.listSessions();
  assert.equal(list.length, 2);
  assert.equal((list[0] as unknown as { events?: unknown }).events, undefined);
  assert.ok(list[0].createdAt >= list[1].createdAt);
  store.close();
});

test('saveSession evicts the oldest row when over capacity', () => {
  const store = openSessionStore(':memory:', 3);
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    ids.push(store.saveSession(baseEvents).id);
  }
  assert.equal(store.count(), 3);
  const remaining = store.listSessions().map(s => s.id);
  assert.deepEqual(remaining.sort(), ids.slice(2).sort());
});

test('saveSession returns evictedId only when capacity is exceeded', () => {
  const store = openSessionStore(':memory:', 2);
  const a = store.saveSession(baseEvents);
  const b = store.saveSession(baseEvents);
  const c = store.saveSession(baseEvents);
  assert.equal(c.evictedId, a.id);
  assert.equal(b.evictedId, undefined);
});

test('getSession returns null for unknown id', () => {
  const store = openSessionStore(':memory:');
  assert.equal(store.getSession('does-not-exist'), null);
});

test('saveSession respects an explicit metadata override', () => {
  const store = openSessionStore(':memory:');
  const { id } = store.saveSession(baseEvents, {
    scenarioName: 'Custom Override',
    leaderA: 'Override A',
    totalCostUSD: 9.99,
  });
  const stored = store.getSession(id);
  assert.ok(stored);
  assert.equal(stored.meta.scenarioName, 'Custom Override');
  assert.equal(stored.meta.leaderA, 'Override A');
  assert.equal(stored.meta.totalCostUSD, 9.99);
  assert.equal(stored.meta.leaderB, 'Bob');
});

test('saveSession tolerates events with no derivable metadata', () => {
  const store = openSessionStore(':memory:');
  const noisy: TimestampedEvent[] = [
    makeEvent('something', { unrelated: true }, 100),
    makeEvent('other', { foo: 'bar' }, 200),
  ];
  const { id } = store.saveSession(noisy);
  const stored = store.getSession(id);
  assert.ok(stored);
  assert.equal(stored.meta.scenarioName, undefined);
  assert.equal(stored.meta.leaderA, undefined);
  assert.equal(stored.meta.eventCount, 2);
  assert.equal(stored.meta.durationMs, 100);
});

test('saveSession with a single event yields zero duration', () => {
  const store = openSessionStore(':memory:');
  const single: TimestampedEvent[] = [makeEvent('complete', {}, 5000)];
  const { id } = store.saveSession(single);
  assert.equal(store.getSession(id)?.meta.durationMs, 0);
});

test('saveSession survives malformed JSON in event data', () => {
  const store = openSessionStore(':memory:');
  const bogus: TimestampedEvent[] = [
    { ts: 1, sse: 'event: garbage\ndata: not-actually-json{}\n\n' },
    makeEvent('active_scenario', { id: 'mars', name: 'Mars' }, 2),
  ];
  const { id } = store.saveSession(bogus);
  assert.equal(store.getSession(id)?.meta.scenarioName, 'Mars');
});

// Regression test for the real production SSE shape: the orchestrator
// wraps every engine event in `broadcast('sim', {type: <realType>, ...})`
// and pair-runner fires `event: status` (not `event: setup`) for the
// leader roster. An earlier deriveMetadata matched on the unwrapped
// shape only, so turnCount + leader names stayed null on every real
// save. This test pins the wrapped-shape behaviour so the bug can't
// silently come back.
test('saveSession derives metadata from wrapped sim + status events', () => {
  const store = openSessionStore(':memory:');
  const wrapped: TimestampedEvent[] = [
    makeEvent('active_scenario', { id: 'mars', name: 'Mars Genesis' }, 1000),
    makeEvent('status', {
      phase: 'parallel',
      leaders: [{ name: 'Aria Chen' }, { name: 'Dietrich Voss' }],
    }, 1200),
    makeEvent('sim', { type: 'turn_done', turn: 1, _cost: { totalCostUSD: 0.05 } }, 3000),
    makeEvent('sim', { type: 'turn_done', turn: 2, _cost: { totalCostUSD: 0.11 } }, 5000),
    makeEvent('sim', { type: 'turn_done', turn: 3, _cost: { totalCostUSD: 0.18 } }, 7000),
    makeEvent('complete', {}, 9000),
  ];
  const { id } = store.saveSession(wrapped);
  const stored = store.getSession(id);
  assert.ok(stored);
  assert.equal(stored.meta.scenarioName, 'Mars Genesis');
  assert.equal(stored.meta.leaderA, 'Aria Chen');
  assert.equal(stored.meta.leaderB, 'Dietrich Voss');
  assert.equal(stored.meta.turnCount, 3);
  // Highest _cost.totalCostUSD seen wins — complete itself has no cost,
  // but the cumulative value in the last turn_done is authoritative.
  assert.equal(stored.meta.totalCostUSD, 0.18);
});
