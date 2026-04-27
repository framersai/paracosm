import * as React from 'react';
import styles from './CompareCell.module.scss';
import type { RunRecord } from '../../../../server/run-record.js';

export interface CompareCellProps {
  record: RunRecord;
  pinned: boolean;
  onTogglePin: () => void;
  onOpen: () => void;
}

export function CompareCell({ record, pinned, onTogglePin, onOpen }: CompareCellProps): JSX.Element {
  return (
    <article className={[styles.cell, pinned ? styles.pinned : ''].filter(Boolean).join(' ')}>
      <header className={styles.head}>
        <div className={styles.titles}>
          <h4 className={styles.name}>{record.leaderName ?? 'Unknown'}</h4>
          {record.leaderArchetype && <p className={styles.archetype}>{record.leaderArchetype}</p>}
        </div>
        <label className={styles.pinLabel} title={pinned ? 'Unpin' : 'Pin to compare side-by-side'}>
          <input
            type="checkbox"
            checked={pinned}
            onChange={onTogglePin}
            aria-label={pinned ? `Unpin ${record.leaderName ?? 'actor'}` : `Pin ${record.leaderName ?? 'actor'} to compare`}
          />
          <span aria-hidden="true">{pinned ? '★' : '☆'}</span>
        </label>
      </header>
      <Sparkline values={record.summaryTrajectory ?? []} />
      <footer className={styles.foot}>
        <span className={styles.cost}>{record.costUSD ? `$${record.costUSD.toFixed(2)}` : '—'}</span>
        <span className={styles.duration}>{record.durationMs ? `${Math.round(record.durationMs / 1000)}s` : '—'}</span>
        <button onClick={onOpen} className={styles.openBtn} aria-label={`Open ${record.leaderName ?? 'run'} details`}>Open</button>
      </footer>
    </article>
  );
}

function Sparkline({ values }: { values: number[] }): JSX.Element {
  if (values.length < 2) return <div className={styles.sparklineEmpty}>—</div>;
  const W = 220;
  const H = 36;
  const pad = 2;
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = Math.max(1e-6, maxV - minV);
  const points = values
    .map((v, i) => `${pad + (i / (values.length - 1)) * (W - pad * 2)},${pad + (H - pad * 2) * (1 - (v - minV) / range)}`)
    .join(' ');
  return (
    <svg className={styles.sparkline} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Run trajectory sparkline">
      <polyline points={points} fill="none" stroke="var(--amber)" strokeWidth={1.5} />
    </svg>
  );
}
