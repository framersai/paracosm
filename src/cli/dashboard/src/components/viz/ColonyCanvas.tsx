import { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef, useMemo } from 'react';
import type { TurnSnapshot, VizMode, SnapshotDiff } from './viz-types';
import { DEPARTMENT_COLORS, computeSnapshotDiff } from './viz-types';
import { buildSquareGrid, buildRelationshipGrid, gridHitTest, type SquareGrid } from './ForceLayout';
import { renderSquareGrid, drawLegend } from './CellRenderer';
import { renderMetricOverlay } from './MetricOverlay';
import { CellDetail } from './CellDetail';
import { DepartmentChips } from './DepartmentChips';

interface ColonyCanvasProps {
  snapshots: TurnSnapshot[];
  currentTurn: number;
  leaderName: string;
  leaderArchetype: string;
  mode: VizMode;
  layout: 'department' | 'family';
  divergedIds?: Set<string>;
}

export interface ColonyCanvasHandle {
  exportPng: (filename: string) => void;
}

export const ColonyCanvas = forwardRef<ColonyCanvasHandle, ColonyCanvasProps>(function ColonyCanvas(
  { snapshots, currentTurn, leaderName, leaderArchetype, mode, layout, divergedIds }: ColonyCanvasProps,
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<SquareGrid | null>(null);
  const animRef = useRef<number>(0);
  const turnStartTimeRef = useRef<number>(Date.now());

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const snap = snapshots[currentTurn];
  const prevSnap = currentTurn > 0 ? snapshots[currentTurn - 1] : undefined;

  // Compute snapshot diff (births/deaths)
  const diff: SnapshotDiff = useMemo(() => computeSnapshotDiff(prevSnap, snap), [prevSnap, snap]);

  // Reset turn-start animation timer when turn changes
  useEffect(() => {
    turnStartTimeRef.current = Date.now();
  }, [currentTurn]);

  // Rebuild grid when turn or layout changes
  useEffect(() => {
    if (!snap || !canvasWrapRef.current) return;
    const w = canvasWrapRef.current.clientWidth;
    const h = canvasWrapRef.current.clientHeight;
    gridRef.current = layout === 'family'
      ? buildRelationshipGrid(snap.cells, w, h)
      : buildSquareGrid(snap.cells, w, h);
  }, [snap, currentTurn, layout]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;

    const ctx = canvas.getContext('2d')!;

    const render = () => {
      const wrap = canvasWrapRef.current;
      if (!wrap) { animRef.current = requestAnimationFrame(render); return; }

      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      // Use device pixel ratio for crisp rendering and PNG export quality
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      const grid = gridRef.current;
      if (!grid || !snap) {
        animRef.current = requestAnimationFrame(render);
        return;
      }

      const pulsePhaseMs = Date.now() - turnStartTimeRef.current;

      renderSquareGrid(ctx, grid, w, h, {
        focusedId, hoveredId, mode, diff,
        pulsePhaseMs,
        eventCategories: snap.eventCategories,
        divergedIds,
      });
      renderMetricOverlay(ctx, snapshots, currentTurn);

      const depts = [...new Set(snap.cells.filter(c => c.alive).map(c => c.department))];
      drawLegend(ctx, depts, w, h, mode);

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [snap, snapshots, currentTurn, focusedId, hoveredId, mode, diff, divergedIds]);

  // PNG export — captured directly from the canvas
  useImperativeHandle(ref, () => ({
    exportPng: (filename: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
    },
  }), []);

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
  const hoveredCell = hoveredId ? snap?.cells.find(c => c.agentId === hoveredId) : null;

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

      <DepartmentChips snapshot={snap} prevSnapshot={prevSnap} />

      {/* Hover info bar */}
      <div style={{
        padding: '3px 12px', fontSize: 10, color: 'var(--text-2)',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
        height: 20, display: 'flex', alignItems: 'center', gap: 8,
        background: hoveredCell ? 'var(--bg-card)' : 'transparent',
        transition: 'background 0.15s',
      }}>
        {hoveredCell ? (
          <>
            <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{hoveredCell.name}</span>
            <span style={{ color: DEPARTMENT_COLORS[hoveredCell.department] || '#a89878' }}>{hoveredCell.department}</span>
            <span>{hoveredCell.role}</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{hoveredCell.rank}</span>
            {hoveredCell.age != null && <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>age {hoveredCell.age}</span>}
            <span style={{ color: moodColor(hoveredCell.mood) }}>{hoveredCell.mood}</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>psych:{hoveredCell.psychScore.toFixed(2)}</span>
            {hoveredCell.marsborn && <span style={{ color: 'var(--rust)' }}>native-born G{hoveredCell.generation ?? 1}</span>}
          </>
        ) : (
          <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>Hover a cell. Click to inspect. Arrows to scrub. Space to play.</span>
        )}
      </div>

      <div ref={canvasWrapRef} style={{ position: 'relative', flex: 1 }}>
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
});

function moodColor(mood: string): string {
  switch (mood) {
    case 'positive': case 'hopeful': return '#6aad48';
    case 'negative': case 'anxious': case 'resigned': return '#e06530';
    case 'defiant': return '#e8b44a';
    default: return '#a89878';
  }
}
