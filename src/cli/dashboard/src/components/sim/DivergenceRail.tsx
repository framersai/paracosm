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

  // Pull each side's decision text with a layered fallback so the two
  // cards always render parity. Earlier the card tried only the
  // outcome event and left the second side blank when that event's
  // _decision field was not yet populated. Fallbacks in priority:
  //   1. outcome event's _decision (commander's actual call)
  //   2. pendingDecision in sideState (fresher, may arrive before outcome)
  //   3. the crisis description itself (shows the user WHAT, even if
  //      the commander's call is not yet recorded)
  const pickDecision = (side: typeof a): string => {
    const outcomeEvt = side.events.find(e => e.type === 'outcome' && e.turn === side.crisis?.turn);
    const fromOutcome = outcomeEvt?.data?._decision as string | undefined;
    if (fromOutcome) return fromOutcome;
    if (side.pendingDecision) return side.pendingDecision;
    return side.crisis?.description || '';
  };

  const decisionA = pickDecision(a).slice(0, 180);
  const decisionB = pickDecision(b).slice(0, 180);

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
        <div style={{ flex: 1, minWidth: 0, padding: '6px 10px', borderRadius: '4px', background: 'rgba(232,180,74,.08)', border: '1px solid rgba(232,180,74,.2)' }}>
          <b style={{ fontSize: '13px', color: 'var(--vis)', display: 'block', marginBottom: '2px', overflowWrap: 'break-word' }}>{a.crisis.title}</b>
          <span style={{ color: 'var(--text-1)', fontSize: '12px', display: 'block', overflowWrap: 'break-word' }}>
            {decisionA}
          </span>
          <div style={{ marginTop: '4px', fontSize: '12px', fontWeight: 800, fontFamily: 'var(--mono)', color: a.outcome.includes('success') ? 'var(--green)' : 'var(--rust)' }}>
            {fmtOutcome(a.outcome)}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, padding: '6px 10px', borderRadius: '4px', background: 'rgba(76,168,168,.08)', border: '1px solid rgba(76,168,168,.2)' }}>
          <b style={{ fontSize: '13px', color: 'var(--eng)', display: 'block', marginBottom: '2px', overflowWrap: 'break-word' }}>{b.crisis.title}</b>
          <span style={{ color: 'var(--text-1)', fontSize: '12px', display: 'block', overflowWrap: 'break-word' }}>
            {decisionB}
          </span>
          <div style={{ marginTop: '4px', fontSize: '12px', fontWeight: 800, fontFamily: 'var(--mono)', color: b.outcome.includes('success') ? 'var(--green)' : 'var(--rust)' }}>
            {fmtOutcome(b.outcome)}
          </div>
        </div>
      </div>
    </div>
  );
}
