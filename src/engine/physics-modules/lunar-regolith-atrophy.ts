/**
 * Lunar per-agent progression physics.
 *
 * Walks the agent population each between-turn tick and applies
 * cumulative regolith dust exposure plus muscle/bone atrophy under
 * 1/6g. The atrophy curve is steeper than Mars (0.008/yr vs 0.005/yr)
 * to reflect the lower partial gravity, saturates after 15 years, and
 * floors at 40% bone density.
 *
 * Generic and reusable — any scenario set on the lunar surface can
 * opt into it via `dataDrivenHooks.progressionPhysics:
 * 'lunar-regolith-atrophy'`.
 *
 * @module paracosm/engine/physics-modules/lunar-regolith-atrophy
 */
import type { ProgressionHookContext } from '../types.js';

/** Lunar regolith dust toxicity index — arbitrary annualized units. */
const LUNAR_REGOLITH_EXPOSURE_PER_YEAR = 45;

/**
 * Walk the agent roster, accumulate regolith dust exposure (stored on
 * the same `cumulativeRadiationMsv` field for kernel uniformity),
 * and apply muscle/bone atrophy. The 0.008/yr loss rate is steeper
 * than Mars to reflect 1/6g vs 0.38g; saturates at 15 years on the
 * Moon and floors at 40% bone density.
 */
export function lunarRegolithAtrophyProgression(ctx: ProgressionHookContext): void {
  const { agents, timeDelta, time, startTime } = ctx;

  for (const c of agents) {
    if (!c.health.alive) continue;

    c.health.cumulativeRadiationMsv =
      (c.health.cumulativeRadiationMsv ?? 0) + LUNAR_REGOLITH_EXPOSURE_PER_YEAR * timeDelta;

    const lossRate = 0.008;
    const yearsOnMoon = time - startTime;
    const decayFactor = Math.max(0.4, 1 - lossRate * Math.min(yearsOnMoon, 15));
    c.health.boneDensityPct = Math.max(40, (c.health.boneDensityPct ?? 0) * decayFactor);
  }
}
