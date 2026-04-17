import { useEffect, useRef, useState } from 'react';
import type { TurnSnapshot } from '../viz-types.js';
import { useAutomatonState } from './useAutomatonState.js';
import { drawMood, ensureLayout, hitTestMood, tickMood, type MoodCell } from './modes/mood.js';
import type { AutomatonMode } from './shared.js';
import { scaleCanvasForDpr } from './shared.js';

interface HexacoShape { O: number; C: number; E: number; A: number; Em: number; HH: number }

interface AutomatonCanvasProps {
  snapshot: TurnSnapshot | undefined;
  hexacoById: Map<string, HexacoShape> | undefined;
  side: 'a' | 'b';
  sideColor: string;
  mode: AutomatonMode;
  height: number;
  /** Map of current event categories + intensity for this turn. */
  eventCategories?: string[];
  eventIntensity?: number;
  onSelectAgent?: (agentId: string) => void;
}

/**
 * Single-side automaton canvas. Owns the rAF loop, pauses on
 * visibility/intersection, and dispatches to the current mode's draw
 * function. Canvas is sized to container-width by the prop `height`,
 * scaled for device pixel ratio.
 */
export function AutomatonCanvas(props: AutomatonCanvasProps) {
  const { snapshot, hexacoById, side, sideColor, mode, height, eventCategories, eventIntensity, onSelectAgent } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useAutomatonState();
  const [hovered, setHovered] = useState<MoodCell | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: height });

  // Resize observer keeps logical width synced with the container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.round(e.contentRect.width);
        setSize(prev => (prev.w === w ? prev : { w, h: height }));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  useEffect(() => {
    setSize(prev => ({ ...prev, h: height }));
  }, [height]);

  // Apply DPR scaling whenever the logical size changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0) return;
    scaleCanvasForDpr(canvas, size.w, size.h);
  }, [size.w, size.h]);

  // Tick automaton state when a new turn_done snapshot lands.
  useEffect(() => {
    if (!snapshot || size.w === 0) return;
    const nowMs = performance.now();
    ensureLayout(stateRef.current.mood, {
      snapshot,
      hexacoById,
      side,
      width: size.w,
      height: size.h,
      nowMs,
      eventCategories,
      eventIntensity,
    });
    tickMood(stateRef.current.mood, {
      snapshot,
      hexacoById,
      side,
      width: size.w,
      height: size.h,
      nowMs,
      eventCategories,
      eventIntensity,
    });
  }, [snapshot, hexacoById, side, size.w, size.h, eventCategories, eventIntensity, stateRef]);

  // rAF loop with IntersectionObserver + visibility pause.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let raf = 0;
    let running = true;
    let onScreen = true;
    let tabVisible = !document.hidden;

    const io = new IntersectionObserver(entries => {
      for (const e of entries) onScreen = e.isIntersecting;
    }, { threshold: 0 });
    io.observe(container);

    const onVisibility = () => { tabVisible = !document.hidden; };
    document.addEventListener('visibilitychange', onVisibility);

    const loop = (nowMs: number) => {
      if (!running) return;
      if (!onScreen || !tabVisible) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const state = stateRef.current;
      const minFrame = 1000 / state.fpsCap;
      const delta = nowMs - state.lastFrameMs;
      if (delta < minFrame) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (ctx && size.w > 0) {
        const t0 = performance.now();
        drawMood(state.mood, {
          ctx,
          width: size.w,
          height: size.h,
          nowMs,
          sideColor,
          intensity: mode === 'mood' ? 1 : mode === 'forge' ? 0.2 : 0.35,
          hoveredId: hovered?.agentId ?? null,
          deltaMs: Math.min(100, delta),
        });
        const t1 = performance.now();
        if (t1 - t0 > 16) {
          state.slowFrameStreak += 1;
          if (state.slowFrameStreak >= 3 && state.fpsCap > 20) {
            state.fpsCap = 20;
          }
        } else {
          state.slowFrameStreak = 0;
        }
      }
      state.lastFrameMs = nowMs;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [size.w, size.h, sideColor, mode, hovered?.agentId, stateRef]);

  // Hover + click hit testing.
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = hitTestMood(stateRef.current.mood, x, y);
    setHovered(hit);
  };
  const onMouseLeave = () => setHovered(null);
  const onClick = () => {
    if (!hovered || !onSelectAgent) return;
    onSelectAgent(hovered.agentId);
  };

  const ariaLabel = snapshot
    ? `${mode === 'mood' ? 'Mood propagation' : mode === 'forge' ? 'Forge flow' : 'Ecology grid'} for leader ${side === 'a' ? 'A' : 'B'}, turn ${snapshot.turn}, ${Math.round(snapshot.morale * 100)}% morale`
    : 'Automaton canvas';

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        style={{ width: '100%', height: '100%', display: 'block', cursor: hovered ? 'pointer' : 'default' }}
      />
      {hovered && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(size.w - 160, hovered.x + 10),
            top: Math.max(0, hovered.y - 32),
            padding: '4px 8px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--text-2)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 5,
          }}
        >
          <div style={{ color: sideColor, fontWeight: 700 }}>{hovered.name}</div>
          <div style={{ color: 'var(--text-3)' }}>
            {hovered.department}
          </div>
        </div>
      )}
    </div>
  );
}
