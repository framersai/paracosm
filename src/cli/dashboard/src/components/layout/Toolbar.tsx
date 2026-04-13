import { useScenarioContext } from '../../App';
import type { GameState } from '../../hooks/useGameState';

interface ToolbarProps {
  state: GameState;
  onSave: () => void;
  onLoad: () => void;
  onClear: () => void;
}

export function Toolbar({ state, onSave, onLoad, onClear }: ToolbarProps) {
  const scenario = useScenarioContext();
  const hasEvents = state.a.events.length > 0 || state.b.events.length > 0;

  return (
    <div
      className="flex items-center gap-2 px-4 py-1.5 border-b text-xs shrink-0"
      style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-subtle)' }}
    >
      <span className="font-mono font-bold text-[10px] tracking-wider" style={{ color: 'var(--accent-primary)' }}>
        {scenario.id.toUpperCase()}
      </span>

      <div className="flex-1" />

      {hasEvents && (
        <button
          onClick={onSave}
          className="px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
        >
          Save Game
        </button>
      )}
      <button
        onClick={onLoad}
        className="px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors"
        style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
      >
        Load Game
      </button>
      {hasEvents && (
        <button
          onClick={onClear}
          className="px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors"
          style={{ background: 'var(--bg-elevated)', color: 'var(--color-error)', border: '1px solid var(--border-subtle)' }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
