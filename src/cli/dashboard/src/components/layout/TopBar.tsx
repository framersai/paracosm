import { useTheme } from '../../theme/ThemeProvider';
import type { ScenarioClientPayload } from '../../hooks/useScenario';
import type { GameState } from '../../hooks/useGameState';

interface TopBarProps {
  scenario: ScenarioClientPayload;
  sse: { status: string; events: Array<unknown>; isComplete: boolean };
  gameState: GameState;
  onSave?: () => void;
  onLoad?: () => void;
  onClear?: () => void;
}

/** Paracosm logo: orbital node graph with cross-connections */
function ParacosmLogo({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Paracosm logo">
      {/* Hub-to-node lines - thick, visible */}
      <line x1="32" y1="32" x2="32" y2="11" stroke="#a89878" strokeWidth="3" />
      <line x1="32" y1="32" x2="50" y2="21" stroke="#a89878" strokeWidth="3" />
      <line x1="32" y1="32" x2="50" y2="43" stroke="#a89878" strokeWidth="3" />
      <line x1="32" y1="32" x2="32" y2="53" stroke="#a89878" strokeWidth="3" />
      <line x1="32" y1="32" x2="14" y2="43" stroke="#a89878" strokeWidth="3" />
      <line x1="32" y1="32" x2="14" y2="21" stroke="#a89878" strokeWidth="3" />
      {/* Cross connections - all 6 pairs */}
      <line x1="32" y1="11" x2="50" y2="43" stroke="#6b5f50" strokeWidth="2" />
      <line x1="50" y1="21" x2="32" y2="53" stroke="#6b5f50" strokeWidth="2" />
      <line x1="50" y1="43" x2="14" y2="21" stroke="#6b5f50" strokeWidth="2" />
      <line x1="32" y1="53" x2="14" y2="21" stroke="#6b5f50" strokeWidth="2" />
      <line x1="14" y1="43" x2="32" y2="11" stroke="#6b5f50" strokeWidth="2" />
      <line x1="14" y1="21" x2="50" y2="21" stroke="#6b5f50" strokeWidth="2" />
      {/* Hub glow */}
      <circle cx="32" cy="32" r="12" fill="#e8b44a" opacity="0.1" />
      {/* Hub */}
      <circle cx="32" cy="32" r="6.5" fill="#e8b44a" />
      {/* Nodes */}
      <circle cx="32" cy="11" r="5" fill="#e06530" />
      <circle cx="50" cy="21" r="5" fill="#e8b44a" />
      <circle cx="50" cy="43" r="5" fill="#4ca8a8" />
      <circle cx="32" cy="53" r="5" fill="#e06530" />
      <circle cx="14" cy="43" r="5" fill="#4ca8a8" />
      <circle cx="14" cy="21" r="5" fill="#e8b44a" />
    </svg>
  );
}

const toolBtnStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  color: 'var(--text-2)',
  border: '1px solid var(--border)',
  padding: '2px 10px',
  borderRadius: '3px',
  fontSize: '10px',
  cursor: 'pointer',
  fontWeight: 600,
  fontFamily: 'var(--mono)',
};

export function TopBar({ scenario, sse, gameState, onSave, onLoad, onClear }: TopBarProps) {
  const { resolved, setTheme } = useTheme();
  const hasEvents = gameState.a.events.length > 0 || gameState.b.events.length > 0;

  const statusColor = sse.isComplete
    ? 'var(--rust)'
    : sse.status === 'connected'
    ? 'var(--color-success)'
    : 'var(--text-3)';

  const statusText = sse.isComplete
    ? 'Complete'
    : sse.status === 'connected'
    ? 'Live'
    : sse.status === 'error'
    ? 'Reconnecting'
    : 'Connecting';

  return (
    <header
      className="topbar flex items-center justify-between px-4 gap-3 shrink-0"
      role="banner"
      style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', height: '44px' }}
    >
      {/* Left: Logo + name + scenario */}
      <div className="flex items-center gap-2 shrink-0">
        <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }} aria-label="Paracosm home">
          <ParacosmLogo size={20} />
        </a>
        <a href="/" style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 700, color: 'var(--text-1)', textDecoration: 'none' }}>
          PARACOSM
        </a>
        <a href="https://agentos.sh" target="_blank" rel="noopener" style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', color: 'var(--rust)', fontFamily: 'var(--mono)', textDecoration: 'none' }} title="AgentOS Runtime">
          AGENTOS
        </a>
        <span style={{ color: 'var(--border)', fontSize: '12px' }} aria-hidden="true">|</span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--amber)', fontFamily: 'var(--mono)' }}>
          {scenario.labels.name}
        </span>
      </div>

      {/* Center: Turn info + progress */}
      <div className="flex items-center gap-3 flex-1 justify-center" style={{ minWidth: 0 }}>
        {gameState.turn > 0 && (
          <div className="topbar-meta flex items-center gap-2" style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text-2)' }}>
            <span>T<strong style={{ color: 'var(--text-1)' }}>{gameState.turn}</strong>/{gameState.maxTurns}</span>
            <span>Y<strong style={{ color: 'var(--text-1)' }}>{gameState.year}</strong></span>
            <span>S<strong style={{ color: 'var(--text-1)' }}>{gameState.seed}</strong></span>
            <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }} role="progressbar" aria-valuenow={gameState.turn} aria-valuemin={0} aria-valuemax={gameState.maxTurns} aria-label="Simulation progress">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((gameState.turn / gameState.maxTurns) * 100)}%`, background: 'linear-gradient(90deg, var(--side-a), var(--side-b))' }} />
            </div>
          </div>
        )}
        <div className="topbar-center hidden md:block truncate" style={{ color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: '10px' }}>
          {gameState.turn === 0 ? `Two leaders. Same ${scenario.labels.settlementNoun}. Emergent divergence.` : ''}
        </div>
      </div>

      {/* Right: Actions + status + theme */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Save/Load/Clear */}
        {hasEvents && onSave && (
          <button onClick={onSave} style={toolBtnStyle} title="Export simulation data as .json" aria-label="Save simulation">Save</button>
        )}
        {onLoad && (
          <button onClick={onLoad} style={toolBtnStyle} title="Load a saved simulation .json file" aria-label="Load simulation">Load</button>
        )}
        {hasEvents && onClear && (
          <button onClick={onClear} style={{ ...toolBtnStyle, color: 'var(--rust)' }} title="Clear all data. Cannot be undone." aria-label="Clear simulation">Clear</button>
        )}

        <span style={{ color: 'var(--border)', fontSize: '12px' }} aria-hidden="true">|</span>

        {/* Status */}
        <span style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: statusColor, fontWeight: 700 }} role="status" aria-live="polite">
          {sse.status === 'connected' && !sse.isComplete ? '\u25CF' : '\u25CB'} {statusText}
        </span>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
          className="px-2 py-0.5 rounded cursor-pointer transition-colors"
          style={{ background: 'var(--bg-card)', color: 'var(--text-3)', border: '1px solid var(--border)', fontSize: '11px' }}
          title={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`}
          aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`}
        >
          {resolved === 'dark' ? '\u2600' : '\u263D'}
        </button>
      </div>
    </header>
  );
}
