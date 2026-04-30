import { useState, useEffect } from 'react';
import type { ScenarioClientPayload } from '../../hooks/useScenario';

type Tab = 'quickstart' | 'sim' | 'viz' | 'settings' | 'reports' | 'library' | 'studio' | 'chat' | 'about';

interface TabBarProps {
  active: Tab;
  onTabChange: (tab: Tab) => void;
  scenario: ScenarioClientPayload;
}

function TabIcon({ id, size = 16 }: { id: Tab; size?: number }) {
  const s = size;
  const props = { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (id) {
    case 'quickstart':
      return <svg {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
    case 'sim':
      return <svg {...props}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>;
    case 'viz':
      return <svg {...props}><circle cx="8" cy="8" r="3" /><circle cx="16" cy="16" r="3" /><circle cx="18" cy="8" r="2" /><circle cx="6" cy="16" r="2" /><line x1="10.5" y1="9.5" x2="14" y2="14" /></svg>;
    case 'settings':
      return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    case 'reports':
      return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
    case 'library':
      return <svg {...props}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>;
    case 'studio':
      return <svg {...props}><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>;
    case 'chat':
      return <svg {...props}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case 'about':
      return <svg {...props}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>;
  }
}

// Tab order matches the user's run-lifecycle journey, left to right:
//   1. Author    QUICKSTART (quick path) / STUDIO (deep path)
//   2. Live run  SIM / VIZ / CHAT
//   3. Analyze   REPORTS / LIBRARY
//   4. Config    SETTINGS
//   5. Meta      ABOUT
//
// BRANCHES is a sub-tab of STUDIO (branch creation is structurally an
// authoring action). LOG is a sub-tab of SETTINGS (developer-leaning
// surface). Old `?tab=branches` / `?tab=log` URLs redirect via
// tab-routing.ts so deep-links from before the merge still resolve.
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'quickstart', label: 'QUICKSTART' },
  { id: 'studio', label: 'STUDIO' },
  { id: 'sim', label: 'SIM' },
  { id: 'viz', label: 'VIZ' },
  { id: 'chat', label: 'CHAT' },
  { id: 'reports', label: 'REPORTS' },
  { id: 'library', label: 'LIBRARY' },
  { id: 'settings', label: 'SETTINGS' },
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
      {tabs.map((tab, idx) => (
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
            // Vertical divider on every tab except the last so the row
            // reads as separate cells. Without this, eleven labels at
            // 12px spacing blurred into one fuzzy band. The right-edge
            // border drops on the active tab so its amber-underline
            // chip reads cleanly.
            borderRight: idx < tabs.length - 1 && active !== tab.id
              ? '1px solid var(--border)'
              : 'none',
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
