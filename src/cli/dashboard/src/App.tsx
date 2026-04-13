import { useState, createContext, useContext } from 'react';
import { ThemeProvider } from './theme/ThemeProvider';
import { useScenario, type ScenarioClientPayload } from './hooks/useScenario';
import { useSSE } from './hooks/useSSE';
import { TopBar } from './components/layout/TopBar';
import { TabBar } from './components/layout/TabBar';

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
  const [activeTab, setActiveTab] = useState<Tab>('sim');

  return (
    <ScenarioContext.Provider value={scenario}>
      <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <TopBar scenario={scenario} sse={sse} />
        <TabBar active={activeTab} onTabChange={setActiveTab} scenario={scenario} />

        <div className="flex-1 overflow-hidden">
          {activeTab === 'sim' && (
            <div className="flex h-full gap-px" style={{ background: 'var(--border-primary)' }}>
              <div className="flex-1 overflow-y-auto p-4" style={{ background: 'var(--bg-primary)' }}>
                <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
                  <div className="text-4xl mb-4">⚡</div>
                  <div className="text-lg font-semibold mb-2">Ready to simulate</div>
                  <div className="text-sm">Configure leaders in Settings, then launch a simulation.</div>
                  <div className="mt-4 text-xs font-mono" style={{ color: 'var(--text-placeholder)' }}>
                    SSE: {sse.status} | Events: {sse.events.length}
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4" style={{ background: 'var(--bg-primary)' }}>
                <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
                  <div className="text-4xl mb-4">⚡</div>
                  <div className="text-lg font-semibold mb-2">Ready to simulate</div>
                  <div className="text-sm">Two commanders will run in parallel.</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-3xl mx-auto">
                <h2 className="text-xl font-bold mb-4">Settings</h2>
                <p style={{ color: 'var(--text-muted)' }}>
                  Settings panel coming in Sub-project C. Scenario: <strong>{scenario.labels.name}</strong>.
                  {' '}{scenario.departments.length} departments: {scenario.departments.map(d => d.label).join(', ')}.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-4xl mx-auto">
                <h2 className="text-xl font-bold mb-4">Reports</h2>
                <p style={{ color: 'var(--text-muted)' }}>Reports panel coming in Sub-project C.</p>
              </div>
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-3xl mx-auto">
                <h2 className="text-xl font-bold mb-4">Chat</h2>
                <p style={{ color: 'var(--text-muted)' }}>
                  Chat with {scenario.labels.populationNoun}. Coming in Sub-project C.
                </p>
              </div>
            </div>
          )}

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

          {activeTab === 'about' && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-3xl mx-auto">
                <h2 className="text-xl font-bold mb-4">About {scenario.labels.name}</h2>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Paracosm is a scenario-driven simulation engine. The engine handles orchestration.
                  The scenario handles domain. Built with AgentOS.
                </p>
                <div className="mt-6 flex gap-4 text-sm">
                  <a href="https://agentos.sh" target="_blank" rel="noopener" style={{ color: 'var(--accent-primary)' }}>agentos.sh</a>
                  <a href="https://github.com/framersai/paracosm" target="_blank" rel="noopener" style={{ color: 'var(--accent-primary)' }}>GitHub</a>
                  <a href="https://www.npmjs.com/package/paracosm" target="_blank" rel="noopener" style={{ color: 'var(--accent-primary)' }}>npm</a>
                  <a href="https://frame.dev" target="_blank" rel="noopener" style={{ color: 'var(--accent-primary)' }}>Frame.dev</a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ScenarioContext.Provider>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
