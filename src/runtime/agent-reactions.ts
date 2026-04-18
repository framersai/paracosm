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
import { generateValidatedObject } from './llm-invocations/generateValidatedObject.js';
import { ReactionBatchSchema } from './schemas/reactions.js';
import { buildReactionCues } from './hexaco-cues/translation.js';

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
  eventTitle: string;
  eventCategory: string;
  /** Null on the first turn before the outcome roll, or when the
   *  director batch produced zero events. String-interpolated into
   *  the per-agent prompt so null renders as "null" — acceptable
   *  because the prompt already carries the full event context. */
  outcome: TurnOutcome | null;
  decision: string;
  year: number;
  turn: number;
  colonyMorale: number;
  colonyPopulation: number;
}

const REACTION_PROMPT = `You are a colony member reacting to what just happened. Based on your personality and situation, give a short reaction.

Return JSON only: {"quote":"1-2 sentences in first person","mood":"positive|negative|neutral|anxious|defiant|hopeful|resigned","intensity":0.7}

Keep it real. No heroic speeches. People under stress say blunt, honest things.`;

/**
 * Build the shared system prompt + crisis context for a BATCHED reaction
 * call. Everything in this string is identical for every agent in the
 * batch, so the provider can cache it across parallel batches in the
 * same turn and sequential batches across turns. Goes in the `system`
 * field of the LLM request, not the user prompt, so it is eligible for
 * Anthropic prefix caching.
 *
 * The per-agent identity/memory/history block goes in the user prompt
 * via `buildBatchAgentBlock` so it does NOT invalidate the cache.
 */
function buildBatchSystemPrompt(ctx: ReactionContext): string {
  return `You are each of several colony members reacting to what just happened at your settlement. Based on each person's personality, health, relationships, and memories, give a short reaction in their voice.

SHARED SITUATION:
Turn ${ctx.turn}, Year ${ctx.year}. Event: "${ctx.eventTitle}" (${ctx.eventCategory}).
Commander decided: ${ctx.decision.slice(0, 200)}
Outcome: ${ctx.outcome}. Current morale: ${Math.round(ctx.colonyMorale * 100)}%. Population: ${ctx.colonyPopulation}.

Keep reactions real. No heroic speeches. People under stress say blunt, honest things. Each person's reaction must sound distinctly like THAT person — their personality, health, and memories should color their voice. Do NOT start any reaction with "I can't believe".

OUTPUT FORMAT — you will receive a numbered list of agents. Return ONLY a JSON object matching this shape:
{
  "reactions": [
    {"agentId":"<id>","quote":"1-2 sentences in first person","mood":"positive|negative|neutral|anxious|defiant|hopeful|resigned","intensity":0.0-1.0},
    ...
  ]
}

One entry per agent, in the same order, matching each agentId EXACTLY as given. No prose, no markdown fences, no explanation before or after.`;
}

/**
 * Render one agent's identity/history/memory block for a batched call.
 * Kept compact because a batch of 10 agents runs 10× this block in the
 * user prompt; even small per-agent inflation compounds fast.
 */
function buildBatchAgentBlock(c: Agent, ctx: ReactionContext, reactionContextHook?: (agent: any, ctx: any) => string): string {
  const age = ctx.year - c.core.birthYear;
  const h = c.hexaco;
  const bornLine = reactionContextHook ? reactionContextHook(c, ctx) : (c.core.marsborn ? 'Native-born.' : 'Arrived from outside.');

  const socialBits: string[] = [];
  if (c.social.partnerId) socialBits.push('partnered');
  if (c.social.childrenIds.length) socialBits.push(`${c.social.childrenIds.length} kids`);
  if (c.social.earthContacts > 3) socialBits.push(`${c.social.earthContacts} outside contacts`);
  if (c.social.earthContacts === 0 && !c.core.marsborn) socialBits.push('lost all outside contact');
  if ((c.health.boneDensityPct ?? 0) < 70) socialBits.push('severe bone loss');
  if ((c.health.cumulativeRadiationMsv ?? 0) > 1500) socialBits.push('high rad exposure');
  if (c.health.psychScore < 0.4) socialBits.push('depressed');

  const recentLine = c.narrative.lifeEvents.slice(-2).map(e => `Y${e.year}: ${e.event}`).join('; ');
  const recentMem = (c.memory?.shortTerm ?? []).slice(-2).map(m => m.content.slice(0, 80)).join(' | ');
  const beliefs = (c.memory?.longTerm ?? []).slice(-2).join(' | ');

  const cues = buildReactionCues(h);
  const lines = [
    `AGENT id=${c.core.id}`,
    `${c.core.name}, age ${age}, ${c.core.role} in ${c.core.department}. ${bornLine}`,
    `HEXACO O=${h.openness.toFixed(2)} C=${h.conscientiousness.toFixed(2)} E=${h.extraversion.toFixed(2)} A=${h.agreeableness.toFixed(2)} Em=${h.emotionality.toFixed(2)} HH=${h.honestyHumility.toFixed(2)}`,
  ];
  if (cues) lines.push(cues);
  lines.push(
    `Health: bone ${(c.health.boneDensityPct ?? 0).toFixed(0)}% rad ${(c.health.cumulativeRadiationMsv ?? 0).toFixed(0)}mSv psych ${c.health.psychScore.toFixed(2)}${socialBits.length ? ` | ${socialBits.join(', ')}` : ''}`,
  );
  if (c.promotion) lines.push(`Promoted: ${c.promotion.role} by ${c.promotion.promotedBy}`);
  if (recentLine) lines.push(`History: ${recentLine}`);
  if (recentMem) lines.push(`Recent memory: ${recentMem}`);
  if (beliefs) lines.push(`Beliefs: ${beliefs}`);
  return lines.join('\n');
}

/**
 * Shape of one validated entry from ReactionBatchSchema. Kept local so
 * we don't leak Zod types through the reactions module's public surface.
 */
interface ReactionEntryPayload {
  agentId: string;
  quote: string;
  mood: AgentReaction['mood'];
  intensity: number;
}

/**
 * Join schema-validated reaction entries with their source agents to
 * produce fully-hydrated AgentReaction records. Missing agents or
 * entries are simply skipped (graceful degradation when the LLM drops
 * agents from the batch).
 */
function hydrateBatchReactions(
  entries: ReactionEntryPayload[],
  agents: Agent[],
  year: number,
): AgentReaction[] {
  const agentById = new Map(agents.map(a => [a.core.id, a]));
  const reactions: AgentReaction[] = [];
  for (const entry of entries) {
    const agent = agentById.get(entry.agentId);
    if (!agent) continue;
    reactions.push({
      agentId: agent.core.id,
      name: agent.core.name,
      age: year - agent.core.birthYear,
      department: agent.core.department,
      role: agent.core.role,
      specialization: agent.career.specialization,
      marsborn: agent.core.marsborn,
      quote: entry.quote,
      mood: entry.mood,
      intensity: entry.intensity,
      hexaco: {
        O: +agent.hexaco.openness.toFixed(2),
        C: +agent.hexaco.conscientiousness.toFixed(2),
        E: +agent.hexaco.extraversion.toFixed(2),
        A: +agent.hexaco.agreeableness.toFixed(2),
        Em: +agent.hexaco.emotionality.toFixed(2),
        HH: +agent.hexaco.honestyHumility.toFixed(2),
      },
      psychScore: +agent.health.psychScore.toFixed(2),
      boneDensity: +(agent.health.boneDensityPct ?? 0).toFixed(0),
      radiation: +(agent.health.cumulativeRadiationMsv ?? 0).toFixed(0),
    });
  }
  return reactions;
}

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

WHAT HAPPENED: Turn ${ctx.turn}, Year ${ctx.year}. Event: "${ctx.eventTitle}" (${ctx.eventCategory}).
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
    /**
     * Number of agents to pack into a single LLM call. Default 10.
     * Set to 1 to disable batching entirely (one call per agent, legacy
     * path). 10 is the sweet spot on haiku/mini: small enough that a
     * single bad batch only loses 10 reactions, large enough to make
     * the shared crisis context (~250 tok) pay off against the per-
     * agent block (~200 tok each).
     *
     * Cost math, 100 agents one turn on haiku:
     *   batchSize=1:  100 calls × (1500 in + 150 out) ≈ $0.18
     *   batchSize=10:  10 calls × (2500 in + 1500 out) ≈ $0.08
     *   batchSize=20:   5 calls × (4500 in + 3000 out) ≈ $0.06  (but
     *     output-token ceiling risks truncating the JSON array, and a
     *     single bad batch loses 20 reactions)
     */
    batchSize?: number;
  } = {},
): Promise<AgentReaction[]> {
  const alive = agents.filter(c => c.health.alive);
  if (alive.length === 0) return [];
  const provider = (options.provider || 'openai') as any;
  const model = options.model || 'gpt-4o-mini';
  const maxConcurrent = options.maxConcurrent || 25;
  const batchSize = Math.max(1, Math.min(20, options.batchSize ?? 10));

  console.log(`  [agents] Generating ${alive.length} reactions via ${model} (batchSize=${batchSize})...`);
  const startTime = Date.now();

  // --- Batched path ---
  //
  // Groups of `batchSize` agents share a single LLM call. The system
  // prompt carries the shared crisis context (cached with cacheBreakpoint
  // so providers that support prefix caching serve turns 2-N at 0.1×
  // cost). The user prompt lists the agents' identity/history blocks.
  // Outer `maxConcurrent` still throttles API concurrency to avoid
  // hitting provider rate limits on a large colony.
  if (batchSize > 1) {
    const chunks: Agent[][] = [];
    for (let i = 0; i < alive.length; i += batchSize) {
      chunks.push(alive.slice(i, i + batchSize));
    }

    const systemPrompt = buildBatchSystemPrompt(ctx);
    const reactions: AgentReaction[] = [];
    let firstBatchError: unknown = null;

    // Process chunks in parallel, throttled by maxConcurrent which now
    // bounds concurrent BATCH calls rather than per-agent calls. With
    // batchSize=10 and maxConcurrent=25, up to 250 agents can be in
    // flight simultaneously, which is fine for any realistic scenario.
    for (let i = 0; i < chunks.length; i += maxConcurrent) {
      const window = chunks.slice(i, i + maxConcurrent);
      const windowResults = await Promise.all(window.map(async (chunk) => {
        try {
          const userPrompt = [
            `Generate one reaction per agent below, in order, returning a JSON object with a "reactions" array.`,
            '',
            ...chunk.map((c, idx) => `--- ${idx + 1}/${chunk.length} ---\n${buildBatchAgentBlock(c, ctx, options.reactionContextHook)}`),
          ].join('\n\n');

          const { object, fromFallback } = await generateValidatedObject({
            provider,
            model,
            schema: ReactionBatchSchema,
            schemaName: 'ReactionBatch',
            systemCacheable: systemPrompt,
            prompt: userPrompt,
            onUsage: options.onUsage,
            fallback: { reactions: [] },
          });
          if (fromFallback) {
            if (firstBatchError == null) firstBatchError = new Error('reactions schema fallback');
            return [] as AgentReaction[];
          }
          return hydrateBatchReactions(object.reactions as ReactionEntryPayload[], chunk, ctx.year);
        } catch (err) {
          if (firstBatchError == null) firstBatchError = err;
          return [] as AgentReaction[];
        }
      }));
      for (const group of windowResults) reactions.push(...group);
    }

    if (firstBatchError != null) {
      options.onProviderError?.(firstBatchError);
    }

    // Fallback: if the batched call returned ZERO reactions (model
    // misbehaved badly, JSON array malformed) and we have agents left,
    // retry the first ~10 with the per-agent path so the turn at least
    // has SOMETHING in the bulletin. Avoids the worst-case "empty
    // reactions" turn that would otherwise follow a bad batch.
    if (reactions.length === 0 && alive.length > 0 && firstBatchError == null) {
      console.log(`  [agents] Batched call returned no parseable reactions; falling back to per-agent for the first 10.`);
      const fallbackAgents = alive.slice(0, 10);
      const fallbackResults = await Promise.all(fallbackAgents.map(async (c) => {
        try {
          const prompt = buildAgentPrompt(c, ctx, options.reactionContextHook);
          const result = await generateText({ provider, model, prompt });
          options.onUsage?.(result);
          return parseReaction(result.text, c, ctx.year);
        } catch {
          return null;
        }
      }));
      for (const r of fallbackResults) if (r) reactions.push(r);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  [agents] ${reactions.length}/${alive.length} reactions in ${elapsed}s (${chunks.length} batches)`);
    reactions.sort((a, b) => b.intensity - a.intensity);
    return reactions;
  }

  // --- Legacy per-agent path (batchSize=1) ---
  //
  // Kept for tests, A/B comparison, and any scenario that needs maximum
  // per-agent personalization at the cost of extra API spend. Default
  // is batched; opt back into per-agent by passing batchSize: 1.
  const reactions: AgentReaction[] = [];
  let firstBatchError: unknown = null;
  for (let i = 0; i < alive.length; i += maxConcurrent) {
    const batch = alive.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(async (c) => {
        try {
          const prompt = buildAgentPrompt(c, ctx, options.reactionContextHook);
          const result = await generateText({ provider, model, prompt });
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
  console.log(`  [agents] ${reactions.length}/${alive.length} reactions in ${elapsed}s (per-agent path)`);
  reactions.sort((a, b) => b.intensity - a.intensity);
  return reactions;
}
