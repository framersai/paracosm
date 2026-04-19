import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TurnSnapshot, ClusterMode, CellSnapshot } from '../viz-types.js';
import { computeGridPositions } from './gridPositions.js';
import { computeChemistryParams, computeInjections } from './simToChemistry.js';
import { drawSeeds } from './SeedLayer.js';
import { drawGlyphs } from './GlyphLayer.js';
import { drawFlares } from './FlareLayer.js';
import { drawHud } from './HudLayer.js';
import { useGridState } from './useGridState.js';
import { GridRenderer } from '../../../lib/webgl/gridRenderer.js';
import { flaresToDeposits } from '../../../lib/webgl/events.js';
import { GridMetricsStrip } from './GridMetricsStrip.js';
import { hitTestGlyph } from './hitTest.js';
import type { GridMode } from './GridModePills.js';
import { ClickPopover, type ClickPopoverPayload } from './ClickPopover.js';

interface HexacoShape { O: number; C: number; E: number; A: number; Em: number; HH: number }

interface LivingColonyGridProps {
  snapshot: TurnSnapshot | undefined;
  previousSnapshot?: TurnSnapshot | undefined;
  /** Full snapshot history for this side; enables recent-memory lookup. */
  snapshotHistory?: TurnSnapshot[];
  leaderName: string;
  leaderArchetype: string;
  leaderColony?: string;
  sideColor: string;
  side: 'a' | 'b';
  lagTurns?: number;
  clusterMode?: ClusterMode;
  initialPopulation?: number;
  /** Shared grid mode across both leaders. */
  mode: GridMode;
  /** HEXACO profiles keyed by agentId for the popover radar. */
  hexacoById?: Map<string, HexacoShape>;
  /** Invoked when the user chooses "Open chat" inside the popover. */
  onOpenChat?: (colonistName: string) => void;
}

function resolveRgb(color: string, element: HTMLElement | null): [number, number, number] {
  let hex = color.trim();
  if (hex.startsWith('var(') && element) {
    const varName = hex.slice(4, -1).trim();
    const computed = getComputedStyle(element).getPropertyValue(varName).trim();
    if (computed) hex = computed;
  }
  if (hex.startsWith('#')) {
    const n = parseInt(hex.slice(1), 16);
    if (hex.length === 7) {
      return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
    }
    if (hex.length === 4) {
      const r = (n >> 8) & 0xf;
      const g = (n >> 4) & 0xf;
      const b = n & 0xf;
      return [(r * 17) / 255, (g * 17) / 255, (b * 17) / 255];
    }
  }
  const rgbMatch = hex.match(/rgba?\(([^)]+)\)/);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map(s => parseFloat(s.trim()));
    if (parts.length >= 3) {
      return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
    }
  }
  return [0.35, 0.28, 0.2];
}

function resolveCssColor(color: string, element: HTMLElement | null): string {
  if (color.startsWith('var(') && element) {
    const varName = color.slice(4, -1).trim();
    const computed = getComputedStyle(element).getPropertyValue(varName).trim();
    if (computed) return computed;
  }
  return color;
}

const GRID_W = 384;
const GRID_H = 240;

/**
 * Per-leader living colony grid. WebGL2 Gray-Scott field in back,
 * Canvas2D overlay in front (seeds, glyphs, flares, dept labels, HUD),
 * GridMetricsStrip DOM layer above. Hover tooltip tracks the nearest
 * colonist under cursor.
 */
export function LivingColonyGrid(props: LivingColonyGridProps) {
  const {
    snapshot,
    previousSnapshot,
    snapshotHistory,
    leaderName,
    sideColor,
    side,
    lagTurns,
    clusterMode = 'departments',
    initialPopulation = 20,
    mode,
    hexacoById,
    onOpenChat,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<GridRenderer | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [webglFailed, setWebglFailed] = useState(false);
  const [hovered, setHovered] = useState<{
    cell: CellSnapshot;
    x: number;
    y: number;
  } | null>(null);
  const [popover, setPopover] = useState<ClickPopoverPayload | null>(null);

  // Resize observer on the canvas wrapper (not the full container — the
  // container also holds the metrics strip DOM above the canvas).
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.max(1, Math.round(e.contentRect.width));
        const h = Math.max(1, Math.round(e.contentRect.height));
        setSize(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = webglCanvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0 || rendererRef.current) return;
    canvas.width = GRID_W;
    canvas.height = GRID_H;
    try {
      rendererRef.current = new GridRenderer({ canvas, width: GRID_W, height: GRID_H });
    } catch (err) {
      console.warn('[LivingColonyGrid] WebGL2 init failed', err);
      setWebglFailed(true);
    }
    return () => {
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [size.w, size.h]);

  useEffect(() => {
    const c = overlayCanvasRef.current;
    if (!c || size.w === 0 || size.h === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    c.style.width = `${size.w}px`;
    c.style.height = `${size.h}px`;
    const ctx = c.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [size.w, size.h]);

  const positions = useMemo(() => {
    if (!snapshot || size.w === 0) return new Map<string, { x: number; y: number }>();
    return computeGridPositions(snapshot.cells, clusterMode, size.w, size.h);
  }, [snapshot, clusterMode, size.w, size.h]);

  const gridPositions = useMemo(() => {
    if (!snapshot) return new Map<string, { x: number; y: number }>();
    return computeGridPositions(snapshot.cells, clusterMode, GRID_W, GRID_H);
  }, [snapshot, clusterMode]);

  const gridState = useGridState(
    { snapshot, previousSnapshot },
    canvasWrapRef,
    () => gridPositions,
  );

  // Mode-driven render intensity. All modes still render the field but
  // forge/ecology dim it so their overlays stand out.
  const fieldIntensity = mode === 'forge' || mode === 'ecology' ? 0.55 : 1.0;
  const seedIntensity = mode === 'forge' ? 0.5 : 1.0;
  const glyphIntensity = 1.0;

  useEffect(() => {
    const renderer = rendererRef.current;
    const overlay = overlayCanvasRef.current;
    if (!renderer || !overlay || !snapshot) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    const { F, k } = computeChemistryParams(snapshot, initialPopulation);
    const injections = computeInjections(snapshot.cells, gridPositions);
    const colonistDeposits = injections.map(i => ({
      x: i.x,
      y: i.y,
      channel: i.channel,
      strength: i.strength * seedIntensity,
      radius: 1,
    } as const));
    const flareDepositsGrid = flaresToDeposits(
      gridState.flares.map(f => {
        const id = f.sourceId;
        const gp = id ? gridPositions.get(id) : undefined;
        return gp ? { ...f, x: gp.x, y: gp.y } : f;
      }),
      GRID_W,
      GRID_H,
    );

    const tintBase = resolveRgb(sideColor, containerRef.current);
    const tintScaled: [number, number, number] = [
      tintBase[0] * fieldIntensity,
      tintBase[1] * fieldIntensity,
      tintBase[2] * fieldIntensity,
    ];
    renderer.tick({
      F: F * fieldIntensity,
      k,
      deposits: [...colonistDeposits, ...flareDepositsGrid],
      sideTint: tintScaled,
    });

    const resolvedSide = resolveCssColor(sideColor, containerRef.current);
    ctx.clearRect(0, 0, size.w, size.h);
    if (mode !== 'ecology') drawSeeds(ctx, snapshot.cells, positions);
    drawFlares(ctx, gridState.flares);
    if (mode !== 'ecology')
      drawGlyphs(ctx, snapshot.cells, positions, resolvedSide, glyphIntensity);
    drawHud(ctx, snapshot, {
      leaderName,
      sideColor: resolvedSide,
      width: size.w,
      height: size.h,
      lagTurns,
      cells: snapshot.cells,
      positions,
    });

    // Hover ring on top of HUD so it reads as "selected".
    if (hovered) {
      const pos = positions.get(hovered.cell.agentId);
      if (pos) {
        ctx.save();
        ctx.strokeStyle = resolvedSide;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }, [
    gridState.tickClock,
    snapshot,
    positions,
    gridPositions,
    size.w,
    size.h,
    sideColor,
    leaderName,
    initialPopulation,
    lagTurns,
    gridState.flares,
    mode,
    fieldIntensity,
    seedIntensity,
    glyphIntensity,
    hovered,
  ]);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!snapshot) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = hitTestGlyph(snapshot.cells, positions, x, y);
      if (hit) {
        setHovered({ cell: hit, x, y });
      } else if (hovered) {
        setHovered(null);
      }
    },
    [snapshot, positions, hovered],
  );
  const onMouseLeave = useCallback(() => setHovered(null), []);
  const onClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!snapshot) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = hitTestGlyph(snapshot.cells, positions, x, y);
      if (hit) {
        setPopover({ cell: hit, x, y });
        setHovered(null);
      }
    },
    [snapshot, positions],
  );

  // Close popover when the selected colonist vanishes (death during
  // scrub/live update). Keeps the UI from showing stale drilldowns.
  useEffect(() => {
    if (!popover || !snapshot) return;
    const stillAlive = snapshot.cells.find(c => c.agentId === popover.cell.agentId);
    if (!stillAlive) setPopover(null);
  }, [popover, snapshot]);

  return (
    <div
      ref={containerRef}
      data-testid={`living-colony-grid-${side}`}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 8,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {snapshot && <GridMetricsStrip snapshot={snapshot} sideColor={sideColor} />}
      <div
        ref={canvasWrapRef}
        style={{
          flex: 1,
          position: 'relative',
          minHeight: 0,
          overflow: 'hidden',
          background: 'var(--bg-deep)',
          border: `1px solid ${sideColor}33`,
          borderRadius: 4,
        }}
      >
        <canvas
          ref={webglCanvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: webglFailed ? 'none' : 'block',
            imageRendering: 'pixelated',
          }}
        />
        <canvas
          ref={overlayCanvasRef}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          onClick={onClick}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            cursor: hovered ? 'pointer' : 'default',
          }}
        />
        {webglFailed && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-4)',
              fontSize: 11,
              fontFamily: 'var(--mono)',
            }}
          >
            WebGL2 unavailable
          </div>
        )}
        {hovered && !popover && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(size.w - 200, hovered.x + 12),
              top: Math.max(0, hovered.y - 56),
              padding: '6px 10px',
              background: 'var(--bg-panel)',
              border: `1px solid ${sideColor}66`,
              borderRadius: 4,
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'var(--text-2)',
              pointerEvents: 'none',
              zIndex: 5,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div style={{ color: sideColor, fontWeight: 700, fontSize: 11 }}>
              {hovered.cell.name}
              {hovered.cell.featured && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 8,
                    padding: '1px 4px',
                    borderRadius: 2,
                    background: `${sideColor}33`,
                    color: sideColor,
                  }}
                >
                  FEATURED
                </span>
              )}
            </div>
            <div style={{ color: 'var(--text-3)', marginTop: 2 }}>
              {hovered.cell.department.toUpperCase()} · {hovered.cell.role}
              {typeof hovered.cell.age === 'number' ? ` · age ${hovered.cell.age}` : ''}
            </div>
            <div style={{ marginTop: 2 }}>
              mood: <span style={{ color: 'var(--text-2)' }}>{hovered.cell.mood}</span>
              {typeof hovered.cell.psychScore === 'number'
                ? ` · psych ${Math.round(hovered.cell.psychScore * 100)}%`
                : ''}
            </div>
            <div style={{ marginTop: 3, fontSize: 8, color: 'var(--text-4)' }}>
              click for drilldown
            </div>
          </div>
        )}
        <ClickPopover
          payload={popover}
          containerW={size.w}
          containerH={size.h}
          sideColor={resolveCssColor(sideColor, containerRef.current)}
          hexacoById={hexacoById}
          snapshots={snapshotHistory}
          onClose={() => setPopover(null)}
          onOpenChat={onOpenChat}
        />
      </div>
    </div>
  );
}
