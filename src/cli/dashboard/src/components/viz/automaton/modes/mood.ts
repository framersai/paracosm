import type { CellSnapshot, TurnSnapshot } from '../../viz-types.js';
import type { MoodKey } from '../shared.js';
import {
  blendRgb,
  easeOutCubic,
  hashString,
  moodRgb,
  mulberry32,
  rgba,
} from '../shared.js';

/**
 * Mood propagation automaton. Cells are colonists; positions are laid
 * out once via poisson-disc sampling and then fixed for the run. Each
 * turn_done advances a blended mood value toward the neighbor-weighted
 * target so you see waves of mood propagate across the colony as the
 * sim progresses.
 */

export interface MoodCell {
  agentId: string;
  name: string;
  department: string;
  x: number;
  y: number;
  radius: number;
  /** Influence radius (neighbor reach). */
  aura: number;
  /** Current mood color (animated). */
  rgb: [number, number, number];
  /** Target mood color after the last tick. Animated toward. */
  targetRgb: [number, number, number];
  /** Ms since the last tick, used by the draw call for interpolation. */
  tickAgeMs: number;
  alive: boolean;
  /** Timestamp when the cell last died (for fade). 0 when never died. */
  diedAtMs: number;
  /** Pulse rings emitted this turn (flashbulb events). */
  rings: Array<{ bornMs: number; radius: number; alpha: number }>;
  /** HEXACO weights; defaults to neutral 0.5 across the board when absent. */
  emotionality: number;
  agreeableness: number;
  openness: number;
}

export interface MoodState {
  /** Keyed by agentId so cells survive snapshot churn. */
  cells: Map<string, MoodCell>;
  /** Last snapshot turn we ticked on; used to detect a new turn. */
  lastTurnSeen: number;
  /** Global breathe phase, shared across all cells. */
  phase: number;
  /** Canvas dimensions the cells were laid out against. */
  layoutW: number;
  layoutH: number;
}

export function createMoodState(): MoodState {
  return {
    cells: new Map(),
    lastTurnSeen: -1,
    phase: 0,
    layoutW: 0,
    layoutH: 0,
  };
}

interface LayoutOptions {
  width: number;
  height: number;
  seed: string;
  /** Optional family/dept bias groupings. Cells in the same group gently
   *  pull toward a shared center during placement. */
  groups?: Map<string, string[]>;
}

/**
 * Poisson-disc-ish sampling. Not a strict Bridson implementation —
 * just best-candidate dart throwing, which is plenty for ~30 cells
 * and runs in <2ms. Deterministic per seed.
 */
function samplePositions(agentIds: string[], opts: LayoutOptions): Map<string, { x: number; y: number }> {
  const { width, height, seed } = opts;
  const rng = mulberry32(hashString(seed));
  const minDist = Math.max(14, Math.min(width, height) / Math.sqrt(agentIds.length * 2));
  const positions = new Map<string, { x: number; y: number }>();
  const points: Array<{ x: number; y: number }> = [];
  const pad = 10;

  for (const id of agentIds) {
    let best: { x: number; y: number } | null = null;
    let bestDist = -Infinity;
    const candidates = 18;
    for (let c = 0; c < candidates; c++) {
      const x = pad + rng() * (width - pad * 2);
      const y = pad + rng() * (height - pad * 2);
      let nearest = Infinity;
      for (const p of points) {
        const dx = p.x - x;
        const dy = p.y - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < nearest) nearest = d;
      }
      if (nearest > bestDist) {
        bestDist = nearest;
        best = { x, y };
      }
      if (nearest > minDist * 1.2) break;
    }
    if (best) {
      positions.set(id, best);
      points.push(best);
    }
  }
  return positions;
}

function neighborFalloff(distance: number, radius: number): number {
  if (distance >= radius) return 0;
  const u = 1 - distance / radius;
  return u * u;
}

function hexacoFor(
  agentId: string,
  hexacoById: Map<string, { O: number; C: number; E: number; A: number; Em: number; HH: number }> | undefined,
): { O: number; C: number; A: number; Em: number } {
  const h = hexacoById?.get(agentId);
  if (!h) return { O: 0.5, C: 0.5, A: 0.5, Em: 0.5 };
  return { O: h.O, C: h.C, A: h.A, Em: h.Em };
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

/** Initialize cells for the given snapshot if we don't have a layout yet. */
export function ensureLayout(state: MoodState, input: MoodTickInput): void {
  const { snapshot, width, height, side, hexacoById, nowMs } = input;
  if (state.layoutW === width && state.layoutH === height && state.cells.size > 0) return;

  // Group agent IDs by department for mild positional bias (dept-mates
  // tend to get sampled near each other because we seed the PRNG per
  // department segment of the ID list).
  const byDept = new Map<string, CellSnapshot[]>();
  for (const c of snapshot.cells) {
    const arr = byDept.get(c.department) || [];
    arr.push(c);
    byDept.set(c.department, arr);
  }
  // Interleave dept groups so poisson sampling produces visible clusters
  // (same-dept ids tend to land in nearby best-candidate throws).
  const ordered: CellSnapshot[] = [];
  const deptOrder = Array.from(byDept.keys()).sort();
  for (const dept of deptOrder) {
    const cells = byDept.get(dept) || [];
    for (const c of cells) ordered.push(c);
  }

  const agentIds = ordered.map(c => c.agentId);
  const positions = samplePositions(agentIds, {
    width, height,
    seed: `${side}|${snapshot.turn}|${agentIds.join(',')}`,
  });

  state.cells.clear();
  for (const c of ordered) {
    const pos = positions.get(c.agentId);
    if (!pos) continue;
    const hx = hexacoFor(c.agentId, hexacoById);
    const rgb = moodRgb(c.mood);
    state.cells.set(c.agentId, {
      agentId: c.agentId,
      name: c.name,
      department: c.department,
      x: pos.x,
      y: pos.y,
      radius: 3 + Math.max(0, Math.min(1, c.psychScore)) * 5,
      aura: 18 + hx.Em * 22,
      rgb,
      targetRgb: rgb,
      tickAgeMs: 0,
      alive: c.alive,
      diedAtMs: c.alive ? 0 : nowMs,
      rings: [],
      emotionality: hx.Em,
      agreeableness: hx.A,
      openness: hx.O,
    });
  }
  state.layoutW = width;
  state.layoutH = height;
}

/**
 * Advance the automaton one tick. Fires when the latest snapshot's
 * turn is greater than the last turn we ticked on. Computes each
 * cell's incoming mood vector from its neighbors and blends toward
 * the new target color.
 */
export function tickMood(state: MoodState, input: MoodTickInput): void {
  const { snapshot, nowMs, eventIntensity = 0, eventCategories = [] } = input;
  if (snapshot.turn <= state.lastTurnSeen) return;

  // Update alive/dead state + name/department for existing cells,
  // spawn cells for new colonists, skip vanished ones (keep their
  // position so the fade plays).
  for (const c of snapshot.cells) {
    const cell = state.cells.get(c.agentId);
    if (!cell) continue;
    if (cell.alive && !c.alive) {
      cell.alive = false;
      cell.diedAtMs = nowMs;
    }
    cell.name = c.name;
    cell.department = c.department;
  }

  // For each alive cell, compute incoming neighbor influence.
  const cellArr = Array.from(state.cells.values()).filter(c => c.alive);
  const snapshotMoodByAgent = new Map<string, string>();
  for (const c of snapshot.cells) snapshotMoodByAgent.set(c.agentId, c.mood);

  for (const cell of cellArr) {
    const newMood = snapshotMoodByAgent.get(cell.agentId) ?? 'neutral';
    const baseRgb = moodRgb(newMood);

    let accR = 0, accG = 0, accB = 0, totalWeight = 0;
    const empathyGate = cell.agreeableness * cell.emotionality;
    for (const n of cellArr) {
      if (n === cell) continue;
      const dx = n.x - cell.x;
      const dy = n.y - cell.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > cell.aura) continue;
      const falloff = neighborFalloff(dist, cell.aura);
      const weight = n.emotionality * falloff * (0.4 + empathyGate * 0.8);
      const nrgb = moodRgb(snapshotMoodByAgent.get(n.agentId) ?? 'neutral');
      accR += nrgb[0] * weight;
      accG += nrgb[1] * weight;
      accB += nrgb[2] * weight;
      totalWeight += weight;
    }

    // Event pulse: category matches the cell's dept → full intensity,
    // otherwise 25% spill to simulate colony-wide emotional contagion.
    let pulseR = 0, pulseG = 0, pulseB = 0, pulseWeight = 0;
    if (eventIntensity > 0 && eventCategories.length > 0) {
      const matches = eventCategories.some(cat =>
        cat.toLowerCase().includes(cell.department.toLowerCase()) ||
        cell.department.toLowerCase().includes(cat.toLowerCase()),
      );
      const spill = matches ? 1 : 0.25;
      const novelty = 0.3 + cell.openness * 0.7;
      const pulseAlpha = eventIntensity * spill * novelty;
      const pulseColor = moodRgb('anxious');
      pulseR = pulseColor[0] * pulseAlpha;
      pulseG = pulseColor[1] * pulseAlpha;
      pulseB = pulseColor[2] * pulseAlpha;
      pulseWeight = pulseAlpha;
    }

    const avgNeighborRgb: [number, number, number] =
      totalWeight > 0
        ? [accR / totalWeight, accG / totalWeight, accB / totalWeight]
        : baseRgb;
    const neighborMix = 0.35 + (totalWeight > 0 ? 0.2 : 0);
    const target = blendRgb(baseRgb, avgNeighborRgb, neighborMix);
    if (pulseWeight > 0) {
      const target2 = blendRgb(
        target,
        [pulseR / pulseWeight, pulseG / pulseWeight, pulseB / pulseWeight] as [number, number, number],
        Math.min(0.5, pulseWeight),
      );
      cell.targetRgb = target2;
    } else {
      cell.targetRgb = target;
    }

    // Flashbulb ring for high-intensity events on matching depts.
    if (eventIntensity > 0.8 && eventCategories.some(cat =>
      cat.toLowerCase().includes(cell.department.toLowerCase()),
    )) {
      cell.rings.push({ bornMs: nowMs, radius: cell.radius, alpha: 0.9 });
    }

    cell.tickAgeMs = 0;
  }

  state.lastTurnSeen = snapshot.turn;
}

interface DrawOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  nowMs: number;
  sideColor: string;
  /** Global intensity 0-1. When forge mode is primary, mood draws at ~0.2. */
  intensity: number;
  /** Hover target, if any, for a subtle highlight ring. */
  hoveredId?: string | null;
  /** Last frame time in ms (used to advance breathe phase + ring decay). */
  deltaMs: number;
}

/**
 * Draw the mood field. Cheap per-frame: loops cells twice (aura pass,
 * cell pass), draws any active rings, fades deceased cells.
 */
export function drawMood(state: MoodState, opts: DrawOptions): void {
  const { ctx, width, height, nowMs, intensity, hoveredId, deltaMs, sideColor } = opts;
  if (state.cells.size === 0) return;
  state.phase += deltaMs / 4000; // ~4s breathe cycle

  ctx.clearRect(0, 0, width, height);

  // Side tint wash — barely visible, sets the warm/cool base.
  ctx.save();
  ctx.globalAlpha = 0.04 * intensity;
  ctx.fillStyle = sideColor;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // Interpolate + draw auras (additive, soft).
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const cell of state.cells.values()) {
    const duration = 2000;
    const t = easeOutCubic(Math.min(1, cell.tickAgeMs / duration));
    const rgb = blendRgb(cell.rgb, cell.targetRgb, t);
    cell.rgb = rgb;
    cell.tickAgeMs += deltaMs;

    const fade = cell.alive ? 1 : Math.max(0, 1 - (nowMs - cell.diedAtMs) / 1500);
    if (fade <= 0) continue;

    const breathe = 0.85 + 0.15 * Math.sin((state.phase + cell.x * 0.01) * Math.PI * 2);
    const grd = ctx.createRadialGradient(cell.x, cell.y, cell.radius, cell.x, cell.y, cell.aura * breathe);
    grd.addColorStop(0, rgba(rgb, 0.35 * intensity * fade));
    grd.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cell.x, cell.y, cell.aura * breathe, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Cell bodies.
  for (const cell of state.cells.values()) {
    const fade = cell.alive ? 1 : Math.max(0, 1 - (nowMs - cell.diedAtMs) / 1500);
    if (fade <= 0) continue;
    ctx.fillStyle = rgba(cell.rgb, 0.9 * intensity * fade);
    ctx.beginPath();
    ctx.arc(cell.x, cell.y, cell.radius, 0, Math.PI * 2);
    ctx.fill();
    if (hoveredId === cell.agentId) {
      ctx.strokeStyle = rgba([255, 255, 255], 0.7);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // Flashbulb rings.
  for (const cell of state.cells.values()) {
    if (cell.rings.length === 0) continue;
    const keep: typeof cell.rings = [];
    for (const r of cell.rings) {
      const age = nowMs - r.bornMs;
      if (age > 800) continue;
      const t = age / 800;
      const radius = cell.radius + 80 * t;
      const alpha = r.alpha * (1 - t);
      ctx.strokeStyle = rgba(cell.targetRgb, alpha * intensity);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cell.x, cell.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      keep.push(r);
    }
    cell.rings = keep;
  }
}

/** Hit-test a cell at the given logical canvas coordinates. */
export function hitTestMood(state: MoodState, x: number, y: number): MoodCell | null {
  let best: MoodCell | null = null;
  let bestDist = Infinity;
  for (const cell of state.cells.values()) {
    if (!cell.alive) continue;
    const dx = cell.x - x;
    const dy = cell.y - y;
    const d = dx * dx + dy * dy;
    const r = cell.radius + 4;
    if (d <= r * r && d < bestDist) {
      bestDist = d;
      best = cell;
    }
  }
  return best;
}
