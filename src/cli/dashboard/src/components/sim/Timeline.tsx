import type { GameState } from '../../hooks/useGameState';

interface TimelineProps {
  state: GameState;
}

interface TurnEntry {
  turn: number;
  year: number;
  title: string;
  summary?: string;
  outcome?: string;
  current?: boolean;
}

function extractTurns(state: GameState, side: 'a' | 'b'): TurnEntry[] {
  const turns: TurnEntry[] = [];
  const s = state[side];
  for (const evt of s.events) {
    if (evt.type === 'turn_start' && evt.data.title && evt.data.title !== 'Director generating...') {
      turns.push({
        turn: evt.data.turn as number,
        year: evt.data.year as number,
        title: evt.data.title as string,
        summary: (evt.data.turnSummary as string) || (evt.data.crisis as string)?.slice(0, 120) || '',
      });
    }
    if (evt.type === 'outcome') {
      const t = turns.find(t => t.turn === evt.data.turn);
      if (t) t.outcome = evt.data.outcome as string;
    }
  }
  // Mark the latest turn as current
  if (turns.length) turns[turns.length - 1].current = !state.isComplete;
  return turns;
}

function outcomeBadge(outcome?: string) {
  if (!outcome) return null;
  const isSuccess = outcome.includes('success');
  const isRisky = outcome.includes('risky');
  const label = isRisky ? (isSuccess ? 'RS' : 'RF') : (isSuccess ? 'CS' : 'CF');
  const color = isSuccess ? 'var(--green)' : 'var(--rust)';
  return (
    <span style={{ fontSize: '9px', fontWeight: 800, fontFamily: 'var(--mono)', padding: '1px 4px', borderRadius: '2px', background: `${isSuccess ? 'rgba(106,173,72,.15)' : 'rgba(224,101,48,.15)'}`, color, border: `1px solid ${color}` }}>
      {label}
    </span>
  );
}

export function Timeline({ state }: TimelineProps) {
  const turnsA = extractTurns(state, 'a');
  const turnsB = extractTurns(state, 'b');

  if (!turnsA.length && !turnsB.length) return null;

  return (
    <div className="timeline-row" role="region" aria-label="Turn timeline" style={{
      borderTop: '1px solid var(--border)', background: 'var(--bg-panel)',
      display: 'flex', gap: '1px', maxHeight: '120px', overflow: 'hidden', flexShrink: 0,
    }}>
      {/* Side A */}
      <div style={{ flex: 1, background: 'var(--bg-panel)', padding: '3px 8px', overflowY: 'auto' }}>
        <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '3px', marginBottom: '3px', display: 'inline-block', fontFamily: 'var(--mono)', color: 'var(--vis)', background: 'rgba(232,180,74,.08)' }}>
          {state.a.leader?.name || 'A'}
        </span>
        {turnsA.map(t => (
          <div key={t.turn} style={{
            padding: '3px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: '12px', marginBottom: '3px',
            animation: t.current ? 'glow 2s infinite' : undefined,
          }}>
            <span style={{ fontWeight: 800, minWidth: '30px', fontFamily: 'var(--mono)', color: 'var(--vis)' }}>
              {t.year}
            </span>
            <span style={{ flex: 1, margin: '0 6px', color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.title}{t.summary ? `: ${t.summary}` : ''}
            </span>
            {outcomeBadge(t.outcome)}
          </div>
        ))}
      </div>
      {/* Side B */}
      <div style={{ flex: 1, background: 'var(--bg-panel)', padding: '3px 8px', overflowY: 'auto' }}>
        <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '3px', marginBottom: '3px', display: 'inline-block', fontFamily: 'var(--mono)', color: 'var(--eng)', background: 'rgba(76,168,168,.08)' }}>
          {state.b.leader?.name || 'B'}
        </span>
        {turnsB.map(t => (
          <div key={t.turn} style={{
            padding: '3px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: '12px', marginBottom: '3px',
            animation: t.current ? 'glow 2s infinite' : undefined,
          }}>
            <span style={{ fontWeight: 800, minWidth: '30px', fontFamily: 'var(--mono)', color: 'var(--eng)' }}>
              {t.year}
            </span>
            <span style={{ flex: 1, margin: '0 6px', color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.title}{t.summary ? `: ${t.summary}` : ''}
            </span>
            {outcomeBadge(t.outcome)}
          </div>
        ))}
      </div>
    </div>
  );
}
