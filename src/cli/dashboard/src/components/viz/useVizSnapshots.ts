import { useMemo } from 'react';
import type { GameState, Side } from '../../hooks/useGameState';
import type { TurnSnapshot, CellSnapshot } from './viz-types';

/**
 * Extract per-turn TurnSnapshot arrays from GameState for each side.
 * Returns { a: TurnSnapshot[], b: TurnSnapshot[] }.
 */
export function useVizSnapshots(state: GameState): { a: TurnSnapshot[]; b: TurnSnapshot[] } {
  return useMemo(() => {
    const result: Record<Side, TurnSnapshot[]> = { a: [], b: [] };

    for (const side of ['a', 'b'] as Side[]) {
      const s = state[side];

      for (let i = 0; i < s.agentSnapshots.length; i++) {
        const agents = s.agentSnapshots[i];
        const turnEvent = s.events.find(
          e => e.type === 'colony_snapshot' && e.data?.turn === i + 1
        );
        const dd = turnEvent?.data || {};

        const cells: CellSnapshot[] = agents.map(a => ({
          agentId: a.agentId,
          name: a.name,
          department: a.department,
          role: a.role,
          rank: a.rank,
          alive: a.alive,
          marsborn: a.marsborn,
          psychScore: a.psychScore,
          partnerId: a.partnerId,
          childrenIds: a.childrenIds || [],
          featured: a.featured,
          mood: a.mood,
          shortTermMemory: a.shortTermMemory || [],
        }));

        result[side].push({
          turn: (dd.turn as number) || i + 1,
          year: (dd.year as number) || 0,
          cells,
          population: (dd.population as number) || cells.filter(c => c.alive).length,
          morale: (dd.morale as number) || 0,
          foodReserve: (dd.foodReserve as number) || 0,
          deaths: (dd.deaths as number) || 0,
          births: (dd.births as number) || 0,
        });
      }
    }

    return result;
  }, [state]);
}
