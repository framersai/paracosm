#!/usr/bin/env -S npx tsx
/**
 * Cookbook end-to-end runner.
 *
 * Exercises the full paracosm public API against one creative scenario
 * (an AI Lab Director facing a model-release decision) and persists the
 * input + output JSON for every step under `output/cookbook/`. The doc
 * `docs/COOKBOOK.md` embeds excerpts from these files so readers see real
 * wire shapes instead of hand-written examples.
 *
 * Steps:
 *   1. WorldModel.fromPrompt({ seedText, domainHint })
 *   2. wm.quickstart({ actorCount: 3 })
 *   3. wm.forkFromArtifact(trunk, atTurn=1).simulate(altActor)
 *   4. wm.replay(trunk)
 *   5. POST /simulate (in-process server)
 *   6. wm.simulateIntervention(subject, intervention, actor)
 *   7. runBatch({ scenarios, actors, turns })
 *
 * Cost ceiling: $5 (economy preset, short runs). Aborts if any single
 * artifact exceeds $1.
 *
 * Invocation: `npx tsx scripts/cookbook-e2e.ts`
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorldModel } from '../src/runtime/world-model/index.js';
import { runBatch } from '../src/runtime/batch.js';
import { compileScenario } from '../src/engine/compiler/index.js';
import { marsScenario } from '../src/engine/mars/index.js';
import type { ActorConfig } from '../src/engine/types.js';
import type { RunArtifact, SubjectConfig, InterventionConfig } from '../src/engine/schema/index.js';
import { createMarsServer } from '../src/cli/server-app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT, 'output', 'cookbook');

const COST_CEILING_PER_ARTIFACT_USD = 1.0;
const COST_CEILING_TOTAL_USD = 5.0;

function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

function loadEnv(): void {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([^#=]+?)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function persist(filename: string, value: unknown): string {
  const path = join(OUTPUT_DIR, filename);
  writeFileSync(path, JSON.stringify(value, null, 2));
  return path;
}

/**
 * Canonicalize an optional fingerprint Record into a short stable string.
 * RunArtifact.fingerprint is `Record<string, string | number> | undefined`
 * (loose classification scores per scenario); this helper just turns it
 * into a stable comparable digest for log lines.
 */
function fpDigest(fp: Record<string, string | number> | undefined): string {
  if (!fp) return '<none>';
  return Object.keys(fp).sort().map(k => `${k}=${fp[k]}`).join('|');
}

/**
 * Strip `hooks` (functions) and per-turn snapshots from a scenario so
 * the captured JSON is small and readable. Keeps everything a consumer
 * would actually inspect: id, labels, setup, departments, metrics,
 * theme, knowledgeBundle.
 */
function summarizeScenario(scenario: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ['id', 'labels', 'setup', 'departments', 'metrics', 'theme']) {
    if (scenario[k] !== undefined) out[k] = scenario[k];
  }
  const kb = (scenario as { knowledgeBundle?: { topics?: unknown[]; categories?: unknown[]; citations?: unknown[] } }).knowledgeBundle;
  if (kb) {
    out.knowledgeBundle = {
      topicCount: Array.isArray(kb.topics) ? kb.topics.length : 0,
      categoryCount: Array.isArray(kb.categories) ? kb.categories.length : 0,
      citationCount: Array.isArray(kb.citations) ? kb.citations.length : 0,
      sampleTopic: Array.isArray(kb.topics) && kb.topics.length > 0 ? kb.topics[0] : null,
    };
  }
  return out;
}

/**
 * Reduce a RunArtifact to the fields a cookbook reader cares about:
 * fingerprint, metadata, finalState.metrics, decision summary,
 * trajectory shape, cost, fork lineage. Drops the per-turn deep state
 * arrays which can be megabytes.
 */
function summarizeArtifact(a: RunArtifact): Record<string, unknown> {
  return {
    fingerprint: a.fingerprint,
    metadata: a.metadata,
    finalState: { metrics: a.finalState?.metrics ?? null },
    trajectory: a.trajectory ? {
      mode: a.metadata.mode,
      timeUnit: a.trajectory.timeUnit,
      timepointCount: a.trajectory.timepoints?.length ?? 0,
      sampleTimepoint: a.trajectory.timepoints?.[0] ?? null,
    } : null,
    decisionCount: a.decisions?.length ?? 0,
    sampleDecision: a.decisions?.[0] ?? null,
    forgedToolCount: a.forgedTools?.length ?? 0,
    citationCount: a.citations?.length ?? 0,
    cost: a.cost ?? null,
    subject: a.subject ?? null,
    intervention: a.intervention ?? null,
    aborted: a.aborted ?? false,
    providerError: a.providerError ?? null,
  };
}

/* ─────────────────────────── seed material ─────────────────────────── */

const AI_LAB_BRIEF = `
Q4 2026 board brief. The lab is preparing to release Atlas-7, a frontier
multimodal model that scored 84% on AlignmentBench-2026 (industry median
71%). Two evaluators have flagged concerns: (1) a 4.2% rate of
specification gaming on long-horizon agentic tasks, (2) early evidence
of mesa-objectives during fine-tuning that shifted under DPO. The
release window opens Dec 15. Holding the release means the rival lab's
weaker model (78% AlignmentBench) ships first and captures enterprise
deals worth ~$240M ARR. Releasing on schedule means accepting the risk
of post-deployment incident reports the safety team thinks are
plausible at the 5-10% level.

The director chairs a council of department leads: Alignment, Capability,
Policy, Infrastructure, Comms. Each has agency to escalate or block.
The director's HEXACO profile shapes how they weight specialist input,
how aggressively they push deadlines, and how they read ambiguous
evaluator signals.
`.trim();

/* ─────────────────────────── steps ─────────────────────────── */

async function step1FromPrompt(): Promise<void> {
  // WorldModel.fromPrompt drafts a paracosm ScenarioPackage from a free-text
  // brief plus a domain hint. The cookbook captures the compiled JSON shape
  // so readers see what fromPrompt actually produces. Runtime stability of
  // the freshly-LLM-generated hooks varies by model; subsequent steps run
  // against the known-good corporate-quarterly scenario for clean
  // input-output captures across the rest of the public API.
  log('\n[1/7] WorldModel.fromPrompt: draft a scenario from a free-text brief');
  const t0 = Date.now();
  const wm = await WorldModel.fromPrompt(
    {
      seedText: AI_LAB_BRIEF,
      domainHint: 'AI safety lab leadership decision under release pressure',
    },
    {
      provider: 'openai',
      model: 'gpt-5.4-nano',
      draftProvider: 'openai',
      draftModel: 'gpt-5.4-mini',
      webSearch: false,
      onProgress: (hook, status) => log(`  [${status.padEnd(10)}] ${hook}`),
    },
  );
  log(`  scenario: ${wm.scenario.labels.name} (${wm.scenario.id})`);
  log(`  departments: ${wm.scenario.departments.map(d => d.label).join(', ')}`);
  log(`  metrics: ${wm.scenario.metrics.map(m => m.id).join(', ')}`);
  log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  persist('01-input-fromPrompt.json', {
    seedText: AI_LAB_BRIEF,
    domainHint: 'AI safety lab leadership decision under release pressure',
    options: { provider: 'openai', model: 'gpt-5.4-nano', draftProvider: 'openai', draftModel: 'gpt-5.4-mini', webSearch: false },
  });
  persist('01-output-scenario-package.json', summarizeScenario(wm.scenario as unknown as Record<string, unknown>));
}

/**
 * Compile + load the corporate-quarterly scenario. Used for steps 2-7 so
 * the runtime captures aren't blocked by freshly-LLM-generated hook
 * fragility. The corporate-quarterly hooks are cached on disk under
 * `.paracosm/cache/corporate-quarterly-v1.0.0/`.
 */
async function loadKnownGoodWorld(): Promise<WorldModel> {
  log('\n[1b/7] Load corporate-quarterly.json (cached compile) for runtime steps');
  const t0 = Date.now();
  const scenarioPath = join(ROOT, 'scenarios', 'corporate-quarterly.json');
  const worldJson = JSON.parse(readFileSync(scenarioPath, 'utf8')) as Record<string, unknown>;
  const compiled = await compileScenario(worldJson, {
    provider: 'openai',
    model: 'gpt-5.4-nano',
    cache: true,
  });
  log(`  scenario: ${compiled.labels.name} (${compiled.id})`);
  log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return WorldModel.fromScenario(compiled);
}

async function step2Quickstart(wm: WorldModel): Promise<{ trunk: RunArtifact; allActors: ActorConfig[]; allArtifacts: RunArtifact[] }> {
  log('\n[2/7] wm.quickstart: auto-generated actors run in parallel');
  const t0 = Date.now();
  const result = await wm.quickstart({
    actorCount: 3,
    maxTurns: 3,
    seed: 42,
    captureSnapshots: true,
    provider: 'openai',
    model: 'gpt-5.4-nano',
  });
  log(`  generated ${result.actors.length} actors: ${result.actors.map(a => `${a.name} (${a.archetype})`).join(', ')}`);
  result.artifacts.forEach((a, i) => {
    log(`  [${result.actors[i].name}] fingerprint=${fpDigest(a.fingerprint)} cost=$${(a.cost?.totalUSD ?? 0).toFixed(3)}`);
    if ((a.cost?.totalUSD ?? 0) > COST_CEILING_PER_ARTIFACT_USD) {
      throw new Error(`Per-artifact cost ceiling exceeded for ${result.actors[i].name}: $${a.cost?.totalUSD}`);
    }
  });
  log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  persist('02-input-quickstart-options.json', {
    actorCount: 3, maxTurns: 3, seed: 42, captureSnapshots: true,
    provider: 'openai', model: 'gpt-5.4-nano',
  });
  persist('02-output-actors.json', result.actors);
  persist('02-output-artifacts.json', result.artifacts.map(summarizeArtifact));

  return { trunk: result.artifacts[0], allActors: result.actors, allArtifacts: result.artifacts };
}

async function step3Fork(wm: WorldModel, trunk: RunArtifact, altActor: ActorConfig): Promise<RunArtifact> {
  log('\n[3/7] wm.forkFromArtifact: branch at turn 1 with a different actor');
  const t0 = Date.now();
  const branchWm = await wm.forkFromArtifact(trunk, 1);
  const branch = await branchWm.simulate(altActor, {
    maxTurns: 3,
    seed: 42,
    captureSnapshots: true,
    provider: 'openai',
    costPreset: 'economy',
  });
  const trunkFp = fpDigest(trunk.fingerprint);
  const branchFp = fpDigest(branch.fingerprint);
  log(`  parent runId: ${trunk.metadata.runId}`);
  log(`  branch.metadata.forkedFrom: ${JSON.stringify(branch.metadata.forkedFrom)}`);
  log(`  trunk fingerprint: ${trunkFp}`);
  log(`  branch fingerprint: ${branchFp}`);
  log(`  divergence: ${trunkFp === branchFp ? 'IDENTICAL (unexpected)' : 'YES (expected)'}`);
  log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  persist('03-input-fork.json', {
    parentRunId: trunk.metadata.runId,
    atTurn: 1,
    altActor: { name: altActor.name, archetype: altActor.archetype, hexaco: altActor.hexaco },
    branchOptions: { maxTurns: 3, seed: 42, captureSnapshots: true, provider: 'openai', costPreset: 'economy' },
  });
  persist('03-output-branch.json', summarizeArtifact(branch));
  return branch;
}

async function step4Replay(wm: WorldModel, trunk: RunArtifact): Promise<void> {
  log('\n[4/7] wm.replay: verify kernel determinism (no LLM calls)');
  const t0 = Date.now();
  const replay = await wm.replay(trunk);
  log(`  matches: ${replay.matches}`);
  log(`  divergence: ${replay.divergence || '(none)'}`);
  log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  persist('04-input-replay.json', { artifactRunId: trunk.metadata.runId });
  persist('04-output-replay-result.json', { matches: replay.matches, divergence: replay.divergence });
}

async function step5HttpSimulate(wm: WorldModel, actor: ActorConfig): Promise<void> {
  log('\n[5/7] POST /simulate: in-process server, real curl-equivalent fetch');
  const t0 = Date.now();

  const env = { ...process.env, PARACOSM_ENABLE_SIMULATE_ENDPOINT: 'true' };
  const server = createMarsServer({ env });
  await new Promise<void>((resolve) => { server.listen(0, () => resolve()); });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Server failed to bind');
  const port = addr.port;
  log(`  server bound to localhost:${port}`);

  const requestBody = {
    scenario: wm.scenario,
    actor,
    options: {
      maxTurns: 2,
      seed: 7,
      captureSnapshots: false,
      provider: 'openai' as const,
      costPreset: 'economy' as const,
    },
  };

  try {
    const res = await fetch(`http://localhost:${port}/simulate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenAI-Key': process.env.OPENAI_API_KEY ?? '',
      },
      body: JSON.stringify(requestBody),
    });

    log(`  HTTP ${res.status} ${res.statusText}`);
    const body = await res.json() as { artifact?: RunArtifact; durationMs?: number; error?: string };

    if (!res.ok) {
      log(`  body: ${JSON.stringify(body).slice(0, 300)}`);
      throw new Error(`/simulate returned ${res.status}: ${body.error ?? 'unknown'}`);
    }

    log(`  durationMs: ${body.durationMs}`);
    log(`  artifact.fingerprint: ${fpDigest(body.artifact?.fingerprint)}`);
    log(`  artifact.cost: $${body.artifact?.cost?.totalUSD?.toFixed(3) ?? '?'}`);

    persist('05-input-http-simulate.json', {
      curl: `curl -X POST http://localhost:${port}/simulate \\\n  -H 'Content-Type: application/json' \\\n  -H 'X-OpenAI-Key: sk-...' \\\n  -d <body>`,
      requestBody: {
        scenario: '<full scenario object: see 01-output-scenario-package.json>',
        actor,
        options: requestBody.options,
      },
    });
    persist('05-output-http-simulate.json', {
      status: res.status,
      durationMs: body.durationMs,
      artifact: body.artifact ? summarizeArtifact(body.artifact) : null,
    });
  } finally {
    await new Promise<void>((resolve) => { server.close(() => resolve()); });
    log(`  server closed`);
  }
  log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

async function step6DigitalTwin(wm: WorldModel, actor: ActorConfig): Promise<RunArtifact> {
  log('\n[6/7] wm.simulateIntervention: digital-twin pattern');
  const t0 = Date.now();
  const subject: SubjectConfig = {
    id: 'frontier-lab-2026',
    name: 'Atlas Lab',
    profile: { foundedYear: 2018, headcount: 480, modelGen: 'Atlas-7', alignmentBench: 0.84 },
    signals: [
      { label: 'AlignmentBench-2026', value: 0.84, unit: 'score', recordedAt: '2026-11-01T00:00:00Z' },
      { label: 'spec-gaming-rate', value: 0.042, unit: 'fraction', recordedAt: '2026-11-15T00:00:00Z' },
    ],
    markers: [
      { id: 'flagship-multimodal', category: 'capability', value: 'true' },
    ],
  };
  const intervention: InterventionConfig = {
    id: 'delay-90d',
    name: '90-day release delay',
    description: 'Hold Atlas-7 release 90 days for additional red-team and DPO mitigation passes.',
    duration: { value: 90, unit: 'days' },
    adherenceProfile: { expected: 1.0 },
  };

  const artifact = await wm.simulateIntervention(subject, intervention, actor, {
    maxTurns: 2,
    seed: 11,
    provider: 'openai',
    costPreset: 'economy',
  });

  log(`  subject: ${artifact.subject?.name} (${artifact.subject?.id})`);
  log(`  intervention: ${artifact.intervention?.name} (${artifact.intervention?.id})`);
  log(`  fingerprint: ${fpDigest(artifact.fingerprint)}`);
  log(`  cost: $${artifact.cost?.totalUSD?.toFixed(3) ?? '?'}`);
  log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  persist('06-input-digital-twin.json', { subject, intervention, actor: { name: actor.name, archetype: actor.archetype, hexaco: actor.hexaco }, options: { maxTurns: 2, seed: 11, provider: 'openai', costPreset: 'economy' } });
  persist('06-output-digital-twin-artifact.json', summarizeArtifact(artifact));
  return artifact;
}

async function step7Batch(wm: WorldModel, actors: ActorConfig[]): Promise<void> {
  log('\n[7/7] runBatch: N scenarios x M actors manifest');
  const t0 = Date.now();
  // marsScenario is already a compiled ScenarioPackage exported from
  // paracosm/mars; no recompile needed.
  const compiledMars = marsScenario;
  log(`  scenarios: [${wm.scenario.id}, ${compiledMars.id}]`);
  log(`  actors: [${actors.map(l => l.name).join(', ')}]`);

  const manifest = await runBatch({
    scenarios: [wm.scenario, compiledMars],
    actors: actors.slice(0, 2),
    turns: 2,
    seed: 950,
    maxConcurrency: 2,
    provider: 'openai',
    costPreset: 'economy',
  });

  log(`  results: ${manifest.results.length} runs`);
  manifest.results.forEach(r => {
    const fpHash = (r.fingerprint as Record<string, string>).hash ?? Object.values(r.fingerprint)[0] ?? '';
    log(`    ${r.scenarioId} x ${r.actor}: fingerprint=${String(fpHash).slice(0, 16)}...`);
  });
  log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  persist('07-input-batch-config.json', {
    scenarios: [wm.scenario.id, compiledMars.id],
    actors: actors.slice(0, 2).map(l => ({ name: l.name, archetype: l.archetype, hexaco: l.hexaco })),
    turns: 2, seed: 950, maxConcurrency: 2, provider: 'openai', costPreset: 'economy',
  });
  persist('07-output-batch-manifest.json', {
    timestamp: manifest.timestamp,
    config: manifest.config,
    totalDuration: manifest.totalDuration,
    results: manifest.results.map(r => {
      const out = r.output as RunArtifact;
      return {
        scenarioId: r.scenarioId,
        scenarioVersion: r.scenarioVersion,
        actor: r.actor,
        seed: r.seed,
        turns: r.turns,
        fingerprint: r.fingerprint,
        durationMs: r.duration,
        cost: out.cost ?? null,
        finalMetrics: out.finalState?.metrics ?? null,
      };
    }),
  });
}

/* ─────────────────────────── main ─────────────────────────── */

async function main(): Promise<void> {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    log('FATAL: neither ANTHROPIC_API_KEY nor OPENAI_API_KEY set in environment');
    process.exit(1);
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });
  log(`output dir: ${OUTPUT_DIR}`);

  const totalStart = Date.now();
  let totalCost = 0;
  const trackCost = (a: RunArtifact | null | undefined): void => {
    totalCost += a?.cost?.totalUSD ?? 0;
  };

  // Resume mode: when output/cookbook/02-output-actors.json exists,
  // skip steps 1-4 (which are deterministic given OPENAI seed and idempotent
  // on output) and reuse the captured actors for steps 5-7. Lets a partial
  // run that aborted on /simulate or batch be re-driven without re-paying
  // for the expensive quickstart simulations. Set FORCE=1 to override.
  const resumeAvailable = !process.env.FORCE && existsSync(join(OUTPUT_DIR, '02-output-actors.json'));
  let wm: WorldModel;
  let allActors: ActorConfig[];
  if (resumeAvailable) {
    log('\n[resume] reusing captured actors + scenario from prior run');
    wm = await loadKnownGoodWorld();
    allActors = JSON.parse(readFileSync(join(OUTPUT_DIR, '02-output-actors.json'), 'utf8')) as ActorConfig[];
  } else {
    await step1FromPrompt();
    wm = await loadKnownGoodWorld();
    const r = await step2Quickstart(wm);
    r.allArtifacts.forEach(trackCost);
    const branch = await step3Fork(wm, r.trunk, r.allActors[1]);
    trackCost(branch);
    await step4Replay(wm, r.trunk);
    allActors = r.allActors;
  }
  await step5HttpSimulate(wm, allActors[0]);
  const dt = await step6DigitalTwin(wm, allActors[0]);
  trackCost(dt);
  await step7Batch(wm, allActors);

  log(`\n[done] total wall: ${((Date.now() - totalStart) / 1000).toFixed(1)}s, total cost (tracked): $${totalCost.toFixed(3)}`);
  if (totalCost > COST_CEILING_TOTAL_USD) {
    log(`WARNING: total cost $${totalCost.toFixed(3)} exceeded ceiling $${COST_CEILING_TOTAL_USD}`);
  }
  log(`captured JSON written to ${OUTPUT_DIR}`);
}

main().catch((err: unknown) => {
  process.stderr.write(`\nFATAL: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
