import test from 'node:test';
import assert from 'node:assert/strict';
import { marsScenario } from '../../src/engine/mars/index.js';
import { EffectRegistry } from '../../src/engine/effect-registry.js';
import { MetricRegistry } from '../../src/engine/metric-registry.js';
import { EventTaxonomy } from '../../src/engine/event-taxonomy.js';
import { MARS_CATEGORY_EFFECTS, MARS_FALLBACK_EFFECT } from '../../src/engine/mars/effects.js';
import { MARS_WORLD_METRICS, MARS_CAPACITY_METRICS } from '../../src/engine/mars/metrics.js';
import { MARS_EVENT_DEFINITIONS } from '../../src/engine/mars/events.js';
import { getMarsMilestoneCrisis } from '../../src/engine/mars/milestones.js';

test('EffectRegistry initialized from marsScenario.effects produces correct output', () => {
  const categoryDefaults = marsScenario.effects[0].categoryDefaults;
  const registry = new EffectRegistry(categoryDefaults, MARS_FALLBACK_EFFECT);
  const deltas = registry.applyOutcome('environmental', 'conservative_success', { personalityBonus: 0, noise: 0 });
  assert.equal(deltas.powerKw, 50);
  assert.equal(deltas.morale, 0.08);
});

test('MetricRegistry initialized from marsScenario.world covers all header metrics', () => {
  const allMetrics = [...MARS_WORLD_METRICS, ...MARS_CAPACITY_METRICS];
  const registry = new MetricRegistry(allMetrics);
  const headerIds = marsScenario.ui.headerMetrics.map(h => h.id);
  for (const id of headerIds) {
    assert.ok(registry.get(id), `Header metric ${id} not in MetricRegistry`);
  }
});

test('EventTaxonomy initialized from marsScenario.events covers all event renderers', () => {
  const taxonomy = new EventTaxonomy(MARS_EVENT_DEFINITIONS);
  for (const eventId of Object.keys(marsScenario.ui.eventRenderers)) {
    assert.ok(taxonomy.get(eventId), `Event renderer ${eventId} not in EventTaxonomy`);
  }
});

test('Mars milestones align with scenario setup defaults', () => {
  const landfall = getMarsMilestoneCrisis(1, marsScenario.setup.defaultTurns);
  assert.ok(landfall);
  assert.equal(landfall!.title, 'Landfall');

  const legacy = getMarsMilestoneCrisis(marsScenario.setup.defaultTurns, marsScenario.setup.defaultTurns);
  assert.ok(legacy);
  assert.equal(legacy!.title, 'Legacy Assessment');
});

test('Mars scenario progression hook modifies colonist radiation', () => {
  const colonist = {
    core: { marsborn: false, birthYear: 2000 },
    health: { alive: true, boneDensityPct: 100, cumulativeRadiationMsv: 0 },
    social: { earthContacts: 5 },
    career: { yearsExperience: 0 },
  };
  marsScenario.hooks.progressionHook!({
    agents: [colonist as any],
    yearDelta: 1,
    year: 2036,
    turn: 1,
    startYear: 2035,
    rng: { chance: () => false } as any,
  });
  assert.ok(colonist.health.cumulativeRadiationMsv > 200);
  assert.ok(colonist.health.boneDensityPct < 100);
});

test('Mars scenario department count matches department configs in existing code', () => {
  assert.equal(marsScenario.departments.length, 5);
});

// Phase 2 integration tests

test('marsScenario hooks are all registered', () => {
  assert.ok(marsScenario.hooks.progressionHook, 'progressionHook');
  assert.ok(marsScenario.hooks.departmentPromptHook, 'departmentPromptHook');
  assert.ok(marsScenario.hooks.directorInstructions, 'directorInstructions');
  assert.ok(marsScenario.hooks.fingerprintHook, 'fingerprintHook');
  assert.ok(marsScenario.hooks.politicsHook, 'politicsHook');
  assert.ok(marsScenario.hooks.reactionContextHook, 'reactionContextHook');
  assert.ok(marsScenario.hooks.getMilestoneEvent, 'getMilestoneEvent');
});

test('marsScenario.hooks.fingerprintHook produces valid fingerprint', () => {
  const fp = marsScenario.hooks.fingerprintHook!(
    { colony: { morale: 0.7 }, politics: { earthDependencyPct: 50 }, agents: [{ health: { alive: true }, core: { marsborn: false } }] } as any,
    [{ turn: 1, year: 2035, outcome: 'conservative_success' }],
    { hexaco: { extraversion: 0.5, conscientiousness: 0.5 } } as any,
    {}, 3,
  );
  assert.ok(fp.resilience);
  assert.ok(fp.summary);
});

test('marsScenario.hooks.politicsHook returns deltas for political category', () => {
  const delta = marsScenario.hooks.politicsHook!('political', 'risky_success');
  assert.ok(delta);
  assert.ok('independencePressure' in delta!);
});

test('marsScenario.hooks.politicsHook returns null for non-political category', () => {
  const delta = marsScenario.hooks.politicsHook!('environmental', 'risky_success');
  assert.equal(delta, null);
});

test('marsScenario.hooks.reactionContextHook returns Mars-born phrasing', () => {
  const ctx = marsScenario.hooks.reactionContextHook!({ core: { marsborn: true } } as any, { year: 2060, turn: 1 });
  assert.ok(ctx.includes('Mars-born'));
});

test('marsScenario.hooks.getMilestoneEvent returns Landfall for turn 1', () => {
  const crisis = marsScenario.hooks.getMilestoneEvent!(1, 12);
  assert.ok(crisis);
  assert.equal(crisis.title, 'Landfall');
});
