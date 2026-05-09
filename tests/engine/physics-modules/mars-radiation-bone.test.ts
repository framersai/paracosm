import test from 'node:test';
import assert from 'node:assert/strict';
import { marsRadiationBoneProgression } from '../../../src/engine/physics-modules/index.js';

function makeAgent(overrides: Partial<{
  alive: boolean; marsborn: boolean; boneDensityPct: number;
  cumulativeRadiationMsv: number; birthTime: number; earthContacts: number;
}> = {}) {
  return {
    core: { marsborn: overrides.marsborn ?? false, birthTime: overrides.birthTime ?? 2000 },
    health: {
      alive: overrides.alive ?? true,
      boneDensityPct: overrides.boneDensityPct ?? 100,
      cumulativeRadiationMsv: overrides.cumulativeRadiationMsv ?? 0,
    },
    social: { earthContacts: overrides.earthContacts ?? 5 },
    career: { yearsExperience: 0 },
  } as any;
}

test('marsRadiationBoneProgression accumulates radiation per timeDelta', () => {
  const c = makeAgent();
  marsRadiationBoneProgression({ agents: [c], timeDelta: 1, time: 2036, turn: 1, startTime: 2035, rng: { chance: () => false } as any });
  // MARS_RADIATION_MSV_PER_YEAR = 0.67 * 365 = 244.55
  assert.ok(c.health.cumulativeRadiationMsv > 244 && c.health.cumulativeRadiationMsv < 245);
});

test('marsRadiationBoneProgression degrades bone density', () => {
  const c = makeAgent({ boneDensityPct: 100, birthTime: 2000 });
  marsRadiationBoneProgression({ agents: [c], timeDelta: 1, time: 2036, turn: 1, startTime: 2035, rng: { chance: () => false } as any });
  assert.ok(c.health.boneDensityPct < 100);
  assert.ok(c.health.boneDensityPct >= 50);
});

test('marsRadiationBoneProgression uses slower bone loss rate for Mars-born', () => {
  // Both colonists have same yearsOnMars (1 time) to isolate the lossRate difference
  const earthBorn = makeAgent({ boneDensityPct: 100, birthTime: 2000, marsborn: false });
  const marsBorn = makeAgent({ boneDensityPct: 100, birthTime: 2035, marsborn: true });
  const rng = { chance: () => false } as any;
  marsRadiationBoneProgression({ agents: [earthBorn], timeDelta: 1, time: 2036, turn: 1, startTime: 2035, rng });
  marsRadiationBoneProgression({ agents: [marsBorn], timeDelta: 1, time: 2036, turn: 1, startTime: 2035, rng });
  // Mars-born has slower loss rate (0.003 vs 0.005), both at 1 time on Mars
  assert.ok(marsBorn.health.boneDensityPct > earthBorn.health.boneDensityPct);
});

test('marsRadiationBoneProgression skips dead colonists', () => {
  const c = makeAgent({ alive: false, cumulativeRadiationMsv: 100 });
  marsRadiationBoneProgression({ agents: [c], timeDelta: 1, time: 2036, turn: 1, startTime: 2035, rng: { chance: () => false } as any });
  assert.equal(c.health.cumulativeRadiationMsv, 100);
});
