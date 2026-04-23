import type { LeaderInfo } from '../../hooks/useGameState';
import { getLeaderColorVar } from '../../hooks/useGameState';
import { SparkLine } from '../shared/SparkLine';
import { Tooltip } from '../shared/Tooltip';
import styles from './LeaderBar.module.scss';

interface LeaderBarProps {
  /** Position in the leader lineup. 0 renders the primary palette, 1 the
   *  secondary. F2/F3 extends beyond 2 via the central color helper. */
  leaderIndex: number;
  leader: LeaderInfo | null;
  popHistory: number[];
  moraleHistory: number[];
  /**
   * When the sim has produced a verdict, indicate how this leader
   * placed so the header can carry a victory / second / tie chip
   * next to the archetype tag. Undefined while the run is still
   * in flight or before verdict generation finished.
   */
  verdictPlacement?: 'winner' | 'second' | 'tie' | null;
}

/** Render HEXACO bar: "O ████░ .95" */
function traitStr(label: string, val: number): string {
  const filled = Math.round(val * 4);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(4 - filled);
  const num = val.toFixed(2);
  return `${label} ${bar} ${num}`;
}

export function LeaderBar({ leaderIndex, leader, popHistory, moraleHistory, verdictPlacement }: LeaderBarProps) {
  const sideColor = getLeaderColorVar(leaderIndex);
  const sideBg = leaderIndex === 0 ? 'rgba(232,180,74,.12)' : 'rgba(76,168,168,.12)';
  const sideBorder = leaderIndex === 0 ? 'var(--amber-dim)' : 'var(--teal-dim)';
  const fallbackLabel = `Leader ${String.fromCharCode(65 + leaderIndex)}`;
  const name = leader?.name || fallbackLabel;
  const archetype = leader?.archetype || '';
  const unit = leader?.unit || '';
  const h = leader?.hexaco || {};
  const hasHexaco = Object.values(h).some(v => v > 0);

  const keys = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'emotionality', 'honestyHumility'];
  const labels = ['O', 'C', 'E', 'A', 'Em', 'HH'];
  const traitLine = hasHexaco
    ? labels.map((l, i) => traitStr(l, h[keys[i]] ?? 0)).join(' ')
    : '';

  const verdictClass = verdictPlacement
    ? `${styles.verdictChip} ${styles[verdictPlacement] ?? ''}`.trim()
    : '';

  return (
    <div
      className={styles.root}
      style={{
        ['--leader-color' as string]: sideColor,
        ['--leader-bg' as string]: sideBg,
        ['--leader-border' as string]: sideBorder,
      }}
    >
      <div className={styles.headerRow}>
        {archetype && (
          <span className={styles.archetypeChip}>
            {archetype.toUpperCase().replace(/^THE\s+/i, '')}
          </span>
        )}
        {verdictPlacement && (
          <span
            title={verdictPlacement === 'winner' ? 'Verdict: this leader won' : verdictPlacement === 'tie' ? 'Verdict: tie' : 'Verdict: runner-up'}
            className={verdictClass}
          >
            {verdictPlacement === 'winner' ? '★ WINNER' : verdictPlacement === 'tie' ? '= TIE' : '2ND'}
          </span>
        )}
        <Tooltip dot content={
          <div>
            <b className={styles.tooltipHeading}>
              {archetype ? `${archetype}: ` : ''}{name}
            </b>
            {unit && <div>Unit: {unit}</div>}
            {leader?.instructions && (
              <div className={styles.tooltipInstructions}>{leader.instructions}</div>
            )}
            {hasHexaco && (
              <div className={styles.tooltipTraitBlock}>
                {keys.map((trait) => (
                  <div key={trait} className={styles.tooltipTraitRow}>
                    <span className={styles.tooltipTraitLabel}>
                      {trait.charAt(0).toUpperCase() + trait.slice(1).replace(/([A-Z])/g, ' $1')}
                    </span>
                    <span className={styles.tooltipTraitValue}>
                      {(h[trait] ?? 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        }>
          <span className={styles.name}>{name}</span>
        </Tooltip>
        {unit && <span className={styles.unitTag}>{unit}</span>}
        {traitLine && (
          <span className={`leader-traits ${styles.traits}`}>
            <span className={styles.traitsSep}>|</span>
            <span className={styles.traitsLine}>{traitLine}</span>
          </span>
        )}
      </div>
      <div className={styles.subRow}>
        <span className={styles.quote}>
          {(() => {
            if (leader?.quote) return `"${leader.quote}"`;
            if (!leader?.instructions) return '';
            const bio = leader.instructions
              .replace(/^You are [^.]+\.\s*/i, '')
              .replace(/^"[^"]+"\.\s*/i, '')
              .replace(/Your HEXACO profile drives your leadership.*$/i, '')
              .trim();
            return bio ? `"${bio.slice(0, 80)}${bio.length > 80 ? '...' : ''}"` : '';
          })()}
        </span>
        <span className={`leader-sparklines ${styles.sparklines}`}>
          <SparkLine data={popHistory} label="POP" color={sideColor} />
          {'  '}
          <SparkLine data={moraleHistory} label="MORALE" suffix="%" color="var(--amber)" />
        </span>
      </div>
    </div>
  );
}
