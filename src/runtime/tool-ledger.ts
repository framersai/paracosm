/**
 * Forged-tool ledger types + prompt-block builder.
 *
 * The orchestrator keeps a per-tool history of every invocation across
 * a run so the dashboard can show WHEN a tool was first forged, WHICH
 * department invoked it, WHAT each invocation produced, and whether
 * each appearance was a fresh forge, a re-forge, or a pure citation.
 *
 * These shapes + the "ALREADY-FORGED TOOLS" context block builder
 * extracted here are pure data structures and a pure text generator —
 * no IO, no side effects — so they move cleanly out of the
 * turn-loop soup.
 *
 * @module paracosm/runtime/tool-ledger
 */

/** A single invocation of a forged tool, appended to the tool's history. */
export interface ToolUseRecord {
  turn: number;
  year: number;
  eventIndex: number;
  eventTitle: string;
  department: string;
  /** What the tool produced this invocation (string-truncated to 400). */
  output: string | null;
  /** True when the LLM re-invoked forge_tool (vs cited an existing tool). */
  isReforge: boolean;
  /** Set when isReforge=true and the judge rejected the new attempt. */
  rejected: boolean;
  /** Judge confidence on this invocation (only meaningful for forge calls). */
  confidence?: number;
}

/** Per-tool ledger entry. First-forge metadata + full history. */
export interface ForgedToolLedgerEntry {
  firstForgedTurn: number;
  firstForgedDepartment: string;
  firstForgedEventIndex: number;
  firstForgedEventTitle: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  /** Append-only history of every invocation across the run. */
  history: ToolUseRecord[];
}

/** Shorthand alias used across the orchestrator's closures. */
export type ForgedLedger = Map<string, ForgedToolLedgerEntry>;

/**
 * Build the ALREADY-FORGED TOOLS block appended to every department's
 * per-turn context. Tells the LLM which tools are available to reuse,
 * shows each tool's last approved output so the LLM can cite a number
 * without re-forging, and enforces a hard rule against re-forging by
 * the same name.
 *
 * Only approved (non-rejected) tools appear. Capped at 20 most recent
 * so the block stays under ~500 tokens even in long runs.
 *
 * Returns an empty string when no tools have been approved yet, so
 * callers can concatenate unconditionally without an empty section
 * appearing in turn 1 prompts.
 */
export function buildAvailableToolsBlock(ledger: ForgedLedger): string {
  type Entry = { name: string; dept: string; title: string; output: string | null };
  const approved: Entry[] = [];
  for (const [name, entry] of ledger.entries()) {
    const lastApproved = [...entry.history].reverse().find(h => !h.rejected);
    if (!lastApproved) continue;
    approved.push({
      name,
      dept: entry.firstForgedDepartment,
      title: entry.firstForgedEventTitle || name,
      // Truncate aggressively so the block stays under a few hundred
      // tokens even with 20 tools. 180 chars covers a compact JSON
      // like {"score":42,"warnings":[]} which is what the LLM cites.
      output: lastApproved.output ? lastApproved.output.slice(0, 180) : null,
    });
  }
  if (approved.length === 0) return '';
  const lines = approved.slice(-20).reverse().map(t => {
    const head = `- ${t.name} (${t.dept}): ${t.title}`;
    return t.output ? `${head}\n  last output: ${t.output}` : head;
  }).join('\n');
  return `\n\nALREADY-FORGED TOOLS IN THIS SESSION:\n${lines}\n\nHARD RULE — how to reuse:\n- Preferred: call the tool for real with fresh inputs via call_forged_tool({"name":"<tool_name>","args":{...}}). This produces a new output using the approved, judge-reviewed code. Then cite the tool in "forgedToolsUsed" with the new output.\n- If the analysis is essentially unchanged from last invocation, cite the tool name in "forgedToolsUsed" and reference the last output from the list above in your summary — no tool call needed.\n- Do NOT call forge_tool with a name from this list. Re-forging costs −0.06 outcome bonus and −0.015 morale. Only forge a NEW tool when NO existing one applies. Each reuse (via call_forged_tool or citation) is +0.02 outcome bonus.\n`;
}
