/**
 * Generate Crisis Director system instructions from scenario JSON via LLM.
 */

import type { GenerateTextFn } from './types.js';

function buildPrompt(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const depts = (scenarioJson.departments ?? []).map((d: any) => `- ${d.id}: ${d.label} (${d.role})`).join('\n');
  const effects = scenarioJson.effects ?? {};
  const categories = typeof effects === 'object' && !Array.isArray(effects)
    ? Object.keys(effects)
    : (effects as any[]).flatMap?.((e: any) => Object.keys(e.categoryDefaults ?? {})) ?? [];

  return `You are generating system instructions for a Crisis Director agent in a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'}
SETTLEMENT TYPE: ${labels.settlementNoun ?? 'settlement'}
POPULATION NOUN: ${labels.populationNoun ?? 'members'}
DEPARTMENTS:
${depts}
CRISIS CATEGORIES: ${categories.join(', ')}

Generate complete Crisis Director system instructions. The instructions must:
1. Explain the Director's role: observe ${labels.settlementNoun} state and generate crises
2. List rules for crisis generation (exactly 2-3 options per crisis, one must be risky, reference real science/domain knowledge, escalate from prior decisions, calibrate to ${labels.settlementNoun} state)
3. List ALL crisis categories with brief descriptions relevant to this scenario's domain
4. List ALL available departments by exact ID name (use ONLY the department IDs listed above)
5. Specify the JSON output format: {"title","crisis","options":[{"id","label","description","isRisky"}],"riskyOptionId","riskSuccessProbability","category","researchKeywords","relevantDepartments","turnSummary"}

Return ONLY the instructions text. No markdown fences. No code. Just the system prompt text the Director agent will receive.`;
}

export async function generateDirectorInstructions(
  scenarioJson: Record<string, any>,
  generateText: GenerateTextFn,
  maxRetries = 3,
): Promise<{ hook: () => string; source: string }> {
  let lastError = '';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const retryHint = attempt > 0 ? `\n\nPrevious attempt failed: ${lastError}. Fix the issue.` : '';
    const text = await generateText(buildPrompt(scenarioJson) + retryHint);
    const cleaned = text.trim().replace(/^```(?:text)?\n?/i, '').replace(/\n?```$/i, '').trim();

    if (cleaned.length < 100) {
      lastError = 'Instructions too short';
      continue;
    }

    // Verify it mentions at least some departments
    const deptIds = (scenarioJson.departments ?? []).map((d: any) => d.id);
    const mentioned = deptIds.filter((id: string) => cleaned.toLowerCase().includes(id.toLowerCase()));
    if (mentioned.length < Math.min(2, deptIds.length)) {
      lastError = `Only mentions ${mentioned.length} of ${deptIds.length} departments`;
      continue;
    }

    return {
      hook: () => cleaned,
      source: cleaned,
    };
  }

  // Fallback: generic instructions
  const deptList = (scenarioJson.departments ?? []).map((d: any) => d.id).join(', ');
  const fallback = `You are the Crisis Director for a ${scenarioJson.labels?.settlementNoun ?? 'settlement'} simulation. Generate crises with 2-3 options (one risky). Available departments: ${deptList}. Return JSON with title, crisis, options, riskyOptionId, riskSuccessProbability, category, researchKeywords, relevantDepartments, turnSummary.`;
  console.warn('[compiler] Director instructions generation failed. Using fallback.');
  return { hook: () => fallback, source: fallback };
}
