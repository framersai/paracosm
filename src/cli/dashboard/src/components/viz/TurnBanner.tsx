import { useMemo } from 'react';
import type { GameState, ActorSideState } from '../../hooks/useGameState.js';
import { humanizeOutcome } from './humanize-outcome.js';

interface TurnBannerProps {
  state: GameState;
  currentTurn: number;
}

interface LeaderTurnSummary {
  actorName: string;
  decision: string;
  outcome: string;
  deaths: number;
  dominantCause: string | null;
  moraleDelta: number;
  eventTitle: string;
  eventCategory: string;
  time: number;
}

function summarize(side: ActorSideState, turn: number): LeaderTurnSummary | null {
  const actorName = side.leader?.name ?? '';
  if (!actorName) return null;

  let decision = '';
  let outcome = '';
  let deaths = 0;
  let dominantCause: string | null = null;
  let moraleDelta = 0;
  let eventTitle = '';
  let eventCategory = '';
  let time = 0;

  for (const evt of side.events) {
    const t = (evt.data?.turn as number | undefined) ?? -1;
    if (t !== turn + 1) continue;
    if (evt.type === 'turn_start' || evt.type === 'event_start') {
      eventTitle = String(evt.data?.title ?? eventTitle);
      eventCategory = String(evt.data?.category ?? eventCategory);
      time = Number(evt.data?.time ?? time);
    }
    if (evt.type === 'decision_made') {
      decision = String(evt.data?.decision ?? decision);
    }
    if (evt.type === 'outcome') {
      outcome = String(evt.data?.outcome ?? outcome);
      deaths = Number(evt.data?.deaths ?? deaths);
      dominantCause = (evt.data?.dominantCause as string | undefined) ?? dominantCause;
      moraleDelta = Number(evt.data?.moraleDelta ?? moraleDelta);
    }
  }

  return { actorName, decision, outcome, deaths, dominantCause, moraleDelta, eventTitle, eventCategory, time };
}

/**
 * Banner above the grid: turn number, time, event title + category,
 * and one humanized outcome line per leader. Generated from existing
 * events only; no LLM call.
 */
export function TurnBanner({ state, currentTurn }: TurnBannerProps) {
  const firstId = state.actorIds[0];
  const secondId = state.actorIds[1];
  const sideA = firstId ? state.actors[firstId] : null;
  const sideB = secondId ? state.actors[secondId] : null;
  const a = useMemo(() => sideA ? summarize(sideA, currentTurn) : null, [sideA, currentTurn]);
  const b = useMemo(() => sideB ? summarize(sideB, currentTurn) : null, [sideB, currentTurn]);

  const headline = a?.eventTitle || b?.eventTitle || '';
  const category = a?.eventCategory || b?.eventCategory || '';
  const time = a?.time || b?.time || 0;

  if (!headline) return null;

  return (
    <div
      role="status"
      aria-label="Current turn narrative"
      style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        padding: '8px 12px', fontSize: 11, fontFamily: 'var(--mono)',
        background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', color: 'var(--text-2)', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-3)' }}>T{currentTurn + 1}{time ? ` \u00b7 ${time}` : ''}</span>
        <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{headline}</span>
        {category && (
          <span style={{
            padding: '2px 6px', borderRadius: 4, fontSize: 9,
            background: 'var(--bg-card)', color: 'var(--text-3)',
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            {category}
          </span>
        )}
      </div>
      {a && (
        <div style={{ color: 'var(--vis)' }}>A: {humanizeOutcome(a)}</div>
      )}
      {b && (
        <div style={{ color: 'var(--eng)' }}>B: {humanizeOutcome(b)}</div>
      )}
    </div>
  );
}
