import { useMemo, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { GameState } from '../../hooks/useGameState';
import { useCitationContext } from '../../hooks/useCitationRegistry';
import { useToolContext } from '../../hooks/useToolRegistry';
import { Badge } from '../shared/Badge';
import { CitationPills } from '../shared/CitationPills';
import { ReferencesSection } from '../shared/ReferencesSection';
import { ToolboxSection } from '../shared/ToolboxSection';
import { VerdictCard, VerdictPanel } from '../sim/VerdictCard';
import { CostBreakdownModal } from '../layout/CostBreakdownModal';
import { CommanderTrajectoryCard } from './CommanderTrajectoryCard';
import {
  buildReportSections,
  REPORT_ARTIFACT_LABELS,
  REPORT_FOCUS_LABELS,
  type EventReportSection,
} from './reportSections';
import { HeroScoreboard } from './HeroScoreboard';
import { RunStrip } from './RunStrip';
import { MetricSparklines } from './MetricSparklines';
import { ReportSideNav, type SideNavItem } from './ReportSideNav';
import { collectMetricSeries, collectRunStripData } from './reports-shared';

/**
 * Tiny hook for booleans persisted to localStorage. Used here to remember
 * whether the user expanded the References / Forged Toolbox sections in
 * the Reports tab, so their preference survives navigation and reloads.
 */
function usePersistedToggle(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : raw === '1';
    } catch { return initial; }
  });
  const set = useCallback((v: boolean) => {
    setValue(v);
    try { window.localStorage.setItem(key, v ? '1' : '0'); } catch {}
  }, [key]);
  return [value, set];
}

interface ReportViewProps {
  state: GameState;
  verdict?: Record<string, unknown> | null;
  reportSections: Array<'crisis' | 'departments' | 'decision' | 'outcome' | 'quotes' | 'causality'>;
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
  systems?: Record<string, unknown>;
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

export function ReportView({ state, verdict, reportSections }: ReportViewProps) {
  const citationRegistry = useCitationContext();
  const toolRegistry = useToolContext();
  // User's expand/collapse preference for References + Toolbox in this tab,
  // persisted across reloads. Default collapsed so the actual report
  // (turn-by-turn events) is the focus when the tab opens.
  const [refsOpen, setRefsOpen] = usePersistedToggle('paracosm-reports-refs-open', false);
  const [toolsOpen, setToolsOpen] = usePersistedToggle('paracosm-reports-tools-open', false);
  // Cost breakdown moved off the dense StatsBar; Reports is the right
  // home for the full modal since users land here to dig into the run.
  const [costOpen, setCostOpen] = useState(false);
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
          if (evt.data?.systems) t.systems = evt.data.systems as Record<string, unknown>;
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
            // Only count approved forges against the report's tool tally.
            // Rejected forges still render on their own cards (they live
            // in _filteredTools) but they never entered the registry and
            // should not inflate the "N tools" summary.
            const filtered = (evt.data?._filteredTools as Array<Record<string, unknown>>) || [];
            const approvedCount = filtered.filter((t) => t?.approved !== false).length;
            block.depts[dept] = {
              summary: (evt.data?.summary as string) || '',
              tools: approvedCount,
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

    // Object.entries keys are always strings; coerce to numbers here so
    // downstream consumers (collectRunStripData, section ids, sparkline
    // data) can treat turn numbers numerically without re-parsing each
    // time. The typed tuple fixes a tsc error that the runtime coercion
    // was already handling correctly.
    return Object.entries(map)
      .map(([k, v]) => [Number(k), v] as [number, { a: TurnData; b: TurnData }])
      .sort((a, b) => a[0] - b[0]);
  }, [state]);

  const nameA = state.a.leader?.name || 'Leader A';
  const nameB = state.b.leader?.name || 'Leader B';
  const hasTrajectories = state.a.events.some(e => e.type === 'drift') || state.b.events.some(e => e.type === 'drift');
  const hasQuotes = turns.some(([, sides]) => sides.a.reactions.length > 0 || sides.b.reactions.length > 0);
  const hasCausality = turns.some(([, sides]) => (
    [...sides.a.events.values(), ...sides.b.events.values()].some(block => Boolean(block.rationale))
  ));
  const reportPlan = useMemo(() => buildReportSections({
    configuredSections: reportSections,
    hasQuotes,
    hasCausality,
    hasVerdict: Boolean(verdict),
    hasTrajectories,
    hasCost: Boolean(state.cost && state.cost.llmCalls > 0),
    hasToolbox: toolRegistry.list.length > 0,
    hasReferences: citationRegistry.list.length > 0,
  }), [
    reportSections,
    hasQuotes,
    hasCausality,
    verdict,
    hasTrajectories,
    state.cost,
    toolRegistry.list.length,
    citationRegistry.list.length,
  ]);

  // Derivations for the new top-of-report surfaces. All memoized on the
  // same inputs the existing turn map uses so they update in sync.
  const stripCells = useMemo(() => collectRunStripData(turns), [turns]);
  const metricSeries = useMemo(() => collectMetricSeries(state), [state]);
  const sideNavItems = useMemo<SideNavItem[]>(() => {
    // Order now matches the new section layout: turn-by-turn content
    // at the top (Strip → Metrics → Trajectory → individual turns →
    // Toolbox), then the Run Summary / Verdict block, then References.
    // Hero scoreboard + verdict are nested under the single
    // `#summary` section so the sidenav jumps straight there.
    const items: SideNavItem[] = [];
    if (stripCells.length > 0) items.push({ id: 'strip', label: 'Strip' });
    if (metricSeries.some(m => m.a.length > 0 || m.b.length > 0)) items.push({ id: 'sparklines', label: 'Metrics' });
    if (hasTrajectories) items.push({ id: 'trajectory', label: 'Trajectory' });
    for (const [turnNum] of turns) items.push({ id: `turn-${turnNum}`, label: `Turn ${turnNum}` });
    if (toolRegistry.list.length > 0) items.push({ id: 'toolbox', label: 'Toolbox' });
    items.push({ id: 'summary', label: verdict ? 'Verdict' : 'Summary' });
    if (citationRegistry.list.length > 0) items.push({ id: 'references', label: 'References' });
    return items;
  }, [verdict, stripCells.length, metricSeries, hasTrajectories, turns, toolRegistry.list.length, citationRegistry.list.length]);

  // All hooks must be declared before any conditional return, otherwise
  // React throws #310 ("rendered more hooks than during the previous
  // render") when the empty-state early-return branch stops taking.
  const scrollRef = useRef<HTMLDivElement>(null);
  // Tail-to-bottom: auto-scroll on new turns only when the user is
  // already near the bottom. Releases as soon as they scroll up to
  // read an earlier turn.
  const pinnedRef = useRef(true);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };
  useEffect(() => {
    if (!pinnedRef.current) return;
    if (scrollRef.current && turns.length > 0) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [turns.length]);

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
    <div className="reports-layout" style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="reports-content"
        role="region"
        aria-label="Turn-by-turn report"
        style={{
          flex: 1,
          // Without minWidth: 0 the flex child refuses to shrink below
          // its intrinsic content width, which on narrow viewports pushes
          // the side-rail off-screen AND collapses `<details>` markers
          // into one-char-per-line vertical text. Explicit zero fixes both.
          minWidth: 0,
          overflowY: 'auto',
          padding: '24px 32px',
          background: 'var(--bg-deep)',
        }}
      >
      {/* Key Insight tile — the TL;DR card at the very top so users
          who aren't going to scroll the full report still see the
          verdict headline + the three most important stat deltas.
          Computed from the same verdict payload the Summary section
          below consumes; renders null when no verdict is available
          yet (still-running runs skip the block). */}
      {(() => {
        const v = verdict as { winnerName?: string; winner?: 'A' | 'B' | 'tie'; headline?: string; summary?: string } | null;
        const winnerName = v?.winnerName || '';
        const headline = v?.headline || v?.summary || '';
        if (!verdict && turns.length === 0) return null;
        const turnCount = turns.length;
        const lastTurn = turns[turns.length - 1];
        const firstTurn = turns[0];
        const pick = (systems: Record<string, unknown> | undefined, key: string): number => {
          const v = systems?.[key];
          return typeof v === 'number' ? v : 0;
        };
        const finalPopA = pick(lastTurn?.[1]?.a?.systems, 'population');
        const finalPopB = pick(lastTurn?.[1]?.b?.systems, 'population');
        const finalMoraleA = pick(lastTurn?.[1]?.a?.systems, 'morale');
        const finalMoraleB = pick(lastTurn?.[1]?.b?.systems, 'morale');
        const initialPopA = pick(firstTurn?.[1]?.a?.systems, 'population') || finalPopA;
        const initialPopB = pick(firstTurn?.[1]?.b?.systems, 'population') || finalPopB;
        const totalToolsA = state.a.events.filter(e => e.type === 'forge_attempt' && e.data?.approved === true).length;
        const totalToolsB = state.b.events.filter(e => e.type === 'forge_attempt' && e.data?.approved === true).length;
        const stats: Array<{ label: string; value: string; tone?: 'pos' | 'neg' | 'neutral' }> = [
          { label: 'Turns', value: String(turnCount) },
          {
            label: 'Final pop',
            value: `A ${finalPopA}${finalPopA < initialPopA ? ` (↓${initialPopA - finalPopA})` : ''} · B ${finalPopB}${finalPopB < initialPopB ? ` (↓${initialPopB - finalPopB})` : ''}`,
            tone: finalPopA + finalPopB < initialPopA + initialPopB ? 'neg' : 'neutral',
          },
          {
            label: 'Final morale',
            value: `A ${Math.round(finalMoraleA * 100)}% · B ${Math.round(finalMoraleB * 100)}%`,
            tone: Math.min(finalMoraleA, finalMoraleB) < 0.3 ? 'neg' : Math.min(finalMoraleA, finalMoraleB) >= 0.6 ? 'pos' : 'neutral',
          },
          { label: 'Tools forged', value: `A ${totalToolsA} · B ${totalToolsB}` },
        ];
        return (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '12px 14px',
              marginBottom: 12,
              background: 'linear-gradient(135deg, rgba(232,180,74,0.08), rgba(224,101,48,0.04))',
              border: '1px solid rgba(232,180,74,0.35)',
              borderRadius: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--amber)' }}>
                TL;DR
              </span>
              {winnerName ? (
                <span style={{ fontSize: 14, fontFamily: 'var(--sans)', fontWeight: 800, color: 'var(--text-1)' }}>
                  {winnerName} wins
                </span>
              ) : turnCount > 0 ? (
                <span style={{ fontSize: 14, fontFamily: 'var(--sans)', fontWeight: 800, color: 'var(--text-1)' }}>
                  Run {turnCount} turn{turnCount === 1 ? '' : 's'} — verdict pending
                </span>
              ) : null}
              {headline && (
                <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1, minWidth: 200 }}>
                  {headline}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-2)' }}>
              {stats.map(s => (
                <span key={s.label}>
                  <span style={{ color: 'var(--text-3)', marginRight: 4 }}>{s.label}:</span>
                  <span
                    style={{
                      color: s.tone === 'pos' ? 'var(--green)' : s.tone === 'neg' ? 'var(--rust)' : 'var(--text-1)',
                      fontWeight: 700,
                    }}
                  >
                    {s.value}
                  </span>
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Header row: title on the left, jump-to-summary CTA on the
          right. User asked for the verdict / winner results at the
          bottom (just above References) with a scroll-to anchor up
          top so they can jump there without reading the whole
          turn-by-turn report first. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: '22px', color: 'var(--amber)', fontFamily: 'var(--mono)', margin: 0 }}>
          Turn-by-Turn Report
        </h2>
        <button
          type="button"
          onClick={() => {
            const el = document.getElementById('summary');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          style={{
            background: 'linear-gradient(135deg, var(--amber), #c8952e)',
            color: 'var(--bg-deep)',
            border: 'none',
            padding: '8px 18px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            fontFamily: 'var(--mono)',
            boxShadow: '0 2px 10px rgba(232,180,74,0.25)',
          }}
        >
          {verdict ? '↓ See verdict + full summary' : '↓ Jump to summary'}
        </button>
      </div>

      <section id="strip">
        <RunStrip turns={stripCells} leaderAName={nameA} leaderBName={nameB} />
      </section>

      <section id="sparklines">
        <MetricSparklines metrics={metricSeries} leaderAName={nameA} leaderBName={nameB} />
      </section>

      {/* Commander personality arcs. Shown once per side once there's at
          least one turn of drift data, so the user can visually inspect
          how each commander's HEXACO evolved across the run. Data comes
          from drift SSE events emitted after every turn. */}
      <section id="trajectory">
        {hasTrajectories && (
          <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <CommanderTrajectoryCard
              events={state.a.events}
              leaderName={nameA}
              baselineHexaco={state.a.leader?.hexaco}
            />
            <CommanderTrajectoryCard
              events={state.b.events}
              leaderName={nameB}
              baselineHexaco={state.b.leader?.hexaco}
            />
          </div>
        )}
      </section>

      {/* Cost breakdown trigger. Moved out of the StatsBar header when
          the row got too dense; Reports is the right home since users
          land here to dig into the run. Hidden on cached runs that
          never reported any LLM calls. */}
      {state.cost && state.cost.llmCalls > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
          padding: '10px 14px', borderRadius: 8,
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          fontFamily: 'var(--mono)', fontSize: 13,
        }}>
          <span style={{ color: 'var(--text-3)', letterSpacing: '0.5px', fontWeight: 700, textTransform: 'uppercase' }}>
            Run cost
          </span>
          <span style={{ color: 'var(--green)', fontWeight: 800, fontSize: 15 }}>
            ${state.cost.totalCostUSD < 0.01 ? state.cost.totalCostUSD.toFixed(4) : state.cost.totalCostUSD.toFixed(2)}
          </span>
          <span style={{ color: 'var(--text-3)' }}>
            · {state.cost.llmCalls} LLM calls · {(state.cost.totalTokens / 1000).toFixed(1)}k tokens
          </span>
          <button
            type="button"
            onClick={() => setCostOpen(true)}
            style={{
              marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
              padding: '4px 10px', borderRadius: 4,
              background: 'var(--bg-card)', color: 'var(--amber)',
              border: '1px solid var(--amber-dim)', cursor: 'pointer',
            }}
          >
            Per-stage breakdown ›
          </button>
        </div>
      )}
      {costOpen && state.cost && state.cost.llmCalls > 0 && (
        <CostBreakdownModal
          combined={state.cost}
          leaderA={state.costA}
          leaderB={state.costB}
          leaderAName={state.a.leader?.name}
          leaderBName={state.b.leader?.name}
          onClose={() => setCostOpen(false)}
        />
      )}

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
          <section key={turnNum} id={`turn-${turnNum}`} style={{
            background: diverged
              ? 'color-mix(in srgb, var(--bg-panel) 90%, var(--rust) 10%)'
              : 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderLeft: diverged ? '3px solid var(--rust)' : '1px solid var(--border)',
            borderRadius: '8px',
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
                <EventSide block={a.events.get(ei)} eventIndex={ei} totalEvents={eventCount} name={nameA} sideColor="var(--vis)" sections={reportPlan.eventSections} />
                <EventSide block={b.events.get(ei)} eventIndex={ei} totalEvents={eventCount} name={nameB} sideColor="var(--eng)" sections={reportPlan.eventSections} />
              </div>
            ))}

            {/* Per-turn shared sections: colony state + agent voices */}
            <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: 12 }}>
              <TurnSharedFooter data={a} name={nameA} sideColor="var(--vis)" showQuotes={reportPlan.footerSections.includes('quotes')} />
              <TurnSharedFooter data={b} name={nameB} sideColor="var(--eng)" showQuotes={reportPlan.footerSections.includes('quotes')} />
            </div>
          </section>
        );
      })}

      {/* Forged Toolbox + References — collapsed by default in the Reports
          tab so the turn-by-turn report is the focus on open. The user's
          expand choice is persisted to localStorage so subsequent visits
          restore their preferred view. */}
      <section id="toolbox">
        {toolRegistry.list.length > 0 && (
          <ToolboxSection
            registry={toolRegistry}
            title="Forged Toolbox"
            collapsible
            defaultOpen={toolsOpen}
            onToggle={setToolsOpen}
          />
        )}
      </section>

      {/* Full run summary lives at the bottom of the report so users
          can scroll down at their own pace after reading the
          turn-by-turn breakdown. The top-of-page CTA jumps here via
          the `#summary` anchor. Hosts both the hero scoreboard
          (winner + key deltas) and the full verdict panel (LLM
          judgement reasoning). */}
      <section id="summary" style={{ marginTop: 24 }}>
        <div
          style={{
            fontSize: 12,
            fontFamily: 'var(--mono)',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--amber)',
            marginBottom: 8,
            paddingBottom: 6,
            borderBottom: '1px solid var(--border)',
          }}
        >
          Run Summary · Verdict · Winner
        </div>
        <HeroScoreboard
          verdict={verdict}
          leaderAName={nameA}
          leaderBName={nameB}
        />
        {verdict && (
          <div style={{ marginTop: 16 }}>
            <VerdictPanel verdict={verdict} />
          </div>
        )}
      </section>

      <section id="references">
        {citationRegistry.list.length > 0 && (
          <ReferencesSection
            registry={citationRegistry}
            title="References"
            collapsible
            defaultOpen={refsOpen}
            onToggle={setRefsOpen}
          />
        )}
      </section>

      <details style={{
        marginTop: 16, padding: '10px 14px',
        background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8,
        fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-3)',
      }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-2)' }}>
          What's in this report?
        </summary>
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 800, color: 'var(--amber)', marginBottom: 4 }}>Scenario focus</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {reportPlan.focusSections.map(section => (
                <span key={section} style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                  border: '1px solid var(--border)', background: 'var(--bg-elevated, var(--bg-card))',
                  color: 'var(--amber)',
                }}>
                  {REPORT_FOCUS_LABELS[section]}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: 'var(--amber)', marginBottom: 4 }}>This run produced</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {reportPlan.artifacts.map(artifact => (
                <span key={artifact} style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                  border: '1px solid var(--border)', background: 'var(--bg-card)',
                  color: 'var(--text-2)',
                }}>
                  {REPORT_ARTIFACT_LABELS[artifact]}
                </span>
              ))}
            </div>
          </div>
        </div>
      </details>
      </div>
      <ReportSideNav items={sideNavItems} scrollRoot={scrollRef.current} />
    </div>
  );
}

const moodColors: Record<string, string> = {
  positive: 'var(--green)', negative: 'var(--rust)', anxious: 'var(--amber)',
  defiant: 'var(--rust)', hopeful: 'var(--green)', resigned: 'var(--text-3)', neutral: 'var(--text-2)',
};

function EventSide({ block, eventIndex, totalEvents, name, sideColor, sections }: {
  block: EventBlock | undefined;
  eventIndex: number;
  totalEvents: number;
  name: string;
  sideColor: string;
  sections: EventReportSection[];
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

  const eventSections: Record<EventReportSection, ReactNode> = {
    crisis: (
      <div key="crisis">
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
      </div>
    ),
    decision: block.decision ? (
      <div key="decision" style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: '6px' }}>
        {block.decision}
      </div>
    ) : null,
    outcome: block.outcome ? (
      <div key="outcome" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <Badge outcome={block.outcome} />
        {Array.isArray(block.policies) && block.policies.length > 0 && (
          <span style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
            {block.policies.map(p => String(p)).join(' / ')}
          </span>
        )}
      </div>
    ) : null,
    causality: block.rationale ? (
      <details key="causality" style={{ marginBottom: '8px' }}>
        <summary style={{ fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: sideColor, fontFamily: 'var(--mono)' }}>Rationale</summary>
        <div style={{ fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.6, marginTop: '4px', fontStyle: 'italic', paddingLeft: '8px', borderLeft: `2px solid ${sideColor}` }}>
          {block.rationale}
        </div>
      </details>
    ) : null,
    departments: Object.keys(block.depts).length > 0 ? (
      <details key="departments" style={{ marginBottom: '8px' }} open>
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
              <CitationPills citations={d.citationList} label="" />
            </div>
          ))}
        </div>
      </details>
    ) : null,
  };

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

      {sections.map(section => eventSections[section]).filter(Boolean)}
    </div>
  );
}

function TurnSharedFooter({ data, name, sideColor, showQuotes }: { data: TurnData; name: string; sideColor: string; showQuotes: boolean }) {
  const systems = data.systems as Record<string, number> | undefined;
  if (!systems && (!showQuotes || data.reactions.length === 0)) return <div />;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 12px' }}>
      {systems && (
        <details style={{ marginBottom: data.reactions.length ? '8px' : 0 }}>
          <summary style={{ fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: sideColor, fontFamily: 'var(--mono)' }}>
            {name} &middot; Systems State
          </summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: '4px', fontSize: '11px', fontFamily: 'var(--mono)' }}>
            {Object.entries(systems).map(([k, v]) => (
              <span key={k} style={{ color: 'var(--text-2)' }}>
                <span style={{ color: 'var(--text-3)' }}>{k}: </span>
                <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v)}</span>
              </span>
            ))}
          </div>
        </details>
      )}

      {showQuotes && data.reactions.length > 0 && (
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
