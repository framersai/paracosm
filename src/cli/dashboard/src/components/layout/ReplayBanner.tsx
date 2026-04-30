/**
 * Replay-mode banners that sit above the TopBar when ?replay=<id> is
 * active: one when the session exists (REPLAYING SAVED DEMO) and one
 * when it's gone (REPLAY NOT FOUND). Both offer an exit back to live
 * mode.
 */
import { useEffect, useState } from 'react';
import type { StoredSessionMeta } from '../../hooks/useSessions';
import styles from './ReplayBanner.module.scss';

interface ReplayBannerProps {
  replaySessionId: string;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Shown when the replay session was resolved and the stored event
 *  stream is playing back. Fetches /sessions/:id on mount so the
 *  banner can name which run is replaying instead of just saying
 *  "REPLAYING SAVED DEMO" — viewers were ending up on a replay with
 *  no idea which scenario / leaders / date they were watching. */
export function ReplayBanner({ replaySessionId }: ReplayBannerProps) {
  const [meta, setMeta] = useState<StoredSessionMeta | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/sessions/${encodeURIComponent(replaySessionId)}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { meta?: StoredSessionMeta };
        if (!cancelled && data?.meta) setMeta(data.meta);
      } catch {
        /* network blip — leave meta null and show the generic banner. */
      }
    })();
    return () => { cancelled = true; };
  }, [replaySessionId]);

  const headline = meta?.title || meta?.scenarioName || 'saved run';
  const subline: string[] = [];
  if (meta) {
    if (meta.leaderA && meta.leaderB) subline.push(`${meta.leaderA} vs ${meta.leaderB}`);
    if (typeof meta.turnCount === 'number' && meta.turnCount > 0) subline.push(`${meta.turnCount} turns`);
    if (typeof meta.totalCostUSD === 'number' && meta.totalCostUSD > 0) subline.push(`$${meta.totalCostUSD.toFixed(2)}`);
    if (meta.createdAt) subline.push(formatTimestamp(meta.createdAt));
  }
  return (
    <div role="status" className={styles.activeBanner}>
      <span>
        <strong>REPLAYING</strong> · {headline}
        {subline.length > 0 && <span style={{ opacity: 0.7 }}> · {subline.join(' · ')}</span>}
        <span style={{ opacity: 0.55, marginLeft: 8 }}>stored event stream, no LLM calls</span>
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
