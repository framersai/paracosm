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

/**
 * Animated Paracosm orbital node graph.
 * Hub pulses, nodes orbit slowly, structural lines breathe.
 */
function ParacosmLogo({ size = 20 }: { size?: number }) {
  const { resolved } = useTheme();
  const light = resolved === 'light';

  const hub = light ? '#7a5200' : '#e8b44a';
  const rust = light ? '#a83810' : '#e06530';
  const amber = light ? '#7a5200' : '#e8b44a';
  const teal = light ? '#186060' : '#4ca8a8';
  const line = light ? '#8a7e6c' : '#f5f0e4';

  // Node positions: 6 nodes at 60deg intervals, starting at -75deg
  const cx = 32, cy = 32, orbitR = 21.76, hubR = 5.12, nodeR = 3.52;
  const nodes = Array.from({ length: 6 }, (_, i) => {
    const a = (i * 60 - 75) * Math.PI / 180;
    return { x: cx + Math.cos(a) * orbitR, y: cy + Math.sin(a) * orbitR };
  });
  const colors = [rust, amber, teal, rust, teal, amber];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="Paracosm"
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id="hub-glow">
          <stop offset="0%" stopColor={hub} stopOpacity="0.25" />
          <stop offset="100%" stopColor={hub} stopOpacity="0" />
        </radialGradient>
      </defs>

      <style>{`
        @keyframes pc-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pc-orbit-rev { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        @keyframes pc-hub-pulse { 0%, 100% { r: ${hubR}; opacity: 1; } 50% { r: ${hubR * 1.12}; opacity: 0.85; } }
        @keyframes pc-glow-pulse { 0%, 100% { r: ${hubR * 1.8}; opacity: 0.06; } 50% { r: ${hubR * 2.4}; opacity: 0.12; } }
        @keyframes pc-line-breathe { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.3; } }
        @keyframes pc-cross-breathe { 0%, 100% { opacity: 0.18; } 50% { opacity: 0.08; } }
        @keyframes pc-node-float { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(0, -0.4px); } }
        .pc-orbit-ring { animation: pc-orbit 90s linear infinite; transform-origin: 32px 32px; }
        .pc-cross-ring { animation: pc-orbit-rev 120s linear infinite; transform-origin: 32px 32px; }
        .pc-hub { animation: pc-hub-pulse 4s ease-in-out infinite; }
        .pc-hub-glow { animation: pc-glow-pulse 4s ease-in-out infinite; }
        .pc-spoke { animation: pc-line-breathe 6s ease-in-out infinite; }
        .pc-cross { animation: pc-cross-breathe 8s ease-in-out infinite; }
        .pc-n0 { animation: pc-node-float 5s ease-in-out infinite; }
        .pc-n1 { animation: pc-node-float 5s ease-in-out 0.8s infinite; }
        .pc-n2 { animation: pc-node-float 5s ease-in-out 1.6s infinite; }
        .pc-n3 { animation: pc-node-float 5s ease-in-out 2.4s infinite; }
        .pc-n4 { animation: pc-node-float 5s ease-in-out 3.2s infinite; }
        .pc-n5 { animation: pc-node-float 5s ease-in-out 4.0s infinite; }
        @media (prefers-reduced-motion: reduce) {
          .pc-orbit-ring, .pc-cross-ring, .pc-hub, .pc-hub-glow, .pc-spoke, .pc-cross,
          .pc-n0, .pc-n1, .pc-n2, .pc-n3, .pc-n4, .pc-n5 { animation: none !important; }
        }
      `}</style>

      {/* Hub-to-node spokes — rotate slowly */}
      <g className="pc-orbit-ring">
        {nodes.map((n, i) => (
          <line key={`s${i}`} className="pc-spoke" x1={cx} y1={cy} x2={n.x} y2={n.y} stroke={line} strokeWidth="1.6" />
        ))}
      </g>

      {/* Cross-connections — counter-rotate */}
      <g className="pc-cross-ring">
        {nodes.map((n, i) => {
          const j = (i + 2) % 6;
          return <line key={`c${i}`} className="pc-cross" x1={n.x} y1={n.y} x2={nodes[j].x} y2={nodes[j].y} stroke={line} strokeWidth="1.1" />;
        })}
      </g>

      {/* Hub glow */}
      <circle className="pc-hub-glow" cx={cx} cy={cy} r={hubR * 1.8} fill="url(#hub-glow)" />

      {/* Hub */}
      <circle className="pc-hub" cx={cx} cy={cy} r={hubR} fill={hub} />

      {/* Nodes — orbit with the spokes, float individually */}
      <g className="pc-orbit-ring">
        {nodes.map((n, i) => (
          <circle key={`n${i}`} className={`pc-n${i}`} cx={n.x} cy={n.y} r={nodeR} fill={colors[i]} />
        ))}
      </g>
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
