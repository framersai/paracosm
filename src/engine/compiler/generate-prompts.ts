/**
 * Generate a department prompt hook from scenario JSON via
 * generateValidatedCode. The department prompt hook builds context
 * lines for each department agent.
 *
 * @module paracosm/engine/compiler/generate-prompts
 */
import type { GenerateTextFn } from './types.js';
import type { CompilerTelemetry } from './telemetry.js';
import { generateValidatedCode } from './llm-invocations/generateValidatedCode.js';
import { buildScenarioFixture } from './scenario-fixture.js';
import { buildStateShapeBlock } from './state-shape-block.js';

type DepartmentPromptFn = (ctx: any) => string[];

function buildSystemBlock(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const depts = (scenarioJson.departments ?? []).map((d: any) => `- ${d.id}: ${d.label} (${d.role}) — ${d.instructions}`).join('\n');
  return `You are generating a department prompt hook for a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'} — ${labels.settlementNoun ?? 'settlement'} simulation
DEPARTMENTS:
${depts}

Function signature: (ctx) => string[]
ctx shape:
- ctx.department: string (department ID)
- ctx.state: { agents, systems, capacities, politics, statuses, environment, metadata: { currentTime, startTime, currentTurn } }
- ctx.scenario: any
- ctx.researchPacket: { canonicalFacts[], counterpoints[], departmentNotes }

${buildStateShapeBlock(scenarioJson)}

For each department, compute and return 2-4 lines of scenario-relevant stats from ctx.state.

Rules:
1. Switch on ctx.department with a case per department ID listed above.
2. Access ctx.state.agents (filter alive), and any of the five state bags (systems, capacities, politics, statuses, environment).
3. Reference only the keys listed in AVAILABLE STATE SHAPE. Bad key access throws at validation or runtime.
4. Return string[]; empty array for unknown departments.
5. NO external imports, NO async.`;
}

const userPrompt = 'Return ONLY the arrow function. No markdown fences, no explanation.';

export function parseResponse(text: string): DepartmentPromptFn | null {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:typescript|ts|javascript|js)?\n?/i, '').replace(/\n?```$/i, '').trim();
  if (cleaned.endsWith(';')) cleaned = cleaned.slice(0, -1).trim();
  try {
    const fn = new Function('return ' + cleaned)();
    return typeof fn === 'function' ? fn : null;
  } catch {
    return null;
  }
}

function buildSmokeTest(scenarioJson: Record<string, any>): (fn: DepartmentPromptFn) => void {
  return (fn) => {
    const deptId = (scenarioJson.departments ?? [])[0]?.id ?? 'engineering';
    const fixture = buildScenarioFixture(scenarioJson);
    const result = fn({
      department: deptId,
      state: fixture,
      scenario: scenarioJson,
      researchPacket: { canonicalFacts: [], counterpoints: [], departmentNotes: {} },
    });
    if (!Array.isArray(result)) throw new Error('Must return an array of strings');
  };
}

function buildFallback(_scenarioJson: Record<string, any>): DepartmentPromptFn {
  return (ctx) => [`[${ctx.department}] No scenario-specific context available.`];
}

export interface GeneratePromptsOptions {
  telemetry?: CompilerTelemetry;
}

export async function generateDepartmentPromptHook(
  scenarioJson: Record<string, any>,
  generateText: GenerateTextFn,
  options: GeneratePromptsOptions = {},
): Promise<{ hook: DepartmentPromptFn; source: string; attempts: number; fromFallback: boolean }> {
  const result = await generateValidatedCode<DepartmentPromptFn>({
    hookName: 'prompts',
    systemCacheable: buildSystemBlock(scenarioJson),
    prompt: userPrompt,
    parse: parseResponse,
    smokeTest: buildSmokeTest(scenarioJson),
    fallback: buildFallback(scenarioJson),
    fallbackSource: '// Fallback department prompts',
    // Department prompts contain one prompt template per declared dept,
    // so the output grows with scenario size. 4000 covers typical
    // scenarios (3-6 depts); pathologically large scenarios can be
    // hand-tuned separately.
    maxTokens: 4000,
    generateText,
    telemetry: options.telemetry,
  });
  return { hook: result.hook, source: result.source, attempts: result.attempts, fromFallback: result.fromFallback };
}
