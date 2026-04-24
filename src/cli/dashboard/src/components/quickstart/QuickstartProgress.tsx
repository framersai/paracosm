/**
 * Four-stage progress indicator for the Quickstart run.
 *
 * Stages:
 * 1. Compile scenario (LLM call for the draft)
 * 2. Ground with research citations (seed-ingestion stage)
 * 3. Generate 3 leaders (LLM call)
 * 4. Run 3 simulations in parallel (SSE-driven; per-leader turn counters)
 *
 * @module paracosm/dashboard/quickstart/QuickstartProgress
 */
import styles from './QuickstartProgress.module.scss';

export type Stage = 'compile' | 'research' | 'leaders' | 'running' | 'done';
export type StageStatus = 'pending' | 'active' | 'done';

export interface LeaderProgress {
  name: string;
  archetype: string;
  currentTurn: number;
  maxTurns: number;
  status: 'running' | 'complete' | 'error' | 'aborted';
}

export interface QuickstartProgressProps {
  stage: Stage;
  leaders?: LeaderProgress[];
  onCancel?: () => void;
}

const STAGES: Array<{ id: Stage; label: string }> = [
  { id: 'compile', label: 'Compile scenario' },
  { id: 'research', label: 'Ground with citations' },
  { id: 'leaders', label: 'Generate 3 leaders' },
  { id: 'running', label: 'Run 3 simulations' },
];

function statusFor(current: Stage, stage: Stage): StageStatus {
  const order: Stage[] = ['compile', 'research', 'leaders', 'running', 'done'];
  const currentIdx = order.indexOf(current);
  const stageIdx = order.indexOf(stage);
  if (currentIdx > stageIdx) return 'done';
  if (currentIdx === stageIdx) return 'active';
  return 'pending';
}

export function QuickstartProgress({ stage, leaders, onCancel }: QuickstartProgressProps) {
  return (
    <div className={styles.progress} role="region" aria-label="Quickstart progress">
      <ol className={styles.stageList}>
        {STAGES.map(s => {
          const status = statusFor(stage, s.id);
          return (
            <li key={s.id} className={`${styles.stage} ${styles[`status_${status}`]}`}>
              <span className={styles.marker} aria-hidden>
                {status === 'done' ? '✓' : status === 'active' ? '●' : '○'}
              </span>
              <span className={styles.label}>{s.label}</span>
            </li>
          );
        })}
      </ol>

      {stage === 'running' && leaders && (
        <div className={styles.leaders}>
          {leaders.map((l, i) => (
            <div key={i} className={styles.leader}>
              <span className={styles.leaderName}>{l.name}</span>
              <span className={styles.leaderArchetype}>{l.archetype}</span>
              <span className={`${styles.leaderStatus} ${styles[`leader_${l.status}`]}`}>
                {l.status === 'running' ? `Turn ${l.currentTurn} / ${l.maxTurns}` : l.status.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}

      {onCancel && stage !== 'done' && (
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel run
        </button>
      )}
    </div>
  );
}
