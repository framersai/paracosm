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
    <div
      className="flex shrink-0"
      style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)' }}
    >
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className="cursor-pointer transition-colors"
          style={{
            padding: '4px 0',
            flex: 1,
            fontFamily: 'var(--font-sans)',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.5px',
            textTransform: 'uppercase' as const,
            color: active === tab.id ? 'var(--amber)' : 'var(--text-muted)',
            background: active === tab.id ? 'var(--bg-card)' : 'var(--bg-secondary)',
            border: 'none',
            borderBottom: active === tab.id ? '2px solid var(--amber)' : '2px solid transparent',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
