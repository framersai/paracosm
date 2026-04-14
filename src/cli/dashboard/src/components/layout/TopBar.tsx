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
  onRun?: () => void;
  onTour?: () => void;
  onCopy?: () => void;
}

/**
 * Animated Paracosm logo. Exact brand SVG structure with subtle
 * glow/pulse/breathe animations. Node positions never move.
 */
function ParacosmLogo({ size = 20 }: { size?: number }) {
  const { resolved } = useTheme();
  const light = resolved === 'light';
  const src = light ? '/brand/icons/paracosm-icon-64-light.svg' : '/brand/icons/paracosm-icon-64.svg';

  return (
    <span style={{ display: 'block', width: size, height: size, position: 'relative' }}>
      <img src={src} width={size} height={size} alt="Paracosm" style={{ display: 'block' }} />
      <span className="pc-logo-glow" style={{
        position: 'absolute', inset: '-30%', borderRadius: '50%', pointerEvents: 'none',
        background: `radial-gradient(circle, ${light ? 'rgba(122,82,0,.12)' : 'rgba(232,180,74,.15)'} 0%, transparent 70%)`,
      }} />
    </span>
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

export function TopBar({ scenario, sse, gameState, onSave, onLoad, onClear, onRun, onTour, onCopy }: TopBarProps) {
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
        <a href="/" style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 700, color: 'var(--text-1)', textDecoration: 'none', letterSpacing: '.08em' }}>
          PARA<span style={{ color: 'var(--amber)' }}>COSM</span>
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
        {/* Tour button */}
        {onTour && (
          <button
            onClick={onTour}
            style={{
              background: 'var(--bg-card)', color: 'var(--amber)',
              border: '1px solid var(--amber-dim, var(--border))',
              padding: '2px 10px', borderRadius: '3px',
              fontSize: '10px', cursor: 'pointer', fontWeight: 600,
              fontFamily: 'var(--mono)', letterSpacing: '0.3px',
            }}
            title="Interactive guided tour with sample data"
            aria-label="Start guided tour"
          >
            HOW IT WORKS
          </button>
        )}
        {/* Run button */}
        {onRun && !gameState.isRunning && (
          <button
            onClick={onRun}
            style={{
              background: 'linear-gradient(135deg, var(--rust), #c44a1e)', color: '#fff',
              border: 'none', padding: '3px 14px', borderRadius: '4px',
              fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--mono)',
              letterSpacing: '0.5px',
            }}
            title="Launch simulation with current settings"
            aria-label="Run simulation"
          >
            RUN
          </button>
        )}
        {/* Save/Load/Clear */}
        {hasEvents && onSave && (
          <button onClick={onSave} style={toolBtnStyle} title="Export simulation data as .json" aria-label="Save simulation">Save</button>
        )}
        {hasEvents && onCopy && (
          <button onClick={onCopy} style={toolBtnStyle} title="Copy simulation summary to clipboard" aria-label="Copy summary">Copy</button>
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
