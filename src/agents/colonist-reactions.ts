/**
 * Colonist Reactions — lightweight parallel LLM calls for all alive colonists.
 *
 * Uses gpt-4o-mini (or configured cheap model) to generate 1-2 sentence
 * reactions from each colonist based on their personality, role, health,
 * and the crisis outcome. All calls run in parallel via Promise.all.
 *
 * Cost: ~$0.00006 per colonist per turn. 100 colonists x 12 turns = $0.14 total.
 */

import { generateText } from '@framers/agentos';
import type { Colonist, TurnOutcome } from '../kernel/state.js';

export interface ColonistReaction {
  colonistId: string;
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

function buildColonistPrompt(c: Colonist, ctx: ReactionContext, reactionContextHook?: (colonist: any, ctx: any) => string): string {
  const age = ctx.year - c.core.birthYear;
  const h = c.hexaco;
  const marsborn = reactionContextHook ? reactionContextHook(c, ctx) : (c.core.marsborn ? 'Mars-born, never seen Earth.' : `Earth-born, ${ctx.year - 2035} years on Mars.`);

  // Recent life events give the colonist a personal history that shapes their reaction
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
  if (c.health.boneDensityPct < 70) socialContext.push('Suffering significant bone density loss');
  if (c.health.cumulativeRadiationMsv > 1500) socialContext.push('High cumulative radiation exposure');
  if (c.health.psychScore < 0.4) socialContext.push('Struggling with depression');
  const socialLine = socialContext.length ? socialContext.join('. ') + '.' : '';

  return `${REACTION_PROMPT}

YOU: ${c.core.name}, age ${age}, ${c.core.role} in ${c.core.department}. ${marsborn}
${c.career.specialization !== 'Undetermined' ? `Specialization: ${c.career.specialization}. ${c.career.yearsExperience} years experience.` : ''}
Personality: O=${h.openness.toFixed(2)} C=${h.conscientiousness.toFixed(2)} E=${h.extraversion.toFixed(2)} A=${h.agreeableness.toFixed(2)} Em=${h.emotionality.toFixed(2)} HH=${h.honestyHumility.toFixed(2)}
Health: bone density ${c.health.boneDensityPct.toFixed(0)}%, radiation ${c.health.cumulativeRadiationMsv.toFixed(0)} mSv, psych ${c.health.psychScore.toFixed(2)}
${socialLine}
${c.promotion ? `Promoted to ${c.promotion.role} by ${c.promotion.promotedBy}.` : ''}${lifeHistory}

WHAT HAPPENED: Turn ${ctx.turn}, Year ${ctx.year}. Crisis: "${ctx.crisisTitle}" (${ctx.crisisCategory}).
Commander decided: ${ctx.decision.slice(0, 200)}
Outcome: ${ctx.outcome}. Colony morale: ${Math.round(ctx.colonyMorale * 100)}%. Population: ${ctx.colonyPopulation}.

React as this specific person given YOUR history and personality. Do NOT start with "I can't believe". Be distinctive. JSON only.`;
}

function parseReaction(text: string, c: Colonist, year: number): ColonistReaction | null {
  // Extract JSON
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) start = i; depth++; }
    if (text[i] === '}') { depth--; if (depth === 0 && start >= 0) {
      try {
        const raw = JSON.parse(text.slice(start, i + 1));
        if (raw.quote) {
          return {
            colonistId: c.core.id,
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
            boneDensity: +c.health.boneDensityPct.toFixed(0),
            radiation: +c.health.cumulativeRadiationMsv.toFixed(0),
          };
        }
      } catch {}
      start = -1;
    }}
  }
  return null;
}

/**
 * Generate reactions from all alive colonists in parallel.
 * Uses cheap model (gpt-4o-mini) for cost efficiency.
 */
export async function generateColonistReactions(
  colonists: Colonist[],
  ctx: ReactionContext,
  options: { provider?: string; model?: string; maxConcurrent?: number; reactionContextHook?: (colonist: any, ctx: any) => string } = {},
): Promise<ColonistReaction[]> {
  const alive = colonists.filter(c => c.health.alive);
  const provider = (options.provider || 'openai') as any;
  const model = options.model || 'gpt-4o-mini';
  const maxConcurrent = options.maxConcurrent || 25;

  console.log(`  [colonists] Generating ${alive.length} reactions via ${model}...`);
  const startTime = Date.now();

  // Process in batches to avoid rate limits
  const reactions: ColonistReaction[] = [];
  for (let i = 0; i < alive.length; i += maxConcurrent) {
    const batch = alive.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(async (c) => {
        try {
          const prompt = buildColonistPrompt(c, ctx, options.reactionContextHook);
          const result = await generateText({ provider, model, prompt });
          return parseReaction(result.text, c, ctx.year);
        } catch {
          return null;
        }
      })
    );
    reactions.push(...batchResults.filter((r): r is ColonistReaction => r !== null));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  [colonists] ${reactions.length}/${alive.length} reactions in ${elapsed}s`);

  // Sort by intensity (most dramatic first)
  reactions.sort((a, b) => b.intensity - a.intensity);

  return reactions;
}
