import type { ProgressionHookContext } from '../types.js';

const LUNAR_REGOLITH_EXPOSURE_PER_YEAR = 45; // arbitrary units, lunar dust toxicity index

/**
 * Lunar-specific between-turn progression: regolith dust exposure and muscle atrophy.
 * Lunar gravity is 1/6g (vs Mars 0.38g), causing faster muscle/bone loss.
 */
export function lunarProgressionHook(ctx: ProgressionHookContext): void {
  const { agents, timeDelta, time, startTime } = ctx;

  for (const c of agents) {
    if (!c.health.alive) continue;

    // Regolith dust exposure (cumulative, like Mars radiation but from toxic lunar dust)
    c.health.cumulativeRadiationMsv = (c.health.cumulativeRadiationMsv ?? 0) + LUNAR_REGOLITH_EXPOSURE_PER_YEAR * timeDelta;

    // Muscle/bone atrophy in 1/6g (faster than Mars 0.38g)
    const lossRate = 0.008; // faster than Mars (0.005) due to lower gravity
    const yearsOnMoon = time - startTime;
    const decayFactor = Math.max(0.4, 1 - lossRate * Math.min(yearsOnMoon, 15));
    c.health.boneDensityPct = Math.max(40, (c.health.boneDensityPct ?? 0) * decayFactor);
  }
}
