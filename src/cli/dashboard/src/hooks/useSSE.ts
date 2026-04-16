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

  const reset = useCallback(() => {
    setState({ status: 'connecting', events: [], results: [], verdict: null, errors: [], isComplete: false });
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
    const open = () => {
      if (cancelled) return;
      // Replace state.events on each reconnect to avoid duplicates from
      // the server's buffer replay.
      const es = new EventSource('/events');
      esRef.current = es;

      es.addEventListener('connected', () => {
        attempt = 0;
        // Reset events here too — server replays buffered events right
        // after 'connected', so we want a clean slate before they arrive.
        setState(prev => ({ ...prev, status: 'connected', events: [] }));
      });

      es.addEventListener('sim', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as SimEvent;
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
