import { useTheme } from '../../theme/ThemeProvider';
import type { ScenarioClientPayload } from '../../hooks/useScenario';
import type { GameState } from '../../hooks/useGameState';

interface TopBarProps {
  scenario: ScenarioClientPayload;
  sse: { status: string; events: Array<unknown>; isComplete: boolean };
  gameState: GameState;
}

/** Paracosm logo: orbital node graph */
function ParacosmLogo({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="plogo" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--rust, #e06530)" />
          <stop offset="50%" stopColor="var(--amber, #e8b44a)" />
          <stop offset="100%" stopColor="var(--teal, #4ca8a8)" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="8" fill="url(#plogo)" />
      <circle cx="32" cy="12" r="4" fill="var(--rust, #e06530)" opacity="0.9" />
      <circle cx="48" cy="20" r="4" fill="var(--amber, #e8b44a)" opacity="0.9" />
      <circle cx="48" cy="44" r="4" fill="var(--teal, #4ca8a8)" opacity="0.9" />
      <circle cx="32" cy="52" r="4" fill="var(--teal, #4ca8a8)" opacity="0.9" />
      <circle cx="16" cy="44" r="4" fill="var(--amber, #e8b44a)" opacity="0.9" />
      <circle cx="16" cy="20" r="4" fill="var(--rust, #e06530)" opacity="0.9" />
      <path d="M32 32L32 12M32 32L48 20M32 32L48 44M32 32L32 52M32 32L16 44M32 32L16 20" stroke="url(#plogo)" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}

export function TopBar({ scenario, sse, gameState }: TopBarProps) {
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
      className="flex items-center justify-between px-4 gap-4 shrink-0"
      style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)', height: '36px' }}
    >
      {/* Left: Logos + scenario name */}
      <div className="flex items-center gap-2 shrink-0">
        <ParacosmLogo size={20} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
          PARACOSM
        </span>
        <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', color: 'var(--rust, #e06530)', fontFamily: 'var(--font-mono)' }}>
          AGENTOS
        </span>
        <span style={{ color: 'var(--border-primary)', margin: '0 4px', fontSize: '12px' }}>|</span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
          {scenario.labels.name}
        </span>
      </div>

      {/* Center: Tagline */}
      <div className="text-xs hidden md:block truncate" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
        Two leaders. Same {scenario.labels.settlementNoun}. Emergent divergence.
      </div>

      {/* Right: Turn info + status + theme toggle */}
      <div className="flex items-center gap-3 shrink-0">
        {gameState.turn > 0 && (
          <div className="flex items-center gap-2" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            <span>T<strong style={{ color: 'var(--text-primary)' }}>{gameState.turn}</strong>/{gameState.maxTurns}</span>
            <span>Y<strong style={{ color: 'var(--text-primary)' }}>{gameState.year}</strong></span>
            <span>S<strong style={{ color: 'var(--text-primary)' }}>{gameState.seed}</strong></span>
            <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-primary)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.round((gameState.turn / gameState.maxTurns) * 100)}%`,
                  background: 'linear-gradient(90deg, var(--side-a), var(--side-b))',
                }}
              />
            </div>
          </div>
        )}
        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: statusColor, fontWeight: 700 }}>
          {sse.status === 'connected' && !sse.isComplete ? '●' : '○'} {statusText}
        </span>
        <button
          onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
          className="px-2 py-0.5 rounded cursor-pointer transition-colors"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-subtle)',
            fontSize: '11px',
          }}
          title={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`}
        >
          {resolved === 'dark' ? '☀' : '☽'}
        </button>
      </div>
    </div>
  );
}
