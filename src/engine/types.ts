/**
 * @module types
 * Core type definitions for the Paracosm simulation engine.
 * All types needed to define a ScenarioPackage and interact with the engine.
 */

import type { HexacoProfile, Agent, SimulationState } from './core/state.js';

// ---------------------------------------------------------------------------
// Primitive value types
// ---------------------------------------------------------------------------

/** Possible field values for agent/colonist custom fields. */
export type AgentFieldValue = number | string | boolean | string[];

// ---------------------------------------------------------------------------
// Scenario labels and theme
// ---------------------------------------------------------------------------

/** Human-readable labels for a scenario, used in UI and output naming. */
export interface ScenarioLabels {
  /** Full display name (e.g., "Mars Genesis") */
  name: string;
  /** Short identifier used in file names and localStorage keys */
  shortName: string;
  /** What to call population members (e.g., "colonists", "crew members") */
  populationNoun: string;
  /** What to call the settlement (e.g., "colony", "outpost") */
  settlementNoun: string;
  /** Currency unit (e.g., "credits") */
  currency: string;
}

/** Visual theme for a scenario. Applied to the dashboard via CSS custom properties. */
export interface ScenarioTheme {
  primaryColor: string;
  accentColor: string;
  /** CSS custom properties injected into :root on scenario load */
  cssVariables: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Setup schema
// ---------------------------------------------------------------------------

/** Default values for the simulation setup form. */
export interface ScenarioSetupSchema {
  defaultTurns: number;
  defaultSeed: number;
  defaultStartYear: number;
  defaultPopulation: number;
  /** Which setup form sections to expose in the dashboard */
  configurableSections: Array<'leaders' | 'personnel' | 'resources' | 'departments' | 'events' | 'models' | 'advanced'>;
}

// ---------------------------------------------------------------------------
// World state schema
// ---------------------------------------------------------------------------

/** Schema for a single world metric, capacity, status, or political variable. */
export interface WorldMetricSchema {
  id: string;
  label: string;
  unit: string;
  type: 'number' | 'string' | 'boolean';
  initial: number | string | boolean;
  min?: number;
  max?: number;
  category: 'metric' | 'capacity' | 'status' | 'politic' | 'environment';
}

/** Declares all world state variables for a scenario. */
export interface ScenarioWorldSchema {
  metrics: Record<string, WorldMetricSchema>;
  capacities: Record<string, WorldMetricSchema>;
  statuses: Record<string, WorldMetricSchema>;
  politics: Record<string, WorldMetricSchema>;
  environment: Record<string, WorldMetricSchema>;
}

/** Runtime world state with typed record bags. Not everything is a flat numeric resource. */
export interface WorldState {
  /** Numeric gauges: food, power, water, population, morale */
  metrics: Record<string, number>;
  /** Capacity constraints: life support, housing */
  capacities: Record<string, number>;
  /** Categorical state: governance status, faction alignment */
  statuses: Record<string, string | boolean>;
  /** Political/social pressures */
  politics: Record<string, number | string | boolean>;
  /** Environment conditions */
  environment: Record<string, number | string | boolean>;
}

// ---------------------------------------------------------------------------
// Agent field definitions
// ---------------------------------------------------------------------------

/** Defines a custom field on agents/colonists for a scenario. */
export interface AgentFieldDefinition {
  id: string;
  label: string;
  unit: string;
  type: 'number' | 'string' | 'boolean' | 'tags';
  initial: AgentFieldValue;
  min?: number;
  max?: number;
  mortalityContribution?: { threshold: number; ratePerYear: number };
  showInTooltip: boolean;
  includeInReactionContext: boolean;
}

// ---------------------------------------------------------------------------
// Department definitions
// ---------------------------------------------------------------------------

/** Defines a department (analysis group) in the scenario. */
export interface DepartmentDefinition {
  id: string;
  label: string;
  role: string;
  icon: string;
  defaultModel: string;
  instructions: string;
}

// ---------------------------------------------------------------------------
// Metrics, effects, events
// ---------------------------------------------------------------------------

/** Defines a derived metric displayed in the dashboard header. */
export interface MetricDefinition {
  id: string;
  label: string;
  source: string;
  format: 'number' | 'percent' | 'currency' | 'duration';
}

/** Defines an effect category with base deltas applied on crisis outcomes. */
export interface EffectDefinition {
  id: string;
  type: string;
  label: string;
  /** Maps crisis category to base colony system deltas */
  categoryDefaults: Record<string, Record<string, number>>;
}

/** Defines an event type with render metadata for the dashboard. */
export interface EventDefinition {
  id: string;
  label: string;
  icon: string;
  color: string;
}

// ---------------------------------------------------------------------------
// UI schema
// ---------------------------------------------------------------------------

/** Tells the dashboard how to render scenario-specific UI elements. */
export interface ScenarioUiDefinition {
  headerMetrics: Array<{ id: string; format: 'number' | 'percent' | 'currency' | 'duration' }>;
  tooltipFields: string[];
  reportSections: Array<'crisis' | 'departments' | 'decision' | 'outcome' | 'quotes' | 'causality'>;
  departmentIcons: Record<string, string>;
  eventRenderers: Record<string, { icon: string; color: string }>;
  setupSections: Array<'leaders' | 'personnel' | 'resources' | 'departments' | 'events' | 'models' | 'advanced'>;
}

// ---------------------------------------------------------------------------
// Knowledge bundle
// ---------------------------------------------------------------------------

/** A single research citation with optional DOI. */
export interface KnowledgeCitation {
  claim: string;
  source: string;
  url: string;
  doi?: string;
}

/** A research topic with facts, counterpoints, and department-specific notes. */
export interface KnowledgeTopic {
  canonicalFacts: KnowledgeCitation[];
  counterpoints: Array<{ claim: string; source: string; url: string }>;
  departmentNotes: Record<string, string>;
}

/** Scenario-owned research knowledge organized by topic with crisis category mapping. */
export interface KnowledgeBundle {
  topics: Record<string, KnowledgeTopic>;
  /** Maps crisis category to relevant topic IDs */
  categoryMapping: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

/** Feature policies controlling what capabilities are enabled for a scenario. */
export interface ScenarioPolicies {
  toolForging: { enabled: boolean; requiredPerDepartment?: boolean };
  liveSearch: { enabled: boolean; mode: 'off' | 'manual' | 'auto' };
  bulletin: { enabled: boolean };
  characterChat: { enabled: boolean };
  sandbox: { timeoutMs: number; memoryMB: number };
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/** A product-level preset with pre-configured leaders, personnel, and starting state. */
export interface ScenarioPreset {
  id: string;
  label: string;
  leaders?: Array<{ name: string; archetype: string; hexaco: Record<string, number>; instructions: string }>;
  personnel?: Array<{ name: string; department: string; role: string; specialization: string; age: number; featured: boolean }>;
  startingState?: Partial<WorldState>;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Context passed to the scenario progression hook during between-turn advancement. */
export interface ProgressionHookContext {
  /** All agents (mutable: the hook modifies health fields in place) */
  agents: Agent[];
  yearDelta: number;
  year: number;
  turn: number;
  startYear: number;
  /** Seeded RNG for deterministic random operations */
  rng: { chance(probability: number): boolean; next(): number; pick<T>(arr: readonly T[]): T; int(min: number, max: number): number };
}

/** Context passed to the scenario department prompt hook. */
export interface PromptHookContext {
  department: string;
  state: SimulationState;
  scenario: Scenario;
  researchPacket: { canonicalFacts: Array<{ claim: string; source: string; url: string }>; counterpoints: Array<{ claim: string; source: string; url: string }>; departmentNotes: Record<string, string> };
}

/** Outcome classification for a turn. */
export type TurnOutcomeType = 'risky_success' | 'risky_failure' | 'conservative_success' | 'conservative_failure';

/**
 * Lifecycle hooks that a scenario provides to inject domain-specific behavior
 * into the generic engine. All hooks are optional.
 */
export interface ScenarioHooks {
  /** Called during between-turn progression for scenario-specific health/field changes (e.g., radiation, bone density) */
  progressionHook?: (ctx: ProgressionHookContext) => void;
  /** Builds department-specific prompt context lines for LLM department agents */
  departmentPromptHook?: (ctx: PromptHookContext) => string[];
  /** Returns the Event Director's system instructions for this scenario */
  directorInstructions?: () => string;
  /** Builds the Event Director's per-turn context prompt */
  directorPromptHook?: (ctx: Record<string, unknown>) => string;
  /** Returns location/identity/health phrasing for agent reaction prompts */
  reactionContextHook?: (colonist: Agent, ctx: { year: number; turn: number }) => string;
  /** Computes a timeline fingerprint classification from final simulation state */
  fingerprintHook?: (finalState: SimulationState, outcomeLog: Array<{ turn: number; year: number; outcome: string }>, leader: LeaderConfig, toolRegs: Record<string, string[]>, maxTurns: number) => Record<string, string>;
  /** Returns a milestone event for narrative anchor turns (turn 1, final turn) */
  getMilestoneEvent?: (turn: number, maxTurns: number) => MilestoneEventDef | null;
  /** @deprecated Use getMilestoneEvent */
  getMilestoneCrisis?: (turn: number, maxTurns: number) => MilestoneCrisisDef | null;
  /** Returns politics deltas for political/social events, null if not applicable */
  politicsHook?: (category: string, outcome: string) => Record<string, number> | null;
}

// ---------------------------------------------------------------------------
// Event definitions (scenario-driven turn events)
// ---------------------------------------------------------------------------

/** An option presented to the commander for a turn event. */
export interface EventOptionDef {
  id: string;
  label: string;
  description: string;
  isRisky: boolean;
}

/** A milestone event (fixed narrative anchor, e.g., turn 1 founding or final assessment). */
export interface MilestoneEventDef {
  title: string;
  description: string;
  /** @deprecated Use description */
  crisis?: string;
  options: EventOptionDef[];
  riskyOptionId: string;
  riskSuccessProbability: number;
  category: string;
  researchKeywords: string[];
  relevantDepartments: string[];
  turnSummary: string;
}

/** Legacy turn-based scenario (used by static SCENARIOS array and department context). */
export interface Scenario {
  turn: number;
  year: number;
  title: string;
  crisis: string;
  researchKeywords: string[];
  snapshotHints: Record<string, unknown>;
  riskyOption: string;
  riskSuccessProbability: number;
  options?: EventOptionDef[];
}

// Backward-compatible aliases
/** @deprecated Use EventOptionDef */
export type CrisisOptionDef = EventOptionDef;
/** @deprecated Use MilestoneEventDef */
export type MilestoneCrisisDef = MilestoneEventDef;

// ---------------------------------------------------------------------------
// Leader config
// ---------------------------------------------------------------------------

/** Configuration for a simulation leader/commander. */
export interface LeaderConfig {
  name: string;
  archetype: string;
  colony: string;
  hexaco: HexacoProfile;
  instructions: string;
}

// ---------------------------------------------------------------------------
// LLM provider types
// ---------------------------------------------------------------------------

/** Supported LLM provider. */
export type LlmProvider = 'openai' | 'anthropic';

/** Model assignments for different simulation roles. */
export interface SimulationModelConfig {
  commander: string;
  departments: string;
  judge: string;
  director: string;
  agentReactions?: string;
}

// ---------------------------------------------------------------------------
// ScenarioPackage (top-level)
// ---------------------------------------------------------------------------

/**
 * The top-level contract for a Paracosm scenario.
 * Defines everything the engine needs to run a closed-state, turn-based
 * settlement simulation: world schema, departments, effects, UI metadata,
 * research knowledge, policies, presets, and lifecycle hooks.
 *
 * @example
 * ```typescript
 * import type { ScenarioPackage } from 'paracosm';
 * import { marsScenario } from 'paracosm/mars';
 *
 * const myScenario: ScenarioPackage = { ... };
 * ```
 */
export interface ScenarioPackage {
  /** Unique scenario identifier (e.g., "mars-genesis", "lunar-outpost") */
  id: string;
  /** Semantic version of this scenario definition */
  version: string;
  /** Engine archetype this scenario targets */
  engineArchetype: 'closed_turn_based_settlement';

  labels: ScenarioLabels;
  theme: ScenarioTheme;
  setup: ScenarioSetupSchema;
  world: ScenarioWorldSchema;

  departments: DepartmentDefinition[];
  metrics: MetricDefinition[];
  events: EventDefinition[];
  effects: EffectDefinition[];
  ui: ScenarioUiDefinition;
  knowledge: KnowledgeBundle;
  policies: ScenarioPolicies;
  presets: ScenarioPreset[];
  hooks: ScenarioHooks;
}
