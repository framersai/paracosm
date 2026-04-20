import { useState, useCallback, useEffect, useRef, createContext, useContext, Component, type ReactNode, type ErrorInfo } from 'react';
import { ThemeProvider } from './theme/ThemeProvider';
import { useScenario, type ScenarioClientPayload } from './hooks/useScenario';
import { useSSE } from './hooks/useSSE';
import { useGameState } from './hooks/useGameState';
import { useGamePersistence } from './hooks/useGamePersistence';
import { useCitationRegistry, CitationRegistryContext } from './hooks/useCitationRegistry';
import { useToolRegistry, ToolRegistryContext } from './hooks/useToolRegistry';
import { useFocusTrap } from './hooks/useFocusTrap';
import { TopBar } from './components/layout/TopBar';
import { TabBar } from './components/layout/TabBar';
import { ProviderErrorBanner } from './components/layout/ProviderErrorBanner';
// Toolbar merged into TopBar
import { SimView } from './components/sim/SimView';
import { VerdictDetails } from './components/sim/VerdictCard';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { ReportView } from './components/reports/ReportView';
import { ChatPanel } from './components/chat/ChatPanel';
import { SwarmViz } from './components/viz/SwarmViz';
// AboutPage consolidated into landing page at /
import { Footer } from './components/layout/Footer';
import { ToastProvider, useToast } from './components/shared/Toast';
import { ShortcutsOverlay } from './components/shared/ShortcutsOverlay';
import { Analytics } from './components/shared/Analytics';
import { GuidedTour } from './components/tour/GuidedTour';
import { DEMO_EVENTS } from './components/tour/demoData';
import {
  createDashboardTabHref,
  getDashboardTabFromHref,
  type DashboardTab,
} from './tab-routing';

// Scenario context available to all components
const ScenarioContext = createContext<ScenarioClientPayload | null>(null);
export function useScenarioContext() {
  const ctx = useContext(ScenarioContext);
  if (!ctx) throw new Error('useScenarioContext must be used within App');
  return ctx;
}

const DashboardNavigationContext = createContext<((tab: Exclude<DashboardTab, 'about'>) => void) | null>(null);
export function useDashboardNavigation() {
  const ctx = useContext(DashboardNavigationContext);
  if (!ctx) throw new Error('useDashboardNavigation must be used within App');
  return ctx;
}

/**
 * Decide whether a generic sim-error toast should be suppressed because
 * the persistent provider-error banner already describes the same issue.
 *
 * Quota / auth exhaustion can produce multiple sim_error SSE events as
 * downstream calls reject after the banner already fired. Without this
 * filter, users saw one banner plus 5-10 red "Simulation Error" toasts
 * for the same underlying problem.
 */
function isRedundantProviderErrorToast(
  errMessage: string,
  bannerKind: 'quota' | 'auth' | 'rate_limit' | 'network' | 'unknown',
): boolean {
  const lower = errMessage.toLowerCase();
  // Signals that the toast text is about a provider/HTTP failure. If it
  // matches ANY of these AND the banner is one of the terminal kinds,
  // suppress — otherwise let it through (could be a real unrelated bug).
  const isProviderShaped =
    /\b(401|402|403|429|500|502|503|504)\b/.test(errMessage) ||
    lower.includes('exceeded your current quota') ||
    lower.includes('insufficient_quota') ||
    lower.includes('credit_balance_too_low') ||
    lower.includes('quota_exceeded') ||
    lower.includes('rate_limit') ||
    lower.includes('rate limit') ||
    lower.includes('overloaded_error') ||
    lower.includes('invalid_api_key') ||
    lower.includes('authentication_error') ||
    lower.includes('too many requests') ||
    lower.includes('api key') ||
    lower.includes('provider error') ||
    lower.includes('openai') ||
    lower.includes('anthropic');
  const bannerCoversIt = bannerKind === 'quota' || bannerKind === 'auth' || bannerKind === 'rate_limit';
  return isProviderShaped && bannerCoversIt;
}

/**
 * Read the `?replay=<id>` query param. Used to switch the SSE source
 * from the live /events feed to /sessions/:id/replay so the dashboard
 * can show a stored sim instead of triggering a new one. Re-runs on
 * popstate so back/forward navigation toggles replay mode without a
 * full page reload.
 */
function useReplaySessionId(): string | null {
  const [id, setId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('replay');
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setId(new URLSearchParams(window.location.search).get('replay'));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  return id;
}

function AppContent() {
  const { scenario } = useScenario();
  const replaySessionId = useReplaySessionId();
  const sse = useSSE({ replaySessionId });
  const [tourActive, setTourActive] = useState(false);

  // Global verdict banner. Closable by the user; dismissal is keyed
  // to the verdict's headline so a fresh run with a new verdict
  // re-shows the banner even after the previous one was dismissed.
  const [verdictDismissedKey, setVerdictDismissedKey] = useState<string | null>(null);
  const [verdictModalOpen, setVerdictModalOpen] = useState(false);

  // Escape closes the verdict modal. All other dashboard modals
  // (CostBreakdown, ShortcutsOverlay, ToolDetail, VerdictCard inline
  // modal) already have the same handler; this keeps keyboard
  // dismissal consistent across every overlay.
  useEffect(() => {
    if (!verdictModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setVerdictModalOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [verdictModalOpen]);
  const verdictDialogRef = useFocusTrap<HTMLDivElement>(verdictModalOpen);

  // Dynamic page title
  useEffect(() => {
    document.title = `${scenario.labels.name} \u2014 Paracosm`;
  }, [scenario.labels.name]);

  // Event Log auto-scroll. Stays pinned to the bottom as new SSE
  // events stream in so the user sees the latest frame without manual
  // scrolling, but releases the pin the moment the user scrolls up
  // (so they can read an older event without being yanked back down).
  const logScrollRef = useRef<HTMLDivElement>(null);
  const logPinnedRef = useRef(true);
  const onLogScroll = useCallback(() => {
    const el = logScrollRef.current;
    if (!el) return;
    // Anything within 40px of the bottom counts as pinned. Covers
    // rounding slop and the details element expanding under the
    // caret after a click.
    logPinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  // When tour is active, use demo events; otherwise use live SSE events
  const effectiveEvents = tourActive ? DEMO_EVENTS : sse.events;
  const effectiveComplete = tourActive ? true : sse.isComplete;
  const gameState = useGameState(effectiveEvents, effectiveComplete);

  // Whenever a new event lands and the user is still pinned to the
  // bottom of the log, scroll it down. If the log tab is not mounted
  // the ref is null and this is a no-op.
  useEffect(() => {
    if (!logPinnedRef.current) return;
    const el = logScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [effectiveEvents.length]);

  // ── Forge result toasts ─────────────────────────────────────────
  // Surface every forge_attempt as a toast so users see WHICH tool
  // was attempted, whether the judge approved or rejected it, and the
  // judge's reasoning. Without this, forge events are visible only in
  // the dense viz / event log and users miss the reliability signal.
  //
  // Dedup via sessionStorage (keyed per forge) so a page reload in
  // the same tab does NOT replay every historical forge as a fresh
  // toast — which was the user-reported bug where reloading a
  // completed run produced a pile of "Judge approved" toasts for
  // tools forged hours ago. sessionStorage survives reloads but
  // clears when the tab closes, which is the right scope: forges
  // seen in this tab session shouldn't re-toast; forges from a
  // different tab session are fresh from the user's POV.
  //
  // Additionally gated on `sse.replayDone`: the SSE `replay_done`
  // event fires after the server finishes streaming buffered events.
  // Anything added before that flag flips is historical; we seed
  // those into seen-set without toasting. Only forges that arrive
  // after replay_done get a toast.
  const forgeSeenStorageKey = 'paracosm:seenForgeToasts';
  const readSeenForges = useCallback((): Set<string> => {
    try {
      const raw = sessionStorage.getItem(forgeSeenStorageKey);
      if (!raw) return new Set();
      return new Set(JSON.parse(raw) as string[]);
    } catch {
      return new Set();
    }
  }, []);
  const writeSeenForges = useCallback((s: Set<string>) => {
    try {
      sessionStorage.setItem(forgeSeenStorageKey, JSON.stringify([...s].slice(-500)));
    } catch {
      /* silent */
    }
  }, []);
  // `toast` must be declared before the effect below: reading it from
  // the dep array on first render would throw TDZ ("Cannot access 'toast'
  // before initialization") if the const sat below the useEffect.
  const { toast } = useToast();
  useEffect(() => {
    const forgeKey = (ev: typeof effectiveEvents[number]): string => {
      const d = ev.data as Record<string, unknown>;
      return `${ev.leader || ''}|${d?.name || ''}|${d?.timestamp || ''}|${d?.approved}`;
    };
    const seen = readSeenForges();
    // While the server is still replaying the buffered events, treat
    // everything as historical — seed the seen-set silently. After
    // replayDone flips true, only NEW events (those not in
    // sessionStorage from a prior tab visit) get toasts.
    const replayDone = tourActive ? true : sse.replayDone;
    for (const ev of effectiveEvents) {
      if (ev.type !== 'forge_attempt') continue;
      const key = forgeKey(ev);
      if (seen.has(key)) continue;
      if (!replayDone) {
        seen.add(key);
        continue;
      }
      seen.add(key);
      const d = ev.data as Record<string, unknown>;
      const name = String(d?.name || 'unnamed tool');
      const dept = String(d?.department || ev.leader || '').toUpperCase();
      const approved = d?.approved === true;
      const confidence = typeof d?.confidence === 'number' ? d.confidence : null;
      const reason = String(d?.errorReason || '').slice(0, 220);
      if (approved) {
        const confStr = confidence != null ? ` · conf ${confidence.toFixed(2)}` : '';
        toast(
          'success',
          `${dept ? `${dept} · ` : ''}forged ${name}`,
          `Judge approved${confStr}`,
        );
      } else {
        toast(
          'error',
          `${dept ? `${dept} · ` : ''}rejected ${name}`,
          reason || 'Judge rejected (no reason provided)',
        );
      }
    }
    writeSeenForges(seen);
  }, [effectiveEvents, toast, sse.replayDone, tourActive, readSeenForges, writeSeenForges]);
  const citationRegistry = useCitationRegistry(gameState);
  const toolRegistry = useToolRegistry(gameState);
  const persistence = useGamePersistence(scenario.labels.shortName);
  const [activeTab, setActiveTabState] = useState<DashboardTab>(() => getDashboardTabFromHref(window.location.href));
  const setActiveTab = useCallback((tab: DashboardTab) => {
    if (tab === 'about') {
      window.location.href = '/';
      return;
    }
    setActiveTabState(tab);
    window.history.replaceState({}, '', createDashboardTabHref(window.location.href, tab));
  }, []);

  const handleSave = useCallback(() => {
    // Include verdict in the export so reload restores the end-of-sim
    // judgment (previously dropped — saves looked incomplete on load).
    persistence.save(sse.events, sse.results, sse.verdict);
    toast('success', 'Saved', `${sse.events.length} events${sse.verdict ? ' + verdict' : ''} saved to file.`);
  }, [sse.events, sse.results, sse.verdict, persistence, toast]);

  const handleLoad = useCallback(async () => {
    const data = await persistence.load();
    if (data) {
      sse.loadEvents(data.events, data.results, data.verdict ?? null);
      toast('info', 'Loaded', `${data.events.length} events loaded.`);
      setActiveTab('sim');
    } else {
      toast('error', 'Load Failed', 'No valid game data found in file.');
    }
  }, [persistence, toast, sse]);

  const handleClear = useCallback(() => {
    if (!confirm('Clear all simulation data? This cannot be undone.')) return;
    persistence.clearCache();
    sse.reset();
    toast('info', 'Cleared', 'Simulation data cleared.');
    setActiveTab('settings');
  }, [persistence, sse, toast]);

  // Local dismiss flag for the provider-error banner. Lives outside useSSE
  // so dismissing hides the current banner without clearing the underlying
  // sse.providerError state (which stays available to programmatic readers
  // and any later "why did my run fail?" logic). Reset when the error
  // resolves (e.g. key fixed, sim re-run successfully).
  const [bannerDismissed, setBannerDismissed] = useState(false);
  useEffect(() => {
    // If the error state clears (sim reset), also clear the dismiss flag
    // so the banner reappears on a fresh problem.
    if (!sse.providerError) setBannerDismissed(false);
  }, [sse.providerError]);

  // Show simulation errors as toasts — but suppress toasts that are
  // already covered by the persistent provider-error banner. Quota /
  // auth exhaustion fires ONE banner but CAN emit follow-up generic
  // sim_error messages (e.g. when a leader's run promise eventually
  // rejects after provider_error fired). Without dedup, users saw the
  // banner AND a flurry of "Simulation Error: 429 ... exceeded your
  // current quota" toasts for the same underlying issue, which they
  // correctly read as spam.
  //
  // Heuristic: if the banner is active, silently swallow any toast
  // whose text clearly describes the same class of failure (quota,
  // auth, rate-limit, or provider/HTTP wording). Real non-provider
  // errors (validation, runtime JS errors) still toast through.
  const lastErrorCount = useRef(0);
  useEffect(() => {
    if (sse.errors.length <= lastErrorCount.current) return;
    const newErrors = sse.errors.slice(lastErrorCount.current);
    lastErrorCount.current = sse.errors.length;
    const banner = sse.providerError;
    for (const err of newErrors) {
      if (banner && isRedundantProviderErrorToast(err, banner.kind)) {
        // Skip — the sticky banner already tells the user about this.
        continue;
      }
      const short = err.length > 120 ? err.slice(0, 120) + '...' : err;
      toast('error', 'Simulation Error', short);
    }
  }, [sse.errors, sse.providerError, toast]);

  // Narrative event/outcome toasts were removed. Event titles, descriptions,
  // and per-leader outcome verdicts are already shown in the sim flow column
  // and the stats bar. Surfacing them again as transient pop-ups produced
  // walls of jargon ("Safe Success", "Safe Failure") and narrative text
  // that read as alerts but carried no actionable signal. Toasts are now
  // reserved for operational UX only: save, load, clear, copy, launch,
  // launch-stalled, rate-limited, and simulation errors. The server's
  // `replay_done` SSE marker stays in place for future transient UX.

  const handleTourStart = useCallback(() => {
    setTourActive(true);
    setActiveTab('sim');
  }, [setActiveTab]);

  // Chat handoff from the VIZ drilldown. Sets the URL hash so
  // ChatPanel can read it on mount or on hashchange, then switches
  // tabs. Hash survives the tab switch so preselection works even
  // though ChatPanel re-renders when the chat tab becomes active.
  const navigateToChat = useCallback((colonistName: string) => {
    window.location.hash = `chat=${encodeURIComponent(colonistName)}`;
    setActiveTab('chat');
  }, [setActiveTab]);

  const handleTourEnd = useCallback(() => {
    setTourActive(false);
    setActiveTab('sim');
  }, [setActiveTab]);

  const handleCopySummary = useCallback(() => {
    const a = gameState.a;
    const b = gameState.b;
    const nameA = a.leader?.name || 'Leader A';
    const nameB = b.leader?.name || 'Leader B';
    const archA = a.leader?.archetype || '';
    const archB = b.leader?.archetype || '';
    const colA = a.leader?.colony || '';
    const colB = b.leader?.colony || '';

    const lines: string[] = [
      `## ${scenario.labels.name} — Simulation Report`,
      `**Turns**: ${gameState.turn}/${gameState.maxTurns} | **Seed**: ${gameState.seed} | **Year**: ${gameState.year}`,
      '',
      `### ${nameA}${archA ? ` (${archA})` : ''}`,
      `Colony: ${colA} | Pop: ${a.colony?.population ?? '?'} | Morale: ${a.colony ? Math.round(a.colony.morale * 100) : '?'}% | Deaths: ${a.deaths}`,
      `Tools forged: ${a.tools} | Citations: ${a.citations} | Decisions: ${a.decisions}`,
      '',
      `### ${nameB}${archB ? ` (${archB})` : ''}`,
      `Colony: ${colB} | Pop: ${b.colony?.population ?? '?'} | Morale: ${b.colony ? Math.round(b.colony.morale * 100) : '?'}% | Deaths: ${b.deaths}`,
      `Tools forged: ${b.tools} | Citations: ${b.citations} | Decisions: ${b.decisions}`,
    ];

    if (a.crisis && b.crisis && a.crisis.turn === b.crisis.turn) {
      lines.push('', '### Key Divergence');
      lines.push(`Same crisis "${a.crisis.title}" at T${a.crisis.turn}.`);
    }

    lines.push('', `Generated by Paracosm (paracosm.sh)`);

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      toast('success', 'Copied', 'Simulation summary copied to clipboard.');
    }).catch(() => {
      toast('error', 'Copy Failed', 'Clipboard access denied.');
    });
  }, [gameState, scenario, toast]);

  // App-level "launching" state: persists across tab navigation so the
  // user can submit /setup, switch to viz/chat/etc., come back to sim,
  // and still see the spinner instead of the empty-state Run button.
  // Local SimView state was being lost on unmount, which made the user
  // think nothing happened and click Run again.
  const [launching, setLaunching] = useState(false);

  // Accumulator for /chat turn cost + tokens. Folded into the Footer's
  // `cost` prop so users see the real run-plus-chat total spend. Prior
  // behaviour: footer only counted simulation cost, chat turns billed
  // invisibly. Reset to zero whenever the sim event list empties —
  // that is the canonical "fresh session" signal (both handleClear and
  // fresh-mount routes through it).
  const [chatUsage, setChatUsage] = useState<{ totalTokens: number; costUSD: number; calls: number }>({
    totalTokens: 0,
    costUSD: 0,
    calls: 0,
  });
  const handleChatUsage = useCallback((usage: { totalTokens: number; costUSD: number }) => {
    setChatUsage(prev => ({
      totalTokens: prev.totalTokens + (usage.totalTokens || 0),
      costUSD: Math.round((prev.costUSD + (usage.costUSD || 0)) * 10000) / 10000,
      calls: prev.calls + 1,
    }));
  }, []);
  // Zero the chat-usage accumulator when the sim is cleared. Detecting
  // a clear via events.length going to zero keeps this decoupled from
  // the specific handleClear implementation — if Clear gains new side
  // effects or a new code path empties the buffer, chatUsage still
  // resets correctly without additional wiring.
  const prevEventsLenRef = useRef(sse.events.length);
  useEffect(() => {
    const prev = prevEventsLenRef.current;
    const curr = sse.events.length;
    prevEventsLenRef.current = curr;
    if (prev > 0 && curr === 0) {
      setChatUsage({ totalTokens: 0, costUSD: 0, calls: 0 });
    }
  }, [sse.events.length]);

  // Auto-clear launching once the sim actually starts running, is
  // complete, or the connection errored. Earlier this cleared on any
  // SSE event arriving, but the server broadcasts a `status
  // phase='starting'` event before anything else, and that event does
  // NOT flip gameState.isRunning. With the old logic, launching cleared
  // the moment that first status event landed, then SimView's empty-
  // state condition (!launching && !isRunning) flashed "No simulation
  // running" for the multiple seconds of Turn 0 dept promotions before
  // the `parallel` status or first leader event arrived. Gating on
  // gameState.isRunning instead closes that gap: the Launching spinner
  // hands off directly to the Waiting-for-first-turn spinner inside
  // SimView (`state.isRunning && !hasEvents`), with no empty-state
  // flash in between.
  useEffect(() => {
    if (!launching) return;
    if (gameState.isRunning || sse.isComplete || sse.status === 'error') {
      setLaunching(false);
    }
  }, [launching, gameState.isRunning, sse.isComplete, sse.status]);

  // End-of-sim toast: fire exactly once when the run transitions to a
  // terminal state. Distinguishes Complete (all turns finished, verdict
  // broadcast) from Unfinished (user left, disconnect watchdog aborted
  // the run). Skipped during tour mode where isComplete is synthetic.
  //
  // Dedup across remounts via sessionStorage: the dashboard SPA fully
  // reloads when the user clicks the About link (it jumps to /) and
  // a fresh mount on return would otherwise re-fire this toast for
  // the same terminal state the user already saw. Keyed on a stable
  // fingerprint so a new run can still toast its own terminal event
  // without the prior run's fingerprint blocking it.
  useEffect(() => {
    if (tourActive) return;
    if (!sse.isComplete && !sse.isAborted) return;
    // Only toast terminal events that happen LIVE — i.e. the
    // replayDone flag has already flipped so we're past buffer
    // replay. Terminal states observed before replay_done are
    // historical (user is viewing a completed run, not watching it
    // finish), and firing a toast for them reads as spam. Mirrors
    // the forge-toast gate.
    if (!sse.replayDone) return;
    const fingerprint = sse.isAborted
      ? `aborted:${sse.abortReason?.reason ?? 'unknown'}:${sse.abortReason?.leader ?? ''}:${sse.abortReason?.turn ?? ''}`
      : `complete:${sse.results.length}:${sse.verdict ? 'v' : 'nv'}`;
    const storageKey = 'paracosm:terminalToastFingerprint';
    try {
      if (sessionStorage.getItem(storageKey) === fingerprint) return;
      sessionStorage.setItem(storageKey, fingerprint);
    } catch {
      /* silent — fall through and toast once per mount */
    }
    if (sse.isAborted) {
      toast('info', 'Simulation ended early', 'Partial results saved. Reload to resume from the abort point.');
    } else {
      toast('success', 'Simulation complete', 'Open the Reports tab for the verdict + full breakdown.');
    }
  }, [
    sse.isComplete,
    sse.isAborted,
    sse.abortReason,
    sse.results.length,
    sse.verdict,
    sse.replayDone,
    tourActive,
    toast,
  ]);

  // Local cache fallback: write completed runs to localStorage keyed
  // by scenario shortName so the LOAD menu can surface them even when
  // the server-side /sessions save was skipped (e.g. hosted container
  // lost the SQLite volume, or the run took a path that tripped one
  // of autoSaveOnComplete's guards). Dedup via the same fingerprint
  // the terminal-toast effect uses so a remount doesn't rewrite the
  // same data; bounded by the scenarioShortName key so switching
  // scenarios doesn't trample prior scenario caches.
  useEffect(() => {
    if (tourActive) return;
    if (!sse.isComplete) return;
    if (sse.events.length === 0) return;
    const fingerprint = `cached:${scenario.labels.shortName}:${sse.events.length}:${sse.isAborted ? 'a' : 'c'}`;
    const storageKey = 'paracosm:lastCachedRunFingerprint';
    try {
      if (sessionStorage.getItem(storageKey) === fingerprint) return;
      sessionStorage.setItem(storageKey, fingerprint);
    } catch {
      /* silent */
    }
    persistence.cacheEvents(sse.events, sse.results);
  }, [
    sse.isComplete,
    sse.isAborted,
    sse.events,
    sse.results,
    scenario.labels.shortName,
    persistence,
    tourActive,
  ]);

  // Surface the server's sim_saved outcome. Toast success with the
  // saved id (so users can see the run landed in the ring) and
  // errors with a concrete reason so a failed save doesn't look
  // indistinguishable from a silent skip. Dedup via sessionStorage
  // keyed on the status+id so returning to the tab after a full page
  // reload doesn't re-toast the same saved run.
  useEffect(() => {
    if (tourActive) return;
    const savedEvent = sse.events.find((e) => e.type === 'sim_saved');
    if (!savedEvent) return;
    const d = (savedEvent.data ?? {}) as Record<string, unknown>;
    const status = String(d.status ?? 'unknown');
    const fingerprint = `sim_saved:${status}:${d.id ?? ''}:${d.reason ?? ''}`;
    const storageKey = 'paracosm:simSavedToastFingerprint';
    try {
      if (sessionStorage.getItem(storageKey) === fingerprint) return;
      sessionStorage.setItem(storageKey, fingerprint);
    } catch {
      /* silent */
    }
    if (status === 'saved') {
      const id = typeof d.id === 'string' ? d.id.slice(0, 8) : 'run';
      toast('success', 'Saved to cache', `Run ${id}… stored. Open LOAD to replay.`);
    } else if (status === 'failed') {
      toast('error', 'Cache save failed', String(d.error ?? 'Unknown error'));
    } else if (status === 'skipped') {
      const reason = String(d.reason ?? 'unknown');
      // Only toast skips the user would want to know about. "below min
      // turns" is an expected state for aborted-too-early runs; silence it.
      if (reason !== 'below_min_turns') {
        toast('info', 'Not cached', `Skipped: ${reason.replace(/_/g, ' ')}.`);
      }
    }
  }, [sse.events, tourActive, toast]);

  // Safety timeout: if /setup succeeded but no events arrived in 30s,
  // give up on the spinner. Only toast when we really saw nothing —
  // if SSE events arrived, the sim is alive and the user does not
  // need a "Launch Stalled" message scaring them while they watch
  // events stream in.
  useEffect(() => {
    if (!launching) return;
    const timer = setTimeout(() => {
      setLaunching(false);
      const hasSignal = sse.events.length > 0 || gameState.isRunning || sse.isComplete;
      if (!hasSignal) {
        toast('error', 'Launch Stalled', 'No events received within 30 seconds. The simulation may still complete in the background.');
      }
    }, 30_000);
    return () => clearTimeout(timer);
  }, [launching, toast, sse.events.length, sse.isComplete, gameState.isRunning]);

  const handleRun = useCallback(async () => {
    // Guard against double-fire. The RUN button is also hidden
    // visually when launching / isRunning (TopBar + SimView both
    // check the flags) but a fast-click on the empty-state button
    // between render ticks, or a kbd shortcut, could still slip
    // through. An early return here is the authoritative gate.
    if (launching || gameState.isRunning) {
      toast('info', 'Already running', 'A simulation is in progress — wait for it to finish or hit Clear to reset.');
      return;
    }
    const defaultPreset = scenario.presets.find(p => p.id === 'default');
    const leaders = defaultPreset?.leaders?.slice(0, 2).map((l, i) => ({
      ...l,
      colony: i === 0 ? 'Colony Alpha' : 'Colony Beta',
    })) || [
      { name: 'Leader A', archetype: 'The Visionary', colony: 'Colony Alpha', hexaco: { openness: 0.95, conscientiousness: 0.35, extraversion: 0.85, agreeableness: 0.55, emotionality: 0.3, honestyHumility: 0.65 }, instructions: '' },
      { name: 'Leader B', archetype: 'The Engineer', colony: 'Colony Beta', hexaco: { openness: 0.25, conscientiousness: 0.97, extraversion: 0.3, agreeableness: 0.6, emotionality: 0.7, honestyHumility: 0.9 }, instructions: '' },
    ];
    try {
      setLaunching(true);
      // Clear prior-run state on the client before launching a new sim.
      // handleClear does this via sse.reset() but Run previously did not,
      // so a user who loaded a completed run from cache and then hit Run
      // saw the new sim's events append to the stale history. reset()
      // also posts /clear to the server; the server's /setup handler
      // would clear its buffer again anyway, but a redundant clear is
      // cheap and unambiguous.
      sse.reset();
      // Switch to the sim tab immediately so the user sees the launching
      // spinner there (the Run button on the empty state still works
      // from any tab via the topbar).
      setActiveTab('sim');
      toast('info', 'Launching', 'Starting simulation with default settings...');
      const res = await fetch('/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaders,
          provider: 'openai',
          turns: scenario.setup.defaultTurns,
          yearsPerTurn: scenario.setup.defaultYearsPerTurn,
          seed: scenario.setup.defaultSeed,
          startYear: scenario.setup.defaultStartYear,
          population: scenario.setup.defaultPopulation,
          activeDepartments: scenario.departments.map(d => d.id),
        }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setLaunching(false);
        toast('error', 'Rate Limited', data.error || 'Too many simulations');
      } else if (!data.redirect) {
        setLaunching(false);
        toast('error', 'Launch Failed', data.error || 'Unknown error');
      }
      // Success path: leave launching=true; the effect above clears it
      // when the first SSE event arrives.
    } catch (err) {
      setLaunching(false);
      toast('error', 'Launch Failed', String(err));
    }
  }, [scenario, toast, setActiveTab, launching, gameState.isRunning, sse]);

  return (
    <DashboardNavigationContext.Provider value={setActiveTab}>
      <ScenarioContext.Provider value={scenario}>
       <CitationRegistryContext.Provider value={citationRegistry}>
        <ToolRegistryContext.Provider value={toolRegistry}>
        <div className="flex flex-col h-screen w-screen overflow-hidden scanline-overlay" style={{ background: 'var(--bg-deep)', color: 'var(--text-1)' }}>
          {sse.providerError && !bannerDismissed ? (
            <ProviderErrorBanner
              providerError={sse.providerError}
              onDismiss={() => setBannerDismissed(true)}
            />
          ) : null}
          {replaySessionId && sse.status === 'replay_not_found' ? (
            <div
              role="alert"
              style={{
                background: 'rgba(196, 74, 30, 0.15)',
                color: 'var(--text-1)',
                padding: '12px 16px',
                fontFamily: 'var(--mono)',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                borderBottom: '1px solid var(--rust)',
              }}
            >
              <span>
                <strong style={{ color: 'var(--rust)' }}>REPLAY NOT FOUND</strong>{' '}
                · The saved run <code>{replaySessionId}</code> no longer exists. It may have been evicted from the 10-run cache, or the URL was mistyped.
              </span>
              <button
                type="button"
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.delete('replay');
                  window.history.replaceState({}, '', url.toString());
                  window.location.reload();
                }}
                style={{
                  background: 'var(--bg-card)',
                  color: 'var(--text-1)',
                  border: '1px solid var(--border)',
                  padding: '6px 14px',
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                }}
              >
                ← Back to live mode
              </button>
            </div>
          ) : null}
          {replaySessionId && sse.status !== 'replay_not_found' ? (
            <div
              role="status"
              style={{
                background: 'var(--accent)',
                color: 'var(--bg-deep)',
                padding: '8px 16px',
                fontFamily: 'var(--mono)',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span>
                <strong>REPLAYING SAVED DEMO</strong> · stored event stream, no LLM calls
              </span>
              <button
                type="button"
                onClick={() => {
                  // Drop the ?replay= query, return to live mode. Preserves
                  // the rest of the URL (tab, etc) so users return to where
                  // they were — popstate handler in useReplaySessionId
                  // re-reads the param and useSSE re-subscribes to /events.
                  const url = new URL(window.location.href);
                  url.searchParams.delete('replay');
                  window.history.pushState({}, '', url.toString());
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                style={{
                  padding: '4px 10px',
                  background: 'transparent',
                  border: '1px solid var(--bg-deep)',
                  color: 'var(--bg-deep)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                EXIT REPLAY
              </button>
            </div>
          ) : null}
          <TopBar scenario={scenario} sse={sse} gameState={gameState} onSave={handleSave} onLoad={handleLoad} onClear={handleClear} onRun={handleRun} onTour={handleTourStart} onCopy={handleCopySummary} launching={launching} />
          <TabBar active={activeTab} onTabChange={setActiveTab} scenario={scenario} />
          {/* Global verdict banner. Visible on every tab as soon as the
              verdict LLM returns, closable per-verdict (a new run's
              headline re-shows the banner even after dismissal). Click
              the middle strip to open the full breakdown modal. */}
          {(() => {
            const vraw = sse.verdict as Record<string, unknown> | null;
            if (!vraw || !vraw.winner) return null;
            const headline = String(vraw.headline || '');
            const winnerKey = `${vraw.winner}|${headline}`;
            if (verdictDismissedKey === winnerKey) return null;
            const winner = vraw.winner as 'A' | 'B' | 'tie';
            const winColor = winner === 'A' ? 'var(--vis)' : winner === 'B' ? 'var(--eng)' : 'var(--amber)';
            const winnerLabel = winner === 'tie'
              ? 'Tie'
              : `${String(vraw.winnerName || 'Winner')} wins`;
            const turnLabel = `Turn ${gameState.turn}/${gameState.maxTurns} · verdict by gpt-4o`;
            return (
              <div
                role="region"
                aria-label="Simulation verdict"
                style={{
                  margin: '8px 16px 4px',
                  padding: '14px 18px',
                  background: `linear-gradient(135deg, ${winColor}22 0%, var(--bg-panel) 55%, var(--bg-panel) 100%)`,
                  border: `1px solid ${winColor}`,
                  borderLeft: `4px solid ${winColor}`,
                  borderRadius: 8,
                  boxShadow: `0 6px 22px rgba(0, 0, 0, 0.35), 0 0 0 1px ${winColor}33 inset`,
                  fontFamily: 'var(--sans)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  animation: 'fadeUp 0.28s ease-out',
                }}
              >
                <div style={{ flex: '0 0 auto', minWidth: 0 }}>
                  <div style={{
                    fontSize: 9, fontWeight: 800, color: 'var(--text-3)',
                    letterSpacing: '0.15em', textTransform: 'uppercase',
                    fontFamily: 'var(--mono)', marginBottom: 3,
                  }}>
                    ★ Run Complete
                  </div>
                  <div style={{
                    fontSize: 20, fontWeight: 800, color: winColor,
                    lineHeight: 1.1, letterSpacing: '0.01em',
                    whiteSpace: 'nowrap',
                  }}>
                    {winnerLabel}
                  </div>
                </div>
                <div style={{
                  flex: 1, minWidth: 0,
                  borderLeft: `1px solid ${winColor}55`,
                  paddingLeft: 16,
                }}>
                  <button
                    onClick={() => setVerdictModalOpen(true)}
                    style={{
                      background: 'transparent', border: 'none', padding: 0, margin: 0,
                      fontSize: 13, color: 'var(--text-1)', cursor: 'pointer',
                      textAlign: 'left', lineHeight: 1.4, fontFamily: 'var(--sans)',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      overflow: 'hidden', marginBottom: 4, width: '100%',
                    }}
                    title="Click to open the full verdict breakdown"
                  >
                    {headline || 'Verdict delivered — click to see full breakdown.'}
                  </button>
                  <div style={{
                    fontSize: 10, color: 'var(--text-3)',
                    fontFamily: 'var(--mono)', letterSpacing: '0.04em',
                  }}>
                    {turnLabel}
                  </div>
                </div>
                <button
                  onClick={() => setVerdictModalOpen(true)}
                  style={{
                    fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 800,
                    color: 'var(--bg-deep)', background: winColor,
                    letterSpacing: '0.08em',
                    padding: '8px 16px', borderRadius: 4,
                    border: 'none', cursor: 'pointer',
                    whiteSpace: 'nowrap', flexShrink: 0,
                    boxShadow: `0 2px 8px ${winColor}66`,
                    textTransform: 'uppercase',
                  }}
                >
                  View Full Verdict →
                </button>
                <button
                  onClick={() => setActiveTab('reports')}
                  style={{
                    fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
                    color: 'var(--text-2)', letterSpacing: '0.06em',
                    padding: '7px 12px', borderRadius: 4,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                    textTransform: 'uppercase',
                  }}
                  title="Open the Reports tab for the full run breakdown"
                >
                  Reports
                </button>
                <button
                  onClick={() => setVerdictDismissedKey(winnerKey)}
                  aria-label="Dismiss verdict banner"
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-3)',
                    cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            );
          })()}

          <main id="main-content" className="flex-1 overflow-hidden" role="main" aria-label={`${activeTab} view`} style={{ background: 'var(--bg-deep)', display: 'flex', flexDirection: 'column' }}>
            {activeTab === 'sim' && <SimView state={gameState} sseStatus={sse.status} onRun={handleRun} onTour={handleTourStart} verdict={sse.verdict} launching={launching} />}

            {activeTab === 'viz' && <SwarmViz state={gameState} onNavigateToChat={navigateToChat} />}

            {activeTab === 'settings' && <SettingsPanel />}

            {activeTab === 'reports' && <ReportView state={gameState} verdict={sse.verdict} reportSections={scenario.ui.reportSections} />}

            {/* ChatPanel stays mounted across tab switches so per-agent
                message threads survive when the user jumps to Sim / Reports
                / Viz and comes back. ChatPanel owns the `threads` Map in
                local state; unmounting on tab change dropped every
                conversation the moment the user navigated away. Other tabs
                (Sim, Viz, Settings, Reports, Log) have no user-generated
                state at risk and stay on the unmount-on-switch pattern. */}
            <div style={{ display: activeTab === 'chat' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
              <ChatPanel state={gameState} onChatUsage={handleChatUsage} />
            </div>

            {activeTab === 'log' && (
              <div
                ref={logScrollRef}
                onScroll={onLogScroll}
                className="flex-1 overflow-y-auto p-4 font-mono text-xs"
                role="log"
                aria-label="Event log"
                aria-live="polite"
                style={{ background: 'var(--bg-deep)', color: 'var(--text-3)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h2 style={{ color: 'var(--text-1)', fontSize: '14px', fontWeight: 700 }}>Event Log ({effectiveEvents.length} events)</h2>
                </div>
                {effectiveEvents.length === 0 && <div style={{ color: 'var(--text-3)', padding: '20px 0' }}>No events yet. Run a simulation to see the raw SSE event stream.</div>}
                {effectiveEvents.map((e, i) => {
                  const typeColors: Record<string, string> = {
                    status: 'var(--teal)', turn_start: 'var(--rust)', turn_done: 'var(--rust)',
                    dept_start: 'var(--text-3)', dept_done: 'var(--green)',
                    commander_deciding: 'var(--amber)', commander_decided: 'var(--amber)',
                    outcome: '#e8b44a', drift: 'var(--teal)', agent_reactions: '#6aad48',
                    bulletin: 'var(--text-2)', promotion: 'var(--teal)',
                  };
                  const color = typeColors[e.type] || 'var(--text-3)';
                  const hasData = e.data && Object.keys(e.data).length > 0;
                  return (
                    <details key={i} style={{ borderBottom: '1px solid var(--border)', padding: '2px 0' }}>
                      <summary style={{ cursor: 'pointer', padding: '4px 0', display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                        <span style={{ color: 'var(--text-3)', minWidth: '28px', textAlign: 'right', opacity: 0.5 }}>{i}</span>
                        <span style={{ color, fontWeight: 700, minWidth: '120px' }}>{e.type}</span>
                        <span style={{ color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.leader}</span>
                        {e.data?.turn != null && <span style={{ color: 'var(--text-3)' }}>T{String(e.data.turn)}</span>}
                        {!!e.data?.title && <span style={{ color: 'var(--text-2)' }}>{String(e.data.title)}</span>}
                        {!!e.data?.department && <span style={{ color: 'var(--teal)' }}>{String(e.data.department)}</span>}
                        {!!e.data?.outcome && <span style={{ color: 'var(--amber)', fontWeight: 700 }}>{String(e.data.outcome)}</span>}
                      </summary>
                      {hasData && (
                        <pre style={{
                          padding: '8px 12px 8px 44px', margin: '0 0 4px',
                          background: 'var(--bg-card)', borderRadius: '4px', border: '1px solid var(--border)',
                          overflow: 'auto', maxHeight: '400px', fontSize: '11px', lineHeight: 1.5,
                          color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}>
                          {JSON.stringify(e.data, null, 2)}
                        </pre>
                      )}
                    </details>
                  );
                })}
              </div>
            )}

            {/* About tab redirects to the landing page */}
          </main>
          <Footer
            cost={{
              totalTokens: (gameState.cost?.totalTokens ?? 0) + chatUsage.totalTokens,
              totalCostUSD: Math.round(((gameState.cost?.totalCostUSD ?? 0) + chatUsage.costUSD) * 10000) / 10000,
              llmCalls: (gameState.cost?.llmCalls ?? 0) + chatUsage.calls,
            }}
            costBreakdown={{
              simUSD: gameState.cost?.totalCostUSD ?? 0,
              simCalls: gameState.cost?.llmCalls ?? 0,
              chatUSD: chatUsage.costUSD,
              chatCalls: chatUsage.calls,
            }}
            simStatus={{
              isRunning: gameState.isRunning,
              isComplete: sse.isComplete,
              isAborted: sse.isAborted,
              connectionStatus: sse.status,
              abortReason: sse.abortReason,
              providerError: sse.providerError,
            }}
          />
          {/* Full-verdict modal triggered from the global top banner. */}
          {verdictModalOpen && sse.verdict && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Simulation verdict full breakdown"
              onClick={() => setVerdictModalOpen(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 100000,
                background: 'rgba(10,8,6,0.78)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 20,
              }}
            >
              <div
                ref={verdictDialogRef}
                tabIndex={-1}
                onClick={e => e.stopPropagation()}
                style={{
                  background: 'linear-gradient(180deg, var(--bg-panel) 0%, var(--bg-deep) 100%)',
                  border: '1px solid var(--border)',
                  borderTop: `3px solid ${(sse.verdict as Record<string, unknown>).winner === 'A' ? 'var(--vis)' : (sse.verdict as Record<string, unknown>).winner === 'B' ? 'var(--eng)' : 'var(--amber)'}`,
                  borderRadius: 10,
                  padding: '20px 24px',
                  maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto',
                  boxShadow: '0 12px 60px rgba(0,0,0,0.6)',
                  fontFamily: 'var(--sans)', color: 'var(--text-1)',
                  position: 'relative',
                  outline: 'none',
                }}
              >
                <button
                  onClick={() => setVerdictModalOpen(false)}
                  aria-label="Close verdict"
                  style={{
                    position: 'absolute', top: 8, right: 12,
                    background: 'none', border: 'none', color: 'var(--text-3)',
                    cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4,
                    zIndex: 1,
                  }}
                >
                  ×
                </button>
                <VerdictDetails v={sse.verdict as any} />
              </div>
            </div>
          )}
          {tourActive && (
            <GuidedTour
              onTabChange={(tab) => setActiveTab(tab)}
              onClose={handleTourEnd}
              onRun={handleRun}
            />
          )}
          <ShortcutsOverlay />
        </div>
        </ToolRegistryContext.Provider>
       </CitationRegistryContext.Provider>
      </ScenarioContext.Provider>
    </DashboardNavigationContext.Provider>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Paracosm] Uncaught error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#0a0806', color: '#f5f0e4', fontFamily: "'JetBrains Mono', monospace",
          padding: '24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#e06530', marginBottom: '12px', letterSpacing: '.08em' }}>
            SIMULATION ERROR
          </div>
          <div style={{ fontSize: '12px', color: '#a89878', maxWidth: '500px', lineHeight: 1.7, marginBottom: '16px' }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{
              background: '#e06530', color: '#f5f0e4', border: 'none', padding: '10px 24px',
              borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Reload Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <Analytics />
          <AppContent />
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
