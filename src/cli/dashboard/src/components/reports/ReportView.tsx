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
      for (const evt of state[side].events) {
        const turn = evt.turn;
        if (!turn) continue;
        if (!map[turn]) map[turn] = { a: { depts: {}, reactions: [], totalReactions: 0 }, b: { depts: {}, reactions: [], totalReactions: 0 } };
        const t = map[turn][side];
        if (evt.type === 'turn_start' && evt.data.title && evt.data.title !== 'Director generating...') {
          t.title = evt.data.title as string; t.year = evt.data.year as number;
          t.category = evt.data.category as string; t.emergent = evt.data.emergent as boolean;
          t.colony = evt.data.colony as Record<string, unknown>;
        }
        if (evt.type === 'outcome') { t.decision = evt.data._decision as string; t.outcome = evt.data.outcome as string; }
        if (evt.type === 'dept_done') {
          const dept = evt.data.department as string;
          t.depts[dept] = { summary: evt.data.summary as string || '', tools: ((evt.data._filteredTools as unknown[]) || []).length, citations: evt.data.citations as number || 0 };
        }
        if (evt.type === 'agent_reactions') {
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', background: 'var(--bg-deep)' }}>
        <div style={{ color: 'var(--text-3)', fontSize: '15px', textAlign: 'center', padding: '40px' }}>
          Run a simulation first to see the report.
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', background: 'var(--bg-deep)' }}>
      <h2 style={{ fontSize: '22px', color: 'var(--amber)', fontFamily: 'var(--mono)', marginBottom: '16px' }}>
        Turn-by-Turn Report
      </h2>

      {turns.map(([turnNum, sides]) => {
        const a = sides.a;
        const b = sides.b;
        const year = a.year || b.year || '?';
        const diverged = a.title && b.title && a.title !== b.title;

        return (
          <div key={turnNum} style={{
            background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px',
            padding: '16px 20px', marginBottom: '14px', boxShadow: 'var(--card-shadow)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text-1)' }}>
                Turn {turnNum} &mdash; Y{year}
              </span>
              <span style={{
                fontSize: '12px', color: diverged ? 'var(--rust)' : 'var(--text-3)',
                fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--mono)',
              }}>
                {diverged ? 'DIVERGENT' : a.emergent ? 'EMERGENT' : 'MILESTONE'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <TurnSide data={a} name={nameA} sideColor="var(--vis)" />
              <TurnSide data={b} name={nameB} sideColor="var(--eng)" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TurnSide({ data, name, sideColor }: { data: TurnData; name: string; sideColor: string }) {
  if (!data.title) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', padding: '14px 16px' }}>
        <h4 style={{ fontSize: '15px', fontFamily: 'var(--mono)', fontWeight: 800, color: sideColor, marginBottom: '8px' }}>{name}</h4>
        <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>Awaiting data...</span>
      </div>
    );
  }

  const deptList = Object.entries(data.depts).map(([dept, d]) =>
    `${dept.charAt(0).toUpperCase() + dept.slice(1)} ${d.citations}c ${d.tools}t`
  ).join(' \u00b7 ');

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', padding: '14px 16px' }}>
      <h4 style={{ fontSize: '15px', fontFamily: 'var(--mono)', fontWeight: 800, color: sideColor, marginBottom: '8px' }}>{name}</h4>
      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '6px' }}>
        {data.title}
        <span style={{ fontSize: '10px', color: 'var(--text-3)', background: 'var(--bg-deep)', padding: '1px 6px', borderRadius: '3px', marginLeft: '6px', fontFamily: 'var(--mono)' }}>
          {data.category}
        </span>
      </div>
      {data.decision && (
        <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: '8px' }}>
          {data.decision.slice(0, 200)}{data.decision.length > 200 ? '...' : ''}
        </div>
      )}
      {data.outcome && <div style={{ marginBottom: '6px' }}><Badge outcome={data.outcome} /></div>}
      {deptList && <div style={{ fontSize: '12px', color: 'var(--text-3)', fontFamily: 'var(--mono)', marginTop: '6px' }}>{deptList}</div>}
      {data.reactions.length > 0 && (
        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
          {data.reactions.map((r, i) => (
            <div key={i} style={{ fontSize: '13px', color: 'var(--text-2)', fontStyle: 'italic', padding: '6px 0', borderBottom: i < data.reactions.length - 1 ? '1px solid rgba(48,42,34,.5)' : 'none', lineHeight: 1.5 }}>
              &ldquo;{String(r.quote || '').slice(0, 80)}&rdquo;
              <span style={{ color: 'var(--text-3)', fontStyle: 'normal', fontWeight: 600, fontSize: '12px', marginLeft: '4px' }}>
                &mdash; {String(r.name)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
