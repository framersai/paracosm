import { useMemo } from 'react';
import type { SimEvent } from './useSSE';

export type Side = 'a' | 'b';

export interface AgentSnapshot {
  agentId: string;
  name: string;
  department: string;
  role: string;
  rank: 'junior' | 'senior' | 'lead' | 'chief';
  alive: boolean;
  marsborn: boolean;
  psychScore: number;
  age?: number;
  generation?: number;
  partnerId?: string;
  childrenIds: string[];
  featured: boolean;
  mood: string;
  shortTermMemory: string[];
}

export interface ColonyState {
  population: number;
  morale: number;
  foodMonthsReserve: number;
  waterLitersPerDay: number;
  powerKw: number;
  infrastructureModules: number;
  lifeSupportCapacity: number;
  scienceOutput: number;
  [key: string]: number;
}

export interface LeaderInfo {
  name: string;
  archetype: string;
  colony: string;
  hexaco: Record<string, number>;
  instructions?: string;
  quote?: string;
}

export interface CrisisInfo {
  turn: number;
  year?: number;
  title: string;
  description?: string;
  category: string;
  emergent: boolean;
  turnSummary?: string;
}

export interface SideState {
  leader: LeaderInfo | null;
  colony: ColonyState | null;
  prevColony: ColonyState | null;
  crisis: CrisisInfo | null;
  events: ProcessedEvent[];
  popHistory: number[];
  moraleHistory: number[];
  deaths: number;
  tools: number;
  citations: number;
  decisions: number;
  pendingDecision: string;
  pendingRationale: string;
  pendingPolicies: string[];
  outcome: string | null;
  agentSnapshots: AgentSnapshot[][];
  currentEvents: Array<{ eventIndex: number; totalEvents: number; title: string; category: string }>;
}

export interface ProcessedEvent {
  id: string;
  type: string;
  turn?: number;
  year?: number;
  data: Record<string, unknown>;
}

/**
 * Per-call-site spend within a run. Keys are pipeline-stage labels the
 * orchestrator tags (director, commander, departments, judge, reactions,
 * other). Empty when the run hasn't reported any calls yet.
 *
 * cacheReadTokens / cacheCreationTokens are present when a stage used
 * Anthropic prompt caching: cacheReadTokens counts tokens served from
 * the prefix cache at 0.1× cost, cacheCreationTokens counts tokens
 * written to a new cache entry at 1.25× cost. A stage with many read
 * tokens and few create tokens is benefiting from caching; a stage
 * with only creates never re-used its cached prefix (TTL expired
 * between calls, or something invalidated the prefix).
 */
export type CostSiteBreakdown = Record<
  string,
  {
    totalTokens: number;
    totalCostUSD: number;
    calls: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    /** USD saved by caching on this site vs a no-cache hypothetical. */
    cacheSavingsUSD?: number;
  }
>;

export interface CostBreakdown {
  totalTokens: number;
  totalCostUSD: number;
  llmCalls: number;
  /** Total tokens served from provider prompt cache this run. */
  cacheReadTokens?: number;
  /** Total tokens written to provider prompt cache this run. */
  cacheCreationTokens?: number;
  /** USD saved by caching vs a no-cache run. Negative early (cache
   *  fill), positive once reads amortize the creation overhead. */
  cacheSavingsUSD?: number;
  /** Per-site spend. Present when the server reports it (always in current version). */
  breakdown?: CostSiteBreakdown;
}

export interface GameState {
  a: SideState;
  b: SideState;
  leaderMap: Record<string, Side>;
  turn: number;
  year: number;
  maxTurns: number;
  seed: number;
  isRunning: boolean;
  isComplete: boolean;
  cost: CostBreakdown;
  /** Per-leader cost split for the StatsBar split display. */
  costA: CostBreakdown;
  costB: CostBreakdown;
}

function emptySide(): SideState {
  return {
    leader: null, colony: null, prevColony: null, crisis: null,
    events: [], popHistory: [], moraleHistory: [],
    deaths: 0, tools: 0, citations: 0, decisions: 0,
    pendingDecision: '', pendingRationale: '', pendingPolicies: [],
    outcome: null, agentSnapshots: [], currentEvents: [],
  };
}

export function useGameState(sseEvents: SimEvent[], isComplete: boolean): GameState {
  return useMemo(() => {
    const state: GameState = {
      a: emptySide(), b: emptySide(),
      leaderMap: {}, turn: 0, year: 0, maxTurns: 6, seed: 950,
      isRunning: false, isComplete,
      cost: { totalTokens: 0, totalCostUSD: 0, llmCalls: 0 },
      costA: { totalTokens: 0, totalCostUSD: 0, llmCalls: 0 },
      costB: { totalTokens: 0, totalCostUSD: 0, llmCalls: 0 },
    };

    const assignSide = (leader: string): Side | null => {
      if (state.leaderMap[leader]) return state.leaderMap[leader];
      const assigned = Object.keys(state.leaderMap).length;
      if (assigned === 0) { state.leaderMap[leader] = 'a'; return 'a'; }
      if (assigned === 1) { state.leaderMap[leader] = 'b'; return 'b'; }
      return null;
    };

    for (let i = 0; i < sseEvents.length; i++) {
      const evt = sseEvents[i];
      const side = evt.leader ? assignSide(evt.leader) : null;
      const dd = evt.data || {};

      // Track per-leader cost. Each event payload carries the leader's
      // cumulative _cost so far (totalTokens, totalCostUSD, llmCalls,
      // breakdown). We keep them split on costA/costB and recompute the
      // combined total plus a merged breakdown.
      const evtCost = dd._cost as {
        totalTokens?: number;
        totalCostUSD?: number;
        llmCalls?: number;
        cacheReadTokens?: number;
        cacheCreationTokens?: number;
        cacheSavingsUSD?: number;
        breakdown?: CostSiteBreakdown;
      } | undefined;
      if (evtCost && side) {
        const leaderBreakdown: CostBreakdown = {
          totalTokens: evtCost.totalTokens ?? 0,
          totalCostUSD: evtCost.totalCostUSD ?? 0,
          llmCalls: evtCost.llmCalls ?? 0,
          cacheReadTokens: evtCost.cacheReadTokens ?? 0,
          cacheCreationTokens: evtCost.cacheCreationTokens ?? 0,
          cacheSavingsUSD: evtCost.cacheSavingsUSD ?? 0,
          breakdown: evtCost.breakdown,
        };
        if (side === 'a') state.costA = leaderBreakdown;
        else state.costB = leaderBreakdown;

        // Combine the two leaders' per-site breakdowns into one rollup
        // for the dashboard StatsBar modal. Each leader has its own
        // cumulative breakdown; summing element-wise gives the total
        // per pipeline stage across both runs.
        const mergedBreakdown: CostSiteBreakdown = {};
        for (const src of [state.costA.breakdown, state.costB.breakdown]) {
          if (!src) continue;
          for (const [siteKey, bucket] of Object.entries(src)) {
            const existing = mergedBreakdown[siteKey] ?? {
              totalTokens: 0, totalCostUSD: 0, calls: 0,
              cacheReadTokens: 0, cacheCreationTokens: 0, cacheSavingsUSD: 0,
            };
            mergedBreakdown[siteKey] = {
              totalTokens: existing.totalTokens + (bucket?.totalTokens ?? 0),
              totalCostUSD: Math.round((existing.totalCostUSD + (bucket?.totalCostUSD ?? 0)) * 10000) / 10000,
              calls: existing.calls + (bucket?.calls ?? 0),
              cacheReadTokens: (existing.cacheReadTokens ?? 0) + (bucket?.cacheReadTokens ?? 0),
              cacheCreationTokens: (existing.cacheCreationTokens ?? 0) + (bucket?.cacheCreationTokens ?? 0),
              cacheSavingsUSD: Math.round(((existing.cacheSavingsUSD ?? 0) + (bucket?.cacheSavingsUSD ?? 0)) * 10000) / 10000,
            };
          }
        }

        state.cost = {
          totalTokens: state.costA.totalTokens + state.costB.totalTokens,
          totalCostUSD: Math.round((state.costA.totalCostUSD + state.costB.totalCostUSD) * 10000) / 10000,
          llmCalls: state.costA.llmCalls + state.costB.llmCalls,
          cacheReadTokens: (state.costA.cacheReadTokens ?? 0) + (state.costB.cacheReadTokens ?? 0),
          cacheCreationTokens: (state.costA.cacheCreationTokens ?? 0) + (state.costB.cacheCreationTokens ?? 0),
          cacheSavingsUSD: Math.round(((state.costA.cacheSavingsUSD ?? 0) + (state.costB.cacheSavingsUSD ?? 0)) * 10000) / 10000,
          breakdown: Object.keys(mergedBreakdown).length > 0 ? mergedBreakdown : undefined,
        };
      }

      // Handle status events (no side)
      if (evt.type === 'status') {
        if (dd.maxTurns) state.maxTurns = dd.maxTurns as number;
        if (dd.phase === 'parallel' && Array.isArray(dd.leaders)) {
          const leaders = dd.leaders as LeaderInfo[];
          if (leaders[0]) state.a.leader = leaders[0];
          if (leaders[1]) state.b.leader = leaders[1];
          state.isRunning = true;
        }
        continue;
      }

      if (!side) continue;
      const s = state[side];

      const processed: ProcessedEvent = {
        id: `${i}-${evt.type}`,
        type: evt.type,
        turn: dd.turn as number | undefined,
        year: dd.year as number | undefined,
        data: dd,
      };

      switch (evt.type) {
        case 'event_start': {
          const info = {
            eventIndex: Number(dd.eventIndex ?? 0),
            totalEvents: Number(dd.totalEvents ?? 1),
            title: String(dd.title || ''),
            category: String(dd.category || ''),
          };
          s.currentEvents.push(info);
          if (info.totalEvents > 1) {
            s.crisis = {
              turn: dd.turn as number,
              year: dd.year as number,
              title: `${info.eventIndex + 1}/${info.totalEvents}: ${info.title}`,
              description: dd.description as string || '',
              category: info.category,
              emergent: dd.emergent as boolean || false,
              turnSummary: dd.turnSummary as string || '',
            };
          }
          s.events.push(processed);
          break;
        }

        case 'turn_start':
          s.currentEvents = [];
          if (dd.turn) state.turn = dd.turn as number;
          if (dd.year) state.year = dd.year as number;
          if (dd.title && dd.title !== 'Director generating...') {
            s.crisis = {
              turn: dd.turn as number,
              year: dd.year as number,
              title: dd.title as string,
              description: dd.crisis as string || '',
              category: dd.category as string || '',
              emergent: dd.emergent as boolean || false,
              turnSummary: dd.turnSummary as string || '',
            };
          }
          if (dd.colony) {
            s.prevColony = s.colony ? { ...s.colony } : null;
            s.colony = dd.colony as ColonyState;
            s.popHistory.push((dd.colony as ColonyState).population || 0);
            s.moraleHistory.push(Math.round(((dd.colony as ColonyState).morale || 0) * 100));
          }
          if (dd.deaths) s.deaths += Number(dd.deaths) || 0;
          s.events.push(processed);
          break;

        case 'promotion':
          s.events.push(processed);
          break;

        case 'dept_start':
          s.events.push(processed);
          break;

        case 'forge_attempt':
          // Real-time forge event from the orchestrator. Push into the
          // event stream so EventCard can render an inline FORGED card
          // the moment a tool is invented (not just at dept_done summary).
          // Don't increment s.tools here — that's incremented from the
          // dept_done summary which is the deduplicated authoritative
          // count (forge_attempt fires per call; same tool reused = same
          // name appears once in dept_done forgedTools).
          s.events.push(processed);
          break;

        case 'dept_done': {
          const tools = Array.isArray(dd.forgedTools) ? dd.forgedTools.filter((t: any) => t?.name && t.name !== 'unnamed') : [];
          s.tools += tools.length;
          s.citations += Number(dd.citations) || 0;
          s.events.push({ ...processed, data: { ...dd, _filteredTools: tools } });
          break;
        }

        case 'commander_deciding':
          s.events.push(processed);
          break;

        case 'commander_decided':
          s.pendingDecision = dd.decision as string || '';
          s.pendingRationale = dd.rationale as string || '';
          s.pendingPolicies = (dd.selectedPolicies as string[]) || [];
          break;

        case 'outcome': {
          const outcome = dd.outcome as string || '';
          s.outcome = outcome;
          s.decisions++;
          s.events.push({
            ...processed,
            data: {
              ...dd,
              _decision: s.pendingDecision,
              _rationale: s.pendingRationale,
              _policies: s.pendingPolicies,
            },
          });
          break;
        }

        case 'drift':
          s.events.push(processed);
          break;

        case 'agent_reactions':
          s.events.push(processed);
          break;

        case 'bulletin':
          s.events.push(processed);
          break;

        case 'colony_snapshot':
          s.agentSnapshots.push((dd.agents as AgentSnapshot[]) || []);
          s.events.push(processed);
          break;

        case 'turn_done':
          if (dd.colony) {
            s.prevColony = s.colony ? { ...s.colony } : null;
            s.colony = dd.colony as ColonyState;
          }
          s.events.push(processed);
          break;
      }
    }

    return state;
  }, [sseEvents, isComplete]);
}
