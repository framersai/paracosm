/**
 * Event Log tab content. Scrollable list of every SSE event with
 * per-type color coding, a hash-driven tool filter (`#log=<toolName>`
 * set by the ToolboxSection CTA), and auto-pin-to-bottom behaviour.
 *
 * Extracted from App.tsx.
 */
import { useEffect, useRef, useCallback } from 'react';
import type { SimEvent } from '../../hooks/useSSE';

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
      className="flex-1 overflow-y-auto p-4 font-mono text-xs"
      role="log"
      aria-label="Event log"
      aria-live="polite"
      style={{ background: 'var(--bg-deep)', color: 'var(--text-3)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ color: 'var(--text-1)', fontSize: '14px', fontWeight: 700 }}>
          Event Log ({filteredEvents.length}
          {logFilter ? ` of ${events.length}` : ''} events)
        </h2>
        {logFilter && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 11 }}>
            <span style={{ color: 'var(--text-3)' }}>filtered to tool</span>
            <span style={{ color: 'var(--amber)', fontWeight: 800 }}>{hashTool}</span>
            <button
              type="button"
              onClick={() => {
                const url = new URL(window.location.href);
                url.hash = '';
                window.history.replaceState({}, '', url.toString());
                window.dispatchEvent(new HashChangeEvent('hashchange'));
              }}
              style={{
                padding: '2px 8px', borderRadius: 3,
                background: 'var(--bg-card)', color: 'var(--text-3)',
                border: '1px solid var(--border)', cursor: 'pointer',
                fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
              }}
              aria-label="Clear log filter"
            >
              Clear filter
            </button>
          </div>
        )}
      </div>
      {filteredEvents.length === 0 && (
        <div style={{ color: 'var(--text-3)', padding: '20px 0' }}>
          {logFilter
            ? `No events matched "${hashTool}". Clear the filter or check the tool name spelling.`
            : 'No events yet. Run a simulation to see the raw SSE event stream.'}
        </div>
      )}
      {filteredEvents.map((e, i) => {
        const color = TYPE_COLORS[e.type] || 'var(--text-3)';
        const hasData = e.data && Object.keys(e.data).length > 0;
        return (
          <details key={i} style={{ borderBottom: '1px solid var(--border)', padding: '2px 0' }}>
            <summary style={{ cursor: 'pointer', padding: '4px 0', display: 'flex', gap: '8px', alignItems: 'baseline' }}>
              <span style={{ color: 'var(--text-3)', minWidth: '28px', textAlign: 'right', opacity: 0.5 }}>{i}</span>
              <span style={{ color, fontWeight: 700, minWidth: '120px' }}>{e.type}</span>
              <span style={{ color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.leader}</span>
              {e.data?.turn != null && <span style={{ color: 'var(--text-3)' }}>T{String(e.data.turn)}</span>}
              {!!e.data?.title && <span style={{ color: 'var(--text-2)' }}>{String(e.data.title)}</span>}
              {!!e.data?.department && <span style={{ color: 'var(--teal)' }}>{String(e.data.department)}</span>}
              {!!e.data?.outcome && <span style={{ color: 'var(--amber)', fontWeight: 700 }}>{String(e.data.outcome)}</span>}
            </summary>
            {hasData && (
              <pre style={{
                padding: '8px 12px 8px 44px', margin: '0 0 4px',
                background: 'var(--bg-card)', borderRadius: '4px', border: '1px solid var(--border)',
                overflow: 'auto', maxHeight: '400px', fontSize: '11px', lineHeight: 1.5,
                color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {JSON.stringify(e.data, null, 2)}
              </pre>
            )}
          </details>
        );
      })}
    </div>
  );
}
