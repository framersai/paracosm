/**
 * Unit tests for `paracosm/swarm` — the focused swarm-inspection module.
 * Pure projections over a synthetic `RunArtifact`; no live LLM calls.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSwarm,
  swarmByDepartment,
  swarmFamilyTree,
  aliveCount,
  deathCount,
  moodHistogram,
  departmentHeadcount,
} from '../../src/runtime/swarm/index.js';
import type { RunArtifact, SwarmAgent, SwarmSnapshot } from '../../src/engine/schema/index.js';

const a = (over: Partial<SwarmAgent>): SwarmAgent => ({
  agentId: over.agentId ?? 'a',
  name: over.name ?? 'Agent A',
  department: over.department ?? 'engineering',
  role: over.role ?? 'engineer',
  alive: over.alive ?? true,
  ...over,
});

const swarm: SwarmSnapshot = {
  turn: 6,
  time: 6,
  population: 3,
  morale: 0.7,
  agents: [
    a({ agentId: 'a', name: 'Maria', department: 'engineering', mood: 'focused', childrenIds: ['c'] }),
    a({ agentId: 'b', name: 'Jin', department: 'engineering', mood: 'anxious' }),
    a({ agentId: 'c', name: 'Ari', department: 'agriculture', mood: 'focused' }),
    a({ agentId: 'd', name: 'Ren', department: 'agriculture', alive: false, mood: 'despair' }),
  ],
};

const artifact: RunArtifact = {
  metadata: {
    runId: 'r1',
    scenario: { id: 's', name: 'Test' },
    seed: 42,
    mode: 'turn-loop',
    startedAt: '2026-05-01T00:00:00.000Z',
    completedAt: '2026-05-01T00:01:00.000Z',
  },
  finalSwarm: swarm,
} as RunArtifact;

const noSwarm: RunArtifact = {
  metadata: {
    runId: 'r2',
    scenario: { id: 's', name: 'Test' },
    seed: 42,
    mode: 'batch-point',
    startedAt: '2026-05-01T00:00:00.000Z',
    completedAt: '2026-05-01T00:01:00.000Z',
  },
} as RunArtifact;

test('getSwarm returns finalSwarm when present', () => {
  assert.equal(getSwarm(artifact)?.population, 3);
});

test('getSwarm returns undefined when absent', () => {
  assert.equal(getSwarm(noSwarm), undefined);
});

test('swarmByDepartment groups agents (alive + dead)', () => {
  const groups = swarmByDepartment(artifact);
  assert.equal(groups.engineering.length, 2);
  assert.equal(groups.agriculture.length, 2);
});

test('swarmFamilyTree records parent → children edges', () => {
  assert.deepEqual(swarmFamilyTree(artifact), { a: ['c'] });
});

test('aliveCount counts alive agents only', () => {
  assert.equal(aliveCount(swarm), 3);
});

test('deathCount counts dead agents only', () => {
  assert.equal(deathCount(swarm), 1);
});

test('moodHistogram counts moods of alive agents only', () => {
  const hist = moodHistogram(swarm);
  assert.equal(hist.focused, 2);
  assert.equal(hist.anxious, 1);
  assert.equal(hist.despair, undefined, 'dead agent moods are excluded');
});

test('departmentHeadcount counts alive agents per department', () => {
  const counts = departmentHeadcount(swarm);
  assert.equal(counts.engineering, 2);
  assert.equal(counts.agriculture, 1, 'Ren is dead so agriculture only counts Ari');
});
