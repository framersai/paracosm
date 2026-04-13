/**
 * Lunar-specific politics delta hook.
 * Lunar outpost politics: agency funding pressure, commercial partnerships.
 */

const POLITICS_CATEGORIES = new Set(['political', 'social']);
const SUCCESS_DELTA = { independencePressure: 0.03, earthDependencyPct: -2 };
const FAILURE_DELTA = { independencePressure: -0.02, earthDependencyPct: 3 };

export function lunarPoliticsHook(
  category: string,
  outcome: string,
): Record<string, number> | null {
  if (!POLITICS_CATEGORIES.has(category)) return null;
  return outcome.includes('success') ? { ...SUCCESS_DELTA } : { ...FAILURE_DELTA };
}
