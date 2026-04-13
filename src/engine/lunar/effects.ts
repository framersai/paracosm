/**
 * Lunar outpost category effects.
 * Maps crisis category -> base colony system deltas (applied with outcome multiplier).
 */
export const LUNAR_CATEGORY_EFFECTS: Record<string, Record<string, number>> = {
  environmental:  { powerKw: 40, morale: 0.06, foodMonthsReserve: 0.5 },
  resource:       { foodMonthsReserve: 3, waterLitersPerDay: 80, morale: 0.04 },
  medical:        { morale: 0.08, lifeSupportCapacity: 3 },
  psychological:  { morale: 0.12 },
  political:      { morale: 0.06, infrastructureModules: 1 },
  infrastructure: { infrastructureModules: 1, powerKw: 40, pressurizedVolumeM3: 150 },
  social:         { morale: 0.10 },
  technological:  { powerKw: 35, scienceOutput: 4, morale: 0.04 },
};

export const LUNAR_FALLBACK_EFFECT: Record<string, number> = { morale: 0.06 };
