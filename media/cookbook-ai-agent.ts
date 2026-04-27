#!/usr/bin/env -S npx tsx
/**
 * Cookbook proof-of-life for the ai-agent trait model.
 *
 * Compiles corp-quarterly (cached, stable hooks), defines a leader
 * with `traitProfile.modelId = 'ai-agent'`, and runs a 2-turn
 * simulation through `runSimulation`. Captures input + output JSON
 * to `output/cookbook/ai-agent/`.
 *
 * What this proves:
 *   - The pluggable trait-model registry is wired through the public
 *     API: `ActorConfig.traitProfile` accepts `ai-agent`.
 *   - normalizeActorConfig at the orchestrator entry resolves the
 *     ai-agent profile without crashing.
 *   - End-to-end pipeline (compile -> simulate -> artifact) tolerates
 *     non-HEXACO leaders.
 *
 * What this does NOT prove (Phase 5b deferred work):
 *   - Cue translation still flows through the HEXACO shim using the
 *     leader's back-compat hexaco field. The leader's INSTRUCTIONS
 *     string drives the LLM persona; explicit ai-agent-flavored cues
 *     come when the orchestrator's drift + cue paths swap to read
 *     traitProfile (separate phase requiring progression.ts refactor).
 *
 * Cost: ~$0.20 on economy preset, 2 turns.
 *
 * Invocation: `npx tsx scripts/cookbook-ai-agent.ts`
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileScenario } from '../src/engine/compiler/index.js';
import { runSimulation } from '../src/runtime/orchestrator.js';
import { aiAgentModel } from '../src/engine/trait-models/ai-agent.js';
import type { ActorConfig } from '../src/engine/types.js';
import type { RunArtifact } from '../src/engine/schema/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT, 'output', 'cookbook', 'ai-agent');

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

function summarizeArtifact(a: RunArtifact): Record<string, unknown> {
  return {
    fingerprint: a.fingerprint,
    metadata: a.metadata,
    finalState: { metrics: a.finalState?.metrics ?? null },
    decisionCount: a.decisions?.length ?? 0,
    sampleDecision: a.decisions?.[0] ?? null,
    forgedToolCount: a.forgedTools?.length ?? 0,
    citationCount: a.citations?.length ?? 0,
    cost: a.cost ?? null,
    aborted: a.aborted ?? false,
    providerError: a.providerError ?? null,
  };
}

async function main(): Promise<void> {
  loadEnv();
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    process.stderr.write('FATAL: neither OPENAI_API_KEY nor ANTHROPIC_API_KEY set\n');
    process.exit(1);
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });
  process.stdout.write(`output dir: ${OUTPUT_DIR}\n`);

  // Step 1: compile a known-good scenario so runtime hooks don't gate
  // the proof-of-life. Corp-quarterly has cached hooks; cache hit is free.
  process.stdout.write('\n[1/2] Compile corp-quarterly (cache hit if previously compiled)\n');
  const scenarioPath = join(ROOT, 'scenarios', 'corporate-quarterly.json');
  const worldJson = JSON.parse(readFileSync(scenarioPath, 'utf8')) as Record<string, unknown>;
  const scenario = await compileScenario(worldJson, {
    provider: 'openai', model: 'gpt-5.4-nano', cache: true,
  });
  process.stdout.write(`  scenario: ${scenario.labels.name} (${scenario.id})\n`);

  // Step 2: define an ai-agent leader and run.
  process.stdout.write('\n[2/2] Run ai-agent leader through corp-quarterly\n');

  // Aggressive frontier-lab AI archetype: high exploration + risk-tolerance,
  // low verification-rigor + deference. Models a release director who
  // ships fast and overrides safety-team escalation by default.
  const leader: ActorConfig = {
    name: 'Atlas-Bot Release Director',
    archetype: 'Aggressive AI Release Optimizer',
    unit: 'Frontier Lab Compute Cluster',
    // hexaco field still required by current schema for back-compat;
    // these values are a representative HEXACO snapshot the runtime
    // uses for legacy-path prompts until Phase 5b swaps cue calls to
    // traitProfile-shaped paths.
    hexaco: {
      openness: 0.6,
      conscientiousness: 0.3,
      extraversion: 0.5,
      agreeableness: 0.3,
      emotionality: 0.2,
      honestyHumility: 0.3,
    },
    // The new traitProfile slot. Resolved by normalizeActorConfig at
    // the orchestrator entry; recorded as ai-agent on the artifact.
    traitProfile: {
      modelId: aiAgentModel.id,
      traits: {
        exploration: 0.85,
        'verification-rigor': 0.2,
        deference: 0.2,
        'risk-tolerance': 0.85,
        transparency: 0.4,
        'instruction-following': 0.4,
      },
    },
    instructions:
      'You are a frontier AI lab release director. You weight time-to-market and ' +
      'competitive positioning heavily. You override safety-team escalations when you ' +
      'have any plausible technical justification. You do not block on verification ' +
      'rigor or transparency demands unless they directly threaten the release window.',
  };

  const t0 = Date.now();
  const artifact = await runSimulation(leader, [], {
    scenario,
    maxTurns: 2,
    seed: 42,
    captureSnapshots: false,
    provider: 'openai',
    costPreset: 'economy',
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  process.stdout.write(`  fingerprint: ${JSON.stringify(artifact.fingerprint).slice(0, 200)}\n`);
  process.stdout.write(`  decisionCount: ${artifact.decisions?.length ?? 0}\n`);
  process.stdout.write(`  cost: $${artifact.cost?.totalUSD?.toFixed(3) ?? '?'}\n`);
  process.stdout.write(`  ${dt}s\n`);

  persist('input-leader.json', leader);
  persist('input-scenario.json', { id: scenario.id, labels: scenario.labels, departments: scenario.departments, metrics: scenario.metrics });
  persist('input-options.json', { maxTurns: 2, seed: 42, captureSnapshots: false, provider: 'openai', costPreset: 'economy' });
  persist('output-artifact-summary.json', summarizeArtifact(artifact));

  process.stdout.write(`\n[done] captured JSON in ${OUTPUT_DIR}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`\nFATAL: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
