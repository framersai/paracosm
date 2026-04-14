/** Department ID. Scenario-defined, not a fixed union. */
export type Department = string;

export interface HexacoProfile {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  emotionality: number;
  honestyHumility: number;
}

export const HEXACO_TRAITS: (keyof HexacoProfile)[] = [
  'openness', 'conscientiousness', 'extraversion',
  'agreeableness', 'emotionality', 'honestyHumility',
];

export interface PromotionRecord {
  department: Department;
  role: string;
  turnPromoted: number;
  promotedBy: string;
}

export interface HexacoSnapshot {
  turn: number;
  year: number;
  hexaco: HexacoProfile;
}

export type TurnOutcome = 'risky_success' | 'risky_failure' | 'conservative_success' | 'conservative_failure';

export interface LifeEvent {
  year: number;
  event: string;
  source: Department | 'kernel' | 'commander';
}

export interface AgentCore {
  id: string;
  name: string;
  birthYear: number;
  marsborn: boolean;
  department: Department;
  role: string;
}

export interface AgentHealth {
  alive: boolean;
  deathYear?: number;
  deathCause?: string;
  boneDensityPct: number;
  cumulativeRadiationMsv: number;
  psychScore: number;
  conditions: string[];
}

export interface AgentCareer {
  specialization: string;
  yearsExperience: number;
  rank: 'junior' | 'senior' | 'lead' | 'chief';
  achievements: string[];
  currentProject?: string;
}

export interface AgentSocial {
  partnerId?: string;
  childrenIds: string[];
  friendIds: string[];
  earthContacts: number;
}

export interface AgentNarrative {
  lifeEvents: LifeEvent[];
  featured: boolean;
}

/** A single memory entry from a agent's persistent memory. */
export interface AgentMemoryEntry {
  /** Turn when this memory was formed */
  turn: number;
  /** Simulated year */
  year: number;
  /** What the agent remembers (1-2 sentences) */
  content: string;
  /** Emotional valence of the memory */
  valence: 'positive' | 'negative' | 'neutral';
  /** Category of event that created this memory */
  category: string;
  /** Salience score 0-1 (higher = more likely to be recalled in future prompts) */
  salience: number;
}

/** Persistent memory state for a agent across simulation turns. */
export interface AgentMemory {
  /** Recent memories (last 3-5 turns, full detail) */
  shortTerm: AgentMemoryEntry[];
  /** Consolidated long-term beliefs and relationships (auto-summarized) */
  longTerm: string[];
  /** Stance on recurring themes, -1 to 1 (e.g., "independence": 0.7) */
  stances: Record<string, number>;
  /** Relationship sentiment toward other agents by ID, -1 to 1 */
  relationships: Record<string, number>;
}

export interface Agent {
  core: AgentCore;
  health: AgentHealth;
  career: AgentCareer;
  social: AgentSocial;
  narrative: AgentNarrative;
  hexaco: HexacoProfile;
  promotion?: PromotionRecord;
  hexacoHistory: HexacoSnapshot[];
  /** Persistent memory that accumulates across turns */
  memory: AgentMemory;
}

export interface WorldSystems {
  population: number;
  powerKw: number;
  foodMonthsReserve: number;
  waterLitersPerDay: number;
  pressurizedVolumeM3: number;
  lifeSupportCapacity: number;
  infrastructureModules: number;
  scienceOutput: number;
  morale: number;
}

export interface WorldPolitics {
  earthDependencyPct: number;
  governanceStatus: 'earth-governed' | 'commonwealth' | 'independent';
  independencePressure: number;
}

export interface SimulationMetadata {
  simulationId: string;
  leaderId: string;
  seed: number;
  startYear: number;
  currentYear: number;
  currentTurn: number;
}

export interface TurnEvent {
  turn: number;
  year: number;
  type: 'crisis' | 'decision' | 'birth' | 'death' | 'promotion' | 'relationship' | 'tool_forge' | 'system';
  description: string;
  agentId?: string;
  data?: Record<string, unknown>;
}

export interface SimulationState {
  metadata: SimulationMetadata;
  colony: WorldSystems;
  agents: Agent[];
  politics: WorldPolitics;
  eventLog: TurnEvent[];
}
