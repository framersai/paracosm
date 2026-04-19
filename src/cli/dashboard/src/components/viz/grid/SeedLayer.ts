import type { CellSnapshot, GridPosition } from '../viz-types.js';

const MOOD_RGB: Record<string, [number, number, number]> = {
  positive: [106, 173, 72],
  hopeful: [154, 205, 96],
  neutral: [107, 95, 80],
  anxious: [232, 180, 74],
  negative: [224, 101, 48],
  defiant: [196, 74, 30],
  resigned: [168, 152, 120],
};

/**
 * Draw faint chemistry-halo tints at each colonist's grid position.
 * Layered under glyphs; reads as a warm glow per colonist. Additive
 * blend mode so overlapping halos brighten.
 */
export function drawSeeds(
  ctx: CanvasRenderingContext2D,
  cells: CellSnapshot[],
  positions: Map<string, GridPosition>,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const c of cells) {
    if (!c.alive) continue;
    const pos = positions.get(c.agentId);
    if (!pos) continue;
    const rgb = MOOD_RGB[c.mood] ?? MOOD_RGB.neutral;
    const r = c.featured ? 14 : 9;
    const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, r);
    grad.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.18)`);
    grad.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
