/**
 * Top-of-report scoreboard. Shows winner + one-sentence divergence +
 * seven-stat A-vs-B comparison bars. Sources from verdict.finalStats
 * so the numbers match the existing VerdictPanel exactly.
 *
 * When verdict is absent (sim still in progress) the stats block hides
 * and a one-line "simulation in progress" message takes its place. The
 * hero itself stays so the first fold is still a real summary.
 *
 * @module paracosm/dashboard/reports/HeroScoreboard
 */

export interface HeroScoreboardProps {
  /** Raw verdict payload emitted by the orchestrator. Shape mirrors
   *  VerdictData in ../sim/VerdictCard.tsx. */
  verdict: Record<string, unknown> | null | undefined;
  leaderAName: string;
  leaderBName: string;
  /** Default scrolls #verdict into view. Override for tests / custom nav. */
  onViewFullVerdict?: () => void;
}

interface FinalStats {
  population: number;
  morale: number;
  food: number;
  power: number;
  modules: number;
  science: number;
  tools: number;
}

interface StatRowDef {
  key: keyof FinalStats;
  label: string;
  format: 'int' | 'percent' | 'decimal';
}

const STAT_ROWS: StatRowDef[] = [
  { key: 'population', label: 'Population', format: 'int' },
  { key: 'morale',     label: 'Morale',     format: 'percent' },
  { key: 'food',       label: 'Food (mo)',  format: 'decimal' },
  { key: 'power',      label: 'Power (kW)', format: 'decimal' },
  { key: 'modules',    label: 'Modules',    format: 'decimal' },
  { key: 'science',    label: 'Science',    format: 'int' },
  { key: 'tools',      label: 'Tools Forged', format: 'int' },
];

function fmt(value: number, format: StatRowDef['format']): string {
  if (format === 'percent') return `${Math.round(value * 100)}%`;
  if (format === 'decimal') return value.toFixed(1);
  return String(Math.round(value));
}

function StatBar({ a, b, winner }: { a: number; b: number; winner: 'a' | 'b' | 'tie' }) {
  const max = Math.max(Math.abs(a), Math.abs(b), 1);
  const aPct = Math.max(0, (a / max) * 100);
  const bPct = Math.max(0, (b / max) * 100);
  const aFill = winner === 'a' ? 'var(--vis)' : 'var(--border-hl)';
  const bFill = winner === 'b' ? 'var(--eng)' : 'var(--border-hl)';
  return (
    <div style={{ display: 'flex', gap: 2, height: 6 }}>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: `${aPct}%`, height: '100%', background: aFill, borderRadius: '3px 0 0 3px' }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ width: `${bPct}%`, height: '100%', background: bFill, borderRadius: '0 3px 3px 0' }} />
      </div>
    </div>
  );
}

export function HeroScoreboard(props: HeroScoreboardProps) {
  const v = props.verdict as {
    winnerName?: string;
    winner?: 'A' | 'B' | 'tie';
    headline?: string;
    summary?: string;
    keyDivergence?: string;
    finalStats?: { a?: Partial<FinalStats>; b?: Partial<FinalStats> };
  } | null | undefined;
  const winnerName = v?.winnerName || '';
  const headline = v?.headline || v?.summary || '';
  const keyDivergence = v?.keyDivergence || '';
  const finalA = v?.finalStats?.a;
  const finalB = v?.finalStats?.b;

  const scroll = props.onViewFullVerdict ?? (() => {
    if (typeof document !== 'undefined') {
      document.getElementById('verdict')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  return (
    <section
      aria-label="Run summary"
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 16,
        boxShadow: 'var(--card-shadow)',
      }}
    >
      <div style={{
        padding: '12px 18px',
        background: 'linear-gradient(90deg, rgba(232,180,74,0.18), rgba(232,180,74,0.04))',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--amber)', fontFamily: 'var(--mono)' }}>
          Run Summary
        </div>
        {winnerName && (
          <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--mono)' }}>
            {winnerName} wins
          </div>
        )}
        {headline && (
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
            {headline}
          </div>
        )}
        {keyDivergence && (
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', lineHeight: 1.5 }}>
            {keyDivergence}
          </div>
        )}
      </div>

      {finalA && finalB ? (
        <div style={{ padding: '14px 18px' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', marginBottom: 10,
            fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
            color: 'var(--text-3)', fontFamily: 'var(--mono)',
          }}>
            <span style={{ color: 'var(--vis)' }}>{props.leaderAName}</span>
            <span>Final stats</span>
            <span style={{ color: 'var(--eng)' }}>{props.leaderBName}</span>
          </div>
          {STAT_ROWS.map(row => {
            const a = Number(finalA[row.key] ?? 0);
            const b = Number(finalB[row.key] ?? 0);
            const winner: 'a' | 'b' | 'tie' = a > b ? 'a' : b > a ? 'b' : 'tie';
            return (
              <div key={row.key} style={{ marginBottom: 8 }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  fontSize: 11, fontFamily: 'var(--mono)', marginBottom: 2,
                }}>
                  <span style={{ color: winner === 'a' ? 'var(--vis)' : 'var(--text-2)', fontWeight: winner === 'a' ? 700 : 500 }}>
                    {fmt(a, row.format)}
                  </span>
                  <span style={{ color: 'var(--text-3)' }}>{row.label}</span>
                  <span style={{ color: winner === 'b' ? 'var(--eng)' : 'var(--text-2)', fontWeight: winner === 'b' ? 700 : 500 }}>
                    {fmt(b, row.format)}
                  </span>
                </div>
                <StatBar a={a} b={b} winner={winner} />
              </div>
            );
          })}
          <div style={{ textAlign: 'right', marginTop: 10 }}>
            <button
              type="button"
              onClick={scroll}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
                color: 'var(--amber)', letterSpacing: '0.04em', textTransform: 'uppercase',
              }}
            >
              View full verdict ›
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '14px 18px', fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
          Simulation in progress. Scoreboard will populate when the verdict arrives.
        </div>
      )}
    </section>
  );
}
