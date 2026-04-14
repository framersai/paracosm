import type { LeaderInfo } from '../../hooks/useGameState';
import type { Side } from '../../hooks/useGameState';
import { SparkLine } from '../shared/SparkLine';
import { Tooltip } from '../shared/Tooltip';

interface LeaderBarProps {
  side: Side;
  leader: LeaderInfo | null;
  popHistory: number[];
  moraleHistory: number[];
}

/** Render HEXACO bar: "O████░.95" */
function traitStr(label: string, val: number): string {
  const filled = Math.round(val * 4);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(4 - filled);
  const num = val.toFixed(2);
  return `${label}${bar}${num}`;
}

export function LeaderBar({ side, leader, popHistory, moraleHistory }: LeaderBarProps) {
  const sideColor = side === 'a' ? 'var(--vis)' : 'var(--eng)';
  const sideBg = side === 'a' ? 'rgba(232,180,74,.12)' : 'rgba(76,168,168,.12)';
  const sideBorder = side === 'a' ? 'var(--amber-dim)' : 'var(--teal-dim)';
  const name = leader?.name || (side === 'a' ? 'Leader A' : 'Leader B');
  const archetype = leader?.archetype || '';
  const colony = leader?.colony || '';
  const h = leader?.hexaco || {};
  const hasHexaco = Object.values(h).some(v => v > 0);

  // Build trait string for inline display
  const keys = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'emotionality', 'honestyHumility'];
  const labels = ['O', 'C', 'E', 'A', 'Em', 'HH'];
  const traitLine = hasHexaco
    ? labels.map((l, i) => traitStr(l, h[keys[i]] ?? 0)).join(' ')
    : '';

  return (
    <div style={{ flex: 1, padding: '4px 12px', background: 'var(--bg-panel)', minWidth: 0, overflow: 'hidden' }}>
      {/* Row 1 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {archetype && (
          <span style={{
            fontSize: '9px', padding: '2px 8px', borderRadius: '3px', fontWeight: 800,
            fontFamily: 'var(--mono)', color: sideColor, background: sideBg,
            border: `1px solid ${sideBorder}`, flexShrink: 0, letterSpacing: '0.5px',
          }}>
            {archetype.toUpperCase().replace(/^THE\s+/i, '')}
          </span>
        )}
        <Tooltip dot content={
          <div>
            <b style={{ color: sideColor, fontSize: '14px', display: 'block', marginBottom: '6px' }}>{archetype ? `${archetype}: ` : ''}{name}</b>
            {colony && <div>Colony: {colony}</div>}
            {leader?.instructions && <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '6px', fontStyle: 'italic' }}>{leader.instructions}</div>}
            {hasHexaco && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', marginTop: '8px', lineHeight: 1.8 }}>
                {keys.map((trait, i) => (
                  <div key={trait} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-2)' }}>{trait.charAt(0).toUpperCase() + trait.slice(1)}</span>
                    <span style={{ color: sideColor }}>{(h[trait] ?? 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        }>
          <span style={{ fontSize: '14px', fontWeight: 800, color: sideColor, whiteSpace: 'nowrap' }}>{name}</span>
        </Tooltip>
        {colony && (
          <span style={{ fontSize: '10px', color: 'var(--text-3)', whiteSpace: 'nowrap', marginLeft: '6px', paddingLeft: '6px', borderLeft: '1px solid var(--border)' }}>
            {colony}
          </span>
        )}
        {traitLine && (
          <span className="leader-traits" style={{ display: 'contents' }}>
            <span style={{ color: 'var(--border)', margin: '0 2px' }}>|</span>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: '9px', color: sideColor,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              letterSpacing: 0, opacity: 0.9,
            }}>
              {traitLine}
            </span>
          </span>
        )}
      </div>
      {/* Row 2 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
        <span style={{ fontStyle: 'italic', fontSize: '11px', color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(() => {
            if (leader?.quote) return `"${leader.quote}"`;
            if (!leader?.instructions) return '';
            // Strip "You are [Name], ..." prefix to show just the bio
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
