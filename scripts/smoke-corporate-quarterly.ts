#!/usr/bin/env -S npx tsx
/**
 * F23.2 smoke test — validates that the corporate-quarterly scenario
 * runs end-to-end post-F23 and the returned artifact carries quarterly
 * time-unit metadata with no legacy `year`-family keys.
 *
 * Invocation: `npx tsx scripts/smoke-corporate-quarterly.ts`
 * Cost: ~$0.40-0.60 on OpenAI economy preset.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileScenario } from '../src/engine/compiler/index.js';
import { runSimulation } from '../src/runtime/index.js';
import { RunArtifactSchema, type RunArtifact } from '../src/engine/schema/index.js';
import type { ActorConfig } from '../src/engine/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SCENARIO_PATH = join(ROOT, 'scenarios', 'corporate-quarterly.json');
const OUTPUT_DIR = join(ROOT, 'output');
const CACHE_DIR = join(ROOT, '.paracosm', 'cache');

/** Legacy year-family keys that must not appear anywhere in a post-F23 artifact. */
const FORBIDDEN_KEYS = ['year', 'startYear', 'currentYear', 'yearDelta', 'birthYear', 'deathYear'] as const;

/** Per-leader artifact cost ceiling; smoke aborts if exceeded. */
const COST_CEILING_USD_PER_LEADER = 0.5;

function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

/** Deep-scan a JSON-serializable value for any forbidden key. Returns the
 *  first path that hits one, or null if clean. */
function findForbiddenKey(value: unknown, path: string[] = []): string | null {
  if (value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findForbiddenKey(value[i], [...path, String(i)]);
      if (hit) return hit;
    }
    return null;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if ((FORBIDDEN_KEYS as readonly string[]).includes(k)) {
      return [...path, k].join('.');
    }
    const hit = findForbiddenKey(v, [...path, k]);
    if (hit) return hit;
  }
  return null;
}

/** Bust any cached compiled hooks for the given scenario id so the smoke
 *  actually exercises the compile path rather than reading a stale hook. */
function bustCompileCache(scenarioId: string): void {
  if (!existsSync(CACHE_DIR)) return;
  for (const entry of readdirSync(CACHE_DIR)) {
    if (entry.includes(scenarioId)) {
      rmSync(join(CACHE_DIR, entry), { recursive: true, force: true });
      log(`  cache-bust: removed ${entry}`);
    }
  }
}

/** Throw if the assertion is false. */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function main(): Promise<void> {
  log('--- F23.2 corporate-quarterly smoke ---');

  // 1. Load scenario JSON.
  const worldJson = JSON.parse(readFileSync(SCENARIO_PATH, 'utf8')) as Record<string, unknown>;
  const scenarioId = worldJson.id as string;
  const setup = worldJson.setup as Record<string, unknown>;
  const labels = worldJson.labels as Record<string, string>;
  const preset = (worldJson.presets as Array<{ leaders: ActorConfig[] }>)[0];
  const actors = preset.leaders;
  log(`scenario: ${labels.name} (id=${scenarioId})`);
  log(`timeUnitNoun: ${labels.timeUnitNoun} / ${labels.timeUnitNounPlural}`);
  log(`defaultStartTime=${setup.defaultStartTime} defaultTimePerTurn=${setup.defaultTimePerTurn}`);
  log(`leaders: ${actors.map(l => l.name).join(' vs ')}`);

  // 2. Bust compile cache so we exercise the compile path.
  bustCompileCache(scenarioId);

  // 3. Compile the scenario.
  log('\n[compile] generating hooks via OpenAI gpt-5.4-nano...');
  const compileStart = Date.now();
  const scenario = await compileScenario(worldJson, {
    provider: 'openai',
    model: 'gpt-5.4-nano',
    cache: true,
    cacheDir: CACHE_DIR,
    webSearch: false,
    onProgress: (hookName, status) => log(`  [${status.padEnd(10)}] ${hookName}`),
  });
  log(`[compile] done in ${((Date.now() - compileStart) / 1000).toFixed(1)}s`);

  // 4. Run both leaders in parallel for 2 turns on economy preset.
  //    No explicit startTime/timePerTurn — runSimulation falls back to
  //    scenario.setup.defaultStartTime / defaultTimePerTurn when omitted,
  //    so the scenario's declared cadence flows through automatically.
  const MAX_TURNS = 2;
  const SEED = 42;
  const expectedStart = setup.defaultStartTime as number;
  const expectedStep = setup.defaultTimePerTurn as number;
  log(`\n[run] launching ${actors.length} leaders in parallel for ${MAX_TURNS} turns (seed=${SEED}, scenario defaults startTime=${expectedStart}, timePerTurn=${expectedStep})`);
  const runStart = Date.now();
  const artifacts: RunArtifact[] = await Promise.all(
    actors.map(leader => runSimulation(leader, [], {
      scenario,
      maxTurns: MAX_TURNS,
      seed: SEED,
      costPreset: 'economy',
      provider: 'openai',
      onEvent: (e) => {
        if (e.type === 'turn_start') {
          const d = e.data as { turn?: number; time?: number };
          log(`  [${leader.name}] turn ${d.turn} start @ ${labels.timeUnitNoun} ${d.time}`);
        }
        if (e.type === 'decision_made') {
          const d = e.data as { choice?: string; outcome?: string };
          log(`  [${leader.name}] decision: "${d.choice}" → ${d.outcome}`);
        }
      },
    }))
  );
  log(`[run] both completed in ${((Date.now() - runStart) / 1000).toFixed(1)}s`);

  // 5. Persist artifacts.
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (let i = 0; i < actors.length; i++) {
    const path = join(OUTPUT_DIR, `smoke-corporate-quarterly-${slug(actors[i].name)}-${timestamp}.json`);
    writeFileSync(path, JSON.stringify(artifacts[i], null, 2));
    log(`  saved: ${path}`);
  }

  // 6. Assertions per artifact.
  log('\n[assert] validating both artifacts');
  for (let i = 0; i < artifacts.length; i++) {
    const a = artifacts[i];
    const actorName = actors[i].name;
    log(`  [${actorName}]`);

    // 6a. Schema parse.
    RunArtifactSchema.parse(a);
    log(`    schema.parse  ✓`);

    // 6b. timeUnit fields.
    assert(a.trajectory?.timeUnit?.singular === labels.timeUnitNoun,
      `${actorName}: trajectory.timeUnit.singular expected "${labels.timeUnitNoun}", got "${a.trajectory?.timeUnit?.singular}"`);
    assert(a.trajectory?.timeUnit?.plural === labels.timeUnitNounPlural,
      `${actorName}: trajectory.timeUnit.plural expected "${labels.timeUnitNounPlural}", got "${a.trajectory?.timeUnit?.plural}"`);
    log(`    timeUnit      ✓ (${a.trajectory!.timeUnit.singular}/${a.trajectory!.timeUnit.plural})`);

    // 6c. Trajectory timepoints advance monotonically by `timePerTurn`.
    //     `Timepoint.time` stamps the start of each turn (pre-advance), so
    //     for N turns starting at startTime with step k, we expect
    //     times = [startTime, startTime+k, ..., startTime+(N-1)*k].
    const timepoints = a.trajectory?.timepoints ?? [];
    assert(timepoints.length === MAX_TURNS,
      `${actorName}: expected ${MAX_TURNS} timepoints, got ${timepoints.length}`);
    for (let j = 0; j < timepoints.length; j++) {
      const expected = expectedStart + j * expectedStep;
      assert(timepoints[j].time === expected,
        `${actorName}: timepoint[${j}].time expected ${expected}, got ${timepoints[j].time}`);
    }
    log(`    timepoints    ✓ (${timepoints.map(tp => tp.time).join(' -> ')})`);

    // 6d. finalState.metrics populated (rebucketed from .systems).
    assert(typeof a.finalState?.metrics?.population === 'number',
      `${actorName}: finalState.metrics.population missing or non-numeric`);
    log(`    finalState    ✓ (population=${a.finalState!.metrics.population})`);

    // 6e. Deep-scan for forbidden legacy year-family keys.
    const forbidden = findForbiddenKey(a);
    assert(forbidden === null,
      `${actorName}: forbidden year-family key found at path "${forbidden}"`);
    log(`    no-year-keys  ✓`);

    // 6f. Cost ceiling.
    const cost = a.cost?.totalUSD ?? 0;
    assert(cost <= COST_CEILING_USD_PER_LEADER,
      `${actorName}: cost ${cost.toFixed(4)} exceeded ceiling ${COST_CEILING_USD_PER_LEADER}`);
    log(`    cost          ✓ ($${cost.toFixed(4)})`);
  }

  const totalCost = artifacts.reduce((s, a) => s + (a.cost?.totalUSD ?? 0), 0);
  log(`\n[done] all assertions passed. total spend: $${totalCost.toFixed(4)}`);
}

main().catch((err: unknown) => {
  process.stderr.write(`FATAL: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
