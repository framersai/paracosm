/**
 * Three-column Quickstart result grid. Each card: actor name /
 * archetype / HEXACO bars / fingerprint / median deltas / Download +
 * Share + Fork-at-N + Swap controls.
 *
 * @module paracosm/dashboard/quickstart/QuickstartResults
 */
import { useState, useMemo } from 'react';
import { useBranchesContext } from '../branches/BranchesContext';
import { useDashboardNavigation } from '../../App';
import { useScenarioLabels } from '../../hooks/useScenarioLabels';
import {
  computeMedianDeltas,
  buildQuickstartShareUrl,
  downloadArtifactJson,
} from './QuickstartView.helpers';
import { formatDelta } from '../branches/BranchesTab.helpers';
import { ActorPresetPicker } from './ActorPresetPicker';
import type { RunArtifact } from '../../../../../engine/schema/index.js';
import type { ActorConfig } from '../../../../../engine/types.js';
import type { LeaderPreset } from '../../../../../engine/leader-presets.js';
import styles from './QuickstartResults.module.scss';

export interface QuickstartResultsProps {
  actors: ActorConfig[];
  artifacts: RunArtifact[];
  sessionId?: string;
  onSwap: (actorIndex: number, preset: LeaderPreset) => void;
}

const HEXACO_TRAITS: Array<keyof ActorConfig['hexaco']> = [
  'openness', 'conscientiousness', 'extraversion',
  'agreeableness', 'emotionality', 'honestyHumility',
];

export function QuickstartResults({ actors, artifacts, sessionId, onSwap }: QuickstartResultsProps) {
  const { dispatch } = useBranchesContext();
  const navigate = useDashboardNavigation();
  const labels = useScenarioLabels();
  const [swapTargetIndex, setSwapTargetIndex] = useState<number | null>(null);
  const [copiedForIndex, setCopiedForIndex] = useState<number | null>(null);

  const handleFork = (i: number) => {
    dispatch({ type: 'SET_PARENT', artifact: artifacts[i] });
    navigate('branches');
  };

  const handleShare = async (i: number) => {
    if (!sessionId) return;
    const url = buildQuickstartShareUrl(window.location.origin, sessionId);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedForIndex(i);
      setTimeout(() => setCopiedForIndex(null), 1500);
    } catch {
      // ignore clipboard errors (secure-context requirement etc.)
    }
  };

  const handleDownload = (i: number) => {
    const artifact = artifacts[i];
    const slug = actors[i].archetype.toLowerCase().replace(/\s+/g, '-');
    downloadArtifactJson(artifact, `paracosm-quickstart-${slug}.json`);
  };

  return (
    <div className={styles.results} role="region" aria-label="Quickstart results">
      <div className={styles.grid}>
        {actors.map((actor, i) => {
          const artifact = artifacts[i];
          // Defensive: skip cards whose artifact dropped out of the
          // trio (e.g., a mid-run error that cleared one actor's
          // result). Downstream helpers assume artifact is defined.
          if (!artifact) return null;
          return (
            <ActorResultCard
              key={i}
              actor={actor}
              artifact={artifact}
              peers={artifacts.filter((a, j) => j !== i && !!a)}
              timeLabel={labels.time}
              timeLabelCap={labels.Time}
              copiedHere={copiedForIndex === i}
              shareEnabled={!!sessionId}
              onDownload={() => handleDownload(i)}
              onShare={() => handleShare(i)}
              onFork={() => handleFork(i)}
              onRequestSwap={() => setSwapTargetIndex(i)}
            />
          );
        })}
      </div>
      {swapTargetIndex !== null && (
        <ActorPresetPicker
          onSelect={preset => {
            onSwap(swapTargetIndex, preset);
            setSwapTargetIndex(null);
          }}
          onClose={() => setSwapTargetIndex(null)}
        />
      )}
    </div>
  );
}

interface ActorResultCardProps {
  actor: ActorConfig;
  artifact: RunArtifact;
  peers: RunArtifact[];
  timeLabel: string;
  timeLabelCap: string;
  copiedHere: boolean;
  shareEnabled: boolean;
  onDownload: () => void;
  onShare: () => void;
  onFork: () => void;
  onRequestSwap: () => void;
}

function ActorResultCard({
  actor, artifact, peers, timeLabel, timeLabelCap,
  copiedHere, shareEnabled, onDownload, onShare, onFork, onRequestSwap,
}: ActorResultCardProps) {
  const deltas = useMemo(() => computeMedianDeltas(artifact, peers), [artifact, peers]);
  const turnsCompleted = artifact.trajectory?.timepoints?.length ?? 0;
  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <h4 className={styles.actorName}>{actor.name}</h4>
        <span className={styles.archetype}>{actor.archetype}</span>
        <button
          type="button"
          className={styles.swap}
          onClick={onRequestSwap}
          aria-label={`Swap ${actor.name}`}
        >
          Swap
        </button>
      </header>
      <div className={styles.hexaco}>
        {HEXACO_TRAITS.map(trait => (
          <div key={trait} className={styles.trait}>
            <span className={styles.traitLabel}>{trait.slice(0, 4).toUpperCase()}</span>
            <div className={styles.traitBarOuter}>
              <div
                className={styles.traitBarInner}
                style={{ width: `${Math.round(actor.hexaco[trait] * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className={styles.fingerprint}>
        <span>FP</span>
        <code>
          {artifact.fingerprint
            ? Object.values(artifact.fingerprint).slice(0, 3).join(' / ')
            : 'n/a'}
        </code>
      </div>
      {deltas.length > 0 && (
        <ul className={styles.deltas} aria-label="Delta vs peer median">
          {deltas.slice(0, 4).map(d => (
            <li
              key={`${d.bag}.${d.key}`}
              className={`${styles.delta} ${styles[`direction_${d.direction}`]}`}
            >
              {formatDelta(d)}
            </li>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        <button type="button" onClick={onDownload}>Download JSON</button>
        <button type="button" onClick={onShare} disabled={!shareEnabled}>
          {copiedHere ? 'Copied!' : 'Copy share link'}
        </button>
        <button
          type="button"
          onClick={onFork}
          disabled={turnsCompleted === 0}
          className={styles.forkButton}
          title={turnsCompleted === 0 ? 'No turns completed yet' : `Promote to fork root and open Branches tab. ${turnsCompleted} ${turnsCompleted === 1 ? timeLabel : `${timeLabel}s`} available.`}
        >
          Fork in Branches &rarr;
        </button>
      </div>
      <div className={styles.forkHint}>
        {turnsCompleted > 0
          ? `${turnsCompleted} ${timeLabelCap}${turnsCompleted === 1 ? '' : 's'} available for forking`
          : ''}
      </div>
    </article>
  );
}
