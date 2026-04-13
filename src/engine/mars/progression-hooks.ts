import type { ProgressionHookContext } from '../types.js';

const MARS_RADIATION_MSV_PER_YEAR = 0.67 * 365; // ~244.55 mSv/year

/**
 * Mars-specific between-turn progression: radiation accumulation and bone density loss.
 * Extracted from kernel/progression.ts lines 140-149.
 * Called as a scenario hook during progressBetweenTurns.
 */
export function marsProgressionHook(ctx: ProgressionHookContext): void {
  const { colonists, yearDelta, year, startYear } = ctx;

  for (const c of colonists) {
    if (!c.health.alive) continue;

    // Radiation accumulation
    c.health.cumulativeRadiationMsv += MARS_RADIATION_MSV_PER_YEAR * yearDelta;

    // Bone density loss (stabilizes after ~20 years on Mars)
    const lossRate = c.core.marsborn ? 0.003 : 0.005;
    const yearsOnMars = year - (c.core.marsborn ? c.core.birthYear : startYear);
    const decayFactor = Math.max(0.5, 1 - lossRate * Math.min(yearsOnMars, 20));
    c.health.boneDensityPct = Math.max(50, c.health.boneDensityPct * decayFactor);
  }
}
