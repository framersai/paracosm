import type { Department, Agent } from '../engine/core/state.js';
import type { ColonyPatch } from '../engine/core/kernel.js';

export interface CrisisOption {
  id: string;
  label: string;
  description: string;
  isRisky: boolean;
}

export interface Citation {
  text: string;
  url: string;
  doi?: string;
  context: string;
}

export interface Risk {
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface Opportunity {
  impact: 'low' | 'medium' | 'high';
  description: string;
}

export interface ForgedToolUsage {
  name: string;
  mode: 'compose' | 'sandbox';
  description: string;
  output: unknown;
  confidence: number;
}

export interface FeaturedAgentUpdate {
  agentId: string;
  updates: {
    health?: Partial<Agent['health']>;
    career?: Partial<Agent['career']>;
    narrative?: { event: string };
  };
}

export interface DepartmentReport {
  department: Department;
  summary: string;
  citations: Citation[];
  risks: Risk[];
  opportunities: Opportunity[];
  recommendedActions: string[];
  proposedPatches: Partial<ColonyPatch>;
  forgedToolsUsed: ForgedToolUsage[];
  featuredAgentUpdates: FeaturedAgentUpdate[];
  confidence: number;
  openQuestions: string[];
  recommendedEffects?: TypedPolicyEffect[];
}

export interface CommanderDecision {
  selectedOptionId?: string;
  selectedEffectIds?: string[];
  decision: string;
  rationale: string;
  /**
   * Full stepwise reasoning populated by the commander's CoT prompt
   * (numbered list: personality pole, dept consensus, forged-tool
   * evidence, risk tradeoff, final choice). Empty string on pre-Zod
   * runs or on schema fallback. Dashboard renders behind a
   * "show full analysis" expand; `rationale` is the compressed view.
   */
  reasoning?: string;
  departmentsConsulted: Department[];
  selectedPolicies: string[];
  rejectedPolicies: Array<{ policy: string; reason: string }>;
  expectedTradeoffs: string[];
  watchMetricsNextTurn: string[];
}

export interface CrisisResearchPacket {
  canonicalFacts: Array<{ claim: string; source: string; url: string; doi?: string }>;
  counterpoints: Array<{ claim: string; source: string; url: string }>;
  departmentNotes: Record<string, string>;
}

export interface TurnArtifact {
  turn: number;
  year: number;
  crisis: string;
  departmentReports: DepartmentReport[];
  commanderDecision: CommanderDecision;
  policyEffectsApplied: string[];
  stateSnapshotAfter: {
    population: number;
    morale: number;
    foodMonthsReserve: number;
    infrastructureModules: number;
    scienceOutput: number;
    births: number;
    deaths: number;
  };
}

export interface PromotionDecision {
  promotions: Array<{
    agentId: string;
    department: Department;
    role: string;
    reason: string;
  }>;
}

export type PolicyEffectType =
  | 'resource_shift'
  | 'capacity_expansion'
  | 'population_intake'
  | 'risk_mitigation'
  | 'governance_change'
  | 'social_investment'
  | 'research_bet';

export interface TypedPolicyEffect {
  id: string;
  type: PolicyEffectType;
  description: string;
  colonyDelta?: Partial<{
    powerKw: number;
    foodMonthsReserve: number;
    waterLitersPerDay: number;
    pressurizedVolumeM3: number;
    lifeSupportCapacity: number;
    infrastructureModules: number;
    scienceOutput: number;
    morale: number;
  }>;
  politicsDelta?: Partial<{
    earthDependencyPct: number;
    independencePressure: number;
  }>;
}
