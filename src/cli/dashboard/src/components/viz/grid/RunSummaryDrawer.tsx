import { useEffect, useMemo } from 'react';
import type { TurnSnapshot } from '../viz-types.js';
import { useScenarioLabels } from '../../../hooks/useScenarioLabels.js';

interface RunSummaryDrawerProps {
  open: boolean;
  onClose: () => void;
  snapsA: TurnSnapshot[];
  snapsB: TurnSnapshot[];
  leaderNameA: string;
  leaderNameB: string;
  forgeApprovedA: number;
  forgeApprovedB: number;
  reuseCountA: number;
  reuseCountB: number;
  divergedCount: number;
}

interface SideStats {
  turns: number;
  totalBirths: number;
  totalDeaths: number;
  peakPop: number;
  finalPop: number;
  avgMorale: number;
  minMorale: number;
  avgFood: number;
  minFood: number;
}

function computeSide(snaps: TurnSnapshot[]): SideStats | null {
  if (snaps.length === 0) return null;
  let totalBirths = 0;
  let totalDeaths = 0;
  let peakPop = 0;
  let moraleSum = 0;
  let foodSum = 0;
  let minMorale = Infinity;
  let minFood = Infinity;
  for (const s of snaps) {
    totalBirths += s.births;
    totalDeaths += s.deaths;
    if (s.population > peakPop) peakPop = s.population;
    moraleSum += s.morale;
    foodSum += s.foodReserve;
    if (s.morale < minMorale) minMorale = s.morale;
    if (s.foodReserve < minFood) minFood = s.foodReserve;
  }
  return {
    turns: snaps.length,
    totalBirths,
    totalDeaths,
    peakPop,
    finalPop: snaps[snaps.length - 1].population,
    avgMorale: moraleSum / snaps.length,
    minMorale: minMorale === Infinity ? 0 : minMorale,
    avgFood: foodSum / snaps.length,
    minFood: minFood === Infinity ? 0 : minFood,
  };
}

/**
 * Modal drawer summarizing the full run at-a-glance: per-side totals,
 * forge productivity, reuse count, divergence headline. Useful after a
 * scenario finishes for quick comparison. Dismiss via Esc / backdrop.
 */
export function RunSummaryDrawer(props: RunSummaryDrawerProps) {
  const { open, onClose } = props;
  const labels = useScenarioLabels();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const a = useMemo(() => computeSide(props.snapsA), [props.snapsA]);
  const b = useMemo(() => computeSide(props.snapsB), [props.snapsB]);
  if (!open) return null;

  const cell = (label: string, val: string, valColor?: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontSize: 8,
          color: 'var(--text-4)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontFamily: 'var(--mono)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 800,
          fontFamily: 'var(--mono)',
          color: valColor || 'var(--text-1)',
        }}
      >
        {val}
      </span>
    </div>
  );

  const sideBlock = (
    name: string,
    color: string,
    s: SideStats | null,
    forgeCount: number,
    reuseCount: number,
  ) => (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: 14,
        background: 'var(--bg-deep)',
        border: `1px solid ${color}66`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 10,
          fontFamily: 'var(--mono)',
        }}
      >
        {name}
      </div>
      {s ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px 14px',
          }}
        >
          {cell('Turns', `${s.turns}`)}
          {cell('Final pop', `${s.finalPop}`, color)}
          {cell('Peak pop', `${s.peakPop}`)}
          {cell('Total births', `${s.totalBirths}`, 'rgba(106, 173, 72, 0.95)')}
          {cell('Total deaths', `${s.totalDeaths}`, 'rgba(200, 95, 80, 0.95)')}
          {cell('Avg morale', `${Math.round(s.avgMorale * 100)}%`)}
          {cell('Min morale', `${Math.round(s.minMorale * 100)}%`, s.minMorale < 0.3 ? 'var(--rust)' : 'var(--text-1)')}
          {cell('Min food', `${s.minFood.toFixed(1)}mo`, s.minFood < 3 ? 'var(--rust)' : 'var(--text-1)')}
          {cell('Tools forged', `${forgeCount}`, 'var(--amber)')}
          {cell('Tool reuses', `${reuseCount}`, 'var(--amber)')}
        </div>
      ) : (
        <div style={{ color: 'var(--text-4)', fontSize: 11 }}>No snapshots yet.</div>
      )}
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Run summary"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 24,
          maxWidth: 820,
          width: '100%',
          maxHeight: '92vh',
          overflow: 'auto',
          boxShadow: '0 12px 48px rgba(0, 0, 0, 0.75)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 800,
              color: 'var(--amber)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontFamily: 'var(--mono)',
            }}
          >
            Run Summary · {props.snapsA.length || props.snapsB.length} turns
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close run summary"
            style={{
              width: 26,
              height: 26,
              background: 'transparent',
              color: 'var(--text-3)',
              border: '1px solid var(--border)',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 13,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
          {sideBlock(props.leaderNameA, 'var(--vis)', a, props.forgeApprovedA, props.reuseCountA)}
          {sideBlock(props.leaderNameB, 'var(--eng)', b, props.forgeApprovedB, props.reuseCountB)}
        </div>

        <div
          style={{
            padding: 12,
            background: 'var(--bg-deep)',
            border: '1px solid var(--border)',
            borderLeft: '3px solid var(--amber)',
            borderRadius: 4,
            display: 'flex',
            gap: 20,
            alignItems: 'center',
            fontFamily: 'var(--mono)',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 8,
                color: 'var(--text-4)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Divergence
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--amber)' }}>
              {props.divergedCount}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
            {labels.People} alive on one side but dead on the other at the final snapshot — a measure
            of how much the two leaders' decisions diverged the outcomes.
          </div>
        </div>
      </div>
    </div>
  );
}
