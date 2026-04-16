/**
 * Tests for the scenario compiler.
 * Uses mock LLM responses to test parsing, validation, and caching.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashScenario, readCache, writeCache } from '../../../src/engine/compiler/cache.js';
import { compileScenario } from '../../../src/engine/compiler/index.js';
import {
  validateProgressionHook,
  validateDirectorInstructions,
  validateMilestones,
  validateFingerprint,
  validatePolitics,
  validateReactionContext,
} from '../../../src/engine/compiler/validate.js';

const MOCK_SCENARIO = {
  id: 'test-scenario',
  version: '1.0.0',
  engineArchetype: 'closed_turn_based_settlement',
  labels: { name: 'Test Base', shortName: 'test', populationNoun: 'crew members', settlementNoun: 'base', currency: 'credits' },
  theme: { primaryColor: '#22c55e', accentColor: '#86efac', cssVariables: {} },
  setup: { defaultTurns: 8, defaultSeed: 100, defaultStartYear: 2040, defaultPopulation: 30, configurableSections: ['leaders'] },
  departments: [
    { id: 'medical', label: 'Medical', role: 'Doctor', icon: '🏥', defaultModel: 'test', instructions: 'Analyze health' },
    { id: 'engineering', label: 'Engineering', role: 'Engineer', icon: '⚙️', defaultModel: 'test', instructions: 'Analyze infra' },
  ],
  metrics: [{ id: 'population', label: 'Population', source: 'metrics.population', format: 'number' }],
  events: [{ id: 'crisis', label: 'Crisis', icon: '⚠️', color: '#ef4444' }],
  effects: { environmental: { powerKw: 50, morale: 0.08 } },
  ui: {
    headerMetrics: [{ id: 'population', format: 'number' }],
    tooltipFields: ['boneDensityPct'],
    reportSections: ['crisis'],
    departmentIcons: { medical: '🏥' },
    setupSections: ['leaders'],
  },
  policies: {
    toolForging: { enabled: true },
    liveSearch: { enabled: false, mode: 'off' },
    bulletin: { enabled: true },
    characterChat: { enabled: true },
    sandbox: { timeoutMs: 10000, memoryMB: 128 },
  },
  presets: [],
};

describe('Scenario compiler cache', () => {
  it('hashScenario produces consistent 16-char hex', () => {
    const h1 = hashScenario(MOCK_SCENARIO);
    const h2 = hashScenario(MOCK_SCENARIO);
    assert.equal(h1, h2);
    assert.equal(h1.length, 16);
    assert.match(h1, /^[a-f0-9]{16}$/);
  });

  it('hashScenario changes when input changes', () => {
    const h1 = hashScenario(MOCK_SCENARIO);
    const h2 = hashScenario({ ...MOCK_SCENARIO, version: '2.0.0' });
    assert.notEqual(h1, h2);
  });
});

describe('Hook validators', () => {
  it('validateProgressionHook passes for no-op hook', () => {
    const result = validateProgressionHook(() => {});
    assert.equal(result.ok, true);
  });

  it('validateProgressionHook passes for valid hook', () => {
    const hook = (ctx: any) => {
      for (const c of ctx.agents) {
        if (!c.health.alive) continue;
        c.health.boneDensityPct = Math.max(50, c.health.boneDensityPct - 0.5 * ctx.yearDelta);
      }
    };
    const result = validateProgressionHook(hook);
    assert.equal(result.ok, true);
  });

  it('validateDirectorInstructions passes for valid instructions', () => {
    const fn = () => 'You are the Crisis Director for a settlement simulation. You observe colony state and generate crises. Departments: medical, engineering. Generate crises with 2-3 options. Return JSON with title, crisis, options, category.';
    const result = validateDirectorInstructions(fn, ['medical', 'engineering']);
    assert.equal(result.ok, true);
  });

  it('validateMilestones passes for valid milestones', () => {
    const fn = (turn: number, maxTurns: number) => {
      if (turn === 1) return { title: 'Founding', description: 'Test', crisis: 'Test', options: [{ id: 'a', label: 'A', description: 'A', isRisky: false }, { id: 'b', label: 'B', description: 'B', isRisky: true }], riskyOptionId: 'b', riskSuccessProbability: 0.6, category: 'infrastructure', researchKeywords: [], relevantDepartments: ['engineering'], turnSummary: 'Test' };
      if (turn === maxTurns) return { title: 'Legacy', description: 'Test', crisis: 'Test', options: [{ id: 'a', label: 'A', description: 'A', isRisky: false }, { id: 'b', label: 'B', description: 'B', isRisky: true }], riskyOptionId: 'b', riskSuccessProbability: 0.5, category: 'political', researchKeywords: [], relevantDepartments: ['medical'], turnSummary: 'Test' };
      return null;
    };
    const result = validateMilestones(fn, 8);
    assert.equal(result.ok, true);
  });

  it('validateFingerprint passes for valid fingerprint', () => {
    const fn = () => ({ riskProfile: 'conservative', summary: 'conservative' });
    const result = validateFingerprint(fn);
    assert.equal(result.ok, true);
  });

  it('validatePolitics passes for null-returning hook', () => {
    const fn = () => null;
    const result = validatePolitics(fn);
    assert.equal(result.ok, true);
  });

  it('validateReactionContext passes for string-returning hook', () => {
    const fn = () => 'Born at the base.';
    const result = validateReactionContext(fn);
    assert.equal(result.ok, true);
  });
});

describe('compileScenario with mock LLM', () => {
  /** Mock generateText that returns appropriate responses for each hook type. */
  const mockResponses: Record<string, string> = {
    progression: '(ctx) => { for (const c of ctx.agents) { if (!c.health.alive) continue; c.health.boneDensityPct = Math.max(50, c.health.boneDensityPct - 0.3 * ctx.yearDelta); } }',
    director: 'You are the Crisis Director for a base simulation. Departments: medical, engineering. Generate crises with 2-3 options, one risky. Categories: environmental, resource, medical. Return JSON with title, crisis, options, riskyOptionId, riskSuccessProbability, category, researchKeywords, relevantDepartments, turnSummary.',
    prompts: '(ctx) => { const lines = []; if (ctx.department === "medical") lines.push("HEALTH: population alive"); else lines.push("INFRA: systems nominal"); return lines; }',
    milestones: JSON.stringify([
      { title: 'Founding', crisis: 'Choose your strategy.', options: [{ id: 'option_a', label: 'Safe', description: 'Conservative', isRisky: false }, { id: 'option_b', label: 'Bold', description: 'Risky', isRisky: true }], riskyOptionId: 'option_b', riskSuccessProbability: 0.6, category: 'infrastructure', researchKeywords: ['base'], relevantDepartments: ['engineering'], turnSummary: 'Founding.' },
      { title: 'Legacy', crisis: 'Report status.', options: [{ id: 'option_a', label: 'Honest', description: 'Facts', isRisky: false }, { id: 'option_b', label: 'Bold', description: 'Vision', isRisky: true }], riskyOptionId: 'option_b', riskSuccessProbability: 0.5, category: 'political', researchKeywords: [], relevantDepartments: ['medical'], turnSummary: 'Assessment.' },
    ]),
    fingerprint: '(finalState, outcomeLog, leader, toolRegs, maxTurns) => { const summary = "test"; return { summary }; }',
    politics: '(category, outcome) => { if (category !== "political") return null; return outcome.includes("success") ? { stability: 0.05 } : { stability: -0.03 }; }',
    reactions: '(colonist, ctx) => { return colonist.core.marsborn ? "Born at the base." : "Arrived from elsewhere."; }',
  };

  let callIndex = 0;
  const hookOrder = ['progression', 'director', 'prompts', 'milestones', 'fingerprint', 'politics', 'reactions'];

  const mockGenerateText = async (prompt: string): Promise<string> => {
    // Determine which hook is being requested from the prompt content
    const hookKey = hookOrder[callIndex % hookOrder.length];
    callIndex++;
    return mockResponses[hookKey] ?? '() => null';
  };

  it('compileScenario produces a valid ScenarioPackage', async () => {
    callIndex = 0;
    const scenario = await compileScenario(MOCK_SCENARIO, {
      cache: false,
      generateText: mockGenerateText,
    });

    assert.equal(scenario.id, 'test-scenario');
    assert.equal(scenario.version, '1.0.0');
    assert.equal(scenario.engineArchetype, 'closed_turn_based_settlement');
    assert.equal(scenario.labels.name, 'Test Base');
    assert.equal(scenario.departments.length, 2);
    assert.ok(scenario.hooks.progressionHook, 'progressionHook should be defined');
    assert.ok(scenario.hooks.directorInstructions, 'directorInstructions should be defined');
    assert.ok(scenario.hooks.departmentPromptHook, 'departmentPromptHook should be defined');
    assert.ok(scenario.hooks.getMilestoneEvent, 'getMilestoneEvent should be defined');
    assert.ok(scenario.hooks.fingerprintHook, 'fingerprintHook should be defined');
    assert.ok(scenario.hooks.politicsHook, 'politicsHook should be defined');
    assert.ok(scenario.hooks.reactionContextHook, 'reactionContextHook should be defined');
  });

  it('compiled hooks pass validation', async () => {
    callIndex = 0;
    const scenario = await compileScenario(MOCK_SCENARIO, {
      cache: false,
      generateText: mockGenerateText,
    });

    assert.deepEqual(validateProgressionHook(scenario.hooks.progressionHook), { ok: true });
    assert.deepEqual(validateDirectorInstructions(scenario.hooks.directorInstructions, ['medical', 'engineering']), { ok: true });
    assert.deepEqual(validateMilestones(scenario.hooks.getMilestoneEvent, 8), { ok: true });
    assert.deepEqual(validateFingerprint(scenario.hooks.fingerprintHook), { ok: true });
    assert.deepEqual(validatePolitics(scenario.hooks.politicsHook), { ok: true });
    assert.deepEqual(validateReactionContext(scenario.hooks.reactionContextHook), { ok: true });
  });

  it('compiled milestones return crisis for turn 1 and null for mid turns', async () => {
    callIndex = 0;
    const scenario = await compileScenario(MOCK_SCENARIO, {
      cache: false,
      generateText: mockGenerateText,
    });

    const turn1 = scenario.hooks.getMilestoneEvent!(1, 8);
    assert.ok(turn1, 'Turn 1 should return a crisis');
    assert.equal(turn1!.title, 'Founding');

    const mid = scenario.hooks.getMilestoneEvent!(4, 8);
    assert.equal(mid, null, 'Mid-turn should return null');

    const last = scenario.hooks.getMilestoneEvent!(8, 8);
    assert.ok(last, 'Final turn should return a crisis');
    assert.ok(last!.title.includes('Legacy'), `Final turn title should contain Legacy, got: ${last!.title}`);
  });
});
