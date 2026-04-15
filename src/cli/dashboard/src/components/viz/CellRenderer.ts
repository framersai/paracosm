import type { ForceNode } from './viz-types';
import { DEPARTMENT_COLORS, DEFAULT_DEPT_COLOR, RANK_SIZES } from './viz-types';

const HEX_PATH = new Path2D();
for (let i = 0; i < 6; i++) {
  const angle = (Math.PI / 3) * i - Math.PI / 6;
  const method = i === 0 ? 'moveTo' : 'lineTo';
  HEX_PATH[method](Math.cos(angle), Math.sin(angle));
}
HEX_PATH.closePath();

export interface RenderOptions {
  focusedId: string | null;
  hoveredId: string | null;
  deathProgress: Map<string, number>;
  birthProgress: Map<string, number>;
}

/**
 * Draw all cells, connections, and overlays to a Canvas2D context.
 */
export function renderCells(
  ctx: CanvasRenderingContext2D,
  nodes: ForceNode[],
  width: number,
  height: number,
  opts: RenderOptions,
): void {
  ctx.clearRect(0, 0, width, height);

  const alive = nodes.filter(n => n.alive || opts.deathProgress.has(n.id));
  const focused = opts.focusedId;

  drawConnections(ctx, alive, focused);

  for (const node of alive) {
    const isDying = opts.deathProgress.has(node.id);
    const isBorn = opts.birthProgress.has(node.id);
    const dimmed = focused && node.id !== focused;

    const baseColor = DEPARTMENT_COLORS[node.department] || DEFAULT_DEPT_COLOR;
    const size = RANK_SIZES[node.rank] || 8;
    const alpha = isDying
      ? 1 - (opts.deathProgress.get(node.id) || 0)
      : dimmed
        ? 0.3
        : 0.6 + node.psychScore * 0.4;

    const drawSize = isDying
      ? size * (1 - (opts.deathProgress.get(node.id) || 0))
      : size;

    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.globalAlpha = alpha;

    // Glow (Canvas2D fallback for when WebGL layer is unavailable)
    if (!isDying && node.psychScore > 0.5) {
      const glowRadius = drawSize * 2;
      const gradient = ctx.createRadialGradient(0, 0, drawSize * 0.3, 0, 0, glowRadius);
      gradient.addColorStop(0, baseColor + '40');
      gradient.addColorStop(1, baseColor + '00');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cell shape
    ctx.fillStyle = baseColor;
    if (node.marsborn) {
      ctx.save();
      ctx.scale(drawSize, drawSize);
      ctx.fill(HEX_PATH);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, drawSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Focus ring
    if (node.id === focused) {
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(0, 0, drawSize / 2 + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Featured pulse indicator
    if (node.featured && !isDying) {
      const pulseSize = drawSize / 2 + 6 + Math.sin(Date.now() / 300) * 2;
      ctx.strokeStyle = baseColor + '60';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, pulseSize, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Birth ring animation
    if (isBorn) {
      const progress = opts.birthProgress.get(node.id) || 0;
      const ringSize = drawSize / 2 + progress * 20;
      ctx.strokeStyle = baseColor;
      ctx.globalAlpha = 1 - progress;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, ringSize, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawConnections(
  ctx: CanvasRenderingContext2D,
  nodes: ForceNode[],
  focusedId: string | null,
): void {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  for (const node of nodes) {
    if (!node.alive) continue;

    if (node.partnerId) {
      const partner = nodeMap.get(node.partnerId);
      if (partner && partner.alive) {
        const isFocused = focusedId === node.id || focusedId === partner.id;
        ctx.strokeStyle = isFocused ? '#e8b44a' : '#e8b44a33';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(partner.x, partner.y);
        ctx.stroke();
      }
    }

    for (const childId of node.childrenIds) {
      const child = nodeMap.get(childId);
      if (child && child.alive) {
        const isFocused = focusedId === node.id || focusedId === child.id;
        ctx.strokeStyle = isFocused ? '#4ecdc4' : '#4ecdc426';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(child.x, child.y);
        ctx.stroke();
      }
    }
  }
}

/**
 * Hit-test: find which node is under the given point.
 */
export function hitTest(
  nodes: ForceNode[],
  x: number,
  y: number,
): string | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (!node.alive) continue;
    const size = RANK_SIZES[node.rank] || 8;
    const dx = node.x - x;
    const dy = node.y - y;
    if (dx * dx + dy * dy < (size + 4) * (size + 4)) {
      return node.id;
    }
  }
  return null;
}
