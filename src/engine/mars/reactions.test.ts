import test from 'node:test';
import assert from 'node:assert/strict';
import { marsReactionContext } from './reactions.js';

test('marsReactionContext returns Mars-born phrasing for marsborn colonist', () => {
  const c = { core: { marsborn: true } } as any;
  const ctx = { year: 2060 } as any;
  const result = marsReactionContext(c, ctx);
  assert.ok(result.includes('Mars-born'));
  assert.ok(result.includes('never seen Earth'));
});

test('marsReactionContext returns Earth-born phrasing with years on Mars', () => {
  const c = { core: { marsborn: false } } as any;
  const ctx = { year: 2060 } as any;
  const result = marsReactionContext(c, ctx);
  assert.ok(result.includes('Earth-born'));
  assert.ok(result.includes('25 years on Mars'));
});

test('marsReactionContext includes health context for low bone density', () => {
  const c = { core: { marsborn: false }, health: { boneDensityPct: 60, cumulativeRadiationMsv: 200 } } as any;
  const ctx = { year: 2060 } as any;
  const result = marsReactionContext(c, ctx);
  assert.ok(result.includes('bone density loss'));
});

test('marsReactionContext includes health context for high radiation', () => {
  const c = { core: { marsborn: false }, health: { boneDensityPct: 90, cumulativeRadiationMsv: 2000 } } as any;
  const ctx = { year: 2060 } as any;
  const result = marsReactionContext(c, ctx);
  assert.ok(result.includes('radiation exposure'));
});
