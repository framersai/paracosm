/**
 * Compact "Replay last successful run" affordance shown above the
 * loaded-scenario CTA on the Quickstart input phase. Fetches
 * `/sessions` (the auto-saved replayable session ring), surfaces a
 * one-click link to the replay surface (`?replay=<sessionId>`) when
 * there's a recent saved session. Renders nothing when there's no
 * eligible session — no visual noise on a fresh install.
 *
 * Why /sessions and not /api/v1/runs: the replay query parameter is
 * resolved against the session store (server-app `/sessions/:id/replay`),
 * not the run-history table. A run-record id is NOT a session id, so an
 * earlier version of this CTA produced "Run replay" clicks that landed
 * on a 404 SSE stream and silently did nothing.
 *
 * Replay infrastructure already exists: `useReplaySessionId` reads the
 * query param, `App.tsx` switches the SSE source to
 * `/sessions/<id>/replay`, and `ReplayBanner` advertises the mode.
 * This component is just the CTA that hands off into it.
 *
 * @module paracosm/dashboard/quickstart/ReplayLastRunCTA
 */
import * as React from 'react';
import { useEffect, useState } from 'react';
import { buildReplayHref } from '../layout/LoadMenu.helpers';
import styles from './ReplayLastRunCTA.module.scss';

void React;

interface SessionRecord {
  id: string;
  title?: string;
  leaderA?: string;
  leaderB?: string;
  eventCount?: number;
  durationMs?: number;
  createdAt?: number;
}

export function ReplayLastRunCTA() {
  const [session, setSession] = useState<SessionRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/sessions');
        if (!res.ok) return;
        const body = (await res.json().catch(() => null)) as { sessions?: SessionRecord[] } | null;
        // `sessions` is returned newest-first by the server's
        // listSessions implementation. Pick the head.
        const first = body?.sessions?.[0];
        if (cancelled || !first?.id) return;
        setSession(first);
      } catch {
        // Server / network unavailable — render nothing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!session) return null;
  const href = typeof window !== 'undefined'
    ? buildReplayHref(window.location.href, session.id)
    : `?replay=${encodeURIComponent(session.id)}`;
  const subtitle =
    session.title ||
    [session.leaderA, session.leaderB].filter((v): v is string => typeof v === 'string' && v.length > 0).join(' vs ') ||
    session.id;
  const meta = [
    typeof session.eventCount === 'number' ? `${session.eventCount} events` : null,
    typeof session.durationMs === 'number' ? `${Math.round(session.durationMs / 1000)}s` : null,
    typeof session.createdAt === 'number' ? new Date(session.createdAt).toISOString().slice(0, 10) : null,
  ]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' · ');

  return (
    <a className={styles.card} href={href} aria-label={`Replay last run: ${subtitle}`}>
      <span className={styles.eyebrow}>Replay last run</span>
      <span className={styles.row}>
        <span className={styles.actor}>{subtitle}</span>
        <span className={styles.arrow} aria-hidden="true">▶</span>
      </span>
      {meta && <span className={styles.meta}>{meta}</span>}
    </a>
  );
}
