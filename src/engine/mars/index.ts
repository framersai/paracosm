/**
 * Mars Genesis scenario package.
 * Loads scenario data from scenario.json and attaches runtime hooks.
 */

import type { ScenarioPackage } from '../types.js';
import scenarioData from './scenario.json' with { type: 'json' };
import {
  marsProgressionHook,
  marsDepartmentPromptLines,
  marsDirectorInstructions,
  marsFingerprint,
  marsPoliticsHook,
  marsReactionContext,
  getMarsMilestoneCrisis,
} from './hooks.js';
import { MARS_KNOWLEDGE_BUNDLE } from './research-bundle.js';
import { MARS_WORLD_METRICS, MARS_CAPACITY_METRICS, MARS_STATUS_METRICS, MARS_POLITICS_METRICS } from './metrics.js';

/** Mars Genesis scenario: 100-colonist Mars colony over 50 simulated years. */
export const marsScenario: ScenarioPackage = {
  ...scenarioData as any,

  // Event renderers derived from events array
  ui: {
    ...scenarioData.ui as any,
    eventRenderers: Object.fromEntries(
      scenarioData.events.map(e => [e.id, { icon: e.icon, color: e.color }])
    ),
  },

  // Effects wrapped in the expected array format
  effects: [
    { id: 'category_effects', type: 'category_outcome', label: 'Category Outcome Effects', categoryDefaults: scenarioData.effects },
  ],

  // World schema from metric definitions
  world: {
    metrics: Object.fromEntries(MARS_WORLD_METRICS.map(m => [m.id, { id: m.id, label: m.label, unit: m.unit, type: m.type, initial: m.initial, min: m.min, max: m.max, category: m.category }])),
    capacities: Object.fromEntries(MARS_CAPACITY_METRICS.map(m => [m.id, { id: m.id, label: m.label, unit: m.unit, type: m.type, initial: m.initial, min: m.min, max: m.max, category: m.category }])),
    statuses: Object.fromEntries(MARS_STATUS_METRICS.map(m => [m.id, { id: m.id, label: m.label, unit: m.unit, type: m.type, initial: m.initial, category: m.category }])),
    politics: Object.fromEntries(MARS_POLITICS_METRICS.map(m => [m.id, { id: m.id, label: m.label, unit: m.unit, type: m.type, initial: m.initial, min: m.min, max: m.max, category: m.category }])),
    environment: {
      surfaceRadiationMsvDay: { id: 'surfaceRadiationMsvDay', label: 'Surface Radiation', unit: 'mSv/day', type: 'number' as const, initial: 0.67, min: 0, category: 'environment' as const },
    },
  },

  // Knowledge bundle (too large for JSON import, kept as TS module)
  knowledge: MARS_KNOWLEDGE_BUNDLE,

  // Runtime hooks (functions, not serializable)
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
