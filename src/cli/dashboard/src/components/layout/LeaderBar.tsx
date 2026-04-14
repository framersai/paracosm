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

function hexacoBar(val: number) {
  const filled = Math.round(val * 5);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(5 - filled);
}

export function LeaderBar({ side, leader, popHistory, moraleHistory }: LeaderBarProps) {
  const sideColor = side === 'a' ? 'var(--vis)' : 'var(--eng)';
  const sideBg = side === 'a' ? 'rgba(232,180,74,.08)' : 'rgba(76,168,168,.08)';
  const name = leader?.name || (side === 'a' ? 'Leader A' : 'Leader B');
  const archetype = leader?.archetype || '';
  const colony = leader?.colony || '';
  const h = leader?.hexaco || {};
  const sideClass = side === 'a' ? 'v' : 'e';

  return (
    <div style={{ flex: 1, padding: '4px 12px', background: 'var(--bg-panel)', overflow: 'hidden' }}>
      {/* Single row: Badge, Name, Colony, HEXACO, Sparklines */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
        {archetype && (
          <span style={{
            fontSize: '9px', padding: '2px 8px', borderRadius: '3px', fontWeight: 800,
            fontFamily: 'var(--mono)', color: sideColor, background: sideBg,
            border: `1px solid ${side === 'a' ? 'var(--amber-dim)' : 'var(--teal-dim)'}`,
            flexShrink: 0,
          }}>
            {archetype.toUpperCase().replace(/^THE\s+/i, '')}
          </span>
        )}
        <Tooltip dot content={
          <div>
            <b style={{ color: sideColor, fontSize: '14px', display: 'block', marginBottom: '6px' }}>
              {archetype ? `${archetype}: ` : ''}{name}
            </b>
            {colony && <div style={{ marginBottom: '6px' }}>Colony: {colony}</div>}
            {leader?.instructions && <div style={{ fontSize: '11px', color: 'var(--text-2)', marginBottom: '8px', fontStyle: 'italic' }}>{leader.instructions}</div>}
            {leader?.hexaco && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', lineHeight: 1.6 }}>
                {(['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'emotionality', 'honestyHumility'] as const).map(trait => {
                  const val = h[trait] ?? 0;
                  return (
                    <div key={trait} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-2)' }}>{trait.charAt(0).toUpperCase() + trait.slice(1)}</span>
                      <span style={{ color: sideColor }}>{val.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {leader?.quote && <div style={{ fontStyle: 'italic', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>{leader.quote}</div>}
          </div>
        }>
          <span style={{ fontSize: '14px', fontWeight: 800, color: sideColor, whiteSpace: 'nowrap', flexShrink: 0 }}>{name}</span>
        </Tooltip>
        {colony && (
          <span style={{ fontSize: '10px', color: 'var(--text-3)', borderLeft: '1px solid var(--border)', paddingLeft: '6px', marginLeft: '6px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {colony}
          </span>
        )}
        <span style={{ color: 'var(--border)', margin: '0 4px' }}>|</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {(['O', 'C', 'E', 'A', 'Em', 'HH'] as const).map((trait, i) => {
            const keys = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'emotionality', 'honestyHumility'];
            const val = h[keys[i]] ?? 0;
            return (
              <span key={trait}>
                <span style={{ color: sideColor, marginLeft: i > 0 ? '5px' : 0 }}>{trait}</span>
                <span style={{ color: sideColor, opacity: 0.5 }}>{hexacoBar(val)}</span>
                <span style={{ color: sideColor }}>.{(val * 100).toFixed(0).padStart(2, '0')}</span>
              </span>
            );
          })}
        </span>
        {/* Sparklines */}
        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 'auto' }}>
          <SparkLine data={popHistory} label="POP" color={sideColor} />
          {'  '}
          <SparkLine data={moraleHistory} label="MORALE" suffix="%" color="var(--amber)" />
        </span>
      </div>
    </div>
  );
}
