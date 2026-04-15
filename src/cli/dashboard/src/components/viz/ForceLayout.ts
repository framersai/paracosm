import type { ForceNode } from './viz-types';
import { RANK_SIZES } from './viz-types';

/** Department cluster center positions, computed from canvas dimensions. */
export interface ClusterCenter {
  id: string;
  x: number;
  y: number;
  radius: number;
}

/**
 * Compute fixed cluster center positions for a set of departments.
 * Arranges departments in a 2-3 column grid within the canvas bounds.
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
  const padX = width * 0.12;
  const padY = height * 0.1;
  const cellW = (width - padX * 2) / cols;
  const cellH = (height - padY * 2) / rows;

  return departments.map((id, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const pop = populationCounts[id] || 1;
    const maxPop = Math.max(...Object.values(populationCounts), 1);
    const radius = 20 + (pop / maxPop) * 60;

    return {
      id,
      x: padX + cellW * (col + 0.5),
      y: padY + cellH * (row + 0.5),
      radius,
    };
  });
}

/**
 * Initialize ForceNodes from a cell snapshot array.
 * Positions are seeded around their department cluster center.
 */
export function initNodes(
  cells: Array<{ agentId: string; department: string; rank: string; alive: boolean; marsborn: boolean; psychScore: number; partnerId?: string; childrenIds: string[]; featured: boolean; mood: string }>,
  clusters: ClusterCenter[],
): ForceNode[] {
  const clusterMap = new Map(clusters.map(c => [c.id, c]));

  return cells.map((cell, i) => {
    const cluster = clusterMap.get(cell.department);
    const cx = cluster?.x ?? 200;
    const cy = cluster?.y ?? 200;
    const angle = (i / cells.length) * Math.PI * 2;
    const r = (cluster?.radius ?? 40) * 0.6 * Math.random();
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;

    return {
      id: cell.agentId,
      x, y,
      vx: 0, vy: 0,
      prevX: x, prevY: y,
      department: cell.department,
      rank: cell.rank as ForceNode['rank'],
      alive: cell.alive,
      marsborn: cell.marsborn,
      psychScore: cell.psychScore,
      partnerId: cell.partnerId,
      childrenIds: cell.childrenIds,
      featured: cell.featured,
      mood: cell.mood,
    };
  });
}

/**
 * Run one tick of the Verlet force simulation.
 * Mutates node positions in place for performance.
 */
export function tickForce(
  nodes: ForceNode[],
  clusters: ClusterCenter[],
  canvasWidth: number,
  canvasHeight: number,
): void {
  const clusterMap = new Map(clusters.map(c => [c.id, c]));
  const alive = nodes.filter(n => n.alive);
  const damping = 0.95;
  const jitter = 0.1;

  for (const node of alive) {
    node.vx *= damping;
    node.vy *= damping;

    // Attraction toward department cluster center
    const cluster = clusterMap.get(node.department);
    if (cluster) {
      const dx = cluster.x - node.x;
      const dy = cluster.y - node.y;
      node.vx += dx * 0.02;
      node.vy += dy * 0.02;
    }

    // Random jitter for organic feel
    node.vx += (Math.random() - 0.5) * jitter;
    node.vy += (Math.random() - 0.5) * jitter;
  }

  // Repulsion between nearby cells
  for (let i = 0; i < alive.length; i++) {
    const a = alive[i];
    const sizeA = RANK_SIZES[a.rank] || 8;
    for (let j = i + 1; j < alive.length; j++) {
      const b = alive[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distSq = dx * dx + dy * dy;
      const minDist = (sizeA + (RANK_SIZES[b.rank] || 8)) * 1.5;
      const minDistSq = minDist * minDist;

      if (distSq < minDistSq && distSq > 0.01) {
        const dist = Math.sqrt(distSq);
        const force = 0.5 * (minDist - dist) / dist;
        const fx = dx * force;
        const fy = dy * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }
  }

  // Partner attraction
  const nodeMap = new Map(alive.map(n => [n.id, n]));
  for (const node of alive) {
    if (node.partnerId) {
      const partner = nodeMap.get(node.partnerId);
      if (partner) {
        node.vx += (partner.x - node.x) * 0.01;
        node.vy += (partner.y - node.y) * 0.01;
      }
    }
    for (const childId of node.childrenIds) {
      const child = nodeMap.get(childId);
      if (child) {
        node.vx += (child.x - node.x) * 0.005;
        node.vy += (child.y - node.y) * 0.005;
      }
    }
  }

  // Apply velocity and clamp
  for (const node of alive) {
    node.prevX = node.x;
    node.prevY = node.y;
    node.x += node.vx;
    node.y += node.vy;
    node.x = Math.max(10, Math.min(canvasWidth - 10, node.x));
    node.y = Math.max(10, Math.min(canvasHeight - 10, node.y));
  }
}

/**
 * Update nodes to reflect a new turn snapshot.
 * Adds new nodes (births), marks dead nodes, updates mood/psychScore.
 */
export function syncNodes(
  nodes: ForceNode[],
  cells: Array<{ agentId: string; department: string; rank: string; alive: boolean; marsborn: boolean; psychScore: number; partnerId?: string; childrenIds: string[]; featured: boolean; mood: string }>,
  clusters: ClusterCenter[],
): ForceNode[] {
  const existingMap = new Map(nodes.map(n => [n.id, n]));
  const clusterMap = new Map(clusters.map(c => [c.id, c]));

  return cells.map(cell => {
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
      return existing;
    }

    // New node (birth): spawn near department cluster
    const cluster = clusterMap.get(cell.department);
    const cx = cluster?.x ?? 200;
    const cy = cluster?.y ?? 200;
    const angle = Math.random() * Math.PI * 2;
    const r = (cluster?.radius ?? 40) * 0.3;

    return {
      id: cell.agentId,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
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
    };
  });
}
