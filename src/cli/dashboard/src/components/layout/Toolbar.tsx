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
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-primary)',
  padding: '3px 12px',
  borderRadius: '3px',
  fontSize: '10px',
  cursor: 'pointer',
  fontWeight: 600,
  fontFamily: 'var(--font-sans)',
};

export function Toolbar({ state, onSave, onLoad, onClear }: ToolbarProps) {
  const scenario = useScenarioContext();
  const hasEvents = state.a.events.length > 0 || state.b.events.length > 0;

  return (
    <div
      className="shrink-0"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 16px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-primary)',
        fontSize: '10px',
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--amber)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
        {scenario.id}
      </span>
      <div style={{ flex: 1 }} />
      {hasEvents && (
        <button onClick={onSave} style={btnStyle}>Save</button>
      )}
      <button onClick={onLoad} style={btnStyle}>Load Game</button>
      {hasEvents && (
        <button onClick={onClear} style={{ ...btnStyle, color: 'var(--rust)' }}>Clear</button>
      )}
    </div>
  );
}
