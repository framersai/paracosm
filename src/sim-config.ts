import type { KeyPersonnel } from './kernel/colonist-generator.js';
import type { Department } from './kernel/state.js';
import type { LeaderConfig } from './types.js';

export interface SimulationModelConfig {
  commander: string;
  departments: string;
  judge: string;
  director: string;
}

export type LlmProvider = 'openai' | 'anthropic';

export interface StartingResources {
  foodMonthsReserve: number;
  waterLitersPerDay: number;
  powerKw: number;
  morale: number;
  pressurizedVolumeM3: number;
  lifeSupportCapacity: number;
  infrastructureModules: number;
  scienceOutput: number;
}

export interface StartingPolitics {
  earthDependencyPct: number;
}

export interface SimulationExecutionConfig {
  commanderMaxSteps: number;
  departmentMaxSteps: number;
  sandboxTimeoutMs: number;
  sandboxMemoryMB: number;
}

export interface SimulationSetupPayload {
  leaders: LeaderConfig[];
  provider?: LlmProvider;
  turns?: number;
  seed?: number;
  startYear?: number;
  population?: number;
  liveSearch?: boolean;
  activeDepartments?: Department[];
  customEvents?: Array<{ turn: number; title: string; description: string }>;
  keyPersonnel?: KeyPersonnel[];
  startingResources?: Partial<{
    food: number;
    water: number;
    power: number;
    morale: number;
    pressurizedVolumeM3: number;
    lifeSupportCapacity: number;
    infrastructureModules: number;
    scienceOutput: number;
  }>;
  startingPolitics?: Partial<StartingPolitics>;
  execution?: Partial<SimulationExecutionConfig>;
  models?: Partial<Omit<SimulationModelConfig, 'director'>>;
  apiKey?: string;
  anthropicKey?: string;
  serperKey?: string;
}

export interface NormalizedSimulationConfig {
  leaders: LeaderConfig[];
  provider: LlmProvider;
  turns: number;
  seed: number;
  startYear: number;
  initialPopulation: number;
  liveSearch: boolean;
  activeDepartments: Department[];
  customEvents: Array<{ turn: number; title: string; description: string }>;
  keyPersonnel: KeyPersonnel[];
  startingResources: StartingResources;
  startingPolitics: StartingPolitics;
  execution: SimulationExecutionConfig;
  models: SimulationModelConfig;
  apiKey?: string;
  anthropicKey?: string;
  serperKey?: string;
}

export const DEFAULT_KEY_PERSONNEL: KeyPersonnel[] = [
  { name: 'Dr. Yuki Tanaka', department: 'medical', role: 'Chief Medical Officer', specialization: 'Radiation Medicine', age: 38, featured: true },
  { name: 'Erik Lindqvist', department: 'engineering', role: 'Chief Engineer', specialization: 'Structural Engineering', age: 45, featured: true },
  { name: 'Amara Osei', department: 'agriculture', role: 'Head of Agriculture', specialization: 'Hydroponics', age: 34, featured: true },
  { name: 'Dr. Priya Singh', department: 'psychology', role: 'Colony Psychologist', specialization: 'Clinical Psychology', age: 41, featured: true },
  { name: 'Carlos Fernandez', department: 'science', role: 'Chief Scientist', specialization: 'Geology', age: 50, featured: true },
];

export const DEFAULT_MODELS: Record<LlmProvider, SimulationModelConfig> = {
  openai: {
    commander: 'gpt-5.4',
    departments: 'gpt-5.4-mini',
    judge: 'gpt-5.4',
    director: 'gpt-5.4',
  },
  anthropic: {
    commander: 'claude-sonnet-4-6',
    departments: 'claude-haiku-4-5-20251001',
    judge: 'claude-sonnet-4-6',
    director: 'claude-sonnet-4-6',
  },
};

export const DEFAULT_EXECUTION: SimulationExecutionConfig = {
  commanderMaxSteps: 5,
  departmentMaxSteps: 8,
  sandboxTimeoutMs: 10000,
  sandboxMemoryMB: 128,
};

const DEFAULT_ACTIVE_DEPARTMENTS: Department[] = ['medical', 'engineering', 'agriculture', 'psychology', 'governance'];

export function inferProviderFromModel(model?: string): LlmProvider | undefined {
  if (!model) return undefined;
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gpt-') || model.startsWith('o')) return 'openai';
  return undefined;
}

export function resolveSimulationModels(
  provider: LlmProvider,
  models?: Partial<SimulationModelConfig>,
): SimulationModelConfig {
  const defaults = DEFAULT_MODELS[provider];
  const normalizeModel = (
    requested: string | undefined,
    fallback: string,
  ): string => {
    if (!requested) return fallback;
    return inferProviderFromModel(requested) === provider ? requested : fallback;
  };

  return {
    commander: normalizeModel(models?.commander, defaults.commander),
    departments: normalizeModel(models?.departments, defaults.departments),
    judge: normalizeModel(models?.judge, defaults.judge),
    director: normalizeModel(models?.commander, defaults.director),
  };
}

function normalizeCustomEvents(
  input: SimulationSetupPayload['customEvents'],
): Array<{ turn: number; title: string; description: string }> {
  return (input ?? [])
    .filter((event): event is NonNullable<SimulationSetupPayload['customEvents']>[number] =>
      !!event && Number.isFinite(event.turn) && event.turn > 0 && !!event.title?.trim())
    .map(event => ({
      turn: Math.trunc(event.turn),
      title: event.title.trim(),
      description: event.description?.trim() ?? '',
    }))
    .sort((a, b) => a.turn - b.turn);
}

function normalizeActiveDepartments(input: SimulationSetupPayload['activeDepartments']): Department[] {
  if (!Array.isArray(input) || input.length === 0) {
    return [...DEFAULT_ACTIVE_DEPARTMENTS];
  }

  const requested = input;
  const active = new Set<Department>(['medical', 'engineering']);

  for (const dept of requested) {
    if (DEFAULT_ACTIVE_DEPARTMENTS.includes(dept)) active.add(dept);
  }

  return DEFAULT_ACTIVE_DEPARTMENTS.filter(dept => active.has(dept));
}

export function normalizeSimulationConfig(input: SimulationSetupPayload): NormalizedSimulationConfig {
  if (!Array.isArray(input.leaders) || input.leaders.length < 2) {
    throw new Error('Two leaders required');
  }

  const inferredProvider =
    input.provider ??
    inferProviderFromModel(input.models?.commander) ??
    inferProviderFromModel(input.models?.departments) ??
    inferProviderFromModel(input.models?.judge) ??
    'openai';
  const startYear = input.startYear ?? 2035;

  return {
    leaders: input.leaders,
    provider: inferredProvider,
    turns: input.turns ?? 12,
    seed: input.seed ?? 950,
    startYear,
    initialPopulation: input.population ?? 100,
    liveSearch: input.liveSearch ?? false,
    activeDepartments: normalizeActiveDepartments(input.activeDepartments),
    customEvents: normalizeCustomEvents(input.customEvents),
    keyPersonnel: input.keyPersonnel?.length ? input.keyPersonnel : DEFAULT_KEY_PERSONNEL,
    startingResources: {
      foodMonthsReserve: input.startingResources?.food ?? 18,
      waterLitersPerDay: input.startingResources?.water ?? 800,
      powerKw: input.startingResources?.power ?? 400,
      morale: (input.startingResources?.morale ?? 85) / 100,
      pressurizedVolumeM3: input.startingResources?.pressurizedVolumeM3 ?? 3000,
      lifeSupportCapacity: input.startingResources?.lifeSupportCapacity ?? 120,
      infrastructureModules: input.startingResources?.infrastructureModules ?? 3,
      scienceOutput: input.startingResources?.scienceOutput ?? 0,
    },
    startingPolitics: {
      earthDependencyPct: input.startingPolitics?.earthDependencyPct ?? 95,
    },
    execution: {
      commanderMaxSteps: input.execution?.commanderMaxSteps ?? DEFAULT_EXECUTION.commanderMaxSteps,
      departmentMaxSteps: input.execution?.departmentMaxSteps ?? DEFAULT_EXECUTION.departmentMaxSteps,
      sandboxTimeoutMs: input.execution?.sandboxTimeoutMs ?? DEFAULT_EXECUTION.sandboxTimeoutMs,
      sandboxMemoryMB: input.execution?.sandboxMemoryMB ?? DEFAULT_EXECUTION.sandboxMemoryMB,
    },
    models: resolveSimulationModels(inferredProvider, input.models),
    apiKey: input.apiKey,
    anthropicKey: input.anthropicKey,
    serperKey: input.serperKey,
  };
}
