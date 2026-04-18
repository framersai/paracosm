/**
 * Generate a reaction context hook from scenario JSON via
 * generateValidatedCode. The reaction context hook returns
 * location/identity/health phrasing for individual colonist reaction
 * prompts.
 *
 * @module paracosm/engine/compiler/generate-reactions
 */
import type { GenerateTextFn } from './types.js';
import type { CompilerTelemetry } from './telemetry.js';
import { generateValidatedCode } from './llm-invocations/generateValidatedCode.js';

type ReactionContextFn = (colonist: any, ctx: any) => string;

function buildSystemBlock(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  return `You are generating a reaction context hook for a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'} — ${labels.settlementNoun ?? 'settlement'} simulation
POPULATION NOUN: ${labels.populationNoun ?? 'members'}
START YEAR: ${scenarioJson.setup?.defaultStartYear ?? 2035}

Function signature: (colonist, ctx) => string

Inputs:
- colonist: { core: { marsborn, birthYear, name }, health: { alive, boneDensityPct, cumulativeRadiationMsv, psychScore } }
- ctx: { year, turn }

Return a 1-3 sentence string providing identity + health context for a ${labels.populationNoun ?? 'member'} reaction prompt.

Rules:
1. Return a string, not an object
2. 1-3 short sentences
3. Reference scenario-specific health concerns
4. NO external imports`;
}

const userPrompt = 'Return ONLY the arrow function. No markdown fences.';

export function parseResponse(text: string): ReactionContextFn | null {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:typescript|ts|javascript|js)?\n?/i, '').replace(/\n?```$/i, '').trim();
  if (cleaned.endsWith(';')) cleaned = cleaned.slice(0, -1).trim();
  try {
    const fn = new Function('return ' + cleaned)();
    return typeof fn === 'function' ? fn : null;
  } catch {
    return null;
  }
}

function smokeTest(fn: ReactionContextFn): void {
  const result = fn(
    { core: { marsborn: false, birthYear: 2010, name: 'Test' }, health: { alive: true, boneDensityPct: 80, cumulativeRadiationMsv: 200, psychScore: 0.6 } },
    { year: 2045, turn: 3 },
  );
  if (typeof result !== 'string') throw new Error('Must return a string');
}

function buildFallback(scenarioJson: Record<string, any>): ReactionContextFn {
  const labels = scenarioJson.labels ?? {};
  return (colonist, ctx) => {
    const lines: string[] = [];
    if (colonist.core?.marsborn) {
      lines.push(`Born at the ${labels.settlementNoun ?? 'settlement'}.`);
    } else {
      lines.push(`Arrived ${ctx.year - (scenarioJson.setup?.defaultStartYear ?? 2035)} years ago.`);
    }
    if (colonist.health?.psychScore < 0.4) lines.push('Struggling with low morale.');
    return lines.join(' ');
  };
}

export interface GenerateReactionsOptions {
  telemetry?: CompilerTelemetry;
}

export async function generateReactionContextHook(
  scenarioJson: Record<string, any>,
  generateText: GenerateTextFn,
  options: GenerateReactionsOptions = {},
): Promise<{ hook: ReactionContextFn; source: string; attempts: number; fromFallback: boolean }> {
  const result = await generateValidatedCode<ReactionContextFn>({
    hookName: 'reactions',
    systemCacheable: buildSystemBlock(scenarioJson),
    prompt: userPrompt,
    parse: parseResponse,
    smokeTest,
    fallback: buildFallback(scenarioJson),
    fallbackSource: '// Fallback reaction context',
    // Reaction context hook is compact (~800 output tokens typical).
    maxTokens: 2000,
    generateText,
    telemetry: options.telemetry,
  });
  return { hook: result.hook, source: result.source, attempts: result.attempts, fromFallback: result.fromFallback };
}
