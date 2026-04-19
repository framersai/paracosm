export type GridMode = 'living' | 'mood' | 'forge' | 'ecology' | 'divergence';

const MODES: { key: GridMode; label: string; hint: string }[] = [
  { key: 'living', label: 'LIVING', hint: 'Full chemistry + seeds + glyphs + HUD' },
  { key: 'mood', label: 'MOOD', hint: 'Colonist mood cloud emphasized' },
  { key: 'forge', label: 'FORGE', hint: 'Tool forge + reuse arcs emphasized' },
  { key: 'ecology', label: 'ECOLOGY', hint: 'Metric tiles + crisis events' },
  { key: 'divergence', label: 'DIVERGENCE', hint: 'A vs B diff grid overlay' },
];

/**
 * Mode pill row rendered above each leader grid. Shared state lifted
 * to ColonyViz so toggling on one leader also toggles the other —
 * panels stay visually comparable across mode switches.
 */
export function GridModePills({
  mode,
  onChange,
}: {
  mode: GridMode;
  onChange: (next: GridMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Grid viz mode"
      style={{
        display: 'flex',
        gap: 0,
        padding: '4px 6px',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 6,
      }}
    >
      {MODES.map((m, i) => {
        const active = mode === m.key;
        return (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m.key)}
            title={m.hint}
            style={{
              flex: 1,
              padding: '5px 8px',
              fontSize: 9,
              fontFamily: 'var(--mono)',
              fontWeight: 800,
              letterSpacing: '0.1em',
              border: '1px solid var(--border)',
              borderLeft: i === 0 ? '1px solid var(--border)' : 'none',
              borderRadius:
                i === 0
                  ? '3px 0 0 3px'
                  : i === MODES.length - 1
                  ? '0 3px 3px 0'
                  : 0,
              background: active ? 'var(--amber)' : 'var(--bg-card)',
              color: active ? 'var(--bg-deep)' : 'var(--text-3)',
              cursor: 'pointer',
              textTransform: 'uppercase',
              transition: 'background 120ms, color 120ms',
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
