import { useMemo, createContext, useContext } from 'react';
import type { GameState, Side } from './useGameState';

export interface ToolUseEvent {
  /** Which side (a/b) used the tool here. */
  side: Side;
  turn: number;
  year: number;
  eventIndex: number;
  eventTitle: string;
  department: string;
  output: string | null;
  /** True if the LLM re-invoked forge_tool here (vs cited an existing one). */
  isReforge: boolean;
  /** Set when a re-forge attempt was rejected by the judge. */
  rejected: boolean;
  confidence?: number;
}

export interface ToolEntry {
  /** Stable index for [N] referencing in EventCards / Toolbox section. */
  n: number;
  name: string;
  description: string;
  mode: string;
  /** First turn this tool was forged in the simulation. */
  firstForgedTurn: number;
  firstForgedDepartment: string;
  /** All departments that referenced this tool across the run. */
  departments: Set<string>;
  /** Sides that referenced it (for divergence display). */
  sides: Set<Side>;
  /** Number of times reused after the first forge (across all events). */
  reuseCount: number;
  /** Of the reuses, how many were re-forge attempts (vs pure citations). */
  reforgeCount: number;
  /** Re-forge attempts that the judge rejected. */
  rejectedReforges: number;
  /** Maximum confidence reported by the LLM judge. */
  confidence: number;
  /** Whether the tool ever passed the judge (any non-failed mention). */
  approved: boolean;
  /** Latest input/output schema seen for this tool. */
  inputSchema?: unknown;
  outputSchema?: unknown;
  /** Latest sample output for this tool. */
  sampleOutput?: string | null;
  inputFields: string[];
  outputFields: string[];
  /** Full per-invocation history. Empty when the orchestrator hasn't
   *  attached one yet (older sim payloads); falls back to the count
   *  fields for display. */
  history: ToolUseEvent[];
}

export interface ToolRegistry {
  /** Look up the global number for a tool by name. Returns 0 if unknown. */
  getNumber: (name: string) => number;
  getEntry: (name: string) => ToolEntry | undefined;
  /** Full list ordered by first-forge turn, then department. */
  list: ToolEntry[];
}

const EMPTY_REGISTRY: ToolRegistry = {
  getNumber: () => 0,
  getEntry: () => undefined,
  list: [],
};

/**
 * Build the per-simulation tool ledger from SSE dept_done events. Tools
 * dedupe by name; the entry remembers when it was first forged, every
 * department that used it, and how many times it was reused.
 *
 * Schema fields (`inputSchema`, `outputSchema`) are populated by the
 * orchestrator from the EmergentToolRegistry when the tool first appears,
 * so the same registry that drives the engine drives the UI provenance.
 */
export function useToolRegistry(state: GameState): ToolRegistry {
  return useMemo(() => {
    const byName = new Map<string, ToolEntry>();
    const list: ToolEntry[] = [];
    let next = 1;

    for (const side of ['a', 'b'] as Side[]) {
      for (const evt of state[side].events) {
        if (evt.type !== 'dept_done') continue;
        const tools = (evt.data?._filteredTools as Array<Record<string, unknown>>) || [];
        const dept = String(evt.data?.department || '');
        for (const t of tools) {
          const name = String(t.name || '').trim();
          if (!name || name === 'unnamed') continue;

          let entry = byName.get(name);
          if (!entry) {
            entry = {
              n: next++,
              name,
              description: String(t.description || name),
              mode: String(t.mode || 'sandbox'),
              firstForgedTurn: typeof t.firstForgedTurn === 'number' ? (t.firstForgedTurn as number) : (evt.turn ?? 0),
              firstForgedDepartment: String(t.firstForgedDepartment || dept),
              departments: new Set(),
              sides: new Set(),
              reuseCount: 0,
              reforgeCount: 0,
              rejectedReforges: 0,
              // Confidence is the judge's verdict on this tool. If the
              // payload didn't include one (older sims), fall back to 0
              // for rejected tools so we never misrepresent failures as
              // borderline-passable. Approved tools without a confidence
              // value default to 0.85 (the historical fallback).
              confidence: typeof t.confidence === 'number'
                ? (t.confidence as number)
                : (t.approved !== false ? 0.85 : 0),
              approved: t.approved !== false,
              inputSchema: t.inputSchema,
              outputSchema: t.outputSchema,
              sampleOutput: typeof t.output === 'string' ? (t.output as string) : null,
              inputFields: Array.isArray(t.inputFields) ? (t.inputFields as string[]) : [],
              outputFields: Array.isArray(t.outputFields) ? (t.outputFields as string[]) : [],
              history: [],
            };
            byName.set(name, entry);
            list.push(entry);
          } else {
            // Reuse: refresh latest output/sample. Reuse count is now
            // derived from history.length below, so don't increment.
            if (typeof t.output === 'string' && t.output) entry.sampleOutput = t.output as string;
            if (typeof t.confidence === 'number' && (t.confidence as number) > entry.confidence) {
              entry.confidence = t.confidence as number;
            }
            // Backfill schema if a later occurrence has it.
            if (!entry.inputSchema && t.inputSchema) entry.inputSchema = t.inputSchema;
            if (!entry.outputSchema && t.outputSchema) entry.outputSchema = t.outputSchema;
          }
          if (dept) entry.departments.add(dept);
          entry.sides.add(side);

          // Authoritative history comes from the orchestrator's
          // forgedLedger and is attached to every dept_done.forgedTools[i]
          // entry. Replace the locally-accumulated history with the
          // server's full history each time we see this tool — the
          // server's history for this tool grows monotonically.
          const serverHistory = (t.history as Array<{
            turn: number; year: number; eventIndex: number; eventTitle: string;
            department: string; output: string | null;
            isReforge: boolean; rejected: boolean; confidence?: number;
          }>) || null;
          if (Array.isArray(serverHistory)) {
            entry.history = serverHistory.map(h => ({ ...h, side }));
            entry.reuseCount = Math.max(0, serverHistory.length - 1);
            entry.reforgeCount = serverHistory.filter(h => h.isReforge).length;
            entry.rejectedReforges = serverHistory.filter(h => h.isReforge && h.rejected).length;
          }
        }
      }
    }

    return {
      getNumber: (name: string) => byName.get(name)?.n ?? 0,
      getEntry: (name: string) => byName.get(name),
      list,
    };
  }, [state]);
}

export const ToolRegistryContext = createContext<ToolRegistry>(EMPTY_REGISTRY);

export function useToolContext(): ToolRegistry {
  return useContext(ToolRegistryContext);
}
