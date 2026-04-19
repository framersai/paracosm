import type { TurnSnapshot, GridPosition, CellSnapshot } from '../viz-types.js';

export interface HudOpts {
  leaderName: string;
  sideColor: string;
  /** Overlay canvas logical width/height for corner placement. */
  width: number;
  height: number;
  lagTurns?: number;
  /** Alive colonists, used to label dept clusters. */
  cells?: CellSnapshot[];
  /** Grid positions keyed by agentId. Required for dept labels. */
  positions?: Map<string, GridPosition>;
}

const DEPT_COLORS: Record<string, string> = {
  medical: 'rgba(78, 205, 196, 0.9)',
  engineering: 'rgba(232, 180, 74, 0.9)',
  agriculture: 'rgba(106, 173, 72, 0.9)',
  psychology: 'rgba(155, 107, 158, 0.9)',
  governance: 'rgba(224, 101, 48, 0.9)',
  research: 'rgba(149, 107, 216, 0.9)',
  science: 'rgba(149, 107, 216, 0.9)',
  ops: 'rgba(200, 122, 58, 0.9)',
  operations: 'rgba(200, 122, 58, 0.9)',
};

function deptColor(dept: string): string {
  const key = (dept || '').toLowerCase();
  return DEPT_COLORS[key] ?? 'rgba(168, 152, 120, 0.9)';
}

/** Cockpit-style corner readouts + dept cluster labels overlaid on
 *  the grid. The comprehensive metrics live in a DOM strip above the
 *  canvas (see GridMetricsStrip); this in-canvas layer adds short
 *  corner stats + dept labels that anchor to the colonist clusters
 *  so the field reads as a map, not an abstract blob. */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  snapshot: TurnSnapshot | undefined,
  opts: HudOpts,
): void {
  ctx.save();
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillStyle = opts.sideColor;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(opts.leaderName.toUpperCase(), 10, 10);
  ctx.fillStyle = 'rgba(216, 204, 176, 0.75)';
  ctx.fillText(`T${snapshot?.turn ?? 0}`, 10, 24);

  if (!snapshot) {
    ctx.restore();
    return;
  }

  // Dept cluster labels — computed from the live positions, rendered
  // near each cluster's centroid so colonist blobs stop reading as
  // unlabeled noise. Matches legacy tile-grid DeptBand section titles.
  if (opts.cells && opts.positions && opts.cells.length > 0) {
    const byDept = new Map<string, { xs: number[]; ys: number[] }>();
    for (const c of opts.cells) {
      if (!c.alive) continue;
      const p = opts.positions.get(c.agentId);
      if (!p) continue;
      const dept = (c.department || 'unknown').toLowerCase();
      const slot = byDept.get(dept) ?? { xs: [], ys: [] };
      slot.xs.push(p.x);
      slot.ys.push(p.y);
      byDept.set(dept, slot);
    }
    ctx.font = 'bold 9px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    for (const [dept, slot] of byDept.entries()) {
      if (slot.xs.length === 0) continue;
      const cx = slot.xs.reduce((a, b) => a + b, 0) / slot.xs.length;
      const minY = Math.min(...slot.ys);
      const labelY = Math.max(14, minY - 14);
      const label = `${dept.toUpperCase()} ${slot.xs.length}`;
      const metrics = ctx.measureText(label);
      const padX = 4;
      const boxW = metrics.width + padX * 2;
      const boxH = 14;
      ctx.fillStyle = 'rgba(10, 8, 6, 0.85)';
      ctx.fillRect(cx - boxW / 2, labelY - boxH / 2, boxW, boxH);
      ctx.strokeStyle = deptColor(dept);
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - boxW / 2 + 0.5, labelY - boxH / 2 + 0.5, boxW - 1, boxH - 1);
      ctx.fillStyle = deptColor(dept);
      ctx.fillText(label, cx, labelY);
    }
  }

  // Corner readouts.
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  const morale = Math.round(snapshot.morale * 100);
  ctx.fillStyle =
    morale >= 50
      ? 'rgba(106, 173, 72, 0.9)'
      : morale >= 25
      ? 'rgba(232, 180, 74, 0.9)'
      : 'rgba(196, 74, 30, 0.9)';
  ctx.fillText(`MORALE ${morale}%`, opts.width - 10, 10);
  ctx.fillStyle = 'rgba(216, 204, 176, 0.75)';
  ctx.fillText(`FOOD ${snapshot.foodReserve.toFixed(1)}mo`, opts.width - 10, 24);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = opts.sideColor;
  ctx.fillText(`POP ${snapshot.population}`, 10, opts.height - 20);
  if (snapshot.deaths > 0 || snapshot.births > 0) {
    ctx.fillStyle = 'rgba(216, 204, 176, 0.65)';
    ctx.fillText(`+${snapshot.births} -${snapshot.deaths}`, 10, opts.height - 8);
  }

  if (opts.lagTurns && opts.lagTurns > 0) {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(232, 180, 74, 0.75)';
    ctx.fillText(`lagging ${opts.lagTurns}`, opts.width - 10, opts.height - 8);
  }

  ctx.restore();
}
