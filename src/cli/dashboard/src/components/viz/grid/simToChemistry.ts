import type { CellSnapshot, TurnSnapshot, GridPosition } from '../viz-types.js';

const F_MIN = 0.018;
const F_MAX = 0.055;
const K_MIN = 0.045;
const K_MAX = 0.070;

const MOOD_CONTRIB: Record<string, number> = {
  positive: +0.9,
  hopeful: +0.6,
  neutral: 0.0,
  anxious: -0.5,
  negative: -0.8,
  defiant: -0.6,
  resigned: -0.7,
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export interface ChemistryParams {
  F: number;
  k: number;
}

/**
 * Optional HEXACO personality profile threaded through from the
 * leader so the chemistry can nudge F/k based on archetype. Without
 * this, two leaders with identical turn-1 colony stats produce
 * visually identical Turing patterns — which defeated the whole
 * "emergent divergence" pitch because the canvas didn't diverge.
 * The five traits used here are normalized 0..1.
 */
export interface LeaderPersonalityShape {
  /** Openness — pushes F up toward more pattern expansion. */
  openness?: number;
  /** Conscientiousness — pulls k down toward tighter, ordered patterns. */
  conscientiousness?: number;
  /** Emotionality — pushes k up toward higher stress visibility. */
  emotionality?: number;
  /** Extraversion — pushes F up toward broader clustering. */
  extraversion?: number;
  /** Agreeableness — slight F nudge, smoother patterns. */
  agreeableness?: number;
  /** Honesty-humility — unused for chemistry; reserved. */
  honestyHumility?: number;
}

/**
 * Compute global (F, k) feed/kill rates for this snapshot. Uses
 * morale × food × population-retention as the vitality axis, and
 * deaths + anxiousFraction as the stress axis. Output clamped inside
 * the Gray-Scott sweet-spot band.
 *
 * When a HEXACO profile is supplied the chemistry shifts per the
 * archetype: Visionary leaders (high O+E, mid C) produce more open,
 * spreading patterns; Engineer leaders (high C, low E) produce
 * tighter, higher-contrast clusters. This breaks the turn-1 tie
 * between identical colony states so the two panels visibly diverge
 * from the first frame.
 */
export function computeChemistryParams(
  snapshot: TurnSnapshot,
  initialPopulation: number,
  leaderPersonality?: LeaderPersonalityShape,
): ChemistryParams {
  const foodNorm = clamp01(snapshot.foodReserve / 18);
  const popRetention = clamp01(snapshot.population / Math.max(1, initialPopulation));
  const healthNorm = clamp01(snapshot.morale * foodNorm * popRetention);

  const aliveCells = snapshot.cells.filter(c => c.alive);
  const anxiousFraction =
    aliveCells.length > 0
      ? aliveCells.filter(c => c.mood === 'anxious' || c.mood === 'negative').length /
        aliveCells.length
      : 0;
  const stressNorm = clamp01(snapshot.deaths / 5 + anxiousFraction);

  let F = lerp(F_MIN, F_MAX, healthNorm);
  let k = lerp(K_MIN, K_MAX, stressNorm);

  // Personality-driven delta. Scaled at 12% of the F/k band width so
  // the chemistry still sits inside the Gray-Scott sweet-spot for any
  // reasonable HEXACO combo — the NaN-prone edges (F near 0, k near
  // 0.07) stay safely out of reach. O+E pull F toward expansion; C
  // pulls k toward order; Em pushes k toward stress.
  if (leaderPersonality) {
    const O = leaderPersonality.openness ?? 0.5;
    const C = leaderPersonality.conscientiousness ?? 0.5;
    const E = leaderPersonality.extraversion ?? 0.5;
    const Em = leaderPersonality.emotionality ?? 0.5;
    const A = leaderPersonality.agreeableness ?? 0.5;
    const fBandWidth = F_MAX - F_MIN;
    const kBandWidth = K_MAX - K_MIN;
    // Center each trait around 0 (so 0.5 is neutral) and blend.
    const fNudge = ((O - 0.5) * 0.6 + (E - 0.5) * 0.4 + (A - 0.5) * 0.1) * fBandWidth * 0.12;
    const kNudge = ((Em - 0.5) * 0.5 + (0.5 - C) * 0.4) * kBandWidth * 0.12;
    F = Math.max(F_MIN, Math.min(F_MAX, F + fNudge));
    k = Math.max(K_MIN, Math.min(K_MAX, k + kNudge));
  }

  return { F, k };
}

export interface Injection {
  agentId: string;
  x: number;
  y: number;
  /** 0 = inject into U (vitality), 1 = inject into V (stress). */
  channel: 0 | 1;
  strength: number;
}

/**
 * Build one Injection per alive colonist, keyed to their grid position.
 * Caller applies a Gaussian brush at (x, y) to smooth the halo.
 */
export function computeInjections(
  cells: CellSnapshot[],
  positions: Map<string, GridPosition>,
): Injection[] {
  const out: Injection[] = [];
  for (const c of cells) {
    if (!c.alive) continue;
    const pos = positions.get(c.agentId);
    if (!pos) continue;
    const contrib = MOOD_CONTRIB[c.mood] ?? 0;
    const sizeMult = c.featured ? 1.5 : 1.0;
    const psych = typeof c.psychScore === 'number' ? c.psychScore : 0.5;
    // 0.04 baseline (was 0.12 — caused field saturation into solid
    // amber blobs). Paired with Gray-Scott's native F*(1-U) feed term,
    // the field equilibrates rather than saturating.
    const strength = 0.04 * sizeMult * psych * Math.abs(contrib);
    if (strength <= 0) continue;
    out.push({
      agentId: c.agentId,
      x: pos.x,
      y: pos.y,
      channel: contrib >= 0 ? 0 : 1,
      strength,
    });
  }
  return out;
}
