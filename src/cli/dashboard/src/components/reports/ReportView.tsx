import { useMemo } from 'react';
import type { GameState } from '../../hooks/useGameState';
import { Badge } from '../shared/Badge';

interface ReportViewProps {
  state: GameState;
}

interface TurnData {
  title?: string;
  year?: number;
  category?: string;
  emergent?: boolean;
  decision?: string;
  outcome?: string;
  colony?: Record<string, unknown>;
  depts: Record<string, { summary: string; tools: number; citations: number }>;
  reactions: Array<Record<string, unknown>>;
  totalReactions: number;
}

export function ReportView({ state }: ReportViewProps) {
  const turns = useMemo(() => {
    const map: Record<number, { a: TurnData; b: TurnData }> = {};

    for (const side of ['a', 'b'] as const) {
      const s = state[side];
      for (const evt of s.events) {
        const turn = evt.turn;
        if (!turn) continue;
        if (!map[turn]) map[turn] = { a: { depts: {}, reactions: [], totalReactions: 0 }, b: { depts: {}, reactions: [], totalReactions: 0 } };
        const t = map[turn][side];

        if (evt.type === 'turn_start' && evt.data.title && evt.data.title !== 'Director generating...') {
          t.title = evt.data.title as string;
          t.year = evt.data.year as number;
          t.category = evt.data.category as string;
          t.emergent = evt.data.emergent as boolean;
          t.colony = evt.data.colony as Record<string, unknown>;
        }
        if (evt.type === 'outcome') {
          t.decision = evt.data._decision as string;
          t.outcome = evt.data.outcome as string;
        }
        if (evt.type === 'dept_done') {
          const dept = evt.data.department as string;
          t.depts[dept] = {
            summary: evt.data.summary as string || '',
            tools: ((evt.data._filteredTools as unknown[]) || []).length,
            citations: evt.data.citations as number || 0,
          };
        }
        if (evt.type === 'colonist_reactions') {
          t.reactions = (evt.data.reactions as Array<Record<string, unknown>> || []).slice(0, 3);
          t.totalReactions = evt.data.totalReactions as number || 0;
        }
      }
    }

    return Object.entries(map).sort((a, b) => Number(a[0]) - Number(b[0]));
  }, [state]);

  const nameA = state.a.leader?.name || 'Leader A';
  const nameB = state.b.leader?.name || 'Leader B';

  if (!state.a.events.length && !state.b.events.length) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto text-center py-16" style={{ color: 'var(--text-muted)' }}>
          Run a simulation first to see the report.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-xl font-bold mb-4">Turn-by-Turn Report</h2>

        {turns.map(([turnNum, sides]) => {
          const a = sides.a;
          const b = sides.b;
          const year = a.year || b.year || '?';
          const diverged = a.title && b.title && a.title !== b.title;

          return (
            <div key={turnNum} className="mb-4 rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)' }}>
              <div className="flex justify-between items-center px-4 py-2" style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="text-sm font-bold">Turn {turnNum} — {year}</span>
                <span className="text-[10px] font-bold tracking-wider" style={{ color: diverged ? 'var(--color-error)' : 'var(--text-muted)' }}>
                  {diverged ? 'DIVERGENT' : a.emergent ? 'EMERGENT' : 'MILESTONE'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-px" style={{ background: 'var(--border-subtle)' }}>
                <TurnSide data={a} name={nameA} sideColor="var(--side-a)" />
                <TurnSide data={b} name={nameB} sideColor="var(--side-b)" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TurnSide({ data, name, sideColor }: { data: TurnData; name: string; sideColor: string }) {
  if (!data.title) {
    return (
      <div className="p-3" style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
        <div className="font-semibold text-xs" style={{ color: sideColor }}>{name}</div>
        <div className="text-xs mt-1">Awaiting data...</div>
      </div>
    );
  }

  const deptList = Object.entries(data.depts).map(([dept, d]) =>
    `${dept.charAt(0).toUpperCase() + dept.slice(1)} ${d.citations}c ${d.tools}t`
  ).join(' · ');

  return (
    <div className="p-3 text-xs" style={{ background: 'var(--bg-primary)' }}>
      <div className="font-semibold" style={{ color: sideColor }}>{name}</div>
      <div className="mt-1 font-semibold" style={{ color: 'var(--text-primary)' }}>
        ⚡ {data.title}
        <span className="ml-2 font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
          {data.category}
        </span>
      </div>
      {data.decision && (
        <div className="mt-1.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {data.decision.slice(0, 200)}{data.decision.length > 200 ? '...' : ''}
        </div>
      )}
      {data.outcome && (
        <div className="mt-1.5">
          <Badge outcome={data.outcome} />
        </div>
      )}
      {deptList && (
        <div className="mt-1.5 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{deptList}</div>
      )}
      {data.reactions.length > 0 && (
        <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {data.reactions.map((r, i) => (
            <div key={i} className="text-[11px] italic" style={{ color: 'var(--text-secondary)' }}>
              "{String(r.quote || '').slice(0, 80)}" — <span style={{ color: sideColor }}>{String(r.name)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
