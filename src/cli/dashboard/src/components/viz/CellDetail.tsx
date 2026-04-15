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
      <div style={{ display: 'flex', alignItems: 'end', gap: 2, height: 24, marginBottom: 12 }}>
        {moodHistory.map((m, i) => (
          <div
            key={i}
            title={`T${m.turn}: ${m.mood} (${m.psychScore.toFixed(2)})`}
            style={{
              width: Math.max(4, 60 / moodHistory.length),
              height: `${(m.psychScore / maxPsych) * 100}%`,
              background: moodBarColor(m.mood),
              borderRadius: 1,
              minHeight: 2,
            }}
          />
        ))}
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
