import type { CellSnapshot, GridPosition } from '../viz-types.js';

interface LinesOpts {
  /** AgentId whose relationships should render at full brightness for
   *  a brief flare after click. Others stay at baseline alpha. */
  flareAgentId?: string | null;
  /** 0..1 flare intensity; decays per-tick at the render site. */
  flareIntensity?: number;
}

/**
 * Partner + parent-child connection arcs. Partner lines use a solid
 * side-color stroke; child lines a thinner dashed teal. Drawn under
 * the glyphs so markers stay visible on top. When a `flareAgentId` is
 * supplied, arcs touching that colonist brighten dramatically and gain
 * a thicker stroke — reads as "their relationships, highlighted."
 */
export function drawLines(
  ctx: CanvasRenderingContext2D,
  cells: CellSnapshot[],
  positions: Map<string, GridPosition>,
  sideColor: string,
  opts: LinesOpts = {},
): void {
  const byId = new Map<string, CellSnapshot>();
  for (const c of cells) if (c.alive) byId.set(c.agentId, c);
  const flareId = opts.flareAgentId ?? null;
  const flareT = Math.max(0, Math.min(1, opts.flareIntensity ?? 0));

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
    const touchesFlare =
      flareId !== null && (c.agentId === flareId || c.partnerId === flareId);
    ctx.strokeStyle = sideColor;
    ctx.globalAlpha = touchesFlare ? 0.32 + 0.5 * flareT : 0.32;
    ctx.lineWidth = touchesFlare ? 1 + 1.4 * flareT : 1;
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

  // Parent→child arcs — dashed teal, flared variants render on top solid.
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
      const touchesFlare = flareId !== null && (c.agentId === flareId || childId === flareId);
      ctx.save();
      ctx.globalAlpha = touchesFlare ? 0.5 + 0.45 * flareT : 0.5;
      ctx.lineWidth = touchesFlare ? 0.8 + 1.4 * flareT : 0.8;
      if (touchesFlare && flareT > 0.15) ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.setLineDash([]);

  ctx.restore();
}
