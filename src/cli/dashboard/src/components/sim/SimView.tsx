import { useRef, useEffect, useState } from 'react';
import type { GameState, Side, SideState, LeaderInfo } from '../../hooks/useGameState';
import { useScenarioContext } from '../../App';
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
  const sideColor = side === 'a' ? 'var(--vis)' : 'var(--eng)';
  const sideLabel = side === 'a' ? 'Leader A' : 'Leader B';

  return (
    <section
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-deep)', overflow: 'hidden' }}
      aria-label={`${sideState.leader?.name || sideLabel} events`}
    >
      <CrisisHeader side={side} crisis={sideState.crisis} />

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '5px 8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {!isWaiting && sideState.events.length === 0 && state.isRunning && (
          <div style={{ color: 'var(--text-3)', fontSize: '12px', padding: '12px 10px' }} role="status">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: sideColor, animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600 }}>Generating crisis...</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-4)', lineHeight: 1.5 }}>
              The Crisis Director is analyzing colony state and decision history to generate a unique crisis for this turn.
            </div>
          </div>
        )}
        {sideState.events.map(event => (
          <EventCard key={event.id} event={event} side={side} />
        ))}
      </div>
    </section>
  );
}

function IntroBar({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="region"
      aria-label="How to read the simulation"
      style={{
        padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px',
        background: 'linear-gradient(90deg, rgba(232,180,74,.08), rgba(76,168,168,.08))',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ flex: 1, color: 'var(--text-2)', lineHeight: 1.5 }}>
        <b style={{ color: 'var(--text-1)' }}>How to read this:</b>{' '}
        Same settlement, two AI commanders with different personalities.
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
        aria-label="Dismiss introduction"
      >
        Got it
      </button>
    </div>
  );
}

export function SimView({ state }: SimViewProps) {
  const scenario = useScenarioContext();

  // Fallback leader info from scenario presets when no simulation data yet
  const defaultPreset = scenario.presets.find(p => p.id === 'default');
  const presetLeaderA: LeaderInfo | null = defaultPreset?.leaders?.[0]
    ? { name: defaultPreset.leaders[0].name, archetype: defaultPreset.leaders[0].archetype, colony: 'Colony Alpha', hexaco: defaultPreset.leaders[0].hexaco, instructions: defaultPreset.leaders[0].instructions, quote: '' }
    : null;
  const presetLeaderB: LeaderInfo | null = defaultPreset?.leaders?.[1]
    ? { name: defaultPreset.leaders[1].name, archetype: defaultPreset.leaders[1].archetype, colony: 'Colony Beta', hexaco: defaultPreset.leaders[1].hexaco, instructions: defaultPreset.leaders[1].instructions, quote: '' }
    : null;

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
  const crisisText = crisisA
    ? `T${crisisA.turn} \u2014 ${crisisA.year}: ${crisisA.title}`
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Shared leaders row */}
      <div className="leaders-row" style={{ display: 'flex', gap: '1px', background: 'var(--border)' }}>
        <LeaderBar side="a" leader={state.a.leader || presetLeaderA} popHistory={state.a.popHistory} moraleHistory={state.a.moraleHistory} />
        <LeaderBar side="b" leader={state.b.leader || presetLeaderB} popHistory={state.b.popHistory} moraleHistory={state.b.moraleHistory} />
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

      {showIntro && state.a.events.length > 0 && <IntroBar onDismiss={dismissIntro} />}

      <DivergenceRail state={state} />

      {/* Empty state: no events, not running */}
      {!state.isRunning && !state.isComplete && state.a.events.length === 0 && state.b.events.length === 0 && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '40px 24px', textAlign: 'center', background: 'var(--bg-deep)',
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '16px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '12px' }}>
            No simulation running
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-3)', maxWidth: '420px', lineHeight: 1.7, marginBottom: '20px' }}>
            Configure two commanders with different HEXACO personality profiles, choose a scenario, and launch from the Settings tab. Or load a previously saved simulation.
          </div>
          <button
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set('tab', 'settings');
              window.history.replaceState({}, '', url.toString());
              window.location.reload();
            }}
            style={{
              background: 'linear-gradient(135deg, var(--rust), #c44a1e)', color: '#fff',
              border: 'none', padding: '10px 28px', borderRadius: '6px',
              fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(224,101,48,.25)',
            }}
          >
            Go to Settings
          </button>
        </div>
      )}

      {/* Two columns (only show when there are events or sim is running) */}
      <div className="sim-columns" style={{ display: (state.isRunning || state.isComplete || state.a.events.length > 0 || state.b.events.length > 0) ? 'flex' : 'none', flex: 1, gap: '1px', background: 'var(--border)', overflow: 'hidden' }}>
        <SideColumn side="a" sideState={state.a} state={state} />
        <SideColumn side="b" sideState={state.b} state={state} />
      </div>

      {/* Timeline at bottom */}
      <Timeline state={state} />
    </div>
  );
}
