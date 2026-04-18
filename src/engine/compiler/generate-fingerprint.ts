/**
 * Generate a fingerprint hook from scenario JSON via generateValidatedCode.
 * The fingerprint classifies the final simulation timeline into
 * scenario-relevant categories (resilience, governance style, etc.).
 *
 * @module paracosm/engine/compiler/generate-fingerprint
 */
import type { GenerateTextFn } from './types.js';
import type { CompilerTelemetry } from './telemetry.js';
import { generateValidatedCode } from './llm-invocations/generateValidatedCode.js';

type FingerprintFn = (finalState: any, outcomeLog: any[], leader: any, toolRegs: Record<string, string[]>, maxTurns: number) => Record<string, string>;

function buildSystemBlock(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const depts = (scenarioJson.departments ?? []).map((d: any) => d.id).join(', ');
  return `You are generating a timeline fingerprint hook for a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'} — ${labels.settlementNoun ?? 'settlement'} simulation
DEPARTMENTS: ${depts}

Function signature: (finalState, outcomeLog, leader, toolRegs, maxTurns) => Record<string, string>

Inputs:
- finalState: { agents, colony, politics, metadata: { currentYear, startYear } }
- outcomeLog: [{ turn, year, outcome: 'risky_success' | 'risky_failure' | 'conservative_success' | 'conservative_failure' }]
- leader: { name, archetype, hexaco }
- toolRegs: Record<dept, string[]> (department -> tool names)
- maxTurns: number

Output: object with 5-7 classification dimensions (each 2-3 possible values e.g. "resilient" | "brittle") PLUS a "summary" key joining them with " · ".

Rules:
1. Scenario-relevant classification names (not Mars-specific)
2. Base classifications on final state, outcome patterns, leader personality
3. Always include "summary"
4. NO external imports`;
}

const userPrompt = 'Return ONLY the arrow function. No markdown fences.';

export function parseResponse(text: string): FingerprintFn | null {
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

function smokeTest(fn: FingerprintFn): void {
  const result = fn(
    { agents: [], colony: { morale: 0.6, population: 80 }, politics: { earthDependencyPct: 50 }, metadata: { currentYear: 2070, startYear: 2035 } },
    [{ turn: 1, year: 2035, outcome: 'conservative_success' }],
    { name: 'Test', archetype: 'test', hexaco: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5 } },
    { engineering: ['tool1'] },
    8,
  );
  if (typeof result !== 'object' || !result.summary) {
    throw new Error('Fingerprint must return object with summary key');
  }
}

const fallback: FingerprintFn = (_fs, outcomeLog, leader, toolRegs, maxTurns) => {
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

export interface GenerateFingerprintOptions {
  telemetry?: CompilerTelemetry;
}

export async function generateFingerprintHook(
  scenarioJson: Record<string, any>,
  generateText: GenerateTextFn,
  options: GenerateFingerprintOptions = {},
): Promise<{ hook: FingerprintFn; source: string; attempts: number; fromFallback: boolean }> {
  const result = await generateValidatedCode<FingerprintFn>({
    hookName: 'fingerprint',
    systemCacheable: buildSystemBlock(scenarioJson),
    prompt: userPrompt,
    parse: parseResponse,
    smokeTest,
    fallback,
    fallbackSource: '// Fallback fingerprint',
    generateText,
    telemetry: options.telemetry,
  });
  return { hook: result.hook, source: result.source, attempts: result.attempts, fromFallback: result.fromFallback };
}
