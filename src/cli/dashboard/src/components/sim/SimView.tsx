import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import type { GameState, ActorSideState, LeaderInfo } from '../../hooks/useGameState';
import { getActorColorVar } from '../../hooks/useGameState';
import { useScenarioContext } from '../../App';
import { DigitalTwinPanel } from '../digital-twin/DigitalTwinPanel';
import { DigitalTwinProgress } from '../digital-twin/DigitalTwinProgress';
import type { RunArtifact } from '../../../../../engine/schema/index.js';
import { useCitationContext } from '../../hooks/useCitationRegistry';
import { useToolContext } from '../../hooks/useToolRegistry';
import { ActorBar } from '../layout/ActorBar';
import { StatsBar } from '../layout/StatsBar';
import { TurnEventHeader } from './TurnEventHeader';
import { EventCard } from './EventCard';
import { DivergenceRail } from './DivergenceRail';
import { Timeline } from './Timeline';
import { SimFooterBar } from './SimFooterBar';
import { RerunPanel } from './RerunPanel';
import { LoadPriorRunsCTA } from '../settings/LoadPriorRunsCTA';
import { SimLayoutToggle, type SimLayout } from './SimLayoutToggle';
import { ConstellationView } from './ConstellationView';
import { ActorDrillInModal } from './ActorDrillInModal';
import styles from './SimView.module.scss';

interface SimViewProps {
  state: GameState;
  sseStatus?: string;
  onRun?: () => void;
  /** Optional — opens the guided tour (demo replay) from the empty
   *  state CTA. Without this, first-time users land on a dense
   *  empty page with no affordance to learn what the dashboard
   *  does before spending LLM credits on their own run. */
  onTour?: () => void;
  verdict?: Record<string, unknown> | null;
  /** App-level launching flag — survives tab navigation so users can
   *  switch to viz/chat/etc. and come back to a still-loading sim. */
  launching?: boolean;
  /** Digital-twin artifact returned by /api/quickstart/simulate-intervention
   *  (or a loaded JSON file with subject + intervention). When set,
   *  SimView replaces the parallel-actor layout with DigitalTwinPanel
   *  rendered against this single artifact. */
  interventionArtifact?: RunArtifact | null;
  /** While set (and no artifact yet), SimView renders DigitalTwinProgress
   *  with subject + intervention echo plus the live SSE event log. The
   *  payload carries just the prefilled subject + intervention shapes
   *  the dashboard knew about when the user clicked Run; once the
   *  artifact lands, App.tsx clears this field and DigitalTwinPanel
   *  renders the full result. */
  interventionRunning?: {
    subject: { id: string; name: string; profile?: Record<string, unknown> };
    intervention: { id: string; name: string; description: string; duration?: { value: number; unit: string } };
  } | null;
  /** Clears the intervention artifact so SimView returns to the standard
   *  parallel-actor layout. */
  onInterventionDismiss?: () => void;
  /** Pins the layout to a fixed value, overriding the auto-default and
   *  any previous user pick. The GuidedTour passes 'side-by-side' so its
   *  highlight selectors (`.leaders-row`, `.sim-columns`,
   *  `[aria-label="Colony statistics"]`) always exist — without this,
   *  a viewer who had previously run a 3+ actor sim would see the tour
   *  attempt to highlight nodes that the constellation layout never
   *  renders, and the tour would silently no-op past Sim. */
  forceLayout?: SimLayout;
}

function LeaderColumn({ actorIndex, sideState, state }: { actorIndex: number; sideState: ActorSideState; state: GameState }) {
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
  }, [sideState.events.length]);

  const isWaiting = !sideState.leader && !state.isRunning;
  const sideColor = getActorColorVar(actorIndex);
  const sideLabel = `Leader ${String.fromCharCode(65 + actorIndex)}`;

  return (
    <section
      className={styles.leaderColumn}
      style={{ ['--actor-color' as string]: sideColor }}
      aria-label={`${sideState.leader?.name || sideLabel} events`}
    >
      <TurnEventHeader actorIndex={actorIndex} event={sideState.event} />

      <div ref={scrollRef} onScroll={onScroll} className={styles.leaderColumnScroll}>
        {!isWaiting && sideState.events.length === 0 && state.isRunning && (
          <div className={styles.leaderColumnGeneratingBlock} role="status">
            <div className={styles.leaderColumnGeneratingHead}>
              <span className={`spinner ${styles.leaderColumnGeneratingSpinner}`} />
              <span className={styles.leaderColumnGeneratingLabel}>Generating event...</span>
            </div>
            <div className={styles.leaderColumnGeneratingCopy}>
              The Event Director is reading simulation state to generate an event targeting current weaknesses.
            </div>
          </div>
        )}
        {(() => {
          const deptsByTurn = new Map<number, typeof sideState.events>();
          const renderedDeptTurns = new Set<number>();
          for (const e of sideState.events) {
            if (e.type === 'specialist_done' && e.turn != null) {
              if (!deptsByTurn.has(e.turn)) deptsByTurn.set(e.turn, []);
              deptsByTurn.get(e.turn)!.push(e);
            }
          }

          return sideState.events.map(event => {
            if (event.type === 'specialist_start') return null;
            if (event.type === 'specialist_done' && event.turn != null) {
              if (renderedDeptTurns.has(event.turn)) return null;
              renderedDeptTurns.add(event.turn);
              const group = deptsByTurn.get(event.turn) || [event];
              return (
                <div key={`depts-${event.turn}`} className={styles.deptsRow}>
                  {group.map(e => <EventCard key={e.id} event={e} actorIndex={actorIndex} />)}
                </div>
              );
            }
            return <EventCard key={event.id} event={event} actorIndex={actorIndex} />;
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
      className={styles.introBar}
    >
      <div className={styles.introBody}>
        <b className={styles.introHeading}>How to read this:</b>{' '}
        {expanded ? (
          <>
            Two commanders with opposing HEXACO profiles run the same seed. Left is Leader A (amber), right is Leader B (teal). Each turn, departments analyze in parallel and may forge a new computational tool in a V8 sandbox or reuse an existing one. Commanders decide. The settlement diverges. Click any tile in Viz to drill into a colonist; click any forge card to inspect the generated code.
          </>
        ) : (
          <>
            two commanders, one seed, divergent histories. HEXACO shapes every LLM call.{' '}
            <button
              onClick={() => setExpanded(true)}
              className={styles.introExpandButton}
            >
              more
            </button>
          </>
        )}
      </div>
      <button
        onClick={onDismiss}
        className={styles.introDismissButton}
        aria-label="Dismiss introduction"
      >
        Got it
      </button>
    </div>
  );
}

export function SimView({ state, sseStatus, onRun, onTour, verdict, launching: launchingProp, interventionArtifact, interventionRunning, onInterventionDismiss, forceLayout }: SimViewProps) {
  const scenario = useScenarioContext();
  // Digital-twin short-circuit: when the dashboard receives an artifact
  // produced by simulateIntervention (subject + intervention populated),
  // we replace the entire SIM body with DigitalTwinPanel. Single-actor
  // intervention runs do not slot into the parallel-actor layout, so
  // mixing the two would just confuse the read.
  if (interventionArtifact) {
    return (
      <div className={styles.root}>
        <DigitalTwinPanel artifact={interventionArtifact} state={state} onDismiss={onInterventionDismiss} />
      </div>
    );
  }
  // Live phase: server is still streaming SSE events for this run. We
  // know the prefilled subject + intervention from the click that
  // initiated it, so we can render their cards immediately and let the
  // event log + counters fill in as broadcast() pushes events through.
  if (interventionRunning) {
    return (
      <div className={styles.root}>
        <DigitalTwinProgress state={state} subject={interventionRunning.subject} intervention={interventionRunning.intervention} />
      </div>
    );
  }
  const citationRegistry = useCitationContext();
  const toolRegistry = useToolContext();
  // Local fallback only used when no parent-controlled launching flag is
  // passed (legacy callers). The App now owns this state and threads it
  // through so it survives tab navigation.
  const [localLaunching, setLocalLaunching] = useState(false);
  const launching = launchingProp ?? localLaunching;

  // Constellation layout state. Default constellation when N>=3 (because
  // the existing 2-column layout literally won't fit). User can toggle
  // manually; userPickedLayoutRef sticks the manual choice through
  // mid-run actor count changes.
  const [layoutState, setLayoutState] = useState<SimLayout>(
    () => state.actorIds.length >= 3 ? 'constellation' : 'side-by-side',
  );
  const userPickedLayoutRef = useRef(false);
  const setLayoutWithOverride = useCallback((next: SimLayout) => {
    userPickedLayoutRef.current = true;
    setLayoutState(next);
  }, []);
  useEffect(() => {
    if (userPickedLayoutRef.current) return;
    if (state.actorIds.length >= 3 && layoutState === 'side-by-side') {
      setLayoutState('constellation');
    }
  }, [state.actorIds.length, layoutState]);
  const layout: SimLayout = forceLayout ?? layoutState;

  const [drillInActor, setDrillInActor] = useState<string | null>(null);
  const drillInIndex = drillInActor ? state.actorIds.indexOf(drillInActor) : 0;

  const firstId = state.actorIds[0];
  const secondId = state.actorIds[1];
  const sideA = firstId ? state.actors[firstId] : null;
  const sideB = secondId ? state.actors[secondId] : null;
  const hasEvents = Object.values(state.actors).some(s => s.events.length > 0);
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
  const presetLeaderA: LeaderInfo | null = defaultPreset?.actors?.[0]
    ? { name: defaultPreset.actors[0].name, archetype: defaultPreset.actors[0].archetype, unit: 'Colony Alpha', hexaco: defaultPreset.actors[0].hexaco, instructions: defaultPreset.actors[0].instructions, quote: '' }
    : null;
  const presetLeaderB: LeaderInfo | null = defaultPreset?.actors?.[1]
    ? { name: defaultPreset.actors[1].name, archetype: defaultPreset.actors[1].archetype, unit: 'Colony Beta', hexaco: defaultPreset.actors[1].hexaco, instructions: defaultPreset.actors[1].instructions, quote: '' }
    : null;

  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('paracosm-intro-dismissed') !== '1';
  });

  const dismissIntro = () => {
    setShowIntro(false);
    localStorage.setItem('paracosm-intro-dismissed', '1');
  };

  // Build turn-event text for the shared stats bar
  const eventA = sideA?.event;
  const crisisText = eventA
    ? `T${eventA.turn} \u2014 ${eventA.time}: ${eventA.title}`
    : '';

  const verdictPlacementFor = useMemo(() => {
    const w = verdict && typeof verdict === 'object' ? (verdict as Record<string, unknown>).winner : null;
    return (side: 'A' | 'B'): 'winner' | 'second' | 'tie' | null => {
      if (w === 'tie') return 'tie';
      if (w === side) return 'winner';
      if (w === 'A' || w === 'B') return 'second';
      return null;
    };
  }, [verdict]);

  const progressPercent = state.maxTurns > 0
    ? Math.min(100, Math.max(0, (state.turn / state.maxTurns) * 100))
    : 0;

  const handleScrollToReplayCta = useCallback(() => {
    // Prior UX tried to programmatically click the TopBar LOAD
    // dropdown. That dropdown opens at the top of the screen while
    // the user is looking at the empty state in the middle, so the
    // click registered as "nothing happened" from the user's POV.
    //
    // Instead, scroll to the WATCH A PRIOR RUN card directly below.
    const cta = document.querySelector<HTMLElement>(
      '[data-paracosm-replay-cta="true"]',
    );
    if (!cta) return;
    cta.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Flash the card border so the user's eye catches the landing
    // spot (scroll alone is easy to miss on a long empty state).
    cta.classList.add(styles.flashOn);
    window.setTimeout(() => cta.classList.remove(styles.flashOn), 1200);
  }, []);

  const handleGoToSettings = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'settings');
    window.history.replaceState({}, '', url.toString());
    window.location.reload();
  }, []);

  const columnsVisible = state.isRunning || state.isComplete || hasEvents || sseStatus === 'connected';

  return (
    <div className={styles.root}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
        <SimLayoutToggle
          layout={layout}
          actorCount={state.actorIds.length}
          onChange={setLayoutWithOverride}
        />
      </div>
      {layout === 'constellation' ? (
        <ConstellationView
          state={state}
          onActorClick={(name) => setDrillInActor(name)}
        />
      ) : (
        <>
          {/* Shared leaders row. Winner/tie/second chip on each card
              surfaces the verdict even before the user scrolls down to
              the banner card. */}
          <div className={`leaders-row ${styles.leadersRow}`}>
            <ActorBar
              actorIndex={0}
              leader={sideA?.leader || presetLeaderA}
              popHistory={sideA?.popHistory || []}
              moraleHistory={sideA?.moraleHistory || []}
              verdictPlacement={verdictPlacementFor('A')}
            />
            <ActorBar
              actorIndex={1}
              leader={sideB?.leader || presetLeaderB}
              popHistory={sideB?.popHistory || []}
              moraleHistory={sideB?.moraleHistory || []}
              verdictPlacement={verdictPlacementFor('B')}
            />
          </div>

          <StatsBar
            actors={state.actorIds.slice(0, 2).map(id => ({ id, state: state.actors[id] }))}
            crisisText={crisisText}
            toolRegistry={toolRegistry}
          />
        </>
      )}

      {/* Slim sim-progress bar. Visible while the run is active and
          hides on completion. */}
      {state.isRunning && !state.isComplete && state.maxTurns > 0 && (
        <div className={styles.progressBar}>
          <span className={styles.progressLabel}>
            Turn {Math.max(1, state.turn)} / {state.maxTurns}
          </span>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
          </div>
          <span className={styles.progressPercent}>
            {Math.round(progressPercent)}%
          </span>
        </div>
      )}

      {showIntro && (sideA?.events.length ?? 0) > 0 && <IntroBar onDismiss={dismissIntro} />}

      <DivergenceRail state={state} />

      {/* Loading state: connected but no events after 2s grace period */}
      {showLoading && !hasEvents && !state.isComplete && state.turn === 0 && (
        <div className={styles.centerState}>
          <span className={`spinner ${styles.centerStateSpinnerSmall}`} />
          <div className={styles.centerStateHeading}>Simulation starting...</div>
          <div className={styles.centerStateCopy}>
            The Event Director is reading simulation state and generating the first event. Departments will analyze and forge tools once it arrives.
          </div>
        </div>
      )}

      {/* Launching state: user clicked Run, waiting for first events */}
      {launching && !hasEvents && !state.isRunning && (
        <div className={styles.centerState}>
          <span className={`spinner ${styles.centerStateSpinnerLarge}`} />
          <div className={styles.centerStateHeadingAmber}>Launching Simulation...</div>
          <div className={styles.centerStateCopy}>
            Initializing the Event Director, departments, and agent personalities. First events will appear shortly.
          </div>
        </div>
      )}

      {/* Connecting state: SSE not yet connected, no events, show spinner */}
      {!hasEvents && !state.isComplete && !launching && sseStatus === 'connecting' && (
        <div className={styles.centerState}>
          <span className={`spinner ${styles.centerStateSpinnerSmall}`} />
          <div className={styles.centerStateHeading}>Connecting...</div>
          <div className={styles.centerStateCopy}>
            Loading simulation state from the server. If a simulation is running, events will appear shortly.
          </div>
        </div>
      )}

      {/* Empty state: connected but no events and no sim running */}
      {!state.isRunning && !state.isComplete && !hasEvents && sseStatus === 'connected' && !launching && (
        <div className={styles.centerState}>
          <div className={styles.centerStateHeadingLarger}>No simulation running</div>
          <div className={styles.centerStateCopyWide}>
            Configure two commanders with different HEXACO personality profiles, choose a scenario, and launch from the Settings tab. Or load a previously saved simulation.
          </div>
          <div className={styles.emptyStateActions}>
            {onRun && (
              <button
                onClick={handleRun}
                disabled={launching}
                className={styles.buttonRun}
              >
                {launching ? 'Launching…' : 'Run Simulation'}
              </button>
            )}
            <button onClick={handleScrollToReplayCta} className={styles.buttonLoad}>
              Load Prior Run
            </button>
            <button onClick={handleGoToSettings} className={styles.buttonSettings}>
              Settings
            </button>
          </div>
          {onTour && (
            <div className={styles.tourHint}>
              First time here?{' '}
              <button type="button" onClick={onTour} className={styles.tourLink}>
                Take the guided tour →
              </button>
              <span className={styles.tourAside}>(canned demo, no LLM cost)</span>
            </div>
          )}
          {/* Surface saved-run replays right in the empty state so users
              who land on SIM without a running simulation can start
              watching a prior run with one click. */}
          <div
            data-paracosm-replay-cta="true"
            className={`${styles.replayCtaWrap} ${styles.flashCard}`}
          >
            <LoadPriorRunsCTA />
          </div>
        </div>
      )}

      {/* Two columns (only show when there are events or sim is running) */}
      <div className={`sim-columns ${styles.simColumns} ${columnsVisible ? '' : styles.simColumnsHidden}`}>
        {sideA && <LeaderColumn actorIndex={0} sideState={sideA} state={state} />}
        {sideB && <LeaderColumn actorIndex={1} sideState={sideB} state={state} />}
      </div>

      {/* Verdict surfaces as a global top banner (App.tsx) and inline
          on the Reports tab. */}

      {/* Timeline at bottom — gets the full vertical room now that
          References / Toolbox have moved out of the inline column flow. */}
      <Timeline state={state} />

      {/* End-of-sim evidence bar: small pills that open References and
          Forged Toolbox in modals. */}
      <SimFooterBar citationRegistry={citationRegistry} toolRegistry={toolRegistry} />

      {/* Re-run-with-seed+1 epilogue. Extracted to its own file in F4
          batch 2 to satisfy audit finding F8 (modular concerns). */}
      <RerunPanel enabled={state.isComplete && !state.isRunning} />

      {/* Drill-in modal for Constellation node clicks. Renders nothing
          when actorName is null. */}
      <ActorDrillInModal
        actorName={drillInActor}
        actorIndex={drillInIndex >= 0 ? drillInIndex : 0}
        state={state}
        onClose={() => setDrillInActor(null)}
      />
    </div>
  );
}
