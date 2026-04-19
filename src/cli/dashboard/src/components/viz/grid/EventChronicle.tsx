import { useMemo } from 'react';

interface ChronicleEvent {
  turn: number;
  kind: 'birth' | 'death' | 'forge' | 'crisis';
  side: 'a' | 'b';
  label: string;
}

interface EventChronicleProps {
  eventsA: Array<{ type: string; turn?: number; data?: Record<string, unknown> }>;
  eventsB: Array<{ type: string; turn?: number; data?: Record<string, unknown> }>;
  currentTurn: number;
  onJumpToTurn: (turn: number) => void;
  /** Lifted hover turn so sister widgets (sparkline) can render a
   *  matching ghost cursor. 0-indexed to match currentTurn. */
  onHoverTurnChange?: (turn: number | null) => void;
  hoveredTurn?: number | null;
}

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
            label: `T${turn}: ${approved ? 'forged' : 'rejected'} ${name} (${side.toUpperCase()})`,
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
          fontSize: 8,
          fontFamily: 'var(--mono)',
          color: 'var(--text-4)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        Events ({chronicle.length})
      </span>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flex: 1,
          minWidth: 0,
        }}
      >
        {chronicle.map((ev, i) => {
          const evTurn0 = Math.max(0, ev.turn - 1);
          const isCurrent = evTurn0 === currentTurn;
          const isHovered = hoveredTurn === evTurn0;
          return (
            <button
              key={`${ev.turn}-${ev.side}-${ev.kind}-${i}`}
              type="button"
              onClick={() => onJumpToTurn(evTurn0)}
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
