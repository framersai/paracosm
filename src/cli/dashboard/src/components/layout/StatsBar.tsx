import type { ColonyState } from '../../hooks/useGameState';
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

export function StatsBar({ colonyA, colonyB, prevColonyA, prevColonyB, deathsA, deathsB, toolsA, toolsB, citationsA, citationsB, crisisText }: StatsBarProps) {
  const scenario = useScenarioContext();

  if (!colonyA && !colonyB) {
    return null;
  }

  const metrics = scenario.ui.headerMetrics.slice(0, 4);

  return (
    <div className="stats-bar" role="region" aria-label="Colony statistics" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'nowrap',
      padding: '4px 12px', gap: '14px', overflow: 'hidden',
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
    </div>
  );
}
