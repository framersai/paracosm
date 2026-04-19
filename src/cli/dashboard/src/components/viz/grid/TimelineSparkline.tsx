import type { TurnSnapshot } from '../viz-types.js';

interface TimelineSparklineProps {
  snapsA: TurnSnapshot[];
  snapsB: TurnSnapshot[];
  currentTurn: number;
  onJumpToTurn: (turn: number) => void;
}

/**
 * Two-line sparkline showing morale trajectory for both leaders across
 * turns. Current-turn vertical marker keeps the timeline oriented.
 * Clicking a point jumps the playhead to that turn.
 */
export function TimelineSparkline({
  snapsA,
  snapsB,
  currentTurn,
  onJumpToTurn,
}: TimelineSparklineProps) {
  const maxTurns = Math.max(snapsA.length, snapsB.length);
  if (maxTurns < 2) return null;

  const W = 600;
  const H = 28;
  const padX = 6;
  const padY = 3;
  const plotW = W - padX * 2;
  const plotH = H - padY * 2;

  const buildPath = (snaps: TurnSnapshot[]): string => {
    if (snaps.length === 0) return '';
    const stepX = plotW / Math.max(1, maxTurns - 1);
    return snaps
      .map((s, i) => {
        const x = padX + i * stepX;
        const y = padY + (1 - s.morale) * plotH;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const cursorX = padX + currentTurn * (plotW / Math.max(1, maxTurns - 1));

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * W;
    const turn = Math.round(((clickX - padX) / plotW) * (maxTurns - 1));
    onJumpToTurn(Math.max(0, Math.min(maxTurns - 1, turn)));
  };

  return (
    <div
      style={{
        padding: '4px 10px 2px',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: 8,
          fontFamily: 'var(--mono)',
          color: 'var(--text-4)',
          letterSpacing: '0.08em',
          marginBottom: 2,
        }}
      >
        <span>MORALE · T1 → T{maxTurns}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <span style={{ color: 'var(--vis)' }}>■ A</span>
          <span style={{ color: 'var(--eng)' }}>■ B</span>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onClick={handleClick}
        style={{
          display: 'block',
          width: '100%',
          height: H,
          cursor: 'pointer',
          background: 'var(--bg-deep)',
          borderRadius: 2,
        }}
      >
        {/* 50% morale grid line */}
        <line
          x1={padX}
          x2={W - padX}
          y1={padY + plotH / 2}
          y2={padY + plotH / 2}
          stroke="var(--border)"
          strokeWidth={0.5}
          strokeDasharray="2 2"
        />
        <path d={buildPath(snapsA)} fill="none" stroke="var(--vis)" strokeWidth={1.2} />
        <path d={buildPath(snapsB)} fill="none" stroke="var(--eng)" strokeWidth={1.2} />
        <line
          x1={cursorX}
          x2={cursorX}
          y1={0}
          y2={H}
          stroke="var(--amber)"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}
