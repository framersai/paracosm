import test from 'node:test';
import assert from 'node:assert/strict';
import { marsProgressionHook } from './progression-hooks.js';

function makeColonist(overrides: Partial<{
  alive: boolean; marsborn: boolean; boneDensityPct: number;
  cumulativeRadiationMsv: number; birthYear: number; earthContacts: number;
}> = {}) {
  return {
    core: { marsborn: overrides.marsborn ?? false, birthYear: overrides.birthYear ?? 2000 },
    health: {
      alive: overrides.alive ?? true,
      boneDensityPct: overrides.boneDensityPct ?? 100,
      cumulativeRadiationMsv: overrides.cumulativeRadiationMsv ?? 0,
    },
    social: { earthContacts: overrides.earthContacts ?? 5 },
    career: { yearsExperience: 0 },
  } as any;
}

test('marsProgressionHook accumulates radiation per yearDelta', () => {
  const c = makeColonist();
  marsProgressionHook({ colonists: [c], yearDelta: 1, year: 2036, turn: 1, rng: { chance: () => false } as any });
  // MARS_RADIATION_MSV_PER_YEAR = 0.67 * 365 = 244.55
  assert.ok(c.health.cumulativeRadiationMsv > 244 && c.health.cumulativeRadiationMsv < 245);
});

test('marsProgressionHook degrades bone density', () => {
  const c = makeColonist({ boneDensityPct: 100, birthYear: 2000 });
  marsProgressionHook({ colonists: [c], yearDelta: 1, year: 2036, turn: 1, rng: { chance: () => false } as any });
  assert.ok(c.health.boneDensityPct < 100);
  assert.ok(c.health.boneDensityPct >= 50);
});

test('marsProgressionHook uses slower bone loss rate for Mars-born', () => {
  // Both colonists have same yearsOnMars (1 year) to isolate the lossRate difference
  const earthBorn = makeColonist({ boneDensityPct: 100, birthYear: 2000, marsborn: false });
  const marsBorn = makeColonist({ boneDensityPct: 100, birthYear: 2035, marsborn: true });
  const rng = { chance: () => false } as any;
  marsProgressionHook({ colonists: [earthBorn], yearDelta: 1, year: 2036, turn: 1, rng });
  marsProgressionHook({ colonists: [marsBorn], yearDelta: 1, year: 2036, turn: 1, rng });
  // Mars-born has slower loss rate (0.003 vs 0.005), both at 1 year on Mars
  assert.ok(marsBorn.health.boneDensityPct > earthBorn.health.boneDensityPct);
});

test('marsProgressionHook skips dead colonists', () => {
  const c = makeColonist({ alive: false, cumulativeRadiationMsv: 100 });
  marsProgressionHook({ colonists: [c], yearDelta: 1, year: 2036, turn: 1, rng: { chance: () => false } as any });
  assert.equal(c.health.cumulativeRadiationMsv, 100);
});
