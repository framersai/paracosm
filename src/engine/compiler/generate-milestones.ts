/**
 * Generate milestone crises (turn 1 founding + final turn assessment) from scenario JSON via LLM.
 */

import type { MilestoneCrisisDef } from '../types.js';
import type { GenerateTextFn } from './types.js';

function buildPrompt(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const depts = (scenarioJson.departments ?? []).map((d: any) => d.id).join(', ');

  return `You are generating milestone crises for a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'}
SETTLEMENT TYPE: ${labels.settlementNoun ?? 'settlement'}
POPULATION NOUN: ${labels.populationNoun ?? 'members'}
DEPARTMENTS: ${depts}
DEFAULT TURNS: ${scenarioJson.setup?.defaultTurns ?? 12}

Generate TWO milestone crises as a JSON array:

1. FOUNDING CRISIS (turn 1): The ${labels.populationNoun} arrive at the ${labels.settlementNoun}. They must make their first major decision (site selection, initial strategy, resource allocation). Two options: safe/conservative vs risky/ambitious. Include domain-specific science and real-world references.

2. LEGACY ASSESSMENT (final turn): The ${labels.settlementNoun} must submit a comprehensive status report. Asks the commander to evaluate population, infrastructure, self-sufficiency, science, culture, tools built, and legacy. Two options: honest assessment vs ambitious projection.

Each milestone must have this exact JSON shape:
{
  "title": "string",
  "crisis": "string (detailed description with specific domain references)",
  "options": [
    { "id": "option_a", "label": "string", "description": "string", "isRisky": false },
    { "id": "option_b", "label": "string", "description": "string", "isRisky": true }
  ],
  "riskyOptionId": "option_b",
  "riskSuccessProbability": 0.5-0.7,
  "category": "string",
  "researchKeywords": ["string"],
  "relevantDepartments": ["string"],
  "turnSummary": "string"
}

Return ONLY a JSON array of exactly 2 objects: [founding, legacy]. No markdown fences.`;
}

export function parseMilestones(text: string): [MilestoneCrisisDef, MilestoneCrisisDef] | null {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

  try {
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr) || arr.length < 2) return null;
    const [founding, legacy] = arr;
    if (!founding.title || !founding.options || !legacy.title || !legacy.options) return null;
    return [founding, legacy];
  } catch {
    return null;
  }
}

export async function generateMilestones(
  scenarioJson: Record<string, any>,
  generateText: GenerateTextFn,
  maxRetries = 3,
): Promise<{ hook: (turn: number, maxTurns: number) => MilestoneCrisisDef | null; source: string }> {
  let lastError = '';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const retryHint = attempt > 0 ? `\n\nPrevious attempt failed: ${lastError}. Fix the issue and return valid JSON.` : '';
    const text = await generateText(buildPrompt(scenarioJson) + retryHint);
    const result = parseMilestones(text);

    if (!result) {
      lastError = 'Could not parse milestones JSON array';
      continue;
    }

    const [founding, legacy] = result;

    return {
      hook: (turn: number, maxTurns: number) => {
        if (turn === 1) return founding;
        if (turn === maxTurns) return legacy;
        return null;
      },
      source: JSON.stringify(result, null, 2),
    };
  }

  // Fallback: generic milestones
  const labels = scenarioJson.labels ?? {};
  const fallbackFounding: MilestoneCrisisDef = {
    title: 'Founding',
    crisis: `The ${labels.populationNoun ?? 'members'} have arrived at the ${labels.settlementNoun ?? 'settlement'}. Choose your initial strategy.`,
    options: [
      { id: 'option_a', label: 'Conservative Start', description: 'Establish a safe, stable foundation', isRisky: false },
      { id: 'option_b', label: 'Ambitious Start', description: 'Push for rapid expansion with higher risk', isRisky: true },
    ],
    riskyOptionId: 'option_b',
    riskSuccessProbability: 0.6,
    category: 'infrastructure',
    researchKeywords: [labels.settlementNoun ?? 'settlement'],
    relevantDepartments: (scenarioJson.departments ?? []).slice(0, 2).map((d: any) => d.id),
    turnSummary: `The ${labels.settlementNoun ?? 'settlement'} is founded. First decisions shape everything.`,
  };

  const fallbackLegacy: MilestoneCrisisDef = {
    title: 'Legacy Assessment',
    crisis: `Submit a comprehensive status report on the ${labels.settlementNoun ?? 'settlement'}.`,
    options: [
      { id: 'option_a', label: 'Honest Assessment', description: 'Report factually, including failures', isRisky: false },
      { id: 'option_b', label: 'Ambitious Projection', description: 'Emphasize achievements, propose bold vision', isRisky: true },
    ],
    riskyOptionId: 'option_b',
    riskSuccessProbability: 0.5,
    category: 'political',
    researchKeywords: [],
    relevantDepartments: (scenarioJson.departments ?? []).slice(0, 3).map((d: any) => d.id),
    turnSummary: 'Time for a comprehensive assessment.',
  };

  console.warn('[compiler] Milestone generation failed. Using fallback milestones.');
  return {
    hook: (turn, maxTurns) => {
      if (turn === 1) return fallbackFounding;
      if (turn === maxTurns) return fallbackLegacy;
      return null;
    },
    source: JSON.stringify([fallbackFounding, fallbackLegacy], null, 2),
  };
}
