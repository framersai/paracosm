import { useScenarioContext } from '../../App';
import type { GameState } from '../../hooks/useGameState';

interface ToolbarProps {
  state: GameState;
  onSave: () => void;
  onLoad: () => void;
  onClear: () => void;
}

const btnStyle = {
  background: 'var(--bg-card)',
  color: 'var(--text-2)',
  border: '1px solid var(--border)',
  padding: '3px 12px',
  borderRadius: '3px',
  fontSize: '10px',
  cursor: 'pointer',
  fontWeight: 600,
  fontFamily: 'var(--sans)',
};

export function Toolbar({ state, onSave, onLoad, onClear }: ToolbarProps) {
  const scenario = useScenarioContext();
  const hasEvents = state.a.events.length > 0 || state.b.events.length > 0;

  return (
    <div
      className="toolbar shrink-0"
      role="toolbar"
      aria-label="Simulation controls"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 16px',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        fontSize: '10px',
      }}
    >
      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
        {scenario.id}
      </span>
      <div style={{ flex: 1 }} />
      {hasEvents && (
        <button onClick={onSave} style={btnStyle} aria-label="Save simulation data">Save</button>
      )}
      <button onClick={onLoad} style={btnStyle} aria-label="Load saved simulation">Load Game</button>
      {hasEvents && (
        <button onClick={onClear} style={{ ...btnStyle, color: 'var(--rust)' }} aria-label="Clear simulation data">Clear</button>
      )}
    </div>
  );
}
