import type { CellSnapshot, GridPosition } from '../viz-types.js';

/** Outlined colonist markers. Primary hit-test target. `intensity`
 *  scales opacity so modes like forge/ecology can dim glyphs.
 *  `divergedIds` marks colonists alive on this side but dead on the
 *  other — rendered with a bright rust ring in DIVERGENCE mode. */
export function drawGlyphs(
  ctx: CanvasRenderingContext2D,
  cells: CellSnapshot[],
  positions: Map<string, GridPosition>,
  sideColor: string,
  intensity = 1,
  divergedIds?: Set<string>,
  divergenceOnly = false,
): void {
  ctx.save();
  for (const c of cells) {
    if (!c.alive) continue;
    const pos = positions.get(c.agentId);
    if (!pos) continue;
    const diverged = divergedIds?.has(c.agentId) ?? false;
    if (divergenceOnly && !diverged) continue;
    const r = c.featured ? 5 : 3;
    const baseAlpha = c.featured ? 0.95 : 0.75;
    if (diverged) {
      // Halo to pop diverged colonists out of the cluster.
      ctx.strokeStyle = 'rgba(232, 180, 74, 0.9)';
      ctx.lineWidth = 2;
      ctx.globalAlpha = intensity;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = diverged ? 'rgba(224, 101, 48, 1)' : sideColor;
    ctx.lineWidth = c.featured || diverged ? 1.6 : 1;
    ctx.globalAlpha = (diverged ? 1 : baseAlpha) * intensity;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
