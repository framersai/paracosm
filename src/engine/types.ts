// ---------------------------------------------------------------------------
// Primitive value types
// ---------------------------------------------------------------------------

export type AgentFieldValue = number | string | boolean | string[];

// ---------------------------------------------------------------------------
// Scenario labels and theme
// ---------------------------------------------------------------------------

export interface ScenarioLabels {
  name: string;
  shortName: string;
  populationNoun: string;
  settlementNoun: string;
  currency: string;
}

export interface ScenarioTheme {
  primaryColor: string;
  accentColor: string;
  cssVariables: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Setup schema
// ---------------------------------------------------------------------------

export interface ScenarioSetupSchema {
  defaultTurns: number;
  defaultSeed: number;
  defaultStartYear: number;
  defaultPopulation: number;
  configurableSections: Array<'leaders' | 'personnel' | 'resources' | 'departments' | 'events' | 'models' | 'advanced'>;
}

// ---------------------------------------------------------------------------
// World state schema
// ---------------------------------------------------------------------------

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

export interface ScenarioWorldSchema {
  metrics: Record<string, WorldMetricSchema>;
  capacities: Record<string, WorldMetricSchema>;
  statuses: Record<string, WorldMetricSchema>;
  politics: Record<string, WorldMetricSchema>;
  environment: Record<string, WorldMetricSchema>;
}

export interface WorldState {
  metrics: Record<string, number>;
  capacities: Record<string, number>;
  statuses: Record<string, string | boolean>;
  politics: Record<string, number | string | boolean>;
  environment: Record<string, number | string | boolean>;
}

// ---------------------------------------------------------------------------
// Agent field definitions
// ---------------------------------------------------------------------------

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

export interface MetricDefinition {
  id: string;
  label: string;
  source: string;
  format: 'number' | 'percent' | 'currency' | 'duration';
}

export interface EffectDefinition {
  id: string;
  type: string;
  label: string;
  categoryDefaults: Record<string, Record<string, number>>;
}

export interface EventDefinition {
  id: string;
  label: string;
  icon: string;
  color: string;
}

// ---------------------------------------------------------------------------
// UI schema
// ---------------------------------------------------------------------------

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

export interface KnowledgeCitation {
  claim: string;
  source: string;
  url: string;
  doi?: string;
}

export interface KnowledgeTopic {
  canonicalFacts: KnowledgeCitation[];
  counterpoints: Array<{ claim: string; source: string; url: string }>;
  departmentNotes: Record<string, string>;
}

export interface KnowledgeBundle {
  topics: Record<string, KnowledgeTopic>;
  categoryMapping: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

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

export interface ProgressionHookContext {
  colonists: any[];
  yearDelta: number;
  year: number;
  turn: number;
  rng: any;
}

export interface PromptHookContext {
  department: string;
  state: any;
  scenario: any;
  researchPacket: any;
}

export interface ScenarioHooks {
  progressionHook?: (ctx: ProgressionHookContext) => void;
  departmentPromptHook?: (ctx: PromptHookContext) => string[];
  directorInstructions?: () => string;
  directorPromptHook?: (ctx: any) => string;
  reactionContextHook?: (colonist: any, ctx: any) => string;
  fingerprintHook?: (finalState: any, outcomeLog: any[], leader: any, toolRegs: Record<string, string[]>, maxTurns: number) => Record<string, string>;
}

// ---------------------------------------------------------------------------
// ScenarioPackage (top-level)
// ---------------------------------------------------------------------------

export interface ScenarioPackage {
  id: string;
  version: string;
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
