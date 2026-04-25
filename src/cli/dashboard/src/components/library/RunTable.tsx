import * as React from 'react';
import styles from './RunTable.module.scss';
import type { RunRecord } from '../../../../server/run-record.js';

export interface RunTableProps {
  runs: RunRecord[];
  onOpen: (runId: string) => void;
  onReplay: (runId: string) => void;
}

export function RunTable(props: RunTableProps): JSX.Element {
  const { runs, onOpen, onReplay } = props;
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Scenario</th>
          <th>Mode</th>
          <th>Leader</th>
          <th>Cost</th>
          <th>Time</th>
          <th>Started</th>
          <th aria-label="Actions"></th>
        </tr>
      </thead>
      <tbody>
        {runs.map(r => (
          <tr
            key={r.runId}
            onClick={() => onOpen(r.runId)}
            tabIndex={0}
            data-run-card
            data-run-id={r.runId}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(r.runId);
              }
            }}
          >
            <td>{r.scenarioId}</td>
            <td><span data-mode={r.mode ?? 'unknown'} className={styles.modeCell}>{r.mode ?? '-'}</span></td>
            <td>{r.leaderName ?? '-'}</td>
            <td>{r.costUSD != null ? `$${r.costUSD.toFixed(2)}` : '-'}</td>
            <td>{r.durationMs != null ? `${(r.durationMs / 1000).toFixed(0)}s` : '-'}</td>
            <td>{r.createdAt.slice(0, 19).replace('T', ' ')}</td>
            <td className={styles.actionsCell}>
              <button onClick={(e) => { e.stopPropagation(); onOpen(r.runId); }}>Open</button>
              <button onClick={(e) => { e.stopPropagation(); onReplay(r.runId); }} aria-label="Replay">Replay</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
