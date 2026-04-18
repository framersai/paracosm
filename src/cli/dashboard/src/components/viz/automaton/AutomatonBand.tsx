import { useEffect, useMemo, useState } from 'react';
import type { TurnSnapshot } from '../viz-types.js';
import { AutomatonCanvas, type ForgeAttemptInput, type ReuseCallInput } from './AutomatonCanvas.js';
import type { AutomatonMode } from './shared.js';
import {
  COLLAPSED_BAND_HEIGHT,
  DEFAULT_BAND_HEIGHT,
  ECOLOGY_BAND_HEIGHT,
  MOBILE_BAND_HEIGHT,
} from './shared.js';

const AUTOMATON_MAXIMIZED_KEY = 'paracosm:vizAutomatonMaximized';

interface HexacoShape { O: number; C: number; E: number; A: number; Em: number; HH: number }

interface AutomatonBandProps {
  snapshot: TurnSnapshot | undefined;
  hexacoById: Map<string, HexacoShape> | undefined;
  side: 'a' | 'b';
  sideColor: string;
  mode: AutomatonMode;
  collapsed: boolean;
  onModeChange: (mode: AutomatonMode) => void;
  onCollapseToggle: () => void;
  eventCategories?: string[];
  eventIntensity?: number;
  forgeAttempts?: ForgeAttemptInput[];
  reuseCalls?: ReuseCallInput[];
  scenarioDepartments?: string[];
  onSelectAgent?: (agentId: string) => void;
  /** Maximize mode fills the whole panel. Lifted so both sides expand
   *  together. Undefined → panel owns local state. */
  maximized?: boolean;
  onMaximizedChange?: (next: boolean) => void;
}

/**
 * Container around the canvas. Owns the mode pill, the collapse
 * control, and the height transitions between modes. Callers lift
 * mode + collapsed state so the two panels stay in sync through a
 * shared parent.
 */
export function AutomatonBand(props: AutomatonBandProps) {
  const { snapshot, hexacoById, side, sideColor, mode, collapsed, onModeChange, onCollapseToggle, eventCategories, eventIntensity, forgeAttempts, reuseCalls, scenarioDepartments, onSelectAgent, maximized: maximizedProp, onMaximizedChange } = props;
  const [localMaximized, setLocalMaximized] = useState<boolean>(() => {
    try { return localStorage.getItem(AUTOMATON_MAXIMIZED_KEY) === '1'; }
    catch { return false; }
  });
  const maximized = maximizedProp ?? localMaximized;
  const toggleMaximized = () => {
    const next = !maximized;
    if (onMaximizedChange) onMaximizedChange(next);
    else setLocalMaximized(next);
    try { localStorage.setItem(AUTOMATON_MAXIMIZED_KEY, next ? '1' : '0'); } catch { /* silent */ }
  };
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  );
  const [reducedMotion, setReducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Reduced-motion users get a static labelled strip instead of the
  // animated canvas. The data is still there, just rendered as text
  // so no particles / interpolation / rAF fires.
  const reducedSummary = useMemo(() => {
    if (!snapshot) return null;
    const alive = snapshot.cells.filter(c => c.alive).length;
    const moodCounts: Record<string, number> = {};
    for (const c of snapshot.cells) {
      if (!c.alive) continue;
      moodCounts[c.mood] = (moodCounts[c.mood] ?? 0) + 1;
    }
    const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];
    const reuseTotal = (reuseCalls ?? []).length;
    const forgedTotal = (forgeAttempts ?? []).filter(a => a.approved).length;
    if (mode === 'mood') {
      return `${alive} alive · ${topMood ? `${Math.round((topMood[1] / alive) * 100)}% ${topMood[0]}` : 'no mood data'}`;
    }
    if (mode === 'forge') {
      return `${forgedTotal} tool${forgedTotal === 1 ? '' : 's'} forged · ${reuseTotal} reuse${reuseTotal === 1 ? '' : 's'}`;
    }
    return `${snapshot.population} pop · ${Math.round(snapshot.morale * 100)}% morale · ${snapshot.foodReserve.toFixed(1)}mo food`;
  }, [snapshot, mode, forgeAttempts, reuseCalls]);

  const expandedHeight = isMobile
    ? MOBILE_BAND_HEIGHT
    : mode === 'ecology'
    ? ECOLOGY_BAND_HEIGHT
    : DEFAULT_BAND_HEIGHT;

  // Reduced-motion users default collapsed with a static summary.
  const effectiveCollapsed = collapsed || reducedMotion;
  const bandHeight = effectiveCollapsed
    ? (reducedMotion ? 40 : COLLAPSED_BAND_HEIGHT)
    : maximized
    ? undefined // flex to fill the panel; height:'100%' handled below
    : expandedHeight;

  return (
    <div
      className="automaton-band"
      style={{
        position: 'relative',
        width: '100%',
        height: bandHeight !== undefined ? bandHeight : '100%',
        flex: maximized && !effectiveCollapsed ? 1 : 'none',
        minHeight: maximized && !effectiveCollapsed ? 320 : undefined,
        marginBottom: 6,
        borderRadius: 6,
        overflow: 'hidden',
        background: 'var(--bg-deep)',
        border: '1px solid var(--border)',
        transition: effectiveCollapsed ? 'height 220ms cubic-bezier(0.2, 0.9, 0.3, 1)' : undefined,
      }}
    >
      {effectiveCollapsed ? (
        reducedMotion ? (
          <div
            role="status"
            aria-label={`Automaton (reduced motion): ${reducedSummary ?? 'no data'}`}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              padding: '6px 12px',
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'var(--bg-panel)',
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)',
              letterSpacing: '0.08em',
            }}
          >
            <span style={{ color: sideColor, fontWeight: 800, textTransform: 'uppercase' }}>
              {mode}
            </span>
            <span style={{ color: 'var(--text-2)' }}>
              {reducedSummary}
            </span>
            <button
              type="button"
              onClick={onCollapseToggle}
              aria-label="Force expand automaton despite reduced motion"
              style={{
                marginLeft: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 3,
                background: 'var(--bg-card)', color: 'var(--text-3)',
                cursor: 'pointer', fontSize: 10,
                padding: '2px 8px', fontFamily: 'var(--mono)',
              }}
            >
              Force animate
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onCollapseToggle}
            aria-expanded="false"
            aria-label="Expand automaton"
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              background: `linear-gradient(90deg, ${sideColor}33, transparent 40%, ${sideColor}33 80%)`,
              border: 'none', cursor: 'pointer', padding: 0,
              animation: 'automaton-pulse 3.5s ease-in-out infinite',
            }}
          />
        )
      ) : (
        <>
          <AutomatonCanvas
            snapshot={snapshot}
            hexacoById={hexacoById}
            side={side}
            sideColor={sideColor}
            mode={mode}
            height={bandHeight ?? (maximized ? 600 : expandedHeight)}
            eventCategories={eventCategories}
            eventIntensity={eventIntensity}
            forgeAttempts={forgeAttempts}
            reuseCalls={reuseCalls}
            scenarioDepartments={scenarioDepartments}
            onSelectAgent={onSelectAgent}
          />
          <ModePill
            mode={mode}
            maximized={maximized}
            onChange={onModeChange}
            onCollapse={onCollapseToggle}
            onMaximizeToggle={toggleMaximized}
          />
        </>
      )}
    </div>
  );
}

function ModePill({ mode, maximized, onChange, onCollapse, onMaximizeToggle }: {
  mode: AutomatonMode;
  maximized: boolean;
  onChange: (mode: AutomatonMode) => void;
  onCollapse: () => void;
  onMaximizeToggle: () => void;
}) {
  const segStyle = (m: AutomatonMode): React.CSSProperties => ({
    padding: '2px 8px',
    fontSize: 9,
    fontFamily: 'var(--mono)',
    fontWeight: 800,
    letterSpacing: '0.1em',
    border: '1px solid var(--border)',
    background: mode === m ? 'var(--amber)' : 'var(--bg-panel)',
    color: mode === m ? 'var(--bg-deep)' : 'var(--text-3)',
    cursor: 'pointer',
  });
  return (
    <div
      style={{
        position: 'absolute',
        top: 6,
        left: 6,
        display: 'flex',
        gap: 0,
        alignItems: 'center',
        pointerEvents: 'auto',
      }}
    >
      <button type="button" aria-pressed={mode === 'mood'} onClick={() => onChange('mood')} style={{ ...segStyle('mood'), borderRadius: '3px 0 0 3px' }}>MOOD</button>
      <button type="button" aria-pressed={mode === 'forge'} onClick={() => onChange('forge')} style={{ ...segStyle('forge'), borderLeft: 'none' }}>FORGE</button>
      <button type="button" aria-pressed={mode === 'ecology'} onClick={() => onChange('ecology')} style={{ ...segStyle('ecology'), borderLeft: 'none', borderRadius: '0 3px 3px 0' }}>ECOLOGY</button>
      <button
        type="button"
        aria-label={maximized ? 'Restore automaton size' : 'Maximize automaton (hide tile grid)'}
        onClick={onMaximizeToggle}
        title={maximized ? 'Restore' : 'Maximize — hide tile grid below'}
        style={{
          marginLeft: 6,
          width: 18, height: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--border)', borderRadius: 3,
          background: maximized ? 'var(--amber)' : 'var(--bg-panel)',
          color: maximized ? 'var(--bg-deep)' : 'var(--text-3)',
          cursor: 'pointer', fontSize: 10, lineHeight: 1,
          padding: 0,
        }}
      >
        {maximized ? '❭❬' : '❬❭'}
      </button>
      <button
        type="button"
        aria-label="Collapse automaton band"
        onClick={onCollapse}
        style={{
          marginLeft: 4,
          width: 18, height: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--border)', borderRadius: 3,
          background: 'var(--bg-panel)', color: 'var(--text-3)',
          cursor: 'pointer', fontSize: 11, lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
