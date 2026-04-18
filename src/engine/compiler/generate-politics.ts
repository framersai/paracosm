/**
 * Generate a politics hook from scenario JSON via generateValidatedCode.
 * The politics hook returns delta values for political/social event
 * outcomes.
 *
 * @module paracosm/engine/compiler/generate-politics
 */
import type { GenerateTextFn } from './types.js';
import type { CompilerTelemetry } from './telemetry.js';
import { generateValidatedCode } from './llm-invocations/generateValidatedCode.js';

type PoliticsFn = (category: string, outcome: string) => Record<string, number> | null;

function buildSystemBlock(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const effects = scenarioJson.effects ?? {};
  const categories = typeof effects === 'object' && !Array.isArray(effects)
    ? Object.keys(effects)
    : [];
  return `You are generating a politics hook for a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'} — ${labels.settlementNoun ?? 'settlement'} simulation
EVENT CATEGORIES: ${categories.join(', ')}

Function signature: (category, outcome) => Record<string, number> | null

Return:
- null for non-political categories
- Record<string, number> of politics field deltas for political/social categories

Rules:
1. Success → push toward independence/autonomy
2. Failure → push toward dependency/instability
3. 1-3 politics fields appropriate to this scenario
4. Small deltas (0.01-0.10 for pct, 1-5 for ints)
5. NO external imports`;
}

const userPrompt = 'Return ONLY the arrow function. No markdown fences.';

export function parseResponse(text: string): PoliticsFn | null {
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

function smokeTest(fn: PoliticsFn): void {
  const political = fn('political', 'risky_success');
  if (political !== null && typeof political !== 'object') {
    throw new Error('Political result must be null or object');
  }
}

const fallback: PoliticsFn = () => null;

export interface GeneratePoliticsOptions {
  telemetry?: CompilerTelemetry;
}

export async function generatePoliticsHook(
  scenarioJson: Record<string, any>,
  generateText: GenerateTextFn,
  options: GeneratePoliticsOptions = {},
): Promise<{ hook: PoliticsFn; source: string; attempts: number; fromFallback: boolean }> {
  const result = await generateValidatedCode<PoliticsFn>({
    hookName: 'politics',
    systemCacheable: buildSystemBlock(scenarioJson),
    prompt: userPrompt,
    parse: parseResponse,
    smokeTest,
    fallback,
    fallbackSource: '// No-op: generation failed',
    // Politics hook is short (~1000 output tokens typical).
    maxTokens: 2000,
    generateText,
    telemetry: options.telemetry,
  });
  return { hook: result.hook, source: result.source, attempts: result.attempts, fromFallback: result.fromFallback };
}
