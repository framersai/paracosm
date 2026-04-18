/**
 * Generate Event Director system instructions via generateValidatedProse.
 * The director is the agent that emits per-turn events grounded in
 * current sim state; this hook produces the scenario-specific system
 * prompt the director agent runs under.
 *
 * @module paracosm/engine/compiler/generate-director
 */
import type { GenerateTextFn } from './types.js';
import type { CompilerTelemetry } from './telemetry.js';
import { generateValidatedProse } from './llm-invocations/generateValidatedProse.js';

function buildSystemBlock(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const depts = (scenarioJson.departments ?? []).map((d: any) => `- ${d.id}: ${d.label} (${d.role})`).join('\n');
  const effects = scenarioJson.effects ?? {};
  const categories = typeof effects === 'object' && !Array.isArray(effects)
    ? Object.keys(effects)
    : (effects as any[]).flatMap?.((e: any) => Object.keys(e.categoryDefaults ?? {})) ?? [];
  return `You are generating system instructions for an Event Director agent in a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'}
SETTLEMENT TYPE: ${labels.settlementNoun ?? 'settlement'}
POPULATION NOUN: ${labels.populationNoun ?? 'members'}
DEPARTMENTS:
${depts}
EVENT CATEGORIES: ${categories.join(', ')}

The instructions you produce must:
1. Explain the Director's role: observe ${labels.settlementNoun} state and generate events each turn
2. List rules (2-3 options per event, one risky; reference real science; escalate from prior decisions; calibrate to ${labels.settlementNoun} state)
3. List ALL event categories with brief descriptions relevant to this scenario
4. List ALL available departments by exact ID (use ONLY the department IDs listed above)
5. Specify the JSON output format: {"title","description","options":[{"id","label","description","isRisky"}],"riskyOptionId","riskSuccessProbability","category","researchKeywords","relevantDepartments","turnSummary"}`;
}

const userPrompt = 'Return ONLY the instructions text. No markdown fences. No code. Just the system prompt text the Director agent will receive.';

function buildValidator(scenarioJson: Record<string, any>): (text: string) => { ok: true } | { ok: false; reason: string } {
  const deptIds = (scenarioJson.departments ?? []).map((d: any) => d.id);
  const minMentions = Math.min(2, deptIds.length);
  return (text: string) => {
    if (text.length < 200) return { ok: false, reason: `instructions too short (${text.length} chars, need >= 200)` };
    const mentioned = deptIds.filter((id: string) => text.toLowerCase().includes(id.toLowerCase()));
    if (mentioned.length < minMentions) {
      return { ok: false, reason: `instructions mention only ${mentioned.length} of ${deptIds.length} department IDs (need >= ${minMentions})` };
    }
    return { ok: true };
  };
}

function buildFallback(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const deptList = (scenarioJson.departments ?? []).map((d: any) => d.id).join(', ');
  return `You are the Event Director for a ${labels.settlementNoun ?? 'settlement'} simulation. Your role: observe the state of the ${labels.settlementNoun ?? 'settlement'} each turn and generate one event.

Rules:
1. Each event must have 2-3 options; one MUST be isRisky=true.
2. Ground descriptions in real science and domain references.
3. Escalate from prior turn outcomes. Do not repeat event categories consecutively.
4. Calibrate difficulty to current state (resources, morale, population).
5. Identify relevantDepartments from this fixed list: ${deptList}.

Return JSON with fields: title, description, options[{id,label,description,isRisky}], riskyOptionId, riskSuccessProbability (0.3-0.8), category, researchKeywords, relevantDepartments, turnSummary.`;
}

export interface GenerateDirectorOptions {
  telemetry?: CompilerTelemetry;
}

export async function generateDirectorInstructions(
  scenarioJson: Record<string, any>,
  generateText: GenerateTextFn,
  options: GenerateDirectorOptions = {},
): Promise<{ hook: () => string; source: string; attempts: number; fromFallback: boolean }> {
  const result = await generateValidatedProse({
    hookName: 'director',
    systemCacheable: buildSystemBlock(scenarioJson),
    prompt: userPrompt,
    validate: buildValidator(scenarioJson),
    fallback: buildFallback(scenarioJson),
    // Director is prose instructions (~2000-3000 tokens typical).
    maxTokens: 4000,
    generateText,
    telemetry: options.telemetry,
  });
  return {
    hook: () => result.text,
    source: result.text,
    attempts: result.attempts,
    fromFallback: result.fromFallback,
  };
}
