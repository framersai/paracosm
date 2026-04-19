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
 * Compute global (F, k) feed/kill rates for this snapshot. Uses
 * morale × food × population-retention as the vitality axis, and
 * deaths + anxiousFraction as the stress axis. Output clamped inside
 * the Gray-Scott sweet-spot band.
 */
export function computeChemistryParams(
  snapshot: TurnSnapshot,
  initialPopulation: number,
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

  return {
    F: lerp(F_MIN, F_MAX, healthNorm),
    k: lerp(K_MIN, K_MAX, stressNorm),
  };
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
    const sizeMult = c.featured ? 1.8 : 1.0;
    const psych = typeof c.psychScore === 'number' ? c.psychScore : 0.5;
    const strength = 0.12 * sizeMult * psych * Math.abs(contrib);
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
