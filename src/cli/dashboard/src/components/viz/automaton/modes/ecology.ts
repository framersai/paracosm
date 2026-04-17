import type { TurnSnapshot } from '../../viz-types.js';
import { hashString, mulberry32, rgba } from '../shared.js';

/**
 * Ecology hex grid. Sector-level view of the colony: habitat, power,
 * plus one hex per scenario department. Hex state updates each turn
 * from the TurnSnapshot so viewers watch infrastructure health,
 * population density, and event impact stamps evolve side by side.
 */

type SectorKind =
  | 'habitat'
  | 'power'
  | 'medical'
  | 'engineering'
  | 'agriculture'
  | 'psychology'
  | 'governance'
  | 'research'
  | 'operations'
  | 'industrial';

interface HexCell {
  /** Axial coords (q, r) in flat-top hex grid. */
  q: number;
  r: number;
  /** Pixel center (computed from q, r, size). */
  x: number;
  y: number;
  sector: SectorKind;
  /** 0-1 resource health score, updated per turn. */
  health: number;
  /** Persistent event stamps: 'radiation' + turn born. */
  stamps: Array<{ kind: 'radiation' | 'dust' | 'forge'; bornTurn: number }>;
  /** Population dots (habitat sectors only). */
  dots: number;
}

export interface EcologyState {
  cells: HexCell[];
  size: number;
  layoutW: number;
  layoutH: number;
  layoutKey: string;
  lastTurnSeen: number;
  /** Mapping from department name → SectorKind used for that dept. */
  deptSectorMap: Map<string, SectorKind>;
}

export function createEcologyState(): EcologyState {
  return {
    cells: [],
    size: 16,
    layoutW: 0,
    layoutH: 0,
    layoutKey: '',
    lastTurnSeen: -1,
    deptSectorMap: new Map(),
  };
}

function sectorColor(sector: SectorKind): [number, number, number] {
  switch (sector) {
    case 'habitat': return [0x9c, 0x8a, 0x68];
    case 'power': return [0xe8, 0xb4, 0x4a];
    case 'agriculture': return [0x6a, 0xad, 0x48];
    case 'medical': return [0x4e, 0xcd, 0xc4];
    case 'engineering': return [0xd8, 0x90, 0x30];
    case 'psychology': return [0x9b, 0x6b, 0x9e];
    case 'governance': return [0x7a, 0x8a, 0xa8];
    case 'research': return [0x95, 0x6b, 0xd8];
    case 'operations': return [0xc8, 0x7a, 0x3a];
    case 'industrial': return [0xe0, 0x65, 0x30];
    default: return [0xa8, 0x98, 0x78];
  }
}

function deptToSector(dept: string): SectorKind {
  const d = dept.toLowerCase();
  if (d.includes('medical')) return 'medical';
  if (d.includes('engineer')) return 'engineering';
  if (d.includes('agri')) return 'agriculture';
  if (d.includes('psych')) return 'psychology';
  if (d.includes('govern')) return 'governance';
  if (d.includes('research') || d.includes('science')) return 'research';
  if (d.includes('ops') || d.includes('operations')) return 'operations';
  return 'industrial';
}

/**
 * Build a deterministic hex grid for the given snapshot. Layout is
 * re-generated only if canvas dimensions, sector count, or the
 * department set changes. Leader A and Leader B with the same
 * scenario and canvas size end up with identical layouts — the
 * ecology diverges in STATE, not in GEOMETRY.
 */
export function ensureEcologyLayout(
  state: EcologyState,
  snapshot: TurnSnapshot,
  width: number,
  height: number,
  scenarioDepartments: string[],
): void {
  const depts = scenarioDepartments.slice().sort();
  const layoutKey = `${width}x${height}|${depts.join(',')}`;
  if (layoutKey === state.layoutKey && state.cells.length > 0) return;

  const size = Math.max(10, Math.min(width, height) / 10);
  const hexW = size * 2;
  const hexH = size * Math.sqrt(3);
  const cols = Math.floor((width - hexW) / (hexW * 0.75));
  const rows = Math.floor((height - hexH) / hexH);

  // Sector plan: one hex per dept, plus ~half of remaining as habitat,
  // ~25% as power, ~25% as industrial. Shuffled deterministically so
  // the layout reads as organic clumps, not rows.
  const deptSectorMap = new Map<string, SectorKind>();
  const plannedSectors: SectorKind[] = [];
  for (const dept of depts) {
    const sector = deptToSector(dept);
    deptSectorMap.set(dept, sector);
    plannedSectors.push(sector);
  }

  const totalHexes = Math.min(60, Math.max(24, cols * rows));
  const remainingSlots = totalHexes - plannedSectors.length;
  const habitatCount = Math.max(4, Math.floor(remainingSlots * 0.5));
  const powerCount = Math.max(2, Math.floor(remainingSlots * 0.25));
  const industrialCount = Math.max(0, remainingSlots - habitatCount - powerCount);
  for (let i = 0; i < habitatCount; i++) plannedSectors.push('habitat');
  for (let i = 0; i < powerCount; i++) plannedSectors.push('power');
  for (let i = 0; i < industrialCount; i++) plannedSectors.push('industrial');

  const rng = mulberry32(hashString(layoutKey));
  // Fisher-Yates shuffle for deterministic organic scatter.
  for (let i = plannedSectors.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = plannedSectors[i];
    plannedSectors[i] = plannedSectors[j];
    plannedSectors[j] = tmp;
  }

  state.cells = [];
  state.deptSectorMap = deptSectorMap;
  state.size = size;
  state.layoutW = width;
  state.layoutH = height;
  state.layoutKey = layoutKey;
  state.lastTurnSeen = -1;

  // Place cells in a rectangle, centered. Skip cells whose index
  // exceeds the planned sector list so we don't overshoot.
  const gridW = cols * hexW * 0.75 + hexW * 0.25;
  const gridH = rows * hexH;
  const offsetX = (width - gridW) / 2 + size;
  const offsetY = (height - gridH) / 2 + hexH / 2;

  let idx = 0;
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      if (idx >= plannedSectors.length) break;
      const x = offsetX + col * hexW * 0.75;
      const y = offsetY + row * hexH + (col % 2 === 1 ? hexH / 2 : 0);
      state.cells.push({
        q: col,
        r: row,
        x,
        y,
        sector: plannedSectors[idx],
        health: 1,
        stamps: [],
        dots: plannedSectors[idx] === 'habitat' ? 2 : 0,
      });
      idx++;
    }
  }

  // Initial seed — distribute population across habitat hexes.
  const habitats = state.cells.filter(c => c.sector === 'habitat');
  if (habitats.length > 0 && snapshot) {
    const perHex = Math.max(1, Math.floor(snapshot.population / habitats.length));
    habitats.forEach(h => (h.dots = perHex));
  }
}

export interface EcologyTickInput {
  snapshot: TurnSnapshot;
  forgedDepartmentsThisTurn: Set<string>;
  nowMs: number;
}

export function tickEcology(state: EcologyState, input: EcologyTickInput): void {
  const { snapshot, forgedDepartmentsThisTurn } = input;
  if (snapshot.turn <= state.lastTurnSeen) return;

  // Global health derived from snapshot metrics.
  const morale01 = Math.max(0, Math.min(1, snapshot.morale));
  const foodHealth = Math.max(0, Math.min(1, snapshot.foodReserve / 18));

  for (const cell of state.cells) {
    if (cell.sector === 'habitat') {
      cell.health = 0.4 + morale01 * 0.6;
    } else if (cell.sector === 'agriculture') {
      cell.health = 0.3 + foodHealth * 0.7;
    } else if (cell.sector === 'medical' || cell.sector === 'psychology') {
      cell.health = 0.4 + morale01 * 0.6;
    } else if (cell.sector === 'power') {
      cell.health = 0.5 + morale01 * 0.3;
    } else if (cell.sector === 'engineering') {
      cell.health = 0.5 + foodHealth * 0.3;
    } else {
      cell.health = 0.45 + morale01 * 0.4;
    }
  }

  // Radiation event → stamp a 3-hex cluster.
  const hasEnvironmental = (snapshot.eventCategories ?? []).some(c =>
    c.toLowerCase().includes('environment') || c.toLowerCase().includes('resource'),
  );
  if (hasEnvironmental) {
    const rng = mulberry32(hashString(`rad|${snapshot.turn}`));
    const count = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(rng() * state.cells.length);
      const cell = state.cells[idx];
      cell.stamps.push({ kind: 'radiation', bornTurn: snapshot.turn });
    }
  }

  // Forge pulse for each forging dept.
  for (const dept of forgedDepartmentsThisTurn) {
    const sector = state.deptSectorMap.get(dept) ?? deptToSector(dept);
    const target = state.cells.find(c => c.sector === sector);
    if (target) {
      target.stamps.push({ kind: 'forge', bornTurn: snapshot.turn });
    }
  }

  // Death redistribution — subtract from habitats proportionally.
  const habitats = state.cells.filter(c => c.sector === 'habitat');
  if (habitats.length > 0) {
    const totalPop = habitats.reduce((s, h) => s + h.dots, 0);
    const target = snapshot.population;
    const delta = target - totalPop;
    if (delta !== 0) {
      const sorted = [...habitats].sort((a, b) => b.dots - a.dots);
      let remaining = Math.abs(delta);
      const step = delta > 0 ? 1 : -1;
      while (remaining > 0) {
        for (const h of sorted) {
          if (remaining <= 0) break;
          if (step < 0 && h.dots <= 0) continue;
          h.dots = Math.max(0, h.dots + step);
          remaining -= 1;
        }
        if (sorted.every(h => (step < 0 ? h.dots === 0 : false))) break;
      }
    }
  }

  state.lastTurnSeen = snapshot.turn;
}

function strokeHex(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const px = x + size * Math.cos(angle);
    const py = y + size * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
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
  const { ctx, intensity, width, height, currentTurn } = opts;
  ctx.clearRect(0, 0, width, height);
  if (state.cells.length === 0) return;

  for (const cell of state.cells) {
    const rgb = sectorColor(cell.sector);
    const fill = Math.max(0.15, Math.min(1, cell.health));
    strokeHex(ctx, cell.x, cell.y, state.size - 1);
    ctx.fillStyle = rgba(rgb, 0.25 + fill * 0.45 * intensity);
    ctx.fill();
    ctx.strokeStyle = rgba(rgb, 0.55 * intensity);
    ctx.lineWidth = 1;
    ctx.stroke();

    // Population dots on habitat hexes.
    if (cell.sector === 'habitat' && cell.dots > 0) {
      const n = Math.min(cell.dots, 8);
      const dotR = 1.6;
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n;
        const r = state.size * 0.45;
        const px = cell.x + Math.cos(a) * r;
        const py = cell.y + Math.sin(a) * r;
        ctx.fillStyle = rgba([0xf0, 0xe6, 0xd2], 0.8 * intensity);
        ctx.beginPath();
        ctx.arc(px, py, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Event stamps.
    const radiation = cell.stamps.find(s => s.kind === 'radiation');
    if (radiation) {
      ctx.strokeStyle = rgba([0xe0, 0x65, 0x30], 0.9 * intensity);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cell.x - state.size * 0.5, cell.y);
      ctx.lineTo(cell.x + state.size * 0.5, cell.y);
      ctx.moveTo(cell.x, cell.y - state.size * 0.5);
      ctx.lineTo(cell.x, cell.y + state.size * 0.5);
      ctx.stroke();
    }
    const forgeStamp = cell.stamps.find(s => s.kind === 'forge');
    if (forgeStamp) {
      const age = currentTurn - forgeStamp.bornTurn;
      const pulseAlpha = age === 0 ? 0.95 : age === 1 ? 0.45 : 0;
      if (pulseAlpha > 0) {
        ctx.strokeStyle = rgba([0xf5, 0xf0, 0xe4], pulseAlpha * intensity);
        ctx.lineWidth = 1.5;
        strokeHex(ctx, cell.x, cell.y, state.size + 2);
        ctx.stroke();
      }
    }
  }
}

export function hitTestEcology(state: EcologyState, x: number, y: number): HexCell | null {
  let best: HexCell | null = null;
  let bestDist = Infinity;
  for (const cell of state.cells) {
    const dx = cell.x - x;
    const dy = cell.y - y;
    const d = dx * dx + dy * dy;
    if (d <= state.size * state.size && d < bestDist) {
      bestDist = d;
      best = cell;
    }
  }
  return best;
}

export type { HexCell };
