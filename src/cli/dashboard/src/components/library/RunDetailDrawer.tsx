import * as React from 'react';
import styles from './RunDetailDrawer.module.scss';
import { useRunArtifact } from './hooks/useRunArtifact.js';
import { ReplayPanel } from './ReplayPanel.js';
import { BatchArtifactView } from '../reports/BatchArtifactView.js';
import { ReportViewAdapter } from '../reports/ReportViewAdapter.js';
import type { MetricSpec } from '../viz/kit/index.js';
import type { RunRecord } from '../../../../server/run-record.js';

export interface RunDetailDrawerProps {
  runId: string | null;
  open: boolean;
  onClose: () => void;
  onArtifactLoaded?: (record: RunRecord) => void;
}

export function RunDetailDrawer(props: RunDetailDrawerProps): JSX.Element {
  const { runId, open, onClose, onArtifactLoaded } = props;
  const { record, artifact, loading, error, status } = useRunArtifact(open ? runId : null);
  const drawerRef = React.useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (record) onArtifactLoaded?.(record);
  }, [record, onArtifactLoaded]);

  React.useEffect(() => {
    if (open) {
      lastFocusedRef.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => {
        const target = drawerRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        target?.focus();
      });
    } else {
      lastFocusedRef.current?.focus();
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Build a minimal MetricSpec map from the artifact's first timepoint.
  // v1 default: range [0, 1] for every metric. v2 derives ranges +
  // thresholds from the scenario contract.
  const metricSpecs: Record<string, MetricSpec> = React.useMemo(() => {
    if (!artifact) return {};
    const out: Record<string, MetricSpec> = {};
    const firstTp = artifact.trajectory?.timepoints?.[0] as { worldSnapshot?: { metrics?: Record<string, number> } } | undefined;
    const sample = firstTp?.worldSnapshot?.metrics ?? {};
    for (const id of Object.keys(sample)) {
      out[id] = { id, label: id, range: [0, 1] };
    }
    return out;
  }, [artifact]);

  return (
    <>
      {open && <div className={styles.backdrop} onClick={onClose} role="presentation" />}
      <aside
        ref={drawerRef}
        className={[styles.drawer, open ? styles.open : ''].filter(Boolean).join(' ')}
        role="dialog"
        aria-label="Run detail"
        aria-modal={open ? 'true' : 'false'}
        aria-hidden={!open}
      >
        <header className={styles.head}>
          <button onClick={onClose} className={styles.closeBtn} aria-label="Close detail">×</button>
          {artifact && <ReplayPanel artifact={artifact} />}
        </header>

        <section className={styles.body}>
          {loading && <p className={styles.placeholder}>Loading…</p>}
          {error && status !== 'ok' && (
            <div className={styles.error}>
              <strong>{
                status === 'not_found' ? 'Run not found' :
                status === 'unavailable' ? 'Artifact path not preserved' :
                status === 'unreadable' ? 'Artifact file unreadable' :
                'Error'
              }</strong>
              <p>{error}</p>
            </div>
          )}
          {artifact && record && (
            <>
              <section className={styles.summary}>
                <span className={styles.modeBadge} data-mode={artifact.metadata.mode}>{artifact.metadata.mode}</span>
                <h2>{artifact.metadata.scenario.name}</h2>
                <p>
                  {record.leaderName ?? 'Unknown'}
                  {record.leaderArchetype ? ` · ${record.leaderArchetype}` : ''}
                </p>
                <p className={styles.meta}>
                  {(artifact.trajectory?.timepoints?.length ?? 0)} timepoints · {record.costUSD != null ? `$${record.costUSD.toFixed(2)}` : '-'} · {record.createdAt.slice(0, 19).replace('T', ' ')}
                </p>
              </section>

              <section className={styles.detailBody}>
                {artifact.metadata.mode === 'turn-loop'
                  ? <ReportViewAdapter artifact={artifact} />
                  : <BatchArtifactView artifact={artifact} metricSpecs={metricSpecs} />}
              </section>
            </>
          )}
        </section>
      </aside>
    </>
  );
}
