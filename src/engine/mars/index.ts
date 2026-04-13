import type { ScenarioPackage } from '../types.js';
import { MARS_CATEGORY_EFFECTS } from './effects.js';
import { MARS_WORLD_METRICS, MARS_CAPACITY_METRICS, MARS_STATUS_METRICS, MARS_POLITICS_METRICS } from './metrics.js';
import { MARS_EVENT_DEFINITIONS } from './events.js';
import { marsProgressionHook } from './progression-hooks.js';
import { marsDepartmentPromptLines, marsDirectorInstructions } from './prompts.js';
import { MARS_KNOWLEDGE_BUNDLE } from './research-bundle.js';
import { MARS_DEFAULT_KEY_PERSONNEL, MARS_DEFAULT_LEADERS } from './presets.js';
import { marsFingerprint } from './fingerprint.js';
import { marsPoliticsHook } from './politics.js';
import { marsReactionContext } from './reactions.js';
import { getMarsMilestoneCrisis } from './milestones.js';

/** Build world schema from extracted metric definitions */
function buildWorldSchema() {
  const toSchema = (metrics: typeof MARS_WORLD_METRICS) =>
    Object.fromEntries(metrics.map(m => [m.id, {
      id: m.id, label: m.label, unit: m.unit, type: m.type,
      initial: m.initial, min: m.min, max: m.max, category: m.category,
    }]));

  return {
    metrics: toSchema(MARS_WORLD_METRICS),
    capacities: toSchema(MARS_CAPACITY_METRICS),
    statuses: toSchema(MARS_STATUS_METRICS),
    politics: toSchema(MARS_POLITICS_METRICS),
    environment: {
      surfaceRadiationMsvDay: {
        id: 'surfaceRadiationMsvDay', label: 'Surface Radiation', unit: 'mSv/day',
        type: 'number' as const, initial: 0.67, min: 0, category: 'environment' as const,
      },
    },
  };
}

export const marsScenario: ScenarioPackage = {
  id: 'mars-genesis',
  version: '3.0.0',
  engineArchetype: 'closed_turn_based_settlement',

  labels: {
    name: 'Mars Genesis',
    shortName: 'mars',
    populationNoun: 'colonists',
    settlementNoun: 'colony',
    currency: 'credits',
  },

  theme: {
    primaryColor: '#dc2626',
    accentColor: '#f97316',
    cssVariables: {
      '--bg-primary': '#0a0a0f',
      '--bg-secondary': '#14141f',
      '--text-primary': '#e5e5e5',
      '--accent': '#dc2626',
    },
  },

  setup: {
    defaultTurns: 12,
    defaultSeed: 950,
    defaultStartYear: 2035,
    defaultPopulation: 100,
    configurableSections: ['leaders', 'personnel', 'resources', 'departments', 'events', 'models', 'advanced'],
  },

  world: buildWorldSchema(),

  departments: [
    { id: 'medical', label: 'Medical', role: 'Chief Medical Officer', icon: '🏥', defaultModel: 'gpt-5.4-mini', instructions: 'You are the Chief Medical Officer of a Mars colony. You analyze health impacts: radiation, bone density, disease, injuries, mortality risk, psychological wellbeing.' },
    { id: 'engineering', label: 'Engineering', role: 'Chief Engineer', icon: '⚙️', defaultModel: 'gpt-5.4-mini', instructions: 'You are the Chief Engineer of a Mars colony. You analyze infrastructure: habitat integrity, power, life support capacity, water systems, construction.' },
    { id: 'agriculture', label: 'Agriculture', role: 'Head of Agriculture', icon: '🌱', defaultModel: 'gpt-5.4-mini', instructions: 'You are the Head of Agriculture for a Mars colony. You analyze food security: crop yields, soil remediation, hydroponic capacity, caloric needs, reserves.' },
    { id: 'psychology', label: 'Psychology', role: 'Colony Psychologist', icon: '🧠', defaultModel: 'gpt-5.4-mini', instructions: 'You are the Colony Psychologist. You analyze morale, isolation effects, depression risk, social cohesion, generational tensions.' },
    { id: 'governance', label: 'Governance', role: 'Governance Advisor', icon: '🏛️', defaultModel: 'gpt-5.4-mini', instructions: 'You are the Governance Advisor. You analyze self-sufficiency, Earth dependency, political pressure, independence readiness.' },
  ],

  metrics: [
    { id: 'population', label: 'Population', source: 'metrics.population', format: 'number' },
    { id: 'morale', label: 'Morale', source: 'metrics.morale', format: 'percent' },
    { id: 'foodMonthsReserve', label: 'Food', source: 'metrics.foodMonthsReserve', format: 'number' },
    { id: 'powerKw', label: 'Power', source: 'metrics.powerKw', format: 'number' },
    { id: 'infrastructureModules', label: 'Modules', source: 'metrics.infrastructureModules', format: 'number' },
    { id: 'scienceOutput', label: 'Science', source: 'metrics.scienceOutput', format: 'number' },
  ],

  events: MARS_EVENT_DEFINITIONS,

  effects: [
    { id: 'category_effects', type: 'category_outcome', label: 'Category Outcome Effects', categoryDefaults: MARS_CATEGORY_EFFECTS },
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
    tooltipFields: ['boneDensityPct', 'cumulativeRadiationMsv', 'psychScore', 'marsborn'],
    reportSections: ['crisis', 'departments', 'decision', 'outcome', 'quotes'],
    departmentIcons: { medical: '🏥', engineering: '⚙️', agriculture: '🌱', psychology: '🧠', governance: '🏛️' },
    eventRenderers: Object.fromEntries(MARS_EVENT_DEFINITIONS.map(e => [e.id, { icon: e.icon, color: e.color }])),
    setupSections: ['leaders', 'personnel', 'resources', 'departments', 'events', 'models', 'advanced'],
  },

  knowledge: MARS_KNOWLEDGE_BUNDLE,

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
      label: 'Default Mars Genesis',
      leaders: MARS_DEFAULT_LEADERS.map(l => ({
        name: l.name,
        archetype: l.archetype,
        hexaco: l.hexaco as any,
        instructions: l.instructions,
      })),
      personnel: MARS_DEFAULT_KEY_PERSONNEL.map(p => ({
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
    progressionHook: marsProgressionHook,
    departmentPromptHook: (ctx) => marsDepartmentPromptLines(ctx.department, ctx.state),
    directorInstructions: marsDirectorInstructions,
    fingerprintHook: marsFingerprint,
    politicsHook: marsPoliticsHook,
    reactionContextHook: marsReactionContext,
    getMilestoneCrisis: getMarsMilestoneCrisis,
  },
};
