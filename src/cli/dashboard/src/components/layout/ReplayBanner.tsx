/**
 * Replay-mode banners that sit above the TopBar when ?replay=<id> is
 * active: one when the session exists (REPLAYING SAVED DEMO) and one
 * when it's gone (REPLAY NOT FOUND). Both offer an exit back to live
 * mode.
 */
import styles from './ReplayBanner.module.scss';

interface ReplayBannerProps {
  replaySessionId: string;
}

/** Shown when the replay session was resolved and the stored event
 *  stream is playing back. */
export function ReplayBanner({ replaySessionId: _replaySessionId }: ReplayBannerProps) {
  return (
    <div role="status" className={styles.activeBanner}>
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
        className={styles.exitButton}
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
    <div role="alert" className={styles.notFoundBanner}>
      <span>
        <strong className={styles.notFoundLabel}>REPLAY NOT FOUND</strong>{' '}
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
        className={styles.returnButton}
      >
        ← Back to live mode
      </button>
    </div>
  );
}
