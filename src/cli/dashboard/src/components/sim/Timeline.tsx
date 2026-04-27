import { useEffect, useRef } from 'react';
import type { GameState, ActorSideState } from '../../hooks/useGameState';
import { getActorColorVar } from '../../hooks/useGameState';
import { Tooltip } from '../shared/Tooltip';

interface TimelineProps {
  state: GameState;
}

interface TurnEntry {
  turn: number;
  time: number;
  title: string;
  summary?: string;
  outcome?: string;
  decision?: string;
  category?: string;
  emergent?: boolean;
  current?: boolean;
  subEvents?: Array<{ index: number; title: string; category: string }>;
}

function extractTurns(sideState: ActorSideState, isComplete: boolean): TurnEntry[] {
  const turns: TurnEntry[] = [];
  const s = sideState;
  for (const evt of s.events) {
    if (evt.type === 'turn_start' && evt.data.title && evt.data.title !== 'Director generating...') {
      turns.push({
        turn: evt.data.turn as number,
        time: evt.data.time as number,
        title: evt.data.title as string,
        summary: (evt.data.turnSummary as string) || (evt.data.crisis as string) || '',
        category: evt.data.category as string || '',
        emergent: evt.data.emergent as boolean || false,
      });
    }
    if (evt.type === 'event_start') {
      const turnNum = evt.data.turn as number;
      const t = turns.find(t => t.turn === turnNum);
      if (t) {
        if (!t.subEvents) t.subEvents = [];
        t.subEvents.push({
          index: Number(evt.data.eventIndex ?? 0),
          title: String(evt.data.title || ''),
          category: String(evt.data.category || ''),
        });
      }
    }
    if (evt.type === 'outcome') {
      const t = turns.find(t => t.turn === evt.data.turn);
      if (t) {
        t.outcome = evt.data.outcome as string;
        t.decision = (evt.data._decision as string) || '';
      }
    }
  }
  if (turns.length) turns[turns.length - 1].current = !isComplete;
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
        <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--text-2)' }}>Y{t.time}</span>
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

function SideTimeline({ turns, actorIndex }: { turns: TurnEntry[]; actorIndex: number }) {
  const sideColor = getActorColorVar(actorIndex);
  // Same tail-to-bottom pattern as the Sim column and Event Log:
  // auto-scroll when pinned, release on user scroll-up.
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };
  useEffect(() => {
    if (!pinnedRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [turns.length]);

  return (
    <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
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
                T{t.turn} {t.time}
              </span>
              <span style={{ flex: 1, color: 'var(--text-1)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                {t.title}
              </span>
              {t.category && (
                <span style={{ fontSize: '9px', padding: '0 4px', borderRadius: '2px', background: 'var(--bg-deep)', color: 'var(--text-3)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                  {t.category}
                </span>
              )}
              {t.emergent && (
                <span style={{ fontSize: '8px', fontWeight: 800, color: 'var(--rust)', fontFamily: 'var(--mono)', flexShrink: 0 }}>EMERGENT</span>
              )}
              {outcomeBadge(t.outcome)}
            </div>
            {t.summary && (
              <div style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '2px', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, fontStyle: 'italic' }}>
                {t.summary}
              </div>
            )}
            {t.subEvents && t.subEvents.length > 1 && (
              <div style={{ fontSize: '9px', color: 'var(--text-3)', marginTop: '2px', lineHeight: 1.3 }}>
                {t.subEvents.map((se, i) => (
                  <div key={i} style={{ display: 'flex', gap: '4px' }}>
                    <span style={{ color: 'var(--rust)', fontFamily: 'var(--mono)', fontWeight: 700, flexShrink: 0 }}>{se.index + 1}.</span>
                    <span>{se.title}</span>
                  </div>
                ))}
              </div>
            )}
            {t.decision && !t.subEvents?.length && (
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
  const firstId = state.actorIds[0];
  const secondId = state.actorIds[1];
  const sideA = firstId ? state.actors[firstId] : null;
  const sideB = secondId ? state.actors[secondId] : null;
  const turnsA = sideA ? extractTurns(sideA, state.isComplete) : [];
  const turnsB = sideB ? extractTurns(sideB, state.isComplete) : [];

  if (!turnsA.length && !turnsB.length) return null;

  return (
    <div className="timeline-row" role="region" aria-label="Turn timeline" style={{
      borderTop: '1px solid var(--border)', background: 'var(--bg-panel)',
      display: 'flex', gap: '4px', height: '200px', overflow: 'hidden', flexShrink: 0,
      padding: '4px 8px', minWidth: 0, maxWidth: '100%',
    }}>
      <SideTimeline turns={turnsA} actorIndex={0} />
      <SideTimeline turns={turnsB} actorIndex={1} />
    </div>
  );
}
