import type { CellSnapshot } from './viz-types';

/**
 * Conway's Game of Life style square grid.
 * Fixed grid of square cells. Alive colonists fill cells.
 * Empty cells are dark. Department color determines cell color.
 * Growth patterns emerge naturally from placement: births fill
 * adjacent empty cells near parents. Deaths leave gaps.
 */

export interface GridCell {
  /** Grid column */
  col: number;
  /** Grid row */
  row: number;
  /** Pixel top-left x */
  px: number;
  /** Pixel top-left y */
  py: number;
  /** Colonist occupying this cell, or null if empty */
  occupant: CellSnapshot | null;
}

export interface SquareGrid {
  cells: GridCell[];
  cellPx: number;
  gap: number;
  cols: number;
  rows: number;
  totalW: number;
  totalH: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Build a square grid and place colonists into cells.
 *
 * Colonists are grouped by department. Each department fills a contiguous
 * rectangular block. Blocks are arranged left-to-right, top-to-bottom.
 * Within each block, colonists fill row by row. Empty cells in the block
 * stay as dark squares, creating the CA visual: occupied = alive, empty = dead.
 */
export function buildSquareGrid(
  cells: CellSnapshot[],
  width: number,
  height: number,
): SquareGrid {
  const alive = cells.filter(c => c.alive);
  const total = alive.length;

  // Cell size: fit the grid into the canvas with some padding
  // Target ~60-80% fill so empty cells are visible
  const targetCells = Math.max(total * 1.4, 64);
  const aspect = width / height;
  const cols = Math.max(8, Math.round(Math.sqrt(targetCells * aspect)));
  const rows = Math.max(6, Math.ceil(targetCells / cols));

  const gap = 1;
  const cellPx = Math.floor(Math.min(
    (width - 20) / cols - gap,
    (height - 20) / rows - gap,
  ));
  const clampedCell = Math.max(4, Math.min(16, cellPx));

  const totalW = cols * (clampedCell + gap) - gap;
  const totalH = rows * (clampedCell + gap) - gap;
  const offsetX = Math.floor((width - totalW) / 2);
  const offsetY = Math.floor((height - totalH) / 2);

  // Build empty grid
  const grid: GridCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      grid.push({
        col: c,
        row: r,
        px: offsetX + c * (clampedCell + gap),
        py: offsetY + r * (clampedCell + gap),
        occupant: null,
      });
    }
  }

  // Group alive colonists by department
  const departments = [...new Set(alive.map(c => c.department))];
  const byDept: Record<string, CellSnapshot[]> = {};
  for (const c of alive) {
    if (!byDept[c.department]) byDept[c.department] = [];
    byDept[c.department].push(c);
  }

  // Sort departments by size (largest first) for better visual weight
  departments.sort((a, b) => (byDept[b]?.length || 0) - (byDept[a]?.length || 0));

  // Place each department as a contiguous block.
  // Fill row by row, starting from the current cursor position.
  // Leave gaps between departments for visual separation.
  let cursor = 0;
  for (const dept of departments) {
    const deptCells = byDept[dept] || [];

    // Sort within department: chiefs first, then leads, seniors, juniors
    const rankOrder: Record<string, number> = { chief: 0, lead: 1, senior: 2, junior: 3 };
    deptCells.sort((a, b) => (rankOrder[a.rank] ?? 3) - (rankOrder[b.rank] ?? 3));

    for (const colonist of deptCells) {
      if (cursor < grid.length) {
        grid[cursor].occupant = colonist;
        cursor++;
      }
    }

    // Add a small gap after each department (skip 2-3 cells)
    // but only if we're not at the end
    const gapSize = Math.max(1, Math.floor(cols * 0.15));
    cursor += gapSize;
    // Snap to next row start if close to end of row
    const colPos = cursor % cols;
    if (colPos > 0 && colPos < 3) cursor += (cols - colPos);
  }

  return { cells: grid, cellPx: clampedCell, gap, cols, rows, totalW, totalH, offsetX, offsetY };
}

/**
 * Hit-test: find which grid cell is under the given pixel point.
 * Returns the occupant's agentId or null.
 */
export function gridHitTest(grid: SquareGrid, x: number, y: number): string | null {
  const size = grid.cellPx;
  for (const cell of grid.cells) {
    if (!cell.occupant) continue;
    if (x >= cell.px && x < cell.px + size && y >= cell.py && y < cell.py + size) {
      return cell.occupant.agentId;
    }
  }
  return null;
}
