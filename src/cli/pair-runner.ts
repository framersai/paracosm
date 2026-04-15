import { DEFAULT_KEY_PERSONNEL, type NormalizedSimulationConfig } from './sim-config.js';
import { marsScenario } from '../engine/mars/index.js';

export type BroadcastFn = (event: string, data: unknown) => void;

export async function runPairSimulations(
  simConfig: NormalizedSimulationConfig,
  broadcast: BroadcastFn,
): Promise<void> {
  const { leaders, turns, seed, startYear, liveSearch, customEvents } = simConfig;
  broadcast('status', { phase: 'starting', maxTurns: turns, customEvents });

  const { runSimulation } = await import('../runtime/orchestrator.js');
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

  const results = await Promise.allSettled(leaders.map((leader, index) => {
    const tag = leader.archetype.toLowerCase().replace(/^the\s+/, '').replace(/\s+/g, '-') || `leader-${index}`;
    return runSimulation(leader, simConfig.keyPersonnel ?? DEFAULT_KEY_PERSONNEL, {
      maxTurns: turns,
      seed,
      startYear,
      yearsPerTurn: simConfig.yearsPerTurn,
      liveSearch,
      activeDepartments: simConfig.activeDepartments,
      onEvent,
      customEvents,
      provider: simConfig.provider,
      models: simConfig.models,
      initialPopulation: simConfig.initialPopulation,
      startingResources: simConfig.startingResources,
      startingPolitics: simConfig.startingPolitics,
      execution: simConfig.execution,
      scenario: marsScenario,
    }).then(result => {
      broadcast('result', {
        leader: tag,
        summary: {
          population: result.finalState?.colony?.population,
          morale: result.finalState?.colony?.morale,
          toolsForged: result.totalToolsForged,
          citations: result.totalCitations,
        },
        fingerprint: (result as any).fingerprint || null,
      });
      return { tag, leader, result };
    }, error => {
      broadcast('sim_error', { leader: tag, error: String(error) });
      throw error;
    });
  }));

  // Generate final verdict comparing both leaders
  const settled = results.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<any>).value);

  if (settled.length === 2) {
    try {
      const [a, b] = settled;
      const colA = a.result.finalState?.colony;
      const colB = b.result.finalState?.colony;
      const summaryA = `${a.leader.name} "${a.leader.archetype}" (${a.leader.colony}): Pop ${colA?.population ?? '?'}, Morale ${Math.round((colA?.morale ?? 0) * 100)}%, Food ${colA?.foodMonthsReserve?.toFixed(1) ?? '?'}mo, Power ${colA?.powerKw?.toFixed(0) ?? '?'}kW, Modules ${colA?.infrastructureModules?.toFixed(1) ?? '?'}, Science ${colA?.scienceOutput ?? '?'}, Tools forged: ${a.result.totalToolsForged}`;
      const summaryB = `${b.leader.name} "${b.leader.archetype}" (${b.leader.colony}): Pop ${colB?.population ?? '?'}, Morale ${Math.round((colB?.morale ?? 0) * 100)}%, Food ${colB?.foodMonthsReserve?.toFixed(1) ?? '?'}mo, Power ${colB?.powerKw?.toFixed(0) ?? '?'}kW, Modules ${colB?.infrastructureModules?.toFixed(1) ?? '?'}, Science ${colB?.scienceOutput ?? '?'}, Tools forged: ${b.result.totalToolsForged}`;

      const { generateText } = await import('@framers/agentos');
      const { text: verdictText } = await generateText({
        provider: simConfig.provider || 'openai',
        prompt: `You are judging a Mars colony simulation. Two AI commanders with different HEXACO personality profiles led identical colonies through ${turns} turns from the same starting conditions and deterministic seed. Compare their outcomes and declare a winner.

LEADER A: ${summaryA}
LEADER B: ${summaryB}

Respond with JSON:
{
  "winner": "A" or "B" or "tie",
  "winnerName": "name of winning leader",
  "headline": "one-line verdict (max 80 chars)",
  "summary": "2-3 sentence analysis of how personality drove the divergence",
  "keyDivergence": "the single most impactful difference between the two outcomes",
  "scores": { "a": { "survival": 0-10, "prosperity": 0-10, "morale": 0-10, "innovation": 0-10 }, "b": { "survival": 0-10, "prosperity": 0-10, "morale": 0-10, "innovation": 0-10 } }
}`,
      });

      // Parse verdict
      try {
        const jsonMatch = verdictText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const verdict = JSON.parse(jsonMatch[0]);
          broadcast('verdict', {
            ...verdict,
            leaderA: { name: a.leader.name, archetype: a.leader.archetype, colony: a.leader.colony },
            leaderB: { name: b.leader.name, archetype: b.leader.archetype, colony: b.leader.colony },
            finalStats: {
              a: { population: colA?.population, morale: colA?.morale, food: colA?.foodMonthsReserve, power: colA?.powerKw, modules: colA?.infrastructureModules, science: colA?.scienceOutput, tools: a.result.totalToolsForged },
              b: { population: colB?.population, morale: colB?.morale, food: colB?.foodMonthsReserve, power: colB?.powerKw, modules: colB?.infrastructureModules, science: colB?.scienceOutput, tools: b.result.totalToolsForged },
            },
          });
          console.log(`\n  VERDICT: ${verdict.headline}`);
          console.log(`  Winner: ${verdict.winnerName} (${verdict.winner})`);
          console.log(`  ${verdict.summary}\n`);
        }
      } catch (parseErr) {
        console.log('  Verdict parse failed:', parseErr);
      }
    } catch (verdictErr) {
      console.log('  Verdict generation failed:', verdictErr);
    }
  }

  broadcast('complete', { timestamp: new Date().toISOString() });
}
