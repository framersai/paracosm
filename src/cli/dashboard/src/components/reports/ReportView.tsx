import { useMemo, useEffect, useRef } from 'react';
import type { GameState } from '../../hooks/useGameState';
import { useCitationContext } from '../../hooks/useCitationRegistry';
import { useToolContext } from '../../hooks/useToolRegistry';
import { Badge } from '../shared/Badge';
import { CitationPills } from '../shared/CitationPills';
import { ReferencesSection } from '../shared/ReferencesSection';
import { ToolboxSection } from '../shared/ToolboxSection';
import { VerdictCard } from '../sim/VerdictCard';

interface ReportViewProps {
  state: GameState;
  verdict?: Record<string, unknown> | null;
}

interface EventBlock {
  /** Index within the turn (0..totalEvents-1). */
  eventIndex: number;
  /** Total events in this turn. */
  totalEvents: number;
  title?: string;
  category?: string;
  emergent?: boolean;
  description?: string;
  decision?: string;
  rationale?: string;
  policies?: string[];
  outcome?: string;
  depts: Record<string, { summary: string; tools: number; citations: number; citationList: Array<{ text: string; url: string; doi?: string }> }>;
}

interface TurnData {
  year?: number;
  colony?: Record<string, unknown>;
  events: Map<number, EventBlock>;
  reactions: Array<Record<string, unknown>>;
  totalReactions: number;
}

function emptyTurn(): TurnData {
  return { events: new Map(), reactions: [], totalReactions: 0 };
}

function getEventBlock(turn: TurnData, eventIndex: number, totalEvents: number): EventBlock {
  let block = turn.events.get(eventIndex);
  if (!block) {
    block = { eventIndex, totalEvents, depts: {} };
    turn.events.set(eventIndex, block);
  }
  if (totalEvents > block.totalEvents) block.totalEvents = totalEvents;
  return block;
}

export function ReportView({ state, verdict }: ReportViewProps) {
  const citationRegistry = useCitationContext();
  const toolRegistry = useToolContext();
  const turns = useMemo(() => {
    const map: Record<number, { a: TurnData; b: TurnData }> = {};

    for (const side of ['a', 'b'] as const) {
      // Track pending decision/rationale per event index — commander_decided
      // arrives before outcome, both reference the same event.
      const pending = new Map<number, { decision: string; rationale: string; policies: string[] }>();

      for (const evt of state[side].events) {
        const turn = evt.turn;
        if (!turn) continue;
        if (!map[turn]) map[turn] = { a: emptyTurn(), b: emptyTurn() };
        const t = map[turn][side];
        const eventIndex = Number(evt.data?.eventIndex ?? 0);
        const totalEvents = Number(evt.data?.totalEvents ?? 1);

        if (evt.type === 'turn_start') {
          if (evt.data?.year != null) t.year = evt.data.year as number;
          if (evt.data?.colony) t.colony = evt.data.colony as Record<string, unknown>;
          // Legacy single-event turn_start: also seed event 0
          if (evt.data?.title && evt.data?.title !== 'Director generating...' && !evt.data?.totalEvents) {
            const block = getEventBlock(t, 0, 1);
            block.title = evt.data.title as string;
            block.category = evt.data.category as string | undefined;
            block.emergent = evt.data.emergent as boolean | undefined;
            block.description = (evt.data.crisis as string) || (evt.data.turnSummary as string) || '';
          }
        }

        if (evt.type === 'event_start') {
          const block = getEventBlock(t, eventIndex, totalEvents);
          block.title = evt.data?.title as string | undefined;
          block.category = evt.data?.category as string | undefined;
          block.emergent = evt.data?.emergent as boolean | undefined;
          block.description = (evt.data?.description as string) || (evt.data?.turnSummary as string) || '';
        }

        if (evt.type === 'commander_decided') {
          pending.set(eventIndex, {
            decision: String(evt.data?.decision || ''),
            rationale: String(evt.data?.rationale || ''),
            policies: Array.isArray(evt.data?.selectedPolicies)
              ? (evt.data.selectedPolicies as unknown[]).map(p => typeof p === 'string' ? p : JSON.stringify(p))
              : [],
          });
        }

        if (evt.type === 'outcome') {
          const block = getEventBlock(t, eventIndex, totalEvents);
          block.outcome = String(evt.data?.outcome || '');
          const p = pending.get(eventIndex);
          if (p) {
            block.decision = p.decision;
            block.rationale = p.rationale;
            block.policies = p.policies;
            pending.delete(eventIndex);
          }
        }

        if (evt.type === 'dept_done') {
          const block = getEventBlock(t, eventIndex, totalEvents);
          const dept = evt.data?.department as string;
          if (dept) {
            block.depts[dept] = {
              summary: (evt.data?.summary as string) || '',
              tools: ((evt.data?._filteredTools as unknown[]) || []).length,
              citations: Number(evt.data?.citations ?? 0),
              citationList: (evt.data?.citationList as Array<{ text: string; url: string; doi?: string }>) || [],
            };
          }
        }

        if (evt.type === 'agent_reactions') {
          t.reactions = ((evt.data?.reactions as Array<Record<string, unknown>>) || []).slice(0, 3);
          t.totalReactions = Number(evt.data?.totalReactions ?? 0);
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

      {/* Inline pills inside dept blocks point here; the full references
          section anchors them via #cite-N for deep linking. */}
      {turns.map(([turnNum, sides]) => {
        const a = sides.a;
        const b = sides.b;
        const year = a.year || b.year || '?';
        const eventCount = Math.max(
          ...[...a.events.values()].map(e => e.totalEvents),
          ...[...b.events.values()].map(e => e.totalEvents),
          1,
        );
        // Determine divergence by comparing event titles between A and B
        const aFirst = a.events.get(0)?.title;
        const bFirst = b.events.get(0)?.title;
        const diverged = aFirst && bFirst && aFirst !== bFirst;

        return (
          <div key={turnNum} style={{
            background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px',
            padding: '16px 20px', marginBottom: '14px', boxShadow: 'var(--card-shadow)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text-1)' }}>
                Turn {turnNum} &mdash; Y{year}
                {eventCount > 1 && (
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-3)', marginLeft: 8, fontFamily: 'var(--mono)' }}>
                    {eventCount} events
                  </span>
                )}
              </span>
              <span style={{
                fontSize: '12px', color: diverged ? 'var(--rust)' : 'var(--text-3)',
                fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--mono)',
              }}>
                {diverged ? 'DIVERGENT' : 'SHARED'}
              </span>
            </div>

            {/* Render each event as its own row of two side-by-side blocks */}
            {Array.from({ length: eventCount }).map((_, ei) => (
              <div key={ei} className="responsive-grid-2" style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px',
                marginBottom: ei < eventCount - 1 ? 12 : 0,
              }}>
                <EventSide block={a.events.get(ei)} eventIndex={ei} totalEvents={eventCount} name={nameA} sideColor="var(--vis)" />
                <EventSide block={b.events.get(ei)} eventIndex={ei} totalEvents={eventCount} name={nameB} sideColor="var(--eng)" />
              </div>
            ))}

            {/* Per-turn shared sections: colony state + agent voices */}
            <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: 12 }}>
              <TurnSharedFooter data={a} name={nameA} sideColor="var(--vis)" />
              <TurnSharedFooter data={b} name={nameB} sideColor="var(--eng)" />
            </div>
          </div>
        );
      })}

      {/* Forged Toolbox — every emergent tool catalogued, with first-forge
          provenance, reuse counts, and JSON Schema (when registered). */}
      {toolRegistry.list.length > 0 && (
        <ToolboxSection registry={toolRegistry} title="Forged Toolbox" />
      )}

      {/* Single References section at the end of the report. Inline [N]
          pills throughout the report deep-link here via #cite-N. */}
      {citationRegistry.list.length > 0 && (
        <ReferencesSection registry={citationRegistry} title="References" />
      )}
    </div>
  );
}

const moodColors: Record<string, string> = {
  positive: 'var(--green)', negative: 'var(--rust)', anxious: 'var(--amber)',
  defiant: 'var(--rust)', hopeful: 'var(--green)', resigned: 'var(--text-3)', neutral: 'var(--text-2)',
};

function EventSide({ block, eventIndex, totalEvents, name, sideColor }: {
  block: EventBlock | undefined;
  eventIndex: number;
  totalEvents: number;
  name: string;
  sideColor: string;
}) {
  if (!block || !block.title) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', padding: '14px 16px' }}>
        <h4 style={{ fontSize: '15px', fontFamily: 'var(--mono)', fontWeight: 800, color: sideColor, marginBottom: '8px' }}>
          {name}
          {totalEvents > 1 && (
            <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 8, fontWeight: 600 }}>
              Event {eventIndex + 1}/{totalEvents}
            </span>
          )}
        </h4>
        <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>Awaiting data...</span>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', padding: '14px 16px' }}>
      <h4 style={{ fontSize: '15px', fontFamily: 'var(--mono)', fontWeight: 800, color: sideColor, marginBottom: '8px' }}>
        {name}
        {totalEvents > 1 && (
          <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 8, fontWeight: 600 }}>
            Event {eventIndex + 1}/{totalEvents}
          </span>
        )}
      </h4>

      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '4px' }}>
        {block.title}
        {block.category && (
          <span style={{ fontSize: '10px', color: 'var(--text-3)', background: 'var(--bg-deep)', padding: '1px 6px', borderRadius: '3px', marginLeft: '6px', fontFamily: 'var(--mono)' }}>
            {block.category}
          </span>
        )}
        {block.emergent && <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--rust)', fontFamily: 'var(--mono)', marginLeft: '6px' }}>EMERGENT</span>}
      </div>

      {block.description && (
        <div style={{ fontSize: '12px', color: 'var(--text-3)', lineHeight: 1.5, marginBottom: '8px', fontStyle: 'italic' }}>
          {block.description}
        </div>
      )}

      {block.decision && (
        <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: '6px' }}>
          {block.decision}
        </div>
      )}

      {block.outcome && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <Badge outcome={block.outcome} />
          {Array.isArray(block.policies) && block.policies.length > 0 && (
            <span style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
              {block.policies.map(p => String(p)).join(' / ')}
            </span>
          )}
        </div>
      )}

      {block.rationale && (
        <details style={{ marginBottom: '8px' }}>
          <summary style={{ fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: sideColor, fontFamily: 'var(--mono)' }}>Rationale</summary>
          <div style={{ fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.6, marginTop: '4px', fontStyle: 'italic', paddingLeft: '8px', borderLeft: `2px solid ${sideColor}` }}>
            {block.rationale}
          </div>
        </details>
      )}

      {Object.keys(block.depts).length > 0 && (
        <details style={{ marginBottom: '8px' }} open>
          <summary style={{ fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: sideColor, fontFamily: 'var(--mono)' }}>
            Departments ({Object.keys(block.depts).length})
          </summary>
          <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {Object.entries(block.depts).map(([dept, d]) => (
              <div key={dept} style={{ fontSize: '12px', padding: '4px 8px', background: 'var(--bg-deep)', borderRadius: '4px', borderLeft: `2px solid ${sideColor}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{dept.charAt(0).toUpperCase() + dept.slice(1)}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>{d.citations}c {d.tools}t</span>
                </div>
                {d.summary && <div style={{ color: 'var(--text-2)', lineHeight: 1.5, marginTop: '2px' }}>{d.summary}</div>}
                {/* Compact numbered pills — full sources live in the
                    References section at the bottom of the report. */}
                <CitationPills citations={d.citationList} label="" />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function TurnSharedFooter({ data, name, sideColor }: { data: TurnData; name: string; sideColor: string }) {
  const colony = data.colony as Record<string, number> | undefined;
  if (!colony && data.reactions.length === 0) return <div />;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 12px' }}>
      {colony && (
        <details style={{ marginBottom: data.reactions.length ? '8px' : 0 }}>
          <summary style={{ fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: sideColor, fontFamily: 'var(--mono)' }}>
            {name} &middot; Colony State
          </summary>
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
                {!!r.role && <div style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '2px' }}>{String(r.role)} {r.department ? `in ${String(r.department)}` : ''}</div>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
