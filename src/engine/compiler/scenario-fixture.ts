/**
 * Build a SimulationState-shaped fixture derived from a scenario's own
 * `world.*` declarations. Used by every compiler generator's smokeTest
 * so validation runs against a shape that matches the scenario being
 * compiled — not a hardcoded Mars fixture that produces false positives
 * and false negatives for non-Mars scenarios.
 *
 * @module paracosm/engine/compiler/scenario-fixture
 */
import type { Agent } from '../core/state.js';

interface MetricDefinition {
  id: string;
  label?: string;
  unit?: string;
  type?: 'number' | 'string' | 'boolean';
  initial?: number | string | boolean;
  category?: string;
}

export interface ScenarioFixture {
  systems: Record<string, number>;
  capacities: Record<string, number>;
  statuses: Record<string, string | boolean>;
  politics: Record<string, number | string | boolean>;
  environment: Record<string, number | string | boolean>;
  metadata: {
    simulationId: string;
    leaderId: string;
    seed: number;
    startTime: number;
    currentTime: number;
    currentTurn: number;
  };
  agents: Agent[];
  eventLog: never[];
}

function coerceInitial(def: MetricDefinition): number | string | boolean {
  if (def.initial !== undefined) return def.initial;
  switch (def.type) {
    case 'number': return 0;
    case 'string': return '';
    case 'boolean': return false;
    default: return 0;
  }
}

function coerceNumeric(def: MetricDefinition): number {
  const v = coerceInitial(def);
  return typeof v === 'number' ? v : 0;
}

function coerceAny(def: MetricDefinition): number | string | boolean {
  return coerceInitial(def);
}

function buildBag<T>(
  bag: Record<string, MetricDefinition> | undefined,
  coerce: (def: MetricDefinition) => T,
): Record<string, T> {
  const out: Record<string, T> = {};
  if (!bag) return out;
  for (const [key, def] of Object.entries(bag)) {
    out[key] = coerce(def);
  }
  return out;
}

function buildSyntheticAgent(startTime: number): Agent {
  return {
    core: {
      id: 'fixture-agent-001',
      name: 'Fixture Agent',
      birthTime: startTime - 30,
      marsborn: false,
      department: 'engineering',
      role: 'engineer',
    },
    health: {
      alive: true,
      psychScore: 0.7,
      conditions: [],
    },
    career: {
      specialization: 'general',
      yearsExperience: 5,
      rank: 'senior',
      achievements: [],
    },
    social: {
      partnerId: undefined,
      childrenIds: [],
      friendIds: [],
      earthContacts: 3,
    },
    narrative: {
      lifeEvents: [],
      featured: false,
    },
    hexaco: {
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      emotionality: 0.5,
      honestyHumility: 0.5,
    },
    hexacoHistory: [],
    memory: { shortTerm: [], longTerm: [], stances: {}, relationships: {} },
  } satisfies Agent;
}

/**
 * Build a SimulationState-shaped fixture from a scenario JSON.
 *
 * Throws if `world.metrics` is missing — post-0.5.0 scenarios all carry
 * the five world bags, so a missing one indicates malformed input and
 * should surface fast rather than silently falling back to a stale Mars
 * fixture.
 */
export function buildScenarioFixture(scenarioJson: Record<string, unknown>): ScenarioFixture {
  const world = scenarioJson.world as
    | {
        metrics?: Record<string, MetricDefinition>;
        capacities?: Record<string, MetricDefinition>;
        statuses?: Record<string, MetricDefinition>;
        politics?: Record<string, MetricDefinition>;
        environment?: Record<string, MetricDefinition>;
      }
    | undefined;
  if (!world || !world.metrics) {
    throw new Error('buildScenarioFixture: scenario missing world.metrics declaration');
  }

  const setup = (scenarioJson.setup ?? {}) as { defaultStartTime?: number };
  const startTime = typeof setup.defaultStartTime === 'number' ? setup.defaultStartTime : 0;
  const scenarioId = (scenarioJson.id as string) ?? 'fixture-scenario';

  return {
    systems: buildBag(world.metrics, coerceNumeric),
    capacities: buildBag(world.capacities, coerceNumeric),
    statuses: buildBag(world.statuses, coerceAny) as Record<string, string | boolean>,
    politics: buildBag(world.politics, coerceAny),
    environment: buildBag(world.environment, coerceAny),
    metadata: {
      simulationId: `fixture-${scenarioId}`,
      leaderId: 'fixture-leader',
      seed: 42,
      startTime,
      currentTime: startTime,
      currentTurn: 0,
    },
    agents: [buildSyntheticAgent(startTime)],
    eventLog: [],
  };
}
