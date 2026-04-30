import { useMemo, useRef } from 'react';
import { useSessions } from '../../hooks/useSessions';

interface LoadPriorRunsCTAProps {
  /** Hide entirely when the session store is unavailable (server flag
   *  off, 503). Default true — caller can set false to keep showing the
   *  explanatory empty state even then. */
  hideWhenUnavailable?: boolean;
}

/**
 * Prominent call-to-action at the top of the Settings (setup) page and
 * the SIM empty state that surfaces prior saved runs. Users can watch
 * any completed run back turn-by-turn without spending API credits.
 *
 * Renders three states:
 *   - loading: skeleton / null (briefly)
 *   - ready + has sessions: grid of 3 recent + "N more" footer
 *   - ready + empty: explanatory copy so users know what will live here
 *   - unavailable: hidden (unless explicitly kept)
 */
export function LoadPriorRunsCTA({ hideWhenUnavailable = true }: LoadPriorRunsCTAProps = {}) {
  const { sessions, status, refresh } = useSessions();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const recent = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .slice(0, 3),
    [sessions],
  );

  if (status === 'loading') return null;
  if (status === 'unavailable' && hideWhenUnavailable) return null;

  const handleOpen = (id: string) => {
    // Build a URL that BOTH carries ?replay=<id> AND lands on tab=sim.
    // Earlier we routed through resolveSetupRedirectHref(href, 'sim'),
    // but that helper is for server /setup redirects — it rebuilds the
    // URL from the redirect path and drops the ?replay query, leaving
    // the user on /sim?tab=sim with no replay session attached.
    const url = new URL(window.location.href);
    url.searchParams.set('replay', id);
    url.searchParams.set('tab', 'sim');
    url.hash = '';
    window.location.assign(url.toString());
  };

  const formatCreatedAt = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const isEmpty = sessions.length === 0;

  return (
    <div
      ref={rootRef}
      style={{
        marginBottom: 20,
        padding: '14px 18px',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${isEmpty ? 'var(--border-hl)' : 'var(--amber)'}`,
        borderRadius: 8,
        boxShadow: 'var(--card-shadow)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: isEmpty ? 'var(--text-3)' : 'var(--amber)',
              fontFamily: 'var(--mono)',
              fontWeight: 800,
              marginBottom: 2,
            }}
          >
            {'\u25B6'} {isEmpty ? 'Replay from cache' : 'Watch a prior run'}
          </div>
          {isEmpty ? (
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-2)',
                fontFamily: 'var(--sans)',
              }}
            >
              No saved runs yet.{' '}
              <span style={{ color: 'var(--text-3)' }}>
                Once any simulation completes it{"'"}s auto-cached here, so you can replay the
                full turn-by-turn playback — every decision, tool forge, and divergence —
                without re-spending credits.
              </span>
            </div>
          ) : (
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-1)',
                fontFamily: 'var(--sans)',
              }}
            >
              Don{"'"}t want to spend credits?{' '}
              <span style={{ color: 'var(--text-3)' }}>
                Replay any of <strong style={{ color: 'var(--amber)' }}>{sessions.length}</strong>{' '}
                cached simulation{sessions.length === 1 ? '' : 's'} turn-by-turn, complete with
                every decision, tool forge, and divergence.
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh prior runs list"
          title="Refresh list"
          style={{
            padding: '4px 10px',
            background: 'var(--bg-card)',
            color: 'var(--text-3)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            cursor: 'pointer',
            fontFamily: 'var(--mono)',
            fontSize: 9,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 800,
          }}
        >
          ↻ Refresh
        </button>
      </div>
      {!isEmpty && (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 8,
        }}
      >
        {recent.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => handleOpen(s.id)}
            aria-label={`Replay ${s.title || s.scenarioName || s.scenarioId || s.id}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '10px 12px',
              background: 'var(--bg-card)',
              color: 'var(--text-1)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              textAlign: 'left',
              transition: 'border-color 120ms, background 120ms',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.borderColor = 'var(--amber)';
              el.style.background = 'var(--bg-elevated)';
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.borderColor = 'var(--border)';
              el.style.background = 'var(--bg-card)';
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--text-1)',
                fontFamily: 'var(--sans)',
              }}
            >
              {s.title || s.scenarioName || s.scenarioId || 'Simulation'}
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 3 }}>
              {s.title && s.scenarioName ? `${s.scenarioName} · ` : ''}
              {typeof s.turnCount === 'number' ? `${s.turnCount} turns · ` : ''}
              {s.leaderA && s.leaderB ? `${s.leaderA} vs ${s.leaderB} · ` : ''}
              {formatCreatedAt(s.createdAt)}
            </span>
            {typeof s.totalCostUSD === 'number' && s.totalCostUSD > 0 && (
              <span style={{ fontSize: 9, color: 'var(--text-4)', marginTop: 1 }}>
                ${s.totalCostUSD.toFixed(2)}
              </span>
            )}
            <span
              style={{
                marginTop: 6,
                fontSize: 9,
                color: 'var(--amber)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontWeight: 800,
              }}
            >
              Replay →
            </span>
          </button>
        ))}
      </div>
      )}
      {!isEmpty && sessions.length > 3 && (
        <div style={{ fontSize: 10, color: 'var(--text-4)', fontStyle: 'italic' }}>
          + {sessions.length - 3} more — use the <strong>LOAD</strong> button in the top bar to
          browse the full list.
        </div>
      )}
    </div>
  );
}
