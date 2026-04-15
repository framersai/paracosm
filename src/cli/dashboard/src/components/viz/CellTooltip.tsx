import type { ForceNode } from './viz-types';
import { DEPARTMENT_COLORS, DEFAULT_DEPT_COLOR } from './viz-types';

interface CellTooltipProps {
  node: ForceNode;
  nameMap: Map<string, string>;
  x: number;
  y: number;
}

export function CellTooltip({ node, nameMap, x, y }: CellTooltipProps) {
  const color = DEPARTMENT_COLORS[node.department] || DEFAULT_DEPT_COLOR;
  const partnerName = node.partnerId ? nameMap.get(node.partnerId) : null;

  return (
    <div
      style={{
        position: 'absolute',
        left: x + 12,
        top: y - 8,
        background: '#1a1610',
        border: '1px solid #2a2520',
        borderRadius: 6,
        padding: '8px 12px',
        fontSize: 11,
        lineHeight: 1.6,
        color: '#f5f0e4',
        pointerEvents: 'none',
        zIndex: 20,
        minWidth: 150,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{nameMap.get(node.id) || node.id}</div>
      <div style={{ color: '#a89878' }}>
        <span style={{ color }}>{node.department}</span> · {node.rank}
      </div>
      <div style={{ color: '#a89878' }}>
        Mood: <span style={{ color: moodColor(node.mood) }}>{node.mood}</span> · Psych: {node.psychScore.toFixed(2)}
      </div>
      {partnerName && <div style={{ color: '#a89878' }}>Partner: {partnerName}</div>}
      <div style={{ color: '#a89878' }}>{node.marsborn ? 'Mars-born' : 'Earth-born'}</div>
    </div>
  );
}

function moodColor(mood: string): string {
  switch (mood) {
    case 'positive': case 'hopeful': return '#6aad48';
    case 'negative': case 'anxious': case 'resigned': return '#e06530';
    case 'defiant': return '#e8b44a';
    default: return '#a89878';
  }
}
