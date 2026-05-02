/**
 * Tests for the swarm-inspection helpers on `paracosm/world-model`:
 * `WorldModel.swarm`, `WorldModel.swarmByDepartment`,
 * `WorldModel.swarmFamilyTree`.
 *
 * No live LLM calls. We construct a minimal `RunArtifact` shape with
 * a synthetic `finalSwarm` and assert the helpers shape the views as
 * documented.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldModel } from '../../src/runtime/world-model/index.js';
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
  population: 4,
  morale: 0.7,
  births: 1,
  deaths: 0,
  agents: [
    a({ agentId: 'a', name: 'Maria', department: 'engineering', childrenIds: ['c'] }),
    a({ agentId: 'b', name: 'Jin', department: 'engineering' }),
    a({ agentId: 'c', name: 'Ari', department: 'agriculture' }),
    a({ agentId: 'd', name: 'Ren', department: 'agriculture', alive: false }),
  ],
};

const artifactWithSwarm: RunArtifact = {
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

const artifactNoSwarm: RunArtifact = {
  metadata: {
    runId: 'r2',
    scenario: { id: 's', name: 'Test' },
    seed: 42,
    mode: 'batch-point',
    startedAt: '2026-05-01T00:00:00.000Z',
    completedAt: '2026-05-01T00:01:00.000Z',
  },
} as RunArtifact;

test('WorldModel.swarm returns finalSwarm when present', () => {
  const result = WorldModel.swarm(artifactWithSwarm);
  assert.ok(result, 'swarm should be returned');
  assert.equal(result?.population, 4);
  assert.equal(result?.agents.length, 4);
});

test('WorldModel.swarm returns undefined when finalSwarm absent', () => {
  assert.equal(WorldModel.swarm(artifactNoSwarm), undefined);
});

test('WorldModel.swarmByDepartment groups agents by department', () => {
  const groups = WorldModel.swarmByDepartment(artifactWithSwarm);
  assert.equal(Object.keys(groups).length, 2);
  assert.equal(groups.engineering.length, 2);
  assert.equal(groups.agriculture.length, 2);
  assert.equal(groups.engineering[0].name, 'Maria');
});

test('WorldModel.swarmByDepartment returns {} for swarm-less artifacts', () => {
  assert.deepEqual(WorldModel.swarmByDepartment(artifactNoSwarm), {});
});

test('WorldModel.swarmFamilyTree maps parent agentId → child agentIds', () => {
  const tree = WorldModel.swarmFamilyTree(artifactWithSwarm);
  assert.deepEqual(tree, { a: ['c'] }, 'Maria has child Ari; nobody else has children');
});

test('WorldModel.swarmFamilyTree returns {} for swarm-less artifacts', () => {
  assert.deepEqual(WorldModel.swarmFamilyTree(artifactNoSwarm), {});
});
