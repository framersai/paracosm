import type { TurnSnapshot } from '../../viz-types.js';
import {
  blendRgb,
  hashString,
  moodRgb,
  mulberry32,
  rgba,
} from '../shared.js';

/**
 * Mood Automaton — Conway's Game of Life over a dense hex grid,
 * seeded and perturbed by the sim.
 *
 * Each turn advances the automaton one generation (alive cells with
 * 2-3 alive neighbors survive, dead cells with exactly 3 alive
 * neighbors birth, everything else dies). Cells carry a mood color
 * inherited from their neighbors at birth, so as the pattern grows
 * and collapses across turns it paints the colony's emotional
 * trajectory on the grid.
 *
 * Sim-driven perturbations fire on every turn advance:
 * - Each alive colonist drops a seed pattern (random 3-cell blinker
 *   or glider) in a position indexed by their agentId hash, so the
 *   board never empties entirely even after a massive die-off.
 * - Event categories detonate splash patterns around a random seed
 *   cell (1-ring for low intensity, 2-ring burst for flashbulb
 *   intensity > 0.8).
 * - Deaths wipe a small cluster of cells around a death seed.
 * - Mood color of new births = average of live neighbors, so
 *   expanding patterns carry the colony's dominant mood outward.
 *
 * Between turns the grid holds — a gentle pulse animates the live
 * cells to signal the automaton is awake, but state doesn't shift
 * until the next turn_done event lands. That matches the user's
 * ask: each turn grows the pattern, not a continuous drift.
 */

interface HexCoord { q: number; r: number }

export interface MoodCell {
  gridIndex: number;
  q: number;
  r: number;
  x: number;
  y: number;
  /** Core automaton state. */
  alive: boolean;
  /** Mood RGB — carried by alive cells; dead cells fade to void. */
  rgb: [number, number, number];
  /** Render-only alpha driving the birth / death animation. */
  visualAlpha: number;
  /** Generation the cell was born (for birth pulse render). */
  bornGen: number;
  /** Generation the cell died (for death fade render). */
  diedGen: number;
}

export interface MoodState {
  cells: MoodCell[];
  neighbors: number[][];
  hexSize: number;
  layoutW: number;
  layoutH: number;
  lastTurnSeen: number;
  /** Monotonic generation counter incremented each turn tick. */
  generation: number;
  /** Monotonic frame count — drives the idle pulse. */
  frames: number;
}

export function createMoodState(): MoodState {
  return {
    cells: [],
    neighbors: [],
    hexSize: 14,
    layoutW: 0,
    layoutH: 0,
    lastTurnSeen: -1,
    generation: 0,
    frames: 0,
  };
}

function buildHexGrid(width: number, height: number): {
  coords: HexCoord[];
  positions: Array<{ x: number; y: number }>;
  size: number;
} {
  const target = 110;
  const aspect = width / Math.max(1, height);
  const nRows = Math.max(6, Math.round(Math.sqrt(target / aspect)));
  const nCols = Math.max(8, Math.round(target / nRows));
  const sizeFromWidth = width / (nCols * 1.5 + 0.5);
  const sizeFromHeight = height / ((nRows + 0.5) * Math.sqrt(3));
  const size = Math.max(8, Math.min(sizeFromWidth, sizeFromHeight));
  const hexW = size * 2;
  const hexH = size * Math.sqrt(3);
  const coords: HexCoord[] = [];
  const positions: Array<{ x: number; y: number }> = [];
  const offsetX = (width - (nCols * hexW * 0.75 + hexW * 0.25)) / 2 + size;
  const offsetY = (height - (nRows * hexH)) / 2 + hexH / 2;
  for (let col = 0; col < nCols; col++) {
    for (let row = 0; row < nRows; row++) {
      const x = offsetX + col * hexW * 0.75;
      const y = offsetY + row * hexH + (col % 2 === 1 ? hexH / 2 : 0);
      coords.push({ q: col, r: row });
      positions.push({ x, y });
    }
  }
  return { coords, positions, size };
}

function buildNeighbors(coords: HexCoord[]): number[][] {
  const byKey = new Map<string, number>();
  coords.forEach((c, i) => byKey.set(`${c.q},${c.r}`, i));
  const result: number[][] = coords.map(() => []);
  for (let i = 0; i < coords.length; i++) {
    const { q, r } = coords[i];
    const odd = q % 2 === 1 ? 1 : 0;
    const offsets = odd
      ? [[+1, 0], [+1, +1], [0, +1], [-1, +1], [-1, 0], [0, -1]]
      : [[+1, -1], [+1, 0], [0, +1], [-1, 0], [-1, -1], [0, -1]];
    for (const [dq, dr] of offsets) {
      const key = `${q + dq},${r + dr}`;
      const idx = byKey.get(key);
      if (idx !== undefined) result[i].push(idx);
    }
  }
  return result;
}

export interface MoodTickInput {
  snapshot: TurnSnapshot;
  hexacoById?: Map<string, { O: number; C: number; E: number; A: number; Em: number; HH: number }>;
  eventCategories?: string[];
  eventIntensity?: number;
  side: 'a' | 'b';
  width: number;
  height: number;
  nowMs: number;
}

export function ensureLayout(state: MoodState, input: MoodTickInput): void {
  const { width, height } = input;
  if (state.layoutW === width && state.layoutH === height && state.cells.length > 0) return;
  const { coords, positions, size } = buildHexGrid(width, height);
  state.neighbors = buildNeighbors(coords);
  state.hexSize = size;
  state.layoutW = width;
  state.layoutH = height;
  state.cells = coords.map((c, i) => ({
    gridIndex: i,
    q: c.q,
    r: c.r,
    x: positions[i].x,
    y: positions[i].y,
    alive: false,
    rgb: moodRgb('neutral'),
    visualAlpha: 0,
    bornGen: -1,
    diedGen: -1,
  }));
}

/** Drop a glider / blinker / R-pentomino shape around a seed cell. */
function sprayPattern(
  state: MoodState,
  centerIdx: number,
  color: [number, number, number],
  radius: number,
  rng: () => number,
  gen: number,
): void {
  const center = state.cells[centerIdx];
  if (!center) return;
  const stamp = (idx: number) => {
    const cell = state.cells[idx];
    if (!cell) return;
    if (!cell.alive) {
      cell.alive = true;
      cell.bornGen = gen;
      cell.rgb = color;
    } else {
      cell.rgb = blendRgb(cell.rgb, color, 0.4);
    }
  };
  stamp(centerIdx);
  const visited = new Set<number>([centerIdx]);
  let frontier: number[] = [centerIdx];
  for (let r = 0; r < radius; r++) {
    const next: number[] = [];
    for (const idx of frontier) {
      for (const n of state.neighbors[idx]) {
        if (visited.has(n)) continue;
        visited.add(n);
        // Stochastic fill: 65% of frontier cells get stamped, rest
        // left off so the shape reads as an organic cluster instead
        // of a perfect ring.
        if (rng() < 0.65) stamp(n);
        next.push(n);
      }
    }
    frontier = next;
  }
}

/** Kill a small cluster of cells around a death seed. */
function killCluster(state: MoodState, centerIdx: number, gen: number): void {
  const center = state.cells[centerIdx];
  if (!center) return;
  if (center.alive) { center.alive = false; center.diedGen = gen; }
  for (const n of state.neighbors[centerIdx]) {
    const cell = state.cells[n];
    if (cell.alive) { cell.alive = false; cell.diedGen = gen; }
  }
}

/**
 * Run one Conway generation: alive cells with 2 or 3 alive neighbors
 * survive, dead cells with exactly 3 alive neighbors are born and
 * inherit the average mood color of their alive neighbors.
 */
function generation(state: MoodState): void {
  const gen = state.generation + 1;
  state.generation = gen;

  // Snapshot current alive state before writing.
  const prevAlive = state.cells.map(c => c.alive);

  for (let i = 0; i < state.cells.length; i++) {
    const cell = state.cells[i];
    const neighbors = state.neighbors[i];
    let aliveCount = 0;
    let r = 0, g = 0, b = 0;
    for (const n of neighbors) {
      if (prevAlive[n]) {
        aliveCount++;
        const nrgb = state.cells[n].rgb;
        r += nrgb[0];
        g += nrgb[1];
        b += nrgb[2];
      }
    }
    if (prevAlive[i]) {
      // Survive if 2 or 3 neighbors alive.
      if (aliveCount < 2 || aliveCount > 3) {
        cell.alive = false;
        cell.diedGen = gen;
      } else if (aliveCount > 0) {
        // Gentle mood drift toward neighbor avg for survivors.
        const avg: [number, number, number] = [r / aliveCount, g / aliveCount, b / aliveCount];
        cell.rgb = blendRgb(cell.rgb, avg, 0.3);
      }
    } else {
      // Birth if exactly 3 neighbors alive.
      if (aliveCount === 3) {
        cell.alive = true;
        cell.bornGen = gen;
        cell.rgb = [r / 3, g / 3, b / 3];
      }
    }
  }
}

/**
 * Tick fires on every turn_done. Runs one Conway generation, then
 * applies sim-driven perturbations (colonist seeds, event bursts,
 * death wipes). Between ticks the board holds.
 */
export function tickMood(state: MoodState, input: MoodTickInput): void {
  const { snapshot, eventIntensity = 0, eventCategories = [], side } = input;
  if (snapshot.turn <= state.lastTurnSeen) return;

  // Step the cellular automaton one generation.
  generation(state);
  const gen = state.generation;

  const rng = mulberry32(hashString(`${side}|turn-${snapshot.turn}|${snapshot.cells.length}`));

  // Seed one pattern per alive colonist. Position hashed by agentId
  // so the same colonist seeds at the same spot every turn, and the
  // board bloom reflects who is still alive.
  const alive = snapshot.cells.filter(c => c.alive);
  for (const c of alive) {
    const idx = hashString(c.agentId) % Math.max(1, state.cells.length);
    const color = moodRgb(c.mood);
    sprayPattern(state, idx, color, 1, rng, gen);
  }

  // Detonate patterns per event category.
  if (eventIntensity > 0) {
    const burstCount = eventIntensity > 0.8 ? 3 : 1;
    for (let i = 0; i < burstCount; i++) {
      const idx = Math.floor(rng() * state.cells.length);
      const cat = eventCategories[i % Math.max(1, eventCategories.length)] || 'neutral';
      const moodName = cat.toLowerCase().includes('psych')
        ? 'anxious'
        : cat.toLowerCase().includes('environ')
        ? 'negative'
        : cat.toLowerCase().includes('resource')
        ? 'defiant'
        : 'hopeful';
      const radius = eventIntensity > 0.8 ? 2 : 1;
      sprayPattern(state, idx, moodRgb(moodName), radius, rng, gen);
    }
  }

  // Death wipes — one kill cluster per death this turn.
  for (let d = 0; d < snapshot.deaths; d++) {
    const idx = Math.floor(rng() * state.cells.length);
    killCluster(state, idx, gen);
  }

  state.lastTurnSeen = snapshot.turn;
}

interface DrawOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  nowMs: number;
  sideColor: string;
  intensity: number;
  hoveredIndex?: number | null;
  deltaMs: number;
}

function strokeHex(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const px = x + size * Math.cos(a);
    const py = y + size * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function drawMood(state: MoodState, opts: DrawOptions): void {
  const { ctx, width, height, intensity, sideColor, hoveredIndex, deltaMs } = opts;
  if (state.cells.length === 0) return;
  state.frames += 1;

  ctx.clearRect(0, 0, width, height);

  // Side tint wash.
  ctx.save();
  ctx.globalAlpha = 0.06 * intensity;
  ctx.fillStyle = sideColor;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  const gen = state.generation;
  const pulse = 0.9 + 0.1 * Math.sin(state.frames * 0.08);

  // Animate visualAlpha toward target (alive=1, dead=0) for smooth
  // birth fade-in / death fade-out.
  for (const cell of state.cells) {
    const target = cell.alive ? 1 : 0;
    const speed = Math.min(1, deltaMs / 350);
    cell.visualAlpha += (target - cell.visualAlpha) * speed;
  }

  // Background dead-cell pass (very dim, just hints at the grid).
  for (const cell of state.cells) {
    if (cell.visualAlpha > 0.05) continue;
    strokeHex(ctx, cell.x, cell.y, state.hexSize - 1.5);
    ctx.fillStyle = rgba([24, 20, 16], 0.45 * intensity);
    ctx.fill();
    ctx.strokeStyle = rgba([44, 38, 30], 0.4 * intensity);
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  // Alive-cell pass (bright, visible pattern).
  for (const cell of state.cells) {
    if (cell.visualAlpha <= 0.05) continue;
    const justBorn = gen > 0 && cell.bornGen === gen;
    const alpha = cell.visualAlpha * intensity * (justBorn ? pulse * 1.1 : pulse);
    strokeHex(ctx, cell.x, cell.y, state.hexSize - 0.5);
    ctx.fillStyle = rgba(cell.rgb, Math.min(1, alpha));
    ctx.fill();
    ctx.strokeStyle = rgba(cell.rgb, Math.min(1, alpha + 0.15));
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // Birth flash ring on the turn a cell was born.
    if (justBorn) {
      const ringR = state.hexSize + 5 * (1 - cell.visualAlpha);
      ctx.strokeStyle = rgba([255, 240, 220], 0.8 * (1 - cell.visualAlpha) * intensity);
      ctx.lineWidth = 1.5;
      strokeHex(ctx, cell.x, cell.y, ringR);
      ctx.stroke();
    }
  }

  // Hover highlight.
  if (hoveredIndex !== null && hoveredIndex !== undefined) {
    const cell = state.cells[hoveredIndex];
    if (cell) {
      ctx.strokeStyle = rgba([255, 255, 255], 0.85);
      ctx.lineWidth = 1.8;
      strokeHex(ctx, cell.x, cell.y, state.hexSize + 1);
      ctx.stroke();
    }
  }
}

export function hitTestMood(state: MoodState, x: number, y: number): MoodCell | null {
  const r2 = state.hexSize * state.hexSize;
  for (const cell of state.cells) {
    const dx = x - cell.x;
    const dy = y - cell.y;
    if (dx * dx + dy * dy <= r2) return cell;
  }
  return null;
}
