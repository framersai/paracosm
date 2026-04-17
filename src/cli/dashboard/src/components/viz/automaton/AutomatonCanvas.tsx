import { useEffect, useRef, useState } from 'react';
import type { TurnSnapshot } from '../viz-types.js';
import { useAutomatonState } from './useAutomatonState.js';
import { drawMood, ensureLayout, hitTestMood, tickMood, type MoodCell } from './modes/mood.js';
import { drawForge, refreshDeptCenters, syncOrbitCenters, tickForge } from './modes/forge.js';
import { drawEcology, ensureEcologyLayout, hitTestEcology, tickEcology, type HexCell } from './modes/ecology.js';
import type { AutomatonMode } from './shared.js';
import { scaleCanvasForDpr } from './shared.js';

export interface ForgeAttemptInput {
  turn: number;
  eventIndex: number;
  department: string;
  name: string;
  approved: boolean;
  confidence?: number;
}
export interface ReuseCallInput {
  turn: number;
  originDept: string;
  callingDept: string;
  name: string;
}

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
  /** Cumulative forge attempts for this side (both approved + rejected). */
  forgeAttempts?: ForgeAttemptInput[];
  /** Cumulative reuse calls (one entry per reuse invocation). */
  reuseCalls?: ReuseCallInput[];
  /** Scenario department list used by the ecology hex layout. */
  scenarioDepartments?: string[];
  onSelectAgent?: (agentId: string) => void;
}

/**
 * Single-side automaton canvas. Owns the rAF loop, pauses on
 * visibility/intersection, and dispatches to the current mode's draw
 * function. Canvas is sized to container-width by the prop `height`,
 * scaled for device pixel ratio.
 */
export function AutomatonCanvas(props: AutomatonCanvasProps) {
  const { snapshot, hexacoById, side, sideColor, mode, height, eventCategories, eventIntensity, forgeAttempts, reuseCalls, scenarioDepartments, onSelectAgent } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useAutomatonState();
  const [hovered, setHovered] = useState<MoodCell | null>(null);
  const [hoveredHex, setHoveredHex] = useState<HexCell | null>(null);
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
    // Forge state consumes cumulative attempt + reuse arrays. Idempotent
    // via seenForgeKeys inside tickForge, so re-running with the same
    // arrays is safe across re-renders.
    refreshDeptCenters(stateRef.current.forge, stateRef.current.mood);
    syncOrbitCenters(stateRef.current.forge);
    tickForge(stateRef.current.forge, stateRef.current.mood, {
      forgeAttempts: forgeAttempts ?? [],
      reuseCalls: reuseCalls ?? [],
      nowMs,
      snapshotTurn: snapshot.turn,
    });
    // Ecology layout + tick. Depts default to whatever the snapshot's
    // cells expose if the caller didn't pass an explicit scenario list.
    const depts = scenarioDepartments ?? Array.from(new Set(snapshot.cells.map(c => c.department).filter(Boolean)));
    ensureEcologyLayout(stateRef.current.ecology, snapshot, size.w, size.h, depts);
    const forgedDepts = new Set<string>(
      (forgeAttempts ?? [])
        .filter(a => a.approved && a.turn === snapshot.turn)
        .map(a => a.department),
    );
    tickEcology(stateRef.current.ecology, {
      snapshot,
      forgedDepartmentsThisTurn: forgedDepts,
      nowMs,
    });
  }, [snapshot, hexacoById, side, size.w, size.h, eventCategories, eventIntensity, forgeAttempts, reuseCalls, scenarioDepartments, stateRef]);

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
        if (mode !== 'ecology') {
          drawForge(state.forge, {
            ctx,
            nowMs,
            intensity: mode === 'forge' ? 1 : 0.3,
            deltaMs: Math.min(100, delta),
          });
        } else if (snapshot) {
          drawEcology(state.ecology, {
            ctx,
            nowMs,
            intensity: 1,
            width: size.w,
            height: size.h,
            currentTurn: snapshot.turn,
            hoveredCell: hoveredHex,
          });
        }
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
    if (mode === 'ecology') {
      const hex = hitTestEcology(stateRef.current.ecology, x, y);
      setHoveredHex(hex);
      setHovered(null);
    } else {
      const hit = hitTestMood(stateRef.current.mood, x, y);
      setHovered(hit);
      setHoveredHex(null);
    }
  };
  const onMouseLeave = () => { setHovered(null); setHoveredHex(null); };
  const onClick = () => {
    if (hovered && onSelectAgent) {
      onSelectAgent(hovered.agentId);
    }
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
      {hovered && mode !== 'ecology' && (
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
      {hoveredHex && mode === 'ecology' && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(size.w - 160, hoveredHex.x + 10),
            top: Math.max(0, hoveredHex.y - 32),
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
          <div style={{ color: sideColor, fontWeight: 700, textTransform: 'uppercase' }}>{hoveredHex.sector}</div>
          <div style={{ color: 'var(--text-3)' }}>
            health {(hoveredHex.health * 100).toFixed(0)}%{hoveredHex.dots > 0 ? ` · ${hoveredHex.dots} pop` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
