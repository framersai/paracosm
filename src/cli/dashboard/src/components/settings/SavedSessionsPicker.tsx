/**
 * @fileoverview "Replay a saved demo" picker for the SettingsPanel.
 *
 * Shown above the Run button so first-time visitors can watch a recorded
 * demo without spending LLM budget. Each row in the list streams via
 * /sessions/:id/replay when picked — the dashboard renders it through
 * the same SSE pipeline used for live runs (see useSSE.ts), so visually
 * the replay is indistinguishable from a fresh sim.
 *
 * Hidden entirely when no saved sessions exist (or when the server has
 * the session store disabled), so the panel doesn't get cluttered with
 * an empty section on a fresh deploy.
 *
 * @module paracosm/cli/dashboard/components/settings/SavedSessionsPicker
 */
import { useSessions, type StoredSessionMeta } from '../../hooks/useSessions';

export interface SavedSessionsPickerProps {
  /** Called when the user picks a session to replay. */
  onReplay: (sessionId: string) => void;
}

function formatRelative(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatDuration(ms: number | undefined): string {
  if (!ms || ms <= 0) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function formatCost(usd: number | undefined): string {
  if (usd == null) return '—';
  if (usd < 0.005) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

function summary(s: StoredSessionMeta): string {
  const parts: string[] = [];
  if (s.scenarioName) parts.push(s.scenarioName);
  if (s.leaderA && s.leaderB) parts.push(`${s.leaderA} vs ${s.leaderB}`);
  if (s.turnCount != null) parts.push(`${s.turnCount} turn${s.turnCount === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

const sectionStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: 16,
  marginBottom: 24,
  background: 'var(--bg-panel)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  marginTop: 8,
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--bg-canvas)',
  cursor: 'pointer',
  transition: 'background 0.1s ease',
};

const buttonStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontFamily: 'var(--mono)',
  fontSize: 11,
  border: '1px solid var(--accent)',
  borderRadius: 4,
  background: 'var(--accent)',
  color: 'var(--bg-canvas)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export function SavedSessionsPicker(props: SavedSessionsPickerProps) {
  const { sessions, status } = useSessions();

  // Hide until we know the server has at least one. No empty state —
  // first-time deploys with no saves yet should not show an empty
  // section telling visitors "0 saved demos".
  if (status === 'loading' || status === 'unavailable' || status === 'error') return null;
  if (sessions.length === 0) return null;

  return (
    <section style={sectionStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text-1)' }}>
          REPLAY A SAVED DEMO
        </h3>
        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>
          {sessions.length} saved · no LLM cost
        </span>
      </div>
      <p style={{ margin: '4px 0 0 0', fontSize: 11, color: 'var(--text-3)' }}>
        Watch a previously-recorded simulation play back at original pacing. Same dashboard, no new
        compute spend. Click any run to replay it.
      </p>

      {sessions.map((s) => (
        <div
          key={s.id}
          style={rowStyle}
          onClick={() => props.onReplay(s.id)}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated, var(--bg-canvas))'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-canvas)'; }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onReplay(s.id); } }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {summary(s) || 'Untitled run'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
              {formatRelative(s.createdAt)} · {formatDuration(s.durationMs)} · {s.eventCount} events · {formatCost(s.totalCostUSD)}
            </div>
          </div>
          <button type="button" style={buttonStyle} onClick={(e) => { e.stopPropagation(); props.onReplay(s.id); }}>
            REPLAY
          </button>
        </div>
      ))}
    </section>
  );
}
