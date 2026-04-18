import { DEFAULT_KEY_PERSONNEL, type NormalizedSimulationConfig } from './sim-config.js';
import { marsScenario } from '../engine/mars/index.js';
import { generateValidatedObject } from '../runtime/llm-invocations/generateValidatedObject.js';
import { VerdictSchema } from '../runtime/schemas/verdict.js';

export type BroadcastFn = (event: string, data: unknown) => void;

export async function runPairSimulations(
  simConfig: NormalizedSimulationConfig,
  broadcast: BroadcastFn,
  /**
   * Optional cancellation signal. When the server's disconnect watchdog
   * trips (all SSE clients gone + grace period expired), it aborts this
   * signal. Both leaders' runSimulation calls check it at turn
   * boundaries and short-circuit cleanly, emitting a `sim_aborted`
   * event and returning partial results. The event buffer is preserved
   * so a returning user sees everything up to the cancel point.
   */
  signal?: AbortSignal,
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
      signal,
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

  // Skip verdict generation when EITHER leader was cancelled externally
  // (user navigated away → server pulled the plug) or hit a terminal
  // provider error. Running the verdict LLM call on partial data would
  // burn an extra flagship call for a comparison that doesn't mean
  // anything on incomplete runs. The dashboard shows the "Unfinished"
  // badge in place of the verdict card.
  const anyAborted = settled.some(v => (v.result as any)?.aborted === true || (v.result as any)?.providerError);
  if (anyAborted) {
    broadcast('complete', { timestamp: new Date().toISOString(), aborted: true });
    return;
  }

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
        // Cause-of-death breakdown. Each death in the event log carries
        // an attributed cause (natural, radiation cancer, starvation,
        // despair, fatal fracture, accident). Roll up for the verdict
        // prompt so the LLM can reason about HOW colonists died, not
        // just how many — a Mars colony losing 5 to radiation reads
        // very differently from losing 5 to accidents.
        const deathEvents = (v.result.finalState?.eventLog ?? []).filter((e: any) => e.type === 'death');
        const causeCounts: Record<string, number> = {};
        for (const d of deathEvents) {
          const raw = (d.cause as string | undefined) ?? 'unknown';
          const key = raw.startsWith('accident:') ? 'accident' : raw;
          causeCounts[key] = (causeCounts[key] ?? 0) + 1;
        }
        const causeSummary = Object.keys(causeCounts).length > 0
          ? Object.entries(causeCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(', ')
          : 'no deaths';
        return [
          `${label}: ${v.leader.name} "${v.leader.archetype}" (${v.leader.colony})`,
          `  HEXACO: O${v.leader.hexaco.openness.toFixed(2)} C${v.leader.hexaco.conscientiousness.toFixed(2)} E${v.leader.hexaco.extraversion.toFixed(2)} A${v.leader.hexaco.agreeableness.toFixed(2)} Em${v.leader.hexaco.emotionality.toFixed(2)} HH${v.leader.hexaco.honestyHumility.toFixed(2)}`,
          `  Final: Pop ${col?.population ?? '?'}, Morale ${Math.round((col?.morale ?? 0) * 100)}%, Food ${col?.foodMonthsReserve?.toFixed(1) ?? '?'}mo, Power ${col?.powerKw?.toFixed(0) ?? '?'}kW, Modules ${col?.infrastructureModules?.toFixed(1) ?? '?'}, Science ${col?.scienceOutput ?? '?'}`,
          `  Mortality: ${deathEvents.length} total (${causeSummary})`,
          `  Innovation: ${toolbox.length} unique tools forged (${fp.innovation || 'n/a'}), citations ${v.result.totalCitations}`,
          topTools ? `  Top tools: ${topTools}` : '  No tools forged',
          `  Fingerprint: ${fp.summary || 'n/a'}`,
          `  Cost: $${v.result.cost?.totalCostUSD?.toFixed(4) ?? '?'} over ${v.result.cost?.llmCalls ?? '?'} LLM calls`,
        ].join('\n');
      };

      // Verdict runs once per completed sim and is the single most
      // user-facing synthesis call in the pipeline: it reads both
      // final states, the per-leader cause-of-death breakdown, the
      // forged toolbox, and writes the headline + summary that the
      // user sees first when the run finishes. Cheap-tier output on
      // this call was noticeably flatter than flagship output, so
      // pay the ~$0.02-0.05 per run for the better read.
      const verdictModel = simConfig.provider === 'anthropic'
        ? 'claude-sonnet-4-6'
        : 'gpt-5.4';
      try {
        const { object: verdict, fromFallback } = await generateValidatedObject({
          provider: simConfig.provider || 'openai',
          model: verdictModel,
          schema: VerdictSchema,
          schemaName: 'Verdict',
          prompt: `You are judging a colony simulation. Two AI commanders with opposing HEXACO personality profiles led identical colonies through ${turns} turns from the same starting conditions and deterministic seed. Your job is to write a verdict that explains WHY the runs diverged the way they did, not just WHO won.

${formatLeader('LEADER A', a, colA)}

${formatLeader('LEADER B', b, colB)}

TRADEOFFS TO WEIGH
Tool forging is a cost / capability tradeoff: every forged tool spent a judge LLM call and ate analyst attention; failed forges hurt morale and produced no reusable capability; successful tools let later decisions reason about concrete numbers. A leader who built few tools and reused them many times has a disciplined, cost-efficient signature. A leader who forged many novel tools has an exploratory signature with broader capability surface. Both are valid strategies and your scoring should reflect that trade, not punish either extreme.

Mortality is a cause-specific signal, not a number. The "Mortality" line above names HOW each colonist died. A leader who lost 5 to starvation made different resource-allocation decisions than a leader who lost 5 to radiation cancer; a leader with despair deaths presided over a colony in psychological freefall. Reference the specific causes when they shape the story.

REASONING — populate the "reasoning" field of your JSON response with a numbered list covering:
  (1) Population trajectory — how did each colony's population evolve, and which tradeoffs produced that shape?
  (2) Morale + psychological state — which leader's colony held together emotionally, and what does that say about HEXACO + decision style?
  (3) Resource efficiency — food, power, infrastructure — which side ran leaner, which hit crises?
  (4) Innovation signature — tools forged vs reused, breadth vs depth. What does each leader's toolbox say about their cognition?
  (5) Mortality story — which causes dominated each side, and what does THAT say about the leader's priorities?
  (6) The single most impactful divergence — resource decision, crisis response, tool strategy, or emergent behavior. Name it precisely.
  (7) Weighing the tradeoffs, who won and why.

Then fill out:
  winner: "A" or "B" or "tie"
  winnerName: the winning leader's name, or "Tie" for a tie
  headline: one-line verdict grounded in the key divergence (max 80 chars)
  summary: 2-3 sentences naming the personality + tool-use + mortality pattern that drove the divergence
  keyDivergence: the single most impactful difference between the two runs
  scores: { a: { survival, prosperity, morale, innovation }, b: { survival, prosperity, morale, innovation } } — each 0-10`,
        });
        if (fromFallback) {
          console.log('  Verdict schema fallback; skipping broadcast');
        } else {
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
      } catch (verdictErr) {
        console.log('  Verdict generation failed:', verdictErr);
      }
    } catch (outerErr) {
      console.log('  Verdict outer failure:', outerErr);
    }
  }

  broadcast('complete', { timestamp: new Date().toISOString() });
}
