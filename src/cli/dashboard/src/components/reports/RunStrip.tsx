/**
 * Horizontal 1-row timeline. One cell per turn with per-side outcome
 * badges stacked. Clicking a cell scrolls #turn-<n> into view.
 *
 * @module paracosm/dashboard/reports/RunStrip
 */
import type { RunStripCell } from './reports-shared';
import { outcomeColor } from './reports-shared';

export interface RunStripProps {
  turns: RunStripCell[];
  leaderAName: string;
  leaderBName: string;
  onJumpToTurn?: (turn: number) => void;
}

const OUTCOME_LABEL: Record<string, string> = {
  conservative_success: 'SAFE WIN',
  risky_success:        'RISKY WIN',
  conservative_failure: 'SAFE LOSS',
  risky_failure:        'RISKY LOSS',
};

function outcomeShort(outcome: string | undefined): string {
  if (!outcome) return '·';
  return OUTCOME_LABEL[outcome] ?? outcome.replace(/_/g, ' ').toUpperCase();
}

function Badge({ outcome, sideColor }: { outcome: string | undefined; sideColor: string }) {
  const color = outcomeColor(outcome);
  return (
    <div style={{
      fontSize: 9, fontWeight: 800, fontFamily: 'var(--mono)',
      color, letterSpacing: '0.04em', lineHeight: 1.2,
      padding: '2px 4px',
      borderLeft: `2px solid ${sideColor}`,
      whiteSpace: 'nowrap',
    }}>
      {outcomeShort(outcome)}
    </div>
  );
}

export function RunStrip(props: RunStripProps) {
  const { turns, leaderAName, leaderBName, onJumpToTurn } = props;
  if (turns.length === 0) return null;

  const handleClick = (turn: number) => {
    if (onJumpToTurn) { onJumpToTurn(turn); return; }
    if (typeof document !== 'undefined') {
      document.getElementById(`turn-${turn}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section
      aria-label="Run timeline strip"
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 16,
        boxShadow: 'var(--card-shadow)',
      }}
    >
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--amber)', fontFamily: 'var(--mono)', marginBottom: 8,
      }}>
        Run Strip
      </div>
      <div
        role="list"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${turns.length}, minmax(0, 1fr))`,
          gap: 6,
        }}
      >
        {turns.map(cell => (
          <button
            key={cell.turn}
            type="button"
            role="listitem"
            onClick={() => handleClick(cell.turn)}
            aria-label={`Jump to turn ${cell.turn}${cell.year ? ', year ' + cell.year : ''}${cell.diverged ? ', divergent' : ''}`}
            style={{
              display: 'flex', flexDirection: 'column', gap: 4,
              padding: '6px 8px',
              background: cell.diverged ? 'color-mix(in srgb, var(--bg-canvas) 88%, var(--rust) 12%)' : 'var(--bg-canvas)',
              border: `1px solid ${cell.diverged ? 'var(--rust-dim, var(--rust))' : 'var(--border)'}`,
              borderRadius: 4, cursor: 'pointer', textAlign: 'left',
              fontFamily: 'var(--mono)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)' }}>
              <span style={{ fontWeight: 700 }}>T{cell.turn}</span>
              {cell.year && <span>Y{cell.year}</span>}
            </div>
            <Badge outcome={cell.a.outcome} sideColor="var(--vis)" />
            <Badge outcome={cell.b.outcome} sideColor="var(--eng)" />
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
        <span>{leaderAName}</span>
        <span>{leaderBName}</span>
      </div>
    </section>
  );
}
