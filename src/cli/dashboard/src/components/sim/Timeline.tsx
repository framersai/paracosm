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
        summary: (evt.data.turnSummary as string) || (evt.data.crisis as string) || '',
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
          {t.decision}
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

function SideTimeline({ turns, side }: { turns: TurnEntry[]; side: Side }) {
  const sideColor = side === 'a' ? 'var(--vis)' : 'var(--eng)';

  return (
    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
      {turns.map(t => (
        <Tooltip key={t.turn} dot content={<TurnTooltipContent t={t} sideColor={sideColor} />}>
          <div style={{
            padding: '5px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '4px', cursor: 'pointer', overflow: 'hidden', width: '100%', boxSizing: 'border-box' as const,
            borderLeft: `3px solid ${sideColor}`,
            animation: t.current ? 'glow 2s infinite' : undefined,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', minWidth: 0 }}>
              <span style={{ fontWeight: 800, fontFamily: 'var(--mono)', color: sideColor, flexShrink: 0, fontSize: '10px' }}>
                T{t.turn} {t.year}
              </span>
              <span style={{ flex: 1, color: 'var(--text-1)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                {t.title}
              </span>
              {outcomeBadge(t.outcome)}
            </div>
            {t.decision && (
              <div style={{ fontSize: '10px', color: 'var(--text-2)', marginTop: '2px', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                {t.decision}
              </div>
            )}
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
      display: 'flex', gap: '4px', height: '160px', overflow: 'hidden', flexShrink: 0,
      padding: '4px 8px', minWidth: 0, maxWidth: '100%',
    }}>
      <SideTimeline turns={turnsA} side="a" />
      <SideTimeline turns={turnsB} side="b" />
    </div>
  );
}
