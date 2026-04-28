/**
 * Surfaces the server's `sim_saved` SSE event as a toast. Successful
 * saves show the run id so users can see it landed in the cache;
 * failed saves show a concrete reason (never silent); expected skips
 * (`below_min_turns`) are silenced so aborted-too-early runs don't
 * spam the user.
 *
 * Cold-load gate: only fires when a `sim_saved` event ARRIVES during
 * this mount. A page load that rehydrates with `sim_saved` already
 * present in the buffer does NOT toast — the cache write happened
 * on a previous session, announcing it is noise.
 *
 * Dedup'd via sessionStorage fingerprint keyed on status + id + reason
 * so returning to the tab after a reload doesn't re-toast.
 *
 * Extracted from App.tsx.
 */
import { useEffect, useRef } from 'react';
import { useToast } from '../components/shared/Toast';
import type { SimEvent } from './useSSE';

const STORAGE_KEY = 'paracosm:simSavedToastFingerprint';

export interface UseSimSavedToastOptions {
  events: SimEvent[];
  tourActive: boolean;
}

export function useSimSavedToast({ events, tourActive }: UseSimSavedToastOptions): void {
  const { toast } = useToast();
  // Snapshot the set of sim_saved event ids present at mount time so
  // we can ignore any that were already in the buffer when the page
  // loaded. Only events that arrive AFTER mount trigger toasts.
  const baselineIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (baselineIdsRef.current === null) {
      baselineIdsRef.current = new Set(
        events.filter((e) => e.type === 'sim_saved').map((e) => {
          const d = (e.data ?? {}) as Record<string, unknown>;
          return `${String(d.status ?? '')}:${String(d.id ?? '')}:${String(d.reason ?? '')}`;
        }),
      );
      return;
    }
    if (tourActive) return;
    const baseline = baselineIdsRef.current;
    const savedEvent = events.find((e) => {
      if (e.type !== 'sim_saved') return false;
      const d = (e.data ?? {}) as Record<string, unknown>;
      const key = `${String(d.status ?? '')}:${String(d.id ?? '')}:${String(d.reason ?? '')}`;
      return !baseline.has(key);
    });
    if (!savedEvent) return;
    const d = (savedEvent.data ?? {}) as Record<string, unknown>;
    const status = String(d.status ?? 'unknown');
    const fingerprint = `sim_saved:${status}:${d.id ?? ''}:${d.reason ?? ''}`;
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === fingerprint) return;
      sessionStorage.setItem(STORAGE_KEY, fingerprint);
    } catch {
      /* silent */
    }
    if (status === 'saved') {
      const id = typeof d.id === 'string' ? d.id.slice(0, 8) : 'run';
      toast('success', 'Saved to cache', `Run ${id}… stored. Open LOAD to replay.`);
    } else if (status === 'failed') {
      toast('error', 'Cache save failed', String(d.error ?? 'Unknown error'));
    } else if (status === 'skipped') {
      const reason = String(d.reason ?? 'unknown');
      if (reason !== 'below_min_turns') {
        toast('info', 'Not cached', `Skipped: ${reason.replace(/_/g, ' ')}.`);
      }
    }
  }, [events, tourActive, toast]);
}
