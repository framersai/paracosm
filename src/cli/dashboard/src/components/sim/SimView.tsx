import { useRef, useEffect } from 'react';
import type { GameState, Side, SideState } from '../../hooks/useGameState';
import { LeaderBar } from '../layout/LeaderBar';
import { StatsBar } from '../layout/StatsBar';
import { CrisisHeader } from './CrisisHeader';
import { EventCard } from './EventCard';
import { DivergenceRail } from './DivergenceRail';

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

  return (
    <div className="flex-1 flex flex-col min-w-0" style={{ background: 'var(--bg-primary)' }}>
      <LeaderBar
        side={side}
        leader={sideState.leader}
        popHistory={sideState.popHistory}
        moraleHistory={sideState.moraleHistory}
      />
      <StatsBar
        side={side}
        colony={sideState.colony}
        prevColony={sideState.prevColony}
        deaths={sideState.deaths}
        tools={sideState.tools}
        citations={sideState.citations}
      />
      <CrisisHeader side={side} crisis={sideState.crisis} />

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isWaiting && (
          <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
            <div className="text-3xl mb-3 animate-pulse">◉</div>
            <div className="text-sm">Waiting for {leaderName}...</div>
          </div>
        )}
        {!isWaiting && sideState.events.length === 0 && state.isRunning && (
          <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
            <div className="text-3xl mb-3 animate-pulse">⚡</div>
            <div className="text-sm">Running...</div>
          </div>
        )}
        {sideState.events.map(event => (
          <EventCard key={event.id} event={event} side={side} />
        ))}
      </div>
    </div>
  );
}

export function SimView({ state }: SimViewProps) {
  return (
    <div className="flex flex-col h-full">
      <DivergenceRail state={state} />
      <div className="flex flex-col md:flex-row flex-1 gap-px overflow-hidden md:overflow-hidden" style={{ background: 'var(--border-primary)' }}>
        <SideColumn side="a" sideState={state.a} state={state} />
        <SideColumn side="b" sideState={state.b} state={state} />
      </div>
    </div>
  );
}
