import test from 'node:test';
import assert from 'node:assert/strict';
import type { ScenarioPackage, WorldState, AgentFieldDefinition, MetricDefinition, EffectDefinition, EventDefinition, ScenarioPolicies, ScenarioUiDefinition, DepartmentDefinition, ScenarioHooks, ScenarioPreset, KnowledgeBundle } from './types.js';

test('ScenarioPackage type accepts a minimal valid scenario', () => {
  const scenario: ScenarioPackage = {
    id: 'test-scenario',
    version: '0.1.0',
    engineArchetype: 'closed_turn_based_settlement',
    labels: { name: 'Test', shortName: 'test', populationNoun: 'members', settlementNoun: 'base', currency: 'credits' },
    theme: { primaryColor: '#ff0000', accentColor: '#00ff00', cssVariables: {} },
    setup: { defaultTurns: 3, defaultSeed: 100, defaultStartYear: 2050, defaultPopulation: 50, configurableSections: ['leaders'] },
    world: {
      metrics: { morale: { id: 'morale', label: 'Morale', unit: '%', type: 'number', initial: 0.85, min: 0, max: 1, category: 'metric' } },
      capacities: {},
      statuses: {},
      politics: {},
      environment: {},
    },
    departments: [{ id: 'engineering', label: 'Engineering', role: 'Chief Engineer', icon: '🔧', defaultModel: 'gpt-5.4-mini', instructions: 'Analyze infrastructure.' }],
    metrics: [{ id: 'pop', label: 'Population', source: 'metrics.population', format: 'number' }],
    events: [{ id: 'crisis', label: 'Crisis', icon: '⚠️', color: '#ff0000' }],
    effects: [{ id: 'resource_shift', type: 'resource_shift', label: 'Resource Shift', categoryDefaults: {} }],
    ui: {
      headerMetrics: [{ id: 'pop', format: 'number' }],
      tooltipFields: [],
      reportSections: ['crisis', 'departments', 'decision'],
      departmentIcons: {},
      eventRenderers: {},
      setupSections: ['leaders'],
    },
    knowledge: { topics: {}, categoryMapping: {} },
    policies: {
      toolForging: { enabled: true },
      liveSearch: { enabled: false, mode: 'off' },
      bulletin: { enabled: true },
      characterChat: { enabled: false },
      sandbox: { timeoutMs: 10000, memoryMB: 128 },
    },
    presets: [],
    hooks: {},
  };

  assert.equal(scenario.id, 'test-scenario');
  assert.equal(scenario.engineArchetype, 'closed_turn_based_settlement');
  assert.equal(scenario.labels.populationNoun, 'members');
  assert.equal(scenario.world.metrics.morale.initial, 0.85);
  assert.equal(scenario.departments.length, 1);
  assert.equal(scenario.policies.toolForging.enabled, true);
});

test('WorldState accepts typed metric/capacity/status/politics/environment records', () => {
  const state: WorldState = {
    metrics: { population: 100, morale: 0.85, foodMonthsReserve: 18 },
    capacities: { lifeSupportCapacity: 120, pressurizedVolumeM3: 3000 },
    statuses: { governanceStatus: 'earth-governed' },
    politics: { earthDependencyPct: 95, independencePressure: 0.05 },
    environment: { surfaceRadiationMsvDay: 0.67 },
  };

  assert.equal(state.metrics.population, 100);
  assert.equal(state.statuses.governanceStatus, 'earth-governed');
  assert.equal(state.politics.earthDependencyPct, 95);
});

test('AgentFieldDefinition supports number, string, boolean, and tags types', () => {
  const fields: AgentFieldDefinition[] = [
    { id: 'radiation', label: 'Radiation', unit: 'mSv', type: 'number', initial: 0, min: 0, showInTooltip: true, includeInReactionContext: true },
    { id: 'marsborn', label: 'Mars-Born', unit: '', type: 'boolean', initial: false, showInTooltip: true, includeInReactionContext: true },
    { id: 'conditions', label: 'Conditions', unit: '', type: 'tags', initial: [], showInTooltip: false, includeInReactionContext: false },
  ];

  assert.equal(fields[0].type, 'number');
  assert.equal(fields[1].type, 'boolean');
  assert.equal(fields[2].type, 'tags');
});
