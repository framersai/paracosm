import { type CSSProperties, memo } from 'react';
import type { LayoutTile } from './viz-types.js';
import { DEPARTMENT_COLORS, DEFAULT_DEPT_COLOR } from './viz-types.js';

interface TileProps {
  tile: LayoutTile;
  selected: boolean;
  diverged?: boolean;
  onSelect: (agentId: string) => void;
}

const MOOD_GLYPHS: Record<string, string> = {
  positive: ':)',
  neutral: ':|',
  anxious: ':/',
  negative: ':(',
  defiant: '!',
  hopeful: '*',
  resigned: 'z',
};

const SIZES = {
  xl: 96,
  md: 56,
  sm: 28,
  ghost: 28,
};

/**
 * One colonist, rendered as a focusable button. Size + content scale
 * by tier: xl (featured, full identity), md (partnered, name + glyph),
 * sm (solo, initial + color), ghost (deceased, outline only). Click or
 * Enter opens the drilldown panel for this colonist.
 */
function TileImpl(props: TileProps) {
  const { tile, selected, diverged, onSelect } = props;
  const size = SIZES[tile.tierInfo.size];
  const deptColor = DEPARTMENT_COLORS[tile.department] ?? DEFAULT_DEPT_COLOR;
  const isGhost = tile.tierInfo.size === 'ghost';
  const firstName = tile.name.split(/\s+/)[0];
  const initial = firstName.charAt(0).toUpperCase();
  const mood = MOOD_GLYPHS[tile.mood] ?? MOOD_GLYPHS.neutral;

  const style: CSSProperties = {
    width: size,
    height: size,
    border: selected ? `2px solid var(--amber)` : `1px solid var(--border)`,
    background: isGhost ? 'transparent' : 'var(--bg-card)',
    color: isGhost ? 'var(--text-3)' : 'var(--text-1)',
    opacity: isGhost ? 0.35 : 1,
    borderRadius: 6,
    padding: tile.tierInfo.size === 'xl' ? 6 : 2,
    boxShadow: diverged ? 'inset 0 0 0 9999px color-mix(in srgb, var(--rust) 12%, transparent)' : undefined,
    position: 'relative',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    fontFamily: 'var(--mono)',
    textAlign: 'left',
    overflow: 'hidden',
    flexShrink: 0,
  };

  const label = `${tile.name}, ${tile.role || 'colonist'}, ${tile.department || 'unassigned'}, mood ${tile.mood}${isGhost ? ', deceased' : ''}`;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={() => onSelect(tile.agentId)}
      style={style}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'block',
          height: tile.tierInfo.size === 'xl' ? 6 : 3,
          background: deptColor,
          margin: tile.tierInfo.size === 'xl' ? '-6px -6px 6px -6px' : '-2px -2px 2px -2px',
          borderTopLeftRadius: 5,
          borderTopRightRadius: 5,
        }}
      />
      {isGhost && (
        <span aria-hidden="true" style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, color: 'var(--text-3)',
        }}>
          X
        </span>
      )}
      {!isGhost && tile.tierInfo.size === 'xl' && (
        <>
          <div style={{ fontWeight: 700, fontSize: 11, lineHeight: 1.2, color: 'var(--text-1)' }}>
            {tile.name}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>
            {tile.role || ''}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span aria-hidden="true">{mood}</span>
            <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{tile.age ?? ''}</span>
          </div>
        </>
      )}
      {!isGhost && tile.tierInfo.size === 'md' && (
        <>
          <div style={{ fontWeight: 600, fontSize: 9, lineHeight: 1.2 }}>{firstName}</div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
            <span aria-hidden="true">{mood}</span>
            <span style={{ color: 'var(--text-3)' }}>{tile.age ?? ''}</span>
          </div>
        </>
      )}
      {!isGhost && tile.tierInfo.size === 'sm' && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: deptColor,
        }}>
          {initial}
        </div>
      )}
    </button>
  );
}

export const Tile = memo(TileImpl);
