import type { VizMode } from './viz-types';

interface VizControlsProps {
  currentTurn: number;
  maxTurn: number;
  year: number;
  playing: boolean;
  speed: number;
  mode: VizMode;
  layout: 'department' | 'family';
  showDivergence: boolean;
  onTurnChange: (turn: number) => void;
  onPlayPause: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSpeedChange: (speed: number) => void;
  onModeChange: (mode: VizMode) => void;
  onLayoutChange: (layout: 'department' | 'family') => void;
  onDivergenceToggle: () => void;
  onExportPng: () => void;
}

const SPEEDS = [1, 2, 4];
const MODES: Array<{ value: VizMode; label: string }> = [
  { value: 'department', label: 'DEPT' },
  { value: 'mood', label: 'MOOD' },
  { value: 'age', label: 'AGE' },
  { value: 'generation', label: 'GEN' },
];

export function VizControls({
  currentTurn, maxTurn, year, playing, speed, mode, layout, showDivergence,
  onTurnChange, onPlayPause, onStepBack, onStepForward, onSpeedChange,
  onModeChange, onLayoutChange, onDivergenceToggle, onExportPng,
}: VizControlsProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        flexWrap: 'wrap',
      }}
      role="toolbar"
      aria-label="Visualization playback controls"
    >
      <div style={{ display: 'flex', gap: 4 }}>
        <ControlButton onClick={onStepBack} disabled={currentTurn <= 0} label="Step back (←)">
          <span style={{ fontSize: 10 }}>&#9198;</span>
        </ControlButton>
        <ControlButton onClick={onPlayPause} primary label={playing ? 'Pause (Space)' : 'Play (Space)'}>
          <span style={{ fontSize: 10 }}>{playing ? '\u23F8' : '\u25B6'}</span>
        </ControlButton>
        <ControlButton onClick={onStepForward} disabled={currentTurn >= maxTurn - 1} label="Step forward (→)">
          <span style={{ fontSize: 10 }}>&#9197;</span>
        </ControlButton>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(0, maxTurn - 1)}
        value={currentTurn}
        onChange={e => onTurnChange(parseInt(e.target.value))}
        className="pc-range"
        style={{
          flex: 1,
          minWidth: 120,
          accentColor: 'var(--rust)',
          // Drives the WebKit track-fill gradient so the rail visibly
          // fills as the user scrubs across turns.
          ['--pc-range-fill' as string]: 'var(--rust)',
          ['--pc-range-pct' as string]: `${maxTurn > 1 ? Math.round((currentTurn / (maxTurn - 1)) * 100) : 0}%`,
        } as React.CSSProperties}
        aria-label="Turn scrubber"
      />

      <div style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>
        T{currentTurn + 1}/{maxTurn} · {year || '\u2014'}
      </div>

      {/* Speed */}
      <button
        onClick={() => {
          const idx = SPEEDS.indexOf(speed);
          onSpeedChange(SPEEDS[(idx + 1) % SPEEDS.length]);
        }}
        style={pillStyle()}
        aria-label="Playback speed"
      >
        {speed}x
      </button>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        {MODES.map(m => (
          <button
            key={m.value}
            onClick={() => onModeChange(m.value)}
            style={{
              ...pillStyle(m.value === mode),
              border: 'none',
              borderRadius: 0,
              borderRight: '1px solid var(--border)',
            }}
            aria-pressed={m.value === mode}
            aria-label={`Color by ${m.label.toLowerCase()}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Layout toggle */}
      <button
        onClick={() => onLayoutChange(layout === 'department' ? 'family' : 'department')}
        style={pillStyle(layout === 'family')}
        aria-pressed={layout === 'family'}
        aria-label="Toggle relationship layout"
        title="Cluster cells by family connections instead of department"
      >
        {layout === 'family' ? 'FAMILY' : 'DEPT'}
      </button>

      {/* Divergence toggle */}
      <button
        onClick={onDivergenceToggle}
        style={pillStyle(showDivergence)}
        aria-pressed={showDivergence}
        aria-label="Toggle divergence overlay"
        title="Highlight cells alive in only one of the two timelines"
      >
        DIV
      </button>

      {/* PNG export */}
      <button
        onClick={onExportPng}
        style={pillStyle()}
        aria-label="Export current turn as PNG"
        title="Save current turn snapshot as PNG"
      >
        PNG
      </button>
    </div>
  );
}

function pillStyle(active = false): React.CSSProperties {
  return {
    fontSize: 10,
    color: active ? 'var(--amber)' : 'var(--text-3)',
    border: `1px solid ${active ? 'var(--amber)' : 'var(--border)'}`,
    borderRadius: 4,
    padding: '2px 8px',
    background: active ? 'rgba(232,180,74,.08)' : 'transparent',
    cursor: 'pointer',
    fontFamily: 'var(--mono)',
    fontWeight: 700,
    letterSpacing: '0.04em',
  };
}

function ControlButton({
  onClick, disabled, children, primary, label,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  primary?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        width: 28,
        height: 28,
        borderRadius: 4,
        border: `1px solid ${primary ? 'var(--rust)' : 'var(--border)'}`,
        background: primary ? 'rgba(224,101,48,0.1)' : 'transparent',
        color: primary ? 'var(--rust)' : 'var(--text-3)',
        fontSize: 10,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}
