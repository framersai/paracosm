import { useState, useCallback } from 'react';

interface VerdictData {
  winner: 'A' | 'B' | 'tie';
  winnerName: string;
  headline: string;
  summary: string;
  keyDivergence: string;
  scores: {
    a: { survival: number; prosperity: number; morale: number; innovation: number };
    b: { survival: number; prosperity: number; morale: number; innovation: number };
  };
  leaderA: { name: string; archetype: string; colony: string };
  leaderB: { name: string; archetype: string; colony: string };
  finalStats: {
    a: { population: number; morale: number; food: number; power: number; modules: number; science: number; tools: number };
    b: { population: number; morale: number; food: number; power: number; modules: number; science: number; tools: number };
  };
}

interface VerdictCardProps {
  verdict: Record<string, unknown>;
}

function ScoreBar({ label, a, b }: { label: string; a: number; b: number }) {
  const max = Math.max(a, b, 1);
  return (
    <div style={{ marginBottom: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text-3)', marginBottom: '2px' }}>
        <span>{a.toFixed(0)}</span>
        <span style={{ fontWeight: 700, color: 'var(--text-2)' }}>{label}</span>
        <span>{b.toFixed(0)}</span>
      </div>
      <div style={{ display: 'flex', gap: '2px', height: '6px' }}>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{
            width: `${(a / max) * 100}%`, height: '100%', borderRadius: '3px 0 0 3px',
            background: a >= b ? 'var(--vis)' : 'var(--border-hl)',
          }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            width: `${(b / max) * 100}%`, height: '100%', borderRadius: '0 3px 3px 0',
            background: b >= a ? 'var(--eng)' : 'var(--border-hl)',
          }} />
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, a, b, format }: { label: string; a: number; b: number; format?: 'percent' | 'decimal' | 'number' }) {
  const fmt = (v: number) => {
    if (format === 'percent') return `${Math.round(v * 100)}%`;
    if (format === 'decimal') return v.toFixed(1);
    return String(Math.round(v));
  };
  const better = a > b ? 'a' : b > a ? 'b' : null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: '12px', fontFamily: 'var(--mono)' }}>
      <span style={{ color: better === 'a' ? 'var(--vis)' : 'var(--text-2)', fontWeight: better === 'a' ? 700 : 400 }}>{fmt(a)}</span>
      <span style={{ color: 'var(--text-3)', fontSize: '10px' }}>{label}</span>
      <span style={{ color: better === 'b' ? 'var(--eng)' : 'var(--text-2)', fontWeight: better === 'b' ? 700 : 400 }}>{fmt(b)}</span>
    </div>
  );
}

/**
 * Build a markdown export of the verdict for sharing or saving.
 */
function buildMarkdownExport(v: VerdictData): string {
  const lines: string[] = [];
  lines.push('# Simulation Verdict');
  lines.push('');
  lines.push(`**Winner:** ${v.winner === 'tie' ? 'Tie' : `${v.winnerName} (Leader ${v.winner})`}`);
  lines.push('');
  lines.push(`> ${v.headline}`);
  lines.push('');
  lines.push(v.summary);
  lines.push('');
  lines.push('## Key Divergence');
  lines.push('');
  lines.push(v.keyDivergence);
  if (v.scores) {
    lines.push('');
    lines.push('## Scores');
    lines.push('');
    lines.push('| Dimension | ' + (v.leaderA?.name || 'A') + ' | ' + (v.leaderB?.name || 'B') + ' |');
    lines.push('|---|---|---|');
    lines.push(`| Survival | ${v.scores.a?.survival ?? 0} | ${v.scores.b?.survival ?? 0} |`);
    lines.push(`| Prosperity | ${v.scores.a?.prosperity ?? 0} | ${v.scores.b?.prosperity ?? 0} |`);
    lines.push(`| Morale | ${v.scores.a?.morale ?? 0} | ${v.scores.b?.morale ?? 0} |`);
    lines.push(`| Innovation | ${v.scores.a?.innovation ?? 0} | ${v.scores.b?.innovation ?? 0} |`);
  }
  if (v.finalStats) {
    lines.push('');
    lines.push('## Final Colony Stats');
    lines.push('');
    lines.push('| Stat | ' + (v.leaderA?.name || 'A') + ' | ' + (v.leaderB?.name || 'B') + ' |');
    lines.push('|---|---|---|');
    lines.push(`| Population | ${v.finalStats.a?.population ?? 0} | ${v.finalStats.b?.population ?? 0} |`);
    lines.push(`| Morale | ${Math.round((v.finalStats.a?.morale ?? 0) * 100)}% | ${Math.round((v.finalStats.b?.morale ?? 0) * 100)}% |`);
    lines.push(`| Food (months) | ${(v.finalStats.a?.food ?? 0).toFixed(1)} | ${(v.finalStats.b?.food ?? 0).toFixed(1)} |`);
    lines.push(`| Power (kW) | ${(v.finalStats.a?.power ?? 0).toFixed(1)} | ${(v.finalStats.b?.power ?? 0).toFixed(1)} |`);
    lines.push(`| Modules | ${(v.finalStats.a?.modules ?? 0).toFixed(1)} | ${(v.finalStats.b?.modules ?? 0).toFixed(1)} |`);
    lines.push(`| Science | ${v.finalStats.a?.science ?? 0} | ${v.finalStats.b?.science ?? 0} |`);
    lines.push(`| Tools Forged | ${v.finalStats.a?.tools ?? 0} | ${v.finalStats.b?.tools ?? 0} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('Generated by [Paracosm](https://paracosm.agentos.sh)');
  return lines.join('\n');
}

/**
 * Full verdict body shared by the Sim modal and the Reports inline
 * panel. Accepts the parsed VerdictData and renders the winner
 * headline, summary, key divergence, score bars, and final stats.
 * Caller supplies any wrapping chrome (modal vs inline card).
 */
export function VerdictDetails({ v, onExport, copied }: { v: VerdictData; onExport?: () => void; copied?: boolean }) {
  const winColor = v.winner === 'A' ? 'var(--vis)' : v.winner === 'B' ? 'var(--eng)' : 'var(--amber)';
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', fontWeight: 800, letterSpacing: '2px', color: 'var(--text-3)', marginBottom: '6px' }}>
            SIMULATION VERDICT
          </div>
          <div style={{ fontSize: '20px', fontFamily: 'var(--mono)', fontWeight: 800, color: winColor, marginBottom: '4px' }}>
            {v.winner === 'tie' ? 'TIE' : `${v.winnerName} WINS`}
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text-1)', fontWeight: 600 }}>
            {v.headline}
          </div>
        </div>
        {onExport && (
          <div style={{ marginLeft: 12, flexShrink: 0 }}>
            <button
              onClick={onExport}
              aria-label="Copy verdict as markdown"
              style={{
                fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
                padding: '4px 10px', borderRadius: 4,
                border: '1px solid var(--border)',
                background: copied ? 'rgba(106,173,72,0.18)' : 'var(--bg-card)',
                color: copied ? 'var(--green)' : 'var(--text-2)',
                cursor: 'pointer', letterSpacing: '0.05em',
              }}
            >
              {copied ? 'COPIED ✓' : 'EXPORT MD'}
            </button>
          </div>
        )}
      </div>

      <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.7, marginBottom: '16px' }}>
        {v.summary}
      </div>

      <div style={{
        background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: '6px',
        padding: '10px 14px', marginBottom: '16px', fontSize: '12px',
      }}>
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)', fontSize: '10px', letterSpacing: '1px' }}>KEY DIVERGENCE</span>
        <div style={{ color: 'var(--text-2)', marginTop: '4px', lineHeight: 1.6 }}>{v.keyDivergence}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '16px', marginBottom: '16px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--vis)' }}>{v.leaderA?.name || 'Leader A'}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-3)' }}>{v.leaderA?.archetype}</div>
        </div>
        <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text-3)', alignSelf: 'center' }}>vs</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--eng)' }}>{v.leaderB?.name || 'Leader B'}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-3)' }}>{v.leaderB?.archetype}</div>
        </div>
      </div>

      <div style={{ maxWidth: '440px', margin: '0 auto 16px' }}>
        <ScoreBar label="Survival" a={v.scores.a?.survival ?? 0} b={v.scores.b?.survival ?? 0} />
        <ScoreBar label="Prosperity" a={v.scores.a?.prosperity ?? 0} b={v.scores.b?.prosperity ?? 0} />
        <ScoreBar label="Morale" a={v.scores.a?.morale ?? 0} b={v.scores.b?.morale ?? 0} />
        <ScoreBar label="Innovation" a={v.scores.a?.innovation ?? 0} b={v.scores.b?.innovation ?? 0} />
      </div>

      {v.finalStats && (
        <div style={{ maxWidth: '400px', margin: '0 auto', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-3)', marginBottom: '8px', textAlign: 'center' }}>FINAL COLONY STATS</div>
          <StatRow label="Population" a={v.finalStats.a?.population ?? 0} b={v.finalStats.b?.population ?? 0} />
          <StatRow label="Morale" a={v.finalStats.a?.morale ?? 0} b={v.finalStats.b?.morale ?? 0} format="percent" />
          <StatRow label="Food (mo)" a={v.finalStats.a?.food ?? 0} b={v.finalStats.b?.food ?? 0} format="decimal" />
          <StatRow label="Power (kW)" a={v.finalStats.a?.power ?? 0} b={v.finalStats.b?.power ?? 0} format="decimal" />
          <StatRow label="Modules" a={v.finalStats.a?.modules ?? 0} b={v.finalStats.b?.modules ?? 0} format="decimal" />
          <StatRow label="Science" a={v.finalStats.a?.science ?? 0} b={v.finalStats.b?.science ?? 0} />
          <StatRow label="Tools Forged" a={v.finalStats.a?.tools ?? 0} b={v.finalStats.b?.tools ?? 0} />
        </div>
      )}
    </>
  );
}

/**
 * Inline full-width verdict panel for the Reports tab. Renders every
 * field VerdictDetails surfaces without the click-to-open step the
 * Sim modal requires, and adds a winner ribbon above the header.
 */
export function VerdictPanel({ verdict: raw }: VerdictCardProps) {
  const v = raw as unknown as VerdictData;
  const [copied, setCopied] = useState(false);
  const handleExport = useCallback(() => {
    const md = buildMarkdownExport(v);
    navigator.clipboard.writeText(md).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1800); },
      () => { /* clipboard denied — silent */ },
    );
  }, [v]);
  if (!v.winner || !v.scores) return null;
  const winColor = v.winner === 'A' ? 'var(--vis)' : v.winner === 'B' ? 'var(--eng)' : 'var(--amber)';
  return (
    <div style={{
      background: 'linear-gradient(180deg, var(--bg-panel) 0%, var(--bg-deep) 100%)',
      border: '1px solid var(--border)',
      borderTop: `3px solid ${winColor}`,
      borderRadius: 10,
      padding: '20px 24px',
      marginBottom: 20,
      boxShadow: 'var(--card-shadow)',
    }}>
      <VerdictDetails v={v} onExport={handleExport} copied={copied} />
    </div>
  );
}

/**
 * Verdict surface. Renders as a compact banner pinned at the top of the
 * sim area when a verdict is available — never takes over the layout.
 * The full verdict (scores, stats, summary) opens in a modal on demand,
 * with a copy-to-clipboard markdown export so the user can save or
 * share the result without leaving the sim view.
 */
export function VerdictCard({ verdict: raw }: VerdictCardProps) {
  const v = raw as unknown as VerdictData;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleExport = useCallback(() => {
    const md = buildMarkdownExport(v);
    navigator.clipboard.writeText(md).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1800); },
      () => { /* clipboard denied — silent */ },
    );
  }, [v]);

  if (!v.winner || !v.scores) return null;
  const winColor = v.winner === 'A' ? 'var(--vis)' : v.winner === 'B' ? 'var(--eng)' : 'var(--amber)';
  const winnerLabel = v.winner === 'tie' ? 'Tie' : `${v.winnerName} wins`;

  return (
    <>
      {/* Compact banner — never takes more than ~36px so the sim columns
          stay fully visible. Click to open the full breakdown modal. */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open simulation verdict"
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          width: 'auto', alignSelf: 'stretch',
          padding: '6px 16px',
          background: `linear-gradient(90deg, ${winColor}18, transparent 60%)`,
          border: 'none',
          borderTop: `2px solid ${winColor}`,
          borderBottom: '1px solid var(--border)',
          cursor: 'pointer',
          fontFamily: 'var(--sans)', color: 'var(--text-1)',
          textAlign: 'left',
        }}
      >
        <span style={{
          fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 800,
          letterSpacing: '0.12em', color: 'var(--text-3)',
          textTransform: 'uppercase',
        }}>
          Verdict
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color: winColor }}>
          {winnerLabel}
        </span>
        <span style={{
          fontSize: 12, color: 'var(--text-2)',
          flex: 1, minWidth: 0,
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          {v.headline}
        </span>
        <span style={{
          fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
          color: 'var(--amber)', letterSpacing: '0.06em',
          padding: '3px 10px', borderRadius: 3,
          border: '1px solid var(--amber)',
          background: 'rgba(232,180,74,0.06)',
        }}>
          VIEW FULL VERDICT →
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Simulation verdict"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100000,
            background: 'rgba(10,8,6,0.78)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, var(--bg-panel) 0%, var(--bg-deep) 100%)',
              border: '1px solid var(--border)',
              borderTop: `3px solid ${winColor}`,
              borderRadius: 10,
              padding: '20px 24px',
              maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto',
              boxShadow: '0 12px 60px rgba(0,0,0,0.6)',
              fontFamily: 'var(--sans)', color: 'var(--text-1)',
            }}
          >
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close verdict"
                style={{
                  position: 'absolute', top: -4, right: -4,
                  background: 'none', border: 'none', color: 'var(--text-3)',
                  cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4,
                  zIndex: 1,
                }}
              >
                ×
              </button>
              <VerdictDetails v={v} onExport={handleExport} copied={copied} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
