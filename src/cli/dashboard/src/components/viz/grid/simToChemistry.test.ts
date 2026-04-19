import test from 'node:test';
import assert from 'node:assert/strict';
import { computeChemistryParams, computeInjections } from './simToChemistry.js';
import type { TurnSnapshot, CellSnapshot } from '../viz-types.js';

function snap(overrides: Partial<TurnSnapshot> = {}): TurnSnapshot {
  return {
    turn: 1,
    year: 2035,
    cells: [],
    population: 20,
    morale: 0.7,
    foodReserve: 12,
    deaths: 0,
    births: 0,
    ...overrides,
  };
}

function cell(
  agentId: string,
  mood = 'neutral',
  overrides: Partial<CellSnapshot> = {},
): CellSnapshot {
  return {
    agentId,
    name: agentId,
    department: 'medical',
    role: 'doctor',
    rank: 'junior',
    alive: true,
    marsborn: false,
    psychScore: 0.5,
    childrenIds: [],
    featured: false,
    mood,
    shortTermMemory: [],
    ...overrides,
  };
}

test('computeChemistryParams: healthy colony produces bloom regime (F high)', () => {
  const s = snap({
    morale: 0.9,
    foodReserve: 18,
    population: 20,
    deaths: 0,
    cells: Array.from({ length: 20 }, (_, i) => cell(`c${i}`, 'positive')),
  });
  const { F, k } = computeChemistryParams(s, 20);
  assert.ok(F > 0.04, `F=${F} should be near bloom regime (>0.04)`);
  assert.ok(k < 0.055, `k=${k} should not be in kill regime (<0.055)`);
});

test('computeChemistryParams: dying colony produces kill regime (F low, k high)', () => {
  const s = snap({
    morale: 0.1,
    foodReserve: 2,
    population: 5,
    deaths: 8,
    cells: Array.from({ length: 5 }, (_, i) => cell(`c${i}`, 'negative')),
  });
  const { F, k } = computeChemistryParams(s, 20);
  assert.ok(F < 0.03, `F=${F} should be in collapse regime (<0.03)`);
  assert.ok(k > 0.06, `k=${k} should be in kill regime (>0.06)`);
});

test('computeChemistryParams: parameters stay inside Gray-Scott sweet-spot bounds', () => {
  const s = snap({ morale: 0.5, foodReserve: 8, population: 15, deaths: 3 });
  const { F, k } = computeChemistryParams(s, 20);
  assert.ok(F >= 0.018 && F <= 0.055, `F=${F} within [0.018, 0.055]`);
  assert.ok(k >= 0.045 && k <= 0.070, `k=${k} within [0.045, 0.070]`);
});

test('computeInjections: each alive colonist produces one injection entry', () => {
  const cells = [
    cell('a', 'positive'),
    cell('b', 'anxious'),
    cell('dead', 'neutral', { alive: false }),
  ];
  const injections = computeInjections(
    cells,
    new Map([
      ['a', { x: 10, y: 10 }],
      ['b', { x: 20, y: 20 }],
      ['dead', { x: 30, y: 30 }],
    ]),
  );
  assert.equal(injections.length, 2, 'only alive colonists inject');
});

test('computeInjections: positive mood → U channel (0), negative mood → V channel (1)', () => {
  const cells = [cell('pos', 'positive'), cell('neg', 'negative')];
  const injections = computeInjections(
    cells,
    new Map([
      ['pos', { x: 10, y: 10 }],
      ['neg', { x: 20, y: 20 }],
    ]),
  );
  const pos = injections.find(i => i.agentId === 'pos')!;
  const neg = injections.find(i => i.agentId === 'neg')!;
  assert.equal(pos.channel, 0, 'positive → U channel');
  assert.equal(neg.channel, 1, 'negative → V channel');
  assert.ok(pos.strength > 0 && neg.strength > 0, 'strengths positive');
});

test('computeInjections: featured colonists inject ~1.8x harder', () => {
  const cells = [cell('plain', 'positive'), cell('featured', 'positive', { featured: true })];
  const injections = computeInjections(
    cells,
    new Map([
      ['plain', { x: 10, y: 10 }],
      ['featured', { x: 20, y: 20 }],
    ]),
  );
  const p = injections.find(i => i.agentId === 'plain')!;
  const f = injections.find(i => i.agentId === 'featured')!;
  assert.ok(
    f.strength > p.strength * 1.6,
    `featured=${f.strength} > plain=${p.strength} * 1.6`,
  );
});
