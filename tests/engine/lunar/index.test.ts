import test from 'node:test';
import assert from 'node:assert/strict';
import { lunarScenario } from '../../../src/engine/lunar/index.js';
import type { ScenarioPackage } from '../../../src/engine/types.js';

test('lunarScenario satisfies ScenarioPackage interface', () => {
  const scenario: ScenarioPackage = lunarScenario;
  assert.equal(scenario.id, 'lunar-outpost');
  assert.equal(scenario.engineArchetype, 'closed_turn_based_settlement');
});

test('lunarScenario has correct labels', () => {
  assert.equal(lunarScenario.labels.name, 'Lunar Outpost');
  assert.equal(lunarScenario.labels.populationNoun, 'crew members');
  assert.equal(lunarScenario.labels.settlementNoun, 'outpost');
});

test('lunarScenario declares 5 departments different from Mars', () => {
  assert.equal(lunarScenario.departments.length, 5);
  const ids = lunarScenario.departments.map(d => d.id);
  assert.ok(ids.includes('medical'));
  assert.ok(ids.includes('engineering'));
  assert.ok(ids.includes('mining'));
  assert.ok(ids.includes('life-support'));
  assert.ok(ids.includes('communications'));
  assert.ok(!ids.includes('agriculture'));
  assert.ok(!ids.includes('governance'));
});

test('lunarScenario has all hooks registered', () => {
  assert.ok(lunarScenario.hooks.progressionHook);
  assert.ok(lunarScenario.hooks.departmentPromptHook);
  assert.ok(lunarScenario.hooks.directorInstructions);
  assert.ok(lunarScenario.hooks.fingerprintHook);
  assert.ok(lunarScenario.hooks.politicsHook);
  assert.ok(lunarScenario.hooks.reactionContextHook);
  assert.ok(lunarScenario.hooks.getMilestoneEvent);
});

test('lunarScenario milestone crisis returns Lunar Arrival for turn 1', () => {
  const crisis = lunarScenario.hooks.getMilestoneEvent!(1, 8);
  assert.ok(crisis);
  assert.equal(crisis.title, 'Lunar Arrival');
});

test('lunarScenario milestone returns Mission Review for final turn', () => {
  const crisis = lunarScenario.hooks.getMilestoneEvent!(8, 8);
  assert.ok(crisis);
  assert.equal(crisis.title, 'Mission Review');
});

test('lunarScenario progression hook applies regolith and bone loss', () => {
  const colonist = {
    core: { marsborn: false, birthYear: 2000 },
    health: { alive: true, boneDensityPct: 100, cumulativeRadiationMsv: 0 },
  };
  lunarScenario.hooks.progressionHook!({
    agents: [colonist as any], yearDelta: 1, year: 2031, turn: 1, startYear: 2030,
    rng: { chance: () => false } as any,
  });
  assert.ok(colonist.health.cumulativeRadiationMsv > 0, 'regolith exposure should increase');
  assert.ok(colonist.health.boneDensityPct < 100, 'bone density should decrease');
});

test('lunarScenario director instructions mention lunar science', () => {
  const instructions = lunarScenario.hooks.directorInstructions!();
  assert.ok(instructions.includes('lunar'));
  assert.ok(instructions.includes('regolith'));
  assert.ok(instructions.includes('mining'));
});

test('lunarScenario fingerprint produces valid classification', () => {
  const fp = lunarScenario.hooks.fingerprintHook!(
    { colony: { morale: 0.7, foodMonthsReserve: 15 }, agents: [] } as any,
    [{ turn: 1, year: 2030, outcome: 'conservative_success' }],
    { hexaco: { conscientiousness: 0.9, openness: 0.3 } } as any,
    {}, 3,
  );
  assert.ok(fp.resilience);
  assert.ok(fp.summary);
  assert.equal(fp.leadership, 'methodical');
});

test('lunarScenario has different theme colors than Mars', () => {
  assert.notEqual(lunarScenario.theme.primaryColor, '#dc2626');
  assert.equal(lunarScenario.theme.primaryColor, '#6366f1');
});
