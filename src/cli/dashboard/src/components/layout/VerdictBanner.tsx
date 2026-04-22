/**
 * Global verdict banner. Visible on every tab as soon as the verdict
 * LLM returns; closable per-verdict (a new run's headline re-shows the
 * banner even after dismissal). Click the middle strip or the "View
 * Full Verdict" button to open the full breakdown modal; the "Reports"
 * chip jumps to the Reports tab.
 *
 * Extracted from App.tsx.
 */
import type { DashboardTab } from '../../tab-routing';

interface VerdictBannerProps {
  verdict: Record<string, unknown> | null;
  currentTurn: number;
  maxTurns: number;
  dismissedKey: string | null;
  onOpenModal: () => void;
  onDismiss: (key: string) => void;
  onNavigateTab: (tab: Exclude<DashboardTab, 'about'>) => void;
}

export function VerdictBanner({
  verdict,
  currentTurn,
  maxTurns,
  dismissedKey,
  onOpenModal,
  onDismiss,
  onNavigateTab,
}: VerdictBannerProps) {
  if (!verdict || !verdict.winner) return null;
  const headline = String(verdict.headline || '');
  const winnerKey = `${verdict.winner}|${headline}`;
  if (dismissedKey === winnerKey) return null;
  const winner = verdict.winner as 'A' | 'B' | 'tie';
  const winColor = winner === 'A' ? 'var(--vis)' : winner === 'B' ? 'var(--eng)' : 'var(--amber)';
  const winnerLabel = winner === 'tie'
    ? 'Tie'
    : `${String(verdict.winnerName || 'Winner')} wins`;
  const turnLabel = `Turn ${currentTurn}/${maxTurns} · verdict by gpt-4o`;
  return (
    <div
      role="region"
      aria-label="Simulation verdict"
      style={{
        margin: '8px 16px 4px',
        padding: '14px 18px',
        background: `linear-gradient(135deg, ${winColor}22 0%, var(--bg-panel) 55%, var(--bg-panel) 100%)`,
        border: `1px solid ${winColor}`,
        borderLeft: `4px solid ${winColor}`,
        borderRadius: 8,
        boxShadow: `0 6px 22px rgba(0, 0, 0, 0.35), 0 0 0 1px ${winColor}33 inset`,
        fontFamily: 'var(--sans)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        animation: 'fadeUp 0.28s ease-out',
      }}
    >
      <div style={{ flex: '0 0 auto', minWidth: 0 }}>
        <div style={{
          fontSize: 9, fontWeight: 800, color: 'var(--text-3)',
          letterSpacing: '0.15em', textTransform: 'uppercase',
          fontFamily: 'var(--mono)', marginBottom: 3,
        }}>
          ★ Run Complete
        </div>
        <div style={{
          fontSize: 20, fontWeight: 800, color: winColor,
          lineHeight: 1.1, letterSpacing: '0.01em',
          whiteSpace: 'nowrap',
        }}>
          {winnerLabel}
        </div>
      </div>
      <div style={{
        flex: 1, minWidth: 0,
        borderLeft: `1px solid ${winColor}55`,
        paddingLeft: 16,
      }}>
        <button
          onClick={onOpenModal}
          style={{
            background: 'transparent', border: 'none', padding: 0, margin: 0,
            fontSize: 13, color: 'var(--text-1)', cursor: 'pointer',
            textAlign: 'left', lineHeight: 1.4, fontFamily: 'var(--sans)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', marginBottom: 4, width: '100%',
          }}
          title="Click to open the full verdict breakdown"
        >
          {headline || 'Verdict delivered — click to see full breakdown.'}
        </button>
        <div style={{
          fontSize: 10, color: 'var(--text-3)',
          fontFamily: 'var(--mono)', letterSpacing: '0.04em',
        }}>
          {turnLabel}
        </div>
      </div>
      <button
        onClick={onOpenModal}
        style={{
          fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 800,
          color: 'var(--bg-deep)', background: winColor,
          letterSpacing: '0.08em',
          padding: '8px 16px', borderRadius: 4,
          border: 'none', cursor: 'pointer',
          whiteSpace: 'nowrap', flexShrink: 0,
          boxShadow: `0 2px 8px ${winColor}66`,
          textTransform: 'uppercase',
        }}
      >
        View Full Verdict →
      </button>
      <button
        onClick={() => onNavigateTab('reports')}
        style={{
          fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
          color: 'var(--text-2)', letterSpacing: '0.06em',
          padding: '7px 12px', borderRadius: 4,
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          textTransform: 'uppercase',
        }}
        title="Open the Reports tab for the full run breakdown"
      >
        Reports
      </button>
      <button
        onClick={() => onDismiss(winnerKey)}
        aria-label="Dismiss verdict banner"
        style={{
          background: 'none', border: 'none', color: 'var(--text-3)',
          cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
