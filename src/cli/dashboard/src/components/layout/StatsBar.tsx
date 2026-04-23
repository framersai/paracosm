import { useMemo, useRef, useEffect } from 'react';
import type { LeaderSideState } from '../../hooks/useGameState';
import { getLeaderColorVar } from '../../hooks/useGameState';
import type { ToolRegistry } from '../../hooks/useToolRegistry';
import { useScenarioContext } from '../../App';
import styles from './StatsBar.module.scss';

export interface StatsBarLeader {
  id: string;
  state: LeaderSideState;
}

interface StatsBarProps {
  /** Ordered leader list. Index 0 renders with vis palette, index 1 with eng.
   *  F2/F3 will extend beyond two columns; today only the first two render
   *  in the pills row. */
  leaders: StatsBarLeader[];
  crisisText?: string;
  /** Per-simulation forged-tool registry. Used to surface per-leader reuse
   *  counts so users can see how much each leader leaned on emergent tools
   *  across the run. */
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

/** Single-character icon labels for phone width (<480px). */
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

function deltaClass(d: string, tone: 'gain' | 'lossIsRed' | 'neutral'): string {
  if (!d) return '';
  if (tone === 'neutral') return styles.deltaNeutral;
  if (tone === 'lossIsRed') return styles.deltaNegative;
  return d.startsWith('+') ? styles.deltaPositive : styles.deltaNegative;
}

function formatCauses(causes: Record<string, number> | undefined): string {
  if (!causes) return '';
  const sorted = Object.entries(causes).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return '';
  const top = sorted.slice(0, 3).map(([cause, n]) => {
    const short = cause.replace('radiation cancer', 'radiation').replace('natural causes', 'age').replace('age-related complications', 'age').replace('fatal fracture', 'fracture').replace('accident: ', '').replace('accident', 'accident');
    return `${n} ${short}`;
  });
  const rest = sorted.length - top.length;
  return rest > 0 ? `${top.join(' \u00b7 ')} +${rest}` : top.join(' \u00b7 ');
}

export function StatsBar({ leaders, crisisText, toolRegistry }: StatsBarProps) {
  const scenario = useScenarioContext();

  const aLeader = leaders[0];
  const bLeader = leaders[1];
  const aState = aLeader?.state;
  const bState = bLeader?.state;
  const systemsA = aState?.systems ?? null;
  const systemsB = bState?.systems ?? null;
  const prevSystemsA = aState?.prevSystems ?? null;
  const prevSystemsB = bState?.prevSystems ?? null;
  const deathsA = aState?.deaths ?? 0;
  const deathsB = bState?.deaths ?? 0;
  const deathCausesA = aState?.deathCauses;
  const deathCausesB = bState?.deathCauses;
  const toolsA = aState?.tools ?? 0;
  const toolsB = bState?.tools ?? 0;
  const citationsA = aState?.citations ?? 0;
  const citationsB = bState?.citations ?? 0;
  const aLeaderName = aLeader?.id ?? '';
  const bLeaderName = bLeader?.id ?? '';

  // Per-leader reuse counts derived from the forged-tool ledger. A
  // reuse is any tool-use event after the first forge, counted per
  // leader (by name) from the authoritative orchestrator history.
  // Rejected re-forges are excluded so the pill reflects useful reuse only.
  const { reuseA, reuseB } = useMemo(() => {
    let a = 0; let b = 0;
    for (const entry of toolRegistry?.list ?? []) {
      for (let i = 1; i < entry.history.length; i++) {
        const h = entry.history[i];
        if (h.rejected) continue;
        if (h.leaderName === aLeaderName) a++;
        else if (h.leaderName === bLeaderName) b++;
      }
    }
    return { reuseA: a, reuseB: b };
  }, [toolRegistry, aLeaderName, bLeaderName]);

  const prevCountersRef = useRef({ toolsA, toolsB, reuseA, reuseB, citationsA, citationsB, deathsA, deathsB });
  const prev = prevCountersRef.current;
  const deltaToolsA = delta(toolsA, prev.toolsA);
  const deltaToolsB = delta(toolsB, prev.toolsB);
  const deltaReuseA = delta(reuseA, prev.reuseA);
  const deltaReuseB = delta(reuseB, prev.reuseB);
  const deltaCitesA = delta(citationsA, prev.citationsA);
  const deltaCitesB = delta(citationsB, prev.citationsB);
  const deltaDeathsA = delta(deathsA, prev.deathsA);
  const deltaDeathsB = delta(deathsB, prev.deathsB);
  useEffect(() => {
    prevCountersRef.current = { toolsA, toolsB, reuseA, reuseB, citationsA, citationsB, deathsA, deathsB };
  }, [toolsA, toolsB, reuseA, reuseB, citationsA, citationsB, deathsA, deathsB]);

  if (!systemsA && !systemsB) {
    return null;
  }

  const metrics = scenario.ui.headerMetrics.slice(0, 4);
  const colorA = getLeaderColorVar(0);
  const colorB = getLeaderColorVar(1);

  return (
    <div
      className={`stats-bar ${styles.bar}`}
      role="region"
      aria-label="Leader statistics"
      style={{
        ['--leader-color-a' as string]: colorA,
        ['--leader-color-b' as string]: colorB,
      }}
    >
      {crisisText && <span className={styles.crisis}>{crisisText}</span>}

      {metrics.map(metric => {
        const valA = systemsA?.[metric.id] ?? 0;
        const valB = systemsB?.[metric.id] ?? 0;
        const dA = delta(valA, prevSystemsA?.[metric.id]);
        const dB = delta(valB, prevSystemsB?.[metric.id]);
        const fA = fmtVal(valA, metric.format);
        const fB = fmtVal(valB, metric.format);
        const suffix = fmtSuffix(metric.id);
        const label = SHORT_LABELS[metric.id] || metric.id.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
        const icon = ICON_LABELS[metric.id] || label.charAt(0);
        return (
          <span key={metric.id} className={styles.pill}>
            <span className={styles.label} title={label}>
              <span className="pill-label-full">{label}</span>
              <span className="pill-label-short">{icon}</span>
            </span>
            <span className={styles.valueA}>{fA}{suffix}</span>
            {dA && <span className={deltaClass(dA, 'gain')}>{dA}</span>}
            <span className={styles.sep}>vs</span>
            <span className={styles.valueB}>{fB}{suffix}</span>
            {dB && <span className={deltaClass(dB, 'gain')}>{dB}</span>}
          </span>
        );
      })}

      <span className={styles.pill}>
        <span className={styles.label} title="Deaths">
          <span className="pill-label-full">DEATHS</span>
          <span className="pill-label-short">†</span>
        </span>
        <span
          className={styles.valueA}
          title={deathCausesA && Object.keys(deathCausesA).length > 0
            ? `Leader A deaths by cause: ${Object.entries(deathCausesA).map(([k, v]) => `${v} ${k}`).join(', ')}`
            : undefined}
        >
          {deathsA}
        </span>
        {deltaDeathsA && <span className={deltaClass(deltaDeathsA, 'lossIsRed')}>{deltaDeathsA}</span>}
        <span className={styles.sep}>vs</span>
        <span
          className={styles.valueB}
          title={deathCausesB && Object.keys(deathCausesB).length > 0
            ? `Leader B deaths by cause: ${Object.entries(deathCausesB).map(([k, v]) => `${v} ${k}`).join(', ')}`
            : undefined}
        >
          {deathsB}
        </span>
        {deltaDeathsB && <span className={deltaClass(deltaDeathsB, 'lossIsRed')}>{deltaDeathsB}</span>}
        {(() => {
          const chipA = formatCauses(deathCausesA);
          const chipB = formatCauses(deathCausesB);
          if (!chipA && !chipB) return null;
          return (
            <span className={styles.causesChip}>
              ({chipA || '0'} / {chipB || '0'})
            </span>
          );
        })()}
      </span>

      <span className={styles.pill}>
        <span className={styles.label} title="Tools forged">
          <span className="pill-label-full">TOOLS</span>
          <span className="pill-label-short">T</span>
        </span>
        <span className={styles.valueA}>{toolsA}</span>
        {deltaToolsA && <span className={styles.deltaPositive}>{deltaToolsA}</span>}
        <span className={styles.sep}>/</span>
        <span className={styles.valueB}>{toolsB}</span>
        {deltaToolsB && <span className={styles.deltaPositive}>{deltaToolsB}</span>}
      </span>

      {toolRegistry && toolRegistry.list.length > 0 && (
        <span
          className={styles.pill}
          title="Forged-tool reuse count per leader. Reuses amortize forge cost across multiple events."
        >
          <span className={styles.label} title="Reuse count">
            <span className="pill-label-full">REUSE</span>
            <span className="pill-label-short">R</span>
          </span>
          <span className={styles.valueA}>{reuseA}</span>
          {deltaReuseA && <span className={styles.deltaPositive}>{deltaReuseA}</span>}
          <span className={styles.sep}>/</span>
          <span className={styles.valueB}>{reuseB}</span>
          {deltaReuseB && <span className={styles.deltaPositive}>{deltaReuseB}</span>}
        </span>
      )}

      <span className={styles.pill}>
        <span className={styles.label} title="Citations">
          <span className="pill-label-full">CITES</span>
          <span className="pill-label-short">C</span>
        </span>
        <span className={styles.valueA}>{citationsA}</span>
        {deltaCitesA && <span className={deltaClass(deltaCitesA, 'neutral')}>{deltaCitesA}</span>}
        <span className={styles.sep}>/</span>
        <span className={styles.valueB}>{citationsB}</span>
        {deltaCitesB && <span className={deltaClass(deltaCitesB, 'neutral')}>{deltaCitesB}</span>}
      </span>
    </div>
  );
}
