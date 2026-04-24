/**
 * Paracosm WorldModel façade: a one-object surface over the
 * `compileScenario + runSimulation + runBatch` trio.
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
 * @example Counterfactual comparison (the core paracosm use case)
 * ```ts
 * const wm = await WorldModel.fromJson(worldJson);
 * const [pragmatist, innovator] = await Promise.all([
 *   wm.simulate(pragmatistLeader, { maxTurns: 6, seed: 42 }),
 *   wm.simulate(innovatorLeader,  { maxTurns: 6, seed: 42 }),
 * ]);
 * // pragmatist.fingerprint vs innovator.fingerprint: same seed, different world.
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
   */
  async simulate(
    leader: LeaderConfig,
    options: WorldModelSimulateOptions = {},
    keyPersonnel: KeyPersonnel[] = [],
  ): Promise<RunArtifact> {
    return runSimulation(leader, keyPersonnel, {
      ...options,
      scenario: this.scenario,
    });
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
}
