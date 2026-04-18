/**
 * Generate milestone events (turn 1 founding + final turn legacy) from
 * scenario JSON via Zod-validated LLM call.
 *
 * @module paracosm/engine/compiler/generate-milestones
 */
import type { MilestoneEventDef } from '../types.js';
import type { GenerateTextFn } from './types.js';
import type { CompilerTelemetry } from './telemetry.js';
import { MilestonesSchema } from './schemas/milestones.js';
import { generateValidatedObject } from './llm-invocations/generateValidatedObject.js';

function buildSystemBlock(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const depts = (scenarioJson.departments ?? []).map((d: any) => d.id).join(', ');
  return `You are generating milestone events for a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'}
SETTLEMENT TYPE: ${labels.settlementNoun ?? 'settlement'}
POPULATION NOUN: ${labels.populationNoun ?? 'members'}
DEPARTMENTS: ${depts}
DEFAULT TURNS: ${scenarioJson.setup?.defaultTurns ?? 12}

Output shape:
{
  "founding": { Milestone },
  "legacy":   { Milestone }
}

Milestone shape:
{
  "title": string,
  "description": string,
  "crisis": string (OPTIONAL extended narrative; omit unless the scenario genuinely calls for one),
  "options": [
    { "id": "option_a" | "option_b" | "option_c", "label": string, "description": string, "isRisky": boolean }
  ],
  "riskyOptionId": string (MUST reference an option where isRisky=true),
  "riskSuccessProbability": number in [0.3, 0.8],
  "category": string,
  "researchKeywords": string[],
  "relevantDepartments": string[] (use the exact department IDs above),
  "turnSummary": string
}

Rules:
1. "founding" is turn 1. The population_noun arrive at the settlement_noun and must make their first major decision.
2. "legacy" is the final turn. The settlement submits a comprehensive status report.
3. Each milestone needs exactly 2-3 options, one with isRisky=true.
4. riskyOptionId MUST name an option whose isRisky is true.
5. researchKeywords ground in real science and domain knowledge.
6. relevantDepartments reference the scenario's department IDs, not invented labels.`;
}

const userPrompt = 'Generate the founding and legacy milestone events now. Return ONLY valid JSON matching the schema.';

function fallbackMilestones(scenarioJson: Record<string, any>): {
  founding: MilestoneEventDef;
  legacy: MilestoneEventDef;
} {
  const labels = scenarioJson.labels ?? {};
  const founding: MilestoneEventDef = {
    title: 'Founding',
    description: `The ${labels.populationNoun ?? 'members'} have arrived at the ${labels.settlementNoun ?? 'settlement'}. Choose your initial strategy.`,
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
  const legacy: MilestoneEventDef = {
    title: 'Legacy Assessment',
    description: `Submit a comprehensive status report on the ${labels.settlementNoun ?? 'settlement'}.`,
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
  return { founding, legacy };
}

/**
 * Parse a cached milestones source back into the two milestones.
 * Accepts both the v2 object shape `{ founding, legacy }` and the legacy
 * v1 array shape `[founding, legacy]` so old cache entries don't break
 * after the format migration.
 */
export function parseMilestones(text: string): [MilestoneEventDef, MilestoneEventDef] | null {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.founding && parsed.legacy) {
      return [parsed.founding, parsed.legacy];
    }
    if (Array.isArray(parsed) && parsed.length >= 2 && parsed[0]?.title && parsed[1]?.title) {
      return [parsed[0], parsed[1]];
    }
    return null;
  } catch {
    return null;
  }
}

export interface GenerateMilestonesOptions {
  provider: string;
  model: string;
  telemetry?: CompilerTelemetry;
  onUsage?: (r: { usage?: unknown }) => void;
}

export async function generateMilestones(
  scenarioJson: Record<string, any>,
  _generateText: GenerateTextFn,
  opts: GenerateMilestonesOptions,
): Promise<{ hook: (turn: number, maxTurns: number) => MilestoneEventDef | null; source: string; attempts: number; fromFallback: boolean }> {
  const fallback = fallbackMilestones(scenarioJson);
  const result = await generateValidatedObject({
    provider: opts.provider,
    model: opts.model,
    schema: MilestonesSchema,
    schemaName: 'compile:milestones',
    systemCacheable: buildSystemBlock(scenarioJson),
    prompt: userPrompt,
    fallback,
    onUsage: opts.onUsage,
    onValidationFallback: (details) => {
      opts.telemetry?.recordFallback('milestones', {
        rawText: details.rawText,
        reason: (details.err instanceof Error ? details.err.message : String(details.err)).slice(0, 500),
        attempts: 3,
      });
    },
  });

  if (!result.fromFallback) {
    opts.telemetry?.recordAttempt('milestones', result.attempts, false);
  }

  const { founding, legacy } = result.object as { founding: MilestoneEventDef; legacy: MilestoneEventDef };
  return {
    hook: (turn, maxTurns) => {
      if (turn === 1) return founding;
      if (turn === maxTurns) return legacy;
      return null;
    },
    source: JSON.stringify({ founding, legacy }, null, 2),
    attempts: result.attempts,
    fromFallback: result.fromFallback,
  };
}
