/**
 * SCENARIO TEMPLATE — Replace "my-scenario" with your scenario name.
 *
 * Copy this entire _template/ directory and fill in each file.
 * See src/engine/mars/ and src/engine/lunar/ for complete examples.
 */

import type { ScenarioPackage } from '../types.js';
// Import your scenario components:
// import { MY_CATEGORY_EFFECTS } from './effects.js';
// import { MY_WORLD_METRICS, MY_CAPACITY_METRICS } from './metrics.js';
// import { MY_EVENT_DEFINITIONS } from './events.js';
// import { myProgressionHook } from './progression-hooks.js';
// import { myDepartmentPromptLines, myDirectorInstructions } from './prompts.js';
// import { MY_KNOWLEDGE_BUNDLE } from './research-bundle.js';
// import { MY_DEFAULT_KEY_PERSONNEL, MY_DEFAULT_LEADERS } from './presets.js';
// import { myFingerprint } from './fingerprint.js';
// import { myPoliticsHook } from './politics.js';
// import { myReactionContext } from './reactions.js';
// import { getMyMilestoneCrisis } from './milestones.js';

export const myScenario: ScenarioPackage = {
  id: 'my-scenario',
  version: '1.0.0',
  engineArchetype: 'closed_turn_based_settlement',

  labels: {
    name: 'My Scenario',
    shortName: 'my',
    populationNoun: 'members',
    settlementNoun: 'settlement',
    currency: 'credits',
    timeUnitNoun: 'year',
    timeUnitNounPlural: 'years',
  },

  theme: {
    primaryColor: '#22c55e',
    accentColor: '#86efac',
    cssVariables: {},
  },

  setup: {
    defaultTurns: 8,
    defaultSeed: 100,
    defaultStartTime: 2040,
    defaultPopulation: 50,
    configurableSections: ['actors', 'personnel', 'resources', 'departments', 'events', 'models', 'advanced'],
  },

  world: {
    metrics: {},
    capacities: {},
    statuses: {},
    politics: {},
    environment: {},
  },

  departments: [
    // { id: 'engineering', label: 'Engineering', role: 'Chief Engineer', icon: '⚙️', defaultModel: 'gpt-5.4-mini', instructions: '...' },
  ],

  metrics: [
    // { id: 'population', label: 'Population', source: 'metrics.population', format: 'number' },
  ],

  events: [
    // { id: 'crisis', label: 'Crisis', icon: '⚠️', color: '#ef4444' },
  ],

  effects: [
    // { id: 'category_effects', type: 'category_outcome', label: 'Category Effects', categoryDefaults: MY_CATEGORY_EFFECTS },
  ],

  ui: {
    headerMetrics: [],
    tooltipFields: [],
    reportSections: ['crisis', 'departments', 'decision', 'outcome'],
    departmentIcons: {},
    eventRenderers: {},
    setupSections: ['actors', 'personnel', 'resources', 'departments', 'events', 'models', 'advanced'],
  },

  knowledge: {
    topics: {},
    categoryMapping: {},
  },

  policies: {
    toolForging: { enabled: true },
    liveSearch: { enabled: false, mode: 'off' },
    bulletin: { enabled: true },
    characterChat: { enabled: true },
    sandbox: { timeoutMs: 10000, memoryMB: 128 },
  },

  presets: [],

  hooks: {
    // progressionHook: myProgressionHook,
    // departmentPromptHook: (ctx) => myDepartmentPromptLines(ctx.department, ctx.state),
    // directorInstructions: myDirectorInstructions,
    // fingerprintHook: myFingerprint,
    // politicsHook: myPoliticsHook,
    // reactionContextHook: myReactionContext,
    // getMilestoneEvent: getMyMilestoneEvent,
  },
};
