import type { TurnSnapshot } from '../viz-types.js';

interface LivingColonyGridProps {
  snapshot: TurnSnapshot | undefined;
  previousSnapshot?: TurnSnapshot | undefined;
  leaderName: string;
  leaderArchetype: string;
  leaderColony?: string;
  sideColor: string;
  side: 'a' | 'b';
  lagTurns?: number;
}

/**
 * Per-leader living colony grid. Phase 1 scaffolding — renders a
 * placeholder div until the WebGL renderer + overlay layers land in
 * Task 12. Replaced by a real implementation in subsequent tasks.
 */
export function LivingColonyGrid(props: LivingColonyGridProps) {
  const { snapshot, leaderName, sideColor, side } = props;
  return (
    <div
      data-testid={`living-colony-grid-${side}`}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--mono)',
        background: 'var(--bg-deep)', border: `1px solid ${sideColor}33`,
      }}
    >
      Living grid (Phase 1 scaffold) — {leaderName} · T{snapshot?.turn ?? 0}
    </div>
  );
}
