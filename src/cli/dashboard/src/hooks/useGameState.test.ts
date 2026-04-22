/**
 * Pure-logic tests for useGameState's reducer. The hook wraps the
 * reducer in useMemo so tests import the extracted pure function
 * computeGameState directly, matching the dashboard's existing test
 * pattern (see useRetryStats.test.ts).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { SimEvent } from './useSSE';
import {
  computeGameState,
  getLeaderColorVar,
  type SystemsState,
} from './useGameState';

const baseSystems: SystemsState = {
  population: 100, morale: 0.8, foodMonthsReserve: 12, waterLitersPerDay: 800,
  powerKw: 400, infrastructureModules: 3, lifeSupportCapacity: 120, scienceOutput: 0,
};

const mkTurnStart = (
  leader: string,
  turn: number,
  extras: Partial<SystemsState> = {},
): SimEvent => ({
  type: 'turn_start',
  leader,
  turn,
  data: {
    turn,
    year: 2035,
    title: `Turn ${turn} event`,
    systems: { ...baseSystems, ...extras },
  },
});

test('computeGameState: initial state has empty leaders map + empty leaderIds', () => {
  const state = computeGameState([], false);
  assert.deepEqual(state.leaders, {});
  assert.deepEqual(state.leaderIds, []);
  assert.equal(state.turn, 0);
  assert.equal(state.isRunning, false);
  assert.equal(state.isComplete, false);
});

test('computeGameState: first turn_start for Alice appends her to leaderIds', () => {
  const state = computeGameState([mkTurnStart('Alice', 1)], false);
  assert.deepEqual(state.leaderIds, ['Alice']);
  assert.ok(state.leaders.Alice, 'Alice has a state entry');
  assert.equal(state.leaders.Alice.systems?.population, 100);
});

test('computeGameState: second leader appended in launch order', () => {
  const events = [mkTurnStart('Alice', 1), mkTurnStart('Bob', 1)];
  const state = computeGameState(events, false);
  assert.deepEqual(state.leaderIds, ['Alice', 'Bob']);
});

test('computeGameState: Bob arriving first preserves launch order (Bob at index 0)', () => {
  const events = [mkTurnStart('Bob', 1), mkTurnStart('Alice', 1)];
  const state = computeGameState(events, false);
  assert.deepEqual(state.leaderIds, ['Bob', 'Alice'], 'launch order preserved');
});

test('computeGameState: third+ leader no longer capped at 2 (future arena-ready)', () => {
  const events = [
    mkTurnStart('Alice', 1),
    mkTurnStart('Bob', 1),
    mkTurnStart('Cleo', 1),
  ];
  const state = computeGameState(events, false);
  assert.deepEqual(state.leaderIds, ['Alice', 'Bob', 'Cleo']);
  assert.ok(state.leaders.Cleo, 'third leader stored (old hook dropped events beyond slot 2)');
});

test('computeGameState: events for an existing leader update that leader only', () => {
  const events = [
    mkTurnStart('Alice', 1, { population: 100 }),
    mkTurnStart('Alice', 2, { population: 95 }),
    mkTurnStart('Bob', 1, { population: 80 }),
  ];
  const state = computeGameState(events, false);
  assert.equal(state.leaders.Alice.systems?.population, 95, 'Alice updated');
  assert.equal(state.leaders.Bob.systems?.population, 80, 'Bob independent');
});

test('computeGameState: isComplete flag propagates', () => {
  const state = computeGameState([mkTurnStart('Alice', 1)], true);
  assert.equal(state.isComplete, true);
});

test('computeGameState: status phase=parallel with 2 leaders populates both', () => {
  const statusEvent: SimEvent = {
    type: 'status',
    leader: '',
    data: {
      phase: 'parallel',
      maxTurns: 3,
      leaders: [
        { name: 'Alice', archetype: 'Pragmatist', unit: 'Alpha', hexaco: {} },
        { name: 'Bob', archetype: 'Visionary', unit: 'Beta', hexaco: {} },
      ],
    },
  };
  const state = computeGameState([statusEvent], false);
  assert.equal(state.maxTurns, 3);
  assert.deepEqual(state.leaderIds, ['Alice', 'Bob']);
  assert.equal(state.leaders.Alice.leader?.name, 'Alice');
  assert.equal(state.leaders.Bob.leader?.name, 'Bob');
});

test('computeGameState: sim_aborted in events forces isRunning=false even with parallel status', () => {
  const statusEvent: SimEvent = {
    type: 'status',
    leader: '',
    data: {
      phase: 'parallel',
      leaders: [{ name: 'Alice', archetype: 'P', unit: 'A', hexaco: {} }],
    },
  };
  const abortEvent: SimEvent = {
    type: 'sim_aborted',
    leader: 'Alice',
    data: { reason: 'disconnect', turn: 1 },
  };
  const state = computeGameState([statusEvent, abortEvent], false);
  assert.equal(state.isRunning, false, 'abort overrides status-parallel-driven isRunning=true');
});

test('getLeaderColorVar: index 0 -> vis, 1 -> eng, 2+ -> amber fallback', () => {
  assert.equal(getLeaderColorVar(0), 'var(--vis)');
  assert.equal(getLeaderColorVar(1), 'var(--eng)');
  assert.equal(getLeaderColorVar(2), 'var(--amber)');
  assert.equal(getLeaderColorVar(9), 'var(--amber)');
});
