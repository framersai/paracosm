import { useMemo } from 'react';
import type { ColonyState } from '../../hooks/useGameState';
import type { ToolRegistry } from '../../hooks/useToolRegistry';
import { useScenarioContext } from '../../App';

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
  /** Per-simulation forged-tool registry. Used to surface per-side
   *  reuse counts so users can see how much each leader leaned on
   *  emergent tools across the run. */
  toolRegistry?: ToolRegistry;
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

/** Short labels that fit the dense stats bar (desktop + tablet). */
const SHORT_LABELS: Record<string, string> = {
  population: 'POP',
  morale: 'MORALE',
  foodMonthsReserve: 'FOOD',
  powerKw: 'POWER',
  infrastructureModules: 'MODULES',
  scienceOutput: 'SCIENCE',
  hullIntegrity: 'HULL',
  oxygenReserveHours: 'O2',
};

/**
 * Single-character icon labels for phone width (<480px). Fallback to
 * the first letter of the short label when a metric isn't in this
 * table, which keeps the row readable for any scenario that adds
 * custom metrics without registering an icon.
 */
const ICON_LABELS: Record<string, string> = {
  population: 'P',
  morale: 'M',
  foodMonthsReserve: 'F',
  powerKw: 'W',
  infrastructureModules: 'I',
  scienceOutput: 'S',
  hullIntegrity: 'H',
  oxygenReserveHours: 'O₂',
};

function delta(curr: number, prev: number | undefined): string {
  if (prev == null) return '';
  const d = Math.round((curr - prev) * 100) / 100;
  if (d === 0) return '';
  return d > 0 ? `+${d}` : `${d}`;
}

// Shared pill style helpers. Inline-styled like the rest of this file,
// but consolidated so a single change tightens the whole row at once.
const pillWrap: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: '3px', whiteSpace: 'nowrap',
  flexShrink: 0, paddingLeft: '6px', borderLeft: '1px solid var(--border)',
};
const labelStyle: React.CSSProperties = {
  fontSize: '9px', color: 'var(--text-1)', letterSpacing: '0.6px',
  fontWeight: 800, marginRight: '1px', opacity: 0.7,
};
const valueStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 800 };
const deltaStyle: React.CSSProperties = { fontSize: '8px' };
const sepStyle: React.CSSProperties = { color: 'var(--text-3)', fontSize: '9px' };

export function StatsBar({
  colonyA, colonyB, prevColonyA, prevColonyB,
  deathsA, deathsB, toolsA, toolsB, citationsA, citationsB,
  crisisText, toolRegistry,
}: StatsBarProps) {
  const scenario = useScenarioContext();

  // Per-side reuse counts derived from the forged-tool ledger. A reuse is
  // any tool-use event after the first forge, counted per side from the
  // authoritative orchestrator history. Rejected re-forges are excluded
  // so the pill reflects useful reuse only.
  const { reuseA, reuseB } = useMemo(() => {
    let a = 0; let b = 0;
    for (const entry of toolRegistry?.list ?? []) {
      for (let i = 1; i < entry.history.length; i++) {
        const h = entry.history[i];
        if (h.rejected) continue;
        if (h.side === 'a') a++; else if (h.side === 'b') b++;
      }
    }
    return { reuseA: a, reuseB: b };
  }, [toolRegistry]);

  if (!colonyA && !colonyB) {
    return null;
  }

  const metrics = scenario.ui.headerMetrics.slice(0, 4);

  // Stats bar layout: tight pills, horizontal scroll on extreme narrow.
  // Cost is no longer rendered here — overflows in practice and was
  // never the primary signal users read off the top row. Full cost
  // breakdown still lives on the reports / log pages.
  return (
    <div className="stats-bar" role="region" aria-label="Colony statistics" style={{
      // Wrap instead of scroll: on narrow widths the stats fold into a
      // second row rather than hiding off-screen. Horizontal scrolling
      // inside a chrome-level component hides information the user
      // cannot see is there. Let the bar grow taller if it needs to.
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
      padding: '3px 8px', gap: '8px',
      background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)',
      fontFamily: 'var(--mono)',
    }}>
      {crisisText && (
        <span style={{
          flexShrink: 1, fontSize: '12px', fontWeight: 700, color: 'var(--rust)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
        }}>
          {crisisText}
        </span>
      )}

      {/* Colony metrics with per-leader comparison. Labels have a full
          word (.pill-label-full) and a single-char icon (.pill-label-short)
          swapped at phone width via tokens.css media queries. */}
      {metrics.map(metric => {
        const valA = colonyA?.[metric.id] ?? 0;
        const valB = colonyB?.[metric.id] ?? 0;
        const dA = delta(valA, prevColonyA?.[metric.id]);
        const dB = delta(valB, prevColonyB?.[metric.id]);
        const fA = fmtVal(valA, metric.format);
        const fB = fmtVal(valB, metric.format);
        const suffix = fmtSuffix(metric.id);
        const label = SHORT_LABELS[metric.id] || metric.id.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
        const icon = ICON_LABELS[metric.id] || label.charAt(0);
        return (
          <span key={metric.id} style={pillWrap}>
            <span style={labelStyle} title={label}>
              <span className="pill-label-full">{label}</span>
              <span className="pill-label-short">{icon}</span>
            </span>
            <span style={{ ...valueStyle, color: 'var(--vis)' }}>{fA}{suffix}</span>
            {dA && <span style={{ ...deltaStyle, color: dA.startsWith('+') ? 'var(--green)' : 'var(--rust)' }}>{dA}</span>}
            <span style={sepStyle}>vs</span>
            <span style={{ ...valueStyle, color: 'var(--eng)' }}>{fB}{suffix}</span>
            {dB && <span style={{ ...deltaStyle, color: dB.startsWith('+') ? 'var(--green)' : 'var(--rust)' }}>{dB}</span>}
          </span>
        );
      })}

      {/* Deaths — leader-coloured A/B so the eye follows the same
          colour mapping as the colony metrics (vis for A, eng for B).
          Rust-on-red was a separate severity signal that conflicted
          with the leader-attribution language the rest of the bar
          speaks. */}
      <span style={pillWrap}>
        <span style={labelStyle} title="Deaths">
          <span className="pill-label-full">DEATHS</span>
          <span className="pill-label-short">†</span>
        </span>
        <span style={{ ...valueStyle, color: 'var(--vis)' }}>{deathsA}</span>
        <span style={sepStyle}>vs</span>
        <span style={{ ...valueStyle, color: 'var(--eng)' }}>{deathsB}</span>
      </span>

      {/* Tools + Reuse cluster together. The two numbers speak to the
          same emergent-capability story: how many unique tools a side
          forged (TOOLS) and how many times those tools got reused
          across events without re-forging (REUSE). Keeping CITES
          between them obscured the relationship. */}
      <span style={pillWrap}>
        <span style={labelStyle} title="Tools forged">
          <span className="pill-label-full">TOOLS</span>
          <span className="pill-label-short">T</span>
        </span>
        <span style={{ ...valueStyle, color: 'var(--vis)' }}>{toolsA}</span>
        <span style={sepStyle}>/</span>
        <span style={{ ...valueStyle, color: 'var(--eng)' }}>{toolsB}</span>
      </span>

      {toolRegistry && toolRegistry.list.length > 0 && (
        <span
          style={pillWrap}
          title="Forged-tool reuse count per leader. Reuses amortize forge cost across multiple events."
        >
          <span style={labelStyle} title="Reuse count">
            <span className="pill-label-full">REUSE</span>
            <span className="pill-label-short">R</span>
          </span>
          <span style={{ ...valueStyle, color: 'var(--vis)' }}>{reuseA}</span>
          <span style={sepStyle}>/</span>
          <span style={{ ...valueStyle, color: 'var(--eng)' }}>{reuseB}</span>
        </span>
      )}

      {/* Citations — moved after the tools cluster since it is a
          research-signal metric, not a capability-signal one. */}
      <span style={pillWrap}>
        <span style={labelStyle} title="Citations">
          <span className="pill-label-full">CITES</span>
          <span className="pill-label-short">C</span>
        </span>
        <span style={{ ...valueStyle, color: 'var(--vis)' }}>{citationsA}</span>
        <span style={sepStyle}>/</span>
        <span style={{ ...valueStyle, color: 'var(--eng)' }}>{citationsB}</span>
      </span>
    </div>
  );
}
