import { useEffect, useRef, useState } from 'react';
import {
  createFlareQueue,
  pushFlare,
  tickFlares,
  activeFlares,
  type FlareQueue,
  type ActiveFlare,
} from './flareQueue.js';
import type { TurnSnapshot } from '../viz-types.js';

interface UseGridStateInputs {
  snapshot: TurnSnapshot | undefined;
  previousSnapshot: TurnSnapshot | undefined;
}

interface GridStateHandle {
  flares: ActiveFlare[];
  tickClock: number;
}

/**
 * Owns the per-leader flare queue and a monotonic frame counter that
 * the renderer reads each rAF tick. When a new turn snapshot arrives,
 * diffs births/deaths against the previous snapshot and seeds matching
 * flares. Pauses on visibilitychange / off-screen.
 */
export function useGridState(
  inputs: UseGridStateInputs,
  containerRef: React.RefObject<HTMLElement | null>,
  positionLookup: () => Map<string, { x: number; y: number }>,
): GridStateHandle {
  const flareQueueRef = useRef<FlareQueue>(createFlareQueue());
  const [tickClock, setTickClock] = useState(0);
  const prevTurnRef = useRef<number>(-1);
  const onScreenRef = useRef(true);
  const tabVisibleRef = useRef(
    typeof document !== 'undefined' ? !document.hidden : true,
  );

  // Seed flares on turn change by diffing births + deaths.
  useEffect(() => {
    const snap = inputs.snapshot;
    const prev = inputs.previousSnapshot;
    if (!snap) return;
    if (snap.turn === prevTurnRef.current) return;
    prevTurnRef.current = snap.turn;

    if (!prev) return;
    const positions = positionLookup();

    const prevIds = new Set(prev.cells.map(c => c.agentId));
    const currIds = new Set(snap.cells.map(c => c.agentId));

    for (const c of snap.cells) {
      if (!prevIds.has(c.agentId) && c.alive) {
        const pos = positions.get(c.agentId);
        if (pos) {
          pushFlare(flareQueueRef.current, {
            kind: 'birth',
            x: pos.x,
            y: pos.y,
            totalFrames: 30,
            sourceId: c.agentId,
          });
        }
      }
    }
    for (const prevCell of prev.cells) {
      const curr = snap.cells.find(c => c.agentId === prevCell.agentId);
      const died =
        (curr && prevCell.alive && !curr.alive) ||
        (prevCell.alive && !currIds.has(prevCell.agentId));
      if (died) {
        const pos = positions.get(prevCell.agentId);
        if (pos) {
          pushFlare(flareQueueRef.current, {
            kind: 'death',
            x: pos.x,
            y: pos.y,
            totalFrames: 60,
            sourceId: prevCell.agentId,
          });
        }
      }
    }
  }, [inputs.snapshot, inputs.previousSnapshot, positionLookup]);

  // Visibility + intersection → pause.
  useEffect(() => {
    const onVis = () => {
      tabVisibleRef.current = !document.hidden;
    };
    document.addEventListener('visibilitychange', onVis);
    const el = containerRef.current;
    let io: IntersectionObserver | null = null;
    if (el) {
      io = new IntersectionObserver(
        entries => {
          for (const e of entries) onScreenRef.current = e.isIntersecting;
        },
        { threshold: 0 },
      );
      io.observe(el);
    }
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      io?.disconnect();
    };
  }, [containerRef]);

  // rAF tick — bumps tickClock, advances flares.
  useEffect(() => {
    let raf = 0;
    let lastMs = performance.now();
    const minFrame = 1000 / 30;
    const loop = (nowMs: number) => {
      if (!onScreenRef.current || !tabVisibleRef.current) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const delta = nowMs - lastMs;
      if (delta < minFrame) {
        raf = requestAnimationFrame(loop);
        return;
      }
      lastMs = nowMs;
      tickFlares(flareQueueRef.current);
      setTickClock(prev => prev + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { flares: activeFlares(flareQueueRef.current), tickClock };
}
