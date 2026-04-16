import type { SquareGrid } from './ForceLayout';
import type { VizMode, SnapshotDiff } from './viz-types';
import { DEPARTMENT_COLORS, DEFAULT_DEPT_COLOR, CATEGORY_COLORS } from './viz-types';

export interface RenderOptions {
  focusedId: string | null;
  hoveredId: string | null;
  mode: VizMode;
  diff?: SnapshotDiff;
  /** ms since current turn started — used to animate births/deaths/event flash. */
  pulsePhaseMs: number;
  /** Categories of events that occurred this turn (for full-grid color flash). */
  eventCategories?: string[];
  /** Cells alive in this timeline but dead in the other (divergence overlay). */
  divergedIds?: Set<string>;
}

/** Color a cell by mode. */
function cellColor(occ: { department: string; age?: number; generation?: number; mood: string }, mode: VizMode): string {
  switch (mode) {
    case 'age': {
      // Bright (yellow) when newborn, fading to deep red when elderly
      const age = occ.age ?? 30;
      const t = Math.min(1, age / 80);
      // Interpolate between #f5d27a (young) → #c44a1e (old)
      const r = Math.round(245 + (196 - 245) * t);
      const g = Math.round(210 + (74 - 210) * t);
      const b = Math.round(122 + (30 - 122) * t);
      return `rgb(${r},${g},${b})`;
    }
    case 'generation': {
      // Earth-born = teal, mars-born deeper = brighter amber
      const gen = occ.generation ?? 0;
      if (gen === 0) return '#4ca8a8';
      const t = Math.min(1, (gen - 1) / 3);
      const r = Math.round(232 + (255 - 232) * t);
      const g = Math.round(180 + (120 - 180) * t);
      const b = Math.round(74 + (40 - 74) * t);
      return `rgb(${r},${g},${b})`;
    }
    case 'mood':
      return moodToColor(occ.mood);
    case 'department':
    default:
      return DEPARTMENT_COLORS[occ.department] || DEFAULT_DEPT_COLOR;
  }
}

function moodToColor(mood: string): string {
  switch (mood) {
    case 'positive': case 'hopeful': return '#6aad48';
    case 'negative': case 'anxious': case 'resigned': return '#e06530';
    case 'defiant': return '#e8b44a';
    default: return '#a89878';
  }
}

/**
 * Render the square grid in Conway's Game of Life style.
 *
 * - Empty cells: faint outline (the "dead" cells)
 * - Occupied cells: filled square, color depends on mode
 * - Mars-born: small dot in center
 * - Hovered: name label beside cell
 * - Focused: bright border (and partner/children highlighted, others dimmed)
 * - Newly born: green pulse for ~2s
 * - Newly dead: red fade-out for ~2s
 * - Divergent (alive only in this timeline): persistent rust outline
 * - Event flash: brief category-colored vignette over the whole grid
 */
export function renderSquareGrid(
  ctx: CanvasRenderingContext2D,
  grid: SquareGrid,
  width: number,
  height: number,
  opts: RenderOptions,
): void {
  ctx.clearRect(0, 0, width, height);

  // Event flash background (decays over the first 1.2s of the turn)
  if (opts.eventCategories?.length) {
    const flashAlpha = Math.max(0, 0.18 * (1 - opts.pulsePhaseMs / 1200));
    if (flashAlpha > 0.01) {
      const cat = opts.eventCategories[0];
      const flash = CATEGORY_COLORS[cat] || '#a89878';
      ctx.globalAlpha = flashAlpha;
      ctx.fillStyle = flash;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
  }

  const size = grid.cellPx;
  const focused = opts.focusedId;
  const hovered = opts.hoveredId;
  const focusedOcc = focused ? grid.cells.find(c => c.occupant?.agentId === focused)?.occupant : null;
  const focusFamily = new Set<string>();
  if (focusedOcc) {
    focusFamily.add(focusedOcc.agentId);
    if (focusedOcc.partnerId) focusFamily.add(focusedOcc.partnerId);
    for (const id of focusedOcc.childrenIds || []) focusFamily.add(id);
  }

  // Pass 1: empty cells (faint grid)
  ctx.fillStyle = '#ffffff06';
  for (const cell of grid.cells) {
    if (cell.occupant) continue;
    ctx.fillRect(cell.px, cell.py, size, size);
  }

  // Pass 2: occupied cells
  for (const cell of grid.cells) {
    if (!cell.occupant) continue;
    const occ = cell.occupant;
    const color = cellColor(occ, opts.mode);
    const isDimmed = focused && !focusFamily.has(occ.agentId);
    const isHovered = occ.agentId === hovered;
    const isFocused = occ.agentId === focused;
    const isBorn = opts.diff?.bornIds.has(occ.agentId);
    const isDying = opts.diff?.diedIds.has(occ.agentId);
    const isDiverged = opts.divergedIds?.has(occ.agentId);

    // Base alpha — psychScore drives brightness in dept/mood modes
    const psychBoost = (opts.mode === 'department' || opts.mode === 'mood') ? occ.psychScore * 0.65 : 0.5;
    const alpha = isDimmed ? 0.12 : 0.35 + psychBoost;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(cell.px, cell.py, size, size);

    // Glow for high psych (in dept/mood modes only)
    if (!isDimmed && (opts.mode === 'department' || opts.mode === 'mood') && occ.psychScore > 0.6) {
      const glow = ctx.createRadialGradient(
        cell.px + size / 2, cell.py + size / 2, 0,
        cell.px + size / 2, cell.py + size / 2, size,
      );
      glow.addColorStop(0, color + '40');
      glow.addColorStop(1, color + '00');
      ctx.globalAlpha = occ.psychScore * 0.5;
      ctx.fillStyle = glow;
      ctx.fillRect(cell.px - size / 2, cell.py - size / 2, size * 2, size * 2);
    }

    // Mars-born marker — only show in non-generation modes (gen mode encodes this in color)
    if (occ.marsborn && opts.mode !== 'generation') {
      ctx.globalAlpha = isDimmed ? 0.1 : 0.5;
      ctx.fillStyle = '#f5f0e4';
      const dotSize = Math.max(2, size * 0.2);
      ctx.beginPath();
      ctx.arc(cell.px + size / 2, cell.py + size / 2, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Featured: pulsing border
    if (occ.featured && !isDimmed) {
      const pulse = 0.5 + Math.sin(Date.now() / 400) * 0.3;
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cell.px - 1, cell.py - 1, size + 2, size + 2);
    }

    // Newly born: green pulsing outline (2s)
    if (isBorn) {
      const t = Math.min(1, opts.pulsePhaseMs / 2000);
      const pulseAlpha = (1 - t) * (0.6 + Math.sin(opts.pulsePhaseMs / 120) * 0.3);
      ctx.globalAlpha = Math.max(0, pulseAlpha);
      ctx.strokeStyle = '#6aad48';
      ctx.lineWidth = 2;
      ctx.strokeRect(cell.px - 1.5, cell.py - 1.5, size + 3, size + 3);
    }

    // Diverged (alive only in this timeline): persistent rust outline
    if (isDiverged && !isDimmed) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#e06530';
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cell.px - 0.5, cell.py - 0.5, size + 1, size + 1);
      ctx.setLineDash([]);
    }

    // Focus: bright white border on the focused cell + partners/children
    if (isFocused) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#f5f0e4';
      ctx.lineWidth = 2;
      ctx.strokeRect(cell.px - 1, cell.py - 1, size + 2, size + 2);
    } else if (focused && focusFamily.has(occ.agentId)) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#e8b44a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cell.px - 0.5, cell.py - 0.5, size + 1, size + 1);
    }

    // Hover: highlight border
    if (isHovered && !isDimmed && !isFocused) {
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#f5f0e4';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cell.px - 0.5, cell.py - 0.5, size + 1, size + 1);
    }

    ctx.globalAlpha = 1;
  }

  // Pass 3: dying cells (red fade-out X marks, render after live cells so they overlay)
  if (opts.diff?.diedIds.size) {
    const t = Math.min(1, opts.pulsePhaseMs / 2000);
    const fade = 1 - t;
    const indexById = new Map<string, { px: number; py: number }>();
    for (const cell of grid.cells) {
      if (cell.occupant) indexById.set(cell.occupant.agentId, cell);
    }
    for (const id of opts.diff.diedIds) {
      const cell = indexById.get(id);
      // Dead cells removed from grid — draw a fading red square at last-known position
      // approximated by department block centroid. Skip if we lost track.
      if (!cell) continue;
      ctx.globalAlpha = fade * 0.6;
      ctx.fillStyle = '#e06530';
      ctx.fillRect(cell.px, cell.py, size, size);
      ctx.globalAlpha = fade;
      ctx.strokeStyle = '#c44a1e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cell.px + 2, cell.py + 2);
      ctx.lineTo(cell.px + size - 2, cell.py + size - 2);
      ctx.moveTo(cell.px + size - 2, cell.py + 2);
      ctx.lineTo(cell.px + 2, cell.py + size - 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Pass 4: partner connection lines (subtle)
  drawConnections(ctx, grid, focused);
}

function drawConnections(ctx: CanvasRenderingContext2D, grid: SquareGrid, focusedId: string | null): void {
  const size = grid.cellPx;
  const cellMap = new Map<string, { px: number; py: number }>();
  for (const cell of grid.cells) {
    if (cell.occupant) cellMap.set(cell.occupant.agentId, { px: cell.px + size / 2, py: cell.py + size / 2 });
  }

  for (const cell of grid.cells) {
    if (!cell.occupant || !cell.occupant.partnerId) continue;
    const partner = cellMap.get(cell.occupant.partnerId);
    if (!partner) continue;
    if (cell.occupant.agentId > cell.occupant.partnerId) continue; // draw once per pair

    const isFocused = focusedId === cell.occupant.agentId || focusedId === cell.occupant.partnerId;
    ctx.strokeStyle = isFocused ? '#e8b44a60' : '#e8b44a10';
    ctx.lineWidth = isFocused ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(cell.px + size / 2, cell.py + size / 2);
    ctx.lineTo(partner.px, partner.py);
    ctx.stroke();
  }
}

/**
 * Draw legend in bottom-right corner. Adapts label list to the current viz mode.
 */
export function drawLegend(
  ctx: CanvasRenderingContext2D,
  departments: string[],
  width: number,
  height: number,
  mode: VizMode = 'department',
): void {
  const padR = 10;
  const padB = 10;
  const lineH = 13;
  const legendW = 110;

  let entries: Array<{ color: string; label: string }>;
  switch (mode) {
    case 'age':
      entries = [
        { color: '#f5d27a', label: 'YOUNG' },
        { color: '#dba24c', label: 'MID' },
        { color: '#c44a1e', label: 'ELDERLY' },
      ];
      break;
    case 'generation':
      entries = [
        { color: '#4ca8a8', label: 'EARTH-BORN' },
        { color: '#e8b44a', label: 'MARS-BORN G1' },
        { color: '#ff7828', label: 'MARS-BORN G2+' },
      ];
      break;
    case 'mood':
      entries = [
        { color: '#6aad48', label: 'POSITIVE' },
        { color: '#e8b44a', label: 'DEFIANT' },
        { color: '#e06530', label: 'NEGATIVE' },
        { color: '#a89878', label: 'NEUTRAL' },
      ];
      break;
    case 'department':
    default:
      entries = departments.map(d => ({ color: DEPARTMENT_COLORS[d] || DEFAULT_DEPT_COLOR, label: d.toUpperCase() }));
      break;
  }

  const totalRows = entries.length + (mode === 'department' ? 4 : 2);
  const legendH = totalRows * lineH + 14;
  const x0 = width - legendW - padR;
  const y0 = height - legendH - padB;

  ctx.fillStyle = '#0a0806e0';
  ctx.beginPath();
  ctx.roundRect(x0, y0, legendW, legendH, 4);
  ctx.fill();

  let y = y0 + 11;
  ctx.font = '700 7px var(--mono, monospace)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#a89878';
  ctx.fillText(`LEGEND · ${mode.toUpperCase()}`, x0 + 8, y);
  y += lineH + 2;

  ctx.font = '500 7px var(--mono, monospace)';
  for (const e of entries) {
    ctx.fillStyle = e.color;
    ctx.fillRect(x0 + 8, y - 3, 6, 6);
    ctx.fillStyle = '#a89878';
    ctx.fillText(e.label, x0 + 18, y);
    y += lineH;
  }

  if (mode === 'department') {
    y += 3;
    ctx.fillStyle = '#686050';
    ctx.fillText('DOT = NATIVE-BORN', x0 + 8, y); y += lineH;
    ctx.fillText('GLOW = HIGH MOOD', x0 + 8, y); y += lineH;
    ctx.fillText('LINE = PARTNERS', x0 + 8, y);
  } else {
    y += 3;
    ctx.fillStyle = '#686050';
    ctx.fillText('GREEN PULSE = BORN', x0 + 8, y); y += lineH;
    ctx.fillText('RED X = DIED THIS TURN', x0 + 8, y);
  }
}
