import test from 'node:test';
import assert from 'node:assert/strict';

// Import every documented v0.9 root symbol. If any is missing, this
// import fails at module-load time and the test errors before running.
import {
  // Top-level shortcuts
  run, runMany,
  // Mid-level
  WorldModel, WorldModelReplayError, generateQuickstartActors,
  // Scenario authoring (promoted from /compiler)
  compileScenario, ingestFromUrl, ingestSeed,
  // Built-in scenarios (promoted from /mars, /lunar)
  marsScenario, lunarScenario,
  // Actor presets (promoted from /leader-presets)
  ACTOR_PRESETS, getPresetById, listPresetsByTrait,
  // Trait models
  traitModelRegistry, hexacoModel, aiAgentModel,
  TraitModelRegistry, UnknownTraitModelError,
  withDefaults,
  normalizeActorConfig, hexacoToTraits, traitsToHexaco,
  // Client + provider
  createParacosmClient, ProviderKeyMissingError, resolveProviderWithFallback,
} from '../src/index.js';

import type {
  RunOptions, RunManyOptions, RunManyResult, ActorRun,
  SimulateOptions, InterveneOptions, BatchOptions,
  WorldModelSnapshot, WorldModelQuickstartOptions, WorldModelQuickstartResult,
  ParacosmClient, ParacosmClientOptions,
  ActorConfig, HexacoProfile, TraitProfile,
  ScenarioPackage, SimulationModelConfig, Citation, ForgedToolRecord,
  KeyPersonnel, RunArtifact, StreamEvent, CustomEvent,
  SubjectConfig, InterventionConfig,
} from '../src/index.js';

test('top-level functions are callable', () => {
  assert.equal(typeof run, 'function');
  assert.equal(typeof runMany, 'function');
});

test('WorldModel has the v0.9 method shape', () => {
  // Static factories
  assert.equal(typeof WorldModel.fromScenario, 'function');
  assert.equal(typeof WorldModel.fromPrompt, 'function');
  assert.equal(typeof WorldModel.fromJson, 'function');
  // Instance methods (check they exist on the prototype)
  const protoMethods = Object.getOwnPropertyNames(WorldModel.prototype);
  for (const m of ['simulate', 'intervene', 'batch', 'quickstart', 'snapshot', 'fork', 'forkFromArtifact', 'replay']) {
    assert.ok(protoMethods.includes(m), `WorldModel.prototype should have method: ${m}`);
  }
  // Removed v0.8 methods (BREAKING) — should be absent
  for (const m of ['simulateIntervention']) {
    assert.ok(!protoMethods.includes(m), `WorldModel.prototype should NOT have v0.8 method: ${m}`);
  }
});

test('built-in scenarios are exported as objects', () => {
  assert.equal(typeof marsScenario, 'object');
  assert.equal(typeof lunarScenario, 'object');
  assert.ok(marsScenario.id, 'marsScenario has an id');
  assert.ok(lunarScenario.id, 'lunarScenario has an id');
});

test('actor presets are exported as a non-empty record', () => {
  assert.equal(typeof ACTOR_PRESETS, 'object');
  assert.ok(ACTOR_PRESETS !== null);
  assert.ok(Object.keys(ACTOR_PRESETS).length > 0, 'ACTOR_PRESETS is non-empty');
});

test('compileScenario + ingestFromUrl + ingestSeed are at root', () => {
  assert.equal(typeof compileScenario, 'function');
  assert.equal(typeof ingestFromUrl, 'function');
  assert.equal(typeof ingestSeed, 'function');
});

test('trait-model surface is at root', () => {
  assert.equal(typeof hexacoModel, 'object');
  assert.equal(typeof aiAgentModel, 'object');
  assert.equal(typeof traitModelRegistry, 'object');
  assert.equal(typeof normalizeActorConfig, 'function');
  assert.equal(typeof hexacoToTraits, 'function');
  assert.equal(typeof traitsToHexaco, 'function');
});

test('createParacosmClient + provider resolver are at root', () => {
  assert.equal(typeof createParacosmClient, 'function');
  assert.equal(typeof resolveProviderWithFallback, 'function');
  assert.equal(ProviderKeyMissingError.name, 'ProviderKeyMissingError');
  assert.equal(WorldModelReplayError.name, 'WorldModelReplayError');
  assert.equal(UnknownTraitModelError.name, 'UnknownTraitModelError');
  assert.equal(typeof TraitModelRegistry, 'function');
  assert.equal(typeof generateQuickstartActors, 'function');
  assert.equal(typeof getPresetById, 'function');
  assert.equal(typeof listPresetsByTrait, 'function');
  assert.equal(typeof withDefaults, 'function');
});

test('compile-time only: option types accept their documented shape', () => {
  const _runOpts: RunOptions = { seed: 42 };
  const _runManyOpts: RunManyOptions = { count: 3 };
  const _simOpts: SimulateOptions = { actor: {} as ActorConfig };
  const _intOpts: InterveneOptions = {
    actor: {} as ActorConfig,
    subject: {} as SubjectConfig,
    intervention: {} as InterventionConfig,
  };
  const _batchOpts: BatchOptions = {
    actors: [] as ActorConfig[],
    turns: 6,
    seed: 42,
  };
  const _runManyRes: RunManyResult = {
    scenario: {} as ScenarioPackage,
    wm: {} as WorldModel,
    runs: [] as ActorRun[],
  };
  // Reference all imported types so unused-import checks don't strip them.
  void ({} as WorldModelSnapshot);
  void ({} as WorldModelQuickstartOptions);
  void ({} as WorldModelQuickstartResult);
  void ({} as ParacosmClient);
  void ({} as ParacosmClientOptions);
  void ({} as HexacoProfile);
  void ({} as TraitProfile);
  void ({} as SimulationModelConfig);
  void ({} as Citation);
  void ({} as ForgedToolRecord);
  void ({} as KeyPersonnel);
  void ({} as RunArtifact);
  void ({} as StreamEvent);
  void ({} as CustomEvent);
  void _runOpts; void _runManyOpts; void _simOpts; void _intOpts; void _batchOpts; void _runManyRes;
  assert.ok(true);
});
