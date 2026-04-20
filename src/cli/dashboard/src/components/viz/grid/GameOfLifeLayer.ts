/**
 * @fileoverview Conway's Game of Life overlay — discrete cell grid
 * that evolves per frame using the classic B3/S23 rules. Seeded from
 * colonist positions on each turn change so the simulation state
 * determines the initial pattern; from there the CA runs
 * deterministically without random perturbation.
 *
 * Why deterministic matters: earlier iterations sprinkled 0.005
 * ambient-spawn per cell per frame to keep sparse panels "alive",
 * but this broke the Conway aesthetic — cells appeared randomly
 * and never formed the classic blinker / glider / still-life
 * patterns that Conway is known for. Users read it as "chaotic, not
 * cohesive, not comprehensible". Stripping all randomness restores
 * the recognizable oscillator / still-life / glider behaviour.
 *
 * Grid resolution: 32 × 16 cells at default — one tile per ~22 × 25px
 * of overlay canvas at typical laptop widths. Large enough that
 * Conway oscillators read as distinct tiles; small enough that a
 * few blinkers fill the panel with visible activity.
 *
 * Evolution cadence: paused when `tickGol` is not called, so the
 * render loop can freeze the pattern during scrub / complete states
 * without extra state machinery.
 *
 * @module paracosm/dashboard/viz/grid/GameOfLifeLayer
 */
import type { CellSnapshot, GridPosition } from '../viz-types.js';

export interface GolConfig {
  /** Cell grid width in cells. */
  cols: number;
  /** Cell grid height in cells. */
  rows: number;
  /**
   * Half-extent of the block seeded at each colonist position.
   * seedRadius=2 plants a 5×5 block (classic Conway "square" seed
   * that immediately decays into a stable 4-cell block + orbiting
   * debris — visually readable within the first few generations).
   */
  seedRadius: number;
}

export const DEFAULT_GOL_CONFIG: GolConfig = {
  cols: 32,
  rows: 16,
  seedRadius: 2,
};

/**
 * Classic Conway starter patterns seeded into the grid on turn
 * changes. Each pattern is a list of (x, y) offsets relative to a
 * chosen anchor. Gliders produce moving cells, blinkers produce
 * period-2 oscillators, beehives are still lifes. Mixing them keeps
 * the panel interesting across many generations without needing
 * random injection.
 */
const GLIDER: Array<[number, number]> = [
  [1, 0], [2, 1], [0, 2], [1, 2], [2, 2],
];
const BLINKER: Array<[number, number]> = [
  [0, 1], [1, 1], [2, 1],
];
const BLOCK: Array<[number, number]> = [
  [0, 0], [1, 0], [0, 1], [1, 1],
];
const R_PENTOMINO: Array<[number, number]> = [
  [1, 0], [2, 0], [0, 1], [1, 1], [1, 2],
];

const STARTER_PATTERNS = [GLIDER, BLINKER, BLOCK, R_PENTOMINO];

/**
 * Persistent state between frames — owned by the caller (normally a
 * React ref) so React remounts don't reset the evolving pattern.
 */
export interface GolState {
  cols: number;
  rows: number;
  /** Current cell grid, row-major. Uint8Array. 0 = dead. 1-8 = alive
   *  age (freshly born = 8, aging survivors count down to 1 for
   *  visual trail rendering; any age >= 1 counts as "alive" for
   *  Conway rule evaluation). */
  grid: Uint8Array;
  /** Scratch buffer for next-generation computation. */
  next: Uint8Array;
  /** Frame counter — call sites increment via tickGol. */
  frame: number;
}

/** Initialise a fresh GoL state sized to the grid. */
export function createGolState(cols: number, rows: number): GolState {
  return {
    cols,
    rows,
    grid: new Uint8Array(cols * rows),
    next: new Uint8Array(cols * rows),
    frame: 0,
  };
}

/** Reset the grid to all-dead. Useful on sim clear. */
export function clearGol(state: GolState): void {
  state.grid.fill(0);
  state.next.fill(0);
  state.frame = 0;
}

/**
 * Seed the grid from colonist positions using classic Conway starter
 * patterns. Each colonist plants a short pattern (glider / blinker /
 * block / R-pentomino) rotated by their agentId hash so adjacent
 * colonists don't all seed identical cells. This produces clean,
 * recognizable Conway motion instead of the randomized noise the
 * prior ambient-spawn implementation generated.
 *
 * Called by the render loop on turn changes — NOT every frame. Once
 * seeded, the pattern evolves via B3/S23 alone.
 */
export function seedFromColonists(
  state: GolState,
  cells: CellSnapshot[],
  positions: Map<string, GridPosition>,
  overlayWidth: number,
  overlayHeight: number,
): void {
  const { cols, rows, grid } = state;
  // Full reset before seeding so re-seed doesn't accumulate fossil
  // cells from previous turns. Classic Conway evolutions expect a
  // clean slate — layering old-turn patterns under new ones
  // produces the chaotic behaviour the user correctly called out.
  grid.fill(0);
  for (let i = 0; i < cells.length; i += 1) {
    const c = cells[i];
    if (!c.alive) continue;
    const p = positions.get(c.agentId);
    if (!p) continue;
    const cx = Math.floor((p.x / Math.max(1, overlayWidth)) * cols);
    const cy = Math.floor((p.y / Math.max(1, overlayHeight)) * rows);
    // Pick starter pattern deterministically from the agentId hash
    // so scrubbing to the same turn reproduces the same pattern.
    let hash = 0;
    for (let j = 0; j < c.agentId.length; j += 1) {
      hash = (hash * 31 + c.agentId.charCodeAt(j)) | 0;
    }
    const pattern = STARTER_PATTERNS[Math.abs(hash) % STARTER_PATTERNS.length];
    for (const [dx, dy] of pattern) {
      const x = cx + dx - 1;
      const y = cy + dy - 1;
      if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
      grid[y * cols + x] = 8;
    }
  }
}

/**
 * Advance one GoL generation using classic B3/S23 rules. No random
 * perturbation — the grid evolves deterministically from whatever
 * was seeded. This is what produces the recognizable Conway
 * oscillator / glider behaviour.
 *
 * The age field serves only rendering: survivors get age
 * `max(previous - 1, 4)` so long-running stable patterns stay
 * visibly bright rather than fading to gray; dead cells that were
 * recently alive keep a short trail via the age decay below.
 */
export function tickGol(state: GolState): void {
  const { cols, rows, grid, next } = state;
  next.fill(0);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
          if (grid[ny * cols + nx] > 0) neighbors += 1;
        }
      }
      const self = grid[y * cols + x];
      const alive = self > 0;
      const willLive = alive
        ? neighbors === 2 || neighbors === 3
        : neighbors === 3;
      if (willLive) {
        // Surviving cells stay bright (floor at 4 so long-lived
        // oscillators don't fade away); fresh births peak at 8.
        next[y * cols + x] = alive ? Math.max(4, self) : 8;
      } else if (alive && self > 1) {
        // Decaying trail: cells that WOULD die still render for a
        // few generations with declining age so the user can see
        // where a pattern just was. Fully dead at age 1.
        next[y * cols + x] = Math.max(0, self - 2);
      }
    }
  }
  grid.set(next);
  state.frame += 1;
}

/**
 * Render the grid as discrete cells onto the overlay canvas. Cells
 * draw as square pixels sized to the cols/rows density; age drives
 * alpha (newly born = bright, aging = progressively dimmer) giving
 * the signature "trail" look that reads as cellular-automaton
 * rather than static scatter.
 *
 * @param intensity 0..1 multiplier on the final alpha, so callers
 *   can dim the whole layer in modes where GoL is a background
 *   element (e.g. ECOLOGY with its metrics-strip-led layout).
 */
export function drawGol(
  ctx: CanvasRenderingContext2D,
  state: GolState,
  overlayWidth: number,
  overlayHeight: number,
  sideColor: string,
  intensity: number = 1,
): void {
  const { cols, rows, grid } = state;
  if (intensity <= 0) return;
  const cw = overlayWidth / cols;
  const ch = overlayHeight / rows;
  ctx.save();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const age = grid[y * cols + x];
      if (age === 0) continue;
      // Alpha peaks at 0.9 for fresh (age=8) and trails down to
      // ~0.1 for almost-dead (age=1). Intensity scales the whole
      // layer per mode.
      const alpha = Math.min(1, (age / 8) * 0.9 * intensity);
      ctx.fillStyle = sideColor;
      ctx.globalAlpha = alpha;
      ctx.fillRect(x * cw + 2, y * ch + 2, Math.max(1, cw - 4), Math.max(1, ch - 4));
    }
  }
  ctx.restore();
}
