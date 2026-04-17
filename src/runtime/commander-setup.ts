/**
 * Commander bootstrap + turn-0 department-head promotions.
 *
 * Extracted from orchestrator.ts so runSimulation reads as a turn loop
 * rather than a 100-line setup block before the loop even starts.
 * The two responsibilities are:
 *
 *   1. Build a personality-cue line from the leader's HEXACO so the
 *      commander's first message reinforces trait-driven decision
 *      style (high-openness → "favor novel approaches", etc.).
 *   2. Fire the turn-0 promotion LLM call, parse the response, and
 *      ask the kernel to promote the named candidates. A top-candidate
 *      fallback runs for any department the commander skipped so
 *      every dept always has a head going into turn 1.
 *
 * All kernel mutations, SSE emits, and cost-tracker calls flow through
 * callbacks passed in by the orchestrator, so this module stays free
 * of the turn-loop's closure state.
 *
 * @module paracosm/runtime/commander-setup
 */

import type { Department, HexacoProfile } from '../engine/core/state.js';
import type { SimulationKernel } from '../engine/core/kernel.js';
import type { ScenarioPackage, LeaderConfig } from '../engine/types.js';
import type { CallUsage } from './cost-tracker.js';
import { buildPromotionPrompt } from './runtime-helpers.js';

/** Build a short "Your decision style" line from the leader's HEXACO profile. */
export function buildPersonalityCue(h: HexacoProfile): string {
  const cues: string[] = [];
  if (h.openness > 0.7) cues.push('You favor novel, untested approaches over proven ones');
  if (h.openness < 0.3) cues.push('You favor proven protocols over experiments');
  if (h.conscientiousness > 0.7) cues.push('You demand evidence and contingency plans before committing');
  if (h.conscientiousness < 0.3) cues.push('You move fast and accept ambiguity');
  if (h.emotionality > 0.7) cues.push('You weigh human cost heavily — even small mortality risks deter you');
  if (h.emotionality < 0.3) cues.push('You will accept casualties for strategic gain');
  if (h.agreeableness < 0.4) cues.push('You override department consensus when you see a better path');
  if (h.honestyHumility < 0.4) cues.push('You leverage information asymmetries when useful');
  return cues.length ? `Your decision style: ${cues.join('. ')}.` : '';
}

/**
 * Assemble the bootstrap message sent to the commander session right
 * after it's created. Reinforces the leader's personality cue + the
 * selectedOptionId JSON format the downstream turn loop expects.
 */
export function buildCommanderBootstrap(personalityCue: string): string {
  return (
    `You are the colony commander. You receive department reports and make strategic decisions. ` +
    `${personalityCue} ` +
    `Your personality MUST visibly shape your choices — do not converge on a centrist option just because ` +
    `it sounds reasonable. If your traits push you toward the risky option, take it; if they push you toward ` +
    `the safe option, take it. The simulation's value is in how different leaders produce different outcomes ` +
    `from the same starting state. ` +
    `When the crisis includes options with IDs, you MUST include selectedOptionId in your JSON response. ` +
    `Return JSON with selectedOptionId, decision, rationale, selectedPolicies, rejectedPolicies, ` +
    `expectedTradeoffs, watchMetricsNextTurn. Acknowledge.`
  );
}

/**
 * Candidate-summary dependencies needed to run the turn-0 promotion.
 * Kept minimal so the flow doesn't couple to the full kernel surface —
 * tests can stub getCandidates + promoteAgent with ~20 lines of fakes.
 */
export interface PromotionKernel {
  getCandidates: SimulationKernel['getCandidates'];
  promoteAgent: SimulationKernel['promoteAgent'];
  getState: SimulationKernel['getState'];
}

export interface RunPromotionArgs {
  kernel: PromotionKernel;
  scenario: ScenarioPackage;
  leader: LeaderConfig;
  startYear: number;
  /** Commander session `.send(prompt)` — returns whatever AgentOS returns. */
  sendToCommander: (prompt: string) => Promise<{ text: string; usage?: CallUsage }>;
  /** Tagged cost-tracker entry point so the commander bucket gets charged. */
  trackUsage: (result: { usage?: CallUsage }, site?: 'commander') => void;
  /** SSE emit used to publish each successful promotion. */
  emit: (type: 'promotion', data?: Record<string, unknown>) => void;
}

/**
 * Run the turn-0 promotion flow end to end: build the candidate summary
 * from the kernel, send it to the commander session, parse the returned
 * JSON, and tell the kernel to promote each accepted candidate. When
 * the commander skips a department (bad JSON, refused promotion, etc.)
 * the top kernel candidate for that department is promoted as a
 * fallback so no department enters turn 1 without a head.
 */
export async function runDepartmentPromotions(args: RunPromotionArgs): Promise<void> {
  const { kernel, scenario, leader, startYear, sendToCommander, trackUsage, emit } = args;

  console.log('  [Turn 0] Commander evaluating roster for promotions...');
  const promotionDepts: Department[] = scenario.departments.map(d => d.id as Department);
  const roleNames: Record<string, string> = Object.fromEntries(scenario.departments.map(d => [d.id, d.role]));
  const candidateSummaries = promotionDepts.map(dept => {
    const candidates = kernel.getCandidates(dept, 5);
    return `## ${dept.toUpperCase()} — Top 5 Candidates:\n${candidates.map(c => {
      const age = startYear - c.core.birthYear;
      const h = c.hexaco;
      return `- ${c.core.name} (${c.core.id}), age ${age}, spec: ${c.career.specialization}, O:${h.openness.toFixed(2)} C:${h.conscientiousness.toFixed(2)} E:${h.extraversion.toFixed(2)} A:${h.agreeableness.toFixed(2)} Em:${h.emotionality.toFixed(2)} HH:${h.honestyHumility.toFixed(2)}`;
    }).join('\n')}`;
  }).join('\n\n');

  const promoResult = await sendToCommander(buildPromotionPrompt(candidateSummaries));
  trackUsage(promoResult, 'commander');

  const promoMatch = promoResult.text.match(/\{[\s\S]*"promotions"[\s\S]*\}/);
  if (promoMatch) {
    try {
      const pd = JSON.parse(promoMatch[0]);
      for (const p of pd.promotions || []) {
        try {
          kernel.promoteAgent(p.agentId, p.department, p.role, leader.name);
          console.log(`  ✦ ${p.agentId} → ${p.role}: ${p.reason?.slice(0, 80)}`);
          emit('promotion', { agentId: p.agentId, department: p.department, role: p.role, reason: p.reason?.slice(0, 120) });
        } catch (err) { console.log(`  ✦ Promotion failed: ${err}`); }
      }
    } catch (e) { console.warn('  [promotion] Failed to parse promotion JSON:', e); }
  }

  // Fallback: promote the top candidate for any department the commander
  // left unfilled, so turn 1 starts with a full cabinet regardless of
  // how well the LLM followed instructions.
  for (const dept of promotionDepts) {
    const hasLeader = kernel.getState().agents.some(c => c.promotion?.department === dept);
    if (!hasLeader) {
      const top = kernel.getCandidates(dept, 1)[0];
      if (top) {
        kernel.promoteAgent(top.core.id, dept, roleNames[dept] || `Head of ${dept}`, leader.name);
        console.log(`  ✦ [fallback] ${top.core.name} → ${roleNames[dept]}`);
      }
    }
  }
}
