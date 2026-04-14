import { useRef, useEffect, useState } from 'react';
import type { GameState, Side, SideState } from '../../hooks/useGameState';
import { LeaderBar } from '../layout/LeaderBar';
import { StatsBar } from '../layout/StatsBar';
import { CrisisHeader } from './CrisisHeader';
import { EventCard } from './EventCard';
import { DivergenceRail } from './DivergenceRail';
import { Timeline } from './Timeline';

interface SimViewProps {
  state: GameState;
}

function SideColumn({ side, sideState, state }: { side: Side; sideState: SideState; state: GameState }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [sideState.events.length]);

  const isWaiting = !sideState.leader && !state.isRunning;
  const leaderName = sideState.leader?.name || (side === 'a' ? 'Leader A' : 'Leader B');
  const sideColor = side === 'a' ? 'var(--vis)' : 'var(--eng)';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-deep)', overflow: 'hidden' }}>
      {/* Column header with side name */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '4px 10px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontWeight: 800, fontSize: '12px', fontFamily: 'var(--mono)', color: sideColor }}>
          {leaderName}
        </span>
        <span style={{ color: 'var(--text-3)', fontSize: '10px', marginLeft: '6px' }}>
          {sideState.leader?.archetype || ''}
        </span>
      </div>

      <CrisisHeader side={side} crisis={sideState.crisis} />

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '5px 8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {isWaiting && (
          <div style={{ color: 'var(--text-3)', fontSize: '12px', padding: '4px 10px', opacity: 0.5 }}>
            Waiting...
          </div>
        )}
        {!isWaiting && sideState.events.length === 0 && state.isRunning && (
          <div style={{ color: 'var(--text-3)', fontSize: '12px', padding: '4px 10px', animation: 'pulse 1.5s infinite' }}>
            Running...
          </div>
        )}
        {sideState.events.map(event => (
          <EventCard key={event.id} event={event} side={side} />
        ))}
      </div>
    </div>
  );
}

function IntroBar({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div style={{
      padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px',
      background: 'linear-gradient(90deg, rgba(232,180,74,.08), rgba(76,168,168,.08))',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ flex: 1, color: 'var(--text-2)', lineHeight: 1.5 }}>
        <b style={{ color: 'var(--text-1)' }}>How to read this:</b>{' '}
        Same {'{scenario}'}, two AI commanders with different personalities.
        Left column = Leader A. Right column = Leader B.
        Each turn is a crisis. Departments analyze, commanders decide, the settlement changes.
        Tools are computational models the AI invents at runtime. Hover anything for details.
      </div>
      <button
        onClick={onDismiss}
        style={{
          background: 'none', border: '1px solid var(--border)', color: 'var(--text-3)',
          padding: '2px 10px', borderRadius: '3px', cursor: 'pointer',
          fontSize: '10px', fontFamily: 'var(--sans)', flexShrink: 0,
        }}
      >
        Got it
      </button>
    </div>
  );
}

export function SimView({ state }: SimViewProps) {
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('paracosm-intro-dismissed') !== '1';
  });

  const dismissIntro = () => {
    setShowIntro(false);
    localStorage.setItem('paracosm-intro-dismissed', '1');
  };

  // Build crisis text for the shared stats bar
  const crisisA = state.a.crisis;
  const crisisB = state.b.crisis;
  const crisisText = crisisA
    ? `T${crisisA.turn} \u2014 ${crisisA.year}: ${crisisA.title}${crisisA.emergent ? '' : ''}`
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Shared leaders row */}
      <div style={{ display: 'flex', gap: '1px', background: 'var(--border)' }}>
        <LeaderBar side="a" leader={state.a.leader} popHistory={state.a.popHistory} moraleHistory={state.a.moraleHistory} />
        <LeaderBar side="b" leader={state.b.leader} popHistory={state.b.popHistory} moraleHistory={state.b.moraleHistory} />
      </div>

      {/* Shared stats row */}
      <StatsBar
        colonyA={state.a.colony}
        colonyB={state.b.colony}
        prevColonyA={state.a.prevColony}
        prevColonyB={state.b.prevColony}
        deathsA={state.a.deaths}
        deathsB={state.b.deaths}
        toolsA={state.a.tools}
        toolsB={state.b.tools}
        citationsA={state.a.citations}
        citationsB={state.b.citations}
        crisisText={crisisText}
      />

      {showIntro && <IntroBar onDismiss={dismissIntro} />}

      <DivergenceRail state={state} />

      {/* Two columns */}
      <div style={{ display: 'flex', flex: 1, gap: '1px', background: 'var(--border)', overflow: 'hidden' }}>
        <SideColumn side="a" sideState={state.a} state={state} />
        <SideColumn side="b" sideState={state.b} state={state} />
      </div>

      {/* Timeline at bottom */}
      <Timeline state={state} />
    </div>
  );
}
