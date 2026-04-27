import * as React from 'react';
import styles from './PinnedDiffPanel.module.scss';
import { useBundleArtifacts } from './hooks/useBundleArtifacts.js';
import { TimelineDiff } from './diff/TimelineDiff.js';
import { FingerprintDiff } from './diff/FingerprintDiff.js';
import { DecisionRationaleDiff } from './diff/DecisionRationaleDiff.js';
import { MetricTrajectoryDiff } from './diff/MetricTrajectoryDiff.js';
import type { RunRecord } from '../../../../server/run-record.js';

export interface PinnedDiffPanelProps {
  pinnedIds: string[];
  members: RunRecord[];
}

export function PinnedDiffPanel({ pinnedIds, members }: PinnedDiffPanelProps): JSX.Element {
  const { artifacts, loading, errors } = useBundleArtifacts(pinnedIds);

  if (pinnedIds.length === 0) {
    return (
      <section className={styles.empty} aria-label="Pinned diff">
        <p>Pin 2-3 cells above with the ☆ toggle to compare them side-by-side.</p>
      </section>
    );
  }

  const recordsById: Record<string, RunRecord> = Object.fromEntries(members.map((m) => [m.runId, m]));
  const pinnedRecords = pinnedIds.map((id) => recordsById[id]).filter(Boolean);
  const pinnedArtifacts = pinnedIds
    .map((id) => artifacts[id])
    .filter((a): a is NonNullable<typeof a> => !!a);

  const headStyle = { gridTemplateColumns: `repeat(${pinnedRecords.length}, 1fr)` } as React.CSSProperties;

  return (
    <section className={styles.panel} aria-label="Pinned runs side-by-side">
      <header className={styles.head} style={headStyle}>
        {pinnedRecords.map((r) => (
          <div key={r.runId} className={styles.column}>
            <h4>{r.leaderName ?? 'Unknown'}</h4>
            {r.leaderArchetype && <span className={styles.archetype}>{r.leaderArchetype}</span>}
            <div className={styles.statusRow}>
              {loading[r.runId] && <span className={styles.loading}>loading…</span>}
              {errors[r.runId] && <span className={styles.error}>{errors[r.runId]}</span>}
            </div>
          </div>
        ))}
      </header>
      {pinnedArtifacts.length > 0 && (
        <>
          <FingerprintDiff artifacts={pinnedArtifacts} />
          <TimelineDiff artifacts={pinnedArtifacts} />
          <DecisionRationaleDiff artifacts={pinnedArtifacts} />
          <MetricTrajectoryDiff artifacts={pinnedArtifacts} />
        </>
      )}
    </section>
  );
}
