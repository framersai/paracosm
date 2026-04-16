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
      // Build a richer per-leader summary including innovation telemetry
      // (forged toolbox details, fingerprint classification) so the LLM
      // verdict actually reasons about emergent tool use, not just final
      // colony numbers.
      const formatLeader = (label: string, v: any, col: any) => {
        const fp = v.result.fingerprint || {};
        const toolbox = v.result.forgedToolbox || [];
        const topTools = toolbox.slice(0, 5).map((t: any) => `${t.name}(${t.firstForgedDepartment}, reused ${t.reuseCount}x)`).join('; ');
        return [
          `${label}: ${v.leader.name} "${v.leader.archetype}" (${v.leader.colony})`,
          `  HEXACO: O${v.leader.hexaco.openness.toFixed(2)} C${v.leader.hexaco.conscientiousness.toFixed(2)} E${v.leader.hexaco.extraversion.toFixed(2)} A${v.leader.hexaco.agreeableness.toFixed(2)} Em${v.leader.hexaco.emotionality.toFixed(2)} HH${v.leader.hexaco.honestyHumility.toFixed(2)}`,
          `  Final: Pop ${col?.population ?? '?'}, Morale ${Math.round((col?.morale ?? 0) * 100)}%, Food ${col?.foodMonthsReserve?.toFixed(1) ?? '?'}mo, Power ${col?.powerKw?.toFixed(0) ?? '?'}kW, Modules ${col?.infrastructureModules?.toFixed(1) ?? '?'}, Science ${col?.scienceOutput ?? '?'}`,
          `  Innovation: ${toolbox.length} unique tools forged (${fp.innovation || 'n/a'}), citations ${v.result.totalCitations}`,
          topTools ? `  Top tools: ${topTools}` : '  No tools forged',
          `  Fingerprint: ${fp.summary || 'n/a'}`,
          `  Cost: $${v.result.cost?.totalCostUSD?.toFixed(4) ?? '?'} over ${v.result.cost?.llmCalls ?? '?'} LLM calls`,
        ].join('\n');
      };

      const { generateText } = await import('@framers/agentos');
      const { text: verdictText } = await generateText({
        provider: simConfig.provider || 'openai',
        prompt: `You are judging a colony simulation. Two AI commanders with different HEXACO personality profiles led identical colonies through ${turns} turns from the same starting conditions and deterministic seed. Compare their outcomes — including how each leader's tool-forging behavior affected outcomes — and declare a winner.

${formatLeader('LEADER A', a, colA)}

${formatLeader('LEADER B', b, colB)}

Tool forging is a tradeoff: each forged tool costs power and analyst attention, failed forges damage morale, but successful tools provide quantitative grounding for decisions. A leader who built fewer but reused tools may show better discipline; a leader who forged many novel tools may show emergent capability advantage. Factor this into the innovation score AND the overall verdict.

Respond with JSON:
{
  "winner": "A" or "B" or "tie",
  "winnerName": "name of winning leader",
  "headline": "one-line verdict (max 80 chars)",
  "summary": "2-3 sentence analysis of how personality + tool-use shaped the divergence",
  "keyDivergence": "the single most impactful difference (resource, decision, or emergent capability)",
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
