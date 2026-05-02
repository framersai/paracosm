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
import styles from './ActorDrillInModal.module.scss';

export interface ActorDrillInModalProps {
  actorName: string | null;
  actorIndex: number;
  state: GameState;
  onClose: () => void;
}

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
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={`Report for ${actorName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <div className={styles.actorName}>{actorName}</div>
          <button type="button" aria-label="Close drill-in" className={styles.closeBtn} onClick={onClose}>×</button>
        </header>
        <div className={styles.body}>
          <ActorBar
            actorIndex={actorIndex}
            leader={side.leader}
            popHistory={side.popHistory}
            moraleHistory={side.moraleHistory}
          />

          {decisions.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Decisions ({decisions.length})</h3>
              <ul className={styles.list}>
                {decisions.map((d) => {
                  const choice = (d.data?.choice ?? d.data?.title ?? '<choice>') as string;
                  const rationale = (d.data?.rationale ?? '') as string;
                  return (
                    <li key={d.id} className={styles.decisionItem}>
                      <div className={styles.decisionTitle}>T{d.turn ?? '?'}: {choice}</div>
                      {rationale && <div className={styles.decisionRationale}>{rationale}</div>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Timeline ({events.length} events)</h3>
            {turnNumbers.length === 0 && (
              <p className={styles.empty}>No events captured yet.</p>
            )}
            {turnNumbers.map((turn) => (
              <article key={turn} className={styles.turnArticle}>
                <header className={styles.turnHeader}>Turn {turn}</header>
                <ul className={styles.turnList}>
                  {(grouped.get(turn) ?? []).map((e) => (
                    <li key={e.id} className={styles.turnEvent}>
                      <span className={styles.turnEventType}>{e.type}</span>
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
