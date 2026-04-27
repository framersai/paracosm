import type { GameState } from '../../hooks/useGameState';

interface DivergenceRailProps {
  state: GameState;
}

export function DivergenceRail({ state }: DivergenceRailProps) {
  const firstId = state.actorIds[0];
  const secondId = state.actorIds[1];
  const a = firstId ? state.actors[firstId] : null;
  const b = secondId ? state.actors[secondId] : null;
  if (!a || !b) return null;
  if (!a.event || !b.event) return null;
  if (a.event.turn !== b.event.turn) return null;
  if (!a.outcome || !b.outcome) return null;
  if (a.event.title === b.event.title && a.outcome === b.outcome) return null;

  const sameEvent = a.event.title === b.event.title;
  const fmtOutcome = (o: string) => o.replace(/_/g, ' ').toUpperCase();

  // Pull each side's decision text with a layered fallback so the two
  // cards always render parity. Fallbacks in priority:
  //   1. outcome event's _decision (commander's actual call)
  //   2. pendingDecision in sideState (fresher, may arrive before outcome)
  //   3. the turn event's description itself (shows the user WHAT)
  const pickDecision = (side: typeof a): string => {
    const outcomeEvt = side.events.find(e => e.type === 'outcome' && e.turn === side.event?.turn);
    const fromOutcome = outcomeEvt?.data?._decision as string | undefined;
    if (fromOutcome) return fromOutcome;
    if (side.pendingDecision) return side.pendingDecision;
    return side.event?.description || '';
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
        DIVERGENCE T{a.event.turn} {sameEvent ? '(same event, different outcome)' : '(different events)'}
      </div>
      <div className="diverge-sides" style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0, padding: '6px 10px', borderRadius: '4px', background: 'rgba(232,180,74,.08)', border: '1px solid rgba(232,180,74,.2)' }}>
          <b style={{ fontSize: '13px', color: 'var(--vis)', display: 'block', marginBottom: '2px', overflowWrap: 'break-word' }}>{a.event.title}</b>
          <span style={{ color: 'var(--text-1)', fontSize: '12px', display: 'block', overflowWrap: 'break-word' }}>
            {decisionA}
          </span>
          <div style={{ marginTop: '4px', fontSize: '12px', fontWeight: 800, fontFamily: 'var(--mono)', color: a.outcome.includes('success') ? 'var(--green)' : 'var(--rust)' }}>
            {fmtOutcome(a.outcome)}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, padding: '6px 10px', borderRadius: '4px', background: 'rgba(76,168,168,.08)', border: '1px solid rgba(76,168,168,.2)' }}>
          <b style={{ fontSize: '13px', color: 'var(--eng)', display: 'block', marginBottom: '2px', overflowWrap: 'break-word' }}>{b.event.title}</b>
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
