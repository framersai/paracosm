import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import type { GameState, Side, SideState, LeaderInfo } from '../../hooks/useGameState';
import { useScenarioContext } from '../../App';
import { useCitationContext } from '../../hooks/useCitationRegistry';
import { useToolContext } from '../../hooks/useToolRegistry';
import { LeaderBar } from '../layout/LeaderBar';
import { StatsBar } from '../layout/StatsBar';
import { CrisisHeader } from './CrisisHeader';
import { EventCard } from './EventCard';
import { DivergenceRail } from './DivergenceRail';
import { Timeline } from './Timeline';
import { SimFooterBar } from './SimFooterBar';
import { LoadPriorRunsCTA } from '../settings/LoadPriorRunsCTA';

interface SimViewProps {
  state: GameState;
  sseStatus?: string;
  onRun?: () => void;
  verdict?: Record<string, unknown> | null;
  /** App-level launching flag — survives tab navigation so users can
   *  switch to viz/chat/etc. and come back to a still-loading sim. */
  launching?: boolean;
}

function SideColumn({ side, sideState, state }: { side: Side; sideState: SideState; state: GameState }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Pin-to-bottom state. Starts pinned; releases when the user
  // scrolls up more than 40px so they can read an older event
  // without being yanked back to the live edge.
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

      <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
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

/**
 * Compact introduction bar. The old full-paragraph version took three
 * text lines and shoved the actual sim columns below the fold on short
 * viewports. Now collapses to a single short headline with a show/hide
 * toggle; expanded body is only rendered when the user asks for it.
 */
function IntroBar({ onDismiss }: { onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      role="region"
      aria-label="How to read the simulation"
      style={{
        padding: '6px 16px', display: 'flex', alignItems: 'baseline', gap: '12px', fontSize: '11px',
        background: 'linear-gradient(90deg, rgba(232,180,74,.08), rgba(76,168,168,.08))',
        borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, color: 'var(--text-2)', lineHeight: 1.5, minWidth: 200 }}>
        <b style={{ color: 'var(--text-1)' }}>How to read this:</b>{' '}
        {expanded ? (
          <>
            Two commanders with opposing HEXACO profiles run the same seed. Left is Leader A (amber), right is Leader B (teal). Each turn, departments analyze in parallel and may forge a new computational tool in a V8 sandbox or reuse an existing one. Commanders decide. The settlement diverges. Click any tile in Viz to drill into a colonist; click any forge card to inspect the generated code.
          </>
        ) : (
          <>
            two commanders, one seed, divergent histories. HEXACO shapes every LLM call.{' '}
            <button
              onClick={() => setExpanded(true)}
              style={{
                background: 'none', border: 'none', color: 'var(--amber)',
                cursor: 'pointer', padding: 0, fontSize: '11px', fontFamily: 'inherit',
                textDecoration: 'underline', textDecorationStyle: 'dotted',
              }}
            >
              more
            </button>
          </>
        )}
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

export function SimView({ state, sseStatus, onRun, verdict, launching: launchingProp }: SimViewProps) {
  const scenario = useScenarioContext();
  const citationRegistry = useCitationContext();
  const toolRegistry = useToolContext();
  // Local fallback only used when no parent-controlled launching flag is
  // passed (legacy callers). The App now owns this state and threads it
  // through so it survives tab navigation.
  const [localLaunching, setLocalLaunching] = useState(false);
  const launching = launchingProp ?? localLaunching;

  const hasEvents = state.a.events.length > 0 || state.b.events.length > 0;
  const showLoading = state.isRunning && !hasEvents;

  // Clear local launching state once events start arriving or sim is running
  useEffect(() => {
    if ((hasEvents || state.isRunning) && launchingProp === undefined) setLocalLaunching(false);
  }, [hasEvents, state.isRunning, launchingProp]);

  const handleRun = useCallback(() => {
    if (launchingProp === undefined) setLocalLaunching(true);
    onRun?.();
  }, [onRun, launchingProp]);

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
      {/* Shared leaders row. Winner/tie/second chip on each card
          surfaces the verdict even before the user scrolls down to
          the banner card. Only rendered when the verdict LLM has
          produced a final winner call. */}
      {(() => {
        const w = verdict && typeof verdict === 'object' ? (verdict as Record<string, unknown>).winner : null;
        const placementA: 'winner' | 'second' | 'tie' | null =
          w === 'A' ? 'winner' : w === 'B' ? 'second' : w === 'tie' ? 'tie' : null;
        const placementB: 'winner' | 'second' | 'tie' | null =
          w === 'B' ? 'winner' : w === 'A' ? 'second' : w === 'tie' ? 'tie' : null;
        return (
          <div className="leaders-row" style={{ display: 'flex', gap: '1px', background: 'var(--border)' }}>
            <LeaderBar side="a" leader={state.a.leader || presetLeaderA} popHistory={state.a.popHistory} moraleHistory={state.a.moraleHistory} verdictPlacement={placementA} />
            <LeaderBar side="b" leader={state.b.leader || presetLeaderB} popHistory={state.b.popHistory} moraleHistory={state.b.moraleHistory} verdictPlacement={placementB} />
          </div>
        );
      })()}

      {/* Shared stats row. Cost + leader-name props were dropped from
          StatsBar when the cost breakdown moved to its own modal; the
          component ignored them even at runtime, so stop passing them. */}
      <StatsBar
        colonyA={state.a.colony}
        colonyB={state.b.colony}
        prevColonyA={state.a.prevColony}
        prevColonyB={state.b.prevColony}
        deathsA={state.a.deaths}
        deathsB={state.b.deaths}
        deathCausesA={state.a.deathCauses}
        deathCausesB={state.b.deathCauses}
        toolsA={state.a.tools}
        toolsB={state.b.tools}
        citationsA={state.a.citations}
        citationsB={state.b.citations}
        crisisText={crisisText}
        toolRegistry={toolRegistry}
      />

      {/* Slim sim-progress bar. Visible while the run is active and
          hides on completion. Percentage derives from state.turn vs
          state.maxTurns, which the SSE sim_start event populates. Text
          shows turn / max so users can gauge how much is left without
          counting cards. */}
      {state.isRunning && !state.isComplete && state.maxTurns > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 12px', background: 'var(--bg-deep)',
          borderBottom: '1px solid var(--border)',
          fontFamily: 'var(--mono)', fontSize: 10,
        }}>
          <span style={{ color: 'var(--text-3)', letterSpacing: '0.5px', fontWeight: 700, textTransform: 'uppercase' }}>
            Turn {Math.max(1, state.turn)} / {state.maxTurns}
          </span>
          <div style={{
            flex: 1, height: 4, borderRadius: 2,
            background: 'var(--border)', overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.min(100, Math.max(0, (state.turn / state.maxTurns) * 100))}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--vis), var(--eng))',
              transition: 'width 400ms ease-out',
            }} />
          </div>
          <span style={{ color: 'var(--text-3)' }}>
            {Math.round((state.turn / state.maxTurns) * 100)}%
          </span>
        </div>
      )}

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
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
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
                // Prior UX tried to programmatically click the TopBar LOAD
                // dropdown. That dropdown opens at the top of the screen
                // while the user is looking at the empty state in the
                // middle, so the click registered as "nothing happened"
                // from the user's POV.
                //
                // Instead, scroll to the WATCH A PRIOR RUN card directly
                // below — it already renders the cached-run list with
                // one-click REPLAY buttons and explanatory empty-state
                // copy when there are none. If the card isn't on-page
                // (shouldn't happen, but defensive), fall back to the
                // file picker so the button never dead-ends.
                const cta = document.querySelector<HTMLElement>(
                  '[data-paracosm-replay-cta="true"]',
                );
                if (!cta) return;
                cta.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Flash the card border so the user's eye catches the
                // landing spot (scroll alone is easy to miss on a long
                // empty state).
                cta.style.transition = 'box-shadow 300ms ease-out';
                cta.style.boxShadow = '0 0 0 2px var(--amber, #e8b44a)';
                setTimeout(() => { cta.style.boxShadow = ''; }, 1200);
              }}
              style={{
                background: 'linear-gradient(135deg, var(--amber), #c8952e)', color: 'var(--bg-deep)',
                border: 'none', padding: '10px 28px', borderRadius: '6px',
                fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(232,180,74,.25)',
              }}
            >
              Load Prior Run
            </button>
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
          {/* Surface saved-run replays right in the empty state so users
              who land on SIM without a running simulation can start
              watching a prior run with one click. Renders explanatory
              empty state when no saved runs exist yet. */}
          <div
            data-paracosm-replay-cta="true"
            style={{
              width: '100%',
              maxWidth: 720,
              marginTop: 28,
              textAlign: 'left',
            }}
          >
            <LoadPriorRunsCTA />
          </div>
        </div>
      )}

      {/* Two columns (only show when there are events or sim is running) */}
      <div className="sim-columns" style={{ display: (state.isRunning || state.isComplete || state.a.events.length > 0 || state.b.events.length > 0 || sseStatus === 'connected') ? 'flex' : 'none', flex: 1, gap: '1px', background: 'var(--border)', overflow: 'hidden' }}>
        <SideColumn side="a" sideState={state.a} state={state} />
        <SideColumn side="b" sideState={state.b} state={state} />
      </div>

      {/* Verdict surfaces as a global top banner (App.tsx) and inline
          on the Reports tab. Removing the per-column rendering here
          keeps the Sim layout focused on event streams after a run
          completes. */}

      {/* Timeline at bottom — gets the full vertical room now that
          References / Toolbox have moved out of the inline column flow. */}
      <Timeline state={state} />

      {/* End-of-sim evidence bar: small pills that open References and
          Forged Toolbox in modals so the timeline + columns above stay
          fully visible. The user explicitly asked for this CTA pattern. */}
      <SimFooterBar citationRegistry={citationRegistry} toolRegistry={toolRegistry} />

      {/* Re-run-with-seed+1: moved to the very bottom of the Sim view
          so it reads as an epilogue action rather than interrupting
          the flow between the sim columns and the timeline. Single-
          click rerun of the last-launched config, bumped by one
          deterministic tick so the outcome shifts without forcing
          the user back to Settings. Reads last config from
          localStorage (written by SettingsPanel.launch). Forwards
          any BYO keys the same way ChatPanel does. */}
      {state.isComplete && !state.isRunning && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 16px', background: 'var(--bg-panel)',
          borderTop: '1px solid var(--border)',
          fontFamily: 'var(--mono)', fontSize: 11,
        }}>
          <span style={{ color: 'var(--text-3)', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            Re-run
          </span>
          <span style={{ color: 'var(--text-2)' }}>
            Spin up a new run with the same leaders + scenario, seed bumped by one.
          </span>
          <button
            type="button"
            onClick={async () => {
              try {
                const raw = localStorage.getItem('paracosm:lastLaunchConfig');
                if (!raw) {
                  alert('No previous launch config found. Run once from Settings first.');
                  return;
                }
                const prev = JSON.parse(raw) as Record<string, unknown>;
                const storedKeys = (() => {
                  try { return JSON.parse(localStorage.getItem('paracosm:keyOverrides') || '{}') as Record<string, string>; }
                  catch { return {}; }
                })();
                const next: Record<string, unknown> = {
                  ...prev,
                  seed: (typeof prev.seed === 'number' ? prev.seed : 950) + 1,
                  ...(storedKeys.openai ? { apiKey: storedKeys.openai } : {}),
                  ...(storedKeys.anthropic ? { anthropicKey: storedKeys.anthropic } : {}),
                  ...(storedKeys.serper ? { serperKey: storedKeys.serper } : {}),
                  ...(storedKeys.firecrawl ? { firecrawlKey: storedKeys.firecrawl } : {}),
                  ...(storedKeys.tavily ? { tavilyKey: storedKeys.tavily } : {}),
                  ...(storedKeys.cohere ? { cohereKey: storedKeys.cohere } : {}),
                };
                const res = await fetch('/setup', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(next),
                });
                const data = await res.json();
                if (res.status === 429) {
                  alert(data.error || 'Rate limit hit. Add an API key in Settings to bypass.');
                  return;
                }
                if (data.redirect) {
                  // Persist the new seed so the next "Re-run" button bumps
                  // from this run's seed, not the original one.
                  try {
                    localStorage.setItem('paracosm:lastLaunchConfig', JSON.stringify(next));
                  } catch { /* silent */ }
                  window.location.href = data.redirect;
                }
              } catch (err) {
                alert(`Re-run failed: ${err}`);
              }
            }}
            style={{
              marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
              padding: '4px 12px', borderRadius: 4,
              background: 'linear-gradient(135deg, var(--rust), #c44a1e)',
              color: 'white', border: 'none', cursor: 'pointer',
            }}
          >
            Run again with seed+1 ›
          </button>
        </div>
      )}
    </div>
  );
}
