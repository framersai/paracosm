import { useTheme } from '../../theme/ThemeProvider';
import type { ScenarioClientPayload } from '../../hooks/useScenario';
import type { GameState } from '../../hooks/useGameState';
import { LoadMenu } from './LoadMenu';

interface TopBarProps {
  scenario: ScenarioClientPayload;
  sse: { status: string; events: Array<unknown>; isComplete: boolean; isAborted?: boolean };
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

  // Status pill priority (highest first):
  //   1. Interrupted — sim was cancelled (user navigated away, server
  //      pulled the plug, quota exhausted). Hover surfaces the specific
  //      reason captured from the first sim_aborted SSE event.
  //   2. Complete — sim finished all turns, verdict broadcast.
  //   3. Live / Reconnecting / Connecting — SSE connection state.
  const statusColor = sse.isAborted
    ? 'var(--amber)'
    : sse.isComplete
    ? 'var(--green)'
    : sse.status === 'connected'
    ? 'var(--color-success)'
    : 'var(--text-3)';

  const statusText = sse.isAborted
    ? 'Interrupted'
    : sse.isComplete
    ? 'Complete'
    : sse.status === 'connected'
    ? 'Live'
    : sse.status === 'error'
    ? 'Reconnecting'
    : 'Connecting';

  // Human-readable tooltip. Every pill state gets a one-line hint, and
  // an interrupted run additionally names the cause (quota, disconnect,
  // user cancel) so the user knows whether to retry, top up credits,
  // or keep the partial results.
  const abortReasonLabel = (raw: string): string => {
    switch (raw) {
      case 'client_disconnected': return 'browser tab closed before the sim finished';
      case 'quota_exhausted': return 'provider credits exhausted';
      case 'user_aborted': return 'cancelled by the user';
      case 'provider_error': return 'provider returned an unrecoverable error';
      case 'unknown': return 'reason not recorded by the server';
      default: return raw;
    }
  };
  const statusTitle = sse.isAborted
    ? (() => {
        // Provider errors take priority over the generic abort reason
        // because they are always the actionable cause (top up credits,
        // fix the key). The orchestrator does not emit sim_aborted for
        // provider errors, so without this branch the pill would read
        // "reason not recorded" on quota exhaustion.
        if (sse.providerError) {
          return `Run interrupted: ${sse.providerError.message}. Click Clear to reset.`;
        }
        const r = sse.abortReason;
        if (!r) return 'Run was interrupted before finishing all turns. Click Clear to reset.';
        const base = `Run interrupted: ${abortReasonLabel(r.reason)}`;
        const where = typeof r.completedTurns === 'number'
          ? ` after ${r.completedTurns} turn${r.completedTurns === 1 ? '' : 's'}`
          : '';
        return `${base}${where}. Click Clear to reset.`;
      })()
    : sse.isComplete
    ? 'Run finished all turns. Verdict is broadcast in Reports.'
    : sse.status === 'connected'
    ? 'Connected to the simulation server. Press RUN to start.'
    : sse.status === 'error'
    ? 'Reconnecting to the simulation server.'
    : 'Connecting to the simulation server.';

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
        <a href="https://agentos.sh" target="_blank" rel="noopener" className="topbar-agentos" style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', color: 'var(--rust)', fontFamily: 'var(--mono)', textDecoration: 'none' }} title="AgentOS Runtime">
          AGENTOS
        </a>
        <span className="topbar-agentos" style={{ color: 'var(--border)', fontSize: '12px' }} aria-hidden="true">|</span>
        <span className="topbar-scenario" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--amber)', fontFamily: 'var(--mono)' }}>
          {scenario.labels.name}
        </span>
      </div>

      {/* Center: Turn info + progress */}
      <div className="flex items-center gap-3 flex-1 justify-center" style={{ minWidth: 0 }}>
        {gameState.turn > 0 && (
          <div className="topbar-meta flex items-center gap-2 shrink-0" style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text-2)', minWidth: 0 }}>
            {/* Compact short labels with hover tooltips for full meaning.
                Previous "Turn 5/6 Yr 2067 Seed 950" pushed the block wide
                enough to collide with the scenario name at ~1200-1400px. */}
            <span title={`Turn ${gameState.turn} of ${gameState.maxTurns}`}>
              <span style={{ color: 'var(--text-3)' }}>T</span>
              <strong style={{ color: 'var(--text-1)' }}>{gameState.turn}</strong>
              <span style={{ color: 'var(--text-3)' }}>/{gameState.maxTurns}</span>
            </span>
            <span title={`Year ${gameState.year}`}>
              <span style={{ color: 'var(--text-3)' }}>Y</span>
              <strong style={{ color: 'var(--text-1)' }}>{gameState.year}</strong>
            </span>
            <span title={`Seed ${gameState.seed} — same seed produces the same deterministic kernel outcomes`}>
              <span style={{ color: 'var(--text-3)' }}>S</span>
              <strong style={{ color: 'var(--text-1)' }}>{gameState.seed}</strong>
            </span>
            <div className="topbar-progress w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }} role="progressbar" aria-valuenow={gameState.turn} aria-valuemin={0} aria-valuemax={gameState.maxTurns} aria-label={`Simulation progress, turn ${gameState.turn} of ${gameState.maxTurns}`}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((gameState.turn / gameState.maxTurns) * 100)}%`, background: 'linear-gradient(90deg, var(--side-a), var(--side-b))' }} />
            </div>
            {sse.validationFallbacks.length > 0 && (
              <span
                title={`Validation fallbacks (schema retries exhausted; sim continued with empty skeleton):\n${sse.validationFallbacks.map(b => `  ${b.schemaName}: ${b.count}× (last: ${b.lastSite ?? 'n/a'})`).join('\n')}`}
                aria-label={`${sse.validationFallbacks.reduce((sum, b) => sum + b.count, 0)} validation fallbacks`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '1px 6px', borderRadius: 3,
                  background: 'rgba(232, 180, 74, 0.14)',
                  border: '1px solid var(--amber, #e8b44a)',
                  color: 'var(--amber, #e8b44a)',
                  fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                  cursor: 'help',
                }}
              >
                <span aria-hidden="true">⚠</span>
                {sse.validationFallbacks.reduce((sum, b) => sum + b.count, 0)}
              </span>
            )}
          </div>
        )}
        <div className="topbar-center hidden md:block truncate" style={{ color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: '10px' }}>
          {gameState.turn === 0 ? `Two leaders. Same ${scenario.labels.settlementNoun}. Emergent divergence.` : ''}
        </div>
      </div>

      {/* Right: Actions + status + theme */}
      <div className="flex items-center gap-2 shrink-0">
        {/* GitHub CTA — subtle teal-bordered link with mark + label.
            Hides label on narrow viewports, keeps icon for tap target. */}
        <a
          href="https://github.com/framersai/paracosm"
          target="_blank"
          rel="noopener noreferrer"
          className="topbar-github"
          title="Star Paracosm on GitHub"
          aria-label="Open Paracosm on GitHub"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '2px 10px 2px 8px', borderRadius: 3,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-2)',
            fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.5px', textDecoration: 'none',
            transition: 'border-color 0.15s, color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--amber)';
            e.currentTarget.style.color = 'var(--amber)';
            e.currentTarget.style.background = 'rgba(232,180,74,0.06)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.color = 'var(--text-2)';
            e.currentTarget.style.background = 'var(--bg-card)';
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          <span className="topbar-github-label">GITHUB</span>
        </a>

        {/* Tour button */}
        {onTour && (
          <button
            onClick={onTour}
            className="topbar-tour"
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
            <span className="topbar-tour-label">HOW IT WORKS</span>
            <span className="topbar-tour-icon" aria-hidden="true" style={{ display: 'none' }}>{'\u003F'}</span>
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
        {onLoad && <LoadMenu onLoadFromFile={onLoad} />}
        {hasEvents && onClear && (
          <button onClick={onClear} style={{ ...toolBtnStyle, color: 'var(--rust)' }} title="Clear all data. Cannot be undone." aria-label="Clear simulation">Clear</button>
        )}

        <span style={{ color: 'var(--border)', fontSize: '12px' }} aria-hidden="true">|</span>

        {/* Status */}
        <span
          style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: statusColor, fontWeight: 700, cursor: 'help' }}
          role="status"
          aria-live="polite"
          title={statusTitle}
        >
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
