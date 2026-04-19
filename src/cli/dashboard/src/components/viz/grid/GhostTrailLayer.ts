import type { CellSnapshot, GridPosition } from '../viz-types.js';

export interface GhostTrailColors {
  outline: string;
  arrowLine: string;
  arrowHead: string;
}

const DEFAULT_GHOST_COLORS: GhostTrailColors = {
  outline: 'rgba(216, 204, 176, 0.32)',
  arrowLine: 'rgba(216, 204, 176, 0.25)',
  arrowHead: 'rgba(216, 204, 176, 0.5)',
};

/**
 * Draw faded prior-turn colonist outlines with arrows to their current
 * positions. Only renders colonists present in BOTH turns so the effect
 * reads as "this person moved here." Skips colonists whose movement is
 * below a pixel threshold (no visible delta). Colors are theme-aware
 * when a `GhostTrailColors` object is passed.
 */
export function drawGhostTrail(
  ctx: CanvasRenderingContext2D,
  currentCells: CellSnapshot[],
  currentPositions: Map<string, GridPosition>,
  previousCells: CellSnapshot[] | undefined,
  previousPositions: Map<string, GridPosition> | undefined,
  colors: GhostTrailColors = DEFAULT_GHOST_COLORS,
): void {
  if (!previousCells || !previousPositions) return;
  const currById = new Map(currentCells.map(c => [c.agentId, c]));
  ctx.save();
  ctx.lineCap = 'round';
  for (const prev of previousCells) {
    if (!prev.alive) continue;
    const curr = currById.get(prev.agentId);
    if (!curr || !curr.alive) continue;
    const pFrom = previousPositions.get(prev.agentId);
    const pTo = currentPositions.get(prev.agentId);
    if (!pFrom || !pTo) continue;
    const dx = pTo.x - pFrom.x;
    const dy = pTo.y - pFrom.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 3) continue;

    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.arc(pFrom.x, pFrom.y, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = colors.arrowLine;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(pFrom.x, pFrom.y);
    ctx.lineTo(pTo.x, pTo.y);
    ctx.stroke();

    const ang = Math.atan2(dy, dx);
    const ah = 4;
    ctx.fillStyle = colors.arrowHead;
    ctx.beginPath();
    ctx.moveTo(pTo.x, pTo.y);
    ctx.lineTo(pTo.x - Math.cos(ang - 0.4) * ah, pTo.y - Math.sin(ang - 0.4) * ah);
    ctx.lineTo(pTo.x - Math.cos(ang + 0.4) * ah, pTo.y - Math.sin(ang + 0.4) * ah);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
