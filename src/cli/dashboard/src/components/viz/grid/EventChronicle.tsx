import { useMemo, useState } from 'react';

interface ChronicleEvent {
  turn: number;
  kind: 'birth' | 'death' | 'forge' | 'crisis';
  side: 'a' | 'b';
  label: string;
  toolName?: string;
}

type ChronicleFilter = 'all' | 'birth' | 'death' | 'forge' | 'crisis';

const FILTER_CHIPS: { key: ChronicleFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'birth', label: 'Births' },
  { key: 'death', label: 'Deaths' },
  { key: 'forge', label: 'Forges' },
  { key: 'crisis', label: 'Crises' },
];

interface EventChronicleProps {
  eventsA: Array<{ type: string; turn?: number; data?: Record<string, unknown> }>;
  eventsB: Array<{ type: string; turn?: number; data?: Record<string, unknown> }>;
  currentTurn: number;
  onJumpToTurn: (turn: number) => void;
  /** Lifted hover turn so sister widgets (sparkline) can render a
   *  matching ghost cursor. 0-indexed to match currentTurn. */
  onHoverTurnChange?: (turn: number | null) => void;
  hoveredTurn?: number | null;
  /** Fires when a forge dot is clicked. Parent opens the lineage modal. */
  onForgeSelect?: (toolName: string, side: 'a' | 'b') => void;
  /**
   * Optional controlled filter. When `filter` + `onFilterChange` are
   * provided, the parent owns the filter state and can propagate it to
   * sister widgets (e.g. dim non-matching flares in the main canvas).
   * When omitted, EventChronicle falls back to its own internal state.
   */
  filter?: ChronicleFilter;
  onFilterChange?: (next: ChronicleFilter) => void;
}

export type { ChronicleFilter };

const KIND_COLORS: Record<ChronicleEvent['kind'], string> = {
  birth: 'rgba(154, 205, 96, 0.95)',
  death: 'rgba(200, 95, 80, 0.95)',
  forge: 'rgba(232, 180, 74, 0.95)',
  crisis: 'rgba(196, 74, 30, 0.95)',
};

const KIND_GLYPHS: Record<ChronicleEvent['kind'], string> = {
  birth: '+',
  death: '\u00D7', // ×
  forge: '\u25B2', // ▲
  crisis: '\u26A1', // ⚡
};

/**
 * Dots-and-ticks strip summarizing the last ~40 meaningful events
 * across both leaders. Click a dot to jump the timeline playhead to
 * that turn. Sides encoded by vertical position (upper half = A,
 * lower half = B); kinds by color + glyph; current turn highlighted.
 */
export function EventChronicle({
  eventsA,
  eventsB,
  currentTurn,
  onJumpToTurn,
  onHoverTurnChange,
  hoveredTurn,
  onForgeSelect,
  filter: controlledFilter,
  onFilterChange,
}: EventChronicleProps) {
  const chronicle = useMemo<ChronicleEvent[]>(() => {
    const out: ChronicleEvent[] = [];
    const collect = (
      events: EventChronicleProps['eventsA'],
      side: 'a' | 'b',
    ) => {
      for (const e of events) {
        const turn = Number(e.turn ?? e.data?.turn ?? 0);
        if (turn <= 0) continue;
        if (e.type === 'birth') {
          out.push({ turn, kind: 'birth', side, label: `T${turn}: birth (${side.toUpperCase()})` });
        } else if (e.type === 'death') {
          const name = typeof e.data?.name === 'string' ? e.data.name : '';
          out.push({
            turn,
            kind: 'death',
            side,
            label: `T${turn}: ${name ? name + ' died' : 'death'} (${side.toUpperCase()})`,
          });
        } else if (e.type === 'forge_attempt') {
          const name = typeof e.data?.name === 'string' ? e.data.name : 'tool';
          const approved = e.data?.approved === true;
          out.push({
            turn,
            kind: 'forge',
            side,
            label: `T${turn}: ${approved ? 'forged' : 'rejected'} ${name} (${side.toUpperCase()}) — click for lineage`,
            toolName: name,
          });
        } else if (e.type === 'event_start' || e.type === 'director_crisis') {
          const cat = typeof e.data?.category === 'string' ? e.data.category : '';
          if (cat && ['political', 'social', 'infrastructure', 'medical', 'resource', 'environmental'].includes(cat)) {
            out.push({
              turn,
              kind: 'crisis',
              side,
              label: `T${turn}: ${cat} crisis (${side.toUpperCase()})`,
            });
          }
        }
      }
    };
    collect(eventsA, 'a');
    collect(eventsB, 'b');
    out.sort((a, b) => a.turn - b.turn);
    return out.slice(-60);
  }, [eventsA, eventsB]);

  // Uncontrolled fallback. When the parent passes `filter` + `onFilterChange`
  // the internal state is shadowed entirely — the controlled value flows
  // through and setFilterInternal is a no-op signal to React that state
  // is owned upstream.
  const [internalFilter, setFilterInternal] = useState<ChronicleFilter>('all');
  const filter = controlledFilter ?? internalFilter;
  const setFilter = (next: ChronicleFilter) => {
    if (controlledFilter === undefined) setFilterInternal(next);
    onFilterChange?.(next);
  };
  const filtered = useMemo(
    () => (filter === 'all' ? chronicle : chronicle.filter(e => e.kind === filter)),
    [chronicle, filter],
  );
  if (chronicle.length === 0) return null;

  return (
    <div
      style={{
        padding: '4px 10px',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        overflowX: 'auto',
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontFamily: 'var(--mono)',
          color: 'var(--text-3)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          fontWeight: 700,
        }}
      >
        Events ({filtered.length}
        {filter !== 'all' ? `/${chronicle.length}` : ''})
      </span>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {FILTER_CHIPS.map(chip => {
          const active = filter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilter(chip.key)}
              aria-pressed={active}
              // Bigger + higher-contrast per user feedback — the
              // prior 8px / 1×6 padding rendered as unreadable
              // specks on the dashboard density. Now 11px / 4×10
              // padding with brighter active state so the pills
              // read as real buttons and the filter state is
              // obvious at a glance.
              style={{
                padding: '4px 10px',
                fontSize: 11,
                fontFamily: 'var(--mono)',
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                background: active
                  ? 'linear-gradient(135deg, var(--amber), #c8952e)'
                  : 'var(--bg-card)',
                color: active ? 'var(--bg-deep)' : 'var(--text-2)',
                border: active ? '1px solid var(--amber)' : '1px solid var(--border)',
                borderRadius: 4,
                cursor: 'pointer',
                boxShadow: active ? '0 0 0 2px rgba(232,180,74,0.2)' : 'none',
                transition: 'background 120ms, color 120ms, border-color 120ms',
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flex: 1,
          minWidth: 0,
        }}
      >
        {filtered.map((ev, i) => {
          const evTurn0 = Math.max(0, ev.turn - 1);
          const isCurrent = evTurn0 === currentTurn;
          const isHovered = hoveredTurn === evTurn0;
          return (
            <button
              key={`${ev.turn}-${ev.side}-${ev.kind}-${i}`}
              type="button"
              onClick={() => {
                if (ev.kind === 'forge' && ev.toolName && onForgeSelect) {
                  onForgeSelect(ev.toolName, ev.side);
                } else {
                  onJumpToTurn(evTurn0);
                }
              }}
              onMouseEnter={() => onHoverTurnChange?.(evTurn0)}
              onMouseLeave={() => onHoverTurnChange?.(null)}
              onFocus={() => onHoverTurnChange?.(evTurn0)}
              onBlur={() => onHoverTurnChange?.(null)}
              title={ev.label}
              aria-label={ev.label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 16,
                height: 16,
                padding: 0,
                fontSize: 9,
                fontFamily: 'var(--mono)',
                fontWeight: 800,
                background: isHovered ? 'rgba(232, 180, 74, 0.18)' : 'transparent',
                color: KIND_COLORS[ev.kind],
                border: 'none',
                borderRadius: 3,
                cursor: 'pointer',
                transform: ev.side === 'a' ? 'translateY(-2px)' : 'translateY(2px)',
                opacity: isCurrent || isHovered ? 1 : 0.7,
                textShadow: isCurrent || isHovered ? `0 0 6px ${KIND_COLORS[ev.kind]}` : 'none',
                transition: 'opacity 120ms, text-shadow 120ms, background 120ms',
              }}
            >
              {KIND_GLYPHS[ev.kind]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
