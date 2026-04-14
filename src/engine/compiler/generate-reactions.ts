/**
 * Generate a reaction context hook from scenario JSON via LLM.
 * The reaction context hook returns location/identity/health phrasing
 * for individual colonist reaction prompts.
 */

import type { GenerateTextFn } from './types.js';

function buildPrompt(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};

  return `You are generating a reaction context hook for a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'} — ${labels.settlementNoun ?? 'settlement'} simulation
POPULATION NOUN: ${labels.populationNoun ?? 'members'}
START YEAR: ${scenarioJson.setup?.defaultStartYear ?? 2035}

Generate a TypeScript arrow function that returns a 1-3 sentence string providing location/identity context for a ${labels.populationNoun ?? 'member'} reaction prompt.

The function receives:
- colonist: { core: { marsborn: boolean, birthYear: number, name: string }, health: { alive: boolean, boneDensityPct: number, cumulativeRadiationMsv: number, psychScore: number } }
- ctx: { year: number, turn: number }

Return a string with:
1. Identity phrasing (born at the ${labels.settlementNoun ?? 'settlement'} vs arrived from elsewhere)
2. Health context if relevant (low bone density, high radiation, low psych score)
3. Scenario-appropriate language

Rules:
1. Return a string, not an object
2. Keep it to 1-3 short sentences
3. Reference scenario-specific health concerns
4. Do NOT use external imports

Return ONLY the arrow function, no markdown fences, no explanation.`;
}

export function parseResponse(text: string): ((colonist: any, ctx: any) => string) | null {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:typescript|ts)?\n?/i, '').replace(/\n?```$/i, '').trim();
  if (cleaned.endsWith(';')) cleaned = cleaned.slice(0, -1).trim();

  try {
    const fn = new Function('return ' + cleaned)();
    if (typeof fn === 'function') return fn;
    return null;
  } catch {
    return null;
  }
}

export async function generateReactionContextHook(
  scenarioJson: Record<string, any>,
  generateText: GenerateTextFn,
  maxRetries = 3,
): Promise<{ hook: (colonist: any, ctx: any) => string; source: string }> {
  let lastError = '';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const retryHint = attempt > 0 ? `\n\nPrevious attempt failed: ${lastError}. Fix the issue.` : '';
    const text = await generateText(buildPrompt(scenarioJson) + retryHint);
    const fn = parseResponse(text);

    if (!fn) {
      lastError = 'Could not parse response into a function';
      continue;
    }

    // Smoke test
    try {
      const result = fn(
        { core: { marsborn: false, birthYear: 2010, name: 'Test' }, health: { alive: true, boneDensityPct: 80, cumulativeRadiationMsv: 200, psychScore: 0.6 } },
        { year: 2045, turn: 3 },
      );
      if (typeof result !== 'string') {
        lastError = 'Must return a string';
        continue;
      }
      return { hook: fn, source: text.trim() };
    } catch (err) {
      lastError = String(err);
    }
  }

  // Fallback: generic reaction context
  const labels = scenarioJson.labels ?? {};
  console.warn('[compiler] Reaction context hook generation failed. Using fallback.');
  return {
    hook: (colonist: any, ctx: any) => {
      const lines: string[] = [];
      if (colonist.core?.marsborn) {
        lines.push(`Born at the ${labels.settlementNoun ?? 'settlement'}.`);
      } else {
        lines.push(`Arrived ${ctx.year - (scenarioJson.setup?.defaultStartYear ?? 2035)} years ago.`);
      }
      if (colonist.health?.psychScore < 0.4) lines.push('Struggling with low morale.');
      return lines.join(' ');
    },
    source: '// Fallback reaction context',
  };
}
