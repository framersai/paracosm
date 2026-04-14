import type { GameState } from '../../hooks/useGameState';

interface DivergenceRailProps {
  state: GameState;
}

export function DivergenceRail({ state }: DivergenceRailProps) {
  const { a, b } = state;
  if (!a.crisis || !b.crisis) return null;
  if (a.crisis.turn !== b.crisis.turn) return null;
  if (!a.outcome || !b.outcome) return null;
  if (a.crisis.title === b.crisis.title && a.outcome === b.outcome) return null;

  const sameCrisis = a.crisis.title === b.crisis.title;
  const fmtOutcome = (o: string) => o.replace(/_/g, ' ').toUpperCase();

  return (
    <div aria-label="Divergence rail" style={{
      padding: '6px 16px',
      background: 'linear-gradient(90deg, rgba(232,180,74,.08), rgba(76,168,168,.08))',
      borderBottom: '1px solid var(--border)',
      fontSize: '12px',
    }}>
      <div style={{
        fontWeight: 800, color: 'var(--text-1)', fontSize: '12px', marginBottom: '4px',
        fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>
        DIVERGENCE T{a.crisis.turn} {sameCrisis ? '(same crisis, different outcome)' : '(different crises)'}
      </div>
      <div className="diverge-sides" style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', background: 'rgba(232,180,74,.08)', border: '1px solid rgba(232,180,74,.2)' }}>
          <b style={{ fontSize: '13px', color: 'var(--vis)', display: 'block', marginBottom: '2px' }}>{a.crisis.title}</b>
          <span style={{ color: 'var(--text-1)', fontSize: '12px' }}>
            {(a.events.find(e => e.type === 'outcome' && e.turn === a.crisis?.turn)?.data?._decision as string || '').slice(0, 100)}
          </span>
          <div style={{ marginTop: '4px', fontSize: '12px', fontWeight: 800, fontFamily: 'var(--mono)', color: a.outcome.includes('success') ? 'var(--green)' : 'var(--rust)' }}>
            {fmtOutcome(a.outcome)}
          </div>
        </div>
        <div style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', background: 'rgba(76,168,168,.08)', border: '1px solid rgba(76,168,168,.2)' }}>
          <b style={{ fontSize: '13px', color: 'var(--eng)', display: 'block', marginBottom: '2px' }}>{b.crisis.title}</b>
          <span style={{ color: 'var(--text-1)', fontSize: '12px' }}>
            {(b.events.find(e => e.type === 'outcome' && e.turn === b.crisis?.turn)?.data?._decision as string || '').slice(0, 100)}
          </span>
          <div style={{ marginTop: '4px', fontSize: '12px', fontWeight: 800, fontFamily: 'var(--mono)', color: b.outcome.includes('success') ? 'var(--green)' : 'var(--rust)' }}>
            {fmtOutcome(b.outcome)}
          </div>
        </div>
      </div>
    </div>
  );
}
