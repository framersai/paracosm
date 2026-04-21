/**
 * Unified RUN dropdown: new-sim launcher + saved-run picker + file
 * loader in a single popover. Replaces the three separate TopBar
 * buttons (REPLAY / RUN / LOAD) that previously competed for
 * horizontal space.
 *
 * Menu items, in order:
 *   1. ▶ Run New Simulation — fires onRun (spends credits).
 *   2. ↻ Run Saved Simulation — expands into a scrollable grid of
 *      server-cached runs (same card layout the old LoadMenu used).
 *      Disabled when the /sessions catalog is empty.
 *   3. 📁 Load from file — delegates to onLoadFromFile (pulls a
 *      previously-Saved JSON off the user's disk).
 *
 * @module paracosm/cli/dashboard/components/layout/RunMenu
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSessions, type StoredSessionMeta } from '../../hooks/useSessions';
import { resolveSetupRedirectHref } from '../../tab-routing';
import { buildReplayHref, cacheExpandedBody } from './LoadMenu.helpers';
import { Tooltip } from '../shared/Tooltip';

export interface RunMenuProps {
  /** Fires when the user picks "Run New Simulation". */
  onRun?: () => void;
  /** Fires when the user picks "Load from file". */
  onLoadFromFile?: () => void;
}

function formatRelative(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDuration(ms: number | undefined): string {
  if (!ms || ms <= 0) return '·';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatCost(usd: number | undefined): string {
  if (usd == null) return '·';
  if (usd < 0.005) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

function SessionCard({ s, onPick }: { s: StoredSessionMeta; onPick: () => void }) {
  const deterministicTitle = s.leaderA && s.leaderB
    ? `${s.leaderA} vs ${s.leaderB}${s.scenarioName ? ` · ${s.scenarioName}` : ''}`
    : s.scenarioName || 'Simulation Run';
  const title = s.title || s.scenarioName || deterministicTitle;
  const leaders = s.leaderA && s.leaderB ? `${s.leaderA} vs ${s.leaderB}` : '';
  const scenarioSub = s.title && s.scenarioName ? s.scenarioName : '';
  const turns = s.turnCount != null ? `${s.turnCount} turn${s.turnCount === 1 ? '' : 's'}` : '';
  const line2 = [leaders, scenarioSub, turns].filter(Boolean).join(' · ');
  const line3 = `${new Date(s.createdAt).toLocaleString()} (${formatRelative(s.createdAt)}) · ${formatDuration(s.durationMs)} · ${formatCost(s.totalCostUSD)}`;
  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        display: 'block', textAlign: 'left', width: '100%',
        padding: '10px 12px', marginBottom: 6,
        fontSize: 11, fontFamily: 'var(--sans)',
        color: 'var(--text-1)', background: 'var(--bg-canvas)',
        border: '1px solid var(--border)', borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{title}</div>
      {line2 && <div style={{ fontSize: 10, color: 'var(--text-2)', marginBottom: 4 }}>{line2}</div>}
      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{line3}</div>
    </button>
  );
}

export function RunMenu({ onRun, onLoadFromFile }: RunMenuProps) {
  const [open, setOpen] = useState(false);
  const [savedExpanded, setSavedExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { sessions, status, refresh } = useSessions();
  const cacheAvailable = sessions.length > 0;

  // Refresh the catalog each time the dropdown opens so a run that
  // finished since last open shows up without a full reload.
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const close = useCallback(() => {
    setOpen(false);
    setSavedExpanded(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const handleRunNew = () => {
    close();
    onRun?.();
  };

  const handlePickSession = (id: string) => {
    const href = buildReplayHref(window.location.href, id);
    window.location.assign(resolveSetupRedirectHref(href, 'sim'));
  };

  const handleFile = () => {
    close();
    onLoadFromFile?.();
  };

  const body = cacheExpandedBody(status, sessions);

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <Tooltip
        content={
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--amber)', marginBottom: 6 }}>
              Run
            </div>
            <div>
              Launches a fresh simulation, replays a cached one, or
              loads a saved JSON from disk. Click to open the menu.
            </div>
          </div>
        }
      >
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          style={{
            background: 'linear-gradient(135deg, var(--rust), #c44a1e)',
            color: '#fff', border: 'none',
            padding: '3px 14px', borderRadius: '4px',
            fontSize: '11px', fontWeight: 700, cursor: 'pointer',
            fontFamily: 'var(--mono)', letterSpacing: '0.5px',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <span aria-hidden="true">▶</span>
          RUN
          <span aria-hidden="true" style={{ fontSize: 9, opacity: 0.8 }}>▾</span>
        </button>
      </Tooltip>
      {open && (
        <div
          role="menu"
          aria-label="Run actions"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: 'min(520px, calc(100vw - 32px))',
            maxHeight: 'min(70vh, 520px)',
            overflowY: 'auto',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
            padding: 8,
            zIndex: 60,
          }}
        >
          {/* Run New Simulation — primary action, loudest styling. */}
          <button
            type="button"
            role="menuitem"
            onClick={handleRunNew}
            style={{
              display: 'flex', width: '100%',
              justifyContent: 'space-between', alignItems: 'center',
              gap: 10, padding: '10px 12px', marginBottom: 6,
              fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700,
              color: 'var(--bg-canvas)',
              background: 'linear-gradient(135deg, var(--rust), #c44a1e)',
              border: 'none', borderRadius: 4,
              cursor: 'pointer', letterSpacing: '0.04em',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden="true" style={{ fontSize: 13 }}>▶</span>
              <span>Run New Simulation</span>
            </span>
            <span style={{
              fontSize: 9, fontWeight: 600,
              padding: '1px 6px', borderRadius: 3,
              background: 'rgba(0,0,0,0.25)', color: '#fff',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              spends credits
            </span>
          </button>

          {/* Run Saved Simulation — expandable row, disabled when empty. */}
          <button
            type="button"
            role="menuitem"
            onClick={() => cacheAvailable && setSavedExpanded(e => !e)}
            disabled={!cacheAvailable}
            style={{
              display: 'flex', width: '100%',
              justifyContent: 'space-between', alignItems: 'center',
              gap: 10, padding: '10px 12px', marginBottom: 6,
              fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700,
              color: cacheAvailable ? 'var(--bg-canvas)' : 'var(--text-4)',
              background: cacheAvailable
                ? 'linear-gradient(135deg, var(--amber), #b88a1f)'
                : 'var(--bg-card)',
              border: cacheAvailable ? 'none' : '1px solid var(--border)',
              borderRadius: 4,
              cursor: cacheAvailable ? 'pointer' : 'not-allowed',
              opacity: cacheAvailable ? 1 : 0.65,
              letterSpacing: '0.04em',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden="true" style={{ fontSize: 13 }}>↻</span>
              <span>Run Saved Simulation</span>
            </span>
            <span style={{
              fontSize: 9, fontWeight: 600,
              padding: '1px 6px', borderRadius: 3,
              background: cacheAvailable ? 'rgba(0,0,0,0.25)' : 'var(--bg-deep)',
              color: cacheAvailable ? '#fff' : 'var(--text-3)',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              {cacheAvailable
                ? `${sessions.length} cached · ${savedExpanded ? 'hide' : 'pick'}`
                : 'no cache yet'}
            </span>
          </button>

          {/* Expanded saved-run cards. Reuses the old LoadMenu cache
              body states so loading / empty / error render consistently. */}
          {savedExpanded && cacheAvailable && (
            <div style={{ marginBottom: 6 }}>
              {body === 'cards' && sessions.map(s => (
                <SessionCard key={s.id} s={s} onPick={() => handlePickSession(s.id)} />
              ))}
              {body === 'loading' && (
                <div style={{ padding: 10, fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                  Loading cached runs…
                </div>
              )}
              {body === 'error' && (
                <div style={{ padding: 10, fontSize: 11, color: 'var(--rust)', fontFamily: 'var(--mono)' }}>
                  Could not reach /sessions. Try again in a moment.
                </div>
              )}
              {body === 'unavailable' && (
                <div style={{ padding: 10, fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                  Session cache is disabled on this server.
                </div>
              )}
            </div>
          )}

          {/* Load from file — tertiary action, muted styling. */}
          {onLoadFromFile && (
            <button
              type="button"
              role="menuitem"
              onClick={handleFile}
              style={{
                display: 'flex', width: '100%',
                justifyContent: 'space-between', alignItems: 'center',
                gap: 10, padding: '10px 12px',
                fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700,
                color: 'var(--text-2)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)', borderRadius: 4,
                cursor: 'pointer', letterSpacing: '0.04em',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span aria-hidden="true" style={{ fontSize: 13 }}>📁</span>
                <span>Load from file…</span>
              </span>
              <span style={{
                fontSize: 9, fontWeight: 600, color: 'var(--text-3)',
                letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
                json export
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
