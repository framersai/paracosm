import type { TurnSnapshot } from './viz-types';

const OVERLAY_HEIGHT = 40;
const OVERLAY_PAD = 4;

/**
 * Draw sparkline metric overlays at the bottom of a colony canvas.
 * Population (line), morale (line), food reserves (area).
 */
export function renderMetricOverlay(
  ctx: CanvasRenderingContext2D,
  snapshots: TurnSnapshot[],
  currentTurn: number,
  width: number,
  height: number,
): void {
  if (snapshots.length < 2) return;

  const y0 = height - OVERLAY_HEIGHT;
  const plotW = width - OVERLAY_PAD * 2;
  const plotH = OVERLAY_HEIGHT - OVERLAY_PAD * 2;

  ctx.fillStyle = 'rgba(10, 8, 6, 0.5)';
  ctx.fillRect(0, y0, width, OVERLAY_HEIGHT);

  const visibleSnapshots = snapshots.slice(0, currentTurn + 1);
  if (visibleSnapshots.length < 2) return;

  const maxPop = Math.max(...visibleSnapshots.map(s => s.population), 1);
  const maxFood = Math.max(...visibleSnapshots.map(s => s.foodReserve), 1);

  // Food area (filled, green at 20% opacity)
  ctx.fillStyle = '#6aad4833';
  ctx.beginPath();
  ctx.moveTo(OVERLAY_PAD, y0 + OVERLAY_HEIGHT - OVERLAY_PAD);
  for (let i = 0; i < visibleSnapshots.length; i++) {
    const x = OVERLAY_PAD + (i / (snapshots.length - 1)) * plotW;
    const y = y0 + OVERLAY_PAD + (1 - visibleSnapshots[i].foodReserve / maxFood) * plotH;
    ctx.lineTo(x, y);
  }
  const lastFoodX = OVERLAY_PAD + ((visibleSnapshots.length - 1) / (snapshots.length - 1)) * plotW;
  ctx.lineTo(lastFoodX, y0 + OVERLAY_HEIGHT - OVERLAY_PAD);
  ctx.closePath();
  ctx.fill();

  // Population line
  drawLine(ctx, visibleSnapshots, snapshots.length, s => s.population / maxPop, plotW, plotH, y0, '#a89878');

  // Morale line
  drawLine(ctx, visibleSnapshots, snapshots.length, s => s.morale, plotW, plotH, y0, '#e8b44a');

  // Current turn marker
  const markerX = OVERLAY_PAD + (Math.min(currentTurn, visibleSnapshots.length - 1) / (snapshots.length - 1)) * plotW;
  ctx.strokeStyle = '#e0653080';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(markerX, y0);
  ctx.lineTo(markerX, y0 + OVERLAY_HEIGHT);
  ctx.stroke();
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  snapshots: TurnSnapshot[],
  totalTurns: number,
  getValue: (s: TurnSnapshot) => number,
  plotW: number,
  plotH: number,
  y0: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < snapshots.length; i++) {
    const x = OVERLAY_PAD + (i / (totalTurns - 1)) * plotW;
    const y = y0 + OVERLAY_PAD + (1 - getValue(snapshots[i])) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
