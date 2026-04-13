import { useState, useCallback, createContext, useContext } from 'react';
import { ThemeProvider } from './theme/ThemeProvider';
import { useScenario, type ScenarioClientPayload } from './hooks/useScenario';
import { useSSE } from './hooks/useSSE';
import { useGameState } from './hooks/useGameState';
import { useGamePersistence } from './hooks/useGamePersistence';
import { TopBar } from './components/layout/TopBar';
import { TabBar } from './components/layout/TabBar';
import { Toolbar } from './components/layout/Toolbar';
import { SimView } from './components/sim/SimView';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { ReportView } from './components/reports/ReportView';
import { ChatPanel } from './components/chat/ChatPanel';
import { AboutPage } from './components/about/AboutPage';
import { Footer } from './components/layout/Footer';
import { ToastProvider, useToast } from './components/shared/Toast';
import { Analytics } from './components/shared/Analytics';

// Scenario context available to all components
const ScenarioContext = createContext<ScenarioClientPayload | null>(null);
export function useScenarioContext() {
  const ctx = useContext(ScenarioContext);
  if (!ctx) throw new Error('useScenarioContext must be used within App');
  return ctx;
}

type Tab = 'sim' | 'settings' | 'reports' | 'chat' | 'log' | 'about';

function AppContent() {
  const { scenario } = useScenario();
  const sse = useSSE();
  const gameState = useGameState(sse.events, sse.isComplete);
  const persistence = useGamePersistence(scenario.labels.shortName);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('sim');

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
    <ScenarioContext.Provider value={scenario}>
      <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <TopBar scenario={scenario} sse={sse} gameState={gameState} />
        <TabBar active={activeTab} onTabChange={setActiveTab} scenario={scenario} />
        <Toolbar state={gameState} onSave={handleSave} onLoad={handleLoad} onClear={handleClear} />

        <div className="flex-1 overflow-hidden">
          {activeTab === 'sim' && <SimView state={gameState} />}

          {activeTab === 'settings' && <SettingsPanel />}

          {activeTab === 'reports' && <ReportView state={gameState} />}

          {activeTab === 'chat' && <ChatPanel state={gameState} />}

          {activeTab === 'log' && (
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
              <div className="mb-2 font-semibold" style={{ color: 'var(--text-primary)' }}>Event Log</div>
              {sse.events.length === 0 && <div>No events yet.</div>}
              {sse.events.map((e, i) => (
                <div key={i} className="py-0.5">
                  <span style={{ color: 'var(--accent-primary)' }}>[{e.type}]</span>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>{e.leader}</span>{' '}
                  {e.data?.turn && <span>T{String(e.data.turn)}</span>}
                  {e.data?.title && <span> {String(e.data.title)}</span>}
                  {e.data?.department && <span> {String(e.data.department)}</span>}
                  {e.data?.outcome && <span> → {String(e.data.outcome)}</span>}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'about' && <AboutPage />}
        </div>
        <Footer />
      </div>
    </ScenarioContext.Provider>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Analytics />
        <AppContent />
      </ToastProvider>
    </ThemeProvider>
  );
}
