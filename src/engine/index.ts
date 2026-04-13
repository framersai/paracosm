/**
 * Paracosm Engine — public API
 *
 * Closed-state, turn-based settlement simulation engine.
 * Import scenario packages, registries, and core types.
 */

// Type system
export type {
  ScenarioPackage,
  ScenarioLabels,
  ScenarioTheme,
  ScenarioSetupSchema,
  ScenarioWorldSchema,
  WorldMetricSchema,
  WorldState,
  AgentFieldValue,
  AgentFieldDefinition,
  DepartmentDefinition,
  MetricDefinition,
  EffectDefinition,
  EventDefinition,
  ScenarioUiDefinition,
  KnowledgeCitation,
  KnowledgeTopic,
  KnowledgeBundle,
  ScenarioPolicies,
  ScenarioPreset,
  ProgressionHookContext,
  PromptHookContext,
  ScenarioHooks,
} from './types.js';

// Registries
export { EffectRegistry } from './effect-registry.js';
export { MetricRegistry } from './metric-registry.js';
export { EventTaxonomy } from './event-taxonomy.js';

// Core kernel
export { SimulationKernel } from './core/kernel.js';
export { SeededRng } from './core/rng.js';
export { generateInitialPopulation } from './core/colonist-generator.js';
export { progressBetweenTurns, applyPersonalityDrift, classifyOutcome, classifyOutcomeById } from './core/progression.js';

// Core types + generic aliases
export type {
  Colonist, ColonistCore, ColonistHealth, ColonistCareer, ColonistSocial, ColonistNarrative,
  ColonySystems, ColonyPolitics, SimulationState, SimulationMetadata,
  HexacoProfile, TurnEvent, TurnOutcome, Department, PromotionRecord,
} from './core/state.js';

// Generic aliases for external consumers
export type { Colonist as Agent } from './core/state.js';
export type { ColonistCore as AgentCore } from './core/state.js';
export type { ColonistHealth as AgentHealth } from './core/state.js';
export type { ColonistCareer as AgentCareer } from './core/state.js';
export type { ColonistSocial as AgentSocial } from './core/state.js';
export type { ColonistNarrative as AgentNarrative } from './core/state.js';
export type { KeyPersonnel } from './core/colonist-generator.js';
export type { ColonyPatch, PolicyEffect, SimulationInitOverrides } from './core/kernel.js';
export type { HexacoSnapshot, LifeEvent } from './core/state.js';
export type { LeaderConfig, LlmProvider, SimulationModelConfig } from './types.js';

// Re-export registry types for typedoc
export type { ScenarioMetric } from './mars/metrics.js';
export type { ScenarioEventDef } from './mars/events.js';

// Scenario packages
export { marsScenario } from './mars/index.js';
export { lunarScenario } from './lunar/index.js';
