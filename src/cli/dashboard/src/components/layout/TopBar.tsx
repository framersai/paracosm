import { useTheme } from '../../theme/ThemeProvider';
import type { ScenarioClientPayload } from '../../hooks/useScenario';

interface TopBarProps {
  scenario: ScenarioClientPayload;
  sse: { status: string; events: Array<unknown>; isComplete: boolean };
}

export function TopBar({ scenario, sse }: TopBarProps) {
  const { resolved, setTheme } = useTheme();

  const statusColor = sse.isComplete
    ? 'var(--accent-warm)'
    : sse.status === 'connected'
    ? 'var(--color-success)'
    : 'var(--text-muted)';

  const statusText = sse.isComplete
    ? 'Complete'
    : sse.status === 'connected'
    ? 'Connected'
    : sse.status === 'error'
    ? 'Reconnecting...'
    : 'Connecting...';

  return (
    <div
      className="flex items-center justify-between px-4 py-2 gap-4 border-b shrink-0"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
    >
      {/* Left: Logo + name */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
          {scenario.labels.name.toUpperCase()}
        </span>
        <span className="text-[9px] font-bold tracking-widest font-mono" style={{ color: 'var(--accent-primary)' }}>
          PARACOSM
        </span>
      </div>

      {/* Center: Tagline */}
      <div className="text-xs hidden md:block truncate" style={{ color: 'var(--text-muted)' }}>
        Same {scenario.labels.settlementNoun}, two different leaders. Watch emergent civilizations diverge.
      </div>

      {/* Right: Status + theme toggle */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs font-mono" style={{ color: statusColor }}>
          ● {statusText}
        </span>
        <button
          onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
          className="text-sm px-2 py-1 rounded transition-colors cursor-pointer"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
          }}
          title={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`}
        >
          {resolved === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </div>
  );
}
