import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import type { GameState, Side, SideState, LeaderInfo } from '../../hooks/useGameState';
import { useScenarioContext } from '../../App';
import { LeaderBar } from '../layout/LeaderBar';
import { StatsBar } from '../layout/StatsBar';
import { CrisisHeader } from './CrisisHeader';
import { EventCard } from './EventCard';
import { DivergenceRail } from './DivergenceRail';
import { Timeline } from './Timeline';
import { VerdictCard } from './VerdictCard';

interface SimViewProps {
  state: GameState;
  sseStatus?: string;
  onRun?: () => void;
  verdict?: Record<string, unknown> | null;
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

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
        {!isWaiting && sideState.events.length === 0 && state.isRunning && (
          <div style={{ color: 'var(--text-3)', fontSize: '12px', padding: '16px 12px' }} role="status">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span className="spinner" style={{ borderTopColor: sideColor }} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 600, color: 'var(--text-2)' }}>Generating event...</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-3)', lineHeight: 1.6 }}>
              The Event Director is reading simulation state to generate an event targeting current weaknesses.
            </div>
          </div>
        )}
        {(() => {
          // Group all dept_done events by turn, render as one row per turn
          const deptsByTurn = new Map<number, typeof sideState.events>();
          const renderedDeptTurns = new Set<number>();
          for (const e of sideState.events) {
            if (e.type === 'dept_done' && e.turn != null) {
              if (!deptsByTurn.has(e.turn)) deptsByTurn.set(e.turn, []);
              deptsByTurn.get(e.turn)!.push(e);
            }
          }

          return sideState.events.map(event => {
            // Skip dept_start (noise between dept_done pills)
            if (event.type === 'dept_start') return null;
            // For dept_done: render the whole turn's group on first encounter
            if (event.type === 'dept_done' && event.turn != null) {
              if (renderedDeptTurns.has(event.turn)) return null;
              renderedDeptTurns.add(event.turn);
              const group = deptsByTurn.get(event.turn) || [event];
              return (
                <div key={`depts-${event.turn}`} style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', padding: '2px 0' }}>
                  {group.map(e => <EventCard key={e.id} event={e} side={side} />)}
                </div>
              );
            }
            return <EventCard key={event.id} event={event} side={side} />;
          });
        })()}
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

export function SimView({ state, sseStatus, onRun, verdict }: SimViewProps) {
  const scenario = useScenarioContext();
  const [launching, setLaunching] = useState(false);

  const hasEvents = state.a.events.length > 0 || state.b.events.length > 0;
  const showLoading = state.isRunning && !hasEvents;

  // Clear launching state once events start arriving or sim is running
  useEffect(() => {
    if (hasEvents || state.isRunning) setLaunching(false);
  }, [hasEvents, state.isRunning]);

  const handleRun = useCallback(() => {
    setLaunching(true);
    onRun?.();
  }, [onRun]);

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
        cost={state.cost}
        costA={state.costA}
        costB={state.costB}
      />

      {showIntro && state.a.events.length > 0 && <IntroBar onDismiss={dismissIntro} />}

      <DivergenceRail state={state} />

      {/* Loading state: connected but no events after 2s grace period */}
      {showLoading && !hasEvents && !state.isComplete && state.turn === 0 && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '40px 24px', textAlign: 'center', background: 'var(--bg-deep)',
        }}>
          <span className="spinner" style={{ width: '28px', height: '28px', borderWidth: '3px', marginBottom: '16px' }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: '14px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '8px' }}>
            Simulation starting...
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-3)', maxWidth: '400px', lineHeight: 1.7 }}>
            The Event Director is reading simulation state and generating the first event. Departments will analyze and forge tools once it arrives.
          </div>
        </div>
      )}

      {/* Launching state: user clicked Run, waiting for first events */}
      {launching && !hasEvents && !state.isRunning && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '40px 24px', textAlign: 'center', background: 'var(--bg-deep)',
        }}>
          <span className="spinner" style={{ width: '32px', height: '32px', borderWidth: '3px', marginBottom: '16px' }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: '16px', fontWeight: 700, color: 'var(--amber)', marginBottom: '8px' }}>
            Launching Simulation...
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-3)', maxWidth: '400px', lineHeight: 1.7 }}>
            Initializing the Event Director, departments, and agent personalities. First events will appear shortly.
          </div>
        </div>
      )}

      {/* Connecting state: SSE not yet connected, no events, show spinner */}
      {!hasEvents && !state.isComplete && !launching && sseStatus === 'connecting' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '40px 24px', textAlign: 'center', background: 'var(--bg-deep)',
        }}>
          <span className="spinner" style={{ width: '28px', height: '28px', borderWidth: '3px', marginBottom: '16px' }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: '14px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '8px' }}>
            Connecting...
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-3)', maxWidth: '400px', lineHeight: 1.7 }}>
            Loading simulation state from the server. If a simulation is running, events will appear shortly.
          </div>
        </div>
      )}

      {/* Empty state: connected but no events and no sim running */}
      {!state.isRunning && !state.isComplete && state.a.events.length === 0 && state.b.events.length === 0 && sseStatus === 'connected' && !launching && (
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
          <div style={{ display: 'flex', gap: '12px' }}>
            {onRun && (
              <button
                onClick={handleRun}
                style={{
                  background: 'linear-gradient(135deg, var(--rust), #c44a1e)', color: '#fff',
                  border: 'none', padding: '10px 28px', borderRadius: '6px',
                  fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(224,101,48,.25)',
                }}
              >
                Run Simulation
              </button>
            )}
            <button
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set('tab', 'settings');
                window.history.replaceState({}, '', url.toString());
                window.location.reload();
              }}
              style={{
                background: 'var(--bg-card)', color: 'var(--text-2)',
                border: '1px solid var(--border)', padding: '10px 28px', borderRadius: '6px',
                fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Settings
            </button>
          </div>
        </div>
      )}

      {/* Two columns (only show when there are events or sim is running) */}
      <div className="sim-columns" style={{ display: (state.isRunning || state.isComplete || state.a.events.length > 0 || state.b.events.length > 0 || sseStatus === 'connected') ? 'flex' : 'none', flex: 1, gap: '1px', background: 'var(--border)', overflow: 'hidden' }}>
        <SideColumn side="a" sideState={state.a} state={state} />
        <SideColumn side="b" sideState={state.b} state={state} />
      </div>

      {/* Verdict card after simulation completes */}
      {verdict && <VerdictCard verdict={verdict} />}

      {/* Timeline at bottom */}
      <Timeline state={state} />
    </div>
  );
}
