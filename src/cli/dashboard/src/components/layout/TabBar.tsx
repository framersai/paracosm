import type { ScenarioClientPayload } from '../../hooks/useScenario';

type Tab = 'sim' | 'settings' | 'reports' | 'chat' | 'log' | 'about';

interface TabBarProps {
  active: Tab;
  onTabChange: (tab: Tab) => void;
  scenario: ScenarioClientPayload;
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'sim', label: 'SIM' },
  { id: 'settings', label: 'SETTINGS' },
  { id: 'reports', label: 'REPORTS' },
  { id: 'chat', label: 'CHAT' },
  { id: 'log', label: 'LOG' },
  { id: 'about', label: 'ABOUT' },
];

export function TabBar({ active, onTabChange, scenario }: TabBarProps) {
  const tabs = TABS.filter(t => t.id !== 'chat' || scenario.policies.characterChat);

  return (
    <nav
      className="tab-bar flex shrink-0"
      role="tablist"
      aria-label="Dashboard navigation"
      style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)' }}
    >
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          role="tab"
          aria-selected={active === tab.id}
          aria-controls={`panel-${tab.id}`}
          id={`tab-${tab.id}`}
          className="cursor-pointer transition-colors"
          style={{
            padding: '10px 0',
            flex: 1,
            fontFamily: 'var(--sans)',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.5px',
            textTransform: 'uppercase' as const,
            color: active === tab.id ? 'var(--amber)' : 'var(--text-3)',
            background: active === tab.id ? 'var(--bg-card)' : 'var(--bg-panel)',
            border: 'none',
            borderBottom: active === tab.id ? '2px solid var(--amber)' : '2px solid transparent',
          }}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
