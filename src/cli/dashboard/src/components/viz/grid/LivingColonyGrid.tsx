import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TurnSnapshot, ClusterMode, CellSnapshot } from '../viz-types.js';
import { computeGridPositions } from './gridPositions.js';
import { computeChemistryParams, computeInjections } from './simToChemistry.js';
import { drawSeeds } from './SeedLayer.js';
import { drawGlyphs } from './GlyphLayer.js';
import { drawFlares } from './FlareLayer.js';
import { drawHud } from './HudLayer.js';
import { drawLines } from './LinesLayer.js';
import { drawDeptRings } from './DeptRingsLayer.js';
import { useGridState, type ForgeAttempt, type ReuseCall } from './useGridState.js';
import { computeDeptCenters } from './deptCenters.js';
import { GridRenderer } from '../../../lib/webgl/gridRenderer.js';
import { flaresToDeposits } from '../../../lib/webgl/events.js';
import { GridMetricsStrip } from './GridMetricsStrip.js';
import { hitTestGlyph } from './hitTest.js';
import type { GridMode } from './GridModePills.js';
import { ClickPopover, type ClickPopoverPayload } from './ClickPopover.js';
import { useMediaQuery, NARROW_QUERY, REDUCED_MOTION_QUERY } from './useMediaQuery.js';

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
  /** Cumulative forge attempts for this side — drives forge flares. */
  forgeAttempts?: ForgeAttempt[];
  /** Cumulative reuse calls — drives reuse arcs. */
  reuseCalls?: ReuseCall[];
  /** Colonists alive on this side but dead on the other at the same
   *  turn. Highlighted in DIVERGENCE mode + tinted in all other modes
   *  when non-empty. */
  divergedIds?: Set<string>;
  /** agentId currently hovered on the SIBLING panel. Shown as a
   *  sympathetic ring on this side so the same colonist is easy to
   *  compare across panels. */
  siblingHoveredId?: string | null;
  /** Fires when the user hovers a colonist on this panel. Lifted so
   *  the sibling panel can render a sympathetic ring. */
  onHoverChange?: (agentId: string | null) => void;
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
    forgeAttempts,
    reuseCalls,
    divergedIds,
    siblingHoveredId,
    onHoverChange,
    onOpenChat,
  } = props;

  const narrow = useMediaQuery(NARROW_QUERY);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
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
  /** Turn-transition pulse value in [0, 1], decays per frame. Non-
   *  reactive so it doesn't force re-render on every decay step —
   *  the render effect reads `.current` inline. */
  const pulseRef = useRef<number>(0);
  const lastTurnRef = useRef<number>(-1);

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

  const deptCentersOverlay = useMemo(() => {
    if (!snapshot) return new Map<string, { x: number; y: number }>();
    return computeDeptCenters(snapshot.cells, positions);
  }, [snapshot, positions]);

  const gridState = useGridState(
    {
      snapshot,
      previousSnapshot,
      forgeAttempts,
      reuseCalls,
      eventCategories: snapshot?.eventCategories,
    },
    canvasWrapRef,
    () => positions,
    () => deptCentersOverlay,
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

    // Turn transition pulse: spike the pulse value on turn change, then
    // decay by ~0.05/frame (≈600ms at 30fps) back to 0. Used to brighten
    // the field tint and thicken the panel glow briefly.
    if (snapshot.turn !== lastTurnRef.current) {
      lastTurnRef.current = snapshot.turn;
      if (!reducedMotion) pulseRef.current = 1.0;
    } else {
      pulseRef.current = Math.max(0, pulseRef.current - 0.05);
    }
    const pulse = pulseRef.current;

    const { F, k } = computeChemistryParams(snapshot, initialPopulation);
    const injections = computeInjections(snapshot.cells, gridPositions);
    const colonistDeposits = injections.map(i => ({
      x: i.x,
      y: i.y,
      channel: i.channel,
      strength: i.strength * seedIntensity,
      radius: 1,
    } as const));
    // Flares are stored in overlay-space pixels; rescale to grid-space
    // for WebGL deposits. Overlay continues to render with the original
    // pixel coords so flare rings land under the cursor correctly.
    const scaleX = GRID_W / Math.max(1, size.w);
    const scaleY = GRID_H / Math.max(1, size.h);
    const flaresGridSpace = gridState.flares.map(f => ({
      ...f,
      x: f.x * scaleX,
      y: f.y * scaleY,
      endX: typeof f.endX === 'number' ? f.endX * scaleX : undefined,
      endY: typeof f.endY === 'number' ? f.endY * scaleY : undefined,
    }));
    const flareDepositsGrid = flaresToDeposits(flaresGridSpace, GRID_W, GRID_H);

    const tintBase = resolveRgb(sideColor, containerRef.current);
    // Pulse boosts tint briefly on each new turn so the field "breathes"
    // when fresh data lands.
    const pulseBoost = 1 + pulse * 0.7;
    const tintScaled: [number, number, number] = [
      Math.min(1, tintBase[0] * fieldIntensity * pulseBoost),
      Math.min(1, tintBase[1] * fieldIntensity * pulseBoost),
      Math.min(1, tintBase[2] * fieldIntensity * pulseBoost),
    ];
    // Reduced motion: render one tick per snapshot change (no ongoing
    // animation), stepsPerFrame=0 stops RD evolution. Event flares still
    // decay visually but the field itself freezes between turns.
    renderer.tick({
      F: F * fieldIntensity,
      k,
      deposits: [...colonistDeposits, ...flareDepositsGrid],
      sideTint: tintScaled,
      stepsPerFrame: reducedMotion ? 0 : 2,
    });

    const resolvedSide = resolveCssColor(sideColor, containerRef.current);
    ctx.clearRect(0, 0, size.w, size.h);
    if (mode !== 'ecology') drawSeeds(ctx, snapshot.cells, positions);
    if (mode !== 'ecology') drawDeptRings(ctx, snapshot.cells, positions);
    if (mode === 'living' || mode === 'mood') {
      drawLines(ctx, snapshot.cells, positions, resolvedSide);
    }
    drawFlares(ctx, gridState.flares);
    if (mode !== 'ecology')
      drawGlyphs(
        ctx,
        snapshot.cells,
        positions,
        resolvedSide,
        glyphIntensity,
        divergedIds,
        mode === 'divergence',
        reducedMotion ? 0 : performance.now(),
      );
    drawHud(ctx, snapshot, {
      leaderName,
      sideColor: resolvedSide,
      width: size.w,
      height: size.h,
      lagTurns,
      cells: snapshot.cells,
      positions,
      previousSnapshot,
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
    // Sympathetic ring: same colonist is being hovered on the sibling
    // panel. Dashed + dimmer so it reads as secondary.
    if (siblingHoveredId && siblingHoveredId !== hovered?.cell.agentId) {
      const pos = positions.get(siblingHoveredId);
      if (pos) {
        ctx.save();
        ctx.strokeStyle = 'rgba(232, 180, 74, 0.75)';
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = 0.85;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 11, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
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
    divergedIds,
    siblingHoveredId,
    reducedMotion,
  ]);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!snapshot) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = hitTestGlyph(snapshot.cells, positions, x, y);
      if (hit) {
        setHovered(prev =>
          prev && prev.cell.agentId === hit.agentId ? prev : { cell: hit, x, y },
        );
        onHoverChange?.(hit.agentId);
      } else if (hovered) {
        setHovered(null);
        onHoverChange?.(null);
      }
    },
    [snapshot, positions, hovered, onHoverChange],
  );
  const onMouseLeave = useCallback(() => {
    setHovered(null);
    onHoverChange?.(null);
  }, [onHoverChange]);
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
      role="region"
      aria-label={`${leaderName} colony viz`}
      style={{
        flex: narrow ? '0 0 auto' : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 8,
        minWidth: 0,
        minHeight: narrow ? 420 : 0,
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
          // Background star dust layer: repeating radial-gradient sim-
          // ulates a very faint satellite-scan speckle so empty grid
          // space doesn't read as flat black.
          background:
            `radial-gradient(1px 1px at 12% 28%, rgba(216, 204, 176, 0.12), transparent 60%), ` +
            `radial-gradient(1px 1px at 37% 73%, rgba(216, 204, 176, 0.08), transparent 60%), ` +
            `radial-gradient(1px 1px at 64% 14%, rgba(216, 204, 176, 0.1), transparent 60%), ` +
            `radial-gradient(1px 1px at 82% 52%, rgba(216, 204, 176, 0.07), transparent 60%), ` +
            `radial-gradient(1px 1px at 51% 90%, rgba(216, 204, 176, 0.09), transparent 60%), ` +
            `radial-gradient(1px 1px at 7% 61%, rgba(216, 204, 176, 0.06), transparent 60%), ` +
            `radial-gradient(1px 1px at 93% 84%, rgba(216, 204, 176, 0.08), transparent 60%), ` +
            `var(--bg-deep)`,
          backgroundSize: '140px 140px, 160px 160px, 130px 130px, 170px 170px, 150px 150px, 180px 180px, 165px 165px, auto',
          border: `1px solid ${snapshot
            ? snapshot.morale >= 0.6
              ? 'rgba(106, 173, 72, 0.55)'
              : snapshot.morale >= 0.3
              ? 'rgba(232, 180, 74, 0.55)'
              : 'rgba(196, 74, 30, 0.65)'
            : `${sideColor}33`}`,
          borderRadius: 4,
          boxShadow: snapshot
            ? snapshot.morale >= 0.6
              ? '0 0 16px rgba(106, 173, 72, 0.18)'
              : snapshot.morale >= 0.3
              ? '0 0 16px rgba(232, 180, 74, 0.12)'
              : '0 0 20px rgba(196, 74, 30, 0.25)'
            : 'none',
          transition: 'border-color 400ms ease, box-shadow 400ms ease',
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
          role="img"
          aria-label={
            snapshot
              ? `${leaderName} colony, turn ${snapshot.turn}. ${snapshot.cells.filter(c => c.alive).length} alive, morale ${Math.round(snapshot.morale * 100)}%, food reserve ${snapshot.foodReserve.toFixed(1)} months. ${snapshot.births} births, ${snapshot.deaths} deaths this turn. Click a colonist glyph for drilldown.`
              : `${leaderName} colony — waiting for first turn.`
          }
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
        {mode === 'divergence' && snapshot && (divergedIds?.size ?? 0) === 0 && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 16,
              display: 'flex',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 4,
            }}
          >
            <div
              style={{
                padding: '6px 12px',
                background: 'rgba(10, 8, 6, 0.85)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'var(--text-3)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Both timelines identical this turn — no divergence yet
            </div>
          </div>
        )}
        {hovered && !popover && (() => {
          const ttW = 200;
          const ttH = 80;
          const margin = 8;
          const left = Math.min(
            Math.max(margin, hovered.x + 12),
            Math.max(margin, size.w - ttW - margin),
          );
          const top = Math.min(
            Math.max(margin, hovered.y - ttH - 8),
            Math.max(margin, size.h - ttH - margin),
          );
          return (
          <div
            style={{
              position: 'absolute',
              left,
              top,
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
              maxWidth: ttW,
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
          );
        })()}
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
