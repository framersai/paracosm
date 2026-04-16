/**
 * Lunar Outpost scenario package.
 * Loads scenario data from scenario.json and attaches runtime hooks.
 */

import type { ScenarioPackage, ScenarioHooks } from '../types.js';
import scenarioData from './scenario.json' with { type: 'json' };
import {
  lunarProgressionHook,
  lunarDepartmentPromptLines,
  lunarDirectorInstructions,
  lunarFingerprint,
  lunarPoliticsHook,
  lunarReactionContext,
  getLunarMilestoneCrisis,
} from './hooks.js';
import { LUNAR_KNOWLEDGE_BUNDLE } from './research-bundle.js';

/** Lunar Outpost scenario: 50-person crew at the lunar south pole. */
export const lunarScenario: ScenarioPackage = {
  ...scenarioData as any,

  ui: {
    ...scenarioData.ui as any,
    eventRenderers: Object.fromEntries(
      scenarioData.events.map(e => [e.id, { icon: e.icon, color: e.color }])
    ),
  },

  effects: [
    { id: 'category_effects', type: 'category_outcome', label: 'Category Outcome Effects', categoryDefaults: scenarioData.effects },
  ],

  world: {
    metrics: {}, capacities: {}, statuses: {}, politics: {},
    environment: {
      surfaceGravity: {
        id: 'surfaceGravity', label: 'Surface Gravity', unit: 'm/s²',
        type: 'number' as const, initial: 1.62, min: 0, category: 'environment' as const,
      },
    },
  },

  knowledge: LUNAR_KNOWLEDGE_BUNDLE,

  hooks: {
    progressionHook: lunarProgressionHook,
    departmentPromptHook: (ctx) => lunarDepartmentPromptLines(ctx.department, ctx.state),
    directorInstructions: lunarDirectorInstructions,
    fingerprintHook: lunarFingerprint,
    politicsHook: lunarPoliticsHook,
    reactionContextHook: lunarReactionContext,
    getMilestoneEvent: getLunarMilestoneCrisis,
  } satisfies ScenarioHooks,
};
