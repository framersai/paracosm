/**
 * JSON-forgiving parsers + default report/decision constructors extracted
 * from orchestrator.ts.
 *
 * The LLM regularly returns text with preamble, code fences, or trailing
 * notes around the JSON body. These helpers extract the JSON, hydrate a
 * typed DepartmentReport / CommanderDecision with sensible defaults,
 * and clean up the summary text so UI strings read as prose rather than
 * as a dump of markdown bullets.
 *
 * All pure — no IO, no LLM calls, no global state. Safe to test directly
 * with string inputs.
 *
 * @module paracosm/runtime/parsers
 */

import { extractJson } from '@framers/agentos';
import type { Department } from '../engine/core/state.js';
import type { DepartmentReport, CommanderDecision } from './contracts.js';
import type { PolicyEffect } from '../engine/core/kernel.js';

/**
 * Turn a machine-readable tool name into something UI-friendly.
 * Strips `_v2` / `_v3` suffixes so reuses of the same concept
 * collapse visually, then title-cases.
 */
export function humanizeToolName(name: string): string {
  return name.replace(/_v\d+$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Aggressively strip LLM summary boilerplate: leading markdown headings,
 * bold markers, list bullets, numbered prefixes, and the stock LLM
 * opening phrases ("Based on the analysis...", "In summary..."). Returns
 * the first 1–2 sentences or a 150-char truncation when no punctuation
 * is found.
 *
 * Returns an empty string when the input is pure JSON (starts with { or [)
 * so callers can fall through to richer alternatives.
 */
export function cleanSummary(raw: string): string {
  let s = raw
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^(Decision|Recommendation|Summary|Analysis|Conclusion|I recommend|My analysis|Based on|After careful|Given the|Looking at|The data|In conclusion|Therefore|Overall|To summarize|As a result|In summary|Considering|Upon review|Having analyzed)\s*:?\s*/gim, '')
    .replace(/^(choose|select|go with|opt for|approve|we should|I suggest|I propose)\s+/i, '')
    .replace(/^Option [A-C][.:,]\s*/i, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (s.startsWith('{') || s.startsWith('[')) return '';

  const sentences = s.match(/[^.!?]+[.!?]/g) || [];
  const result = sentences.slice(0, 2).join(' ').trim();
  return result || s.slice(0, 150);
}

/**
 * Synthesize a clean one-sentence summary from whatever the LLM
 * returned in its JSON payload. Prefers `summary` → `decision` →
 * `recommendation`. Falls back to joined recommendedActions, then to
 * joined risk descriptions, then to a generic "department analysis
 * complete" stub so the UI always has something non-empty to show.
 */
export function buildReadableSummary(raw: any, dept: Department): string {
  const summaryText = raw.summary || raw.decision || raw.recommendation || '';
  const cleaned = cleanSummary(summaryText);
  if (cleaned && cleaned.length >= 20) return cleaned;

  const recs = (raw.recommendedActions || []).slice(0, 2).join('. ');
  if (recs) return cleanSummary(recs);

  const risks = (raw.risks || []).map((r: any) => r.description).slice(0, 2).join('. ');
  if (risks) return cleanSummary(risks);

  return `${dept.charAt(0).toUpperCase() + dept.slice(1)} department analysis complete.`;
}

/**
 * Parse a department's LLM response into a typed DepartmentReport.
 * JSON preferred; falls back to markdown-citation scraping when the
 * model returns prose. Always returns a non-empty object — never
 * throws, never returns null.
 */
export function parseDeptReport(text: string, dept: Department): DepartmentReport {
  const jsonStr = extractJson(text);
  if (jsonStr) {
    try {
      const raw = JSON.parse(jsonStr);
      if (raw.department || raw.summary || raw.risks || raw.recommendedActions) {
        const report = { ...emptyReport(dept), ...raw, department: dept };
        report.summary = buildReadableSummary(raw, dept);
        if (typeof report.confidence !== 'number' || report.confidence < 0.1) report.confidence = 0.8;
        return report;
      }
    } catch { /* try next block */ }
  }

  const cites: DepartmentReport['citations'] = [];
  let m; const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((m = re.exec(text))) if (m[2].startsWith('http')) cites.push({ text: m[1], url: m[2], context: m[1] });
  return { ...emptyReport(dept), summary: cleanSummary(text), citations: cites };
}

/**
 * Parse a commander's LLM response into a typed CommanderDecision.
 * JSON preferred; falls back to treating the entire text as a free-
 * form decision + rationale when no JSON body is recoverable.
 */
export function parseCmdDecision(text: string, depts: Department[]): CommanderDecision {
  // Strip any <thinking>...</thinking> reasoning block before looking for
  // the JSON. The commander prompt now asks the model to reason step by
  // step before emitting the decision JSON, so braces inside the
  // reasoning prose (e.g. "effect id: {resource_shift}") would otherwise
  // confuse extractJson's greedy brace match.
  const stripped = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  const jsonStr = extractJson(stripped);
  if (jsonStr) {
    try {
      const raw = JSON.parse(jsonStr);
      if (raw.decision || raw.selectedOptionId) {
        // Coerce rationale / decision to strings — models occasionally
        // return them as arrays, which the UI then rendered as
        // "[object Object]" or concatenated-with-commas prose.
        const out: CommanderDecision = { ...emptyDecision(depts), ...raw };
        if (Array.isArray(out.decision)) out.decision = (out.decision as unknown[]).filter(s => typeof s === 'string').join(' ');
        if (Array.isArray(out.rationale)) out.rationale = (out.rationale as unknown[]).filter(s => typeof s === 'string').join('\n\n');
        if (typeof out.decision !== 'string') out.decision = String(out.decision ?? '');
        if (typeof out.rationale !== 'string') out.rationale = String(out.rationale ?? '');
        return out;
      }
    } catch { /* fall through to salvage path */ }
  }
  // Salvage: parse failed (unescaped quote, truncation, bad escape).
  // Pull the decision + rationale + option id out with targeted regex
  // so we never leak raw JSON braces into the UI as the decision text.
  const out = emptyDecision(depts);
  const decisionField = stripped.match(/"decision"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const optionField = stripped.match(/"selectedOptionId"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const rationaleStringField = stripped.match(/"rationale"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const rationaleArrayField = stripped.match(/"rationale"\s*:\s*\[([\s\S]*?)\]/);
  if (decisionField) out.decision = decisionField[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
  if (optionField) (out as unknown as Record<string, unknown>).selectedOptionId = optionField[1];
  if (rationaleStringField) {
    out.rationale = rationaleStringField[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
  } else if (rationaleArrayField) {
    const strings = rationaleArrayField[1].match(/"((?:\\.|[^"\\])*)"/g) ?? [];
    out.rationale = strings.map(s => s.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n')).join('\n\n');
  }
  // Last resort: if we still have nothing useful, strip JSON-looking
  // chunks from the text so the UI shows prose, not braces.
  if (!out.decision) {
    const prose = text
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .replace(/\{[\s\S]*\}/g, '')
      .trim();
    out.decision = prose.slice(0, 300) || 'Commander response could not be parsed cleanly; see Reports for the full text.';
  }
  if (!out.rationale) {
    out.rationale = out.decision;
  }
  return out;
}

/** Empty DepartmentReport skeleton. Every field a typed array/object so spreads are safe. */
export function emptyReport(d: Department): DepartmentReport {
  return { department: d, summary: '', citations: [], risks: [], opportunities: [], recommendedActions: [], proposedPatches: {}, forgedToolsUsed: [], featuredAgentUpdates: [], confidence: 0.7, openQuestions: [], recommendedEffects: [] };
}

/** Empty CommanderDecision skeleton. `departmentsConsulted` seeded from the active dept list. */
export function emptyDecision(d: Department[]): CommanderDecision {
  return { decision: '', rationale: '', departmentsConsulted: d, selectedPolicies: [], rejectedPolicies: [], expectedTradeoffs: [], watchMetricsNextTurn: [] };
}

/**
 * Turn a commander's decision + the dept reports into a PolicyEffect
 * the kernel can apply. Combines legacy `proposedPatches` from reports
 * (backward compat) with typed `recommendedEffects` the commander
 * selected by id.
 */
export function decisionToPolicy(
  decision: CommanderDecision,
  reports: DepartmentReport[],
  turn: number,
  year: number,
): PolicyEffect {
  const patches: PolicyEffect['patches'] = {};

  // Apply legacy proposedPatches (backward compat).
  for (const r of reports) {
    if (r.proposedPatches.colony) patches.colony = { ...patches.colony, ...r.proposedPatches.colony };
    if (r.proposedPatches.politics) patches.politics = { ...patches.politics, ...r.proposedPatches.politics };
    if (r.proposedPatches.agentUpdates) patches.agentUpdates = [...(patches.agentUpdates || []), ...r.proposedPatches.agentUpdates];
  }

  // Apply typed effects selected by commander.
  if (decision.selectedEffectIds?.length) {
    const allEffects = reports.flatMap(r => r.recommendedEffects || []);
    for (const effectId of decision.selectedEffectIds) {
      const effect = allEffects.find(e => e.id === effectId);
      if (!effect) continue;
      if (effect.colonyDelta) {
        patches.colony = patches.colony || {};
        for (const [key, delta] of Object.entries(effect.colonyDelta)) {
          const current = (patches.colony as any)[key] ?? 0;
          (patches.colony as any)[key] = current + (delta as number);
        }
      }
      if (effect.politicsDelta) {
        patches.politics = patches.politics || {};
        for (const [key, delta] of Object.entries(effect.politicsDelta)) {
          const current = (patches.politics as any)[key] ?? 0;
          (patches.politics as any)[key] = current + (delta as number);
        }
      }
    }
  }

  return {
    description: decision.decision,
    patches,
    events: [{ turn, year, type: 'decision', description: decision.decision.slice(0, 200), data: { policies: decision.selectedPolicies } }],
  };
}
