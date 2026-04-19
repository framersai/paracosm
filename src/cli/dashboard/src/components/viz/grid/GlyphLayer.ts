import type { CellSnapshot, GridPosition } from '../viz-types.js';

/** Outlined colonist markers. Primary hit-test target. `intensity`
 *  scales opacity so modes like forge/ecology can dim glyphs. */
export function drawGlyphs(
  ctx: CanvasRenderingContext2D,
  cells: CellSnapshot[],
  positions: Map<string, GridPosition>,
  sideColor: string,
  intensity = 1,
): void {
  ctx.save();
  for (const c of cells) {
    if (!c.alive) continue;
    const pos = positions.get(c.agentId);
    if (!pos) continue;
    const r = c.featured ? 5 : 3;
    ctx.strokeStyle = sideColor;
    ctx.lineWidth = c.featured ? 1.5 : 1;
    ctx.globalAlpha = (c.featured ? 0.95 : 0.75) * intensity;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
