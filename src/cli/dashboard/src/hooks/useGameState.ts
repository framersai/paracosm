import { useMemo } from 'react';
import type { SimEvent } from './useSSE';

export type Side = 'a' | 'b';

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
}

export interface ProcessedEvent {
  id: string;
  type: string;
  turn?: number;
  year?: number;
  data: Record<string, unknown>;
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
}

function emptySide(): SideState {
  return {
    leader: null, colony: null, prevColony: null, crisis: null,
    events: [], popHistory: [], moraleHistory: [],
    deaths: 0, tools: 0, citations: 0, decisions: 0,
    pendingDecision: '', pendingRationale: '', pendingPolicies: [],
    outcome: null,
  };
}

export function useGameState(sseEvents: SimEvent[], isComplete: boolean): GameState {
  return useMemo(() => {
    const state: GameState = {
      a: emptySide(), b: emptySide(),
      leaderMap: {}, turn: 0, year: 0, maxTurns: 6, seed: 950,
      isRunning: false, isComplete,
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
        case 'turn_start':
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
