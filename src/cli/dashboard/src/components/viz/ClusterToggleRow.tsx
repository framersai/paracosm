import type { ClusterMode } from './viz-types.js';

interface ClusterToggleRowProps {
  mode: ClusterMode;
  onChange: (mode: ClusterMode) => void;
}

const MODES: Array<{ value: ClusterMode; label: string; hint: string }> = [
  { value: 'families', label: 'Families', hint: 'Cluster by household' },
  { value: 'departments', label: 'Departments', hint: 'Cluster by role' },
  { value: 'mood', label: 'Mood', hint: 'Cluster by current mood' },
  { value: 'age', label: 'Age', hint: 'Cluster by life stage' },
];

/**
 * Visible row of cluster-mode buttons that replaces the hidden M key
 * toggle. The M key shortcut still cycles through these modes for
 * power users; the buttons make the capability discoverable for
 * first-time visitors.
 */
export function ClusterToggleRow({ mode, onChange }: ClusterToggleRowProps) {
  return (
    <div
      role="tablist"
      aria-label="Cluster mode"
      style={{
        display: 'flex', gap: 4,
        padding: '4px 12px',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
      }}
    >
      {MODES.map(m => {
        const active = mode === m.value;
        return (
          <button
            key={m.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={m.hint}
            onClick={() => onChange(m.value)}
            style={{
              padding: '4px 10px',
              fontSize: 10,
              fontFamily: 'var(--mono)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              borderRadius: 4,
              border: `1px solid ${active ? 'var(--amber)' : 'var(--border)'}`,
              background: active ? 'color-mix(in srgb, var(--amber) 12%, var(--bg-card))' : 'transparent',
              color: active ? 'var(--amber)' : 'var(--text-2)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
