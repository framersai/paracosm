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

export function VerdictCard({ verdict: raw }: VerdictCardProps) {
  const v = raw as unknown as VerdictData;
  if (!v.winner || !v.scores) return null;

  const winColor = v.winner === 'A' ? 'var(--vis)' : v.winner === 'B' ? 'var(--eng)' : 'var(--amber)';

  return (
    <div style={{
      background: 'linear-gradient(180deg, var(--bg-panel) 0%, var(--bg-deep) 100%)',
      border: '1px solid var(--border)',
      borderTop: `3px solid ${winColor}`,
      borderRadius: '8px',
      padding: '20px 24px',
      margin: '16px 8px',
    }}>
      {/* Headline */}
      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
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

      {/* Summary */}
      <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.7, marginBottom: '16px', textAlign: 'center', maxWidth: '600px', margin: '0 auto 16px' }}>
        {v.summary}
      </div>

      {/* Key divergence */}
      <div style={{
        background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: '6px',
        padding: '10px 14px', marginBottom: '16px', fontSize: '12px',
      }}>
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)', fontSize: '10px', letterSpacing: '1px' }}>KEY DIVERGENCE</span>
        <div style={{ color: 'var(--text-2)', marginTop: '4px', lineHeight: 1.6 }}>{v.keyDivergence}</div>
      </div>

      {/* Score comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '16px', marginBottom: '16px' }}>
        {/* Leader A header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--vis)' }}>{v.leaderA?.name || 'Leader A'}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-3)' }}>{v.leaderA?.archetype}</div>
        </div>
        <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text-3)', alignSelf: 'center' }}>vs</div>
        {/* Leader B header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--eng)' }}>{v.leaderB?.name || 'Leader B'}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-3)' }}>{v.leaderB?.archetype}</div>
        </div>
      </div>

      {/* Score bars */}
      {v.scores && (
        <div style={{ maxWidth: '400px', margin: '0 auto', marginBottom: '16px' }}>
          <ScoreBar label="Survival" a={v.scores.a?.survival ?? 0} b={v.scores.b?.survival ?? 0} />
          <ScoreBar label="Prosperity" a={v.scores.a?.prosperity ?? 0} b={v.scores.b?.prosperity ?? 0} />
          <ScoreBar label="Morale" a={v.scores.a?.morale ?? 0} b={v.scores.b?.morale ?? 0} />
          <ScoreBar label="Innovation" a={v.scores.a?.innovation ?? 0} b={v.scores.b?.innovation ?? 0} />
        </div>
      )}

      {/* Final stats comparison */}
      {v.finalStats && (
        <div style={{ maxWidth: '360px', margin: '0 auto', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
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
    </div>
  );
}
