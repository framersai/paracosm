import { DEFAULT_KEY_PERSONNEL, type NormalizedSimulationConfig } from './sim-config.js';

export type BroadcastFn = (event: string, data: unknown) => void;

export async function runPairSimulations(
  simConfig: NormalizedSimulationConfig,
  broadcast: BroadcastFn,
): Promise<void> {
  const { leaders, turns, seed, startYear, liveSearch, customEvents } = simConfig;
  broadcast('status', { phase: 'starting', maxTurns: turns, customEvents });

  const { runSimulation } = await import('./agents/orchestrator.js');
  const onEvent = (event: unknown) => broadcast('sim', event);
  broadcast('status', {
    phase: 'parallel',
    leaders: leaders.map(leader => ({
      name: leader.name,
      archetype: leader.archetype,
      colony: leader.colony,
      hexaco: leader.hexaco,
    })),
  });

  console.log(`  Running: ${leaders[0].name} vs ${leaders[1].name} | ${turns} turns | seed ${seed}\n`);

  const promises = leaders.map((leader, index) => {
    const tag = index === 0 ? 'visionary' : 'engineer';
    return runSimulation(leader, simConfig.keyPersonnel ?? DEFAULT_KEY_PERSONNEL, {
      maxTurns: turns,
      seed,
      startYear,
      liveSearch,
      onEvent,
      customEvents,
      provider: simConfig.provider,
      models: simConfig.models,
      initialPopulation: simConfig.initialPopulation,
      startingResources: simConfig.startingResources,
    }).then(
      result => {
        broadcast('result', {
          leader: tag,
          summary: {
            population: result.finalState?.colony?.population,
            morale: result.finalState?.colony?.morale,
            toolsForged: result.totalToolsForged,
            citations: result.totalCitations,
          },
        });
      },
      error => {
        broadcast('sim_error', { leader: tag, error: String(error) });
      },
    );
  });

  await Promise.all(promises);
  broadcast('complete', { timestamp: new Date().toISOString() });
}
