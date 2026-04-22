import type { LeaderInfo } from '../../hooks/useGameState';
import { getLeaderColorVar } from '../../hooks/useGameState';
import { SparkLine } from '../shared/SparkLine';
import { Tooltip } from '../shared/Tooltip';

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

  return (
    <div style={{ flex: 1, padding: '4px 12px', background: 'var(--bg-panel)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        {archetype && (
          <span style={{
            fontSize: '9px', padding: '2px 8px', borderRadius: '3px', fontWeight: 800,
            fontFamily: 'var(--mono)', color: sideColor, background: sideBg,
            border: `1px solid ${sideBorder}`, flexShrink: 0, letterSpacing: '0.5px',
          }}>
            {archetype.toUpperCase().replace(/^THE\s+/i, '')}
          </span>
        )}
        {verdictPlacement && (
          <span
            title={verdictPlacement === 'winner' ? 'Verdict: this leader won' : verdictPlacement === 'tie' ? 'Verdict: tie' : 'Verdict: runner-up'}
            style={{
              fontSize: '9px', padding: '2px 8px', borderRadius: '3px', fontWeight: 800,
              fontFamily: 'var(--mono)', letterSpacing: '0.5px', flexShrink: 0,
              color: verdictPlacement === 'winner' ? 'var(--green)' : verdictPlacement === 'tie' ? 'var(--amber)' : 'var(--text-3)',
              background: verdictPlacement === 'winner'
                ? 'rgba(106,173,72,0.14)'
                : verdictPlacement === 'tie'
                ? 'rgba(232,180,74,0.12)'
                : 'var(--bg-card)',
              border: `1px solid ${
                verdictPlacement === 'winner' ? 'rgba(106,173,72,0.4)'
                  : verdictPlacement === 'tie' ? 'var(--amber-dim)'
                  : 'var(--border)'
              }`,
            }}
          >
            {verdictPlacement === 'winner' ? '★ WINNER' : verdictPlacement === 'tie' ? '= TIE' : '2ND'}
          </span>
        )}
        <Tooltip dot content={
          <div>
            <b style={{ color: sideColor, fontSize: '14px', display: 'block', marginBottom: '6px' }}>{archetype ? `${archetype}: ` : ''}{name}</b>
            {unit && <div>Unit: {unit}</div>}
            {leader?.instructions && <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '6px', fontStyle: 'italic' }}>{leader.instructions}</div>}
            {hasHexaco && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', marginTop: '8px', lineHeight: 1.8 }}>
                {keys.map((trait, i) => (
                  <div key={trait} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-2)' }}>{trait.charAt(0).toUpperCase() + trait.slice(1).replace(/([A-Z])/g, ' $1')}</span>
                    <span style={{ color: sideColor }}>{(h[trait] ?? 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        }>
          <span style={{ fontSize: '14px', fontWeight: 800, color: sideColor, whiteSpace: 'nowrap' }}>{name}</span>
        </Tooltip>
        {unit && (
          <span style={{ fontSize: '10px', color: 'var(--text-3)', whiteSpace: 'nowrap', marginLeft: '6px', paddingLeft: '6px', borderLeft: '1px solid var(--border)' }}>
            {unit}
          </span>
        )}
        {traitLine && (
          <span className="leader-traits" style={{ display: 'contents' }}>
            <span style={{ color: 'var(--border)', margin: '0 2px' }}>|</span>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: '9px', color: sideColor,
              letterSpacing: 0, opacity: 0.9,
              minWidth: 0,
            }}>
              {traitLine}
            </span>
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
        <span style={{ fontStyle: 'italic', fontSize: '11px', color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
        <span className="leader-sparklines" style={{ fontFamily: 'var(--mono)', fontSize: '10px', whiteSpace: 'nowrap', flexShrink: 0 }}>
          <SparkLine data={popHistory} label="POP" color={sideColor} />
          {'  '}
          <SparkLine data={moraleHistory} label="MORALE" suffix="%" color="var(--amber)" />
        </span>
      </div>
    </div>
  );
}
