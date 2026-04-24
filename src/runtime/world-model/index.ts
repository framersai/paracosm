/**
 * Paracosm WorldModel façade: a one-object surface over the
 * `compileScenario + runSimulation + runBatch` trio, plus the
 * snapshot + fork API that operationalizes paracosm's CWSM
 * (counterfactual world simulation model) positioning.
 *
 * Why it exists: paracosm positions itself as a structured world model
 * for AI agents (see `docs/positioning/world-model-mapping.md`). The
 * existing APIs (`compileScenario`, `runSimulation`, `runBatch`) are all
 * first-class and unchanged. `WorldModel` is an additive thin wrapper
 * that lets consumers write code in the same vocabulary the docs use:
 *
 * ```ts
 * import { WorldModel } from 'paracosm/world-model';
 *
 * const wm = await WorldModel.fromJson(worldJson, { provider: 'anthropic' });
 * const result = await wm.simulate(leader, { maxTurns: 6, seed: 42 });
 * ```
 *
 * Every method dispatches to the underlying API with the `scenario`
 * slot pinned to this world. Per-call options are passed through
 * verbatim. Nothing here changes orchestrator semantics, kernel
 * behavior, or the returned `RunArtifact` shape.
 *
 * The façade lives in `runtime/` rather than `engine/` because it
 * depends on `runSimulation` + `runBatch`; the engine layer does not
 * import from runtime (one-way dependency).
 *
 * @module paracosm/world-model
 */

import { runSimulation, type RunOptions, type LeaderConfig } from '../orchestrator.js';
import { runBatch, type BatchConfig, type BatchManifest } from '../batch.js';
import { compileScenario } from '../../engine/compiler/index.js';
import type { CompileOptions } from '../../engine/compiler/types.js';
import type { KeyPersonnel } from '../../engine/core/agent-generator.js';
import type { ScenarioPackage } from '../../engine/types.js';
import type { RunArtifact } from '../../engine/schema/index.js';
import type { KernelSnapshot } from '../../engine/core/snapshot.js';

/**
 * Options accepted by {@link WorldModel.simulate}. Identical to
 * {@link RunOptions} minus `scenario`, which is pinned to the WorldModel
 * instance.
 */
export type WorldModelSimulateOptions = Omit<RunOptions, 'scenario'>;

/**
 * Options accepted by {@link WorldModel.batch}. Identical to
 * {@link BatchConfig} minus `scenarios`, which is fixed to `[this.scenario]`.
 * Pass `leaders`, `turns`, `seed`, and any other `BatchConfig` fields.
 */
export type WorldModelBatchOptions = Omit<BatchConfig, 'scenarios'>;

/**
 * Serializable bundle that captures everything needed to reconstruct
 * an equivalent {@link WorldModel} at a specific turn. Round-trips
 * through `JSON.stringify` + `JSON.parse` without data loss.
 *
 * Produced by {@link WorldModel.snapshot} (live run) or implicitly
 * via {@link WorldModel.forkFromArtifact} (disk-persisted run that
 * was created with `captureSnapshots: true`).
 */
export interface WorldModelSnapshot {
  /** Format discriminator; bumped when the shape changes. */
  snapshotVersion: 1;
  /** Kernel state at capture time. */
  kernel: KernelSnapshot;
  /** Run-id the snapshot was captured from, when available. Threaded
   *  into `RunArtifact.metadata.forkedFrom.parentRunId` on the child
   *  run so fork chains reconstruct from stored artifacts. */
  parentRunId?: string;
}

/**
 * Reserved options accepted by {@link WorldModel.fork} and
 * {@link WorldModel.forkFromArtifact}. Current implementations restore
 * only the snapshot at fork time; pass leader, seed, and custom events
 * to the subsequent {@link WorldModel.simulate} call.
 */
export interface ForkOptions {
  /** Reserved for a future single-call fork API. Pass the leader to
   *  the subsequent `.simulate()` call today. */
  leader?: LeaderConfig;
  /** Reserved for a future single-call fork API. Pass the seed to the
   *  subsequent `.simulate()` call today. */
  seed?: number;
  /** Reserved for a future single-call fork API. Pass custom events to
   *  the subsequent `.simulate()` call today. */
  customEvents?: Array<{ turn: number; title: string; description: string }>;
}

/**
 * A compiled, runnable world. Wraps a {@link ScenarioPackage} with
 * convenience methods for simulating single leaders or running a batch.
 *
 * Construct via {@link WorldModel.fromJson} (compile from raw JSON) or
 * {@link WorldModel.fromScenario} (wrap an already-compiled scenario,
 * e.g. `marsScenario`).
 *
 * The underlying scenario is exposed via {@link WorldModel.scenario} as
 * an escape hatch for callers that want the raw
 * {@link ScenarioPackage}: direct `runSimulation(leader, [], { scenario: wm.scenario, ... })`
 * still works and is unchanged.
 *
 * @example Single-leader simulation
 * ```ts
 * import { WorldModel } from 'paracosm/world-model';
 * import worldJson from './my-world.json' with { type: 'json' };
 *
 * const wm = await WorldModel.fromJson(worldJson, { provider: 'anthropic' });
 * const artifact = await wm.simulate(leader, { maxTurns: 6, seed: 42 });
 * ```
 *
 * @example Counterfactual branch via fork
 * ```ts
 * const wm = await WorldModel.fromJson(worldJson);
 * const trunk = await wm.simulate(visionary, {
 *   maxTurns: 6, seed: 42, captureSnapshots: true,
 * });
 * const branch = await (await wm.forkFromArtifact(trunk, 3)).simulate(
 *   pragmatist, { maxTurns: 6, seed: 42 },
 * );
 * // branch.metadata.forkedFrom === { parentRunId: trunk.metadata.runId, atTurn: 3 }
 * ```
 *
 * @example Pre-compiled scenario
 * ```ts
 * import { marsScenario } from 'paracosm/mars';
 * import { WorldModel } from 'paracosm/world-model';
 *
 * const wm = WorldModel.fromScenario(marsScenario);
 * const artifact = await wm.simulate(leader, { maxTurns: 8 });
 * ```
 */
export class WorldModel {
  /**
   * The underlying compiled scenario. Exposed so callers can drop down
   * to direct `runSimulation` / `runBatch` calls when they need options
   * the façade does not surface.
   */
  public readonly scenario: ScenarioPackage;

  /**
   * Snapshot of the kernel at the end of the most recent successful
   * `simulate()` call. Populated when that simulate() was invoked with
   * `captureSnapshots: true`. Used by {@link WorldModel.snapshot} to
   * emit a {@link WorldModelSnapshot} without requiring callers to
   * plumb the kernel themselves. Undefined otherwise.
   */
  private _lastKernelSnapshot?: KernelSnapshot;

  /**
   * Run id of the most recent successful `simulate()` call. Used by
   * {@link WorldModel.snapshot} to populate
   * {@link WorldModelSnapshot.parentRunId} so child runs record
   * `forkedFrom.parentRunId`.
   */
  private _lastRunId?: string;

  /**
   * When this WorldModel was produced by {@link WorldModel.fork} or
   * {@link WorldModel.forkFromArtifact}, this holds the `forkedFrom`
   * link that the next {@link WorldModel.simulate} call threads into
   * the child RunArtifact's `metadata.forkedFrom`. Cleared after
   * simulate() consumes it.
   */
  private _pendingForkedFrom?: { parentRunId: string; atTurn: number };

  /**
   * When this WorldModel was produced by {@link WorldModel.fork}, this
   * holds the kernel snapshot that {@link WorldModel.simulate} must
   * restore before running. Cleared after simulate() consumes it.
   */
  private _pendingResumeFrom?: KernelSnapshot;

  private constructor(scenario: ScenarioPackage) {
    this.scenario = scenario;
  }

  /**
   * Compile a raw scenario JSON into a runnable {@link WorldModel}.
   *
   * Delegates to {@link compileScenario} under the hood; all
   * {@link CompileOptions} (cache, provider, model, seed ingestion) are
   * supported.
   */
  static async fromJson(
    worldJson: Record<string, unknown>,
    options: CompileOptions = {},
  ): Promise<WorldModel> {
    const scenario = await compileScenario(worldJson, options);
    return new WorldModel(scenario);
  }

  /**
   * Wrap an already-compiled {@link ScenarioPackage} (e.g. `marsScenario`,
   * `lunarScenario`, or any cached result of a prior `compileScenario`
   * call).
   *
   * Pure construction, no I/O.
   */
  static fromScenario(scenario: ScenarioPackage): WorldModel {
    return new WorldModel(scenario);
  }

  /**
   * Run a single simulation through this world with the given leader.
   * Delegates to {@link runSimulation} with `scenario` pinned to this
   * instance.
   *
   * `keyPersonnel` is optional for parity with the underlying API; most
   * callers pass `[]` or omit it. The returned {@link RunArtifact} is
   * the universal Zod-validated contract exported from `paracosm/schema`.
   *
   * When this WorldModel was produced by {@link WorldModel.fork} or
   * {@link WorldModel.forkFromArtifact}, the pending
   * `_resumeFrom` + `_forkedFrom` context is threaded into the
   * underlying runSimulation via the internal `_resumeFrom` /
   * `_forkedFrom` fields on {@link RunOptions}. Both are cleared after
   * simulate() consumes them so a second simulate() on the same
   * WorldModel does not double-apply.
   */
  async simulate(
    leader: LeaderConfig,
    options: WorldModelSimulateOptions = {},
    keyPersonnel: KeyPersonnel[] = [],
  ): Promise<RunArtifact> {
    const resumeFrom = this._pendingResumeFrom;
    const maxTurns = options.maxTurns ?? 12;
    if (resumeFrom && maxTurns <= resumeFrom.turn) {
      throw new Error(
        `WorldModel.fork: maxTurns=${maxTurns} must be greater than fork turn ${resumeFrom.turn}. ` +
        `maxTurns is the absolute final turn index for the resumed run, not the branch length. ` +
        `For a ${maxTurns}-turn branch from turn ${resumeFrom.turn}, pass maxTurns=${resumeFrom.turn + maxTurns}.`,
      );
    }

    const mergedOpts: RunOptions & {
      _forkedFrom?: { parentRunId: string; atTurn: number };
      _resumeFrom?: KernelSnapshot;
    } = {
      ...options,
      scenario: this.scenario,
      _forkedFrom: this._pendingForkedFrom,
      _resumeFrom: resumeFrom,
    };
    // Drop the pending context so subsequent simulate calls on the
    // same WorldModel don't double-apply.
    this._pendingForkedFrom = undefined;
    this._pendingResumeFrom = undefined;

    const artifact = await runSimulation(leader, keyPersonnel, mergedOpts as RunOptions);
    this._lastRunId = artifact.metadata.runId;

    // Pull the terminal kernel snapshot from the artifact's embedded
    // per-turn snapshots (populated when captureSnapshots: true was
    // on). When captureSnapshots was off, snapshot() is degraded /
    // unavailable; snapshot() throws with a pointer to the flag.
    const perTurn = (artifact.scenarioExtensions as { kernelSnapshotsPerTurn?: KernelSnapshot[] } | undefined)?.kernelSnapshotsPerTurn;
    if (perTurn && perTurn.length > 0) {
      this._lastKernelSnapshot = perTurn[perTurn.length - 1];
    } else {
      this._lastKernelSnapshot = undefined;
    }
    return artifact;
  }

  /**
   * Run N leaders through this world in parallel via {@link runBatch}.
   * `scenarios` is fixed to `[this.scenario]`; supply `leaders`, `turns`,
   * `seed`, and any other {@link BatchConfig} fields.
   *
   * For N-scenarios-×-M-leaders sweeps that span multiple worlds, call
   * {@link runBatch} directly with an explicit `scenarios` array.
   */
  async batch(options: WorldModelBatchOptions): Promise<BatchManifest> {
    return runBatch({
      ...options,
      scenarios: [this.scenario],
    });
  }

  /**
   * Capture a {@link WorldModelSnapshot} of the state at the end of
   * this WorldModel's most recent `simulate()` call. Requires
   * `simulate(..., { captureSnapshots: true })` on that prior call;
   * throws with a clear pointer otherwise.
   *
   * The returned snapshot is plain JSON-safe; serialize to disk with
   * `JSON.stringify` and reload with `JSON.parse` + `fork()`.
   *
   * @throws Error when this WorldModel has never run simulate(), or
   *   when the last simulate() did not set `captureSnapshots: true`.
   */
  snapshot(): WorldModelSnapshot {
    if (!this._lastKernelSnapshot) {
      throw new Error(
        'WorldModel.snapshot() requires a prior `simulate(..., { captureSnapshots: true })` ' +
        'call on this WorldModel. Either enable snapshot capture on your simulation run or ' +
        'use `forkFromArtifact(artifact, atTurn)` to fork from a stored RunArtifact.',
      );
    }
    return {
      snapshotVersion: 1,
      kernel: this._lastKernelSnapshot,
      parentRunId: this._lastRunId,
    };
  }

  /**
   * Construct a new WorldModel positioned at the snapshot's turn. The
   * new WorldModel has no prior run of its own; calling `.simulate()`
   * on it resumes from the snapshot's kernel state, optionally with a
   * different leader, seed, or custom events.
   *
   * `metadata.forkedFrom` on the subsequent `.simulate()` call's
   * returned RunArtifact is set to
   * `{ parentRunId: snapshot.parentRunId, atTurn: snapshot.kernel.turn }`.
   *
   * The `opts` argument is accepted for API symmetry but not consumed
   * at fork time; the caller passes `opts.leader` / `opts.seed` /
   * `opts.customEvents` through to the subsequent `.simulate()` call
   * directly. A future spec may fold this into a single-call API.
   *
   * @throws Error when `snapshot.kernel.scenarioId !== this.scenario.id`.
   */
  async fork(snapshot: WorldModelSnapshot, opts: ForkOptions = {}): Promise<WorldModel> {
    if (snapshot.kernel.scenarioId !== this.scenario.id) {
      throw new Error(
        `WorldModel.fork: scenario id mismatch. Snapshot was taken against ` +
        `'${snapshot.kernel.scenarioId}' but this WorldModel wraps ` +
        `'${this.scenario.id}'. Cross-scenario forks are not supported.`,
      );
    }
    const child = new WorldModel(this.scenario);
    child._pendingResumeFrom = snapshot.kernel;
    if (snapshot.parentRunId) {
      child._pendingForkedFrom = {
        parentRunId: snapshot.parentRunId,
        atTurn: snapshot.kernel.turn,
      };
    }
    // `opts` (leader / seed / customEvents) are documented at the
    // interface boundary and intended for the subsequent simulate()
    // call; fork() itself only needs the snapshot. Silence
    // unused-parameter warnings explicitly.
    void opts;
    return child;
  }

  /**
   * Convenience: pulls the kernel snapshot at `atTurn` from
   * `artifact.scenarioExtensions.kernelSnapshotsPerTurn` (populated
   * when the parent run was created with `captureSnapshots: true`)
   * and calls {@link WorldModel.fork} with it.
   *
   * @throws Error when the artifact has no embedded per-turn
   *   snapshots (parent wasn't run with `captureSnapshots: true`) or
   *   when `atTurn` is out of range of the available snapshots.
   */
  async forkFromArtifact(artifact: RunArtifact, atTurn: number, opts: ForkOptions = {}): Promise<WorldModel> {
    const perTurn = (artifact.scenarioExtensions as { kernelSnapshotsPerTurn?: KernelSnapshot[] } | undefined)?.kernelSnapshotsPerTurn;
    if (!perTurn || perTurn.length === 0) {
      throw new Error(
        `WorldModel.forkFromArtifact: artifact has no embedded kernel snapshots. ` +
        `Re-run the parent simulation with \`captureSnapshots: true\` on its RunOptions ` +
        `to enable forking from the stored artifact.`,
      );
    }
    const snap = perTurn.find(s => s.turn === atTurn);
    if (!snap) {
      throw new Error(
        `WorldModel.forkFromArtifact: no snapshot at turn ${atTurn}. ` +
        `Available turns: [${perTurn.map(s => s.turn).join(', ')}].`,
      );
    }
    return this.fork(
      {
        snapshotVersion: 1,
        kernel: snap,
        parentRunId: artifact.metadata.runId,
      },
      opts,
    );
  }
}
