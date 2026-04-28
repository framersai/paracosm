/**
 * Modal popup for a single actor when the user clicks a node in the
 * Constellation view. Composes <ActorBar> (header chip + HEXACO bars
 * + spark histories) with a vertical timeline of that actor's events
 * grouped by turn, plus a Decisions section derived from
 * `type === 'decision_made'` events.
 *
 * Doesn't reuse <ReportView> because that component is hard-coded to
 * actorIds[0]/actorIds[1] slot rendering — passing it a single-actor
 * filtered state would render an empty B-column.
 *
 * @module paracosm/dashboard/sim/ActorDrillInModal
 */
import * as React from 'react';
import { ActorBar } from '../layout/ActorBar.js';
import type { GameState, ProcessedEvent } from '../../hooks/useGameState.js';

export interface ActorDrillInModalProps {
  actorName: string | null;
  actorIndex: number;
  state: GameState;
  onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.55)',
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const modalStyle: React.CSSProperties = {
  background: 'var(--bg-panel)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  width: 'min(820px, 92vw)',
  maxHeight: '92vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.75rem 1rem',
  borderBottom: '1px solid var(--border)',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text-2)',
  border: 'none',
  fontSize: 22,
  lineHeight: 1,
  cursor: 'pointer',
  padding: '0 0.5rem',
};

const bodyStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  overflow: 'auto',
};

function eventTitle(e: ProcessedEvent): string {
  const data = e.data ?? {};
  const title = (data.title ?? data.choice ?? data.summary) as string | undefined;
  return title ?? e.type;
}

export function ActorDrillInModal({ actorName, actorIndex, state, onClose }: ActorDrillInModalProps): JSX.Element | null {
  React.useEffect(() => {
    if (actorName === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actorName, onClose]);

  if (actorName === null) return null;
  const side = state.actors[actorName];
  if (!side) return null;

  const events = side.events ?? [];
  const decisions = events.filter((e) => e.type === 'decision_made');
  const grouped = new Map<number, ProcessedEvent[]>();
  for (const e of events) {
    const turn = e.turn ?? 0;
    const list = grouped.get(turn) ?? [];
    list.push(e);
    grouped.set(turn, list);
  }
  const turnNumbers = [...grouped.keys()].sort((a, b) => a - b);

  return (
    <div style={overlayStyle} role="presentation" onClick={onClose}>
      <div
        style={modalStyle}
        role="dialog"
        aria-modal="true"
        aria-label={`Report for ${actorName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headStyle}>
          <div style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{actorName}</div>
          <button type="button" aria-label="Close drill-in" style={closeBtnStyle} onClick={onClose}>×</button>
        </header>
        <div style={bodyStyle}>
          <ActorBar
            actorIndex={actorIndex}
            leader={side.leader}
            popHistory={side.popHistory}
            moraleHistory={side.moraleHistory}
          />

          {decisions.length > 0 && (
            <section style={{ marginTop: '1rem' }}>
              <h3 style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                Decisions ({decisions.length})
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0' }}>
                {decisions.map((d) => {
                  const choice = (d.data?.choice ?? d.data?.title ?? '<choice>') as string;
                  const rationale = (d.data?.rationale ?? '') as string;
                  return (
                    <li key={d.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 600 }}>T{d.turn ?? '?'}: {choice}</div>
                      {rationale && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>{rationale}</div>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section style={{ marginTop: '1rem' }}>
            <h3 style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
              Timeline ({events.length} events)
            </h3>
            {turnNumbers.length === 0 && (
              <p style={{ color: 'var(--text-3)' }}>No events captured yet.</p>
            )}
            {turnNumbers.map((turn) => (
              <article key={turn} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <header style={{ fontWeight: 600, fontFamily: 'var(--mono)' }}>Turn {turn}</header>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0.25rem 0 0' }}>
                  {(grouped.get(turn) ?? []).map((e) => (
                    <li key={e.id} style={{ fontSize: 13, padding: '0.15rem 0' }}>
                      <span style={{ color: 'var(--text-3)' }}>{e.type}</span>
                      {' '}
                      {eventTitle(e)}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
