import type { ProgressionHookContext } from '../types.js';

const MARS_RADIATION_MSV_PER_YEAR = 0.67 * 365; // ~244.55 mSv/year

/**
 * Mars-specific between-turn progression: radiation accumulation and bone density loss.
 * Extracted from kernel/progression.ts lines 140-149.
 * Called as a scenario hook during progressBetweenTurns.
 */
export function marsProgressionHook(ctx: ProgressionHookContext): void {
  const { agents, timeDelta, time, startTime } = ctx;

  for (const c of agents) {
    if (!c.health.alive) continue;

    // Radiation accumulation
    c.health.cumulativeRadiationMsv = (c.health.cumulativeRadiationMsv ?? 0) + MARS_RADIATION_MSV_PER_YEAR * timeDelta;

    // Bone density loss (stabilizes after ~20 years on Mars)
    const lossRate = c.core.marsborn ? 0.003 : 0.005;
    const yearsOnMars = time - (c.core.marsborn ? c.core.birthTime : startTime);
    const decayFactor = Math.max(0.5, 1 - lossRate * Math.min(yearsOnMars, 20));
    c.health.boneDensityPct = Math.max(50, (c.health.boneDensityPct ?? 0) * decayFactor);
  }
}
