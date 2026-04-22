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
export { generateInitialPopulation } from './core/agent-generator.js';
export { progressBetweenTurns, applyPersonalityDrift, classifyOutcome, classifyOutcomeById } from './core/progression.js';

// Core types + generic aliases
export type {
  Agent, AgentCore, AgentHealth, AgentCareer, AgentSocial, AgentNarrative, AgentMemory, AgentMemoryEntry,
  WorldSystems, WorldPolitics, SimulationState, SimulationMetadata,
  HexacoProfile, TurnEvent, TurnOutcome, Department, PromotionRecord,
} from './core/state.js';

// Additional types
export type { KeyPersonnel } from './core/agent-generator.js';
export type { SystemsPatch, PolicyEffect, SimulationInitOverrides } from './core/kernel.js';
export type { HexacoSnapshot, LifeEvent } from './core/state.js';
export type { LeaderConfig, LlmProvider, SimulationModelConfig, Scenario, EventOptionDef, MilestoneEventDef, TurnOutcomeType } from './types.js';

// Registry types
export type { ScenarioMetric } from './mars/metrics.js';
export type { ScenarioEventDef } from './mars/events.js';
export type { OutcomeModifiers } from './effect-registry.js';

// Scenario packages
export { marsScenario } from './mars/index.js';
export { lunarScenario } from './lunar/index.js';

// Provider resolution — lets programmatic consumers catch the
// missing-key failure mode by class instead of string-matching, and
// lets tools/tests drive the resolver without importing from internal
// paths.
export { ProviderKeyMissingError, resolveProviderWithFallback } from './provider-resolver.js';
export type { ResolvedProviderChoice, ResolveProviderOptions } from './provider-resolver.js';

// Top-level client re-export so `import { createParacosmClient } from
// 'paracosm'` works. Keeps the discoverability bar low for new users:
// one import for the most common entry point, deeper imports available
// via `paracosm/runtime` and `paracosm/compiler` when needed.
export { createParacosmClient } from '../runtime/client.js';
export type { ParacosmClient, ParacosmClientOptions } from '../runtime/client.js';
export type { CostPreset } from '../cli/sim-config.js';
