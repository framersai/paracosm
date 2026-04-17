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
  const jsonStr = extractJson(text);
  if (jsonStr) {
    try {
      const raw = JSON.parse(jsonStr);
      if (raw.decision || raw.selectedOptionId) {
        return { ...emptyDecision(depts), ...raw };
      }
    } catch { /* fall through */ }
  }
  return { ...emptyDecision(depts), decision: text.slice(0, 500), rationale: text };
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
