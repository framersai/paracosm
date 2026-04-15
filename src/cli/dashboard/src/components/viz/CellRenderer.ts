import type { HexGrid, HexCell } from './ForceLayout';
import { DEPARTMENT_COLORS, DEFAULT_DEPT_COLOR, RANK_SIZES } from './viz-types';

/**
 * Draw a pointy-top hexagon path centered at (0,0) with radius 1.
 */
function drawHex(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const method = i === 0 ? 'moveTo' : 'lineTo';
    ctx[method](Math.cos(angle) * size, Math.sin(angle) * size);
  }
  ctx.closePath();
}

export interface RenderOptions {
  focusedId: string | null;
  hoveredId: string | null;
}

/**
 * Render the hex grid cellular automata.
 * - Empty cells: faint hex outline in department color
 * - Occupied cells: filled hex colored by department, brightness by psychScore
 * - Mars-born: inner circle marker
 * - Hovered: name label drawn beside cell
 * - Focused: bright outline ring
 */
export function renderHexGrid(
  ctx: CanvasRenderingContext2D,
  grid: HexGrid,
  width: number,
  height: number,
  opts: RenderOptions,
): void {
  ctx.clearRect(0, 0, width, height);

  const size = grid.cellSize;
  const focused = opts.focusedId;
  const hovered = opts.hoveredId;

  // Pass 1: empty cells (faint outlines)
  for (const cell of grid.cells) {
    if (cell.occupant) continue;
    if (!cell.department) continue;

    const color = DEPARTMENT_COLORS[cell.department] || DEFAULT_DEPT_COLOR;
    ctx.save();
    ctx.translate(cell.px, cell.py);
    drawHex(ctx, size * 0.9);
    ctx.strokeStyle = color + '12';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();
  }

  // Pass 2: occupied cells
  for (const cell of grid.cells) {
    if (!cell.occupant) continue;
    const occ = cell.occupant;
    const color = DEPARTMENT_COLORS[occ.department] || DEFAULT_DEPT_COLOR;
    const isDimmed = focused && occ.agentId !== focused;
    const isHovered = occ.agentId === hovered;
    const isFocused = occ.agentId === focused;

    // Scale by rank
    const rankScale = (RANK_SIZES[occ.rank] || 8) / 10;
    const cellSize = size * 0.85 * rankScale;

    // Alpha from psychScore
    const alpha = isDimmed ? 0.15 : 0.4 + occ.psychScore * 0.6;

    ctx.save();
    ctx.translate(cell.px, cell.py);

    // Glow for high psych
    if (!isDimmed && occ.psychScore > 0.5) {
      const glowR = cellSize * 2.5;
      const grad = ctx.createRadialGradient(0, 0, cellSize * 0.5, 0, 0, glowR);
      grad.addColorStop(0, color + '30');
      grad.addColorStop(1, color + '00');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, glowR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cell body (hex)
    ctx.globalAlpha = alpha;
    drawHex(ctx, cellSize);
    ctx.fillStyle = color;
    ctx.fill();

    // Mars-born: small inner dot
    if (occ.marsborn) {
      ctx.fillStyle = '#f5f0e4';
      ctx.globalAlpha = alpha * 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, cellSize * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }

    // Featured pulse
    if (occ.featured && !isDimmed) {
      ctx.globalAlpha = 0.4 + Math.sin(Date.now() / 400) * 0.2;
      drawHex(ctx, cellSize + 3);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Focus ring
    if (isFocused) {
      ctx.globalAlpha = 1;
      drawHex(ctx, cellSize + 4);
      ctx.strokeStyle = '#f5f0e4';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Hover: draw name label
    if (isHovered && !isDimmed) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#f5f0e4';
      ctx.font = '600 10px var(--mono, monospace)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(occ.name, cellSize + 6, 0);
      ctx.fillStyle = color;
      ctx.font = '500 8px var(--mono, monospace)';
      ctx.fillText(`${occ.department} · ${occ.rank}`, cellSize + 6, 11);
    }

    ctx.restore();
  }

  // Pass 3: connection lines between partners
  drawConnections(ctx, grid, focused);
}

function drawConnections(ctx: CanvasRenderingContext2D, grid: HexGrid, focusedId: string | null): void {
  const cellMap = new Map<string, HexCell>();
  for (const cell of grid.cells) {
    if (cell.occupant) cellMap.set(cell.occupant.agentId, cell);
  }

  for (const cell of grid.cells) {
    if (!cell.occupant || !cell.occupant.partnerId) continue;
    const partner = cellMap.get(cell.occupant.partnerId);
    if (!partner) continue;

    // Only draw once per pair (lower ID draws)
    if (cell.occupant.agentId > cell.occupant.partnerId) continue;

    const isFocused = focusedId === cell.occupant.agentId || focusedId === cell.occupant.partnerId;
    ctx.strokeStyle = isFocused ? '#e8b44a80' : '#e8b44a15';
    ctx.lineWidth = isFocused ? 1.5 : 0.5;
    ctx.beginPath();
    ctx.moveTo(cell.px, cell.py);
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
  const padR = 12;
  const padB = 12;
  const lineH = 14;
  const deptRows = departments.length;
  const extraRows = 4; // marsborn, earth-born, rank, mood
  const totalRows = deptRows + extraRows + 1; // +1 for header
  const legendW = 110;
  const legendH = totalRows * lineH + 12;
  const x0 = width - legendW - padR;
  const y0 = height - legendH - padB;

  // Background
  ctx.fillStyle = 'rgba(10, 8, 6, 0.75)';
  ctx.beginPath();
  ctx.roundRect(x0, y0, legendW, legendH, 4);
  ctx.fill();
  ctx.strokeStyle = '#2a252020';
  ctx.lineWidth = 1;
  ctx.stroke();

  let y = y0 + 10;
  ctx.font = '700 8px var(--mono, monospace)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#a89878';
  ctx.fillText('LEGEND', x0 + 8, y);
  y += lineH + 2;

  // Department colors
  ctx.font = '500 8px var(--mono, monospace)';
  for (const dept of departments) {
    const color = DEPARTMENT_COLORS[dept] || DEFAULT_DEPT_COLOR;
    ctx.fillStyle = color;
    drawHexSmall(ctx, x0 + 13, y, 4);
    ctx.fill();
    ctx.fillStyle = '#a89878';
    ctx.fillText(dept.toUpperCase(), x0 + 22, y);
    y += lineH;
  }

  y += 4;

  // Shape meanings
  ctx.fillStyle = '#686050';
  ctx.fillText('INNER DOT', x0 + 22, y);
  ctx.fillStyle = '#f5f0e4';
  ctx.beginPath();
  ctx.arc(x0 + 13, y, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#686050';
  ctx.fillText('= MARS-BORN', x0 + 22, y);
  y += lineH;

  ctx.fillText('SIZE = RANK', x0 + 8, y);
  y += lineH;

  ctx.fillText('GLOW = MOOD', x0 + 8, y);
  y += lineH;

  ctx.fillStyle = '#e8b44a30';
  ctx.beginPath();
  ctx.moveTo(x0 + 8, y);
  ctx.lineTo(x0 + 18, y);
  ctx.strokeStyle = '#e8b44a60';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#686050';
  ctx.fillText('= PARTNERS', x0 + 22, y);
}

function drawHexSmall(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const method = i === 0 ? 'moveTo' : 'lineTo';
    ctx[method](cx + Math.cos(angle) * size, cy + Math.sin(angle) * size);
  }
  ctx.closePath();
}
