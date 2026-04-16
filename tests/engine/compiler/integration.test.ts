/**
 * Integration test: compile the submarine scenario JSON and verify
 * it produces a valid ScenarioPackage distinct from Mars.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileScenario } from '../../../src/engine/compiler/index.js';
import { marsScenario } from '../../../src/engine/mars/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const submarineJson = JSON.parse(readFileSync(resolve(__dirname, '../../../scenarios/submarine.json'), 'utf-8'));

/** Mock generateText that returns appropriate hook implementations for a submarine scenario. */
const mockGenerateText = async (prompt: string): Promise<string> => {
  if (prompt.includes('progression hook')) {
    return `(ctx) => {
      for (const c of ctx.agents) {
        if (!c.health.alive) continue;
        // Pressure stress degrades psych score
        c.health.psychScore = Math.max(0.1, c.health.psychScore - 0.02 * ctx.yearDelta);
        // Confined spaces reduce bone density (less exercise)
        c.health.boneDensityPct = Math.max(60, c.health.boneDensityPct - 0.2 * ctx.yearDelta);
      }
    }`;
  }
  if (prompt.includes('Crisis Director system instructions')) {
    return `You are the Crisis Director for a deep ocean research station at 2000m depth. You observe station state and generate crises that test the crew's weaknesses.

RULES:
1. Each crisis has exactly 2-3 options with stable IDs
2. One option must be marked isRisky
3. Reference real deep-sea science (pressure, currents, bioluminescence, hydrothermal vents)
4. Escalate based on prior decisions
5. Calibrate to station state

CRISIS CATEGORIES: environmental, resource, medical, psychological, infrastructure, scientific, communications

AVAILABLE DEPARTMENTS: medical, engineering, marine-science, life-support, communications

Return JSON: {"title","crisis","options":[{"id","label","description","isRisky"}],"riskyOptionId","riskSuccessProbability","category","researchKeywords","relevantDepartments","turnSummary"}`;
  }
  if (prompt.includes('department prompt hook')) {
    return `(ctx) => {
      const lines = [];
      const alive = (ctx.state.agents || []).filter(c => c.health?.alive);
      switch (ctx.department) {
        case 'medical':
          lines.push('CREW HEALTH:', 'Avg psych: ' + (alive.length ? (alive.reduce((s, c) => s + (c.health?.psychScore || 0), 0) / alive.length).toFixed(2) : 'N/A'));
          break;
        case 'engineering':
          lines.push('HULL:', 'Integrity: ' + (ctx.state.colony?.hullIntegrity || 'unknown') + '% | Power: ' + (ctx.state.colony?.powerKw || 0) + 'kW');
          break;
        case 'life-support':
          lines.push('LIFE SUPPORT:', 'O2: ' + (ctx.state.colony?.oxygenReserveHours || 0) + 'h | Food: ' + (ctx.state.colony?.foodMonthsReserve || 0) + 'mo');
          break;
        default:
          lines.push('[' + ctx.department + '] Station systems nominal.');
      }
      return lines;
    }`;
  }
  if (prompt.includes('milestone crises')) {
    return JSON.stringify([
      {
        title: 'Descent',
        crisis: 'The station modules have been lowered to 2000m depth. Choose deployment configuration. Option A: Cluster deployment near the hydrothermal vent field. Option B: Distributed deployment across a 5km survey grid.',
        options: [
          { id: 'option_a', label: 'Cluster Deployment', description: 'Near the vents, concentrated power and life support', isRisky: false },
          { id: 'option_b', label: 'Distributed Grid', description: 'Wider research coverage but isolated modules', isRisky: true },
        ],
        riskyOptionId: 'option_b',
        riskSuccessProbability: 0.6,
        category: 'infrastructure',
        researchKeywords: ['deep sea station deployment', 'hydrothermal vent proximity'],
        relevantDepartments: ['engineering', 'marine-science'],
        turnSummary: 'Station reaches operating depth. Deployment pattern determines research access and safety margins.',
      },
      {
        title: 'Surface Report',
        crisis: 'The funding agency requests a comprehensive mission report. Evaluate: research output, crew health, station integrity, discoveries, and future plans.',
        options: [
          { id: 'option_a', label: 'Honest Assessment', description: 'Report factually including setbacks', isRisky: false },
          { id: 'option_b', label: 'Bold Proposal', description: 'Emphasize discoveries, request deeper deployment', isRisky: true },
        ],
        riskyOptionId: 'option_b',
        riskSuccessProbability: 0.5,
        category: 'communications',
        researchKeywords: ['deep sea research funding'],
        relevantDepartments: ['communications', 'marine-science', 'medical'],
        turnSummary: 'Funding review. The commander decides: conservative reporting or bold expansion proposal.',
      },
    ]);
  }
  if (prompt.includes('fingerprint hook')) {
    return `(finalState, outcomeLog, leader, toolRegs, maxTurns) => {
      const riskyWins = outcomeLog.filter(o => o.outcome === 'risky_success').length;
      const conservativeWins = outcomeLog.filter(o => o.outcome === 'conservative_success').length;
      const totalTools = Object.values(toolRegs).flat().length;
      const riskProfile = riskyWins > conservativeWins ? 'explorer' : 'cautious';
      const innovation = totalTools > maxTurns ? 'inventive' : 'conventional';
      const leadership = leader.hexaco?.openness > 0.7 ? 'discovery-driven' : 'safety-first';
      const summary = riskProfile + ' · ' + innovation + ' · ' + leadership;
      return { riskProfile, innovation, leadership, summary };
    }`;
  }
  if (prompt.includes('politics hook')) {
    return `(category, outcome) => {
      if (category !== 'communications' && category !== 'scientific') return null;
      return outcome.includes('success') ? { fundingConfidence: 5, autonomyLevel: 3 } : { fundingConfidence: -3, autonomyLevel: -2 };
    }`;
  }
  if (prompt.includes('reaction context hook')) {
    return `(colonist, ctx) => {
      const lines = [];
      if (colonist.core?.marsborn) {
        lines.push('Born aboard the station, has never seen the surface.');
      } else {
        lines.push('Surface-born, ' + (ctx.year - 2038) + ' years underwater.');
      }
      if (colonist.health?.psychScore < 0.4) lines.push('Showing signs of deep-sea isolation syndrome.');
      return lines.join(' ');
    }`;
  }
  return '() => null';
};

describe('Submarine scenario compilation', () => {
  it('compiles submarine JSON into a valid ScenarioPackage', async () => {
    const scenario = await compileScenario(submarineJson, {
      cache: false,
      generateText: mockGenerateText,
    });

    assert.equal(scenario.id, 'deep-ocean-station');
    assert.equal(scenario.labels.name, 'Deep Ocean Station');
    assert.equal(scenario.labels.populationNoun, 'crew members');
    assert.equal(scenario.labels.settlementNoun, 'station');
    assert.equal(scenario.departments.length, 5);
    assert.equal(scenario.departments[2].id, 'marine-science');
  });

  it('submarine scenario differs from Mars in all key dimensions', async () => {
    const scenario = await compileScenario(submarineJson, {
      cache: false,
      generateText: mockGenerateText,
    });

    assert.notEqual(scenario.id, marsScenario.id);
    assert.notEqual(scenario.labels.name, marsScenario.labels.name);
    assert.notEqual(scenario.labels.populationNoun, marsScenario.labels.populationNoun);
    assert.notEqual(scenario.theme.primaryColor, marsScenario.theme.primaryColor);
    // Both have 5 departments but different IDs
    assert.ok(scenario.departments.some(d => d.id === 'marine-science'), 'Submarine has marine-science dept');
    assert.ok(!marsScenario.departments.some(d => d.id === 'marine-science'), 'Mars does not have marine-science dept');
  });

  it('submarine hooks are functional', async () => {
    const scenario = await compileScenario(submarineJson, {
      cache: false,
      generateText: mockGenerateText,
    });

    // Progression hook modifies psych score
    const testColonist = {
      core: { marsborn: false, birthYear: 2010, name: 'Test' },
      health: { alive: true, boneDensityPct: 95, cumulativeRadiationMsv: 0, psychScore: 0.7 },
    };
    scenario.hooks.progressionHook!({
      agents: [testColonist as any],
      yearDelta: 2,
      year: 2040,
      turn: 2,
      startYear: 2038,
      rng: { chance: () => false, next: () => 0.5, pick: (arr: any) => arr[0], int: (a: number) => a },
    });
    assert.ok(testColonist.health.psychScore < 0.7, 'Psych score should degrade underwater');

    // Milestones
    const turn1 = scenario.hooks.getMilestoneEvent!(1, 8);
    assert.ok(turn1, 'Turn 1 should have a milestone');
    assert.equal(turn1!.title, 'Descent');

    const last = scenario.hooks.getMilestoneEvent!(8, 8);
    assert.ok(last, 'Final turn should have a milestone');
    assert.equal(last!.title, 'Surface Report');

    // Director instructions mention departments
    const instructions = scenario.hooks.directorInstructions!();
    assert.ok(instructions.includes('marine-science'), 'Director should mention marine-science dept');

    // Fingerprint returns summary
    const fp = scenario.hooks.fingerprintHook!(
      { agents: [], colony: {}, politics: {}, metadata: {} } as any,
      [{ turn: 1, year: 2038, outcome: 'risky_success' }],
      { name: 'Test', archetype: 'test', hexaco: { openness: 0.9 } } as any,
      { engineering: ['tool1'] },
      8,
    );
    assert.ok(fp.summary, 'Fingerprint should have summary');
    assert.ok(fp.summary.includes('discovery-driven'), 'High-openness leader should be discovery-driven');
  });
});
