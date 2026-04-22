/**
 * Event Log tab content. Scrollable list of every SSE event with
 * per-type color coding, a hash-driven tool filter (`#log=<toolName>`
 * set by the ToolboxSection CTA), and auto-pin-to-bottom behaviour.
 */
import { useEffect, useRef, useCallback } from 'react';
import type { SimEvent } from '../../hooks/useSSE';
import styles from './EventLogPanel.module.scss';

const TYPE_COLORS: Record<string, string> = {
  status: 'var(--teal)',
  turn_start: 'var(--rust)',
  turn_done: 'var(--rust)',
  dept_start: 'var(--text-3)',
  dept_done: 'var(--green)',
  commander_deciding: 'var(--amber)',
  commander_decided: 'var(--amber)',
  outcome: '#e8b44a',
  drift: 'var(--teal)',
  agent_reactions: '#6aad48',
  bulletin: 'var(--text-2)',
  promotion: 'var(--teal)',
};

interface EventLogPanelProps {
  /** Full event stream to render. Filtering by tool-name happens
   *  inside the panel using the hash param. */
  events: SimEvent[];
}

function readLogFilterFromHash(): string {
  if (typeof window === 'undefined') return '';
  const h = window.location.hash.replace(/^#/, '');
  const match = h.match(/(?:^|&)log=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export function EventLogPanel({ events }: EventLogPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  useEffect(() => {
    if (!pinnedRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const hashTool = readLogFilterFromHash();
  const logFilter = hashTool.toLowerCase();
  const filteredEvents = logFilter
    ? events.filter((e) => {
        const d = (e.data ?? {}) as Record<string, unknown>;
        const name = typeof d.name === 'string' ? d.name.toLowerCase() : '';
        if (name && name.includes(logFilter)) return true;
        const tools = Array.isArray(d.forgedTools) ? d.forgedTools : [];
        return tools.some((t) => {
          const tt = t as Record<string, unknown>;
          const tn = typeof tt.name === 'string' ? tt.name.toLowerCase() : '';
          return tn.includes(logFilter);
        });
      })
    : events;

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={`flex-1 overflow-y-auto p-4 font-mono text-xs ${styles.panel}`}
      role="log"
      aria-label="Event log"
      aria-live="polite"
    >
      <div className={styles.header}>
        <h2 className={styles.heading}>
          Event Log ({filteredEvents.length}
          {logFilter ? ` of ${events.length}` : ''} events)
        </h2>
        {logFilter && (
          <div className={styles.filterBar}>
            <span className={styles.filterLabel}>filtered to tool</span>
            <span className={styles.filterValue}>{hashTool}</span>
            <button
              type="button"
              onClick={() => {
                const url = new URL(window.location.href);
                url.hash = '';
                window.history.replaceState({}, '', url.toString());
                window.dispatchEvent(new HashChangeEvent('hashchange'));
              }}
              className={styles.clearFilterButton}
              aria-label="Clear log filter"
            >
              Clear filter
            </button>
          </div>
        )}
      </div>
      {filteredEvents.length === 0 && (
        <div className={styles.emptyState}>
          {logFilter
            ? `No events matched "${hashTool}". Clear the filter or check the tool name spelling.`
            : 'No events yet. Run a simulation to see the raw SSE event stream.'}
        </div>
      )}
      {filteredEvents.map((e, i) => {
        const color = TYPE_COLORS[e.type] || 'var(--text-3)';
        const hasData = e.data && Object.keys(e.data).length > 0;
        return (
          <details key={i} className={styles.event}>
            <summary className={styles.eventSummary}>
              <span className={styles.index}>{i}</span>
              <span className={styles.type} style={{ color }}>{e.type}</span>
              <span className={styles.leader}>{e.leader}</span>
              {e.data?.turn != null && <span className={styles.turn}>T{String(e.data.turn)}</span>}
              {!!e.data?.title && <span className={styles.title}>{String(e.data.title)}</span>}
              {!!e.data?.department && <span className={styles.department}>{String(e.data.department)}</span>}
              {!!e.data?.outcome && <span className={styles.outcome}>{String(e.data.outcome)}</span>}
            </summary>
            {hasData && (
              <pre className={styles.dataBlock}>
                {JSON.stringify(e.data, null, 2)}
              </pre>
            )}
          </details>
        );
      })}
    </div>
  );
}
