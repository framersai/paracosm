import * as React from 'react';
import type { RunRecord } from '../../../../../server/run-record.js';

const STORAGE_KEY = 'paracosm-library-recent';
const MAX_RECENT = 5;

export function useRecentlyViewed(): {
  records: RunRecord[];
  push: (record: RunRecord) => void;
  clear: () => void;
} {
  const [records, setRecords] = React.useState<RunRecord[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as RunRecord[]) : [];
    } catch {
      return [];
    }
  });

  const push = React.useCallback((record: RunRecord) => {
    setRecords(prev => {
      const filtered = prev.filter(r => r.runId !== record.runId);
      const next = [record, ...filtered].slice(0, MAX_RECENT);
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, []);

  const clear = React.useCallback(() => {
    setRecords([]);
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  }, []);

  return { records, push, clear };
}
