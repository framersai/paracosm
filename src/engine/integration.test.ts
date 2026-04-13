import test from 'node:test';
import assert from 'node:assert/strict';
import { marsScenario } from './mars/index.js';
import { EffectRegistry } from './effect-registry.js';
import { MetricRegistry } from './metric-registry.js';
import { EventTaxonomy } from './event-taxonomy.js';
import { MARS_CATEGORY_EFFECTS, MARS_FALLBACK_EFFECT } from './mars/effects.js';
import { MARS_WORLD_METRICS, MARS_CAPACITY_METRICS } from './mars/metrics.js';
import { MARS_EVENT_DEFINITIONS } from './mars/events.js';
import { getMarsMilestoneCrisis } from './mars/milestones.js';

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
    colonists: [colonist as any],
    yearDelta: 1,
    year: 2036,
    turn: 1,
    rng: { chance: () => false } as any,
  });
  assert.ok(colonist.health.cumulativeRadiationMsv > 200);
  assert.ok(colonist.health.boneDensityPct < 100);
});

test('Mars scenario department count matches department configs in existing code', () => {
  assert.equal(marsScenario.departments.length, 5);
});
