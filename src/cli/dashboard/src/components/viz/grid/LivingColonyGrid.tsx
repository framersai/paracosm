import { useEffect, useMemo, useRef, useState } from 'react';
import type { TurnSnapshot, ClusterMode } from '../viz-types.js';
import { computeGridPositions } from './gridPositions.js';
import { computeChemistryParams, computeInjections } from './simToChemistry.js';
import { drawSeeds } from './SeedLayer.js';
import { drawGlyphs } from './GlyphLayer.js';
import { drawFlares } from './FlareLayer.js';
import { drawHud } from './HudLayer.js';
import { useGridState } from './useGridState.js';
import { GridRenderer } from '../../../lib/webgl/gridRenderer.js';
import { flaresToDeposits } from '../../../lib/webgl/events.js';

interface LivingColonyGridProps {
  snapshot: TurnSnapshot | undefined;
  previousSnapshot?: TurnSnapshot | undefined;
  leaderName: string;
  leaderArchetype: string;
  leaderColony?: string;
  sideColor: string;
  side: 'a' | 'b';
  lagTurns?: number;
  clusterMode?: ClusterMode;
  initialPopulation?: number;
}

/** Resolve a CSS color value (hex or var(...)) to a normalized [R, G, B]
 *  triple for GL uniforms. Reads computed styles so CSS variables resolve. */
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
  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = hex.match(/rgba?\(([^)]+)\)/);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map(s => parseFloat(s.trim()));
    if (parts.length >= 3) {
      return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
    }
  }
  return [0.35, 0.28, 0.2];
}

/** Resolved side color string (hex) to pass to Canvas2D stroke/fill
 *  layers. Canvas2D accepts CSS vars via computed style, but resolving
 *  here keeps the overlay draws fast. */
function resolveCssColor(color: string, element: HTMLElement | null): string {
  if (color.startsWith('var(') && element) {
    const varName = color.slice(4, -1).trim();
    const computed = getComputedStyle(element).getPropertyValue(varName).trim();
    if (computed) return computed;
  }
  return color;
}

/** RD grid resolution. Modest in Phase 1; Phase 4 profiles + tunes. */
const GRID_W = 384;
const GRID_H = 240;

/**
 * Per-leader living colony grid. Renders a WebGL2 Gray-Scott field
 * in back, Canvas2D overlays in front. Pauses on tab hidden +
 * off-screen via useGridState.
 */
export function LivingColonyGrid(props: LivingColonyGridProps) {
  const {
    snapshot,
    previousSnapshot,
    leaderName,
    sideColor,
    side,
    lagTurns,
    clusterMode = 'departments',
    initialPopulation = 20,
  } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<GridRenderer | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [webglFailed, setWebglFailed] = useState(false);

  // Resize observer keeps both canvases sized to the container.
  useEffect(() => {
    const el = containerRef.current;
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

  // Initialize WebGL renderer once on first size.
  useEffect(() => {
    const canvas = webglCanvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0 || rendererRef.current) return;
    canvas.width = GRID_W;
    canvas.height = GRID_H;
    try {
      rendererRef.current = new GridRenderer({ canvas, width: GRID_W, height: GRID_H });
    } catch (err) {
      console.warn(
        '[LivingColonyGrid] WebGL2 init failed; Canvas2D fallback lands in Phase 3',
        err,
      );
      setWebglFailed(true);
    }
    return () => {
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [size.w, size.h]);

  // Size overlay canvas to the container (not the RD grid) with DPR scaling.
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
    containerRef,
    () => gridPositions,
  );

  // Per rAF tick: compute chemistry, run RD step, draw overlays.
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
      strength: i.strength,
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

    renderer.tick({
      F,
      k,
      deposits: [...colonistDeposits, ...flareDepositsGrid],
      sideTint: resolveRgb(sideColor, containerRef.current),
    });

    const resolvedSide = resolveCssColor(sideColor, containerRef.current);
    ctx.clearRect(0, 0, size.w, size.h);
    drawSeeds(ctx, snapshot.cells, positions);
    drawFlares(ctx, gridState.flares);
    drawGlyphs(ctx, snapshot.cells, positions, resolvedSide);
    drawHud(ctx, snapshot, {
      leaderName,
      sideColor: resolvedSide,
      width: size.w,
      height: size.h,
      lagTurns,
    });
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
  ]);

  return (
    <div
      ref={containerRef}
      data-testid={`living-colony-grid-${side}`}
      style={{
        flex: 1,
        position: 'relative',
        minWidth: 0,
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
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
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
          WebGL2 unavailable — fallback lands in Phase 3
        </div>
      )}
    </div>
  );
}
