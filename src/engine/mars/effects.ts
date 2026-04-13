/**
 * Mars-specific category effects. Extracted from orchestrator.ts hardcoded categoryEffects.
 * Maps crisis category -> base colony system deltas (applied with outcome multiplier).
 */
export const MARS_CATEGORY_EFFECTS: Record<string, Record<string, number>> = {
  environmental:  { powerKw: 50, morale: 0.08, foodMonthsReserve: 1 },
  resource:       { foodMonthsReserve: 4, waterLitersPerDay: 100, morale: 0.05 },
  medical:        { morale: 0.10, lifeSupportCapacity: 5 },
  psychological:  { morale: 0.15 },
  political:      { morale: 0.08, infrastructureModules: 1 },
  infrastructure: { infrastructureModules: 2, powerKw: 60, pressurizedVolumeM3: 200 },
  social:         { morale: 0.12 },
  technological:  { powerKw: 50, scienceOutput: 3, morale: 0.05 },
};

/** Default fallback effect when the category is unknown */
export const MARS_FALLBACK_EFFECT: Record<string, number> = { morale: 0.08 };

/** Crisis categories that trigger politics deltas */
export const MARS_POLITICS_CATEGORIES = new Set(['political', 'social']);

export const MARS_POLITICS_SUCCESS_DELTA = { independencePressure: 0.05, earthDependencyPct: -3 };
export const MARS_POLITICS_FAILURE_DELTA = { independencePressure: -0.03, earthDependencyPct: 2 };
