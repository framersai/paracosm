import type { SquareGrid } from './ForceLayout';
import { DEPARTMENT_COLORS, DEFAULT_DEPT_COLOR } from './viz-types';

export interface RenderOptions {
  focusedId: string | null;
  hoveredId: string | null;
}

/**
 * Render the square grid in Conway's Game of Life style.
 *
 * - Empty cells: very faint outline (the "dead" cells)
 * - Occupied cells: filled square, color = department, brightness = psychScore
 * - Mars-born: small dot in center
 * - Hovered: name label beside cell
 * - Focused: bright border
 */
export function renderSquareGrid(
  ctx: CanvasRenderingContext2D,
  grid: SquareGrid,
  width: number,
  height: number,
  opts: RenderOptions,
): void {
  ctx.clearRect(0, 0, width, height);

  const size = grid.cellPx;
  const focused = opts.focusedId;
  const hovered = opts.hoveredId;

  // Pass 1: empty cells (faint grid)
  ctx.fillStyle = '#ffffff06';
  for (const cell of grid.cells) {
    if (cell.occupant) continue;
    ctx.fillRect(cell.px, cell.py, size, size);
  }

  // Pass 2: occupied cells
  for (const cell of grid.cells) {
    if (!cell.occupant) continue;
    const occ = cell.occupant;
    const color = DEPARTMENT_COLORS[occ.department] || DEFAULT_DEPT_COLOR;
    const isDimmed = focused && occ.agentId !== focused;
    const isHovered = occ.agentId === hovered;
    const isFocused = occ.agentId === focused;

    // Base alpha from psychScore
    const alpha = isDimmed ? 0.12 : 0.35 + occ.psychScore * 0.65;

    // Cell fill
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(cell.px, cell.py, size, size);

    // Glow for high psych (bright inner glow)
    if (!isDimmed && occ.psychScore > 0.6) {
      const glow = ctx.createRadialGradient(
        cell.px + size / 2, cell.py + size / 2, 0,
        cell.px + size / 2, cell.py + size / 2, size,
      );
      glow.addColorStop(0, color + '40');
      glow.addColorStop(1, color + '00');
      ctx.globalAlpha = occ.psychScore * 0.5;
      ctx.fillStyle = glow;
      ctx.fillRect(cell.px - size / 2, cell.py - size / 2, size * 2, size * 2);
    }

    // Mars-born: small center dot
    if (occ.marsborn) {
      ctx.globalAlpha = isDimmed ? 0.1 : 0.5;
      ctx.fillStyle = '#f5f0e4';
      const dotSize = Math.max(2, size * 0.2);
      ctx.beginPath();
      ctx.arc(cell.px + size / 2, cell.py + size / 2, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Featured: pulsing border
    if (occ.featured && !isDimmed) {
      const pulse = 0.5 + Math.sin(Date.now() / 400) * 0.3;
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cell.px - 1, cell.py - 1, size + 2, size + 2);
    }

    // Focus: bright white border
    if (isFocused) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#f5f0e4';
      ctx.lineWidth = 2;
      ctx.strokeRect(cell.px - 1, cell.py - 1, size + 2, size + 2);
    }

    // Hover: name label
    if (isHovered && !isDimmed) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#f5f0e4';
      ctx.font = `600 ${Math.max(9, size * 0.8)}px var(--mono, monospace)`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const labelX = cell.px + size + 4;
      const labelY = cell.py + size / 2;
      // Background for readability
      const name = occ.name;
      const metrics = ctx.measureText(name);
      ctx.fillStyle = '#0a0806cc';
      ctx.fillRect(labelX - 2, labelY - 7, metrics.width + 4, 14);
      ctx.fillStyle = '#f5f0e4';
      ctx.fillText(name, labelX, labelY);
    }

    ctx.globalAlpha = 1;
  }

  // Pass 3: partner connection lines (subtle)
  drawConnections(ctx, grid, focused);
}

function drawConnections(ctx: CanvasRenderingContext2D, grid: SquareGrid, focusedId: string | null): void {
  const size = grid.cellPx;
  const cellMap = new Map<string, { px: number; py: number }>();
  for (const cell of grid.cells) {
    if (cell.occupant) cellMap.set(cell.occupant.agentId, { px: cell.px + size / 2, py: cell.py + size / 2 });
  }

  for (const cell of grid.cells) {
    if (!cell.occupant || !cell.occupant.partnerId) continue;
    const partner = cellMap.get(cell.occupant.partnerId);
    if (!partner) continue;
    if (cell.occupant.agentId > cell.occupant.partnerId) continue; // draw once per pair

    const isFocused = focusedId === cell.occupant.agentId || focusedId === cell.occupant.partnerId;
    ctx.strokeStyle = isFocused ? '#e8b44a60' : '#e8b44a10';
    ctx.lineWidth = isFocused ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(cell.px + size / 2, cell.py + size / 2);
    ctx.lineTo(partner.px, partner.py);
    ctx.stroke();
  }
}

/**
 * Draw legend in bottom-right corner.
 */
export function drawLegend(
  ctx: CanvasRenderingContext2D,
  departments: string[],
  width: number,
  height: number,
): void {
  const padR = 10;
  const padB = 10;
  const lineH = 13;
  const legendW = 100;
  const totalRows = departments.length + 4;
  const legendH = totalRows * lineH + 14;
  const x0 = width - legendW - padR;
  const y0 = height - legendH - padB;

  // Background
  ctx.fillStyle = '#0a0806e0';
  ctx.beginPath();
  ctx.roundRect(x0, y0, legendW, legendH, 4);
  ctx.fill();

  let y = y0 + 11;
  ctx.font = '700 7px var(--mono, monospace)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#a89878';
  ctx.fillText('LEGEND', x0 + 8, y);
  y += lineH + 2;

  // Department colors
  ctx.font = '500 7px var(--mono, monospace)';
  for (const dept of departments) {
    const color = DEPARTMENT_COLORS[dept] || DEFAULT_DEPT_COLOR;
    ctx.fillStyle = color;
    ctx.fillRect(x0 + 8, y - 3, 6, 6);
    ctx.fillStyle = '#a89878';
    ctx.fillText(dept.toUpperCase(), x0 + 18, y);
    y += lineH;
  }

  y += 3;
  ctx.fillStyle = '#686050';
  ctx.font = '500 7px var(--mono, monospace)';
  ctx.fillText('DOT = MARS-BORN', x0 + 8, y); y += lineH;
  ctx.fillText('BRIGHT = HIGH MOOD', x0 + 8, y); y += lineH;
  ctx.fillText('DIM = LOW MOOD', x0 + 8, y); y += lineH;
  ctx.fillText('LINE = PARTNERS', x0 + 8, y);
}
