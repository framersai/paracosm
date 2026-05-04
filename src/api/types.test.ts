import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  RunOptions, RunManyOptions, RunManyResult, ActorRun,
  SimulateOptions, InterveneOptions, BatchOptions,
} from './types.js';
import type { WorldModel } from '../runtime/world-model/index.js';
import type { ActorConfig, ScenarioPackage } from '../engine/types.js';
import type { RunArtifact } from '../engine/schema/index.js';
import type { SubjectConfig, InterventionConfig } from '../engine/digital-twin/index.js';

test('v0.9 types compile against current engine types', () => {
  // Compile-time only: this test passes if it type-checks.
  const _runOpts: RunOptions = { seed: 42, maxTurns: 6 };
  const _runManyOpts: RunManyOptions = { count: 3, captureSnapshots: true };
  const _actorRun: ActorRun = { actor: {} as ActorConfig, artifact: {} as RunArtifact };
  const _runManyRes: RunManyResult = { scenario: {} as ScenarioPackage, wm: {} as WorldModel, runs: [_actorRun] };
  const _simOpts: SimulateOptions = { actor: {} as ActorConfig };
  const _intOpts: InterveneOptions = { actor: {} as ActorConfig, subject: {} as SubjectConfig, intervention: {} as InterventionConfig };
  const _batchOpts: BatchOptions = { actors: [] as ActorConfig[] };
  void _runOpts; void _runManyOpts; void _actorRun; void _runManyRes;
  void _simOpts; void _intOpts; void _batchOpts;
  assert.ok(true);
});
