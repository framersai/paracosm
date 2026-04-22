/**
 * Replay-mode banners that sit above the TopBar when ?replay=<id> is
 * active: one when the session exists (REPLAYING SAVED DEMO) and one
 * when it's gone (REPLAY NOT FOUND). Both offer an exit back to live
 * mode.
 *
 * Extracted from App.tsx.
 */

interface ReplayBannerProps {
  replaySessionId: string;
}

/** Shown when the replay session was resolved and the stored event
 *  stream is playing back. */
export function ReplayBanner({ replaySessionId: _replaySessionId }: ReplayBannerProps) {
  return (
    <div
      role="status"
      style={{
        background: 'var(--accent)',
        color: 'var(--bg-deep)',
        padding: '8px 16px',
        fontFamily: 'var(--mono)',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span>
        <strong>REPLAYING SAVED DEMO</strong> · stored event stream, no LLM calls
      </span>
      <button
        type="button"
        onClick={() => {
          // Drop the ?replay= query, return to live mode. Preserves
          // the rest of the URL (tab, etc) so users return to where
          // they were; the popstate handler in useReplaySessionId
          // re-reads the param and useSSE re-subscribes to /events.
          const url = new URL(window.location.href);
          url.searchParams.delete('replay');
          window.history.pushState({}, '', url.toString());
          window.dispatchEvent(new PopStateEvent('popstate'));
        }}
        style={{
          padding: '4px 10px',
          background: 'transparent',
          border: '1px solid var(--bg-deep)',
          color: 'var(--bg-deep)',
          borderRadius: 4,
          cursor: 'pointer',
          fontFamily: 'var(--mono)',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        EXIT REPLAY
      </button>
    </div>
  );
}

/** Shown when the ?replay= id no longer exists in the 10-run server
 *  cache (evicted, or URL was mistyped). Clicking "Back to live mode"
 *  drops the query param and reloads into the live /events feed. */
export function ReplayNotFoundBanner({ replaySessionId }: ReplayBannerProps) {
  return (
    <div
      role="alert"
      style={{
        background: 'rgba(196, 74, 30, 0.15)',
        color: 'var(--text-1)',
        padding: '12px 16px',
        fontFamily: 'var(--mono)',
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        borderBottom: '1px solid var(--rust)',
      }}
    >
      <span>
        <strong style={{ color: 'var(--rust)' }}>REPLAY NOT FOUND</strong>{' '}
        · The saved run <code>{replaySessionId}</code> no longer exists. It may have been evicted from the 10-run cache, or the URL was mistyped.
      </span>
      <button
        type="button"
        onClick={() => {
          const url = new URL(window.location.href);
          url.searchParams.delete('replay');
          window.history.replaceState({}, '', url.toString());
          window.location.reload();
        }}
        style={{
          background: 'var(--bg-card)',
          color: 'var(--text-1)',
          border: '1px solid var(--border)',
          padding: '6px 14px',
          fontFamily: 'var(--mono)',
          fontSize: 11,
          fontWeight: 800,
          cursor: 'pointer',
          borderRadius: 4,
          whiteSpace: 'nowrap',
        }}
      >
        ← Back to live mode
      </button>
    </div>
  );
}
