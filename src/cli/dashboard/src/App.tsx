import { useState, useCallback, useEffect, useRef, createContext, useContext, Component, type ReactNode, type ErrorInfo } from 'react';
import { ThemeProvider } from './theme/ThemeProvider';
import { useScenario, type ScenarioClientPayload } from './hooks/useScenario';
import { useSSE } from './hooks/useSSE';
import { useGameState } from './hooks/useGameState';
import { useGamePersistence } from './hooks/useGamePersistence';
import { useCitationRegistry, CitationRegistryContext } from './hooks/useCitationRegistry';
import { useToolRegistry, ToolRegistryContext } from './hooks/useToolRegistry';
import { TopBar } from './components/layout/TopBar';
import { TabBar } from './components/layout/TabBar';
import { ProviderErrorBanner } from './components/layout/ProviderErrorBanner';
// Toolbar merged into TopBar
import { SimView } from './components/sim/SimView';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { ReportView } from './components/reports/ReportView';
import { ChatPanel } from './components/chat/ChatPanel';
import { ColonyViz } from './components/viz/ColonyViz';
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

function AppContent() {
  const { scenario } = useScenario();
  const sse = useSSE();
  const [tourActive, setTourActive] = useState(false);

  // Dynamic page title
  useEffect(() => {
    document.title = `${scenario.labels.name} \u2014 Paracosm`;
  }, [scenario.labels.name]);

  // When tour is active, use demo events; otherwise use live SSE events
  const effectiveEvents = tourActive ? DEMO_EVENTS : sse.events;
  const effectiveComplete = tourActive ? true : sse.isComplete;
  const gameState = useGameState(effectiveEvents, effectiveComplete);
  const citationRegistry = useCitationRegistry(gameState);
  const toolRegistry = useToolRegistry(gameState);
  const persistence = useGamePersistence(scenario.labels.shortName);
  const { toast } = useToast();
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

  // Auto-clear launching once the first event arrives, the simulation
  // is reported as running by the SSE backend, or it's already complete.
  // Also clear on connection error so a stuck launch doesn't block UI.
  useEffect(() => {
    if (!launching) return;
    const hasEvents = sse.events.length > 0;
    if (hasEvents || sse.isComplete || sse.status === 'error') {
      setLaunching(false);
    }
  }, [launching, sse.events.length, sse.isComplete, sse.status]);

  // Safety timeout: if /setup succeeded but no events arrived in 60s,
  // give up and show the empty state instead of spinning forever.
  useEffect(() => {
    if (!launching) return;
    const timer = setTimeout(() => {
      setLaunching(false);
      toast('error', 'Launch Stalled', 'No events received within 60 seconds. The simulation may still complete in the background.');
    }, 60_000);
    return () => clearTimeout(timer);
  }, [launching, toast]);

  const handleRun = useCallback(async () => {
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
  }, [scenario, toast, setActiveTab]);

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
          <TopBar scenario={scenario} sse={sse} gameState={gameState} onSave={handleSave} onLoad={handleLoad} onClear={handleClear} onRun={handleRun} onTour={handleTourStart} onCopy={handleCopySummary} />
          <TabBar active={activeTab} onTabChange={setActiveTab} scenario={scenario} />

          <main id="main-content" className="flex-1 overflow-hidden" role="main" aria-label={`${activeTab} view`} style={{ background: 'var(--bg-deep)', display: 'flex', flexDirection: 'column' }}>
            {activeTab === 'sim' && <SimView state={gameState} sseStatus={sse.status} onRun={handleRun} verdict={sse.verdict} launching={launching} />}

            {activeTab === 'viz' && <ColonyViz state={gameState} />}

            {activeTab === 'settings' && <SettingsPanel />}

            {activeTab === 'reports' && <ReportView state={gameState} verdict={sse.verdict} />}

            {/* ChatPanel stays mounted across tab switches so per-agent
                message threads survive when the user jumps to Sim / Reports
                / Viz and comes back. ChatPanel owns the `threads` Map in
                local state; unmounting on tab change dropped every
                conversation the moment the user navigated away. Other tabs
                (Sim, Viz, Settings, Reports, Log) have no user-generated
                state at risk and stay on the unmount-on-switch pattern. */}
            <div style={{ display: activeTab === 'chat' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
              <ChatPanel state={gameState} />
            </div>

            {activeTab === 'log' && (
              <div className="flex-1 overflow-y-auto p-4 font-mono text-xs" role="log" aria-label="Event log" aria-live="polite" style={{ background: 'var(--bg-deep)', color: 'var(--text-3)' }}>
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
          <Footer cost={gameState.cost} />
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
