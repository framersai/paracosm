import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../theme/ThemeProvider';
import type { ScenarioClientPayload } from '../../hooks/useScenario';
import type { GameState } from '../../hooks/useGameState';
import type { useSSE } from '../../hooks/useSSE';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Tooltip } from '../shared/Tooltip';
import { RunMenu } from './RunMenu';
import type { LocalHistoryEntry } from '../../hooks/useLocalHistory.helpers';

/**
 * Mirror the full useSSE return shape so TopBar can read providerError,
 * abortReason, validationFallbacks etc. without any fields getting
 * silently lost behind a narrower inline literal.
 */
type SseState = ReturnType<typeof useSSE>;

interface TopBarProps {
  scenario: ScenarioClientPayload;
  sse: SseState;
  gameState: GameState;
  onSave?: () => void;
  onLoad?: () => void;
  onClear?: () => void;
  onRun?: () => void;
  onTour?: () => void;
  onCopy?: () => void;
  /** F14 local-history props, forwarded to the RunMenu's history section. */
  history?: LocalHistoryEntry[];
  onRestoreHistory?: (entry: LocalHistoryEntry) => void;
  onDeleteHistory?: (id: number) => void;
  onClearHistory?: () => void;
  /** True while the /setup request is in flight but the first SSE
   *  event hasn't yet arrived. Hides the RUN button so users can't
   *  double-launch. `gameState.isRunning` already hides it after
   *  the sim starts emitting events; this covers the gap. */
  launching?: boolean;
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

export function TopBar({ scenario, sse, gameState, onSave, onLoad, onClear, onRun, onTour, onCopy, launching = false, history, onRestoreHistory, onDeleteHistory, onClearHistory }: TopBarProps) {
  const { resolved, setTheme } = useTheme();
  const hasEvents = Object.values(gameState.leaders).some(s => s.events.length > 0);

  // Secondary run actions (Save / Copy / Clear) consolidate behind a
  // single overflow trigger so the right cluster does not carry 9+
  // items at mid-laptop widths. Visible only once a run has events,
  // matching the previous gating on each individual button.
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRootRef = useRef<HTMLDivElement | null>(null);
  const overflowMenuRef = useFocusTrap<HTMLDivElement>(overflowOpen);
  useEffect(() => {
    if (!overflowOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOverflowOpen(false);
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      const root = overflowRootRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) setOverflowOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [overflowOpen]);

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
            {/* Compact T / Y / S tokens wrapped in Tooltip portal so
                viewers can hover for the full meaning. The token stays
                short so the whole topbar meta row fits at mid-laptop
                widths (1024-1440px); the rich explanation lives in the
                popover. */}
            <Tooltip
              content={
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--amber)', marginBottom: 6 }}>
                    Turn {gameState.turn} / {gameState.maxTurns}
                  </div>
                  <div>
                    One decision cycle per turn. Departments analyze the
                    situation, the commander picks a policy, the kernel
                    advances in-sim time, colonists age. At turn
                    {' '}{gameState.maxTurns}{' '}the run finishes and the
                    verdict judge compares the two commanders.
                  </div>
                </div>
              }
            >
              <span style={{ display: 'inline-flex', alignItems: 'baseline' }}>
                <span style={{ color: 'var(--text-3)' }}>T</span>
                <strong style={{ color: 'var(--text-1)' }}>{gameState.turn}</strong>
                <span style={{ color: 'var(--text-3)' }}>/{gameState.maxTurns}</span>
              </span>
            </Tooltip>
            <Tooltip
              content={
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--amber)', marginBottom: 6 }}>
                    In-sim year {gameState.year}
                  </div>
                  <div>
                    The year the colony thinks it's living in. Advances by
                    the scenario's <code>yearsPerTurn</code> (usually 5-10)
                    each decision cycle. Drives aging, childbirth,
                    retirement, and long-arc narrative. Real wall-clock
                    time doesn't matter — only the in-sim year.
                  </div>
                </div>
              }
            >
              <span style={{ display: 'inline-flex', alignItems: 'baseline' }}>
                <span style={{ color: 'var(--text-3)' }}>Y</span>
                <strong style={{ color: 'var(--text-1)' }}>{gameState.year}</strong>
              </span>
            </Tooltip>
            <Tooltip
              content={
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--amber)', marginBottom: 6 }}>
                    Random seed {gameState.seed}
                  </div>
                  <div>
                    All kernel-side randomness (colonist generation, mood
                    drift, crisis selection) derives from this seed. Same
                    seed + same leaders + same scenario produces identical
                    rosters and identical kernel outcomes — so Leader A
                    and Leader B start from the same colony and diverge
                    only by their personalities, not by luck.
                  </div>
                </div>
              }
            >
              <span style={{ display: 'inline-flex', alignItems: 'baseline' }}>
                <span style={{ color: 'var(--text-3)' }}>S</span>
                <strong style={{ color: 'var(--text-1)' }}>{gameState.seed}</strong>
              </span>
            </Tooltip>
            <div className="topbar-progress w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }} role="progressbar" aria-valuenow={gameState.turn} aria-valuemin={0} aria-valuemax={gameState.maxTurns} aria-label={`Simulation progress, turn ${gameState.turn} of ${gameState.maxTurns}`}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((gameState.turn / gameState.maxTurns) * 100)}%`, background: 'linear-gradient(90deg, var(--side-a), var(--side-b))' }} />
            </div>
            {sse.validationFallbacks.length > 0 && (() => {
              const total = sse.validationFallbacks.reduce((sum, b) => sum + b.count, 0);
              return (
                <Tooltip
                  content={
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--amber)', marginBottom: 6 }}>
                        ⚠ {total} validation fallback{total === 1 ? '' : 's'}
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        An LLM call returned a JSON payload that failed zod
                        schema validation. After retries were exhausted the
                        orchestrator continued with an empty skeleton so the
                        sim wouldn't abort mid-turn. Numbers here let you
                        spot which schema is misbehaving.
                      </div>
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                        {sse.validationFallbacks.map(b => (
                          <div key={b.schemaName} style={{
                            fontFamily: 'var(--mono)', fontSize: 11,
                            color: 'var(--text-2)',
                            display: 'flex', justifyContent: 'space-between', gap: 12,
                          }}>
                            <span>{b.schemaName}</span>
                            <span style={{ color: 'var(--text-3)' }}>
                              {b.count}× {b.lastSite ? `(last: ${b.lastSite})` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  }
                >
                  <span
                    aria-label={`${total} validation fallback${total === 1 ? '' : 's'}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '1px 6px', borderRadius: 3,
                      background: 'rgba(232, 180, 74, 0.14)',
                      border: '1px solid var(--amber, #e8b44a)',
                      color: 'var(--amber, #e8b44a)',
                      fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                    }}
                  >
                    <span aria-hidden="true">⚠</span>
                    {total}
                  </span>
                </Tooltip>
              );
            })()}
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
        {/* Run button. Hidden while isRunning OR launching so users
            can't double-fire /setup (which would race against the
            in-flight launch). Swaps to a disabled 'LAUNCHING...' chip
            during the launching window so the UI doesn't appear
            frozen — prior behaviour silently showed nothing. */}
        {onRun && !gameState.isRunning && !launching && (
          <RunMenu
            onRun={onRun}
            onLoadFromFile={onLoad}
            history={history}
            onRestoreHistory={onRestoreHistory}
            onDeleteHistory={onDeleteHistory}
            onClearHistory={onClearHistory}
            liveStateHasEvents={sse.events.length > 0}
          />
        )}
        {launching && !gameState.isRunning && (
          <span
            style={{
              padding: '3px 14px', borderRadius: '4px',
              background: 'var(--bg-card)', color: 'var(--text-3)',
              border: '1px solid var(--border)',
              fontSize: '11px', fontWeight: 700, fontFamily: 'var(--mono)',
              letterSpacing: '0.5px',
              cursor: 'wait',
            }}
            role="status"
            aria-live="polite"
          >
            LAUNCHING…
          </span>
        )}
        {/* Save / Copy / Clear consolidated behind a single overflow
            menu so they don't fight for horizontal space with RUN /
            GITHUB / TOUR / status / theme. Visible only when a run
            has emitted events (same gating the 3 separate buttons
            had before). */}
        {hasEvents && (onSave || onCopy || onClear) && (
          <div ref={overflowRootRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setOverflowOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
              aria-label={overflowOpen ? 'Close run actions' : 'Open run actions menu'}
              title="Save · Copy · Clear"
              style={{
                ...toolBtnStyle,
                width: 28,
                padding: '2px 0',
                lineHeight: 1,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: '0.08em',
              }}
            >
              {'\u22ef'}
            </button>
            {overflowOpen && (
              <div
                ref={overflowMenuRef}
                role="menu"
                tabIndex={-1}
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  minWidth: 160,
                  padding: 4,
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                  zIndex: 60,
                  outline: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                {onSave && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => { setOverflowOpen(false); onSave(); }}
                    style={{
                      textAlign: 'left',
                      padding: '6px 10px',
                      background: 'transparent',
                      color: 'var(--text-2)',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'var(--mono)',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 3,
                    }}
                    title="Export simulation data as .json"
                  >
                    Save
                  </button>
                )}
                {onCopy && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => { setOverflowOpen(false); onCopy(); }}
                    style={{
                      textAlign: 'left',
                      padding: '6px 10px',
                      background: 'transparent',
                      color: 'var(--text-2)',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'var(--mono)',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 3,
                    }}
                    title="Copy simulation summary to clipboard"
                  >
                    Copy
                  </button>
                )}
                {onClear && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => { setOverflowOpen(false); onClear(); }}
                    style={{
                      textAlign: 'left',
                      padding: '6px 10px',
                      background: 'transparent',
                      color: 'var(--rust)',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'var(--mono)',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 3,
                    }}
                    title="Clear all data. Cannot be undone."
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
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
