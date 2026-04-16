import { useState, useEffect, useRef, useCallback } from 'react';

export interface SimEvent {
  type: string;
  leader: string;
  turn?: number;
  year?: number;
  data?: Record<string, unknown>;
}

/**
 * Terminal provider error state — set when any leader's simulation hit a
 * quota or auth error that killed the run. Rendered as a persistent banner
 * (not a dismissable toast) because it represents an account-level problem
 * the user must resolve before running another simulation.
 */
export interface ProviderErrorState {
  /** 'quota' = credits exhausted; 'auth' = bad key. Other kinds do not
   *  flip this flag because they are recoverable within the same run. */
  kind: 'quota' | 'auth' | 'rate_limit' | 'network' | 'unknown';
  provider?: string;
  message: string;
  actionUrl?: string;
  /** Which leader hit the error first (useful when one leader's key works
   *  and the other's doesn't — rare but possible). */
  leader?: string;
}

interface SSEState {
  status: 'connecting' | 'connected' | 'error';
  events: SimEvent[];
  results: Array<{ leader: string; summary: Record<string, unknown>; fingerprint: Record<string, string> | null }>;
  verdict: Record<string, unknown> | null;
  errors: string[];
  isComplete: boolean;
  /** Terminal provider error (quota / auth). `null` when the run is healthy. */
  providerError: ProviderErrorState | null;
}

export function useSSE() {
  const [state, setState] = useState<SSEState>({
    status: 'connecting',
    events: [],
    results: [],
    verdict: null,
    errors: [],
    isComplete: false,
    providerError: null,
  });
  const esRef = useRef<EventSource | null>(null);
  // Dedupe set used by the connection effect. Lifted to a ref so reset()
  // can clear it — otherwise the same events that we just nuked locally
  // would be filtered out on the server's buffer replay (or its absence
  // would still leave the set populated forever).
  const seenEventKeysRef = useRef<Set<string>>(new Set());

  /**
   * Clear all client-side SSE state AND tell the server to drop its
   * event buffer so the next reconnect doesn't replay the same events
   * we just cleared. Status stays 'connected' because the EventSource
   * itself is still open — we only nuke the data.
   */
  const reset = useCallback(async () => {
    seenEventKeysRef.current.clear();
    setState(prev => ({
      // Preserve current connection status so the UI doesn't flash
      // "Connecting..." just because the user pressed Clear.
      status: prev.status,
      events: [], results: [], verdict: null, errors: [], isComplete: false,
      // Clear provider error on manual reset. If the underlying problem
      // still exists (key still bad / still no credits), the next run's
      // first LLM call will re-fire the `provider_error` event within
      // seconds, which is the right UX: let the user try.
      providerError: null,
    }));
    try {
      await fetch('/clear', { method: 'POST' });
    } catch {
      // Server unreachable — local state is still cleared so the user
      // sees the empty state regardless.
    }
  }, []);

  const loadEvents = useCallback((events: SimEvent[], results?: unknown[], verdict?: Record<string, unknown> | null) => {
    // Scan loaded events for any previously-persisted provider_error so
    // a reload after a failed run restores the banner state, not just
    // the viz/reports tabs.
    const errEvent = events.find(e => e.type === 'provider_error');
    const restoredProviderError: ProviderErrorState | null = errEvent
      ? {
          kind: (errEvent.data?.kind as ProviderErrorState['kind']) ?? 'unknown',
          provider: errEvent.data?.provider as string | undefined,
          message: String(errEvent.data?.message ?? 'Provider error'),
          actionUrl: errEvent.data?.actionUrl as string | undefined,
          leader: errEvent.leader,
        }
      : null;
    setState({
      status: 'connected',
      events,
      results: (results || []) as SSEState['results'],
      verdict: verdict || null,
      errors: [],
      isComplete: true,
      providerError: restoredProviderError,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    /**
     * Open a fresh EventSource and re-attach listeners. The server replays
     * its full event buffer on reconnect, so resumed clients catch up
     * automatically. Backoff caps at 10s; reset on successful 'connected'.
     */
    let connectCount = 0;
    // The dedupe set is owned by seenEventKeysRef so reset() can clear it.
    // Tracks event identity so we can dedupe across reconnects without
    // wiping state.events (which would lose the user's view of completed
    // simulations after a transient browser-managed reconnect).
    const seenEventKeys = seenEventKeysRef.current;
    // Build a dedup key that uniquely identifies a logical event.
    //
    // IMPORTANT: the orchestrator emits events with turn nested in
    // `e.data.turn`, not the top-level `e.turn` field. Earlier versions
    // of this key only looked at `e.turn` (always undefined in practice)
    // and relied on eventIndex/department/title as the real
    // discriminators. That silently ate every turn after turn 1 for
    // event types that have no other discriminator in their payload:
    // colony_snapshot, turn_done, drift, bulletin, agent_reactions.
    //
    // The user-visible symptom was the viz tab stuck showing T1 while
    // the sim tab correctly counted up to T3+ (because the only
    // replacement colony_snapshot events for T2/T3 were filtered as
    // "already seen"). Falling back to `e.data?.turn` when the top-level
    // field is missing restores a monotonic key across turns for every
    // emit path.
    const eventKey = (e: SimEvent): string => {
      const turnId = (e.turn ?? (e.data?.turn as number | undefined) ?? '');
      const eventIndex = (e.data?.eventIndex ?? '');
      const department = (e.data?.department ?? '');
      const title = (e.data?.title ?? '');
      // Some per-agent / per-tool payloads need extra discriminators
      // too, so they don't collapse across different agents/tools in
      // the same turn. Forge attempts carry `name`; agent reactions
      // roll up into a single per-turn event so the turn suffices.
      const forgeName = (e.data?.name ?? '');
      return `${e.type}|${e.leader || ''}|${turnId}|${eventIndex}|${department}|${title}|${forgeName}`;
    };

    const open = () => {
      if (cancelled) return;
      const es = new EventSource('/events');
      esRef.current = es;

      es.addEventListener('connected', () => {
        attempt = 0;
        connectCount += 1;
        // On the FIRST connect we want a clean slate (the server replays
        // its full buffer right after 'connected'). On reconnects we keep
        // existing events so a browser-managed reconnect after the sim
        // finishes doesn't wipe the user's view of viz/reports/chat.
        // The dedupe Set below handles any duplicates from buffer replay.
        if (connectCount === 1) {
          seenEventKeys.clear();
          setState(prev => ({ ...prev, status: 'connected', events: [] }));
        } else {
          setState(prev => ({ ...prev, status: 'connected' }));
        }
      });

      es.addEventListener('sim', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as SimEvent;
          const key = eventKey(data);
          if (seenEventKeys.has(key)) return; // skip duplicate from buffer replay
          seenEventKeys.add(key);
          // Intercept `provider_error` sim events and hoist them into a
          // dedicated state slot for the persistent banner. We still keep
          // them in `events` for audit / reload-restoration purposes.
          if (data.type === 'provider_error' && data.data) {
            const d = data.data as Record<string, unknown>;
            setState(prev => ({
              ...prev,
              events: [...prev.events, data],
              // If we already have a providerError set (e.g. leader A's
              // error arrived first), do not overwrite: keep the first one
              // because that is the root cause the user will act on.
              providerError: prev.providerError ?? {
                kind: (d.kind as ProviderErrorState['kind']) ?? 'unknown',
                provider: d.provider as string | undefined,
                message: String(d.message ?? 'Provider error'),
                actionUrl: d.actionUrl as string | undefined,
                leader: data.leader,
              },
            }));
            return;
          }
          setState(prev => ({ ...prev, events: [...prev.events, data] }));
        } catch {}
      });

      es.addEventListener('result', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setState(prev => ({ ...prev, results: [...prev.results, data] }));
        } catch {}
      });

      es.addEventListener('verdict', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setState(prev => ({ ...prev, verdict: data }));
        } catch {}
      });

      es.addEventListener('complete', () => {
        setState(prev => ({ ...prev, isComplete: true }));
      });

      es.addEventListener('sim_error', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const msg = String(data.error || 'Unknown simulation error');
          console.error('[SSE] Simulation error:', msg);
          setState(prev => ({ ...prev, errors: [...prev.errors, msg] }));
        } catch {}
      });

      es.onerror = () => {
        // Browser EventSource auto-reconnects in some failure modes but
        // not all (e.g., 5xx, redeploys). Force a backoff reconnect to
        // recover without a manual page refresh.
        setState(prev => ({ ...prev, status: 'error' }));
        try { es.close(); } catch {}
        esRef.current = null;
        if (cancelled) return;
        attempt += 1;
        const delay = Math.min(10_000, 500 * Math.pow(2, attempt - 1));
        reconnectTimer = setTimeout(open, delay);
      };
    };

    open();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const es = esRef.current;
      if (es) { try { es.close(); } catch {} }
      esRef.current = null;
    };
  }, []);

  return { ...state, reset, loadEvents };
}
