/**
 * Dropdown variant of the TopBar Load button. Two rows:
 * - Load from file: delegates to the existing file picker via prop.
 * - Load from cache: expands inline to a card grid of the last N
 *   server-side saved runs (driven by useSessions). Cards navigate
 *   to /sim?replay=<id> to trigger SSE playback via the existing
 *   useSSE hook.
 *
 * Keyboard: Tab cycles rows/cards, Enter/Space activates, Esc closes.
 *
 * @module paracosm/cli/dashboard/components/layout/LoadMenu
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSessions, type StoredSessionMeta } from '../../hooks/useSessions';
import { resolveSetupRedirectHref } from '../../tab-routing';
import {
  formatExplicit,
  shouldShowCacheRow,
  cacheExpandedBody,
  buildReplayHref,
} from './LoadMenu.helpers';

export interface LoadMenuProps {
  /** Called when the user picks "Load from file". */
  onLoadFromFile: () => void;
}

const triggerStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  color: 'var(--text-2)',
  border: '1px solid var(--border)',
  padding: '2px 10px',
  borderRadius: 3,
  fontSize: 10,
  cursor: 'pointer',
  fontWeight: 600,
  fontFamily: 'var(--mono)',
};

const popoverStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  right: 0,
  width: 'min(520px, calc(100vw - 32px))',
  maxHeight: 'min(70vh, 480px)',
  overflowY: 'auto',
  background: 'var(--bg-panel)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  boxShadow: 'var(--card-shadow, 0 8px 24px rgba(0,0,0,.35))',
  padding: 8,
  zIndex: 50,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  fontSize: 12,
  fontFamily: 'var(--mono)',
  color: 'var(--text-1)',
  background: 'var(--bg-canvas)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  cursor: 'pointer',
  marginBottom: 6,
};

const cardStyle: React.CSSProperties = {
  display: 'block',
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 11,
  fontFamily: 'var(--sans)',
  color: 'var(--text-1)',
  background: 'var(--bg-canvas)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  cursor: 'pointer',
  width: '100%',
  marginBottom: 6,
};

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

function Card({ s, onPick }: { s: StoredSessionMeta; onPick: () => void }) {
  const title = s.scenarioName || 'Untitled run';
  const leaders = s.leaderA && s.leaderB ? `${s.leaderA} vs ${s.leaderB}` : '';
  const turns = s.turnCount != null ? `${s.turnCount} turn${s.turnCount === 1 ? '' : 's'}` : '';
  const line2 = [leaders, turns].filter(Boolean).join(' · ');
  const line3 = `${formatExplicit(s.createdAt)} (${formatRelative(s.createdAt)}) · ${formatDuration(s.durationMs)} · ${formatCost(s.totalCostUSD)}`;
  return (
    <button
      type="button"
      style={cardStyle}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(); }
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{title}</div>
      {line2 && <div style={{ fontSize: 10, color: 'var(--text-2)', marginBottom: 4 }}>{line2}</div>}
      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{line3}</div>
    </button>
  );
}

export function LoadMenu(props: LoadMenuProps) {
  const [open, setOpen] = useState(false);
  // Cache section opens expanded by default so cached runs are visible
  // the moment the menu opens; users one step closer to "watch a prior
  // simulation" without a second click.
  const [cacheExpanded, setCacheExpanded] = useState(true);
  const { sessions, status } = useSessions();
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setCacheExpanded(true);
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

  const handleFile = () => {
    props.onLoadFromFile();
    close();
  };

  const handlePick = (id: string) => {
    const href = buildReplayHref(window.location.href, id);
    window.location.assign(resolveSetupRedirectHref(href, 'sim'));
  };

  const body = cacheExpandedBody(status, sessions);

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        style={triggerStyle}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Load a saved simulation (from file or from server cache)"
        onClick={() => setOpen(o => !o)}
      >
        Load
      </button>
      {open && (
        <div role="menu" style={popoverStyle}>
          {shouldShowCacheRow(status) && (
            <>
              <div role="menuitem" tabIndex={0} style={rowStyle} onClick={() => setCacheExpanded(v => !v)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCacheExpanded(v => !v); } }}
                aria-expanded={cacheExpanded}
              >
                <span>Load from cache</span>
                <span style={{ color: 'var(--text-3)', fontSize: 10 }}>
                  {status === 'loading' ? '...' : `${sessions.length} saved`}
                </span>
              </div>
              {cacheExpanded && body === 'loading' && (
                <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                  Loading cached runs...
                </div>
              )}
              {cacheExpanded && body === 'empty' && (
                <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-3)' }}>
                  No cached runs yet. Completed runs appear here automatically.
                </div>
              )}
              {/*
                Cards list caps at roughly 5 cards of visible height and
                scrolls the rest. Each card is ~70px tall (3 text lines +
                12px vertical padding + 6px bottom margin); 5 * 70 = 350.
              */}
              {cacheExpanded && body === 'cards' && (
                <div style={{ marginTop: 4, maxHeight: 350, overflowY: 'auto' }}>
                  {sessions.map(s => (
                    <Card key={s.id} s={s} onPick={() => handlePick(s.id)} />
                  ))}
                </div>
              )}
            </>
          )}

          <div role="menuitem" tabIndex={0} style={rowStyle} onClick={handleFile}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleFile(); } }}
          >
            <span>Load from file</span>
            <span style={{ color: 'var(--text-3)', fontSize: 10 }}>.json</span>
          </div>
        </div>
      )}
    </div>
  );
}
