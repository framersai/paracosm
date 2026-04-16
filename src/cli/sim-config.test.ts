import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSimulationConfig, resolveSimulationModels } from './sim-config.js';

const leaderA = {
  name: 'A',
  archetype: 'One',
  colony: 'Alpha',
  hexaco: {
    openness: 0.5,
    conscientiousness: 0.5,
    extraversion: 0.5,
    agreeableness: 0.5,
    emotionality: 0.5,
    honestyHumility: 0.5,
  },
  instructions: 'Leader A',
};

const leaderB = {
  name: 'B',
  archetype: 'Two',
  colony: 'Beta',
  hexaco: {
    openness: 0.5,
    conscientiousness: 0.5,
    extraversion: 0.5,
    agreeableness: 0.5,
    emotionality: 0.5,
    honestyHumility: 0.5,
  },
  instructions: 'Leader B',
};

test('normalizeSimulationConfig applies defaults for omitted optional fields', () => {
  const config = normalizeSimulationConfig({ leaders: [leaderA, leaderB] });

  assert.equal(config.turns, 12);
  assert.equal(config.seed, 950);
  assert.equal(config.startYear, 2035);
  assert.equal(config.initialPopulation, 100);
  assert.equal(config.liveSearch, false);
  assert.deepEqual(config.activeDepartments, ['medical', 'engineering', 'agriculture', 'psychology', 'governance']);
  assert.equal(config.startingResources.powerKw, 400);
  assert.equal(config.startingResources.morale, 0.85);
  assert.equal(config.startingResources.pressurizedVolumeM3, 3000);
  assert.equal(config.startingResources.lifeSupportCapacity, 120);
  assert.equal(config.startingResources.infrastructureModules, 3);
  assert.equal(config.startingPolitics.earthDependencyPct, 95);
  assert.equal(config.execution.commanderMaxSteps, 5);
  assert.equal(config.execution.departmentMaxSteps, 8);
  assert.equal(config.models.commander, 'gpt-5.4');
  assert.equal(config.models.departments, 'gpt-5.4');
  assert.equal(config.models.judge, 'gpt-5.4');
  assert.equal(config.models.director, 'gpt-5.4');
  assert.equal(config.keyPersonnel.length, 5);
});

test('normalizeSimulationConfig preserves explicit setup overrides', () => {
  const config = normalizeSimulationConfig({
    leaders: [leaderA, leaderB],
    turns: 6,
    seed: 4242,
    startYear: 2042,
    population: 140,
    liveSearch: true,
    activeDepartments: ['medical', 'engineering', 'psychology'],
    startingResources: {
      food: 22,
      water: 900,
      power: 520,
      morale: 78,
      pressurizedVolumeM3: 4500,
      lifeSupportCapacity: 180,
      infrastructureModules: 6,
      scienceOutput: 12,
    },
    startingPolitics: { earthDependencyPct: 72 },
    execution: { commanderMaxSteps: 7, departmentMaxSteps: 10, sandboxTimeoutMs: 15000, sandboxMemoryMB: 256 },
    customEvents: [{ turn: 2, title: 'Comms blackout', description: 'Solar flare disrupts Earth comms.' }],
    models: { commander: 'gpt-5.4', departments: 'gpt-5.4-mini', judge: 'gpt-5.4' },
    keyPersonnel: [
      { name: 'Custom Chief', department: 'medical', role: 'Chief Medical Officer', specialization: 'Emergency Medicine', age: 39, featured: true },
    ],
  });

  assert.equal(config.turns, 6);
  assert.equal(config.seed, 4242);
  assert.equal(config.startYear, 2042);
  assert.equal(config.initialPopulation, 140);
  assert.equal(config.liveSearch, true);
  assert.deepEqual(config.activeDepartments, ['medical', 'engineering', 'psychology']);
  assert.equal(config.startingResources.foodMonthsReserve, 22);
  assert.equal(config.startingResources.waterLitersPerDay, 900);
  assert.equal(config.startingResources.powerKw, 520);
  assert.equal(config.startingResources.morale, 0.78);
  assert.equal(config.startingResources.pressurizedVolumeM3, 4500);
  assert.equal(config.startingResources.lifeSupportCapacity, 180);
  assert.equal(config.startingResources.infrastructureModules, 6);
  assert.equal(config.startingResources.scienceOutput, 12);
  assert.equal(config.startingPolitics.earthDependencyPct, 72);
  assert.equal(config.execution.commanderMaxSteps, 7);
  assert.equal(config.execution.departmentMaxSteps, 10);
  assert.equal(config.execution.sandboxTimeoutMs, 15000);
  assert.equal(config.execution.sandboxMemoryMB, 256);
  assert.equal(config.customEvents.length, 1);
  assert.equal(config.customEvents[0].title, 'Comms blackout');
  assert.equal(config.keyPersonnel[0].name, 'Custom Chief');
});

test('normalizeSimulationConfig honors anthropic provider defaults and rejects mismatched model family by coercion', () => {
  const config = normalizeSimulationConfig({
    leaders: [leaderA, leaderB],
    provider: 'anthropic',
    models: {
      commander: 'gpt-5.4',
      departments: 'gpt-5.4-mini',
      judge: 'gpt-5.4',
    },
  });

  assert.equal(config.provider, 'anthropic');
  assert.equal(config.models.commander, 'claude-sonnet-4-6');
  assert.equal(config.models.departments, 'claude-sonnet-4-6');
  assert.equal(config.models.judge, 'claude-sonnet-4-6');
  assert.equal(config.models.director, 'claude-sonnet-4-6');
});

test('normalizeSimulationConfig infers provider from selected model family when provider is omitted', () => {
  const config = normalizeSimulationConfig({
    leaders: [leaderA, leaderB],
    models: {
      commander: 'claude-sonnet-4-6',
      departments: 'claude-sonnet-4-6',
      judge: 'claude-sonnet-4-6',
    },
  });

  assert.equal(config.provider, 'anthropic');
});

test('normalizeSimulationConfig keeps medical and engineering active even if omitted', () => {
  const config = normalizeSimulationConfig({
    leaders: [leaderA, leaderB],
    activeDepartments: ['governance'],
  });

  assert.deepEqual(config.activeDepartments, ['medical', 'engineering', 'governance']);
});

test('resolveSimulationModels uses provider defaults when models are omitted for standalone runs', () => {
  const anthropicModels = resolveSimulationModels('anthropic');
  assert.equal(anthropicModels.commander, 'claude-sonnet-4-6');
  assert.equal(anthropicModels.departments, 'claude-sonnet-4-6');
  assert.equal(anthropicModels.judge, 'claude-sonnet-4-6');
  assert.equal(anthropicModels.director, 'claude-sonnet-4-6');
  assert.equal(anthropicModels.agentReactions, 'claude-haiku-4-5-20251001');
});
