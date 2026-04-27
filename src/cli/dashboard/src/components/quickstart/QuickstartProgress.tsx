/**
 * Four-stage progress indicator for the Quickstart run.
 *
 * Stages:
 * 1. Compile scenario (LLM call for the draft)
 * 2. Ground with research citations (seed-ingestion stage)
 * 3. Generate 3 actors (LLM call)
 * 4. Run 3 simulations in parallel (SSE-driven; per-actor turn counters)
 *
 * @module paracosm/dashboard/quickstart/QuickstartProgress
 */
import styles from './QuickstartProgress.module.scss';

export type Stage = 'compile' | 'research' | 'actors' | 'running' | 'done';
export type StageStatus = 'pending' | 'active' | 'done';

export interface ActorProgress {
  name: string;
  archetype: string;
  currentTurn: number;
  maxTurns: number;
  status: 'running' | 'complete' | 'error' | 'aborted';
}

export interface QuickstartProgressProps {
  stage: Stage;
  actors?: ActorProgress[];
  onCancel?: () => void;
}

const STAGES: Array<{ id: Stage; label: string }> = [
  { id: 'compile', label: 'Compile scenario' },
  { id: 'research', label: 'Ground with citations' },
  { id: 'actors', label: 'Generate 3 actors' },
  { id: 'running', label: 'Run 3 simulations' },
];

function statusFor(current: Stage, stage: Stage): StageStatus {
  const order: Stage[] = ['compile', 'research', 'actors', 'running', 'done'];
  const currentIdx = order.indexOf(current);
  const stageIdx = order.indexOf(stage);
  if (currentIdx > stageIdx) return 'done';
  if (currentIdx === stageIdx) return 'active';
  return 'pending';
}

export function QuickstartProgress({ stage, actors, onCancel }: QuickstartProgressProps) {
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

      {stage === 'running' && actors && (
        <div className={styles.actors}>
          {actors.map((a, i) => (
            <div key={i} className={styles.actor}>
              <span className={styles.actorName}>{a.name}</span>
              <span className={styles.actorArchetype}>{a.archetype}</span>
              <span className={`${styles.actorStatus} ${styles[`actor_${a.status}`]}`}>
                {a.status === 'running' ? `Turn ${a.currentTurn} / ${a.maxTurns}` : a.status.toUpperCase()}
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
