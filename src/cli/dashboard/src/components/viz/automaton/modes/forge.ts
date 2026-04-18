/**
 * Forge — Tool Lineage Tree
 *
 * Replaces the prior particle overlay that read a non-existent
 * `cell.department` field on MoodCell and therefore spawned nothing.
 * This version renders the forge economy directly: one node per
 * attempt laid out on a turn × department grid, re-forge chains
 * connected vertically within each name, reuse calls drawn as
 * curved arcs from the originator node to the calling dept's row.
 *
 * Reads the same cumulative `forgeAttempts[]` + `reuseCalls[]` arrays
 * the caller already aggregates, plus the snapshot's current turn.
 * No dependency on the mood state (the prior dept-center lookup is
 * gone — the lineage tree computes its own layout).
 *
 * Module contract preserved: createForgeState / refreshDeptCenters /
 * syncOrbitCenters / tickForge / drawForge. The two no-op exports
 * (refreshDeptCenters, syncOrbitCenters) stay so AutomatonCanvas.tsx
 * doesn't need a patch.
 *
 * @module paracosm/cli/dashboard/viz/automaton/modes/forge
 */
import type { MoodState } from './mood.js';
import { rgba } from '../shared.js';

type AttemptOutcome = 'approved' | 'rejected';

export interface ForgeNode {
  turn: number;
  department: string;
  name: string;
  outcome: AttemptOutcome;
  /** Chain index: 0 = first attempt, 1 = first re-forge, etc. */
  attemptIndex: number;
  /** Judge confidence (approved) or 0 (rejected). Undefined when the
   *  forge record did not carry a confidence value. */
  confidence?: number;
  /** Cached layout position, populated in drawForge. */
  x: number;
  y: number;
}

interface ReuseArc {
  turn: number;
  originDept: string;
  callingDept: string;
  name: string;
}

export interface ForgeState {
  nodes: ForgeNode[];
  arcs: ReuseArc[];
  /** Deduplication set so re-ticks of the same cumulative arrays
   *  don't add the same event twice. */
  seenKeys: Set<string>;
  lastTurnSeen: number;
  /** Per-tool attempt counter used to number chain positions. */
  attemptCountByName: Map<string, number>;
}

export function createForgeState(): ForgeState {
  return {
    nodes: [],
    arcs: [],
    seenKeys: new Set(),
    lastTurnSeen: -1,
    attemptCountByName: new Map(),
  };
}

/** Kept for AutomatonCanvas contract compat; no-op under the new design. */
export function refreshDeptCenters(_state: ForgeState, _mood: MoodState): void { /* unused */ }
export function syncOrbitCenters(_state: ForgeState): void { /* unused */ }

function deptRgb(dept: string): [number, number, number] {
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

export function tickForge(state: ForgeState, _mood: MoodState, input: ForgeTickInput): void {
  for (const att of input.forgeAttempts) {
    const key = `forge|${att.turn}|${att.eventIndex}|${att.department}|${att.name}|${att.approved ? 'a' : 'r'}`;
    if (state.seenKeys.has(key)) continue;
    state.seenKeys.add(key);
    const prev = state.attemptCountByName.get(att.name) ?? 0;
    state.attemptCountByName.set(att.name, prev + 1);
    state.nodes.push({
      turn: att.turn,
      department: att.department || 'unknown',
      name: att.name || '(unnamed)',
      outcome: att.approved ? 'approved' : 'rejected',
      attemptIndex: prev,
      confidence: typeof att.confidence === 'number' ? att.confidence : undefined,
      x: 0,
      y: 0,
    });
  }
  for (const reuse of input.reuseCalls) {
    const key = `reuse|${reuse.turn}|${reuse.originDept}|${reuse.callingDept}|${reuse.name}`;
    if (state.seenKeys.has(key)) continue;
    state.seenKeys.add(key);
    state.arcs.push({ ...reuse });
  }
  state.lastTurnSeen = input.snapshotTurn;
}

export interface ForgeDrawOptions {
  ctx: CanvasRenderingContext2D;
  nowMs: number;
  intensity: number;
  deltaMs: number;
}

function layoutDimensions(canvasW: number, canvasH: number, maxTurn: number, depts: string[]) {
  const padL = 72;
  const padR = 24;
  const padT = 20;
  const padB = 36;
  const plotW = Math.max(120, canvasW - padL - padR);
  const plotH = Math.max(80, canvasH - padT - padB);
  const turnSlots = Math.max(1, maxTurn);
  const turnStep = plotW / turnSlots;
  const deptStep = plotH / Math.max(1, depts.length);
  return { padL, padR, padT, padB, plotW, plotH, turnStep, deptStep };
}

export function drawForge(state: ForgeState, opts: ForgeDrawOptions): void {
  const { ctx, intensity } = opts;
  const canvas = ctx.canvas;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  ctx.clearRect(0, 0, width, height);

  if (state.nodes.length === 0) {
    ctx.fillStyle = rgba([150, 140, 120], 0.4);
    ctx.font = '11px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('no forges yet — waiting for turn 1', width / 2, height / 2);
    return;
  }

  // Collect dept list and max turn from current state so layout grows
  // with the run.
  const deptSet = new Set<string>();
  let maxTurn = 0;
  for (const n of state.nodes) {
    deptSet.add(n.department);
    if (n.turn > maxTurn) maxTurn = n.turn;
  }
  const depts = [...deptSet].sort();
  const { padL, padT, turnStep, deptStep } = layoutDimensions(width, height, Math.max(maxTurn, 1), depts);

  // Axis labels (subtle).
  ctx.fillStyle = rgba([160, 152, 136], 0.65);
  ctx.font = '9px ui-sans-serif, system-ui';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let di = 0; di < depts.length; di++) {
    const y = padT + deptStep * (di + 0.5);
    ctx.fillText(depts[di].slice(0, 10).toUpperCase(), padL - 6, y);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let t = 1; t <= maxTurn; t++) {
    const x = padL + turnStep * (t - 0.5);
    ctx.fillText(`T${t}`, x, height - 16);
  }

  // Grid guides — very dim horizontal lines per dept row.
  ctx.strokeStyle = rgba([90, 84, 70], 0.22);
  ctx.lineWidth = 0.6;
  for (let di = 0; di < depts.length; di++) {
    const y = padT + deptStep * (di + 0.5);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + turnStep * maxTurn, y);
    ctx.stroke();
  }

  // Lay out nodes. Within a (turn, dept) cell, stack multiple attempts
  // vertically so retries within a single event are visible.
  const cellStacks = new Map<string, ForgeNode[]>();
  for (const node of state.nodes) {
    const cellKey = `${node.turn}|${node.department}`;
    const arr = cellStacks.get(cellKey) ?? [];
    arr.push(node);
    cellStacks.set(cellKey, arr);
  }
  for (const [cellKey, stack] of cellStacks.entries()) {
    const [turnStr, dept] = cellKey.split('|');
    const turn = parseInt(turnStr, 10);
    const deptIdx = depts.indexOf(dept);
    if (deptIdx < 0) continue;
    const cellX = padL + turnStep * (turn - 0.5);
    const cellY = padT + deptStep * (deptIdx + 0.5);
    const stackOffset = Math.min(8, stack.length);
    for (let i = 0; i < stack.length; i++) {
      const shift = (i - (stackOffset - 1) / 2) * 7;
      stack[i].x = cellX;
      stack[i].y = cellY + shift;
    }
  }

  // Connect re-forge chains (same name, consecutive attempts).
  const nodesByName = new Map<string, ForgeNode[]>();
  for (const node of state.nodes) {
    const arr = nodesByName.get(node.name) ?? [];
    arr.push(node);
    nodesByName.set(node.name, arr);
  }
  for (const chain of nodesByName.values()) {
    if (chain.length < 2) continue;
    chain.sort((a, b) => a.attemptIndex - b.attemptIndex);
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1];
      const b = chain[i];
      ctx.strokeStyle = rgba([160, 140, 100], 0.4 * intensity);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Reuse arcs — curved from originator's latest approved node to the
  // calling dept's row at the reuse turn.
  for (const arc of state.arcs) {
    const originNodes = nodesByName.get(arc.name) ?? [];
    const origin = originNodes.find(n => n.outcome === 'approved');
    if (!origin) continue;
    const callingDeptIdx = depts.indexOf(arc.callingDept || origin.department);
    if (callingDeptIdx < 0) continue;
    const arcX = padL + turnStep * (arc.turn - 0.5);
    const arcY = padT + deptStep * (callingDeptIdx + 0.5);
    const rgb = deptRgb(arc.originDept);
    ctx.strokeStyle = rgba(rgb, 0.55 * intensity);
    ctx.lineWidth = 1.2;
    const mx = (origin.x + arcX) / 2;
    const my = (origin.y + arcY) / 2 - Math.abs(origin.y - arcY) * 0.25 - 14;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.quadraticCurveTo(mx, my, arcX, arcY);
    ctx.stroke();
    // Small dot at the reuse endpoint.
    ctx.fillStyle = rgba(rgb, 0.75 * intensity);
    ctx.beginPath();
    ctx.arc(arcX, arcY, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nodes themselves — approved = filled dept color, rejected = open ring dashed.
  for (const node of state.nodes) {
    const rgb = deptRgb(node.department);
    if (node.outcome === 'approved') {
      ctx.fillStyle = rgba(rgb, 0.9 * intensity);
      ctx.beginPath();
      ctx.arc(node.x, node.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(rgb, intensity);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 3.5, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = rgba([200, 90, 80], 0.85 * intensity);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([1.5, 1.5]);
      ctx.beginPath();
      ctx.arc(node.x, node.y, 3.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

/**
 * Hit test for a forge node at (x, y). Uses the node radius from the
 * renderer (3.5px approved, 3.2px rejected) with a small slop for
 * easier mouse targeting. Iterates in reverse so later-drawn nodes
 * (typically later attempts) win overlap ties.
 */
export function hitTestForge(state: ForgeState, x: number, y: number): ForgeNode | null {
  const slop = 2;
  for (let i = state.nodes.length - 1; i >= 0; i--) {
    const node = state.nodes[i];
    const r = (node.outcome === 'approved' ? 3.5 : 3.2) + slop;
    const dx = x - node.x;
    const dy = y - node.y;
    if (dx * dx + dy * dy <= r * r) return node;
  }
  return null;
}
