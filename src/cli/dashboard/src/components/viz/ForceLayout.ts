import type { CellSnapshot } from './viz-types';
import { RANK_SIZES } from './viz-types';

/**
 * Hex grid cellular automata layout.
 * Each colonist occupies a discrete hex cell. No physics. No movement.
 * Growth patterns emerge from births filling adjacent cells.
 */

export interface HexCell {
  /** Grid column */
  col: number;
  /** Grid row */
  row: number;
  /** Pixel center x */
  px: number;
  /** Pixel center y */
  py: number;
  /** Colonist occupying this cell, or null if empty */
  occupant: CellSnapshot | null;
  /** Department of occupant (for coloring empty neighbor cells faintly) */
  department: string | null;
}

export interface HexGrid {
  cells: HexCell[];
  cellSize: number;
  cols: number;
  rows: number;
}

/**
 * Compute hex cell pixel position from grid coordinates.
 * Odd rows are offset right by half a cell (pointy-top hex grid).
 */
function hexToPixel(col: number, row: number, size: number, offsetX: number, offsetY: number): { x: number; y: number } {
  const w = size * 2;
  const h = Math.sqrt(3) * size;
  const x = offsetX + col * w * 0.75;
  const y = offsetY + row * h + (col % 2 === 1 ? h / 2 : 0);
  return { x, y };
}

/**
 * Build a hex grid that fills the canvas, then place colonists into cells.
 *
 * Colonists are grouped by department. Each department fills a contiguous
 * region of the grid. The grid is divided into horizontal bands, one per
 * department, and colonists fill cells left-to-right within their band.
 * Empty cells remain as dim outlines, creating the CA visual pattern.
 */
export function buildHexGrid(
  cells: CellSnapshot[],
  width: number,
  height: number,
): HexGrid {
  // Cell size adapts to canvas and population
  const totalAlive = cells.filter(c => c.alive).length;
  const cellSize = Math.max(5, Math.min(10, Math.sqrt((width * height) / Math.max(totalAlive * 8, 100))));

  const hexW = cellSize * 2;
  const hexH = Math.sqrt(3) * cellSize;
  const cols = Math.floor((width - cellSize) / (hexW * 0.75)) + 1;
  const rows = Math.floor((height - cellSize) / hexH);

  const padX = (width - (cols - 1) * hexW * 0.75) / 2;
  const padY = (height - rows * hexH) / 2;

  // Build empty grid
  const grid: HexCell[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const { x, y } = hexToPixel(c, r, cellSize, padX + cellSize, padY + cellSize);
      grid.push({ col: c, row: r, px: x, py: y, occupant: null, department: null });
    }
  }

  // Group alive colonists by department
  const departments = [...new Set(cells.filter(c => c.alive).map(c => c.department))];
  const byDept: Record<string, CellSnapshot[]> = {};
  for (const c of cells) {
    if (!c.alive) continue;
    if (!byDept[c.department]) byDept[c.department] = [];
    byDept[c.department].push(c);
  }

  // Assign department bands: divide grid rows among departments
  const deptCount = departments.length || 1;
  const rowsPerDept = Math.floor(rows / deptCount);

  let placed = 0;
  for (let di = 0; di < departments.length; di++) {
    const dept = departments[di];
    const deptCells = byDept[dept] || [];
    const startRow = di * rowsPerDept;
    const endRow = di === departments.length - 1 ? rows : (di + 1) * rowsPerDept;

    // Sort colonists: chiefs first (larger), then by rank
    const rankOrder: Record<string, number> = { chief: 0, lead: 1, senior: 2, junior: 3 };
    deptCells.sort((a, b) => (rankOrder[a.rank] ?? 3) - (rankOrder[b.rank] ?? 3));

    let ci = 0;
    for (let r = startRow; r < endRow && ci < deptCells.length; r++) {
      for (let c = 0; c < cols && ci < deptCells.length; c++) {
        const idx = c * rows + r; // column-major to fill within band
        if (idx < grid.length) {
          grid[idx].occupant = deptCells[ci];
          grid[idx].department = dept;
          ci++;
          placed++;
        }
      }
    }

    // Mark remaining cells in band as belonging to department (for dim outlines)
    for (let r = startRow; r < endRow; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = c * rows + r;
        if (idx < grid.length && !grid[idx].department) {
          grid[idx].department = dept;
        }
      }
    }
  }

  return { cells: grid, cellSize, cols, rows };
}

/**
 * Hit-test: find which hex cell is under the given pixel point.
 * Returns the occupant's agentId or null.
 */
export function hexHitTest(grid: HexGrid, x: number, y: number): string | null {
  const threshold = grid.cellSize * 1.2;
  for (const cell of grid.cells) {
    if (!cell.occupant) continue;
    const dx = cell.px - x;
    const dy = cell.py - y;
    if (dx * dx + dy * dy < threshold * threshold) {
      return cell.occupant.agentId;
    }
  }
  return null;
}
