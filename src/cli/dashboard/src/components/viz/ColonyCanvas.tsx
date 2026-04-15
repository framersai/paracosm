import { useRef, useEffect, useCallback, useState } from 'react';
import type { TurnSnapshot } from './viz-types';
import { buildHexGrid, hexHitTest, type HexGrid } from './ForceLayout';
import { renderHexGrid, drawLegend } from './CellRenderer';
import { GlowRenderer } from './GlowRenderer';
import { renderMetricOverlay } from './MetricOverlay';
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
  const gridRef = useRef<HexGrid | null>(null);
  const glowRef = useRef<GlowRenderer | null>(null);
  const animRef = useRef<number>(0);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

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

  // Rebuild hex grid when turn or canvas size changes
  useEffect(() => {
    if (!snap || !containerRef.current) return;
    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight - 40; // header + footer
    gridRef.current = buildHexGrid(snap.cells, w, h);
  }, [snap, currentTurn]);

  // Render loop (no physics, just redraw for hover/focus state + glow animation)
  useEffect(() => {
    const canvas = canvasRef.current;
    const glCanvas = glCanvasRef.current;
    if (!canvas || !containerRef.current) return;

    const ctx = canvas.getContext('2d')!;

    const render = () => {
      const container = containerRef.current;
      if (!container) { animRef.current = requestAnimationFrame(render); return; }

      const w = container.clientWidth;
      const h = container.clientHeight - 40;
      canvas.width = w;
      canvas.height = h;
      if (glCanvas) { glCanvas.width = w; glCanvas.height = h; }

      const grid = gridRef.current;
      if (!grid || !snap) {
        animRef.current = requestAnimationFrame(render);
        return;
      }

      // WebGL glow layer (renders behind Canvas2D)
      // Build fake ForceNodes from grid for glow renderer compatibility
      const glowNodes = grid.cells
        .filter(c => c.occupant && c.occupant.alive && c.occupant.psychScore > 0.3)
        .map(c => ({
          id: c.occupant!.agentId,
          x: c.px, y: c.py,
          vx: 0, vy: 0, prevX: c.px, prevY: c.py,
          department: c.occupant!.department,
          rank: c.occupant!.rank,
          alive: true,
          marsborn: c.occupant!.marsborn,
          psychScore: c.occupant!.psychScore,
          partnerId: c.occupant!.partnerId,
          childrenIds: c.occupant!.childrenIds,
          featured: c.occupant!.featured,
          mood: c.occupant!.mood,
        }));
      glowRef.current?.render(glowNodes, w, h);

      // Hex grid
      renderHexGrid(ctx, grid, w, h, { focusedId, hoveredId });

      // Metric overlay
      renderMetricOverlay(ctx, snapshots, currentTurn, w, h);

      // Legend (bottom-right)
      const depts = [...new Set(snap.cells.filter(c => c.alive).map(c => c.department))];
      drawLegend(ctx, depts, w, h);

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [snap, snapshots, currentTurn, focusedId, hoveredId]);

  // Mouse handlers
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !gridRef.current) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setHoveredId(hexHitTest(gridRef.current, x, y));
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !gridRef.current) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = hexHitTest(gridRef.current, x, y);
    setFocusedId(prev => prev === hit ? null : hit);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setFocusedId(null);
  }, []);

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
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--rust)', letterSpacing: '.08em' }}>
          {leaderName.toUpperCase()}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{leaderArchetype}</div>
      </div>

      {/* Canvas stack */}
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

        {/* Detail panel (replaces tooltip) */}
        {focusedCell && (
          <CellDetail cell={focusedCell} snapshots={snapshots} onClose={() => setFocusedId(null)} />
        )}
      </div>

      {/* Footer stats */}
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
