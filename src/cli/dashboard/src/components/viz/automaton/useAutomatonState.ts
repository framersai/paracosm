import { useRef } from 'react';
import { createMoodState, type MoodState } from './modes/mood.js';
import { createForgeState, type ForgeState } from './modes/forge.js';
import { createEcologyState, type EcologyState } from './modes/ecology.js';

/**
 * Per-side mutable automaton state. Held in a ref so frame-to-frame
 * updates never trigger React re-renders — the canvas redraws imperatively.
 * Survives mode toggles so flipping MOOD → FORGE → MOOD resumes cells
 * where they left off rather than regenerating the layout.
 */
export interface AutomatonStateRefValue {
  mood: MoodState;
  forge: ForgeState;
  ecology: EcologyState;
  /** Monotonic timestamp of the last drawn frame (ms). */
  lastFrameMs: number;
  /** Frame budget tracker: three consecutive >16ms frames downgrades FPS. */
  slowFrameStreak: number;
  fpsCap: number;
}

export function useAutomatonState(): React.MutableRefObject<AutomatonStateRefValue> {
  const ref = useRef<AutomatonStateRefValue>({
    mood: createMoodState(),
    forge: createForgeState(),
    ecology: createEcologyState(),
    lastFrameMs: 0,
    slowFrameStreak: 0,
    fpsCap: 30,
  });
  return ref;
}
