import { useState, useCallback, useEffect, useRef, createContext, useContext, Component, type ReactNode, type ErrorInfo } from 'react';
import { ThemeProvider } from './theme/ThemeProvider';
import { useScenario, type ScenarioClientPayload } from './hooks/useScenario';
import { deriveLabels } from './hooks/useScenarioLabels.helpers';
import { useSSE } from './hooks/useSSE';
import { useGameState } from './hooks/useGameState';
import { useGamePersistence } from './hooks/useGamePersistence';
import { useLocalHistory } from './hooks/useLocalHistory';
import { useLoadPreview } from './hooks/useLoadPreview';
import { useLoadFromUrl } from './hooks/useLoadFromUrl';
import { useDashboardDropZone } from './hooks/useDashboardDropZone';
import { LoadPreviewModal } from './components/layout/LoadPreviewModal';
import { DropZoneOverlay } from './components/layout/DropZoneOverlay';
import { useForgeToasts } from './hooks/useForgeToasts';
import { useTerminalToast } from './hooks/useTerminalToast';
import { useSimSavedToast } from './hooks/useSimSavedToast';
import { useLaunchState } from './hooks/useLaunchState';
import { VerdictBanner } from './components/layout/VerdictBanner';
import { VerdictModal } from './components/layout/VerdictModal';
import { ReplayBanner, ReplayNotFoundBanner } from './components/layout/ReplayBanner';
// EventLogPanel + BranchesTab are now rendered inside SettingsPanel +
// StudioTab as sub-tabs; App.tsx no longer needs them at top level.
import { BranchesProvider } from './components/branches/BranchesContext';
import { BranchesSyncer } from './components/branches/BranchesSyncer';
import { LibraryTab } from './components/library/index.js';
import { StudioTab } from './components/studio/StudioTab.js';
import { QuickstartView } from './components/quickstart/QuickstartView';
import { useCitationRegistry, CitationRegistryContext } from './hooks/useCitationRegistry';
import { useToolRegistry, ToolRegistryContext } from './hooks/useToolRegistry';
import { TopBar } from './components/layout/TopBar';
import { TabBar } from './components/layout/TabBar';
import { ProviderErrorBanner } from './components/layout/ProviderErrorBanner';
// Toolbar merged into TopBar
import { SimView } from './components/sim/SimView';
import type { RunArtifact } from '../../../engine/schema/index.js';
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
  getDashboardTabAndSubFromHref,
  getDashboardTabFromHref,
  type DashboardTab,
} from './tab-routing';
import styles from './App.module.scss';

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

  // Dynamic page title. The scenario fallback shipped with the dashboard
  // happens to be the Mars Genesis demo, but using its name as the title
  // outside of an actually-loaded Mars run leaks scenario-specific
  // branding onto every fresh visit. Show a universal Paracosm title
  // until the user has actually loaded a named scenario from a Quickstart
  // run, a Library bundle, or the Studio drop zone.
  useEffect(() => {
    const isFallbackName = scenario.id === 'mars-genesis' && scenario.labels.name === 'Mars Genesis';
    document.title = isFallbackName
      ? 'Paracosm \u2014 Structured World Model for AI Agents'
      : `${scenario.labels.name} \u2014 Paracosm`;
  }, [scenario.id, scenario.labels.name]);

  // When tour is active, use demo events; otherwise use live SSE events.
  // Event Log pin-to-bottom scroll logic lives inside EventLogPanel.
  // Tour data swap. The tour ships with DEMO_EVENTS so first-time
  // visitors with no run loaded see realistic content while the
  // highlight walks through tabs. BUT — if the user already has real
  // events in flight (their own Quickstart run, a loaded Library
  // bundle, an in-progress sim), swapping to demo data on tour start
  // would visibly trash everything they had on screen. Keep their
  // data instead; the tour copy describes UI structure either way,
  // and the structure is the same regardless of whose data fills it.
  const useDemoData = tourActive && sse.events.length === 0;
  const effectiveEvents = useDemoData ? DEMO_EVENTS : sse.events;
  const effectiveComplete = useDemoData ? true : sse.isComplete;
  const gameState = useGameState(effectiveEvents, effectiveComplete);

  // Forge-attempt toast pipeline (sessionStorage + watermark + toasted-key
  // set). Three-layer gating extracted to hooks/useForgeToasts.ts; see
  // that file for the rationale.
  const { toast } = useToast();
  useForgeToasts({
    events: effectiveEvents,
    replayDone: sse.replayDone,
    tourActive,
  });

  const citationRegistry = useCitationRegistry(gameState);
  const toolRegistry = useToolRegistry(gameState);
  const persistence = useGamePersistence(scenario.labels.shortName, {
    id: scenario.id,
    version: scenario.version,
    shortName: scenario.labels.shortName,
  });
  const history = useLocalHistory({ scenarioShortName: scenario.labels.shortName });
  // Initial tab + sub-tab from URL. Legacy ?tab=branches and ?tab=log
  // resolve to studio/settings with the matching sub-tab pre-selected
  // so old deep links keep working.
  const initialRoute = getDashboardTabAndSubFromHref(window.location.href);
  const [activeTab, setActiveTabState] = useState<DashboardTab>(initialRoute.tab);
  const [studioInitialSubTab] = useState<'author' | 'branches'>(
    initialRoute.tab === 'studio' && initialRoute.sub === 'branches' ? 'branches' : 'author',
  );
  const [settingsInitialSubTab] = useState<'config' | 'log'>(
    initialRoute.tab === 'settings' && initialRoute.sub === 'log' ? 'log' : 'config',
  );
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

  const loadPreview = useLoadPreview({
    pickFile: persistence.pickFile,
    parseFile: persistence.parseFile,
    currentScenario: { id: scenario.id, name: scenario.labels.name },
    onConfirm: ({ events, results, verdict }) => {
      sse.loadEvents(events, results, verdict);
      toast('info', 'Loaded', `${events.length} events loaded.`);
      setActiveTab('sim');
    },
    onError: (reason) => {
      toast('error', 'Load Failed', reason);
    },
  });
  const handleLoad = loadPreview.openPicker;

  // ?load=<url> query-param auto-fetch. Runs once on mount; if the
  // param isn't present, the hook is a no-op.
  useLoadFromUrl({
    openFromFile: (file) => loadPreview.openFromFile(file),
    onInfo: (title, body) => toast('info', title, body),
    onError: (title, body) => toast('error', title, body),
  });

  // Drag-and-drop a .json save file anywhere on the dashboard. Uses the
  // same preview + parse pipeline as the file-picker flow.
  const dropZone = useDashboardDropZone({
    onFile: (file) => loadPreview.openFromFile(file),
    onError: () => {
      toast('error', 'Unsupported file', 'Only .json simulation files supported.');
    },
    onMultipleFiles: (totalCount) => {
      toast('info', 'Multi-file drop', `Loaded first of ${totalCount} files; ignoring the rest.`);
    },
  });

  const handleClear = useCallback(async () => {
    if (!confirm(
      'Clear ALL data? This wipes:\n' +
      '  • Current simulation buffer (this browser)\n' +
      '  • Library runs (server)\n' +
      '  • Saved sessions / replays (server)\n' +
      '  • On-disk artifact JSON files\n\n' +
      'Cannot be undone.',
    )) return;
    persistence.clearCache();
    sse.reset();
    setUserTriggeredRun(false);

    // Server-side wipe. /admin/data/wipe requires X-Admin-Token (per-
    // request auth gate added in the security pass). Token is stored
    // in localStorage; if it's missing we prompt for it once. The token
    // lives in /opt/paracosm/.env on the operator's server.
    let adminToken = '';
    try {
      adminToken = localStorage.getItem('paracosm:adminToken') ?? '';
    } catch {
      /* localStorage may be disabled (SSR / private window); treat as missing. */
    }
    if (!adminToken) {
      const entered = window.prompt(
        'Server wipe needs the admin token (set on the server as ADMIN_TOKEN in .env).\n' +
        'Paste it once and the dashboard will remember it for this browser:',
      );
      if (entered === null) {
        toast('info', 'Cleared', 'Local buffer cleared. Server wipe canceled (no admin token).');
        setActiveTab('settings');
        return;
      }
      adminToken = entered.trim();
      try {
        if (adminToken) localStorage.setItem('paracosm:adminToken', adminToken);
      } catch {
        /* silent — fall through; the request below carries the token in-memory either way. */
      }
    }

    try {
      const res = await fetch('/admin/data/wipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
        body: JSON.stringify({ wipeRuns: true, wipeSessions: true, wipeOutput: true }),
      });
      if (res.ok) {
        const body = await res.json() as { wiped: { runs: number; sessions: number; outputFiles: number } };
        toast(
          'info',
          'Cleared',
          `Local buffer + ${body.wiped.runs} runs + ${body.wiped.sessions} sessions + ${body.wiped.outputFiles} files wiped.`,
        );
      } else if (res.status === 401) {
        // Wrong / expired token. Drop the saved value so the next click
        // re-prompts cleanly.
        try { localStorage.removeItem('paracosm:adminToken'); } catch { /* silent */ }
        toast('error', 'Partial clear', 'Local cleared; server rejected the admin token. Click Wipe All again to re-enter.');
      } else if (res.status === 403) {
        toast('info', 'Cleared', 'Local buffer cleared. Server wipe disabled (ADMIN_WRITE off).');
      } else if (res.status === 503) {
        toast('error', 'Partial clear', 'Local cleared; server has ADMIN_WRITE on but no ADMIN_TOKEN configured. Set ADMIN_TOKEN in /opt/paracosm/.env.');
      } else {
        const err = await res.json().catch(() => ({} as { error?: string }));
        toast('error', 'Partial clear', `Local cleared; server wipe failed: ${err.error ?? `HTTP ${res.status}`}`);
      }
    } catch (err) {
      toast('error', 'Partial clear', `Local cleared; server wipe failed: ${err instanceof Error ? err.message : String(err)}`);
    }
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

  // Where the user was looking before the tour took over. Captured at
  // tour-start time and restored at tour-end time so manually clicking
  // HOW IT WORKS from (e.g.) Reports doesn't dump the user back on Sim
  // when the tour finishes.
  const preTourTabRef = useRef<DashboardTab | null>(null);
  const handleTourStart = useCallback(() => {
    preTourTabRef.current = activeTab;
    setTourActive(true);
    // The tour's first step calls onTabChange('quickstart') itself, so
    // there's no need to force-route through 'sim' here. Skipping that
    // intermediate hop removes a wasted re-render of SimView (which is
    // expensive when real run data is loaded).
  }, [activeTab]);

  // Auto-start the GuidedTour on the user's FIRST visit to the sim
  // page so new viewers get oriented without having to find the
  // HOW IT WORKS button. Gated on a localStorage flag
  // (`paracosm:tourSeen`) so returning users don't get the tour
  // replayed every time they open the app.
  //
  // We set the flag IMMEDIATELY on auto-start fire (not just when
  // the tour ends). Reason: React 19's StrictMode double-runs
  // effects in dev, SPA navigations / query-param changes can
  // remount AppContent, and various dismissal paths (click-away,
  // Escape, browser back) don't all reliably call handleTourEnd
  // before the component unmounts. Pinning the flag at fire-time
  // guarantees once-ever auto-start behavior regardless of how
  // the user exits the tour. Manual re-play via HOW IT WORKS still
  // works since that path bypasses this effect.
  useEffect(() => {
    try {
      if (localStorage.getItem('paracosm:tourSeen') === '1') return;
      localStorage.setItem('paracosm:tourSeen', '1');
    } catch {
      // Privacy mode / quota error: skip autostart — if we can't
      // persist "seen", don't fire or the tour loops forever.
      return;
    }
    // Defer one tick so the initial layout (tab bar, topbar, sim
    // columns) paints before the highlight ring lands on the first
    // step. The tour's getBoundingClientRect reads will otherwise
    // measure zero-height shells on cold mount.
    //
    // Do not start the tour at all when the user deep-linked to a
    // non-default tab. The tour's first step calls onTabChange('sim')
    // which would clobber an explicit /sim?tab=library or
    // /sim#branches choice. Quickstart is the default first-visit
    // landing; only on that tab does the tour add value.
    const timer = setTimeout(() => {
      const currentTab = getDashboardTabFromHref(window.location.href);
      if (currentTab !== 'quickstart') {
        return;
      }
      preTourTabRef.current = currentTab;
      setTourActive(true);
      // The tour's first step is already 'quickstart' — no need to
      // force-route through 'sim' before the tour takes over.
    }, 600);
    return () => clearTimeout(timer);
    // Run exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Restore the tab the user was on before the tour started, so
    // someone who clicked HOW IT WORKS from Reports / Library / etc.
    // returns there instead of being dumped on Sim. Falls back to
    // whatever the tour was last on if we never captured a pre-tour
    // tab (e.g., auto-start path).
    if (preTourTabRef.current) {
      setActiveTab(preTourTabRef.current);
      preTourTabRef.current = null;
    }
    // Mark the tour as seen so the auto-start useEffect above
    // stops re-firing on every mount. Fires on both finish-flow
    // and skip — either path means the user has been exposed to
    // the walkthrough once.
    try {
      localStorage.setItem('paracosm:tourSeen', '1');
    } catch {
      /* silent — privacy mode or quota error, nothing we can do */
    }
  }, [setActiveTab]);

  const handleCopySummary = useCallback(() => {
    const firstId = gameState.actorIds[0];
    const secondId = gameState.actorIds[1];
    const a = firstId ? gameState.actors[firstId] : null;
    const b = secondId ? gameState.actors[secondId] : null;
    // Fallback names when the SSE stream has not yet sent a leader
    // identity. Use the scenario's per-domain label (e.g. "Commander A"
    // for Mars Genesis, "Mayor A" for a hurricane scenario) with a
    // benign "Actor" default when the scenario doesn't specify.
    const actorTitle = (scenario.labels.actorNoun ?? 'actor').replace(/^./, (c: string) => c.toUpperCase());
    const nameA = a?.leader?.name || `${actorTitle} A`;
    const nameB = b?.leader?.name || `${actorTitle} B`;
    const archA = a?.leader?.archetype || '';
    const archB = b?.leader?.archetype || '';
    const unitA = a?.leader?.unit || '';
    const unitB = b?.leader?.unit || '';

    const labels = deriveLabels(scenario);
    const lines: string[] = [
      `## ${scenario.labels.name} — Simulation Report`,
      `**Turns**: ${gameState.turn}/${gameState.maxTurns} | **Seed**: ${gameState.seed} | **${labels.Time}**: ${gameState.time}`,
      '',
      `### ${nameA}${archA ? ` (${archA})` : ''}`,
      `Unit: ${unitA} | Pop: ${a?.metrics?.population ?? '?'} | Morale: ${a?.metrics ? Math.round(a.metrics.morale * 100) : '?'}% | Deaths: ${a?.deaths ?? 0}`,
      `Tools forged: ${a?.tools ?? 0} | Citations: ${a?.citations ?? 0} | Decisions: ${a?.decisions ?? 0}`,
      '',
      `### ${nameB}${archB ? ` (${archB})` : ''}`,
      `Unit: ${unitB} | Pop: ${b?.metrics?.population ?? '?'} | Morale: ${b?.metrics ? Math.round(b.metrics.morale * 100) : '?'}% | Deaths: ${b?.deaths ?? 0}`,
      `Tools forged: ${b?.tools ?? 0} | Citations: ${b?.citations ?? 0} | Decisions: ${b?.decisions ?? 0}`,
    ];

    if (a?.event && b?.event && a.event.turn === b.event.turn) {
      lines.push('', '### Key Divergence');
      lines.push(`Same event "${a.event.title}" at T${a.event.turn}.`);
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

  // Digital-twin artifact returned by /api/quickstart/simulate-intervention.
  // When set, SIM tab renders DigitalTwinPanel instead of the parallel-actor
  // layout. Single-actor intervention runs are structurally different from
  // multi-actor side-by-side runs, so the SIM UI swaps wholesale rather
  // than trying to merge both shapes into one view. Cleared by the panel's
  // dismiss button or by triggering a fresh /setup run.
  const [interventionArtifact, setInterventionArtifact] = useState<RunArtifact | null>(null);
  // While set, SIM renders DigitalTwinProgress (live-streaming events
  // from the in-flight simulate-intervention run) instead of the
  // parallel-actor layout or the static panel. Carries the prefilled
  // subject + intervention so the progress view can echo them on
  // screen before any artifact comes back. Cleared when the artifact
  // arrives (panel takes over) or when the user dismisses.
  const [interventionRunning, setInterventionRunning] = useState<{
    subject: { id: string; name: string; profile?: Record<string, unknown> };
    intervention: { id: string; name: string; description: string; duration?: { value: number; unit: string } };
  } | null>(null);

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

  useLaunchState({
    launching,
    setLaunching,
    isRunning: gameState.isRunning,
    isComplete: sse.isComplete,
    sseStatus: sse.status,
    eventsCount: sse.events.length,
  });

  // Gate the run-finish + cache-saved toasts on whether the user
  // actually clicked Run during this session. Cold loads that hydrate
  // straight into a terminal state (server event-buffer replay or
  // localStorage cache) shouldn't announce results the user didn't
  // ask to start.
  const [userTriggeredRun, setUserTriggeredRun] = useState(false);

  // Handlers for the digital-twin intervention path: declared here so
  // setUserTriggeredRun is in scope.
  //
  // Start: fires the moment the user clicks "Run intervention demo".
  // We reset prior SSE state, switch to SIM immediately (so streaming
  // events from the server show up live), and park the prefilled
  // subject + intervention so DigitalTwinProgress can echo them.
  //
  // Result: artifact landed, swap progress -> panel (single render
  // pass; the artifact carries subject + intervention so the panel
  // does not need the running payload).
  const handleInterventionStart = useCallback((payload: {
    subject: { id: string; name: string; profile?: Record<string, unknown> };
    intervention: { id: string; name: string; description: string; duration?: { value: number; unit: string } };
  }) => {
    sse.reset();
    setInterventionArtifact(null);
    setInterventionRunning(payload);
    setUserTriggeredRun(true);
    setActiveTab('sim');
  }, [sse, setActiveTab]);
  const handleInterventionResult = useCallback((artifact: RunArtifact) => {
    setInterventionRunning(null);
    setInterventionArtifact(artifact);
    setUserTriggeredRun(true);
    setActiveTab('sim');
  }, [setActiveTab]);
  const handleInterventionDismiss = useCallback(() => {
    setInterventionRunning(null);
    setInterventionArtifact(null);
  }, []);
  useTerminalToast({
    isComplete: sse.isComplete,
    isAborted: sse.isAborted,
    abortReason: sse.abortReason,
    resultsCount: sse.results.length,
    hasVerdict: Boolean(sse.verdict),
    replayDone: sse.replayDone,
    tourActive,
    userTriggeredRun,
  });

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
    history.push({
      events: sse.events,
      results: sse.results,
      verdict: sse.verdict,
    });
  }, [
    sse.isComplete,
    sse.isAborted,
    sse.events,
    sse.results,
    sse.verdict,
    scenario.labels.shortName,
    history,
    tourActive,
  ]);

  useSimSavedToast({ events: sse.events, tourActive, userTriggeredRun });

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
    const actors = defaultPreset?.actors?.slice(0, 2).map((a, i) => ({
      ...a,
      unit: i === 0 ? 'Colony Alpha' : 'Colony Beta',
    })) || [
      { name: 'Actor A', archetype: 'The Visionary', unit: 'Colony Alpha', hexaco: { openness: 0.95, conscientiousness: 0.35, extraversion: 0.85, agreeableness: 0.55, emotionality: 0.3, honestyHumility: 0.65 }, instructions: '' },
      { name: 'Actor B', archetype: 'The Engineer', unit: 'Colony Beta', hexaco: { openness: 0.25, conscientiousness: 0.97, extraversion: 0.3, agreeableness: 0.6, emotionality: 0.7, honestyHumility: 0.9 }, instructions: '' },
    ];
    try {
      setLaunching(true);
      // Mark the run as user-triggered so the run-finish + cache-saved
      // toasts unlock for this session. Cleared by handleClear / Wipe.
      setUserTriggeredRun(true);
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
          actors,
          provider: 'openai',
          turns: scenario.setup.defaultTurns,
          timePerTurn: scenario.setup.defaultTimePerTurn,
          seed: scenario.setup.defaultSeed,
          startTime: scenario.setup.defaultStartTime,
          population: scenario.setup.defaultPopulation,
          activeDepartments: scenario.departments.map(d => d.id),
          // Tier 2 Spec 2B: always capture kernel snapshots on
          // UI-initiated runs so the Reports tab's "Fork at turn N"
          // button is enabled by default.
          captureSnapshots: true,
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
    <BranchesProvider>
    <DashboardNavigationContext.Provider value={setActiveTab}>
      <ScenarioContext.Provider value={scenario}>
       <CitationRegistryContext.Provider value={citationRegistry}>
        <ToolRegistryContext.Provider value={toolRegistry}>
        <BranchesSyncer sse={sse} />
        <div className={`flex flex-col h-screen w-screen overflow-hidden scanline-overlay ${styles.shell}`}>
          {sse.providerError && !bannerDismissed ? (
            <ProviderErrorBanner
              providerError={sse.providerError}
              onDismiss={() => setBannerDismissed(true)}
            />
          ) : null}
          {replaySessionId && sse.status === 'replay_not_found' ? (
            <ReplayNotFoundBanner replaySessionId={replaySessionId} />
          ) : null}
          {replaySessionId && sse.status !== 'replay_not_found' ? (
            <ReplayBanner replaySessionId={replaySessionId} />
          ) : null}
          <TopBar
            scenario={scenario}
            sse={sse}
            gameState={gameState}
            onSave={handleSave}
            onLoad={handleLoad}
            onClear={handleClear}
            onRun={handleRun}
            onTour={handleTourStart}
            onCopy={handleCopySummary}
            launching={launching}
            history={history.entries}
            onRestoreHistory={(entry) => history.restore(entry, sse.loadEvents)}
            onClearHistory={() => {
              // Clear all browser-side state — the local LOAD-menu
              // ring, the localStorage event-cache, the in-memory SSE
              // state (which feeds Sim/Constellation/EventLog), and
              // the userTriggeredRun toast gate. Doesn't touch server
              // data; that's what Wipe All is for.
              history.clear();
              persistence.clearCache();
              sse.reset();
              setUserTriggeredRun(false);
            }}
          />
          <TabBar active={activeTab} onTabChange={setActiveTab} scenario={scenario} />
          {/* Cold-load gate: suppress the verdict banner unless the
              user actually started a run this session. Without this
              guard, a fresh visitor lands on the page with the SSE
              event buffer rehydrating someone else's stale verdict
              ("The Engineer wins · Turn 6/6") which pollutes the
              Quickstart view + every demo recording. Same gate the
              terminal/sim-saved toasts already use. */}
          {userTriggeredRun && (
            <VerdictBanner
              verdict={sse.verdict}
              currentTurn={gameState.turn}
              maxTurns={gameState.maxTurns}
              dismissedKey={verdictDismissedKey}
              onOpenModal={() => setVerdictModalOpen(true)}
              onDismiss={setVerdictDismissedKey}
              onNavigateTab={setActiveTab}
            />
          )}

          <main id="main-content" className={`flex-1 overflow-hidden ${styles.main}`} role="main" aria-label={`${activeTab} view`}>
            {activeTab === 'quickstart' && (
              <QuickstartView
                sse={sse}
                sessionId={replaySessionId ?? undefined}
                onRunStarted={() => setUserTriggeredRun(true)}
                onInterventionStart={handleInterventionStart}
                onInterventionResult={handleInterventionResult}
              />
            )}

            {activeTab === 'sim' && (
              <SimView
                state={gameState}
                sseStatus={sse.status}
                onRun={handleRun}
                onTour={handleTourStart}
                verdict={sse.verdict}
                launching={launching}
                interventionArtifact={interventionArtifact}
                interventionRunning={interventionRunning}
                onInterventionDismiss={handleInterventionDismiss}
                forceLayout={tourActive ? 'side-by-side' : undefined}
              />
            )}

            {activeTab === 'viz' && <SwarmViz state={gameState} onNavigateToChat={navigateToChat} />}

            {activeTab === 'settings' && (
              <SettingsPanel
                events={effectiveEvents}
                initialSubTab={settingsInitialSubTab}
              />
            )}

            {activeTab === 'reports' && <ReportView state={gameState} verdict={sse.verdict} reportSections={scenario.ui.reportSections} />}

            {activeTab === 'library' && <LibraryTab />}

            {activeTab === 'studio' && <StudioTab initialSubTab={studioInitialSubTab} />}

            {/* ChatPanel stays mounted across tab switches so per-agent
                message threads survive when the user jumps to Sim / Reports
                / Viz and comes back. ChatPanel owns the `threads` Map in
                local state; unmounting on tab change dropped every
                conversation the moment the user navigated away. Other tabs
                (Sim, Viz, Settings, Reports, Log) have no user-generated
                state at risk and stay on the unmount-on-switch pattern. */}
            <div className={activeTab === 'chat' ? styles.chatSurfaceVisible : styles.chatSurfaceHidden}>
              <ChatPanel state={gameState} onChatUsage={handleChatUsage} />
            </div>

            {/* LOG moved into SETTINGS as a sub-tab; EventLogPanel is now
                rendered inside SettingsPanel when its sub-tab is 'log'. */}

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
          {verdictModalOpen && sse.verdict && (
            <VerdictModal
              verdict={sse.verdict as Record<string, unknown>}
              onClose={() => setVerdictModalOpen(false)}
            />
          )}
          {loadPreview.metadata && (
            <LoadPreviewModal
              metadata={loadPreview.metadata}
              showOverwriteWarning={sse.events.length > 0 && !replaySessionId}
              currentEventCount={sse.events.length}
              onConfirm={loadPreview.confirm}
              onCancel={loadPreview.cancel}
            />
          )}
          <DropZoneOverlay active={dropZone.isDragging} />
          {tourActive && (
            <GuidedTour
              activeTab={activeTab}
              chatEnabled={scenario.policies.characterChat}
              onTabChange={setActiveTab}
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
    </BranchesProvider>
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
        <div className={styles.errorBoundary}>
          <div className={styles.errorTitle}>SIMULATION ERROR</div>
          <div className={styles.errorMessage}>{this.state.error.message}</div>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            className={styles.errorReload}
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
