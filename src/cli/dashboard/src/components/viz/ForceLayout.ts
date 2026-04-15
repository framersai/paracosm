import type { ForceNode } from './viz-types';
import { RANK_SIZES } from './viz-types';

export interface ClusterCenter {
  id: string;
  x: number;
  y: number;
  radius: number;
  label: string;
}

/**
 * Compute fixed cluster center positions for departments.
 * Uses a 2-3 column grid layout within the canvas.
 */
export function computeClusterCenters(
  departments: string[],
  width: number,
  height: number,
  populationCounts: Record<string, number>,
): ClusterCenter[] {
  const n = departments.length;
  if (n === 0) return [];

  const cols = n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const padX = width * 0.08;
  const padY = height * 0.08;
  const cellW = (width - padX * 2) / cols;
  const cellH = (height - padY * 2) / rows;

  return departments.map((id, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const pop = populationCounts[id] || 1;
    const maxPop = Math.max(...Object.values(populationCounts), 1);
    const radius = 30 + (pop / maxPop) * 50;

    return {
      id,
      x: padX + cellW * (col + 0.5),
      y: padY + cellH * (row + 0.5),
      radius,
      label: id.charAt(0).toUpperCase() + id.slice(1),
    };
  });
}

/**
 * Place cells in a hex-packed grid around their cluster center.
 * Each cell gets a stable grid position. No random placement.
 */
function hexPackPositions(count: number, cx: number, cy: number, spacing: number): Array<{ x: number; y: number }> {
  if (count === 0) return [];
  const positions: Array<{ x: number; y: number }> = [];

  // Spiral hex packing from center outward
  positions.push({ x: cx, y: cy });
  let ring = 1;
  while (positions.length < count) {
    const rowHeight = spacing * 0.866; // sqrt(3)/2
    for (let side = 0; side < 6 && positions.length < count; side++) {
      for (let step = 0; step < ring && positions.length < count; step++) {
        // Hex directions
        const dirs = [
          [1, 0], [0.5, rowHeight / spacing], [-0.5, rowHeight / spacing],
          [-1, 0], [-0.5, -rowHeight / spacing], [0.5, -rowHeight / spacing],
        ];
        const prevDir = dirs[(side + 4) % 6];
        const curDir = dirs[side];
        const x = cx + (prevDir[0] * ring + curDir[0] * step) * spacing;
        const y = cy + (prevDir[1] * ring + curDir[1] * step) * spacing;
        positions.push({ x, y });
      }
    }
    ring++;
  }

  return positions.slice(0, count);
}

/**
 * Initialize ForceNodes with hex-packed positions within clusters.
 */
export function initNodes(
  cells: Array<{ agentId: string; department: string; rank: string; alive: boolean; marsborn: boolean; psychScore: number; partnerId?: string; childrenIds: string[]; featured: boolean; mood: string }>,
  clusters: ClusterCenter[],
): ForceNode[] {
  const clusterMap = new Map(clusters.map(c => [c.id, c]));

  // Group cells by department
  const byDept: Record<string, typeof cells> = {};
  for (const cell of cells) {
    if (!byDept[cell.department]) byDept[cell.department] = [];
    byDept[cell.department].push(cell);
  }

  const nodes: ForceNode[] = [];

  for (const [dept, deptCells] of Object.entries(byDept)) {
    const cluster = clusterMap.get(dept);
    const cx = cluster?.x ?? 200;
    const cy = cluster?.y ?? 200;
    const spacing = 14; // Cell spacing in pixels
    const positions = hexPackPositions(deptCells.length, cx, cy, spacing);

    for (let i = 0; i < deptCells.length; i++) {
      const cell = deptCells[i];
      const pos = positions[i];
      nodes.push({
        id: cell.agentId,
        x: pos.x, y: pos.y,
        vx: 0, vy: 0,
        prevX: pos.x, prevY: pos.y,
        department: cell.department,
        rank: cell.rank as ForceNode['rank'],
        alive: cell.alive,
        marsborn: cell.marsborn,
        psychScore: cell.psychScore,
        partnerId: cell.partnerId,
        childrenIds: cell.childrenIds,
        featured: cell.featured,
        mood: cell.mood,
      });
    }
  }

  return nodes;
}

/** Target positions for each node, computed from hex grid. */
const targetPositions = new Map<string, { x: number; y: number }>();

/**
 * Run one tick. Cells gently drift toward their hex grid target.
 * Almost no movement once settled. Subtle organic breathing only.
 */
export function tickForce(
  nodes: ForceNode[],
  clusters: ClusterCenter[],
  canvasWidth: number,
  canvasHeight: number,
): void {
  const clusterMap = new Map(clusters.map(c => [c.id, c]));
  const alive = nodes.filter(n => n.alive);

  // Recompute targets if cluster layout changed
  const byDept: Record<string, ForceNode[]> = {};
  for (const node of alive) {
    if (!byDept[node.department]) byDept[node.department] = [];
    byDept[node.department].push(node);
  }

  for (const [dept, deptNodes] of Object.entries(byDept)) {
    const cluster = clusterMap.get(dept);
    if (!cluster) continue;
    const spacing = 14;
    const positions = hexPackPositions(deptNodes.length, cluster.x, cluster.y, spacing);
    for (let i = 0; i < deptNodes.length; i++) {
      targetPositions.set(deptNodes[i].id, positions[i]);
    }
  }

  // Move toward target with heavy damping
  for (const node of alive) {
    const target = targetPositions.get(node.id);
    if (!target) continue;

    const dx = target.x - node.x;
    const dy = target.y - node.y;

    // Strong spring toward hex grid position
    node.vx += dx * 0.08;
    node.vy += dy * 0.08;

    // Very subtle breathing (not random jitter)
    const t = Date.now() / 3000;
    const breathX = Math.sin(t + node.x * 0.01) * 0.02;
    const breathY = Math.cos(t + node.y * 0.01) * 0.02;
    node.vx += breathX;
    node.vy += breathY;

    // Heavy damping so cells settle fast
    node.vx *= 0.6;
    node.vy *= 0.6;

    // Kill micro-movement (prevents perpetual jiggle)
    if (Math.abs(node.vx) < 0.01) node.vx = 0;
    if (Math.abs(node.vy) < 0.01) node.vy = 0;

    node.prevX = node.x;
    node.prevY = node.y;
    node.x += node.vx;
    node.y += node.vy;

    // Clamp
    node.x = Math.max(6, Math.min(canvasWidth - 6, node.x));
    node.y = Math.max(6, Math.min(canvasHeight - 6, node.y));
  }
}

/**
 * Update nodes for a new turn snapshot.
 * Existing nodes keep position, new nodes get placed in hex grid.
 */
export function syncNodes(
  nodes: ForceNode[],
  cells: Array<{ agentId: string; department: string; rank: string; alive: boolean; marsborn: boolean; psychScore: number; partnerId?: string; childrenIds: string[]; featured: boolean; mood: string }>,
  clusters: ClusterCenter[],
): ForceNode[] {
  const existingMap = new Map(nodes.map(n => [n.id, n]));
  const clusterMap = new Map(clusters.map(c => [c.id, c]));

  // Group new cells by department for hex placement of births
  const byDept: Record<string, typeof cells> = {};
  for (const cell of cells) {
    if (!byDept[cell.department]) byDept[cell.department] = [];
    byDept[cell.department].push(cell);
  }

  const result: ForceNode[] = [];

  for (const [dept, deptCells] of Object.entries(byDept)) {
    const cluster = clusterMap.get(dept);
    const cx = cluster?.x ?? 200;
    const cy = cluster?.y ?? 200;
    const positions = hexPackPositions(deptCells.length, cx, cy, 14);

    for (let i = 0; i < deptCells.length; i++) {
      const cell = deptCells[i];
      const existing = existingMap.get(cell.agentId);

      if (existing) {
        existing.department = cell.department;
        existing.rank = cell.rank as ForceNode['rank'];
        existing.alive = cell.alive;
        existing.marsborn = cell.marsborn;
        existing.psychScore = cell.psychScore;
        existing.partnerId = cell.partnerId;
        existing.childrenIds = cell.childrenIds;
        existing.featured = cell.featured;
        existing.mood = cell.mood;
        result.push(existing);
      } else {
        // Birth: start at cluster center, will drift to hex position
        result.push({
          id: cell.agentId,
          x: cx, y: cy,
          vx: 0, vy: 0,
          prevX: cx, prevY: cy,
          department: cell.department,
          rank: cell.rank as ForceNode['rank'],
          alive: cell.alive,
          marsborn: cell.marsborn,
          psychScore: cell.psychScore,
          partnerId: cell.partnerId,
          childrenIds: cell.childrenIds,
          featured: cell.featured,
          mood: cell.mood,
        });
      }
    }
  }

  return result;
}
