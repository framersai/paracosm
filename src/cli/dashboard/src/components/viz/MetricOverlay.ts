import type { TurnSnapshot } from './viz-types';

const PANEL_W = 168;
const PANEL_H = 92;
const PAD = 10;

/**
 * Draw a corner panel with population/morale/food sparklines and deltas.
 * Anchored to top-left of the canvas. Sparklines are tiny but legible.
 */
export function renderMetricOverlay(
  ctx: CanvasRenderingContext2D,
  snapshots: TurnSnapshot[],
  currentTurn: number,
): void {
  if (snapshots.length === 0) return;

  const x0 = PAD;
  const y0 = PAD;

  // Panel background
  ctx.fillStyle = '#0a0806d0';
  ctx.beginPath();
  ctx.roundRect(x0, y0, PANEL_W, PANEL_H, 6);
  ctx.fill();
  ctx.strokeStyle = '#2a2520';
  ctx.lineWidth = 1;
  ctx.stroke();

  const visible = snapshots.slice(0, currentTurn + 1);
  const curr = visible[visible.length - 1];
  const prev = visible.length > 1 ? visible[visible.length - 2] : null;
  if (!curr) return;

  // Title
  ctx.font = '700 8px var(--mono, monospace)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8b44a';
  ctx.fillText(`T${curr.turn} · ${curr.year}`, x0 + 10, y0 + 12);

  // Three metric rows
  const rows = [
    { label: 'POP', current: curr.population, previous: prev?.population, color: '#a89878', getValue: (s: TurnSnapshot) => s.population },
    { label: 'MOR', current: Math.round(curr.morale * 100), previous: prev ? Math.round(prev.morale * 100) : undefined, color: '#e8b44a', getValue: (s: TurnSnapshot) => s.morale, suffix: '%' },
    { label: 'FOOD', current: +curr.foodReserve.toFixed(1), previous: prev ? +prev.foodReserve.toFixed(1) : undefined, color: '#6aad48', getValue: (s: TurnSnapshot) => s.foodReserve, suffix: 'mo' },
  ];

  let yRow = y0 + 28;
  for (const row of rows) {
    drawMetricRow(ctx, x0 + 10, yRow, PANEL_W - 20, row, visible);
    yRow += 18;
  }

  // Births/deaths chip line
  ctx.font = '600 8px var(--mono, monospace)';
  ctx.fillStyle = curr.births > 0 ? '#6aad48' : '#686050';
  ctx.fillText(`+${curr.births}`, x0 + 10, y0 + PANEL_H - 8);
  ctx.fillStyle = curr.deaths > 0 ? '#e06530' : '#686050';
  ctx.fillText(`-${curr.deaths}`, x0 + 38, y0 + PANEL_H - 8);
  ctx.fillStyle = '#686050';
  ctx.fillText('births / deaths', x0 + 60, y0 + PANEL_H - 8);
}

function drawMetricRow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  row: { label: string; current: number; previous?: number; color: string; getValue: (s: TurnSnapshot) => number; suffix?: string },
  series: TurnSnapshot[],
): void {
  // Label
  ctx.font = '700 8px var(--mono, monospace)';
  ctx.fillStyle = '#686050';
  ctx.fillText(row.label, x, y);

  // Sparkline
  const sparkX = x + 30;
  const sparkW = 60;
  const sparkH = 12;
  const values = series.map(row.getValue);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = Math.max(1, max - min);
  ctx.strokeStyle = row.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < values.length; i++) {
    const px = sparkX + (i / Math.max(1, values.length - 1)) * sparkW;
    const py = y + sparkH / 2 - ((values[i] - min) / range - 0.5) * sparkH;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Current value + delta
  const valueText = `${row.current}${row.suffix ?? ''}`;
  ctx.font = '700 9px var(--mono, monospace)';
  ctx.fillStyle = '#f5f0e4';
  ctx.fillText(valueText, sparkX + sparkW + 8, y);

  if (row.previous !== undefined && row.previous !== row.current) {
    const delta = row.current - row.previous;
    const deltaStr = delta > 0 ? `+${(+delta.toFixed(1))}` : `${(+delta.toFixed(1))}`;
    ctx.font = '600 8px var(--mono, monospace)';
    ctx.fillStyle = delta > 0 ? '#6aad48' : '#e06530';
    const valueWidth = ctx.measureText(valueText).width;
    ctx.fillText(deltaStr, sparkX + sparkW + 8 + valueWidth + 4, y);
  }
}
