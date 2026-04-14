/**
 * Generate a department prompt hook from scenario JSON via LLM.
 * The department prompt hook builds context lines for each department agent.
 */

import type { GenerateTextFn } from './types.js';

function buildPrompt(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const depts = (scenarioJson.departments ?? []).map((d: any) => `- ${d.id}: ${d.label} (${d.role}) — ${d.instructions}`).join('\n');

  return `You are generating a department prompt hook for a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'} — ${labels.settlementNoun ?? 'settlement'} simulation
DEPARTMENTS:
${depts}

Generate a TypeScript arrow function that returns an array of context lines for a specific department. The function receives a context object:
- ctx.department: string (department ID, one of the above)
- ctx.state: { agents: array, colony: Record<string, number>, politics: Record<string, any>, metadata: { currentYear: number } }
- ctx.scenario: any (scenario data)
- ctx.researchPacket: { canonicalFacts: array, counterpoints: array, departmentNotes: Record<string, string> }

For each department, compute and return 2-4 lines of scenario-relevant statistics from ctx.state. Each line should be a section header followed by numbers/stats.

Example output: ['HEALTH:', 'Avg radiation: 150 mSv | Avg bone: 85% | Population: 80']

Rules:
1. Use a switch statement on ctx.department with a case for each department ID
2. Access ctx.state.agents (filter alive ones), ctx.state.colony (numeric metrics), ctx.state.politics
3. Compute averages, counts, and status summaries relevant to each department
4. Return string[] (array of context lines)
5. Return an empty array for unknown departments
6. Do NOT use external imports

Return ONLY the arrow function, no markdown fences, no explanation.`;
}

export function parseResponse(text: string): ((ctx: any) => string[]) | null {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:typescript|ts)?\n?/i, '').replace(/\n?```$/i, '').trim();
  if (cleaned.endsWith(';')) cleaned = cleaned.slice(0, -1).trim();

  try {
    const fn = new Function('return ' + cleaned)();
    if (typeof fn === 'function') return fn;
    return null;
  } catch {
    return null;
  }
}

export async function generateDepartmentPromptHook(
  scenarioJson: Record<string, any>,
  generateText: GenerateTextFn,
  maxRetries = 3,
): Promise<{ hook: (ctx: any) => string[]; source: string }> {
  let lastError = '';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const retryHint = attempt > 0 ? `\n\nPrevious attempt failed: ${lastError}. Fix the issue.` : '';
    const text = await generateText(buildPrompt(scenarioJson) + retryHint);
    const fn = parseResponse(text);

    if (!fn) {
      lastError = 'Could not parse response into a function';
      continue;
    }

    // Smoke test
    try {
      const deptId = (scenarioJson.departments ?? [])[0]?.id ?? 'engineering';
      const result = fn({
        department: deptId,
        state: {
          agents: [{ core: { name: 'Test' }, health: { alive: true, boneDensityPct: 90, cumulativeRadiationMsv: 100, psychScore: 0.7 } }],
          colony: { morale: 0.6, population: 80, foodMonthsReserve: 6, powerKw: 300, infrastructureModules: 10, scienceOutput: 5, lifeSupportCapacity: 100 },
          politics: { earthDependencyPct: 50, governanceStatus: 'colonial' },
          metadata: { currentYear: 2045 },
        },
        scenario: scenarioJson,
        researchPacket: { canonicalFacts: [], counterpoints: [], departmentNotes: {} },
      });
      if (!Array.isArray(result)) {
        lastError = 'Must return an array of strings';
        continue;
      }
      return { hook: fn, source: text.trim() };
    } catch (err) {
      lastError = String(err);
    }
  }

  // Fallback: empty lines
  console.warn('[compiler] Department prompt hook generation failed. Using fallback.');
  return {
    hook: (ctx: any) => [`[${ctx.department}] No scenario-specific context available.`],
    source: '// Fallback department prompts',
  };
}
