import { useMemo } from 'react';
import type { GameState, LeaderSideState } from '../../hooks/useGameState.js';
import { humanizeOutcome } from './humanize-outcome.js';

interface TurnBannerProps {
  state: GameState;
  currentTurn: number;
}

interface LeaderTurnSummary {
  leaderName: string;
  decision: string;
  outcome: string;
  deaths: number;
  dominantCause: string | null;
  moraleDelta: number;
  eventTitle: string;
  eventCategory: string;
  year: number;
}

function summarize(side: LeaderSideState, turn: number): LeaderTurnSummary | null {
  const leaderName = side.leader?.name ?? '';
  if (!leaderName) return null;

  let decision = '';
  let outcome = '';
  let deaths = 0;
  let dominantCause: string | null = null;
  let moraleDelta = 0;
  let eventTitle = '';
  let eventCategory = '';
  let year = 0;

  for (const evt of side.events) {
    const t = (evt.data?.turn as number | undefined) ?? -1;
    if (t !== turn + 1) continue;
    if (evt.type === 'turn_start' || evt.type === 'event_start') {
      eventTitle = String(evt.data?.title ?? eventTitle);
      eventCategory = String(evt.data?.category ?? eventCategory);
      year = Number(evt.data?.year ?? year);
    }
    if (evt.type === 'commander_decided') {
      decision = String(evt.data?.decision ?? decision);
    }
    if (evt.type === 'outcome') {
      outcome = String(evt.data?.outcome ?? outcome);
      deaths = Number(evt.data?.deaths ?? deaths);
      dominantCause = (evt.data?.dominantCause as string | undefined) ?? dominantCause;
      moraleDelta = Number(evt.data?.moraleDelta ?? moraleDelta);
    }
  }

  return { leaderName, decision, outcome, deaths, dominantCause, moraleDelta, eventTitle, eventCategory, year };
}

/**
 * Banner above the grid: turn number, year, event title + category,
 * and one humanized outcome line per leader. Generated from existing
 * events only; no LLM call.
 */
export function TurnBanner({ state, currentTurn }: TurnBannerProps) {
  const firstId = state.leaderIds[0];
  const secondId = state.leaderIds[1];
  const sideA = firstId ? state.leaders[firstId] : null;
  const sideB = secondId ? state.leaders[secondId] : null;
  const a = useMemo(() => sideA ? summarize(sideA, currentTurn) : null, [sideA, currentTurn]);
  const b = useMemo(() => sideB ? summarize(sideB, currentTurn) : null, [sideB, currentTurn]);

  const headline = a?.eventTitle || b?.eventTitle || '';
  const category = a?.eventCategory || b?.eventCategory || '';
  const year = a?.year || b?.year || 0;

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
        <span style={{ color: 'var(--text-3)' }}>T{currentTurn + 1}{year ? ` \u00b7 ${year}` : ''}</span>
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
