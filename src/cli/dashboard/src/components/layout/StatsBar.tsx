import { useState } from 'react';
import type { ColonyState, CostSiteBreakdown } from '../../hooks/useGameState';
import { useScenarioContext } from '../../App';
import { CostBreakdownModal } from './CostBreakdownModal';

interface CostInfo {
  totalTokens: number;
  totalCostUSD: number;
  llmCalls: number;
  /** Per-pipeline-stage spend. Only present after runtime upgrade; old
   *  cached runs without breakdown data still render the pill, but the
   *  modal reports no rows. */
  breakdown?: CostSiteBreakdown;
}

interface StatsBarProps {
  colonyA: ColonyState | null;
  colonyB: ColonyState | null;
  prevColonyA: ColonyState | null;
  prevColonyB: ColonyState | null;
  deathsA: number;
  deathsB: number;
  toolsA: number;
  toolsB: number;
  citationsA: number;
  citationsB: number;
  crisisText?: string;
  cost?: CostInfo;
  costA?: CostInfo;
  costB?: CostInfo;
  /** Used as the label on the per-leader breakdown card in the modal. */
  leaderAName?: string;
  leaderBName?: string;
}

function fmtUsd(v: number): string {
  if (v <= 0) return '0';
  return v < 0.01 ? v.toFixed(4) : v.toFixed(2);
}

function fmtVal(value: number, format: string): string {
  if (format === 'percent') return `${Math.round(value * 100)}%`;
  if (format === 'number') {
    const r = Math.round(value * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }
  return String(value);
}

function fmtSuffix(id: string): string {
  if (id === 'foodMonthsReserve') return 'mo';
  return '';
}

/** Short labels that fit the dense stats bar */
const SHORT_LABELS: Record<string, string> = {
  population: 'POPULATION',
  morale: 'MORALE',
  foodMonthsReserve: 'FOOD',
  powerKw: 'POWER',
  infrastructureModules: 'MODULES',
  scienceOutput: 'SCIENCE',
  hullIntegrity: 'HULL',
  oxygenReserveHours: 'O2',
};

function delta(curr: number, prev: number | undefined): string {
  if (prev == null) return '';
  const d = Math.round((curr - prev) * 100) / 100;
  if (d === 0) return '';
  return d > 0 ? `+${d}` : `${d}`;
}

export function StatsBar({ colonyA, colonyB, prevColonyA, prevColonyB, deathsA, deathsB, toolsA, toolsB, citationsA, citationsB, crisisText, cost, costA, costB, leaderAName, leaderBName }: StatsBarProps) {
  const scenario = useScenarioContext();
  // Local state: whether the click-through cost breakdown modal is open.
  // Lives here (not in App) because only StatsBar triggers it.
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  if (!colonyA && !colonyB) {
    return null;
  }

  const metrics = scenario.ui.headerMetrics.slice(0, 4);

  // Stats bar layout:
  //   overflowX: 'auto' so the cost pill and other late pills never get
  //   clipped. On narrow desktops the bar now scrolls horizontally
  //   instead of silently truncating items off-screen (the old
  //   `overflow: hidden` was eating the COST pill's leader-B value).
  //   The .stats-bar responsive CSS class (tokens.css) pins
  //   `justify-content: flex-start` + `-webkit-overflow-scrolling: touch`
  //   at tablet and below for iOS momentum scrolling.
  return (
    <div className="stats-bar" role="region" aria-label="Colony statistics" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'nowrap',
      padding: '4px 12px', gap: '14px',
      overflowX: 'auto', overflowY: 'hidden',
      WebkitOverflowScrolling: 'touch',
      background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)',
      fontFamily: 'var(--mono)',
    }}>
      {/* Crisis ticker */}
      {crisisText && (
        <span style={{ flexShrink: 1, fontSize: '13px', fontWeight: 700, color: 'var(--rust)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          {crisisText}
        </span>
      )}

      {/* Metrics with vs */}
      {metrics.map(metric => {
        const valA = colonyA?.[metric.id] ?? 0;
        const valB = colonyB?.[metric.id] ?? 0;
        const dA = delta(valA, prevColonyA?.[metric.id]);
        const dB = delta(valB, prevColonyB?.[metric.id]);
        const fA = fmtVal(valA, metric.format);
        const fB = fmtVal(valB, metric.format);
        const suffix = fmtSuffix(metric.id);
        const label = SHORT_LABELS[metric.id] || metric.id.replace(/([A-Z])/g, ' $1').trim().toUpperCase();

        return (
          <span key={metric.id} style={{ display: 'flex', alignItems: 'baseline', gap: '4px', whiteSpace: 'nowrap', flexShrink: 0, paddingLeft: '8px', borderLeft: '1px solid var(--border)' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-1)', letterSpacing: '0.8px', fontWeight: 800, marginRight: '2px', opacity: 0.7 }}>
              {label}
            </span>
            <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--vis)' }}>{fA}{suffix}</span>
            {dA && <span style={{ fontSize: '9px', color: dA.startsWith('+') ? 'var(--green)' : 'var(--rust)' }}>{dA}</span>}
            <span style={{ color: 'var(--text-3)', fontSize: '10px' }}>vs</span>
            <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--eng)' }}>{fB}{suffix}</span>
            {dB && <span style={{ fontSize: '9px', color: dB.startsWith('+') ? 'var(--green)' : 'var(--rust)' }}>{dB}</span>}
          </span>
        );
      })}

      {/* Deaths, Tools, Citations */}
      <span style={{ display: 'flex', alignItems: 'baseline', gap: '4px', whiteSpace: 'nowrap', flexShrink: 0, paddingLeft: '8px', borderLeft: '1px solid var(--border)' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-1)', letterSpacing: '0.8px', fontWeight: 800, marginRight: '2px', opacity: 0.7 }}>DEATHS</span>
        <span style={{ color: deathsA > 0 ? 'var(--rust)' : 'var(--text-1)', fontWeight: 800 }}>{deathsA}</span>
        <span style={{ color: 'var(--text-3)', fontSize: '10px' }}>vs</span>
        <span style={{ color: deathsB > 0 ? 'var(--rust)' : 'var(--text-1)', fontWeight: 800 }}>{deathsB}</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: '4px', whiteSpace: 'nowrap', flexShrink: 0, paddingLeft: '8px', borderLeft: '1px solid var(--border)' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-1)', letterSpacing: '0.8px', fontWeight: 800, marginRight: '2px', opacity: 0.7 }}>TOOLS</span>
        <span style={{ color: 'var(--text-1)', fontWeight: 800 }}>{toolsA}</span>
        <span style={{ color: 'var(--text-3)', fontSize: '10px' }}>/</span>
        <span style={{ color: 'var(--text-1)', fontWeight: 800 }}>{toolsB}</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: '4px', whiteSpace: 'nowrap', flexShrink: 0, paddingLeft: '8px', borderLeft: '1px solid var(--border)' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-1)', letterSpacing: '0.8px', fontWeight: 800, marginRight: '2px', opacity: 0.7 }}>CITES</span>
        <span style={{ color: 'var(--text-1)', fontWeight: 800 }}>{citationsA}</span>
        <span style={{ color: 'var(--text-3)', fontSize: '10px' }}>/</span>
        <span style={{ color: 'var(--text-1)', fontWeight: 800 }}>{citationsB}</span>
      </span>

      {/* Cost tracker — split per leader when both sides have data, with
          combined total alongside. Falls back to combined-only when only
          one side has reported. Clickable: opens the per-stage breakdown
          modal so the user can see where the money went (usually depts
          + reactions dominate). */}
      {cost && cost.llmCalls > 0 && (
        <button
          type="button"
          onClick={() => setBreakdownOpen(true)}
          aria-label="Show cost breakdown by pipeline stage"
          title={costA && costB
            ? `Click for breakdown · Leader A: $${fmtUsd(costA.totalCostUSD)} (${(costA.totalTokens / 1000).toFixed(1)}k tok, ${costA.llmCalls} calls) · Leader B: $${fmtUsd(costB.totalCostUSD)} (${(costB.totalTokens / 1000).toFixed(1)}k tok, ${costB.llmCalls} calls)`
            : `Click for breakdown · ${cost.llmCalls} LLM calls, ${(cost.totalTokens / 1000).toFixed(1)}k tokens`}
          style={{
            display: 'flex', alignItems: 'baseline', gap: '4px', whiteSpace: 'nowrap',
            flexShrink: 0, paddingLeft: '8px', paddingRight: '4px',
            borderLeft: '1px solid var(--border)',
            background: 'transparent', border: 'none',
            borderTop: 'none', borderRight: 'none', borderBottom: 'none',
            cursor: 'pointer',
            color: 'var(--text-1)',
            fontFamily: 'var(--mono)',
          }}
        >
          <span style={{ fontSize: '10px', color: 'var(--text-1)', letterSpacing: '0.8px', fontWeight: 800, opacity: 0.7 }}>COST</span>
          {costA && costA.totalCostUSD > 0 && (
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--vis)' }}>${fmtUsd(costA.totalCostUSD)}</span>
          )}
          {costA && costB && (costA.totalCostUSD > 0 || costB.totalCostUSD > 0) && (
            <span style={{ color: 'var(--text-3)', fontSize: '10px' }}>vs</span>
          )}
          {costB && costB.totalCostUSD > 0 && (
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--eng)' }}>${fmtUsd(costB.totalCostUSD)}</span>
          )}
          <span style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 700, marginLeft: 4 }}>
            ${fmtUsd(cost.totalCostUSD)}
          </span>
          <span style={{ fontSize: '9px', color: 'var(--text-3)' }}>
            {(cost.totalTokens / 1000).toFixed(0)}k tok
          </span>
          {/* Affordance hint so users know the pill is interactive. */}
          <span aria-hidden="true" style={{ fontSize: '9px', color: 'var(--text-3)', marginLeft: 2 }}>›</span>
        </button>
      )}

      {breakdownOpen && cost && (
        <CostBreakdownModal
          combined={cost}
          leaderA={costA}
          leaderB={costB}
          leaderAName={leaderAName}
          leaderBName={leaderBName}
          onClose={() => setBreakdownOpen(false)}
        />
      )}
    </div>
  );
}
