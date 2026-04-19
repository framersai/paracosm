import type { CellSnapshot, GridPosition } from '../viz-types.js';

/**
 * Hit-test a colonist glyph at (x, y) in overlay-canvas pixel space.
 * Iterates in reverse so featured/later-drawn glyphs win overlap ties.
 */
export function hitTestGlyph(
  cells: CellSnapshot[],
  positions: Map<string, GridPosition>,
  x: number,
  y: number,
): CellSnapshot | null {
  const slop = 6;
  for (let i = cells.length - 1; i >= 0; i--) {
    const c = cells[i];
    if (!c.alive) continue;
    const pos = positions.get(c.agentId);
    if (!pos) continue;
    const r = (c.featured ? 5 : 3) + slop;
    const dx = x - pos.x;
    const dy = y - pos.y;
    if (dx * dx + dy * dy <= r * r) return c;
  }
  return null;
}
