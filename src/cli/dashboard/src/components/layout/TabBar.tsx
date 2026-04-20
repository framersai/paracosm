import { useState, useEffect } from 'react';
import type { ScenarioClientPayload } from '../../hooks/useScenario';

type Tab = 'sim' | 'viz' | 'settings' | 'reports' | 'chat' | 'log' | 'about';

interface TabBarProps {
  active: Tab;
  onTabChange: (tab: Tab) => void;
  scenario: ScenarioClientPayload;
}

function TabIcon({ id, size = 16 }: { id: Tab; size?: number }) {
  const s = size;
  const props = { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (id) {
    case 'sim':
      return <svg {...props}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>;
    case 'viz':
      return <svg {...props}><circle cx="8" cy="8" r="3" /><circle cx="16" cy="16" r="3" /><circle cx="18" cy="8" r="2" /><circle cx="6" cy="16" r="2" /><line x1="10.5" y1="9.5" x2="14" y2="14" /></svg>;
    case 'settings':
      return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    case 'reports':
      return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
    case 'chat':
      return <svg {...props}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case 'log':
      return <svg {...props}><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>;
    case 'about':
      return <svg {...props}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>;
  }
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'sim', label: 'SIM' },
  { id: 'viz', label: 'VIZ' },
  { id: 'settings', label: 'SETTINGS' },
  { id: 'reports', label: 'REPORTS' },
  { id: 'chat', label: 'CHAT' },
  { id: 'log', label: 'LOG' },
  { id: 'about', label: 'ABOUT' },
];

// Labels collapse to icons below this width. Raised from 640 so the
// tab row never wraps onto two lines at common tablet + narrow-laptop
// viewports (768-900px) where labels + 7 tabs don't fit horizontally
// and used to force wrap, pushing the viz content down. Icons alone
// comfortably fit 7 tabs in one row at 300px+.
const MOBILE_BREAKPOINT = 900;

export function TabBar({ active, onTabChange, scenario }: TabBarProps) {
  const tabs = TABS.filter(t => t.id !== 'chat' || scenario.policies.characterChat);
  const [compact, setCompact] = useState(window.innerWidth < MOBILE_BREAKPOINT);

  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
          aria-label={tab.label}
          id={`tab-${tab.id}`}
          className="cursor-pointer transition-colors"
          style={{
            padding: compact ? '8px 0' : '8px 0',
            flex: 1,
            fontFamily: 'var(--sans)',
            fontSize: compact ? '10px' : '12px',
            fontWeight: 700,
            letterSpacing: compact ? '0' : '0.5px',
            textTransform: 'uppercase' as const,
            color: active === tab.id ? 'var(--amber)' : 'var(--text-3)',
            background: active === tab.id ? 'var(--bg-card)' : 'transparent',
            border: 'none',
            borderBottom: active === tab.id ? '2px solid var(--amber)' : '2px solid transparent',
            marginBottom: '-1px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: compact ? '2px' : '0',
          }}
        >
          {compact && <TabIcon id={tab.id} size={16} />}
          {!compact && tab.label}
        </button>
      ))}
    </nav>
  );
}
