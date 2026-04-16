/**
 * Agent Reactions — lightweight parallel LLM calls for all alive agents.
 *
 * Uses gpt-4o-mini (or configured cheap model) to generate 1-2 sentence
 * reactions from each agent based on their personality, role, health,
 * and the crisis outcome. All calls run in parallel via Promise.all.
 *
 * Cost envelope (rough, varies with model and prompt size):
 *   gpt-4o-mini:      ~$0.0002 per agent per turn
 *   claude-haiku-4-5: ~$0.004  per agent per turn
 *
 * 100 agents × 6 turns × ~2 events/turn = 1,200 calls. On haiku that is
 * roughly $4-5 per run just for reactions, so this is treated as first-class
 * cost telemetry and fed into `runSimulation()`'s `cost` tracker via the
 * `onUsage` option below. Lower by reducing maxConcurrent, turns, or events,
 * or by switching to a smaller model.
 */

import { generateText, extractJson } from '@framers/agentos';
import type { Agent, TurnOutcome } from '../engine/core/state.js';
import { buildMemoryContext } from './agent-memory.js';

export interface AgentReaction {
  agentId: string;
  name: string;
  age: number;
  department: string;
  role: string;
  specialization: string;
  marsborn: boolean;
  quote: string;
  mood: 'positive' | 'negative' | 'neutral' | 'anxious' | 'defiant' | 'hopeful' | 'resigned';
  intensity: number;
  hexaco: { O: number; C: number; E: number; A: number; Em: number; HH: number };
  psychScore: number;
  boneDensity: number;
  radiation: number;
}

interface ReactionContext {
  crisisTitle: string;
  crisisCategory: string;
  outcome: TurnOutcome;
  decision: string;
  year: number;
  turn: number;
  colonyMorale: number;
  colonyPopulation: number;
}

const REACTION_PROMPT = `You are a Mars colonist reacting to what just happened. Based on your personality and situation, give a short reaction.

Return JSON only: {"quote":"1-2 sentences in first person","mood":"positive|negative|neutral|anxious|defiant|hopeful|resigned","intensity":0.7}

Keep it real. No heroic speeches. People under stress say blunt, honest things.`;

function buildAgentPrompt(c: Agent, ctx: ReactionContext, reactionContextHook?: (agent: any, ctx: any) => string): string {
  const age = ctx.year - c.core.birthYear;
  const h = c.hexaco;
  const marsborn = reactionContextHook ? reactionContextHook(c, ctx) : (c.core.marsborn ? 'Mars-born, never seen Earth.' : `Earth-born, ${ctx.year - 2035} years on Mars.`);

  // Recent life events give the agent a personal history that shapes their reaction
  const recentEvents = c.narrative.lifeEvents
    .slice(-4)
    .map(e => `- Year ${e.year}: ${e.event}`)
    .join('\n');
  const lifeHistory = recentEvents ? `\nYOUR RECENT HISTORY:\n${recentEvents}` : '';

  // Social context
  const socialContext: string[] = [];
  if (c.social.partnerId) socialContext.push('Has a partner in the colony');
  if (c.social.childrenIds.length) socialContext.push(`${c.social.childrenIds.length} children`);
  if (c.social.earthContacts > 3) socialContext.push(`Still in touch with ${c.social.earthContacts} people on Earth`);
  if (c.social.earthContacts === 0 && !c.core.marsborn) socialContext.push('Lost all contact with Earth');
  if (c.health.conditions.length) socialContext.push(`Health issues: ${c.health.conditions.join(', ')}`);
  if ((c.health.boneDensityPct ?? 0) < 70) socialContext.push('Suffering significant bone density loss');
  if ((c.health.cumulativeRadiationMsv ?? 0) > 1500) socialContext.push('High cumulative radiation exposure');
  if (c.health.psychScore < 0.4) socialContext.push('Struggling with depression');
  const socialLine = socialContext.length ? socialContext.join('. ') + '.' : '';

  // Persistent memory context (beliefs, recent memories, stances, relationships)
  const memoryContext = buildMemoryContext(c);

  return `${REACTION_PROMPT}

YOU: ${c.core.name}, age ${age}, ${c.core.role} in ${c.core.department}. ${marsborn}
${c.career.specialization !== 'Undetermined' ? `Specialization: ${c.career.specialization}. ${c.career.yearsExperience} years experience.` : ''}
Personality: O=${h.openness.toFixed(2)} C=${h.conscientiousness.toFixed(2)} E=${h.extraversion.toFixed(2)} A=${h.agreeableness.toFixed(2)} Em=${h.emotionality.toFixed(2)} HH=${h.honestyHumility.toFixed(2)}
Health: bone density ${(c.health.boneDensityPct ?? 0).toFixed(0)}%, radiation ${(c.health.cumulativeRadiationMsv ?? 0).toFixed(0)} mSv, psych ${c.health.psychScore.toFixed(2)}
${socialLine}
${c.promotion ? `Promoted to ${c.promotion.role} by ${c.promotion.promotedBy}.` : ''}${lifeHistory}${memoryContext}

WHAT HAPPENED: Turn ${ctx.turn}, Year ${ctx.year}. Crisis: "${ctx.crisisTitle}" (${ctx.crisisCategory}).
Commander decided: ${ctx.decision.slice(0, 200)}
Outcome: ${ctx.outcome}. Colony morale: ${Math.round(ctx.colonyMorale * 100)}%. Population: ${ctx.colonyPopulation}.

React as this specific person given YOUR history, memories, beliefs, and personality. Reference your past experiences when relevant. Do NOT start with "I can't believe". Be distinctive. JSON only.`;
}

function parseReaction(text: string, c: Agent, year: number): AgentReaction | null {
  const jsonStr = extractJson(text);
  if (!jsonStr) return null;
  try {
    const raw = JSON.parse(jsonStr);
    if (raw.quote) {
      return {
        agentId: c.core.id,
        name: c.core.name,
        age: year - c.core.birthYear,
        department: c.core.department,
        role: c.core.role,
        specialization: c.career.specialization,
        marsborn: c.core.marsborn,
        quote: raw.quote,
        mood: raw.mood || 'neutral',
        intensity: typeof raw.intensity === 'number' ? raw.intensity : 0.5,
        hexaco: { O: +c.hexaco.openness.toFixed(2), C: +c.hexaco.conscientiousness.toFixed(2), E: +c.hexaco.extraversion.toFixed(2), A: +c.hexaco.agreeableness.toFixed(2), Em: +c.hexaco.emotionality.toFixed(2), HH: +c.hexaco.honestyHumility.toFixed(2) },
        psychScore: +c.health.psychScore.toFixed(2),
        boneDensity: +(c.health.boneDensityPct ?? 0).toFixed(0),
        radiation: +(c.health.cumulativeRadiationMsv ?? 0).toFixed(0),
      };
    }
  } catch { /* invalid JSON */ }
  return null;
}

/**
 * Generate reactions from all alive agents in parallel.
 * Uses cheap model (gpt-4o-mini / haiku) for cost efficiency.
 *
 * @param options.onUsage Optional callback invoked after every reaction LLM
 *        call. Lets the orchestrator fold agent-reaction spend (~100 calls
 *        per turn × however many turns) into the run-wide cost telemetry.
 *        Without this, reaction costs on Anthropic haiku (~$0.004/call)
 *        silently disappeared from `runSimulation().cost` even though the
 *        real API bill was accumulating.
 */
export async function generateAgentReactions(
  agents: Agent[],
  ctx: ReactionContext,
  options: {
    provider?: string;
    model?: string;
    maxConcurrent?: number;
    reactionContextHook?: (agent: any, ctx: any) => string;
    onUsage?: (result: { usage?: { totalTokens?: number; promptTokens?: number; completionTokens?: number; costUSD?: number } }) => void;
    /**
     * Called with the raw caught error when a reaction LLM call throws.
     * Invoked AT MOST ONCE per batch even if every reaction throws: 100
     * identical quota errors in one turn would otherwise spam the
     * classifier. The orchestrator's provider-error flag is idempotent,
     * but keeping the log output manageable matters too.
     */
    onProviderError?: (err: unknown) => void;
  } = {},
): Promise<AgentReaction[]> {
  const alive = agents.filter(c => c.health.alive);
  const provider = (options.provider || 'openai') as any;
  const model = options.model || 'gpt-4o-mini';
  const maxConcurrent = options.maxConcurrent || 25;

  console.log(`  [agents] Generating ${alive.length} reactions via ${model}...`);
  const startTime = Date.now();

  // Process in batches to avoid rate limits
  const reactions: AgentReaction[] = [];
  // Report the FIRST thrown error from the batch to the orchestrator.
  // Subsequent errors in the same batch are almost always the same underlying
  // cause (e.g. every call in a batch getting the same 429) so reporting once
  // is the right signal and keeps the log readable.
  let firstBatchError: unknown = null;
  for (let i = 0; i < alive.length; i += maxConcurrent) {
    const batch = alive.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(async (c) => {
        try {
          const prompt = buildAgentPrompt(c, ctx, options.reactionContextHook);
          const result = await generateText({ provider, model, prompt });
          // Report token usage back to the orchestrator so the cost
          // telemetry reflects what was actually billed to the provider.
          options.onUsage?.(result);
          return parseReaction(result.text, c, ctx.year);
        } catch (err) {
          if (firstBatchError == null) firstBatchError = err;
          return null;
        }
      })
    );
    reactions.push(...batchResults.filter((r): r is AgentReaction => r !== null));
  }
  if (firstBatchError != null) {
    options.onProviderError?.(firstBatchError);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  [agents] ${reactions.length}/${alive.length} reactions in ${elapsed}s`);

  // Sort by intensity (most dramatic first)
  reactions.sort((a, b) => b.intensity - a.intensity);

  return reactions;
}
