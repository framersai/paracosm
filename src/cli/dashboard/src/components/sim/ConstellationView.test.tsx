import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from 'react-dom/server';
import * as React from 'react';
import { ConstellationView } from './ConstellationView.js';
import type { GameState } from '../../hooks/useGameState.js';

const baseHexaco = { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5 };

function makeState(actorNames: string[]): GameState {
  const actors: Record<string, unknown> = {};
  for (const name of actorNames) {
    actors[name] = {
      leader: { name, archetype: 'Test', unit: 'TestUnit', hexaco: baseHexaco },
      metrics: null, prevMetrics: null, event: null,
      events: [], popHistory: [], moraleHistory: [],
      deaths: 0, deathCauses: {}, tools: 0, toolNames: new Set(),
      citations: 0, decisions: 0,
      pendingDecision: '', pendingRationale: '', pendingReasoning: '', pendingPolicies: [],
      outcome: null, agentSnapshots: [], currentEvents: [],
    };
  }
  return {
    actors, actorIds: actorNames,
    turn: 0, time: 0, maxTurns: 6, seed: 950,
    isRunning: false, isComplete: false,
    cost: { totalTokens: 0, totalCostUSD: 0, llmCalls: 0 },
    costByActor: {},
  } as unknown as GameState;
}

test('ConstellationView: 3 actors → 3 nodes + 3 edges (full graph)', () => {
  const html = renderToString(<ConstellationView state={makeState(['a', 'b', 'c'])} onActorClick={() => {}} />);
  const nodes = html.match(/<circle[^>]*data-actor=/g) ?? [];
  const edges = html.match(/<line[^>]*data-edge=/g) ?? [];
  assert.equal(nodes.length, 3);
  assert.equal(edges.length, 3);
});

test('ConstellationView: 5 actors → 5 nodes + 10 edges', () => {
  const html = renderToString(<ConstellationView state={makeState(['a', 'b', 'c', 'd', 'e'])} onActorClick={() => {}} />);
  const nodes = html.match(/<circle[^>]*data-actor=/g) ?? [];
  const edges = html.match(/<line[^>]*data-edge=/g) ?? [];
  assert.equal(nodes.length, 5);
  assert.equal(edges.length, 10);
});

test('ConstellationView: 50 actors → 50 nodes + 1225 edges (perf sanity)', () => {
  const names = Array.from({ length: 50 }, (_, i) => `actor-${i}`);
  const html = renderToString(<ConstellationView state={makeState(names)} onActorClick={() => {}} />);
  const nodes = html.match(/<circle[^>]*data-actor=/g) ?? [];
  const edges = html.match(/<line[^>]*data-edge=/g) ?? [];
  assert.equal(nodes.length, 50);
  assert.equal(edges.length, 1225);
});

test('ConstellationView: 0 actors → empty-state placeholder, no SVG', () => {
  const html = renderToString(<ConstellationView state={makeState([])} onActorClick={() => {}} />);
  assert.match(html, /Constellation will appear/);
  assert.ok(!html.includes('<svg'));
});

test('ConstellationView: 1 actor → 1 node, 0 edges', () => {
  const html = renderToString(<ConstellationView state={makeState(['solo'])} onActorClick={() => {}} />);
  const nodes = html.match(/<circle[^>]*data-actor=/g) ?? [];
  const edges = html.match(/<line[^>]*data-edge=/g) ?? [];
  assert.equal(nodes.length, 1);
  assert.equal(edges.length, 0);
});

test('ConstellationView: each node carries its actor name on data-actor', () => {
  const html = renderToString(<ConstellationView state={makeState(['Aria', 'Bob', 'Cleo'])} onActorClick={() => {}} />);
  assert.match(html, /data-actor="Aria"/);
  assert.match(html, /data-actor="Bob"/);
  assert.match(html, /data-actor="Cleo"/);
});
