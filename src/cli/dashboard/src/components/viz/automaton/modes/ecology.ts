/**
 * Ecology — Metrics Heatmap
 *
 * Replaces the prior static sector hex grid. That design had
 * deterministic geometry so the two leader panels looked identical
 * with only subtle shading differences. This version shows the colony
 * state directly: one tile per key metric (population, morale, food,
 * power, deaths, births, infrastructure), colored by health, with the
 * current value printed below. Two leaders with diverging metrics
 * read apart immediately.
 *
 * Scenario-agnostic — metric list comes from the current snapshot's
 * colony object plus universal fields (morale, population, deaths).
 *
 * Module contract preserved: createEcologyState / ensureEcologyLayout
 * / tickEcology / drawEcology / hitTestEcology. AutomatonCanvas.tsx
 * consumes this module without modification.
 *
 * @module paracosm/cli/dashboard/viz/automaton/modes/ecology
 */
import type { TurnSnapshot } from '../../viz-types.js';
import { rgba } from '../shared.js';

type Trend = 'up' | 'down' | 'flat';

/** One metric tile. */
export interface HexCell {
  id: string;
  label: string;
  value: number;
  /** 0-1 health; green near 1, amber mid, red near 0. */
  health: number;
  /** Formatted value string shown on the tile. */
  display: string;
  trend: Trend;
  /** Delta from previous turn (raw units). */
  delta: number;
  /** Tile rect in canvas coords. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Event pulse fires for one turn after a relevant event category. */
  eventPulse: number;
}

/**
 * How many past turns of each metric to keep for the in-tile sparkline.
 * Short enough to render at low resolution; long enough to read a
 * direction over a typical run.
 */
const METRIC_HISTORY_LIMIT = 12;

export interface EcologyState {
  cells: HexCell[];
  layoutW: number;
  layoutH: number;
  lastTurn: number;
  prevValues: Map<string, number>;
  /** Per-metric value trail, oldest → newest. Bounded by METRIC_HISTORY_LIMIT. */
  history: Map<string, number[]>;
}

export function createEcologyState(): EcologyState {
  return {
    cells: [],
    layoutW: 0,
    layoutH: 0,
    lastTurn: -1,
    prevValues: new Map(),
    history: new Map(),
  };
}

/**
 * Build the metric tile list. Universal metrics (population, morale,
 * food, power, deaths, births) are always shown; additional colony
 * fields that the scenario exposes get added as extra tiles.
 */
function buildMetricList(snapshot: TurnSnapshot): Array<{ id: string; label: string; value: number; healthFn: (v: number) => number; display: string }> {
  const out: Array<{ id: string; label: string; value: number; healthFn: (v: number) => number; display: string }> = [];
  const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
  const fmtMo = (v: number) => `${v.toFixed(1)}mo`;
  const fmtInt = (v: number) => `${Math.round(v)}`;
  const fmtKw = (v: number) => `${Math.round(v)}kW`;

  out.push({
    id: 'population',
    label: 'POP',
    value: snapshot.population,
    healthFn: v => Math.min(1, v / 100),
    display: fmtInt(snapshot.population),
  });
  out.push({
    id: 'morale',
    label: 'MORALE',
    value: snapshot.morale,
    healthFn: v => Math.max(0, Math.min(1, v)),
    display: fmtPct(snapshot.morale),
  });
  out.push({
    id: 'food',
    label: 'FOOD',
    value: snapshot.foodReserve,
    healthFn: v => Math.min(1, v / 18),
    display: fmtMo(snapshot.foodReserve),
  });
  out.push({
    id: 'deaths',
    label: 'DEATHS',
    value: snapshot.deaths,
    // More deaths = worse; invert. Cap scaling so 5 deaths still reads as red.
    healthFn: v => Math.max(0, 1 - v / 5),
    display: fmtInt(snapshot.deaths),
  });
  out.push({
    id: 'births',
    label: 'BIRTHS',
    value: snapshot.births,
    healthFn: v => Math.min(1, v / 3),
    display: fmtInt(snapshot.births),
  });

  // Additional colony metrics surfaced from the snapshot if present.
  // TurnSnapshot doesn't currently ship power/infra — only morale/food
  // are in the type. Additional fields can be added here as the
  // runtime exposes them without breaking scenarios that lack them.
  const colony = (snapshot as TurnSnapshot & { colony?: Record<string, number> }).colony;
  if (colony && typeof colony === 'object') {
    if (typeof colony.powerKw === 'number') {
      out.push({
        id: 'power',
        label: 'POWER',
        value: colony.powerKw,
        healthFn: v => Math.min(1, v / 500),
        display: fmtKw(colony.powerKw),
      });
    }
    if (typeof colony.infrastructureModules === 'number') {
      out.push({
        id: 'infra',
        label: 'INFRA',
        value: colony.infrastructureModules,
        healthFn: v => Math.min(1, v / 10),
        display: fmtInt(colony.infrastructureModules),
      });
    }
  }

  return out;
}

function healthColor(h: number): [number, number, number] {
  // Green (0.85) → amber (0.5) → red (0.25) → deep red (0).
  if (h > 0.7) return [0x6a, 0xad, 0x48];
  if (h > 0.45) return [0xd4, 0x94, 0x40];
  if (h > 0.2) return [0xd4, 0x6a, 0x30];
  return [0xc4, 0x3a, 0x28];
}

/** Ecology layout: rectangular grid of metric tiles. */
export function ensureEcologyLayout(
  state: EcologyState,
  snapshot: TurnSnapshot,
  width: number,
  height: number,
  _scenarioDepartments: string[],
): void {
  if (!snapshot) return;
  const metrics = buildMetricList(snapshot);
  if (metrics.length === 0) return;

  // Layout grid: aim for up to 4 columns, stack rows beneath.
  const cols = Math.min(metrics.length, Math.max(2, Math.min(4, Math.floor(width / 120))));
  const rows = Math.ceil(metrics.length / cols);
  const padX = 18;
  const padY = 18;
  const gapX = 10;
  const gapY = 14;
  const tileW = Math.max(80, (width - padX * 2 - gapX * (cols - 1)) / cols);
  const tileH = Math.max(56, (height - padY * 2 - gapY * (rows - 1)) / rows);

  const prevCells = new Map<string, HexCell>();
  for (const c of state.cells) prevCells.set(c.id, c);

  state.cells = metrics.map((m, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = padX + col * (tileW + gapX);
    const y = padY + row * (tileH + gapY);
    const prevValue = state.prevValues.get(m.id);
    const delta = prevValue === undefined ? 0 : m.value - prevValue;
    const trend: Trend = Math.abs(delta) < 1e-6 ? 'flat' : delta > 0 ? 'up' : 'down';
    const prev = prevCells.get(m.id);
    return {
      id: m.id,
      label: m.label,
      value: m.value,
      health: m.healthFn(m.value),
      display: m.display,
      trend,
      delta,
      x,
      y,
      w: tileW,
      h: tileH,
      eventPulse: prev ? Math.max(0, prev.eventPulse - 0.02) : 0,
    };
  });
  state.layoutW = width;
  state.layoutH = height;
}

export interface EcologyTickInput {
  snapshot: TurnSnapshot;
  forgedDepartmentsThisTurn: Set<string>;
  nowMs: number;
}

export function tickEcology(state: EcologyState, input: EcologyTickInput): void {
  const { snapshot } = input;
  if (snapshot.turn <= state.lastTurn) return;

  // Update prev values AFTER layout has captured them for delta.
  for (const cell of state.cells) {
    state.prevValues.set(cell.id, cell.value);
    // Append the current value to the rolling metric trail. ensureEcologyLayout
    // already refreshed cell.value for this turn, so this records the NEW
    // reading before the next tick overwrites it.
    const trail = state.history.get(cell.id) ?? [];
    trail.push(cell.value);
    if (trail.length > METRIC_HISTORY_LIMIT) trail.splice(0, trail.length - METRIC_HISTORY_LIMIT);
    state.history.set(cell.id, trail);
  }

  // Event pulses: bump affected tiles briefly when a related event category fires.
  const cats = (snapshot.eventCategories ?? []).map(c => c.toLowerCase());
  for (const cell of state.cells) {
    if (cell.id === 'population' && cats.some(c => c.includes('medical'))) cell.eventPulse = 1;
    if (cell.id === 'morale' && cats.some(c => c.includes('psych') || c.includes('social'))) cell.eventPulse = 1;
    if (cell.id === 'food' && cats.some(c => c.includes('resource') || c.includes('environment'))) cell.eventPulse = 1;
    if (cell.id === 'power' && cats.some(c => c.includes('infrastructure') || c.includes('tech'))) cell.eventPulse = 1;
    if (cell.id === 'deaths' && snapshot.deaths > 0) cell.eventPulse = 1;
  }

  state.lastTurn = snapshot.turn;
}

function trendGlyph(t: Trend): string {
  if (t === 'up') return '\u2191';
  if (t === 'down') return '\u2193';
  return '\u2014';
}

export interface EcologyDrawOptions {
  ctx: CanvasRenderingContext2D;
  nowMs: number;
  intensity: number;
  width: number;
  height: number;
  currentTurn: number;
  hoveredCell?: HexCell | null;
}

export function drawEcology(state: EcologyState, opts: EcologyDrawOptions): void {
  const { ctx, width, height, intensity, hoveredCell } = opts;
  ctx.clearRect(0, 0, width, height);
  if (state.cells.length === 0) {
    ctx.fillStyle = rgba([150, 140, 120], 0.4);
    ctx.font = '11px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('no metrics yet', width / 2, height / 2);
    return;
  }

  for (const cell of state.cells) {
    const rgb = healthColor(cell.health);
    const alpha = 0.35 + 0.4 * intensity;
    // Base tile fill.
    ctx.fillStyle = rgba(rgb, alpha);
    ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
    // Border.
    ctx.strokeStyle = rgba(rgb, 0.7 * intensity);
    ctx.lineWidth = 1;
    ctx.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.w - 1, cell.h - 1);

    // Event pulse overlay.
    if (cell.eventPulse > 0) {
      ctx.strokeStyle = rgba([240, 220, 190], cell.eventPulse * 0.7 * intensity);
      ctx.lineWidth = 2;
      ctx.strokeRect(cell.x + 2, cell.y + 2, cell.w - 4, cell.h - 4);
    }

    // Label.
    ctx.fillStyle = rgba([240, 234, 220], 0.85 * intensity);
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(cell.label, cell.x + 8, cell.y + 8);

    // Value + trend.
    ctx.fillStyle = rgba([248, 240, 224], 0.95 * intensity);
    ctx.font = 'bold 16px ui-sans-serif, system-ui';
    ctx.textBaseline = 'middle';
    ctx.fillText(cell.display, cell.x + 8, cell.y + cell.h / 2 + 4);

    // Trend arrow + delta.
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    const trendColor = cell.trend === 'up' ? [0x8a, 0xc4, 0x68]
      : cell.trend === 'down' ? [0xd4, 0x6a, 0x5a]
      : [0x9a, 0x90, 0x7e];
    ctx.fillStyle = rgba(trendColor as [number, number, number], 0.85 * intensity);
    const deltaStr = Math.abs(cell.delta) < 0.01 ? '—' : `${cell.delta > 0 ? '+' : ''}${Math.abs(cell.delta) < 1 ? cell.delta.toFixed(2) : cell.delta.toFixed(0)}`;
    ctx.fillText(`${trendGlyph(cell.trend)} ${deltaStr}`, cell.x + cell.w - 8, cell.y + 8);

    // Sparkline — last N turn values plotted along the bottom of the
    // tile. Shows whether the current reading continues a trajectory
    // vs an anomaly. Only drawn when there are at least 2 points.
    const trail = state.history.get(cell.id);
    if (trail && trail.length >= 2) {
      const sparkPadX = 8;
      const sparkPadBottom = 6;
      const sparkH = Math.min(14, cell.h * 0.22);
      const sparkW = cell.w - sparkPadX * 2;
      const sparkX0 = cell.x + sparkPadX;
      const sparkY1 = cell.y + cell.h - sparkPadBottom;
      const sparkY0 = sparkY1 - sparkH;
      let min = Infinity;
      let max = -Infinity;
      for (const v of trail) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const span = max - min || 1;
      ctx.strokeStyle = rgba(rgb, 0.7 * intensity);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < trail.length; i++) {
        const x = sparkX0 + (sparkW * i) / (trail.length - 1);
        const norm = (trail[i] - min) / span;
        const y = sparkY1 - norm * sparkH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // Mark the current (latest) point so the eye can find it.
      const lastIdx = trail.length - 1;
      const lastX = sparkX0 + sparkW;
      const lastNorm = (trail[lastIdx] - min) / span;
      const lastY = sparkY1 - lastNorm * sparkH;
      ctx.fillStyle = rgba(rgb, 0.95 * intensity);
      ctx.beginPath();
      ctx.arc(lastX, lastY, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hover highlight.
    if (hoveredCell && hoveredCell.id === cell.id) {
      ctx.strokeStyle = rgba([255, 255, 255], 0.75);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cell.x + 1, cell.y + 1, cell.w - 2, cell.h - 2);
    }
  }
}

export function hitTestEcology(state: EcologyState, x: number, y: number): HexCell | null {
  for (const cell of state.cells) {
    if (x >= cell.x && x <= cell.x + cell.w && y >= cell.y && y <= cell.y + cell.h) return cell;
  }
  return null;
}
