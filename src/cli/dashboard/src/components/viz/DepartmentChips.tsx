import type { TurnSnapshot } from './viz-types';
import { DEPARTMENT_COLORS, DEFAULT_DEPT_COLOR } from './viz-types';

interface DepartmentChipsProps {
  snapshot: TurnSnapshot | undefined;
  prevSnapshot: TurnSnapshot | undefined;
}

interface DeptStat {
  department: string;
  total: number;
  alive: number;
  highMood: number;
  lowMood: number;
  delta: number;
}

function buildStats(snap: TurnSnapshot, prev?: TurnSnapshot): DeptStat[] {
  const byDept = new Map<string, DeptStat>();
  for (const c of snap.cells) {
    const stat = byDept.get(c.department) ?? {
      department: c.department, total: 0, alive: 0, highMood: 0, lowMood: 0, delta: 0,
    };
    stat.total++;
    if (c.alive) {
      stat.alive++;
      if (c.psychScore >= 0.6 || c.mood === 'positive' || c.mood === 'hopeful') stat.highMood++;
      if (c.psychScore < 0.4 || c.mood === 'negative' || c.mood === 'anxious' || c.mood === 'resigned') stat.lowMood++;
    }
    byDept.set(c.department, stat);
  }
  if (prev) {
    const prevAliveByDept = new Map<string, number>();
    for (const c of prev.cells) {
      if (c.alive) prevAliveByDept.set(c.department, (prevAliveByDept.get(c.department) ?? 0) + 1);
    }
    for (const stat of byDept.values()) {
      stat.delta = stat.alive - (prevAliveByDept.get(stat.department) ?? 0);
    }
  }
  return Array.from(byDept.values()).sort((a, b) => b.alive - a.alive);
}

/**
 * Compact per-department chips above the colony canvas.
 * Shows department name, alive count, mood split, and turn-over-turn delta.
 */
export function DepartmentChips({ snapshot, prevSnapshot }: DepartmentChipsProps) {
  if (!snapshot) return null;
  const stats = buildStats(snapshot, prevSnapshot);
  if (stats.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 8px',
        borderBottom: '1px solid var(--border)', background: 'var(--bg-card)',
        flexShrink: 0, fontSize: 10, fontFamily: 'var(--mono)',
      }}
      role="region"
      aria-label="Department summary chips"
    >
      {stats.map(s => {
        const color = DEPARTMENT_COLORS[s.department] || DEFAULT_DEPT_COLOR;
        const deltaColor = s.delta > 0 ? '#6aad48' : s.delta < 0 ? '#e06530' : 'var(--text-3)';
        return (
          <div
            key={s.department}
            title={`${s.department}: ${s.alive} alive (${s.highMood} high mood, ${s.lowMood} low)`}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '3px 8px', borderRadius: 12,
              background: 'var(--bg-deep)', border: `1px solid ${color}40`,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-1)', fontWeight: 700, textTransform: 'uppercase', fontSize: 9 }}>
              {s.department.slice(0, 6)}
            </span>
            <span style={{ color: 'var(--text-2)' }}>{s.alive}</span>
            {s.delta !== 0 && (
              <span style={{ color: deltaColor, fontWeight: 700 }}>
                {s.delta > 0 ? `+${s.delta}` : s.delta}
              </span>
            )}
            <span style={{ color: 'var(--text-3)', opacity: 0.7 }}>
              ↑{s.highMood} ↓{s.lowMood}
            </span>
          </div>
        );
      })}
    </div>
  );
}
