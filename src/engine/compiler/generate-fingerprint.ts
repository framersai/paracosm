/**
 * Generate a fingerprint hook from scenario JSON via LLM.
 * The fingerprint classifies the final simulation timeline into
 * scenario-relevant categories (resilience, governance style, etc.).
 */

import type { GenerateTextFn } from './types.js';

function buildPrompt(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const depts = (scenarioJson.departments ?? []).map((d: any) => d.id).join(', ');

  return `You are generating a timeline fingerprint hook for a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'} — ${labels.settlementNoun ?? 'settlement'} simulation
DEPARTMENTS: ${depts}

Generate a TypeScript arrow function that classifies a simulation timeline. The function receives:
- finalState: { agents: array, colony: Record<string, number>, politics: Record<string, any>, metadata: { currentYear: number, startYear: number } }
- outcomeLog: array of { turn: number, year: number, outcome: 'risky_success' | 'risky_failure' | 'conservative_success' | 'conservative_failure' }
- leader: { name: string, archetype: string, hexaco: Record<string, number> }
- toolRegs: Record<string, string[]> (department -> tool names)
- maxTurns: number

Return an object with string values for 5-7 classification dimensions relevant to this scenario domain, plus a "summary" key joining them with " · ".

Rules:
1. Use scenario-relevant classification names (not Mars-specific ones)
2. Each dimension should have 2-3 possible values (e.g., "resilient" | "brittle" | "antifragile")
3. Base classifications on final state data, outcome patterns, and leader personality
4. Always include a "summary" key that joins all dimension values with " · "
5. Do NOT use external imports
6. Return the function as a TypeScript arrow function

Return ONLY the function, no markdown fences, no explanation.`;
}

export function parseResponse(text: string): ((finalState: any, outcomeLog: any[], leader: any, toolRegs: Record<string, string[]>, maxTurns: number) => Record<string, string>) | null {
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

export async function generateFingerprintHook(
  scenarioJson: Record<string, any>,
  generateText: GenerateTextFn,
  maxRetries = 3,
): Promise<{ hook: (finalState: any, outcomeLog: any[], leader: any, toolRegs: Record<string, string[]>, maxTurns: number) => Record<string, string>; source: string }> {
  let lastError = '';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const retryHint = attempt > 0 ? `\n\nPrevious attempt failed: ${lastError}. Fix the issue.` : '';
    const text = await generateText(buildPrompt(scenarioJson) + retryHint);
    const fn = parseResponse(text);

    if (!fn) {
      lastError = 'Could not parse response into a function';
      continue;
    }

    // Quick smoke test
    try {
      const result = fn(
        { agents: [], colony: { morale: 0.6, population: 80 }, politics: { earthDependencyPct: 50 }, metadata: { currentYear: 2070, startYear: 2035 } },
        [{ turn: 1, year: 2035, outcome: 'conservative_success' }],
        { name: 'Test', archetype: 'test', hexaco: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5 } },
        { engineering: ['tool1'] },
        8,
      );
      if (typeof result !== 'object' || !result.summary) {
        lastError = 'Fingerprint must return object with summary key';
        continue;
      }
      return { hook: fn, source: text.trim() };
    } catch (err) {
      lastError = String(err);
    }
  }

  // Fallback: generic fingerprint
  console.warn('[compiler] Fingerprint hook generation failed. Using fallback.');
  const fallback = (finalState: any, outcomeLog: any[], leader: any, toolRegs: Record<string, string[]>, maxTurns: number) => {
    const riskyWins = outcomeLog.filter(o => o.outcome === 'risky_success').length;
    const riskyLosses = outcomeLog.filter(o => o.outcome === 'risky_failure').length;
    const conservativeWins = outcomeLog.filter(o => o.outcome === 'conservative_success').length;
    const totalTools = Object.values(toolRegs).flat().length;
    const riskProfile = riskyWins + riskyLosses > conservativeWins ? 'expansionist' : 'conservative';
    const innovation = totalTools > maxTurns * 2 ? 'innovative' : totalTools > maxTurns ? 'adaptive' : 'conventional';
    const leadership = leader.hexaco?.extraversion > 0.7 ? 'charismatic' : leader.hexaco?.conscientiousness > 0.7 ? 'methodical' : 'collaborative';
    const summary = `${riskProfile} · ${innovation} · ${leadership}`;
    return { riskProfile, innovation, leadership, summary };
  };
  return { hook: fallback, source: '// Fallback fingerprint' };
}
