import type { TurnSnapshot } from '../viz-types.js';

interface TimelineSparklineProps {
  snapsA: TurnSnapshot[];
  snapsB: TurnSnapshot[];
  currentTurn: number;
  onJumpToTurn: (turn: number) => void;
  /** Lifted hover turn so the chronicle can highlight in sync. */
  hoveredTurn?: number | null;
  onHoverTurnChange?: (turn: number | null) => void;
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
  hoveredTurn,
  onHoverTurnChange,
}: TimelineSparklineProps) {
  const maxTurns = Math.max(snapsA.length, snapsB.length);
  if (maxTurns < 2) return null;

  const W = 600;
  const H = 28;
  const padX = 6;
  const padY = 3;
  const plotW = W - padX * 2;
  const plotH = H - padY * 2;

  const buildPath = (
    snaps: TurnSnapshot[],
    valueOf: (s: TurnSnapshot) => number,
  ): string => {
    if (snaps.length === 0) return '';
    const stepX = plotW / Math.max(1, maxTurns - 1);
    return snaps
      .map((s, i) => {
        const x = padX + i * stepX;
        const y = padY + (1 - valueOf(s)) * plotH;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  // Normalize food + pop against their per-run maxima so all three
  // metrics share a 0..1 axis. Morale is already 0..1.
  const maxFood = Math.max(
    18,
    ...snapsA.map(s => s.foodReserve),
    ...snapsB.map(s => s.foodReserve),
  );
  const maxPop = Math.max(
    1,
    ...snapsA.map(s => s.population),
    ...snapsB.map(s => s.population),
  );
  const normFood = (s: TurnSnapshot) => Math.max(0, Math.min(1, s.foodReserve / maxFood));
  const normPop = (s: TurnSnapshot) => Math.max(0, Math.min(1, s.population / maxPop));
  const normMorale = (s: TurnSnapshot) => Math.max(0, Math.min(1, s.morale));

  const cursorX = padX + currentTurn * (plotW / Math.max(1, maxTurns - 1));
  const hoverX =
    typeof hoveredTurn === 'number'
      ? padX + hoveredTurn * (plotW / Math.max(1, maxTurns - 1))
      : null;

  const turnFromEvent = (clientX: number, rect: DOMRect): number => {
    const xInSvg = ((clientX - rect.left) / rect.width) * W;
    const turn = Math.round(((xInSvg - padX) / plotW) * (maxTurns - 1));
    return Math.max(0, Math.min(maxTurns - 1, turn));
  };

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onJumpToTurn(turnFromEvent(e.clientX, rect));
  };

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onHoverTurnChange) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onHoverTurnChange(turnFromEvent(e.clientX, rect));
  };
  const handleLeave = () => {
    onHoverTurnChange?.(null);
  };

  return (
    <div
      style={{
        position: 'relative',
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
        <span>MORALE · POP · FOOD · T1 → T{maxTurns}</span>
        <span style={{ display: 'flex', gap: 10 }}>
          <span style={{ color: 'var(--vis)' }}>A</span>
          <span style={{ color: 'var(--eng)' }}>B</span>
          <span style={{ color: 'var(--text-3)' }}>— morale</span>
          <span style={{ color: 'var(--text-3)' }}>··· pop</span>
          <span style={{ color: 'var(--text-3)' }}>- - food</span>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
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
        {/* Food (dashed) + pop (dotted) trace beneath the morale line —
            gives the scrubber 3-metric context without drowning morale. */}
        <path
          d={buildPath(snapsA, normFood)}
          fill="none"
          stroke="var(--vis)"
          strokeWidth={0.8}
          strokeDasharray="3 2"
          opacity={0.45}
        />
        <path
          d={buildPath(snapsB, normFood)}
          fill="none"
          stroke="var(--eng)"
          strokeWidth={0.8}
          strokeDasharray="3 2"
          opacity={0.45}
        />
        <path
          d={buildPath(snapsA, normPop)}
          fill="none"
          stroke="var(--vis)"
          strokeWidth={0.7}
          strokeDasharray="1 2"
          opacity={0.5}
        />
        <path
          d={buildPath(snapsB, normPop)}
          fill="none"
          stroke="var(--eng)"
          strokeWidth={0.7}
          strokeDasharray="1 2"
          opacity={0.5}
        />
        <path
          d={buildPath(snapsA, normMorale)}
          fill="none"
          stroke="var(--vis)"
          strokeWidth={1.3}
        />
        <path
          d={buildPath(snapsB, normMorale)}
          fill="none"
          stroke="var(--eng)"
          strokeWidth={1.3}
        />
        {hoverX !== null && hoveredTurn !== currentTurn && (
          <line
            x1={hoverX}
            x2={hoverX}
            y1={0}
            y2={H}
            stroke="var(--text-3)"
            strokeWidth={0.75}
            strokeDasharray="2 3"
            opacity={0.7}
          />
        )}
        <line
          x1={cursorX}
          x2={cursorX}
          y1={0}
          y2={H}
          stroke="var(--amber)"
          strokeWidth={1}
        />
      </svg>
      {typeof hoveredTurn === 'number' && (() => {
        const a = snapsA[hoveredTurn];
        const b = snapsB[hoveredTurn];
        if (!a && !b) return null;
        const leftPct = (hoveredTurn / Math.max(1, maxTurns - 1)) * 100;
        return (
          <div
            style={{
              position: 'absolute',
              left: `calc(${leftPct}% + 8px)`,
              bottom: 6,
              minWidth: 150,
              maxWidth: 200,
              padding: '5px 8px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 3,
              fontFamily: 'var(--mono)',
              fontSize: 9,
              color: 'var(--text-2)',
              pointerEvents: 'none',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
              zIndex: 6,
              transform: leftPct > 75 ? 'translateX(calc(-100% - 16px))' : undefined,
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 800,
                color: 'var(--amber)',
                letterSpacing: '0.08em',
                marginBottom: 3,
              }}
            >
              T{hoveredTurn + 1}
              {a?.year ? ` · ${a.year}` : ''}
            </div>
            {a && (
              <div style={{ color: 'var(--vis)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800 }}>A</span>
                <span>pop {a.population}</span>
                <span>· {Math.round(a.morale * 100)}% mor</span>
                <span>· {a.foodReserve.toFixed(1)}mo</span>
                {(a.births > 0 || a.deaths > 0) && (
                  <span>· +{a.births}/-{a.deaths}</span>
                )}
              </div>
            )}
            {b && (
              <div style={{ color: 'var(--eng)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800 }}>B</span>
                <span>pop {b.population}</span>
                <span>· {Math.round(b.morale * 100)}% mor</span>
                <span>· {b.foodReserve.toFixed(1)}mo</span>
                {(b.births > 0 || b.deaths > 0) && (
                  <span>· +{b.births}/-{b.deaths}</span>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
