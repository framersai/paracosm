/**
 * Mars-specific politics delta hook.
 * Extracted from orchestrator.ts lines 710-716.
 * Returns politics deltas for political/social crises, null for others.
 */

const POLITICS_CATEGORIES = new Set(['political', 'social']);
const SUCCESS_DELTA = { independencePressure: 0.05, earthDependencyPct: -3 };
const FAILURE_DELTA = { independencePressure: -0.03, earthDependencyPct: 2 };

export function marsPoliticsHook(
  category: string,
  outcome: string,
): Record<string, number> | null {
  if (!POLITICS_CATEGORIES.has(category)) return null;
  return outcome.includes('success') ? { ...SUCCESS_DELTA } : { ...FAILURE_DELTA };
}
