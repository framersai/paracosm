/**
 * Side-by-side leaders row generalised to N actors. The 2-actor surface
 * renders an inline `<div>` with two `<ActorBar>` siblings; for N>=3
 * we render a horizontally-scrolling track of compact ActorBars so the
 * SIM tab still surfaces every actor's live morale, current event, and
 * pending-decision pill at a glance.
 *
 * @module paracosm/dashboard/sim/MultiActorLeadersRow
 */
import * as React from 'react';
import { ActorBar } from '../layout/ActorBar.js';
import type { GameState } from '../../hooks/useGameState.js';
import styles from './MultiActorLeadersRow.module.scss';

void React;

const CELL_MIN_WIDTH_PX = 320;

/** Mirrors ActorBar's inline `verdictPlacement` prop type. The 2-actor
 *  surface uses 'winner' | 'second' | 'tie'; N>=3 callers typically
 *  pass `null` since no multi-way verdict ribbon exists yet. */
type VerdictPlacement = 'winner' | 'second' | 'tie' | null | undefined;

interface MultiActorLeadersRowProps {
  state: GameState;
  /** Optional verdict-chip placement function. Returns the placement
   *  for the slot at `actorIndex` (winner / tie / second / null). The
   *  2-actor surface threads this through a presetLeaderA / B fallback
   *  pattern; for N>=3 we don't yet have a multi-way verdict UI, so
   *  callers can omit this prop and every slot renders without a chip. */
  verdictPlacementFor?: (actorIndex: number) => VerdictPlacement;
}

export function MultiActorLeadersRow({ state, verdictPlacementFor }: MultiActorLeadersRowProps) {
  const trackStyle = {
    ['--cell-min-width' as string]: `${CELL_MIN_WIDTH_PX}px`,
    ['--cell-count' as string]: String(state.actorIds.length),
  } as React.CSSProperties;

  return (
    <div className={`leaders-row ${styles.row}`} style={trackStyle}>
      <div className={styles.track}>
        {state.actorIds.map((id, idx) => {
          const actor = state.actors[id];
          return (
            <div key={id} className={styles.cell}>
              <ActorBar
                actorIndex={idx}
                leader={actor?.leader ?? null}
                popHistory={actor?.popHistory ?? []}
                moraleHistory={actor?.moraleHistory ?? []}
                verdictPlacement={verdictPlacementFor?.(idx) ?? null}
                event={actor?.event}
                statuses={actor?.statuses}
                pendingDecision={actor?.pendingDecision}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
