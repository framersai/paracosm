/**
 * Fires a single toast when the run reaches a terminal state:
 * "Simulation complete" on clean finish, "Simulation ended early" on
 * abort. Dedup'd across remounts via sessionStorage fingerprint so a
 * page reload after a completed run doesn't re-toast.
 *
 * Cold-load gate: only fires on a live transition from non-terminal
 * to terminal during this session. A page that loads with the run
 * already complete (rehydrated from server event-buffer or local
 * persistence) does NOT toast — the user wasn't watching it finish,
 * so announcing it is noise.
 *
 * Extracted from App.tsx.
 */
import { useEffect, useRef } from 'react';
import { useToast } from '../components/shared/Toast';
import type { AbortReasonState } from './useSSE';

const STORAGE_KEY = 'paracosm:terminalToastFingerprint';

export interface UseTerminalToastOptions {
  isComplete: boolean;
  isAborted: boolean;
  abortReason: AbortReasonState | null;
  resultsCount: number;
  hasVerdict: boolean;
  replayDone: boolean;
  tourActive: boolean;
}

export function useTerminalToast({
  isComplete,
  isAborted,
  abortReason,
  resultsCount,
  hasVerdict,
  replayDone,
  tourActive,
}: UseTerminalToastOptions): void {
  const { toast } = useToast();
  // Track whether we've ever observed the run in a non-terminal state
  // during this mount. A cold load that hydrates straight into a
  // terminal state never flips this true → toast suppressed.
  const sawNonTerminalRef = useRef(false);
  useEffect(() => {
    if (!isComplete && !isAborted) {
      sawNonTerminalRef.current = true;
      return;
    }
    if (tourActive) return;
    if (!replayDone) return;
    if (!sawNonTerminalRef.current) return;
    const fingerprint = isAborted
      ? `aborted:${abortReason?.reason ?? 'unknown'}:${abortReason?.leader ?? ''}:${abortReason?.turn ?? ''}`
      : `complete:${resultsCount}:${hasVerdict ? 'v' : 'nv'}`;
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === fingerprint) return;
      sessionStorage.setItem(STORAGE_KEY, fingerprint);
    } catch {
      /* silent — fall through and toast once per mount */
    }
    if (isAborted) {
      toast('info', 'Simulation ended early', 'Partial results saved. Reload to resume from the abort point.');
    } else {
      toast('success', 'Simulation complete', 'Open the Reports tab for the verdict + full breakdown.');
    }
  }, [isComplete, isAborted, abortReason, resultsCount, hasVerdict, replayDone, tourActive, toast]);
}
