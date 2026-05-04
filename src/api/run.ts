/**
 * Top-level v0.9 shortcuts. Wrap WorldModel.fromPrompt + quickstart so
 * the most common use case ("free-text brief → N runs") fits in one
 * line. For fork/replay/intervene workflows, callers pull the
 * `wm` handle out of the runMany result.
 *
 * @module paracosm/api/run
 */
import type { RunOptions, RunManyOptions, RunManyResult } from './types.js';
import type { ScenarioPackage } from '../engine/types.js';
import type { RunArtifact } from '../engine/schema/types.js';
import { WorldModel } from '../runtime/world-model/index.js';

/**
 * Run one simulation from a prompt, URL, or pre-compiled scenario.
 * Returns the artifact directly. For fork/replay use `runMany` (which
 * exposes the WorldModel handle) or `WorldModel.fromPrompt` directly.
 *
 * @public
 */
export async function run(
  prompt: string | URL | ScenarioPackage,
  opts: RunOptions = {},
): Promise<RunArtifact> {
  // Internally still uses runMany so we get the same one-WM, one-compile
  // semantics; we just discard the wm handle and return the first artifact.
  // count must be >= 2 to satisfy WorldModel.quickstart's range, so we
  // request 2 and slice to the first artifact.
  const result = await runMany(prompt, { ...opts, count: 2 });
  return result.runs[0].artifact;
}

/**
 * Run N parallel simulations from a prompt, URL, or pre-compiled
 * scenario. Returns the WorldModel handle (so callers can fork after),
 * the compiled scenario (so callers don't recompile), and one
 * `{ actor, artifact }` per run.
 *
 * @public
 */
export async function runMany(
  prompt: string | URL | ScenarioPackage,
  opts: RunManyOptions = {},
): Promise<RunManyResult> {
  const wm = await resolveWorldModel(prompt, opts);
  const quickstartResult = await wm.quickstart({
    actorCount: opts.count ?? 3,
    seed: opts.seed,
    maxTurns: opts.maxTurns,
    captureSnapshots: opts.captureSnapshots ?? true,
    provider: opts.provider,
  });
  const runs = quickstartResult.actors.map((actor, i) => ({
    actor,
    artifact: quickstartResult.artifacts[i],
  }));
  return { scenario: quickstartResult.scenario, wm, runs };
}

async function resolveWorldModel(
  prompt: string | URL | ScenarioPackage,
  opts: RunManyOptions,
): Promise<WorldModel> {
  if (typeof prompt === 'string') {
    return WorldModel.fromPrompt(
      { seedText: prompt },
      { cacheDir: opts.cacheDir },
    );
  }
  if (prompt instanceof URL) {
    return WorldModel.fromPrompt(
      { seedText: '', sourceUrl: prompt.toString() },
      { cacheDir: opts.cacheDir },
    );
  }
  // Pre-compiled scenario — synchronous factory.
  return WorldModel.fromScenario(prompt);
}
