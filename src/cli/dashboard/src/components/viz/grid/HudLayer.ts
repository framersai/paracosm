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
  /** Previous snapshot for population + morale deltas. */
  previousSnapshot?: TurnSnapshot | undefined;
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
  // near each cluster's centroid. Labels that would overlap horizontally
  // get bumped vertically in small increments so nothing stacks unread.
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

    // Build placed labels with their ideal anchor, then resolve
    // collisions by shifting labels vertically until their rects don't
    // overlap any already-placed label (within the container).
    type Placed = { dept: string; cx: number; y: number; w: number; h: number; label: string };
    const pending: Array<Omit<Placed, 'y'> & { idealY: number }> = [];
    for (const [dept, slot] of byDept.entries()) {
      if (slot.xs.length === 0) continue;
      const cx = slot.xs.reduce((a, b) => a + b, 0) / slot.xs.length;
      const minY = Math.min(...slot.ys);
      const idealY = Math.max(14, minY - 14);
      const label = `${dept.toUpperCase()} ${slot.xs.length}`;
      const metrics = ctx.measureText(label);
      const padX = 4;
      pending.push({
        dept,
        cx,
        w: metrics.width + padX * 2,
        h: 14,
        label,
        idealY,
      });
    }
    pending.sort((a, b) => a.idealY - b.idealY);
    const placed: Placed[] = [];
    const overlaps = (a: { cx: number; w: number; y: number; h: number }, b: Placed): boolean => {
      return (
        Math.abs(a.cx - b.cx) < (a.w + b.w) / 2 + 2 &&
        Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 2
      );
    };
    for (const p of pending) {
      let y = p.idealY;
      // Try pushing up first, then down, in 16px steps.
      for (let step = 0; step < 10; step++) {
        const up = p.idealY - step * 16;
        const down = p.idealY + step * 16;
        const candY = step === 0 ? p.idealY : up >= 10 ? up : down;
        const collided = placed.some(other =>
          overlaps({ cx: p.cx, w: p.w, y: candY, h: p.h }, other),
        );
        if (!collided) {
          y = candY;
          break;
        }
      }
      placed.push({ ...p, y });
    }
    for (const p of placed) {
      ctx.fillStyle = 'rgba(10, 8, 6, 0.85)';
      ctx.fillRect(p.cx - p.w / 2, p.y - p.h / 2, p.w, p.h);
      ctx.strokeStyle = deptColor(p.dept);
      ctx.lineWidth = 1;
      ctx.strokeRect(p.cx - p.w / 2 + 0.5, p.y - p.h / 2 + 0.5, p.w - 1, p.h - 1);
      ctx.fillStyle = deptColor(p.dept);
      ctx.fillText(p.label, p.cx, p.y);
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
  const popDelta = opts.previousSnapshot
    ? snapshot.population - opts.previousSnapshot.population
    : 0;
  const popTrend =
    popDelta > 0 ? '\u2191' : popDelta < 0 ? '\u2193' : '';
  const popTrendColor =
    popDelta > 0
      ? 'rgba(106, 173, 72, 0.95)'
      : popDelta < 0
      ? 'rgba(196, 74, 30, 0.95)'
      : 'rgba(216, 204, 176, 0.75)';
  ctx.fillText(`POP ${snapshot.population}`, 10, opts.height - 20);
  if (popTrend) {
    // Trend arrow rendered separately so it takes the delta color.
    const popText = `POP ${snapshot.population}`;
    const offset = ctx.measureText(popText).width + 6;
    ctx.fillStyle = popTrendColor;
    ctx.fillText(`${popTrend}${Math.abs(popDelta)}`, 10 + offset, opts.height - 20);
    ctx.fillStyle = opts.sideColor;
  }
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
