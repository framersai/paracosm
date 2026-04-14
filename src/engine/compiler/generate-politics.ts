/**
 * Generate a politics hook from scenario JSON via LLM.
 * The politics hook returns delta values for political/social crisis outcomes.
 */

import type { GenerateTextFn } from './types.js';

function buildPrompt(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const effects = scenarioJson.effects ?? {};
  const categories = typeof effects === 'object' && !Array.isArray(effects)
    ? Object.keys(effects)
    : [];

  return `You are generating a politics hook for a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'} — ${labels.settlementNoun ?? 'settlement'} simulation
CRISIS CATEGORIES: ${categories.join(', ')}

Generate a TypeScript arrow function that returns politics deltas for political/social crisis outcomes.

The function receives:
- category: string (one of the crisis categories above)
- outcome: string (contains "success" or "failure")

Return:
- null if the category is not political/social in nature
- A Record<string, number> of politics field deltas for political/social categories

For success outcomes, the deltas should push toward independence/autonomy.
For failure outcomes, the deltas should push toward dependency/instability.

Pick 1-3 politics field names appropriate to this scenario's domain.

Rules:
1. Return null for non-political categories
2. Return a plain object with numeric deltas for political categories
3. Do NOT use external imports
4. Keep delta values small (e.g., 0.01-0.10 for percentages, 1-5 for integers)

Return ONLY the arrow function, no markdown fences, no explanation.`;
}

export function parseResponse(text: string): ((category: string, outcome: string) => Record<string, number> | null) | null {
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

export async function generatePoliticsHook(
  scenarioJson: Record<string, any>,
  generateText: GenerateTextFn,
  maxRetries = 3,
): Promise<{ hook: (category: string, outcome: string) => Record<string, number> | null; source: string }> {
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
      const nonPolitical = fn('environmental', 'risky_success');
      const political = fn('political', 'risky_success');
      if (political !== null && typeof political !== 'object') {
        lastError = 'Political result must be null or object';
        continue;
      }
      return { hook: fn, source: text.trim() };
    } catch (err) {
      lastError = String(err);
    }
  }

  // Fallback: no-op
  console.warn('[compiler] Politics hook generation failed. Using no-op.');
  return {
    hook: () => null,
    source: '// No-op: generation failed',
  };
}
