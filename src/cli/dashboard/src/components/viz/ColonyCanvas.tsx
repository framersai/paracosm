import { useRef, useEffect, useCallback, useState } from 'react';
import type { TurnSnapshot, ForceNode } from './viz-types';
import { DEPARTMENT_COLORS, DEFAULT_DEPT_COLOR } from './viz-types';
import { computeClusterCenters, initNodes, tickForce, syncNodes } from './ForceLayout';
import { renderCells, hitTest } from './CellRenderer';
import { GlowRenderer } from './GlowRenderer';
import { renderMetricOverlay } from './MetricOverlay';
import { CellTooltip } from './CellTooltip';
import { CellDetail } from './CellDetail';

interface ColonyCanvasProps {
  snapshots: TurnSnapshot[];
  currentTurn: number;
  leaderName: string;
  leaderArchetype: string;
}

export function ColonyCanvas({ snapshots, currentTurn, leaderName, leaderArchetype }: ColonyCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<ForceNode[]>([]);
  const glowRef = useRef<GlowRenderer | null>(null);
  const animRef = useRef<number>(0);
  const deathProgress = useRef(new Map<string, number>());
  const birthProgress = useRef(new Map<string, number>());

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const snap = snapshots[currentTurn];

  // Initialize WebGL glow renderer
  useEffect(() => {
    if (glCanvasRef.current && !glowRef.current) {
      const glow = new GlowRenderer();
      glow.init(glCanvasRef.current);
      glowRef.current = glow;
    }
    return () => {
      glowRef.current?.dispose();
      glowRef.current = null;
    };
  }, []);

  // Sync nodes when turn changes
  useEffect(() => {
    if (!snap) return;
    const container = containerRef.current;
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight - 40;

    const departments = [...new Set(snap.cells.map(c => c.department))];
    const popCounts: Record<string, number> = {};
    for (const c of snap.cells) {
      if (c.alive) popCounts[c.department] = (popCounts[c.department] || 0) + 1;
    }
    const clusters = computeClusterCenters(departments, w, h, popCounts);

    if (nodesRef.current.length === 0) {
      nodesRef.current = initNodes(snap.cells, clusters);
    } else {
      const prevIds = new Set(nodesRef.current.filter(n => n.alive).map(n => n.id));
      const currAlive = new Set(snap.cells.filter(c => c.alive).map(c => c.agentId));

      for (const id of prevIds) {
        if (!currAlive.has(id)) {
          deathProgress.current.set(id, 0);
          const node = nodesRef.current.find(n => n.id === id);
          if (node) glowRef.current?.spawnDeathParticles(node.x, node.y, node.department);
        }
      }

      for (const id of currAlive) {
        if (!prevIds.has(id)) {
          birthProgress.current.set(id, 0);
        }
      }

      nodesRef.current = syncNodes(nodesRef.current, snap.cells, clusters);
    }
  }, [snap, currentTurn]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const glCanvas = glCanvasRef.current;
    if (!canvas || !containerRef.current) return;

    const ctx = canvas.getContext('2d')!;
    let frameCount = 0;

    const loop = () => {
      const container = containerRef.current;
      if (!container) { animRef.current = requestAnimationFrame(loop); return; }

      const w = container.clientWidth;
      const h = container.clientHeight - 40;

      canvas.width = w;
      canvas.height = h;
      if (glCanvas) {
        glCanvas.width = w;
        glCanvas.height = h;
      }

      const nodes = nodesRef.current;
      if (!snap || nodes.length === 0) {
        animRef.current = requestAnimationFrame(loop);
        return;
      }

      // Run force at 30fps
      if (frameCount % 2 === 0) {
        const departments = [...new Set(snap.cells.map(c => c.department))];
        const popCounts: Record<string, number> = {};
        for (const c of snap.cells) {
          if (c.alive) popCounts[c.department] = (popCounts[c.department] || 0) + 1;
        }
        const clusters = computeClusterCenters(departments, w, h, popCounts);
        tickForce(nodes, clusters, w, h);
      }

      // Advance animations
      for (const [id, p] of deathProgress.current) {
        deathProgress.current.set(id, p + 1 / 30);
        if (p >= 1) deathProgress.current.delete(id);
      }
      for (const [id, p] of birthProgress.current) {
        birthProgress.current.set(id, p + 1 / 18);
        if (p >= 1) birthProgress.current.delete(id);
      }

      // Render
      glowRef.current?.render(nodes, w, h);

      renderCells(ctx, nodes, w, h, {
        focusedId,
        hoveredId,
        deathProgress: deathProgress.current,
        birthProgress: birthProgress.current,
      });

      glowRef.current?.renderParticles(ctx);
      renderMetricOverlay(ctx, snapshots, currentTurn, w, h);

      frameCount++;
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [snap, snapshots, currentTurn, focusedId, hoveredId]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });
    setHoveredId(hitTest(nodesRef.current, x, y));
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = hitTest(nodesRef.current, x, y);
    setFocusedId(prev => prev === hit ? null : hit);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setFocusedId(null);
  }, []);

  const nameMap = new Map(snap?.cells.map(c => [c.agentId, c.name]) || []);
  const hoveredNode = hoveredId ? nodesRef.current.find(n => n.id === hoveredId) : null;
  const focusedCell = focusedId ? snap?.cells.find(c => c.agentId === focusedId) : null;

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        position: 'relative',
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--bg-deep)',
        display: 'flex',
        flexDirection: 'column',
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--rust)', letterSpacing: '.08em' }}>
          {leaderName.toUpperCase()}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{leaderArchetype}</div>
      </div>

      <div style={{ position: 'relative', flex: 1 }}>
        <canvas
          ref={glCanvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: hoveredId ? 'pointer' : 'default' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredId(null)}
          onClick={handleClick}
        />

        {hoveredNode && !focusedId && (
          <CellTooltip node={hoveredNode} nameMap={nameMap} x={mousePos.x} y={mousePos.y} />
        )}

        {focusedCell && (
          <CellDetail cell={focusedCell} snapshots={snapshots} onClose={() => setFocusedId(null)} />
        )}
      </div>

      {snap && (
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '4px 12px', fontSize: 10, color: 'var(--text-3)',
          borderTop: '1px solid var(--border)', flexShrink: 0,
        }}>
          <span>Pop: {snap.population}</span>
          <span>Morale: {Math.round(snap.morale * 100)}%</span>
        </div>
      )}
    </div>
  );
}
