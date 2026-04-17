import type { MoodState } from './mood.js';
import { rgba } from '../shared.js';

/**
 * Forge flow overlay. Reads forge_attempt and dept_done.forgedTools
 * events as they stream in, spawns particles from the forging
 * department's center, draws curved tracers for reuse calls, and
 * accretes orbit counters around departments that originated tools
 * that got reused. Pool-managed so mid-turn GC never runs.
 */

const POOL_SIZE = 160;

type ParticleKind = 'birth' | 'reject' | 'tracer' | 'orbit';

interface Particle {
  active: boolean;
  kind: ParticleKind;
  bornMs: number;
  lifetimeMs: number;
  /** Starting point. For tracers also reused as the curve origin. */
  x: number;
  y: number;
  /** Velocity px/ms. For birth/reject particles only. */
  vx: number;
  vy: number;
  /** Tracer endpoint + control point (for Bézier curve). */
  tx: number;
  ty: number;
  cx: number;
  cy: number;
  /** Orbit phase + angular velocity + center + radius. */
  dept: string;
  orbitAngle: number;
  orbitSpeed: number;
  orbitRadius: number;
  /** Color RGB triple. */
  r: number;
  g: number;
  b: number;
}

export interface ForgeState {
  pool: Particle[];
  /** Which forge events we've already ingested (turn|index keys). */
  seenForgeKeys: Set<string>;
  /** Per-dept orbit counts — total reuses of tools originated there. */
  reuseByDept: Map<string, number>;
  /** Last turn we ingested. */
  lastTurnSeen: number;
  /** Cached dept centers, recomputed on roster change. */
  deptCenters: Map<string, { x: number; y: number }>;
  deptCentersKey: string;
}

export function createForgeState(): ForgeState {
  const pool: Particle[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    pool.push({
      active: false,
      kind: 'birth',
      bornMs: 0,
      lifetimeMs: 0,
      x: 0, y: 0,
      vx: 0, vy: 0,
      tx: 0, ty: 0,
      cx: 0, cy: 0,
      dept: '',
      orbitAngle: 0,
      orbitSpeed: 0,
      orbitRadius: 0,
      r: 0, g: 0, b: 0,
    });
  }
  return {
    pool,
    seenForgeKeys: new Set(),
    reuseByDept: new Map(),
    lastTurnSeen: -1,
    deptCenters: new Map(),
    deptCentersKey: '',
  };
}

function acquire(state: ForgeState): Particle | null {
  for (const p of state.pool) {
    if (!p.active) {
      p.active = true;
      return p;
    }
  }
  return null; // hard cap reached, drop silently per spec
}

function deptColor(dept: string): [number, number, number] {
  const d = (dept || '').toLowerCase();
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
 * Compute a dept center from the mood state's current cell positions.
 * Cached by a roster key so it only recomputes when promotions or
 * deaths change which cells belong to which dept.
 */
export function refreshDeptCenters(forge: ForgeState, mood: MoodState): void {
  const keyParts: string[] = [];
  const groups = new Map<string, { sumX: number; sumY: number; count: number }>();
  for (const cell of mood.cells.values()) {
    if (!cell.alive) continue;
    const dept = cell.department || 'unknown';
    keyParts.push(`${cell.agentId}:${dept}`);
    const g = groups.get(dept) || { sumX: 0, sumY: 0, count: 0 };
    g.sumX += cell.x;
    g.sumY += cell.y;
    g.count += 1;
    groups.set(dept, g);
  }
  const key = keyParts.sort().join('|');
  if (key === forge.deptCentersKey) return;
  forge.deptCenters.clear();
  for (const [dept, g] of groups.entries()) {
    forge.deptCenters.set(dept, { x: g.sumX / g.count, y: g.sumY / g.count });
  }
  forge.deptCentersKey = key;
}

export interface ForgeTickInput {
  forgeAttempts: Array<{
    turn: number; eventIndex: number; department: string; name: string;
    approved: boolean; confidence?: number;
  }>;
  reuseCalls: Array<{
    turn: number; originDept: string; callingDept: string; name: string;
  }>;
  nowMs: number;
  snapshotTurn: number;
}

function keyFor(kind: string, a: ForgeTickInput['forgeAttempts'][number] | ForgeTickInput['reuseCalls'][number]): string {
  if ('approved' in a) return `forge|${a.turn}|${a.eventIndex}|${a.name}`;
  return `reuse|${a.turn}|${a.originDept}->${a.callingDept}|${a.name}`;
}

export function tickForge(state: ForgeState, mood: MoodState, input: ForgeTickInput): void {
  if (input.snapshotTurn <= state.lastTurnSeen) return;
  refreshDeptCenters(state, mood);

  for (const att of input.forgeAttempts) {
    const key = keyFor('forge', att);
    if (state.seenForgeKeys.has(key)) continue;
    state.seenForgeKeys.add(key);
    const origin = state.deptCenters.get(att.department);
    if (!origin) continue;
    const rgb = att.approved ? deptColor(att.department) : [0xa0, 0x98, 0x88] as [number, number, number];
    const count = att.approved ? 8 : 3;
    for (let i = 0; i < count; i++) {
      const p = acquire(state);
      if (!p) break;
      p.kind = att.approved ? 'birth' : 'reject';
      p.bornMs = input.nowMs;
      p.lifetimeMs = att.approved ? 1200 : 900;
      p.x = origin.x;
      p.y = origin.y;
      const angle = (Math.PI * 2 * i) / count + (att.approved ? 0 : Math.PI / 2);
      const speed = att.approved ? 0.04 + Math.random() * 0.04 : 0.02 + Math.random() * 0.02;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed + (att.approved ? 0 : 0.03);
      p.r = rgb[0];
      p.g = rgb[1];
      p.b = rgb[2];
    }
  }

  for (const reuse of input.reuseCalls) {
    const key = keyFor('reuse', reuse);
    if (state.seenForgeKeys.has(key)) continue;
    state.seenForgeKeys.add(key);
    const origin = state.deptCenters.get(reuse.originDept);
    const target = state.deptCenters.get(reuse.callingDept);
    if (!origin || !target) continue;
    const p = acquire(state);
    if (!p) continue;
    p.kind = 'tracer';
    p.bornMs = input.nowMs;
    p.lifetimeMs = 1400;
    p.x = origin.x;
    p.y = origin.y;
    p.tx = target.x;
    p.ty = target.y;
    // Control point: midpoint with perpendicular offset for a curve.
    const mx = (origin.x + target.x) / 2;
    const my = (origin.y + target.y) / 2;
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Perpendicular normal. Self-reuse (len ~ 0) uses a vertical offset
    // so the rotating arc reads as an arc instead of a dot.
    const perpX = -dy / len;
    const perpY = dx / len;
    const curveAmount = len < 10 ? 24 : Math.min(35, len * 0.35);
    p.cx = mx + perpX * curveAmount;
    p.cy = my + perpY * curveAmount;
    const rgb = deptColor(reuse.originDept);
    p.r = rgb[0];
    p.g = rgb[1];
    p.b = rgb[2];

    const prev = state.reuseByDept.get(reuse.originDept) || 0;
    state.reuseByDept.set(reuse.originDept, prev + 1);
  }

  // Sync orbit particles per dept to match reuseByDept counts.
  const activeOrbitCounts = new Map<string, number>();
  for (const p of state.pool) {
    if (!p.active || p.kind !== 'orbit') continue;
    activeOrbitCounts.set(p.dept, (activeOrbitCounts.get(p.dept) || 0) + 1);
  }
  for (const [dept, count] of state.reuseByDept.entries()) {
    const have = activeOrbitCounts.get(dept) || 0;
    const target = Math.min(count, 12);
    if (have >= target) continue;
    const center = state.deptCenters.get(dept);
    if (!center) continue;
    const rgb = deptColor(dept);
    for (let i = have; i < target; i++) {
      const p = acquire(state);
      if (!p) break;
      p.kind = 'orbit';
      p.bornMs = input.nowMs;
      p.lifetimeMs = Number.MAX_SAFE_INTEGER; // orbits are persistent
      p.x = center.x;
      p.y = center.y;
      p.dept = dept;
      p.orbitAngle = Math.random() * Math.PI * 2;
      p.orbitSpeed = 0.0008 + Math.random() * 0.0006;
      p.orbitRadius = 14 + (i % 3) * 4;
      p.r = rgb[0];
      p.g = rgb[1];
      p.b = rgb[2];
    }
  }

  state.lastTurnSeen = input.snapshotTurn;
}

export interface ForgeDrawOptions {
  ctx: CanvasRenderingContext2D;
  nowMs: number;
  intensity: number;
  deltaMs: number;
}

export function drawForge(state: ForgeState, opts: ForgeDrawOptions): void {
  const { ctx, nowMs, intensity, deltaMs } = opts;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const p of state.pool) {
    if (!p.active) continue;
    const age = nowMs - p.bornMs;
    if (p.kind !== 'orbit' && age > p.lifetimeMs) {
      p.active = false;
      continue;
    }

    if (p.kind === 'birth' || p.kind === 'reject') {
      const t = age / p.lifetimeMs;
      const alpha = (1 - t) * intensity * 0.85;
      p.x += p.vx * deltaMs;
      p.y += p.vy * deltaMs;
      // Reject particles drift downward; birth particles decelerate.
      if (p.kind === 'reject') {
        p.vy += 0.00003 * deltaMs;
      } else {
        p.vx *= 1 - 0.001 * deltaMs;
        p.vy *= 1 - 0.001 * deltaMs;
      }
      ctx.fillStyle = rgba([p.r, p.g, p.b], alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.kind === 'birth' ? 2.2 : 1.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'tracer') {
      const t = age / p.lifetimeMs;
      const drawPhase = Math.min(1, t / 0.43); // first 43% draws in
      const fadePhase = t > 0.43 ? (t - 0.43) / 0.57 : 0;
      const alpha = (1 - fadePhase) * intensity * 0.8;
      ctx.strokeStyle = rgba([p.r, p.g, p.b], alpha);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      // Quadratic Bézier from (p.x, p.y) via (p.cx, p.cy) to (p.tx, p.ty),
      // clipped at drawPhase along its length.
      const steps = 18;
      const stop = Math.max(1, Math.round(steps * drawPhase));
      ctx.moveTo(p.x, p.y);
      for (let i = 1; i <= stop; i++) {
        const u = i / steps;
        const oneMinus = 1 - u;
        const bx = oneMinus * oneMinus * p.x + 2 * oneMinus * u * p.cx + u * u * p.tx;
        const by = oneMinus * oneMinus * p.y + 2 * oneMinus * u * p.cy + u * u * p.ty;
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
      // Leading head dot while draw-in is still happening.
      if (drawPhase < 1) {
        const u = drawPhase;
        const oneMinus = 1 - u;
        const hx = oneMinus * oneMinus * p.x + 2 * oneMinus * u * p.cx + u * u * p.tx;
        const hy = oneMinus * oneMinus * p.y + 2 * oneMinus * u * p.cy + u * u * p.ty;
        ctx.fillStyle = rgba([p.r, p.g, p.b], intensity);
        ctx.beginPath();
        ctx.arc(hx, hy, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (p.kind === 'orbit') {
      p.orbitAngle += p.orbitSpeed * deltaMs;
      // Track dept center if it moved (promotions/deaths reshape dept
      // geometry between turns).
      // x/y here are the center, not the particle position — particle
      // position is derived on draw.
      const angle = p.orbitAngle;
      const px = p.x + Math.cos(angle) * p.orbitRadius;
      const py = p.y + Math.sin(angle) * p.orbitRadius * 0.7;
      ctx.fillStyle = rgba([p.r, p.g, p.b], intensity * 0.85);
      ctx.beginPath();
      ctx.arc(px, py, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/** Reflect roster changes in orbit particle centers. */
export function syncOrbitCenters(state: ForgeState): void {
  for (const p of state.pool) {
    if (!p.active || p.kind !== 'orbit') continue;
    const center = state.deptCenters.get(p.dept);
    if (center) {
      p.x = center.x;
      p.y = center.y;
    }
  }
}
