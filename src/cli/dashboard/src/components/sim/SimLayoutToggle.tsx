/**
 * Sim header toggle between Side-by-side and Constellation layouts.
 * Side-by-side is hard-disabled when actorCount > 2 because the
 * existing 2-column layout literally can't render more than two
 * actors. Tooltip on the disabled state explains why.
 *
 * @module paracosm/dashboard/sim/SimLayoutToggle
 */
import * as React from 'react';

export type SimLayout = 'side-by-side' | 'constellation';

export interface SimLayoutToggleProps {
  layout: SimLayout;
  actorCount: number;
  onChange: (next: SimLayout) => void;
}

const buttonStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 11,
  fontFamily: 'var(--mono)',
  fontWeight: 600,
  background: 'transparent',
  color: 'var(--text-3)',
  border: '1px solid var(--border)',
  cursor: 'pointer',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const activeStyle: React.CSSProperties = {
  ...buttonStyle,
  color: 'var(--amber)',
  background: 'var(--bg-card)',
  borderColor: 'var(--amber)',
};

const disabledStyle: React.CSSProperties = {
  ...buttonStyle,
  opacity: 0.45,
  cursor: 'not-allowed',
};

export function SimLayoutToggle({ layout, actorCount, onChange }: SimLayoutToggleProps): JSX.Element {
  const sideDisabled = actorCount > 2;
  return (
    <div role="group" aria-label="Sim layout" style={{ display: 'inline-flex', gap: 0 }}>
      <button
        type="button"
        data-layout="side-by-side"
        aria-pressed={layout === 'side-by-side'}
        disabled={sideDisabled}
        onClick={() => !sideDisabled && onChange('side-by-side')}
        style={
          sideDisabled
            ? { ...disabledStyle, borderRadius: '3px 0 0 3px' }
            : layout === 'side-by-side'
              ? { ...activeStyle, borderRadius: '3px 0 0 3px' }
              : { ...buttonStyle, borderRadius: '3px 0 0 3px' }
        }
        title={sideDisabled ? 'Side-by-side caps at 2 actors' : 'Side-by-side: A/B columns'}
      >
        Side-by-side
      </button>
      <button
        type="button"
        data-layout="constellation"
        aria-pressed={layout === 'constellation'}
        onClick={() => onChange('constellation')}
        style={{
          ...(layout === 'constellation' ? activeStyle : buttonStyle),
          borderRadius: '0 3px 3px 0',
          borderLeft: 'none',
        }}
        title="Constellation: radial layout for any actor count"
      >
        Constellation
      </button>
    </div>
  );
}
