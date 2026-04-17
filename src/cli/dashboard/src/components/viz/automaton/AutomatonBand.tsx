import { useEffect, useState } from 'react';
import type { TurnSnapshot } from '../viz-types.js';
import { AutomatonCanvas, type ForgeAttemptInput, type ReuseCallInput } from './AutomatonCanvas.js';
import type { AutomatonMode } from './shared.js';
import {
  COLLAPSED_BAND_HEIGHT,
  DEFAULT_BAND_HEIGHT,
  ECOLOGY_BAND_HEIGHT,
  MOBILE_BAND_HEIGHT,
} from './shared.js';

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
}

/**
 * Container around the canvas. Owns the mode pill, the collapse
 * control, and the height transitions between modes. Callers lift
 * mode + collapsed state so the two panels stay in sync through a
 * shared parent.
 */
export function AutomatonBand(props: AutomatonBandProps) {
  const { snapshot, hexacoById, side, sideColor, mode, collapsed, onModeChange, onCollapseToggle, eventCategories, eventIntensity, forgeAttempts, reuseCalls, scenarioDepartments, onSelectAgent } = props;
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  );

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const expandedHeight = isMobile
    ? MOBILE_BAND_HEIGHT
    : mode === 'ecology'
    ? ECOLOGY_BAND_HEIGHT
    : DEFAULT_BAND_HEIGHT;

  const bandHeight = collapsed ? COLLAPSED_BAND_HEIGHT : expandedHeight;

  return (
    <div
      className="automaton-band"
      style={{
        position: 'relative',
        width: '100%',
        height: bandHeight,
        marginBottom: 6,
        borderRadius: 6,
        overflow: 'hidden',
        background: 'var(--bg-deep)',
        border: '1px solid var(--border)',
        transition: 'height 220ms cubic-bezier(0.2, 0.9, 0.3, 1)',
      }}
    >
      {collapsed ? (
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
      ) : (
        <>
          <AutomatonCanvas
            snapshot={snapshot}
            hexacoById={hexacoById}
            side={side}
            sideColor={sideColor}
            mode={mode}
            height={bandHeight}
            eventCategories={eventCategories}
            eventIntensity={eventIntensity}
            forgeAttempts={forgeAttempts}
            reuseCalls={reuseCalls}
            scenarioDepartments={scenarioDepartments}
            onSelectAgent={onSelectAgent}
          />
          <ModePill
            mode={mode}
            onChange={onModeChange}
            onCollapse={onCollapseToggle}
          />
        </>
      )}
    </div>
  );
}

function ModePill({ mode, onChange, onCollapse }: {
  mode: AutomatonMode;
  onChange: (mode: AutomatonMode) => void;
  onCollapse: () => void;
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
        aria-label="Collapse automaton band"
        onClick={onCollapse}
        style={{
          marginLeft: 6,
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
