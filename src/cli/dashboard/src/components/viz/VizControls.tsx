interface VizControlsProps {
  currentTurn: number;
  maxTurn: number;
  year: number;
  playing: boolean;
  speed: number;
  onTurnChange: (turn: number) => void;
  onPlayPause: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSpeedChange: (speed: number) => void;
}

const SPEEDS = [1, 2, 4];

export function VizControls({
  currentTurn, maxTurn, year, playing, speed,
  onTurnChange, onPlayPause, onStepBack, onStepForward, onSpeedChange,
}: VizControlsProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-panel)',
      }}
    >
      <div style={{ display: 'flex', gap: 4 }}>
        <ControlButton onClick={onStepBack} disabled={currentTurn <= 0} label="Step back">
          <span style={{ fontSize: 10 }}>&#9198;</span>
        </ControlButton>
        <ControlButton onClick={onPlayPause} primary label={playing ? 'Pause' : 'Play'}>
          <span style={{ fontSize: 10 }}>{playing ? '\u23F8' : '\u25B6'}</span>
        </ControlButton>
        <ControlButton onClick={onStepForward} disabled={currentTurn >= maxTurn - 1} label="Step forward">
          <span style={{ fontSize: 10 }}>&#9197;</span>
        </ControlButton>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(0, maxTurn - 1)}
        value={currentTurn}
        onChange={e => onTurnChange(parseInt(e.target.value))}
        style={{ flex: 1, accentColor: 'var(--rust)' }}
        aria-label="Turn scrubber"
      />

      <div style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>
        T{currentTurn + 1}/{maxTurn} · {year || '\u2014'}
      </div>

      <button
        onClick={() => {
          const idx = SPEEDS.indexOf(speed);
          onSpeedChange(SPEEDS[(idx + 1) % SPEEDS.length]);
        }}
        style={{
          fontSize: 10,
          color: 'var(--text-3)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '2px 8px',
          background: 'transparent',
          cursor: 'pointer',
          fontFamily: 'var(--mono)',
        }}
        aria-label="Playback speed"
      >
        {speed}x
      </button>
    </div>
  );
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
