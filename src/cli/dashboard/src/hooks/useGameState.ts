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

export interface CostBreakdown {
  totalTokens: number;
  totalCostUSD: number;
  llmCalls: number;
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
      // cumulative _cost so far (totalTokens, totalCostUSD, llmCalls);
      // we keep them split on costA/costB and recompute the combined total.
      const evtCost = dd._cost as { totalTokens?: number; totalCostUSD?: number; llmCalls?: number } | undefined;
      if (evtCost && side) {
        const breakdown = {
          totalTokens: evtCost.totalTokens ?? 0,
          totalCostUSD: evtCost.totalCostUSD ?? 0,
          llmCalls: evtCost.llmCalls ?? 0,
        };
        if (side === 'a') state.costA = breakdown;
        else state.costB = breakdown;
        state.cost = {
          totalTokens: state.costA.totalTokens + state.costB.totalTokens,
          totalCostUSD: Math.round((state.costA.totalCostUSD + state.costB.totalCostUSD) * 10000) / 10000,
          llmCalls: state.costA.llmCalls + state.costB.llmCalls,
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
