/**
 * Mood — Colonist Cloud
 *
 * Replaces the prior Conway's Game of Life renderer. That design's
 * rules killed stamped cells faster than the sim reseeded them, so the
 * grid looked empty between turns even on a healthy colony. This
 * version draws one dot per alive colonist, colored by mood and
 * positioned in a per-department cluster. Visible signal at a glance:
 * cloud density = population, color mix = mood distribution, cluster
 * sizes = dept balance, ghost outlines = deaths from the last turn.
 *
 * Module contract unchanged: createMoodState / ensureLayout / tickMood
 * / drawMood / hitTestMood. AutomatonCanvas.tsx consumes this module
 * without modification.
 *
 * @module paracosm/cli/dashboard/viz/automaton/modes/mood
 */
import type { TurnSnapshot } from '../../viz-types.js';
import { hashString, moodRgb, mulberry32, rgba } from '../shared.js';

/** One dot's cached position + role for hit-test and render. */
export interface MoodCell {
  agentId: string;
  x: number;
  y: number;
  /** Drawing radius in pixels. */
  r: number;
  /** Current mood color. Refreshed on every tick from the live snapshot. */
  rgb: [number, number, number];
  /** Dept (needed so render can tint the cluster perimeter). */
  department: string;
  /** Featured colonists render slightly larger to stand out. */
  featured: boolean;
  /** Born this turn — birth flash animation. */
  bornGen: number;
  /** Died this turn — fade-out ghost. -1 while alive. */
  diedGen: number;
  alive: boolean;
  name: string;
}

export interface MoodState {
  cells: MoodCell[];
  layoutKey: string;
  layoutW: number;
  layoutH: number;
  /** Monotonic counter bumped each tick — drives birth/death animations. */
  generation: number;
  /** Frame counter used for the ambient pulse. */
  frames: number;
}

export function createMoodState(): MoodState {
  return {
    cells: [],
    layoutKey: '',
    layoutW: 0,
    layoutH: 0,
    generation: 0,
    frames: 0,
  };
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

/**
 * Compute per-department cluster centers using a deterministic ring.
 * Same canvas size + same department set → identical geometry, so the
 * two leader panels are visually comparable (different clouds over
 * the same skeleton).
 */
function deptCenters(width: number, height: number, depts: string[]): Map<string, { cx: number; cy: number; radius: number }> {
  const out = new Map<string, { cx: number; cy: number; radius: number }>();
  if (depts.length === 0) return out;
  const cx = width / 2;
  const cy = height / 2;
  const outerR = Math.min(width, height) * 0.38;
  const clusterR = Math.min(width, height) * 0.18;
  if (depts.length === 1) {
    out.set(depts[0], { cx, cy, radius: clusterR * 1.3 });
    return out;
  }
  for (let i = 0; i < depts.length; i++) {
    const angle = (Math.PI * 2 * i) / depts.length - Math.PI / 2;
    out.set(depts[i], {
      cx: cx + Math.cos(angle) * outerR * 0.6,
      cy: cy + Math.sin(angle) * outerR * 0.6,
      radius: clusterR,
    });
  }
  return out;
}

function deptRgb(dept: string): [number, number, number] {
  const d = dept.toLowerCase();
  if (d.includes('medical')) return [0x4e, 0xcd, 0xc4];
  if (d.includes('engineer')) return [0xe8, 0xb4, 0x4a];
  if (d.includes('agri')) return [0x6a, 0xad, 0x48];
  if (d.includes('psych')) return [0x9b, 0x6b, 0x9e];
  if (d.includes('govern')) return [0xe0, 0x65, 0x30];
  if (d.includes('research') || d.includes('science')) return [0x95, 0x6b, 0xd8];
  if (d.includes('ops') || d.includes('operations')) return [0xc8, 0x7a, 0x3a];
  return [0xa8, 0x98, 0x78];
}

/**
 * Build or refresh layout. Positions are hashed by agentId so they're
 * stable across turns — a colonist doesn't jump around when a
 * neighbor dies. Called every tick but short-circuits when the
 * canvas dims and roster haven't changed.
 */
export function ensureLayout(state: MoodState, input: MoodTickInput): void {
  const { snapshot, width, height } = input;
  if (!snapshot) return;
  const alive = snapshot.cells.filter(c => c.alive);
  // Key includes canvas size + live roster (ids + dept assignment) so a
  // promotion that reparents a colonist rebuilds the layout.
  const rosterKey = alive.map(c => `${c.agentId}:${c.department}`).sort().join('|');
  const layoutKey = `${width}x${height}|${rosterKey}`;
  if (layoutKey === state.layoutKey) return;

  // Unique depts preserve scenario order where possible.
  const deptSet = new Set<string>();
  for (const c of alive) deptSet.add(c.department || 'unknown');
  const depts = [...deptSet];
  const centers = deptCenters(width, height, depts);

  // Preserve existing cell positions + animation flags for agents that
  // survived from the previous layout so birth/death transitions
  // render correctly across layout rebuilds.
  const prevByAgent = new Map<string, MoodCell>();
  for (const cell of state.cells) prevByAgent.set(cell.agentId, cell);

  const currentIds = new Set<string>();
  const newCells: MoodCell[] = [];
  const gen = state.generation;

  for (const c of alive) {
    currentIds.add(c.agentId);
    const center = centers.get(c.department || 'unknown') ?? { cx: width / 2, cy: height / 2, radius: 40 };
    const rng = mulberry32(hashString(`${c.agentId}|${width}x${height}`));
    const angle = rng() * Math.PI * 2;
    // Sqrt pushes points toward the edge so clusters don't look too
    // center-heavy. Featured colonists get a smaller radius so they
    // cluster visually near the center.
    const radialBase = c.featured ? 0.45 : 0.6 + rng() * 0.35;
    const radial = Math.sqrt(radialBase) * center.radius;
    const x = center.cx + Math.cos(angle) * radial;
    const y = center.cy + Math.sin(angle) * radial;
    const prev = prevByAgent.get(c.agentId);
    const baseR = c.featured ? 6.5 : 4.5;
    newCells.push({
      agentId: c.agentId,
      x,
      y,
      r: baseR,
      rgb: moodRgb(c.mood),
      department: c.department || 'unknown',
      featured: c.featured,
      bornGen: prev ? prev.bornGen : gen,
      diedGen: -1,
      alive: true,
      name: c.name,
    });
  }

  // Keep recently-died agents for one generation as ghosts fading out.
  for (const prev of state.cells) {
    if (currentIds.has(prev.agentId)) continue;
    if (prev.diedGen < 0) {
      newCells.push({ ...prev, alive: false, diedGen: gen });
    } else if (gen - prev.diedGen < 2) {
      // Keep existing ghost for one more frame then drop.
      newCells.push(prev);
    }
  }

  state.cells = newCells;
  state.layoutKey = layoutKey;
  state.layoutW = width;
  state.layoutH = height;
}

/**
 * Tick advances the cloud on each new turn. Ensures layout is fresh
 * so color + position match the latest snapshot.
 */
export function tickMood(state: MoodState, input: MoodTickInput): void {
  state.generation += 1;
  // Refresh mood colors on currently-alive cells from the latest
  // snapshot so a mood shift at turn N recolors the dot.
  const moodByAgent = new Map<string, string>();
  for (const c of input.snapshot.cells) moodByAgent.set(c.agentId, c.mood);
  for (const cell of state.cells) {
    const m = moodByAgent.get(cell.agentId);
    if (m && cell.alive) cell.rgb = moodRgb(m);
  }
  ensureLayout(state, input);
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

export function drawMood(state: MoodState, opts: DrawOptions): void {
  const { ctx, width, height, intensity, sideColor, hoveredIndex } = opts;
  state.frames += 1;
  ctx.clearRect(0, 0, width, height);

  // Side-color wash — very subtle background tint so leader A vs B read apart.
  ctx.save();
  ctx.globalAlpha = 0.04 * intensity;
  ctx.fillStyle = sideColor;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  if (state.cells.length === 0) {
    // Empty state copy so an unpopulated colony doesn't look broken.
    ctx.fillStyle = rgba([150, 140, 120], 0.4);
    ctx.font = '11px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('no alive colonists yet', width / 2, height / 2);
    return;
  }

  const pulse = 0.92 + 0.08 * Math.sin(state.frames * 0.05);
  const gen = state.generation;

  // Render dead ghosts first so alive dots sit on top.
  for (const cell of state.cells) {
    if (cell.alive) continue;
    const fade = 1 - Math.min(1, (gen - cell.diedGen) / 2);
    if (fade <= 0) continue;
    ctx.strokeStyle = rgba([200, 100, 80], 0.55 * fade * intensity);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cell.x, cell.y, cell.r + 1, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Alive dots.
  let idx = -1;
  for (const cell of state.cells) {
    idx += 1;
    if (!cell.alive) continue;
    const justBorn = cell.bornGen === gen && gen > 0;
    const r = cell.r * (justBorn ? 1.25 : 1);
    const hovered = hoveredIndex === idx;
    ctx.fillStyle = rgba(cell.rgb, 0.85 * intensity * pulse);
    ctx.beginPath();
    ctx.arc(cell.x, cell.y, r, 0, Math.PI * 2);
    ctx.fill();
    if (cell.featured) {
      ctx.strokeStyle = rgba([0xf0, 0xe6, 0xd2], 0.8 * intensity);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cell.x, cell.y, r + 1.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (justBorn) {
      ctx.strokeStyle = rgba([255, 240, 220], 0.75 * intensity);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cell.x, cell.y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (hovered) {
      ctx.strokeStyle = rgba([255, 255, 255], 0.9);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(cell.x, cell.y, r + 2.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Dept cluster perimeters — very dim, just hints at the grouping so
  // the cloud reads as clusters and not a swarm.
  const deptAssignments = new Map<string, Array<{ x: number; y: number }>>();
  for (const cell of state.cells) {
    if (!cell.alive) continue;
    const arr = deptAssignments.get(cell.department) ?? [];
    arr.push({ x: cell.x, y: cell.y });
    deptAssignments.set(cell.department, arr);
  }
  for (const [dept, pts] of deptAssignments.entries()) {
    if (pts.length < 3) continue;
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p.x; cy += p.y; }
    cx /= pts.length; cy /= pts.length;
    let maxR = 0;
    for (const p of pts) {
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d > maxR) maxR = d;
    }
    const rgb = deptRgb(dept);
    ctx.strokeStyle = rgba(rgb, 0.18 * intensity);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR + 6, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function hitTestMood(state: MoodState, x: number, y: number): MoodCell | null {
  // Iterate in reverse so last-drawn (featured) cells win overlap ties.
  for (let i = state.cells.length - 1; i >= 0; i--) {
    const cell = state.cells[i];
    if (!cell.alive) continue;
    const dx = x - cell.x;
    const dy = y - cell.y;
    const rr = (cell.r + 1) * (cell.r + 1);
    if (dx * dx + dy * dy <= rr) return cell;
  }
  return null;
}
