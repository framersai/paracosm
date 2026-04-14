import { useState, useCallback, useEffect, createContext, useContext, Component, type ReactNode, type ErrorInfo } from 'react';
import { ThemeProvider } from './theme/ThemeProvider';
import { useScenario, type ScenarioClientPayload } from './hooks/useScenario';
import { useSSE } from './hooks/useSSE';
import { useGameState } from './hooks/useGameState';
import { useGamePersistence } from './hooks/useGamePersistence';
import { TopBar } from './components/layout/TopBar';
import { TabBar } from './components/layout/TabBar';
// Toolbar merged into TopBar
import { SimView } from './components/sim/SimView';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { ReportView } from './components/reports/ReportView';
import { ChatPanel } from './components/chat/ChatPanel';
// AboutPage consolidated into landing page at /
import { Footer } from './components/layout/Footer';
import { ToastProvider, useToast } from './components/shared/Toast';
import { Analytics } from './components/shared/Analytics';
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

function AppContent() {
  const { scenario } = useScenario();
  const sse = useSSE();

  // Dynamic page title
  useEffect(() => {
    document.title = `${scenario.labels.name} \u2014 Paracosm`;
  }, [scenario.labels.name]);
  const gameState = useGameState(sse.events, sse.isComplete);
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
    persistence.save(sse.events, sse.results);
    toast('success', 'Saved', `${sse.events.length} events saved to file.`);
  }, [sse.events, sse.results, persistence, toast]);

  const handleLoad = useCallback(async () => {
    const data = await persistence.load();
    if (data) {
      toast('info', 'Loaded', `${data.events.length} events from file. Replay in the sim tab.`);
      setActiveTab('sim');
    } else {
      toast('error', 'Load Failed', 'No valid game data found in file.');
    }
  }, [persistence, toast]);

  const handleClear = useCallback(() => {
    if (!confirm('Clear all simulation data? This cannot be undone.')) return;
    persistence.clearCache();
    sse.reset();
    toast('info', 'Cleared', 'Simulation data cleared.');
    setActiveTab('settings');
  }, [persistence, sse, toast]);

  return (
    <DashboardNavigationContext.Provider value={setActiveTab}>
      <ScenarioContext.Provider value={scenario}>
        <div className="flex flex-col h-screen w-screen overflow-hidden scanline-overlay" style={{ background: 'var(--bg-deep)', color: 'var(--text-1)' }}>
          <TopBar scenario={scenario} sse={sse} gameState={gameState} onSave={handleSave} onLoad={handleLoad} onClear={handleClear} />
          <TabBar active={activeTab} onTabChange={setActiveTab} scenario={scenario} />

          <main id="main-content" className="flex-1 overflow-hidden" role="main" aria-label={`${activeTab} view`} style={{ background: 'var(--bg-deep)', display: 'flex', flexDirection: 'column' }}>
            {activeTab === 'sim' && <SimView state={gameState} sseStatus={sse.status} />}

            {activeTab === 'settings' && <SettingsPanel />}

            {activeTab === 'reports' && <ReportView state={gameState} />}

            {activeTab === 'chat' && <ChatPanel state={gameState} />}

            {activeTab === 'log' && (
              <div className="flex-1 overflow-y-auto p-4 font-mono text-xs" role="log" aria-label="Event log" aria-live="polite" style={{ background: 'var(--bg-panel)', color: 'var(--text-3)' }}>
                <h2 className="mb-2 font-semibold" style={{ color: 'var(--text-1)', fontSize: '14px' }}>Event Log</h2>
                {sse.events.length === 0 && <div>No events yet.</div>}
                {sse.events.map((e, i) => (
                  <div key={i} className="py-0.5">
                    <span style={{ color: 'var(--amber)' }}>[{e.type}]</span>{' '}
                    <span style={{ color: 'var(--text-2)' }}>{e.leader}</span>{' '}
                    {e.data?.turn != null && <span>T{String(e.data.turn)}</span>}
                    {e.data?.title != null && <span> {String(e.data.title)}</span>}
                    {e.data?.department != null && <span> {String(e.data.department)}</span>}
                    {e.data?.outcome != null && <span> &rarr; {String(e.data.outcome)}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* About tab redirects to the landing page */}
          </main>
          <Footer />
        </div>
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
