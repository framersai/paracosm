/**
 * Generate a progression hook from scenario JSON via LLM.
 * The progression hook applies between-turn health/status changes
 * based on the scenario's environment and domain.
 */

import type { ProgressionHookContext } from '../types.js';
import type { GenerateTextFn } from './types.js';

/** Build the prompt for generating a progression hook. */
function buildPrompt(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const env = scenarioJson.world?.environment ?? {};
  const depts = (scenarioJson.departments ?? []).map((d: any) => d.id).join(', ');

  return `You are generating a between-turn progression hook for a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'} — ${labels.settlementNoun ?? 'settlement'} simulation
POPULATION NOUN: ${labels.populationNoun ?? 'members'}
SETTLEMENT: ${labels.settlementNoun ?? 'settlement'}
ENVIRONMENT VARIABLES: ${JSON.stringify(env, null, 2)}
DEPARTMENTS: ${depts}

Generate a TypeScript function body for a progression hook. The function receives a context object with these fields:
- ctx.agents: array of agent objects with { core: { marsborn: boolean, birthYear: number, name: string }, health: { alive: boolean, boneDensityPct: number, cumulativeRadiationMsv: number, psychScore: number } }
- ctx.yearDelta: number of simulated years since last turn
- ctx.year: current simulated year
- ctx.turn: current turn number
- ctx.startYear: simulation start year
- ctx.rng: { chance(p: number): boolean, next(): number, pick<T>(arr: T[]): T, int(min: number, max: number): number }

Rules:
1. Only modify health fields on ALIVE agents (check c.health.alive first, iterate ctx.agents)
2. Use environment-appropriate health degradation for this scenario's domain
3. Multiply time-scaled effects by ctx.yearDelta
4. Use Math.max/Math.min to keep values bounded (boneDensityPct: 0-100, psychScore: 0-1, cumulativeRadiationMsv: >= 0)
5. Do NOT use external imports, do NOT use require()
6. The function signature is: (ctx: ProgressionHookContext) => void
7. Use ctx.rng.chance(p) for probabilistic effects instead of Math.random()

Return ONLY the complete function as a TypeScript arrow function, no explanation, no markdown fences. Example format:
(ctx) => { for (const c of ctx.agents) { if (!c.health.alive) continue; /* effects */ } }`;
}

/** Parse the LLM response into an executable function. */
export function parseResponse(text: string): ((ctx: ProgressionHookContext) => void) | null {
  let cleaned = text.trim();
  // Strip markdown fences if present
  cleaned = cleaned.replace(/^```(?:typescript|ts)?\n?/i, '').replace(/\n?```$/i, '').trim();
  // Strip trailing semicolons
  if (cleaned.endsWith(';')) cleaned = cleaned.slice(0, -1).trim();

  try {
    // Wrap in a function constructor
    const fn = new Function('return ' + cleaned)();
    if (typeof fn === 'function') return fn;
    return null;
  } catch {
    // Try wrapping as function body if it's just statements
    try {
      const fn = new Function('ctx', cleaned);
      return (ctx: ProgressionHookContext) => fn(ctx);
    } catch {
      return null;
    }
  }
}

/** Generate a progression hook via LLM, with retries on validation failure. */
export async function generateProgressionHook(
  scenarioJson: Record<string, any>,
  generateText: GenerateTextFn,
  maxRetries = 3,
): Promise<{ hook: (ctx: ProgressionHookContext) => void; source: string }> {
  const prompt = buildPrompt(scenarioJson);
  let lastError = '';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const retryHint = attempt > 0 ? `\n\nPrevious attempt failed: ${lastError}. Fix the issue.` : '';
    const text = await generateText(prompt + retryHint);
    const fn = parseResponse(text);

    if (!fn) {
      lastError = 'Could not parse response into a function';
      continue;
    }

    // Quick smoke test
    try {
      const testColonists = [
        { core: { marsborn: false, birthYear: 2010, name: 'Test' }, health: { alive: true, boneDensityPct: 95, cumulativeRadiationMsv: 100, psychScore: 0.7 }, career: {}, social: {}, narrative: {}, hexaco: {} },
        { core: { marsborn: false, birthYear: 2010, name: 'Dead' }, health: { alive: false, boneDensityPct: 80, cumulativeRadiationMsv: 50, psychScore: 0.5 }, career: {}, social: {}, narrative: {}, hexaco: {} },
      ];
      fn({
        agents: testColonists as any,
        yearDelta: 4,
        year: 2045,
        turn: 3,
        startYear: 2035,
        rng: { chance: () => false, next: () => 0.5, pick: (arr: any) => arr[0], int: (min: number, max: number) => min },
      });
      return { hook: fn, source: text.trim() };
    } catch (err) {
      lastError = String(err);
    }
  }

  // Fallback: no-op hook
  console.warn(`[compiler] Progression hook generation failed after ${maxRetries} retries. Using no-op.`);
  return {
    hook: () => {},
    source: '// No-op: generation failed',
  };
}
