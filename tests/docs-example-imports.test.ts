/**
 * Proof-by-typecheck that every import path advertised in the public
 * docs (README, COOKBOOK, ARCHITECTURE, landing.html, PARACOSM.md, blog
 * posts) resolves to a real export.
 *
 * This file uses relative paths matching the package.json `exports`
 * map; the schema test below cross-checks each advertised subpath
 * against package.json so a missing entry in either side fails.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

// === Imports (mirroring docs samples) ====================================
// Each block matches a subpath advertised in the public docs.

// paracosm/compiler
import { compileScenario } from '../src/engine/compiler/index.js';

// paracosm/runtime
import { runSimulation } from '../src/runtime/orchestrator.js';
import { runBatch } from '../src/runtime/batch.js';
import type { ActorConfig } from '../src/runtime/orchestrator.js';

// paracosm/world-model
import { WorldModel } from '../src/runtime/world-model/index.js';

// paracosm/mars + paracosm/lunar
import { marsScenario } from '../src/engine/mars/index.js';
import { lunarScenario } from '../src/engine/lunar/index.js';

// paracosm/digital-twin
import { DigitalTwin } from '../src/engine/digital-twin/index.js';

// paracosm/schema
import {
  RunArtifactSchema,
  StreamEventSchema,
  SubjectConfigSchema,
  InterventionConfigSchema,
  SwarmAgentSchema,
  SwarmSnapshotSchema,
} from '../src/engine/schema/index.js';
import type {
  RunArtifact,
  StreamEvent,
  SubjectConfig,
  InterventionConfig,
  SwarmAgent,
  SwarmSnapshot,
} from '../src/engine/schema/index.js';

// paracosm/swarm
import {
  getSwarm,
  swarmByDepartment,
  swarmFamilyTree,
  aliveCount,
  deathCount,
  moodHistogram,
  departmentHeadcount,
} from '../src/runtime/swarm/index.js';

// paracosm (root)
import {
  SimulationKernel,
  SeededRng,
  traitModelRegistry,
  hexacoModel,
  aiAgentModel,
  createParacosmClient,
} from '../src/engine/index.js';
import type { ScenarioPackage, Agent, HexacoProfile } from '../src/engine/index.js';

// === Tests ==============================================================

test('every advertised export resolves at compile time', () => {
  assert.equal(typeof compileScenario, 'function');
  assert.equal(typeof runSimulation, 'function');
  assert.equal(typeof runBatch, 'function');
  assert.equal(typeof getSwarm, 'function');
  assert.equal(typeof swarmByDepartment, 'function');
  assert.equal(typeof swarmFamilyTree, 'function');
  assert.equal(typeof aliveCount, 'function');
  assert.equal(typeof deathCount, 'function');
  assert.equal(typeof moodHistogram, 'function');
  assert.equal(typeof departmentHeadcount, 'function');
  assert.equal(typeof createParacosmClient, 'function');
  assert.equal(typeof WorldModel, 'function');
  assert.equal(typeof DigitalTwin, 'function');
  assert.equal(typeof SimulationKernel, 'function');
  assert.equal(typeof SeededRng, 'function');
  assert.equal(typeof WorldModel.fromJson, 'function');
  assert.equal(typeof WorldModel.fromScenario, 'function');
  assert.equal(typeof WorldModel.fromPrompt, 'function');
  assert.equal(typeof WorldModel.swarm, 'function');
  assert.equal(typeof WorldModel.swarmByDepartment, 'function');
  assert.equal(typeof WorldModel.swarmFamilyTree, 'function');
  assert.equal(typeof marsScenario.id, 'string');
  assert.equal(typeof lunarScenario.id, 'string');
  assert.equal(typeof traitModelRegistry.get, 'function');
  assert.equal(hexacoModel.id, 'hexaco');
  assert.equal(aiAgentModel.id, 'ai-agent');
});

test('package.json exports map exactly matches the v0.9 public subpath contract', () => {
  const pkg = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '..', 'package.json'), 'utf-8'),
  ) as { exports: Record<string, unknown> };
  // v0.9 hard-break: 6 public subpaths exactly. Adding more requires
  // a deliberate decision (and a docs/migration update); removing one
  // is a breaking change that requires a major version bump. Both
  // directions of drift get flagged here so the package.json + docs
  // contract stays in lockstep.
  const expected = new Set([
    '.',
    './core',
    './compiler',
    './schema',
    './swarm',
    './digital-twin',
  ]);
  const actual = new Set(Object.keys(pkg.exports));
  for (const subpath of expected) {
    assert.ok(actual.has(subpath), `package.json exports map missing "${subpath}"`);
  }
  for (const subpath of actual) {
    assert.ok(expected.has(subpath), `package.json exports map has unexpected subpath "${subpath}" not in v0.9 contract`);
  }
});

test('Zod schemas exposed under paracosm/schema parse a hand-built artifact', () => {
  const swarmAgent: SwarmAgent = SwarmAgentSchema.parse({
    agentId: 'a1',
    name: 'Maria',
    department: 'engineering',
    role: 'lead-engineer',
    alive: true,
    mood: 'focused',
    childrenIds: [],
  });
  assert.equal(swarmAgent.name, 'Maria');

  const swarmSnapshot: SwarmSnapshot = SwarmSnapshotSchema.parse({
    turn: 0,
    time: 0,
    agents: [swarmAgent],
    population: 1,
    morale: 0.5,
    births: 0,
    deaths: 0,
  });
  assert.equal(swarmSnapshot.agents.length, 1);

  // Mirrors the README + PARACOSM.md SubjectConfig sample exactly.
  const subject: SubjectConfig = SubjectConfigSchema.parse({
    id: 'user-42',
    name: 'Alice',
    profile: { age: 34, diet: 'mediterranean' },
    signals: [{ label: 'HRV', value: 48.2, unit: 'ms', recordedAt: '2026-04-21T08:00:00Z' }],
    markers: [{ id: 'rs4680', category: 'genome', value: 'AA' }],
  });
  assert.equal(subject.id, 'user-42');

  const intervention: InterventionConfig = InterventionConfigSchema.parse({
    id: 'intv-1',
    name: 'Creatine + Sleep Hygiene',
    description: '5g daily + 11pm bedtime.',
    duration: { value: 12, unit: 'weeks' },
    adherenceProfile: { expected: 0.7 },
  });
  assert.equal(intervention.id, 'intv-1');

  const artifact: RunArtifact = RunArtifactSchema.parse({
    metadata: {
      runId: 'r1',
      scenario: { id: 's', name: 'S' },
      seed: 42,
      mode: 'turn-loop',
      startedAt: '2026-05-01T00:00:00.000Z',
      completedAt: '2026-05-01T00:01:00.000Z',
    },
    finalSwarm: swarmSnapshot,
  });
  assert.equal(artifact.metadata.runId, 'r1');
  assert.equal(artifact.finalSwarm?.population, 1);

  const event: StreamEvent = StreamEventSchema.parse({
    type: 'turn_start',
    leader: 'Aria Chen',
    turn: 1,
    data: { summary: 'turn 1 begins' },
  });
  assert.equal(event.type, 'turn_start');
});

test('swarm helpers operate on a real RunArtifact shape', () => {
  const artifact: RunArtifact = {
    metadata: {
      runId: 'r2',
      scenario: { id: 's', name: 'S' },
      seed: 42,
      mode: 'turn-loop',
      startedAt: '2026-05-01T00:00:00.000Z',
      completedAt: '2026-05-01T00:01:00.000Z',
    },
    finalSwarm: {
      turn: 1,
      time: 1,
      population: 2,
      morale: 0.6,
      agents: [
        { agentId: 'a', name: 'A', department: 'eng', role: 'r', alive: true, mood: 'focused' },
        { agentId: 'b', name: 'B', department: 'agri', role: 'r', alive: false, mood: 'despair' },
      ],
    },
  } as RunArtifact;

  const swarm = getSwarm(artifact);
  assert.ok(swarm);
  assert.equal(aliveCount(swarm!), 1);
  assert.equal(deathCount(swarm!), 1);
  assert.deepEqual(moodHistogram(swarm!), { focused: 1 });
  assert.deepEqual(departmentHeadcount(swarm!), { eng: 1 });
  assert.deepEqual(Object.keys(swarmByDepartment(artifact)), ['eng', 'agri']);
  assert.deepEqual(swarmFamilyTree(artifact), {});
});

test('ActorConfig type narrows a HEXACO leader from the README example', () => {
  const reyes: ActorConfig = {
    name: 'Captain Reyes',
    archetype: 'The Pragmatist',
    unit: 'Station Alpha',
    hexaco: {
      openness: 0.4,
      conscientiousness: 0.9,
      extraversion: 0.3,
      agreeableness: 0.6,
      emotionality: 0.5,
      honestyHumility: 0.8,
    },
    instructions: 'You lead by protocol. Safety margins first.',
  };
  assert.equal(reyes.name, 'Captain Reyes');
  const profile: HexacoProfile = reyes.hexaco!;
  assert.equal(profile.conscientiousness, 0.9);
  const agentTypeProbe = (a: Agent | undefined) => a?.core.id;
  const scenarioTypeProbe = (s: ScenarioPackage | undefined) => s?.id;
  assert.equal(agentTypeProbe(undefined), undefined);
  assert.equal(scenarioTypeProbe(undefined), undefined);
});
