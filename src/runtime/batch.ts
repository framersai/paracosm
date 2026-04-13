/**
 * Batch Runner — run multiple scenarios with typed configs and reproducible manifests.
 */

import type { ScenarioPackage, LeaderConfig, LlmProvider, SimulationModelConfig } from '../engine/types.js';
import type { KeyPersonnel } from '../engine/core/colonist-generator.js';

export interface BatchConfig {
  scenarios: ScenarioPackage[];
  leaders: LeaderConfig[];
  keyPersonnel?: KeyPersonnel[];
  turns: number;
  seed: number;
  startYear?: number;
  provider?: LlmProvider;
  models?: Partial<SimulationModelConfig>;
}

export interface BatchResult {
  scenarioId: string;
  scenarioVersion: string;
  leader: string;
  seed: number;
  turns: number;
  output: any;
  fingerprint: Record<string, string>;
  duration: number;
}

export interface BatchManifest {
  timestamp: string;
  config: {
    scenarioIds: string[];
    leaders: string[];
    turns: number;
    seed: number;
    provider?: string;
  };
  results: BatchResult[];
  totalDuration: number;
}

/**
 * Run a batch of simulations across multiple scenarios and leaders.
 * Each scenario x leader combination produces one BatchResult.
 */
export async function runBatch(config: BatchConfig): Promise<BatchManifest> {
  const { runSimulation } = await import('./orchestrator.js');
  const startTime = Date.now();
  const results: BatchResult[] = [];

  for (const scenario of config.scenarios) {
    for (const leader of config.leaders) {
      const runStart = Date.now();
      console.log(`\n  [batch] ${scenario.id} x ${leader.name} (${config.turns} turns, seed ${config.seed})`);

      const output = await runSimulation(leader, config.keyPersonnel ?? [], {
        maxTurns: config.turns,
        seed: config.seed,
        startYear: config.startYear,
        provider: config.provider,
        models: config.models,
        scenario,
      });

      results.push({
        scenarioId: scenario.id,
        scenarioVersion: scenario.version,
        leader: leader.name,
        seed: config.seed,
        turns: config.turns,
        output,
        fingerprint: (output as any).fingerprint || {},
        duration: Date.now() - runStart,
      });
    }
  }

  return {
    timestamp: new Date().toISOString(),
    config: {
      scenarioIds: config.scenarios.map(s => s.id),
      leaders: config.leaders.map(l => l.name),
      turns: config.turns,
      seed: config.seed,
      provider: config.provider,
    },
    results,
    totalDuration: Date.now() - startTime,
  };
}
