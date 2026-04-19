import type { CellSnapshot, GridPosition } from '../viz-types.js';

/**
 * Partner + parent-child connection arcs. Partner lines use a solid
 * amber stroke; child lines a thinner dashed teal stroke. Drawn under
 * the glyphs so markers stay visible on top.
 */
export function drawLines(
  ctx: CanvasRenderingContext2D,
  cells: CellSnapshot[],
  positions: Map<string, GridPosition>,
  sideColor: string,
): void {
  const byId = new Map<string, CellSnapshot>();
  for (const c of cells) if (c.alive) byId.set(c.agentId, c);

  ctx.save();
  ctx.lineCap = 'round';

  // Partner arcs — solid.
  const drawnPartners = new Set<string>();
  for (const c of cells) {
    if (!c.alive || !c.partnerId) continue;
    const pairKey = [c.agentId, c.partnerId].sort().join('|');
    if (drawnPartners.has(pairKey)) continue;
    const partner = byId.get(c.partnerId);
    if (!partner) continue;
    const pa = positions.get(c.agentId);
    const pb = positions.get(c.partnerId);
    if (!pa || !pb) continue;
    drawnPartners.add(pairKey);
    ctx.strokeStyle = sideColor;
    ctx.globalAlpha = 0.32;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    const midX = (pa.x + pb.x) / 2;
    const midY = (pa.y + pb.y) / 2;
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy);
    const bow = Math.min(14, len * 0.18);
    const nx = len > 0 ? -dy / len : 0;
    const ny = len > 0 ? dx / len : 0;
    ctx.quadraticCurveTo(midX + nx * bow, midY + ny * bow, pb.x, pb.y);
    ctx.stroke();
  }

  // Parent→child arcs — dashed teal.
  ctx.strokeStyle = 'rgba(78, 205, 196, 0.55)';
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 0.8;
  ctx.setLineDash([3, 3]);
  for (const c of cells) {
    if (!c.alive || !c.childrenIds || c.childrenIds.length === 0) continue;
    const pa = positions.get(c.agentId);
    if (!pa) continue;
    for (const childId of c.childrenIds) {
      const pb = positions.get(childId);
      if (!pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  ctx.restore();
}
