import type { GameState, Side } from '../../hooks/useGameState';
import { Tooltip } from '../shared/Tooltip';

interface TimelineProps {
  state: GameState;
}

interface TurnEntry {
  turn: number;
  year: number;
  title: string;
  summary?: string;
  outcome?: string;
  decision?: string;
  category?: string;
  emergent?: boolean;
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
        summary: (evt.data.turnSummary as string) || (evt.data.crisis as string)?.slice(0, 200) || '',
        category: evt.data.category as string || '',
        emergent: evt.data.emergent as boolean || false,
      });
    }
    if (evt.type === 'outcome') {
      const t = turns.find(t => t.turn === evt.data.turn);
      if (t) {
        t.outcome = evt.data.outcome as string;
        t.decision = (evt.data._decision as string) || '';
      }
    }
  }
  if (turns.length) turns[turns.length - 1].current = !state.isComplete;
  return turns;
}

function outcomeLabel(outcome?: string): { label: string; color: string } {
  if (!outcome) return { label: '', color: 'var(--text-3)' };
  const isSuccess = outcome.includes('success');
  const isRisky = outcome.includes('risky');
  const label = isRisky ? (isSuccess ? 'RISKY WIN' : 'RISKY LOSS') : (isSuccess ? 'SAFE WIN' : 'SAFE LOSS');
  const color = isSuccess ? 'var(--green)' : 'var(--rust)';
  return { label, color };
}

function outcomeBadge(outcome?: string) {
  if (!outcome) return null;
  const { label, color } = outcomeLabel(outcome);
  const isSuccess = outcome.includes('success');
  const short = outcome.includes('risky') ? (isSuccess ? 'RS' : 'RF') : (isSuccess ? 'CS' : 'CF');
  return (
    <span style={{ fontSize: '9px', fontWeight: 800, fontFamily: 'var(--mono)', padding: '1px 4px', borderRadius: '2px', background: `${isSuccess ? 'rgba(106,173,72,.15)' : 'rgba(224,101,48,.15)'}`, color, border: `1px solid ${color}` }}>
      {short}
    </span>
  );
}

function TurnTooltipContent({ t, sideColor }: { t: TurnEntry; sideColor: string }) {
  const { label, color } = outcomeLabel(t.outcome);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <b style={{ color: sideColor, fontSize: '15px' }}>Turn {t.turn}</b>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--text-2)' }}>Y{t.year}</span>
        {t.category && (
          <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: 'var(--bg-deep)', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
            {t.category}
          </span>
        )}
        {t.emergent && (
          <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--rust)', fontFamily: 'var(--mono)' }}>EMERGENT</span>
        )}
      </div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '6px' }}>
        {t.title}
      </div>
      {t.summary && (
        <div style={{ fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: '8px' }}>
          {t.summary}
        </div>
      )}
      {t.decision && (
        <div style={{ fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 700, color: sideColor, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Decision: </span>
          {t.decision.slice(0, 300)}{t.decision.length > 300 ? '...' : ''}
        </div>
      )}
      {t.outcome && (
        <div style={{ fontSize: '12px', fontWeight: 800, fontFamily: 'var(--mono)', color, marginTop: '4px' }}>
          {label}
        </div>
      )}
    </div>
  );
}

function SideTimeline({ turns, side, leaderName }: { turns: TurnEntry[]; side: Side; leaderName: string }) {
  const sideColor = side === 'a' ? 'var(--vis)' : 'var(--eng)';
  const sideBg = side === 'a' ? 'rgba(232,180,74,.08)' : 'rgba(76,168,168,.08)';

  return (
    <div style={{ flex: 1, background: 'var(--bg-panel)', padding: '3px 8px', overflowY: 'auto' }}>
      <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '3px', marginBottom: '3px', display: 'inline-block', fontFamily: 'var(--mono)', color: sideColor, background: sideBg }}>
        {leaderName}
      </span>
      {turns.map(t => (
        <Tooltip key={t.turn} dot content={<TurnTooltipContent t={t} sideColor={sideColor} />}>
          <div style={{
            padding: '3px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: '12px', marginBottom: '3px', width: '100%', cursor: 'pointer',
            animation: t.current ? 'glow 2s infinite' : undefined,
          }}>
            <span style={{ fontWeight: 800, minWidth: '30px', fontFamily: 'var(--mono)', color: sideColor }}>
              {t.year}
            </span>
            <span style={{ flex: 1, margin: '0 6px', color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.title}{t.summary ? `: ${t.summary}` : ''}
            </span>
            {outcomeBadge(t.outcome)}
          </div>
        </Tooltip>
      ))}
    </div>
  );
}

export function Timeline({ state }: TimelineProps) {
  const turnsA = extractTurns(state, 'a');
  const turnsB = extractTurns(state, 'b');

  if (!turnsA.length && !turnsB.length) return null;

  return (
    <div className="timeline-row" role="region" aria-label="Turn timeline" style={{
      borderTop: '1px solid var(--border)', background: 'var(--bg-panel)',
      display: 'flex', gap: '1px', maxHeight: '140px', overflow: 'hidden', flexShrink: 0,
    }}>
      <SideTimeline turns={turnsA} side="a" leaderName={state.a.leader?.name || 'A'} />
      <SideTimeline turns={turnsB} side="b" leaderName={state.b.leader?.name || 'B'} />
    </div>
  );
}
