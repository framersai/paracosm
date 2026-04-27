import * as React from 'react';
import styles from './SmallMultiplesGrid.module.scss';
import { CompareCell } from './CompareCell.js';
import type { RunRecord } from '../../../../server/run-record.js';

export interface SmallMultiplesGridProps {
  members: RunRecord[];
  pinnedIds: string[];
  onTogglePin: (runId: string) => void;
  onOpenRun: (runId: string) => void;
}

export function SmallMultiplesGrid({
  members,
  pinnedIds,
  onTogglePin,
  onOpenRun,
}: SmallMultiplesGridProps): JSX.Element {
  return (
    <section className={styles.grid} aria-label="Bundle members grid">
      {members.map((m) => (
        <CompareCell
          key={m.runId}
          record={m}
          pinned={pinnedIds.includes(m.runId)}
          onTogglePin={() => onTogglePin(m.runId)}
          onOpen={() => onOpenRun(m.runId)}
        />
      ))}
    </section>
  );
}
