import { useMemo, useEffect, useRef } from 'react';
import type { GameState } from '../../hooks/useGameState';
import { Badge } from '../shared/Badge';
import { VerdictCard } from '../sim/VerdictCard';

interface ReportViewProps {
  state: GameState;
  verdict?: Record<string, unknown> | null;
}

interface TurnData {
  title?: string;
  year?: number;
  category?: string;
  emergent?: boolean;
  crisis?: string;
  decision?: string;
  rationale?: string;
  policies?: string[];
  outcome?: string;
  colony?: Record<string, unknown>;
  depts: Record<string, { summary: string; tools: number; citations: number; citationList: Array<{ text: string; url: string; doi?: string }> }>;
  reactions: Array<Record<string, unknown>>;
  totalReactions: number;
}

export function ReportView({ state, verdict }: ReportViewProps) {
  const turns = useMemo(() => {
    const map: Record<number, { a: TurnData; b: TurnData }> = {};
    for (const side of ['a', 'b'] as const) {
      for (const evt of state[side].events) {
        const turn = evt.turn;
        if (!turn) continue;
        if (!map[turn]) map[turn] = { a: { depts: {}, reactions: [], totalReactions: 0 } as TurnData, b: { depts: {}, reactions: [], totalReactions: 0 } as TurnData };
        const t = map[turn][side];
        if (evt.type === 'turn_start' && evt.data.title && evt.data.title !== 'Director generating...') {
          t.title = evt.data.title as string; t.year = evt.data.year as number;
          t.category = evt.data.category as string; t.emergent = evt.data.emergent as boolean;
          t.crisis = (evt.data.crisis as string) || (evt.data.turnSummary as string) || '';
          t.colony = evt.data.colony as Record<string, unknown>;
        }
        if (evt.type === 'commander_decided') {
          t.decision = String(evt.data.decision || '');
          t.rationale = String(evt.data.rationale || '');
          const raw = evt.data.selectedPolicies;
          t.policies = Array.isArray(raw) ? raw.map(p => typeof p === 'string' ? p : JSON.stringify(p)) : [];
        }
        if (evt.type === 'outcome') {
          t.outcome = String(evt.data.outcome || '');
        }
        if (evt.type === 'dept_done') {
          const dept = evt.data.department as string;
          t.depts[dept] = {
            summary: evt.data.summary as string || '',
            tools: ((evt.data._filteredTools as unknown[]) || []).length,
            citations: evt.data.citations as number || 0,
            citationList: (evt.data.citationList as Array<{ text: string; url: string; doi?: string }>) || [],
          };
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

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current && turns.length > 0) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [turns.length]);

  return (
    <div ref={scrollRef} className="reports-content" role="region" aria-label="Turn-by-turn report" style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', background: 'var(--bg-deep)' }}>
      <h2 style={{ fontSize: '22px', color: 'var(--amber)', fontFamily: 'var(--mono)', marginBottom: '16px' }}>
        Turn-by-Turn Report
      </h2>

      {verdict && <VerdictCard verdict={verdict} />}

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
            <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <TurnSide data={a} name={nameA} sideColor="var(--vis)" />
              <TurnSide data={b} name={nameB} sideColor="var(--eng)" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const moodColors: Record<string, string> = {
  positive: 'var(--green)', negative: 'var(--rust)', anxious: 'var(--amber)',
  defiant: 'var(--rust)', hopeful: 'var(--green)', resigned: 'var(--text-3)', neutral: 'var(--text-2)',
};

function TurnSide({ data, name, sideColor }: { data: TurnData; name: string; sideColor: string }) {
  if (!data.title) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', padding: '14px 16px' }}>
        <h4 style={{ fontSize: '15px', fontFamily: 'var(--mono)', fontWeight: 800, color: sideColor, marginBottom: '8px' }}>{name}</h4>
        <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>Awaiting data...</span>
      </div>
    );
  }

  const colony = data.colony as Record<string, number> | undefined;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', padding: '14px 16px' }}>
      <h4 style={{ fontSize: '15px', fontFamily: 'var(--mono)', fontWeight: 800, color: sideColor, marginBottom: '8px' }}>{name}</h4>

      {/* Crisis title + tags */}
      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '4px' }}>
        {data.title}
        <span style={{ fontSize: '10px', color: 'var(--text-3)', background: 'var(--bg-deep)', padding: '1px 6px', borderRadius: '3px', marginLeft: '6px', fontFamily: 'var(--mono)' }}>
          {data.category}
        </span>
        {data.emergent && <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--rust)', fontFamily: 'var(--mono)', marginLeft: '6px' }}>EMERGENT</span>}
      </div>

      {/* Crisis description */}
      {data.crisis && (
        <div style={{ fontSize: '12px', color: 'var(--text-3)', lineHeight: 1.5, marginBottom: '8px', fontStyle: 'italic' }}>
          {data.crisis}
        </div>
      )}

      {/* Decision - full text */}
      {data.decision && (
        <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: '6px' }}>
          {data.decision}
        </div>
      )}

      {/* Outcome badge + rationale */}
      {data.outcome && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <Badge outcome={data.outcome} />
          {Array.isArray(data.policies) && data.policies.length > 0 && (
            <span style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
              {data.policies.map(p => String(p)).join(' / ')}
            </span>
          )}
        </div>
      )}

      {/* Rationale expandable */}
      {data.rationale && (
        <details style={{ marginBottom: '8px' }}>
          <summary style={{ fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: sideColor, fontFamily: 'var(--mono)' }}>Rationale</summary>
          <div style={{ fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.6, marginTop: '4px', fontStyle: 'italic', paddingLeft: '8px', borderLeft: `2px solid ${sideColor}` }}>
            {data.rationale}
          </div>
        </details>
      )}

      {/* Colony state */}
      {colony && (
        <details style={{ marginBottom: '8px' }}>
          <summary style={{ fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: sideColor, fontFamily: 'var(--mono)' }}>Colony State</summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: '4px', fontSize: '11px', fontFamily: 'var(--mono)' }}>
            {Object.entries(colony).map(([k, v]) => (
              <span key={k} style={{ color: 'var(--text-2)' }}>
                <span style={{ color: 'var(--text-3)' }}>{k}: </span>
                <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v)}</span>
              </span>
            ))}
          </div>
        </details>
      )}

      {/* Department analyses expandable */}
      {Object.keys(data.depts).length > 0 && (
        <details style={{ marginBottom: '8px' }} open>
          <summary style={{ fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: sideColor, fontFamily: 'var(--mono)' }}>
            Departments ({Object.keys(data.depts).length})
          </summary>
          <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {Object.entries(data.depts).map(([dept, d]) => (
              <div key={dept} style={{ fontSize: '12px', padding: '4px 8px', background: 'var(--bg-deep)', borderRadius: '4px', borderLeft: `2px solid ${sideColor}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{dept.charAt(0).toUpperCase() + dept.slice(1)}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>{d.citations}c {d.tools}t</span>
                </div>
                {d.summary && <div style={{ color: 'var(--text-2)', lineHeight: 1.5, marginTop: '2px' }}>{d.summary}</div>}
                {d.citationList.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    {d.citationList.map((c, ci) => (
                      <div key={ci} style={{ fontSize: '10px', marginTop: '2px' }}>
                        <a href={c.url} target="_blank" rel="noopener" style={{ color: 'var(--amber)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                          {c.text}
                        </a>
                        {c.doi && <span style={{ marginLeft: '4px', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text-3)' }}>DOI:{c.doi}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Agent reactions */}
      {data.reactions.length > 0 && (
        <details open>
          <summary style={{ fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: sideColor, fontFamily: 'var(--mono)' }}>
            Agent Voices ({data.totalReactions || data.reactions.length})
          </summary>
          <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {data.reactions.map((r, i) => (
              <div key={i} style={{ fontSize: '12px', padding: '4px 8px', background: 'var(--bg-deep)', borderRadius: '4px', lineHeight: 1.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <span style={{ fontWeight: 700, color: sideColor }}>{String(r.name)}</span>
                  <span style={{
                    fontSize: '9px', fontWeight: 800, fontFamily: 'var(--mono)',
                    padding: '1px 5px', borderRadius: '3px',
                    color: moodColors[String(r.mood)] || 'var(--text-3)',
                    background: `color-mix(in srgb, ${moodColors[String(r.mood)] || 'var(--text-3)'} 12%, transparent)`,
                  }}>
                    {String(r.mood || '').toUpperCase()}
                  </span>
                </div>
                <div style={{ color: 'var(--text-2)', fontStyle: 'italic' }}>
                  &ldquo;{String(r.quote || '')}&rdquo;
                </div>
                {r.role && <div style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '2px' }}>{String(r.role)} {r.department ? `in ${String(r.department)}` : ''}</div>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
