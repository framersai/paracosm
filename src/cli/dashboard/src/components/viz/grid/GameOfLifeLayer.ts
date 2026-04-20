/**
 * @fileoverview Conway's Game of Life overlay — discrete cell grid
 * that evolves per frame using the classic B3/S23 rules. Seeded from
 * colonist positions + event flares so the simulation state drives
 * the automaton pattern instead of running independently.
 *
 * Why this exists: user feedback that the Gray-Scott reaction-diffusion
 * field (continuous) didn't feel like "cellular automata / Game of
 * Life" — the RD field is mathematically a CA but reads as a smooth
 * fluid rather than discrete cells. Adding a true discrete-cell layer
 * on top gives the signature Conway blinker/glider/oscillator look
 * layered over the RD biome.
 *
 * Grid resolution: 48 × 24 cells at default, one "pixel" per ~16px of
 * overlay canvas. Small enough that interesting Conway patterns
 * (blinkers, r-pentominos, gliders) are perceivable; large enough that
 * the pattern doesn't look like stretched artifacts.
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
   * Seed density when injecting a colonist — 1 is single-cell,
   * 3 gives a 3×3 block (classic Conway seed). 2 is a good middle
   * ground: 4-cell blocks that produce blinkers / still lifes.
   */
  seedRadius: number;
  /**
   * Probability per frame that each non-colonist cell stays alive
   * even when GoL rules would kill it. Tiny bleed keeps the pattern
   * from fully dying out in sparse-population scenarios (3 colonists
   * per side otherwise extinguishes within ~50 frames).
   */
  ambientAlive: number;
}

export const DEFAULT_GOL_CONFIG: GolConfig = {
  // 32×16 reads clearly at ~700×400 overlay sizes — ~22×25px cells.
  // Larger than the prior 48×24 so each Conway cell lands as a
  // visibly discrete tile rather than a barely-perceptible speck.
  cols: 32,
  rows: 16,
  seedRadius: 2,
  // Higher ambient spawn so sparse panels always have visible Conway
  // activity even between re-seeds. 0.005/cell/frame produces ~2-3
  // new cells per frame on a 32×16 grid — readable motion without
  // flooding.
  ambientAlive: 0.005,
};

/**
 * Persistent state between frames — owned by the caller (normally a
 * React ref) so React remounts don't reset the evolving pattern.
 */
export interface GolState {
  cols: number;
  rows: number;
  /** Current cell grid, row-major. Uint8Array with 0 = dead, 1+ = alive
   *  age (older cells fade dimmer → pattern history visible). */
  grid: Uint8Array;
  /** Scratch buffer for next-generation computation. */
  next: Uint8Array;
  /** Frame counter used to throttle evolution below 60fps. */
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

/**
 * Seed the grid from colonist positions. Each alive colonist "plants"
 * a small live cluster at its grid-space position, plus one cell per
 * event flare to represent active disturbances. Run once per snapshot
 * change, not every frame.
 */
export function seedFromColonists(
  state: GolState,
  cells: CellSnapshot[],
  positions: Map<string, GridPosition>,
  overlayWidth: number,
  overlayHeight: number,
  config: GolConfig = DEFAULT_GOL_CONFIG,
): void {
  const { cols, rows, grid } = state;
  for (const c of cells) {
    if (!c.alive) continue;
    const p = positions.get(c.agentId);
    if (!p) continue;
    const cx = Math.floor((p.x / Math.max(1, overlayWidth)) * cols);
    const cy = Math.floor((p.y / Math.max(1, overlayHeight)) * rows);
    const r = config.seedRadius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
        // Age 1 means "freshly seeded" — fades to 0 (dead) over ~8
        // generations via the tick logic below. Gives the pattern a
        // visible trail of where colonists influenced the grid.
        grid[y * cols + x] = 8;
      }
    }
  }
}

/**
 * Advance one GoL generation using classic B3/S23 rules with an age
 * decay for visibility tailing. Called once per N frames; N=2 or 3
 * keeps the pattern evolving fast enough to feel alive without
 * burning CPU on a 60fps canvas.
 */
export function tickGol(state: GolState, config: GolConfig = DEFAULT_GOL_CONFIG): void {
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
      // Classic Conway rules on the binary alive/dead state.
      const alive = self > 0;
      const willLive = alive
        ? neighbors === 2 || neighbors === 3
        : neighbors === 3;
      if (willLive) {
        // Fresh birth = age 8. Survived = age-1 with floor at 1 so
        // the aging trail actually decays — otherwise long-running
        // oscillators stay eternally bright.
        next[y * cols + x] = alive ? Math.max(1, self - 1) : 8;
      } else if (Math.random() < config.ambientAlive) {
        // Tiny ambient spawn so a near-dead grid in a sparse-
        // population demo still has something happening.
        next[y * cols + x] = 8;
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
  // Render each live cell as a bright filled square with a glowing
  // inner highlight. 2px gap between cells gives the classic Conway
  // tile grid look rather than a continuous blob. Fresh cells (age=8)
  // fill at near-full opacity; aging cells (age=1..7) fade linearly
  // so the pattern leaves a visible trail of recent life history.
  ctx.save();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const age = grid[y * cols + x];
      if (age === 0) continue;
      // Alpha ramps from 0.35 (aging) to 0.95 (fresh birth). Prior
      // scaling at 0.55 peak rendered the overlay as barely-visible
      // shadows; bumping hard so Conway cells actually read as
      // Conway cells.
      const alpha = Math.min(1, (age / 8) * 0.95 * intensity);
      ctx.fillStyle = sideColor;
      ctx.globalAlpha = alpha;
      ctx.fillRect(x * cw + 2, y * ch + 2, Math.max(1, cw - 4), Math.max(1, ch - 4));
    }
  }
  ctx.restore();
}
