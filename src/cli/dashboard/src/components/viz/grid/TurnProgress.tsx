import { useMemo } from 'react';

type Event = { type: string; turn?: number; data?: Record<string, unknown> };

interface TurnProgressProps {
  eventsA: Event[];
  eventsB: Event[];
  totalDepartments: number;
}

interface SideProgress {
  inFlightTurn: number | null;
  deptsReported: Set<string>;
}

function computeSide(events: Event[]): SideProgress {
  let lastCompletedTurn = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === 'turn_done') {
      const t = Number(e.turn ?? e.data?.turn ?? 0);
      if (t > 0) {
        lastCompletedTurn = t;
        break;
      }
    }
  }
  const inFlightTurn = lastCompletedTurn + 1;
  const reported = new Set<string>();
  let sawInFlight = false;
  for (const e of events) {
    const t = Number(e.turn ?? e.data?.turn ?? 0);
    if (e.type === 'dept_done' && t === inFlightTurn) {
      const dept = typeof e.data?.department === 'string' ? e.data.department : '';
      if (dept) reported.add(dept);
      sawInFlight = true;
    }
    if (e.type === 'turn_done' && t === inFlightTurn) {
      return { inFlightTurn: null, deptsReported: new Set() };
    }
  }
  return {
    inFlightTurn: sawInFlight ? inFlightTurn : null,
    deptsReported: reported,
  };
}

/**
 * Thin strip above the timeline showing in-flight turn state per
 * leader. Renders *only* while a turn is mid-stream (departments
 * reporting, turn_done not yet fired). Gives the viewer an at-a-
 * glance "the sim is thinking" signal without a spinner.
 */
export function TurnProgress({
  eventsA,
  eventsB,
  totalDepartments,
}: TurnProgressProps) {
  const a = useMemo(() => computeSide(eventsA), [eventsA]);
  const b = useMemo(() => computeSide(eventsB), [eventsB]);
  if (a.inFlightTurn === null && b.inFlightTurn === null) return null;

  const denom = Math.max(1, totalDepartments);
  const row = (
    label: string,
    color: string,
    p: SideProgress,
  ) => {
    if (p.inFlightTurn === null) return null;
    const pct = Math.min(100, (p.deptsReported.size / denom) * 100);
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flex: 1,
          minWidth: 0,
          fontSize: 9,
          fontFamily: 'var(--mono)',
          color: 'var(--text-3)',
          letterSpacing: '0.06em',
        }}
      >
        <span style={{ color, fontWeight: 800 }}>{label}</span>
        <span>T{p.inFlightTurn}</span>
        <div
          style={{
            flex: 1,
            minWidth: 40,
            height: 3,
            background: 'var(--bg-deep)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: color,
              transition: 'width 300ms ease',
            }}
          />
        </div>
        <span style={{ color: 'var(--text-4)', minWidth: 36, textAlign: 'right' }}>
          {p.deptsReported.size}/{denom}
        </span>
      </div>
    );
  };

  return (
    <div
      aria-live="polite"
      style={{
        display: 'flex',
        gap: 12,
        padding: '4px 10px',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {row('A', 'var(--vis)', a)}
      {row('B', 'var(--eng)', b)}
    </div>
  );
}
