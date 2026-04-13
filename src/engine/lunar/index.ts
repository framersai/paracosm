import type { ScenarioPackage } from '../types.js';
import { LUNAR_CATEGORY_EFFECTS } from './effects.js';
import { LUNAR_WORLD_METRICS, LUNAR_CAPACITY_METRICS } from './metrics.js';
import { LUNAR_EVENT_DEFINITIONS } from './events.js';
import { lunarProgressionHook } from './progression-hooks.js';
import { lunarDepartmentPromptLines, lunarDirectorInstructions } from './prompts.js';
import { LUNAR_KNOWLEDGE_BUNDLE } from './research-bundle.js';
import { LUNAR_DEFAULT_KEY_PERSONNEL, LUNAR_DEFAULT_LEADERS } from './presets.js';
import { lunarFingerprint } from './fingerprint.js';
import { lunarPoliticsHook } from './politics.js';
import { lunarReactionContext } from './reactions.js';
import { getLunarMilestoneCrisis } from './milestones.js';

function buildWorldSchema() {
  const toSchema = (metrics: typeof LUNAR_WORLD_METRICS) =>
    Object.fromEntries(metrics.map(m => [m.id, {
      id: m.id, label: m.label, unit: m.unit, type: m.type,
      initial: m.initial, min: m.min, max: m.max, category: m.category,
    }]));

  return {
    metrics: toSchema(LUNAR_WORLD_METRICS),
    capacities: toSchema(LUNAR_CAPACITY_METRICS),
    statuses: {},
    politics: {},
    environment: {
      surfaceGravity: {
        id: 'surfaceGravity', label: 'Surface Gravity', unit: 'm/s²',
        type: 'number' as const, initial: 1.62, min: 0, category: 'environment' as const,
      },
    },
  };
}

export const lunarScenario: ScenarioPackage = {
  id: 'lunar-outpost',
  version: '1.0.0',
  engineArchetype: 'closed_turn_based_settlement',

  labels: {
    name: 'Lunar Outpost',
    shortName: 'lunar',
    populationNoun: 'crew members',
    settlementNoun: 'outpost',
    currency: 'credits',
  },

  theme: {
    primaryColor: '#6366f1',
    accentColor: '#a5b4fc',
    cssVariables: {
      '--bg-primary': '#0a0a14',
      '--bg-secondary': '#10101f',
      '--text-primary': '#e0e0f0',
      '--accent': '#6366f1',
    },
  },

  setup: {
    defaultTurns: 8,
    defaultSeed: 1200,
    defaultStartYear: 2030,
    defaultPopulation: 50,
    configurableSections: ['leaders', 'personnel', 'resources', 'departments', 'events', 'models', 'advanced'],
  },

  world: buildWorldSchema(),

  departments: [
    { id: 'medical', label: 'Medical', role: 'Chief Medical Officer', icon: '🏥', defaultModel: 'gpt-5.4-mini', instructions: 'You are the Chief Medical Officer of a lunar outpost. You analyze crew health: regolith dust exposure, muscle atrophy in 1/6g, bone density loss, psychological wellbeing.' },
    { id: 'engineering', label: 'Engineering', role: 'Chief Engineer', icon: '⚙️', defaultModel: 'gpt-5.4-mini', instructions: 'You are the Chief Engineer of a lunar outpost. You analyze infrastructure: habitat integrity, power systems (solar + nuclear), thermal management, construction.' },
    { id: 'mining', label: 'Mining', role: 'Mining Operations Lead', icon: '⛏️', defaultModel: 'gpt-5.4-mini', instructions: 'You are the Mining Operations Lead. You analyze ISRU: water ice extraction from shadowed craters, regolith processing, construction material production.' },
    { id: 'life-support', label: 'Life Support', role: 'Life Support Chief', icon: '🫧', defaultModel: 'gpt-5.4-mini', instructions: 'You are the Life Support Chief. You analyze ECLSS: oxygen from electrolysis, water recycling, food production, atmospheric management.' },
    { id: 'communications', label: 'Communications', role: 'Communications Officer', icon: '📡', defaultModel: 'gpt-5.4-mini', instructions: 'You are the Communications Officer. You analyze Earth link: signal scheduling, relay satellite status, data transmission, crew morale through connectivity.' },
  ],

  metrics: [
    { id: 'population', label: 'Crew', source: 'metrics.population', format: 'number' },
    { id: 'morale', label: 'Morale', source: 'metrics.morale', format: 'percent' },
    { id: 'foodMonthsReserve', label: 'Food', source: 'metrics.foodMonthsReserve', format: 'number' },
    { id: 'powerKw', label: 'Power', source: 'metrics.powerKw', format: 'number' },
    { id: 'infrastructureModules', label: 'Modules', source: 'metrics.infrastructureModules', format: 'number' },
    { id: 'scienceOutput', label: 'Science', source: 'metrics.scienceOutput', format: 'number' },
  ],

  events: LUNAR_EVENT_DEFINITIONS,

  effects: [
    { id: 'category_effects', type: 'category_outcome', label: 'Category Outcome Effects', categoryDefaults: LUNAR_CATEGORY_EFFECTS },
  ],

  ui: {
    headerMetrics: [
      { id: 'population', format: 'number' },
      { id: 'morale', format: 'percent' },
      { id: 'foodMonthsReserve', format: 'number' },
      { id: 'powerKw', format: 'number' },
      { id: 'infrastructureModules', format: 'number' },
      { id: 'scienceOutput', format: 'number' },
    ],
    tooltipFields: ['boneDensityPct', 'cumulativeRadiationMsv', 'psychScore'],
    reportSections: ['crisis', 'departments', 'decision', 'outcome'],
    departmentIcons: { medical: '🏥', engineering: '⚙️', mining: '⛏️', 'life-support': '🫧', communications: '📡' },
    eventRenderers: Object.fromEntries(LUNAR_EVENT_DEFINITIONS.map(e => [e.id, { icon: e.icon, color: e.color }])),
    setupSections: ['leaders', 'personnel', 'resources', 'departments', 'events', 'models', 'advanced'],
  },

  knowledge: LUNAR_KNOWLEDGE_BUNDLE,

  policies: {
    toolForging: { enabled: true, requiredPerDepartment: true },
    liveSearch: { enabled: false, mode: 'off' },
    bulletin: { enabled: true },
    characterChat: { enabled: true },
    sandbox: { timeoutMs: 10000, memoryMB: 128 },
  },

  presets: [
    {
      id: 'default',
      label: 'Default Lunar Outpost',
      leaders: LUNAR_DEFAULT_LEADERS.map(l => ({
        name: l.name,
        archetype: l.archetype,
        hexaco: l.hexaco as any,
        instructions: l.instructions,
      })),
      personnel: LUNAR_DEFAULT_KEY_PERSONNEL.map(p => ({
        name: p.name,
        department: p.department,
        role: p.role,
        specialization: p.specialization,
        age: p.age,
        featured: p.featured,
      })),
    },
  ],

  hooks: {
    progressionHook: lunarProgressionHook,
    departmentPromptHook: (ctx) => lunarDepartmentPromptLines(ctx.department, ctx.state),
    directorInstructions: lunarDirectorInstructions,
    fingerprintHook: lunarFingerprint,
    politicsHook: lunarPoliticsHook,
    reactionContextHook: lunarReactionContext,
    getMilestoneCrisis: getLunarMilestoneCrisis,
  },
};
