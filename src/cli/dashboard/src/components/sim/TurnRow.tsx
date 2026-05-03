import * as React from 'react';
import type { CSSProperties } from 'react';
import { EventCard } from './EventCard.js';
import { DiffBadge } from './DiffBadge.js';
import { getActorColorVar } from '../../hooks/useGameState.js';
import type { ProcessedEvent } from '../../hooks/useGameState.js';
import type { TurnDiffEntry } from './turn-diff.js';
import styles from './TurnRow.module.scss';

void React;

interface TurnRowProps {
  entry: TurnDiffEntry;
  eventsA: ProcessedEvent[];
  eventsB: ProcessedEvent[];
}

export function TurnRow({ entry, eventsA, eventsB }: TurnRowProps) {
  const rowClass = `${styles.row} ${
    entry.classification === 'different-outcome' ? styles.differentOutcome
    : entry.classification === 'different-event' ? styles.differentEvent
    : ''
  }`;

  const sameTitle = entry.titleA === entry.titleB && entry.titleA !== '';

  return (
    <section
      id={`turn-row-${entry.turn}`}
      className={rowClass}
      aria-labelledby={`turn-row-${entry.turn}-h`}
    >
      <h3 id={`turn-row-${entry.turn}-h`} className={styles.header}>
        <span className={styles.headerTurn}>T{entry.turn}</span>
        <DiffBadge classification={entry.classification} />
        {sameTitle ? (
          <span className={styles.headerTitle}>{entry.titleA}</span>
        ) : (
          <span className={styles.headerTitleSplit}>
            <span className={styles.headerTitleA}>{entry.titleA || '—'}</span>
            <span className={styles.headerTitleB}>{entry.titleB || '—'}</span>
          </span>
        )}
      </h3>

      <div className={styles.cells}>
        <div
          className={styles.cell}
          style={{ ['--cell-color' as string]: getActorColorVar(0) } as CSSProperties}
          aria-label="Leader A events for this turn"
        >
          <span className={styles.cellBand} aria-hidden="true" />
          {eventsA.length === 0 ? (
            <div className={styles.cellEmpty}>(no events yet)</div>
          ) : (
            eventsA.map(e => (
              e.type === 'turn_start' || e.type === 'specialist_start' || e.type === 'decision_pending'
                ? null
                : <EventCard key={e.id} event={e} actorIndex={0} />
            ))
          )}
        </div>
        <div
          className={styles.cell}
          style={{ ['--cell-color' as string]: getActorColorVar(1) } as CSSProperties}
          aria-label="Leader B events for this turn"
        >
          <span className={styles.cellBand} aria-hidden="true" />
          {eventsB.length === 0 ? (
            <div className={styles.cellEmpty}>(no events yet)</div>
          ) : (
            eventsB.map(e => (
              e.type === 'turn_start' || e.type === 'specialist_start' || e.type === 'decision_pending'
                ? null
                : <EventCard key={e.id} event={e} actorIndex={1} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
