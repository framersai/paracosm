import { useEffect } from 'react';
import type { CostBreakdown, CostSiteBreakdown } from '../../hooks/useGameState';

/**
 * Modal that breaks down a run's LLM spend by pipeline stage.
 *
 * Shown when the user clicks the COST pill in the StatsBar. Surfaces
 * where the money actually went so a user debugging a high bill can see
 * at a glance whether reactions, departments, or the judge dominated.
 *
 * Each row is a stage: director, commander, departments, judge,
 * reactions, other. Rows are sorted by spend descending so the biggest
 * line item is always at the top. A visual bar graph renders alongside
 * the numbers so the proportion is glanceable.
 */

interface CostBreakdownModalProps {
  combined: CostBreakdown;
  leaderA?: CostBreakdown;
  leaderB?: CostBreakdown;
  leaderAName?: string;
  leaderBName?: string;
  onClose: () => void;
}

/** Human-readable descriptions for each pipeline stage. */
const SITE_DESCRIPTIONS: Record<string, { label: string; description: string }> = {
  director: { label: 'Event Director', description: 'Generates events each turn based on world state' },
  commander: { label: 'Commander', description: 'Reads dept reports, picks options, promotes department heads' },
  departments: { label: 'Department Analysis', description: '5 specialists analyzing each event in parallel' },
  judge: { label: 'Forge Judge', description: 'LLM safety + correctness review of every forged tool' },
  reactions: { label: 'Agent Reactions', description: '~100 colonists reacting to each turn\'s outcome' },
  other: { label: 'Other', description: 'Uncategorized calls' },
};

function fmtUsd(v: number): string {
  if (v < 0.0001) return '$0.0000';
  return `$${v < 0.01 ? v.toFixed(4) : v.toFixed(2)}`;
}

function fmtTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

export function CostBreakdownModal({ combined, leaderA, leaderB, leaderAName, leaderBName, onClose }: CostBreakdownModalProps) {
  // Dismiss on Escape key. Keeps the modal keyboard-accessible without
  // pulling in a dialog library.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const breakdown = combined.breakdown ?? {};
  // Sort sites by cost descending. An empty breakdown falls back to an
  // empty array so the modal still renders an informative empty state.
  const rows = Object.entries(breakdown)
    .map(([site, b]) => ({ site, ...b }))
    .sort((a, b) => b.totalCostUSD - a.totalCostUSD);
  const total = combined.totalCostUSD || rows.reduce((s, r) => s + r.totalCostUSD, 0);
  const maxCost = rows[0]?.totalCostUSD ?? 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cost breakdown"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 20,
          maxWidth: 680,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          fontFamily: 'var(--sans)',
          color: 'var(--text-1)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <h3 style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 800, letterSpacing: '.05em', margin: 0, color: 'var(--amber)' }}>
            COST BREAKDOWN
          </h3>
          <button
            onClick={onClose}
            aria-label="Close cost breakdown"
            style={{
              background: 'transparent', color: 'var(--text-3)',
              border: '1px solid var(--border)', borderRadius: 4,
              padding: '2px 10px', fontSize: 11, cursor: 'pointer',
              fontFamily: 'var(--mono)',
            }}
          >
            ESC
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>
          Total: <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontWeight: 800 }}>{fmtUsd(total)}</span>
          {' · '}
          {combined.llmCalls.toLocaleString()} calls
          {' · '}
          {fmtTokens(combined.totalTokens)} tokens
        </div>

        {/* Prompt-cache summary. Only shown when the provider actually
            reported cache tokens — absent for OpenAI runs (its automatic
            caching doesn't expose per-call metrics) and for Anthropic
            runs that never hit a cached prefix. When shown, the ratio
            tells the user whether caching is delivering real savings or
            just costing extra on creation without reuse. */}
        {(combined.cacheReadTokens || combined.cacheCreationTokens) ? (
          <div style={{
            padding: '10px 12px', marginBottom: 16, borderRadius: 4,
            background: 'rgba(106,173,72,0.06)', border: '1px solid rgba(106,173,72,0.2)',
            fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-2)',
          }}>
            <div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 10, letterSpacing: '.08em', marginBottom: 4 }}>
              PROMPT CACHE
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', lineHeight: 1.7 }}>
              <span>
                Reads: <b style={{ color: 'var(--green)' }}>{fmtTokens(combined.cacheReadTokens ?? 0)}</b>
                <span style={{ color: 'var(--text-3)', marginLeft: 4 }}>(billed at 0.1× input)</span>
              </span>
              <span>
                Creates: <b style={{ color: 'var(--amber)' }}>{fmtTokens(combined.cacheCreationTokens ?? 0)}</b>
                <span style={{ color: 'var(--text-3)', marginLeft: 4 }}>(billed at 1.25× input)</span>
              </span>
              {(() => {
                const reads = combined.cacheReadTokens ?? 0;
                const creates = combined.cacheCreationTokens ?? 0;
                if (reads + creates === 0) return null;
                const ratio = reads / (reads + creates);
                const label = reads === 0 ? 'no cache hits yet'
                  : ratio > 0.5 ? 'caching is paying off'
                  : 'low hit rate; cache may be expiring';
                return (
                  <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>
                    {Math.round(ratio * 100)}% read / {label}
                  </span>
                );
              })()}
            </div>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <div style={{ padding: '24px 8px', color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>
            No LLM calls have been billed yet. Start a simulation to see spend by pipeline stage.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--mono)' }}>
            <thead>
              <tr style={{ color: 'var(--text-3)', textAlign: 'left', fontSize: 10, letterSpacing: '.08em' }}>
                <th style={{ padding: '4px 0', fontWeight: 700 }}>STAGE</th>
                <th style={{ padding: '4px 0', fontWeight: 700, textAlign: 'right' }}>CALLS</th>
                <th style={{ padding: '4px 0', fontWeight: 700, textAlign: 'right' }}>TOKENS</th>
                <th style={{ padding: '4px 0', fontWeight: 700, textAlign: 'right' }}>COST</th>
                <th style={{ padding: '4px 0', fontWeight: 700, textAlign: 'right' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const info = SITE_DESCRIPTIONS[r.site] ?? { label: r.site, description: '' };
                const pct = total > 0 ? (r.totalCostUSD / total) * 100 : 0;
                const barPct = maxCost > 0 ? (r.totalCostUSD / maxCost) * 100 : 0;
                return (
                  <tr key={r.site} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 0' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{info.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--sans)', marginTop: 1 }}>{info.description}</div>
                      {/* Proportional bar. Width maps to % of the largest
                          stage so you can eyeball relative scale at a glance. */}
                      <div aria-hidden="true" style={{
                        marginTop: 4, height: 4, width: '100%',
                        background: 'var(--bg-deep)', borderRadius: 2, overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${barPct}%`, height: '100%',
                          background: 'var(--amber)', transition: 'width 0.3s ease',
                        }} />
                      </div>
                    </td>
                    <td style={{ padding: '8px 0 0 12px', textAlign: 'right', verticalAlign: 'top' }}>{r.calls.toLocaleString()}</td>
                    <td style={{ padding: '8px 0 0 12px', textAlign: 'right', verticalAlign: 'top' }}>{fmtTokens(r.totalTokens)}</td>
                    <td style={{ padding: '8px 0 0 12px', textAlign: 'right', verticalAlign: 'top', color: 'var(--green)', fontWeight: 700 }}>{fmtUsd(r.totalCostUSD)}</td>
                    <td style={{ padding: '8px 0 0 12px', textAlign: 'right', verticalAlign: 'top', color: 'var(--text-2)' }}>{pct.toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Per-leader totals when both sides have reported. Lets the user
            see if one leader's simulation is unusually expensive (e.g.
            runaway tool-call loop on one side). */}
        {leaderA && leaderB && (leaderA.totalCostUSD > 0 || leaderB.totalCostUSD > 0) && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '.08em', fontFamily: 'var(--mono)', marginBottom: 8 }}>
              PER LEADER
            </div>
            <div style={{ display: 'flex', gap: 12, fontFamily: 'var(--mono)', fontSize: 12 }}>
              <div style={{ flex: 1, padding: 12, background: 'var(--bg-deep)', borderRadius: 4, border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--vis)', fontWeight: 800, marginBottom: 4 }}>{leaderAName || 'Leader A'}</div>
                <div style={{ color: 'var(--green)', fontSize: 14, fontWeight: 800 }}>{fmtUsd(leaderA.totalCostUSD)}</div>
                <div style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 2 }}>{leaderA.llmCalls} calls · {fmtTokens(leaderA.totalTokens)} tok</div>
              </div>
              <div style={{ flex: 1, padding: 12, background: 'var(--bg-deep)', borderRadius: 4, border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--eng)', fontWeight: 800, marginBottom: 4 }}>{leaderBName || 'Leader B'}</div>
                <div style={{ color: 'var(--green)', fontSize: 14, fontWeight: 800 }}>{fmtUsd(leaderB.totalCostUSD)}</div>
                <div style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 2 }}>{leaderB.llmCalls} calls · {fmtTokens(leaderB.totalTokens)} tok</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Re-export the type so consumers can import from a single place.
export type { CostSiteBreakdown };
