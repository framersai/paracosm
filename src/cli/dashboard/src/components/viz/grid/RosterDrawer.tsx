import { useMemo, useState } from 'react';
import type { CellSnapshot } from '../viz-types.js';

interface RosterDrawerProps {
  open: boolean;
  cells: CellSnapshot[];
  leaderName: string;
  sideColor: string;
  searchQuery: string;
  hoveredId: string | null;
  onHover: (agentId: string | null) => void;
  onSelect: (cell: CellSnapshot) => void;
  onClose: () => void;
}

const MOOD_COLORS: Record<string, string> = {
  positive: 'rgba(106, 173, 72, 1)',
  hopeful: 'rgba(154, 205, 96, 1)',
  neutral: 'rgba(107, 95, 80, 1)',
  anxious: 'rgba(232, 180, 74, 1)',
  negative: 'rgba(224, 101, 48, 1)',
  defiant: 'rgba(196, 74, 30, 1)',
  resigned: 'rgba(168, 152, 120, 1)',
};

/**
 * Per-leader full colonist roster. Collapsible panel docked inside
 * the leader canvas wrapper (top-left). Groups alive colonists by
 * department, lists deceased at the bottom in a muted section.
 * Filters by the active search query; hovering a row highlights the
 * glyph, clicking opens the drilldown (delegated to caller).
 */
export function RosterDrawer({
  open,
  cells,
  leaderName,
  sideColor,
  searchQuery,
  hoveredId,
  onHover,
  onSelect,
  onClose,
}: RosterDrawerProps) {
  const [showDeceased, setShowDeceased] = useState(false);

  const { alive, deceased, matchSet } = useMemo(() => {
    const aliveArr: CellSnapshot[] = [];
    const deceasedArr: CellSnapshot[] = [];
    for (const c of cells) {
      if (c.alive) aliveArr.push(c);
      else deceasedArr.push(c);
    }
    aliveArr.sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name));
    deceasedArr.sort((a, b) => a.name.localeCompare(b.name));

    const tokens = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const match = new Set<string>();
    if (tokens.length > 0) {
      for (const c of cells) {
        const hay = `${c.name} ${c.department} ${c.role} ${c.mood}`.toLowerCase();
        if (tokens.every(t => hay.includes(t))) match.add(c.agentId);
      }
    }
    return { alive: aliveArr, deceased: deceasedArr, matchSet: match };
  }, [cells, searchQuery]);

  const grouped = useMemo(() => {
    const byDept = new Map<string, CellSnapshot[]>();
    for (const c of alive) {
      const k = (c.department || 'unknown').toLowerCase();
      const arr = byDept.get(k) ?? [];
      arr.push(c);
      byDept.set(k, arr);
    }
    return [...byDept.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [alive]);

  if (!open) return null;

  const rowStyle = (highlighted: boolean, dimmed: boolean, isHovered: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 6px',
    cursor: 'pointer',
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: dimmed ? 'var(--text-4)' : 'var(--text-2)',
    background: isHovered
      ? 'var(--bg-card)'
      : highlighted
      ? `${sideColor}22`
      : 'transparent',
    borderLeft: highlighted ? `2px solid ${sideColor}` : '2px solid transparent',
    opacity: dimmed ? 0.55 : 1,
    width: '100%',
    border: 'none',
    borderRadius: 0,
    textAlign: 'left',
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        width: 200,
        maxHeight: 'calc(100% - 16px)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
        fontFamily: 'var(--mono)',
        zIndex: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 8px',
          borderBottom: '1px solid var(--border)',
          background: `linear-gradient(0deg, transparent, ${sideColor}11)`,
        }}
      >
        <span
          style={{
            color: sideColor,
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          {leaderName} Roster · {alive.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close roster"
          style={{
            width: 18,
            height: 18,
            padding: 0,
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 2,
            color: 'var(--text-3)',
            cursor: 'pointer',
            fontSize: 11,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {grouped.length === 0 && (
          <div style={{ padding: '8px 10px', color: 'var(--text-4)', fontSize: 10 }}>
            No living colonists.
          </div>
        )}
        {grouped.map(([dept, list]) => (
          <div key={dept}>
            <div
              style={{
                padding: '3px 8px',
                fontSize: 8,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--text-4)',
                fontWeight: 700,
              }}
            >
              {dept} · {list.length}
            </div>
            {list.map(c => {
              const isMatch = matchSet.has(c.agentId);
              const isHovered = hoveredId === c.agentId;
              const dimmed = searchQuery.trim().length > 0 && !isMatch;
              return (
                <button
                  key={c.agentId}
                  type="button"
                  onMouseEnter={() => onHover(c.agentId)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => onSelect(c)}
                  title={`${c.name} · ${c.role} · ${c.mood}`}
                  style={rowStyle(isMatch, dimmed, isHovered)}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: MOOD_COLORS[c.mood] ?? MOOD_COLORS.neutral,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {c.name}
                  </span>
                  {c.featured && (
                    <span
                      style={{
                        fontSize: 7,
                        padding: '0px 3px',
                        borderRadius: 2,
                        background: `${sideColor}33`,
                        color: sideColor,
                        letterSpacing: '0.08em',
                      }}
                    >
                      ★
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        {deceased.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowDeceased(v => !v)}
              style={{
                width: '100%',
                padding: '4px 8px',
                border: 'none',
                borderTop: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-4)',
                textAlign: 'left',
                fontSize: 8,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              {showDeceased ? '\u25BC' : '\u25B6'} Deceased · {deceased.length}
            </button>
            {showDeceased &&
              deceased.map(c => {
                const isHovered = hoveredId === c.agentId;
                return (
                  <button
                    key={c.agentId}
                    type="button"
                    onMouseEnter={() => onHover(c.agentId)}
                    onMouseLeave={() => onHover(null)}
                    onClick={() => onSelect(c)}
                    title={`${c.name} · ${c.role} · deceased`}
                    style={{
                      ...rowStyle(false, true, isHovered),
                      textDecoration: 'line-through',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: 'var(--text-4)',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}
                    >
                      {c.name}
                    </span>
                  </button>
                );
              })}
          </>
        )}
      </div>
    </div>
  );
}
