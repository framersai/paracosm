import type { CSSProperties } from 'react';
import type { GameState } from '../../hooks/useGameState';
import styles from './DivergenceRail.module.scss';

interface DivergenceRailProps {
  state: GameState;
}

export function DivergenceRail({ state }: DivergenceRailProps) {
  const firstId = state.actorIds[0];
  const secondId = state.actorIds[1];
  const a = firstId ? state.actors[firstId] : null;
  const b = secondId ? state.actors[secondId] : null;
  if (!a || !b) return null;
  if (!a.event || !b.event) return null;
  if (a.event.turn !== b.event.turn) return null;
  if (!a.outcome || !b.outcome) return null;
  if (a.event.title === b.event.title && a.outcome === b.outcome) return null;

  const sameEvent = a.event.title === b.event.title;
  const fmtOutcome = (o: string) => o.replace(/_/g, ' ').toUpperCase();

  // Pull each side's decision text with a layered fallback so the two
  // cards always render parity.
  const pickDecision = (side: typeof a): string => {
    const outcomeEvt = side.events.find(e => e.type === 'outcome' && e.turn === side.event?.turn);
    const fromOutcome = outcomeEvt?.data?._decision as string | undefined;
    if (fromOutcome) return fromOutcome;
    if (side.pendingDecision) return side.pendingDecision;
    return side.event?.description || '';
  };

  const decisionA = pickDecision(a).slice(0, 180);
  const decisionB = pickDecision(b).slice(0, 180);

  const outcomeColorA = a.outcome.includes('success') ? 'var(--green)' : 'var(--rust)';
  const outcomeColorB = b.outcome.includes('success') ? 'var(--green)' : 'var(--rust)';

  return (
    <div aria-label="Divergence rail" className={styles.rail}>
      <div className={styles.heading}>
        DIVERGENCE T{a.event.turn} {sameEvent ? '(same event, different outcome)' : '(different events)'}
      </div>
      <div className={`diverge-sides ${styles.sides}`}>
        <div className={styles.sideA}>
          <b className={styles.titleA}>{a.event.title}</b>
          <span className={styles.decision}>{decisionA}</span>
          <div
            className={styles.outcome}
            style={{ '--outcome-color': outcomeColorA } as CSSProperties}
          >
            {fmtOutcome(a.outcome)}
          </div>
        </div>
        <div className={styles.sideB}>
          <b className={styles.titleB}>{b.event.title}</b>
          <span className={styles.decision}>{decisionB}</span>
          <div
            className={styles.outcome}
            style={{ '--outcome-color': outcomeColorB } as CSSProperties}
          >
            {fmtOutcome(b.outcome)}
          </div>
        </div>
      </div>
    </div>
  );
}
