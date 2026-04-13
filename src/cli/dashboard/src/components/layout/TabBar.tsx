import type { ScenarioClientPayload } from '../../hooks/useScenario';

type Tab = 'sim' | 'settings' | 'reports' | 'chat' | 'log' | 'about';

interface TabBarProps {
  active: Tab;
  onTabChange: (tab: Tab) => void;
  scenario: ScenarioClientPayload;
}

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'sim', label: 'Simulation', icon: '⚡' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
  { id: 'reports', label: 'Reports', icon: '📊' },
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'log', label: 'Log', icon: '📋' },
  { id: 'about', label: 'About', icon: 'ℹ️' },
];

export function TabBar({ active, onTabChange, scenario }: TabBarProps) {
  // Filter chat tab if not enabled by scenario
  const tabs = TABS.filter(t => t.id !== 'chat' || scenario.policies.characterChat);

  return (
    <div
      className="flex gap-0 border-b shrink-0 overflow-x-auto"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
    >
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className="px-4 py-2 text-xs font-semibold tracking-wide transition-colors cursor-pointer whitespace-nowrap border-b-2"
          style={{
            color: active === tab.id ? 'var(--accent-primary)' : 'var(--text-muted)',
            borderBottomColor: active === tab.id ? 'var(--accent-primary)' : 'transparent',
            background: active === tab.id ? 'var(--bg-tertiary)' : 'transparent',
          }}
        >
          <span className="mr-1.5">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
