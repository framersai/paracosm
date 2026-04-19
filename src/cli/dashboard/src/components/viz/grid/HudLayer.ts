import type { TurnSnapshot } from '../viz-types.js';

export interface HudOpts {
  leaderName: string;
  sideColor: string;
  /** Overlay canvas logical width/height for corner placement. */
  width: number;
  height: number;
  lagTurns?: number;
}

/** Cockpit-style corner readouts — replaces the ECOLOGY metric-cards. */
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

  ctx.textAlign = 'right';
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
