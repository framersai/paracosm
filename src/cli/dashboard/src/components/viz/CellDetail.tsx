import type { CellSnapshot, TurnSnapshot } from './viz-types';
import { DEPARTMENT_COLORS, DEFAULT_DEPT_COLOR } from './viz-types';

interface CellDetailProps {
  cell: CellSnapshot;
  snapshots: TurnSnapshot[];
  onClose: () => void;
}

export function CellDetail({ cell, snapshots, onClose }: CellDetailProps) {
  const color = DEPARTMENT_COLORS[cell.department] || DEFAULT_DEPT_COLOR;

  const moodHistory: Array<{ turn: number; psychScore: number; mood: string }> = [];
  for (const snap of snapshots) {
    const agent = snap.cells.find(c => c.agentId === cell.agentId);
    if (agent) {
      moodHistory.push({ turn: snap.turn, psychScore: agent.psychScore, mood: agent.mood });
    }
  }

  const maxPsych = Math.max(...moodHistory.map(m => m.psychScore), 1);

  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 180,
        background: '#1a1610',
        borderLeft: '1px solid #2a2520',
        padding: 12,
        fontSize: 10,
        lineHeight: 1.6,
        color: '#f5f0e4',
        overflowY: 'auto',
        zIndex: 15,
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 6, right: 8, background: 'none',
          border: 'none', color: '#a89878', cursor: 'pointer', fontSize: 14,
        }}
        aria-label="Close detail panel"
      >
        x
      </button>

      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{cell.name}</div>
      <div style={{ color: '#a89878', marginBottom: 8 }}>
        <span style={{ color }}>{cell.department}</span> · {cell.role} · {cell.rank}
        <br />
        {cell.marsborn ? 'Mars-born' : 'Earth-born'} · Psych: {cell.psychScore.toFixed(2)}
      </div>

      <div style={{ color: '#e06530', fontWeight: 700, fontSize: 9, letterSpacing: '.08em', marginBottom: 4 }}>
        MOOD ACROSS TURNS
      </div>
      <div style={{ marginBottom: 12 }}>
        {/* Mood + psych score for the current turn */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, fontSize: 10 }}>
          <span style={{ color: moodBarColor(cell.mood), fontWeight: 700, textTransform: 'uppercase' }}>
            {cell.mood || 'neutral'}
          </span>
          <span style={{ color: '#a89878', fontFamily: 'var(--mono, monospace)' }}>
            psych {cell.psychScore.toFixed(2)}
          </span>
        </div>

        {/* Bar chart with bars + per-turn labels */}
        {moodHistory.length > 0 ? (
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
            {moodHistory.map((m, i) => {
              const barW = Math.max(8, Math.floor(140 / moodHistory.length) - 3);
              const barH = Math.max(4, (m.psychScore / maxPsych) * 36);
              return (
                <div
                  key={i}
                  title={`Turn ${m.turn}: ${m.mood} (psych ${m.psychScore.toFixed(2)})`}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: barW }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: barH,
                      background: moodBarColor(m.mood),
                      borderRadius: 1,
                      minHeight: 2,
                    }}
                  />
                  <span style={{
                    fontSize: 8, color: '#686050', marginTop: 2,
                    fontFamily: 'var(--mono, monospace)',
                  }}>
                    T{m.turn}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 9, color: '#686050', fontStyle: 'italic' }}>No history yet.</div>
        )}

        {/* Mood legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, fontSize: 8, color: '#686050' }}>
          <LegendChip color="#6aad48" label="positive" />
          <LegendChip color="#e8b44a" label="defiant" />
          <LegendChip color="#e06530" label="negative" />
          <LegendChip color="#a89878" label="neutral" />
        </div>
      </div>

      {cell.shortTermMemory.length > 0 && (
        <>
          <div style={{ color: '#e06530', fontWeight: 700, fontSize: 9, letterSpacing: '.08em', marginBottom: 4 }}>
            RECENT MEMORIES
          </div>
          {cell.shortTermMemory.map((mem, i) => (
            <div
              key={i}
              style={{
                color: '#a89878',
                fontSize: 9,
                lineHeight: 1.5,
                marginBottom: 6,
                paddingLeft: 6,
                borderLeft: '2px solid #2a2520',
              }}
            >
              "{mem}"
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function moodBarColor(mood: string): string {
  switch (mood) {
    case 'positive': case 'hopeful': return '#6aad48';
    case 'negative': case 'anxious': case 'resigned': return '#e06530';
    case 'defiant': return '#e8b44a';
    default: return '#a89878';
  }
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{ width: 6, height: 6, background: color, borderRadius: 1, display: 'inline-block' }} />
      {label}
    </span>
  );
}
