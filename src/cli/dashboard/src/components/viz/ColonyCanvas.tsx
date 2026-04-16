import { useRef, useEffect, useCallback, useState } from 'react';
import type { TurnSnapshot } from './viz-types';
import { buildSquareGrid, gridHitTest, type SquareGrid } from './ForceLayout';
import { renderSquareGrid, drawLegend } from './CellRenderer';
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
  const gridRef = useRef<SquareGrid | null>(null);
  const animRef = useRef<number>(0);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const snap = snapshots[currentTurn];

  // Rebuild grid when turn changes
  useEffect(() => {
    if (!snap || !containerRef.current) return;
    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight - 40;
    gridRef.current = buildSquareGrid(snap.cells, w, h);
  }, [snap, currentTurn]);

  // Render loop (redraws for hover/focus state + featured pulse animation)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;

    const ctx = canvas.getContext('2d')!;

    const render = () => {
      const container = containerRef.current;
      if (!container) { animRef.current = requestAnimationFrame(render); return; }

      const w = container.clientWidth;
      const h = container.clientHeight - 40;
      canvas.width = w;
      canvas.height = h;

      const grid = gridRef.current;
      if (!grid || !snap) {
        animRef.current = requestAnimationFrame(render);
        return;
      }

      renderSquareGrid(ctx, grid, w, h, { focusedId, hoveredId });
      renderMetricOverlay(ctx, snapshots, currentTurn, w, h);

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
    setHoveredId(gridHitTest(gridRef.current, x, y));
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !gridRef.current) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = gridHitTest(gridRef.current, x, y);
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
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--rust)', letterSpacing: '.08em' }}>
          {leaderName.toUpperCase()}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{leaderArchetype}</div>
      </div>

      <div style={{ position: 'relative', flex: 1 }}>
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: hoveredId ? 'pointer' : 'default' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredId(null)}
          onClick={handleClick}
        />

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
