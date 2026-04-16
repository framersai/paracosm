/**
 * Targeted tests for batched reaction parsing and graceful degradation.
 *
 * The full `generateAgentReactions` function depends on a live LLM call
 * through AgentOS, which is expensive and non-deterministic. What we
 * test here is the response-parsing layer, which is the actual code
 * path that breaks when the model misbehaves:
 *
 *   - valid JSON array → reactions match agents by agentId
 *   - array with a dropped agent → remaining reactions still land
 *   - JSON wrapped in markdown fences or prose → array still extracted
 *   - malformed JSON → empty array, no throw
 *   - unknown agentId in response → ignored, real agents still matched
 *   - non-array JSON → empty array
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBatchReactions } from '../../src/runtime/agent-reactions.js';
import type { Agent } from '../../src/engine/core/state.js';

function makeAgent(id: string, name: string, dept = 'engineering'): Agent {
  return {
    core: { id, name, birthYear: 2010, marsborn: false, department: dept as any, role: 'engineer' },
    health: { alive: true, boneDensityPct: 90, cumulativeRadiationMsv: 100, psychScore: 0.7, conditions: [] },
    career: { specialization: 'Structural', yearsExperience: 5, rank: 'senior', achievements: [] },
    social: { childrenIds: [], friendIds: [], earthContacts: 3 },
    narrative: { lifeEvents: [], featured: false },
    hexaco: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5 },
    hexacoHistory: [],
    memory: { shortTerm: [], longTerm: [], stances: {}, relationships: {} },
  };
}

describe('parseBatchReactions', () => {
  const year = 2045;

  it('extracts all reactions from a well-formed JSON array', () => {
    const agents = [makeAgent('a1', 'Alice'), makeAgent('a2', 'Bob')];
    const text = JSON.stringify([
      { agentId: 'a1', quote: 'Alice speaks.', mood: 'hopeful', intensity: 0.7 },
      { agentId: 'a2', quote: 'Bob speaks.', mood: 'anxious', intensity: 0.4 },
    ]);
    const reactions = parseBatchReactions(text, agents, year);
    assert.equal(reactions.length, 2);
    assert.equal(reactions[0].name, 'Alice');
    assert.equal(reactions[0].mood, 'hopeful');
    assert.equal(reactions[1].name, 'Bob');
    assert.equal(reactions[1].intensity, 0.4);
  });

  it('preserves reactions when the model drops one agent', () => {
    const agents = [makeAgent('a1', 'Alice'), makeAgent('a2', 'Bob'), makeAgent('a3', 'Carol')];
    const text = JSON.stringify([
      { agentId: 'a1', quote: 'Alice.', mood: 'neutral', intensity: 0.5 },
      // Bob dropped
      { agentId: 'a3', quote: 'Carol.', mood: 'defiant', intensity: 0.8 },
    ]);
    const reactions = parseBatchReactions(text, agents, year);
    assert.equal(reactions.length, 2);
    const names = reactions.map(r => r.name).sort();
    assert.deepEqual(names, ['Alice', 'Carol']);
  });

  it('extracts array even when wrapped in prose or markdown fences', () => {
    const agents = [makeAgent('a1', 'Alice')];
    const text = `Sure, here are the reactions:\n\`\`\`json\n[{"agentId":"a1","quote":"yep","mood":"neutral","intensity":0.5}]\n\`\`\`\nLet me know if you need more.`;
    const reactions = parseBatchReactions(text, agents, year);
    assert.equal(reactions.length, 1);
    assert.equal(reactions[0].name, 'Alice');
  });

  it('returns empty array for malformed JSON without throwing', () => {
    const agents = [makeAgent('a1', 'Alice')];
    const reactions = parseBatchReactions('this is not JSON {{', agents, year);
    assert.equal(reactions.length, 0);
  });

  it('ignores entries with unknown agentId', () => {
    const agents = [makeAgent('a1', 'Alice')];
    const text = JSON.stringify([
      { agentId: 'a1', quote: 'Alice here.', mood: 'hopeful', intensity: 0.6 },
      { agentId: 'ghost-456', quote: 'Who am I?', mood: 'anxious', intensity: 0.9 },
    ]);
    const reactions = parseBatchReactions(text, agents, year);
    assert.equal(reactions.length, 1);
    assert.equal(reactions[0].name, 'Alice');
  });

  it('returns empty when the JSON is a non-array value', () => {
    const agents = [makeAgent('a1', 'Alice')];
    const reactions = parseBatchReactions('{"agentId":"a1","quote":"x"}', agents, year);
    assert.equal(reactions.length, 0);
  });

  it('skips entries missing a quote', () => {
    const agents = [makeAgent('a1', 'Alice'), makeAgent('a2', 'Bob')];
    const text = JSON.stringify([
      { agentId: 'a1', quote: 'Alice.', mood: 'neutral', intensity: 0.5 },
      { agentId: 'a2', mood: 'neutral', intensity: 0.5 }, // no quote
    ]);
    const reactions = parseBatchReactions(text, agents, year);
    assert.equal(reactions.length, 1);
    assert.equal(reactions[0].name, 'Alice');
  });

  it('defaults mood and intensity when missing', () => {
    const agents = [makeAgent('a1', 'Alice')];
    const text = JSON.stringify([{ agentId: 'a1', quote: 'Minimal.' }]);
    const reactions = parseBatchReactions(text, agents, year);
    assert.equal(reactions.length, 1);
    assert.equal(reactions[0].mood, 'neutral');
    assert.equal(reactions[0].intensity, 0.5);
  });
});
