import { useState, useEffect, useRef, useCallback } from 'react';

export interface SimEvent {
  type: string;
  leader: string;
  turn?: number;
  year?: number;
  data?: Record<string, unknown>;
}

interface SSEState {
  status: 'connecting' | 'connected' | 'error';
  events: SimEvent[];
  results: Array<{ leader: string; summary: Record<string, unknown>; fingerprint: Record<string, string> | null }>;
  verdict: Record<string, unknown> | null;
  errors: string[];
  isComplete: boolean;
}

export function useSSE() {
  const [state, setState] = useState<SSEState>({
    status: 'connecting',
    events: [],
    results: [],
    verdict: null,
    errors: [],
    isComplete: false,
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
    }));
    try {
      await fetch('/clear', { method: 'POST' });
    } catch {
      // Server unreachable — local state is still cleared so the user
      // sees the empty state regardless.
    }
  }, []);

  const loadEvents = useCallback((events: SimEvent[], results?: unknown[], verdict?: Record<string, unknown> | null) => {
    setState({
      status: 'connected',
      events,
      results: (results || []) as SSEState['results'],
      verdict: verdict || null,
      errors: [],
      isComplete: true,
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
    const eventKey = (e: SimEvent): string =>
      `${e.type}|${e.leader || ''}|${e.turn ?? ''}|${(e.data?.eventIndex ?? '')}|${(e.data?.department ?? '')}|${(e.data?.title ?? '')}`;

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
