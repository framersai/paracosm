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
  isComplete: boolean;
}

export function useSSE() {
  const [state, setState] = useState<SSEState>({
    status: 'connecting',
    events: [],
    results: [],
    verdict: null,
    isComplete: false,
  });
  const esRef = useRef<EventSource | null>(null);

  const reset = useCallback(() => {
    setState({ status: 'connecting', events: [], results: [], verdict: null, isComplete: false });
  }, []);

  useEffect(() => {
    const es = new EventSource('/events');
    esRef.current = es;

    es.addEventListener('connected', () => {
      setState(prev => ({ ...prev, status: 'connected' }));
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
        console.error('[SSE] Simulation error:', data.error);
      } catch {}
    });

    es.onerror = () => {
      setState(prev => ({ ...prev, status: 'error' }));
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  return { ...state, reset };
}
