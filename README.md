<p align="center">
  <a href="https://paracosm.agentos.sh"><img src="assets/favicons/icon.svg" alt="Paracosm" height="64" /></a>
</p>

<h1 align="center">PARACOSM</h1>

<p align="center">
  <em>A structured world model for AI agents. Prompt to runnable world to forked futures.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/paracosm"><img src="https://img.shields.io/npm/v/paracosm?style=flat-square&color=e8b44a&labelColor=14110e" alt="npm" /></a>
  <a href="https://github.com/framersai/paracosm/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-e06530?style=flat-square&labelColor=14110e" alt="License" /></a>
  <a href="https://paracosm.agentos.sh/docs"><img src="https://img.shields.io/badge/docs-API%20Reference-4ca8a8?style=flat-square&labelColor=14110e" alt="Docs" /></a>
  <a href="https://agentos.sh"><img src="https://img.shields.io/badge/built%20on-AgentOS-e06530?style=flat-square&labelColor=14110e" alt="AgentOS" /></a>
</p>

<p align="center">
  <a href="https://paracosm.agentos.sh"><strong>paracosm.agentos.sh</strong></a> ·
  <a href="https://paracosm.agentos.sh/sim">Live Demo</a> ·
  <a href="https://paracosm.agentos.sh/docs">API Docs</a> ·
  <a href="https://www.npmjs.com/package/paracosm">npm</a> ·
  <a href="https://wilds.ai/discord">Discord</a>
</p>

---

Paracosm is a structured world model for AI agents. It compiles a JSON scenario draft (or a prompt, or an extracted document) into a runnable world, plays it through a deterministic kernel, and lets agents with HEXACO personality profiles decide turn by turn how the world unfolds. Snapshots persist on disk. Runs replay byte-for-byte. Any past turn can be forked with a different actor, a different seed, or a custom event, and the divergent branch streams alongside the trunk so the contrast is visible in the artifact, not promised in copy.

The product is the contrast. Same compiled world, same crises, same kernel: swap one variable and the trajectory measurably moves.

---

## Forking Paths

> "In all fictions, each time a man meets diverse alternatives, he chooses one and eliminates the others. In the work of Ts'ui Pên, he chooses, simultaneously, all of them."
>
> Jorge Luis Borges, *The Garden of Forking Paths*, 1941

A world model that can be forked needs three things: a deterministic substrate that can be rewound, an LLM reasoner that can be replayed against the same state, and a contract for what state actually means. Paracosm carries all three. Snapshots are JSON, the kernel round-trips through `JSON.stringify`, and every fork resumes from the captured state without recomputing the prefix.

```typescript
import { WorldModel } from 'paracosm/world-model';
import worldJson from './my-world.json' with { type: 'json' };

const wm = await WorldModel.fromJson(worldJson);

// Trunk run, snapshots captured at every turn
const trunk = await wm.simulate(visionaryActor, {
  maxTurns: 6, seed: 42, captureSnapshots: true,
});

// Fork at turn 3 with a different actor; turns 1 to 3 are reused, not rerun
const branch = await (await wm.forkFromArtifact(trunk, 3)).simulate(
  pragmatistActor,
  { maxTurns: 6, seed: 42 },
);

console.log(trunk.metadata.runId);        // parent run id
console.log(branch.metadata.forkedFrom);  // { parentRunId, atTurn: 3 }
console.log(trunk.fingerprint, branch.fingerprint);
```

`captureSnapshots` defaults to `false` so that ordinary runs stay lean. The dashboard flips it on for every UI run; the Reports tab shows a fork button on each completed turn, posts to `/setup` with the parent artifact, and routes the new run into a Branches tab where forks accumulate as cards with per-metric deltas as they stream.

### Replay any run for audit

```typescript
const replay = await wm.replay(storedArtifact);
console.log(replay.matches);     // true when the kernel reproduces the artifact byte for byte
console.log(replay.divergence);  // first-mismatch JSON pointer when matches=false
```

The kernel's between-turn progression hook reruns deterministically from each recorded snapshot. LLM stages are not invoked, so replay is fast and free. Use it for golden-artifact regression tests in CI, or to find the first kernel-state divergence between two paracosm versions.

---

## Personality is the variable

> "We don't want to conquer the cosmos, we only want to extend the boundaries of Earth to the frontiers of the cosmos. We don't want other worlds; we want mirrors."
>
> Stanislaw Lem, *Solaris*, 1961

Two simulation runs against an identical compiled scenario, starting from the same kernel state, produce divergent trajectories when the only thing that changes is the actor's personality. The kernel is reproducible. The divergence comes from the LLM stages reading a HEXACO profile and deciding accordingly.

Actors do not need to be people. The same authoring contract handles colony commanders, ship captains, AI release directors, governing councils, faction leaders, autonomous coordinators, or any entity whose decisions shape the world after a chain of inputs. Paracosm does not care what an actor represents. It cares how the actor decides.

```typescript
import { compileScenario } from 'paracosm/compiler';
import { runSimulation } from 'paracosm/runtime';
import worldJson from './my-world.json' with { type: 'json' };

const scenario = await compileScenario(worldJson, {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
});

const reyes = {
  name: 'Captain Reyes', archetype: 'The Pragmatist', unit: 'Station Alpha',
  hexaco: { openness: 0.4, conscientiousness: 0.9, extraversion: 0.3,
            agreeableness: 0.6, emotionality: 0.5, honestyHumility: 0.8 },
  instructions: 'You lead by protocol. Safety margins first.',
};

const okafor = {
  name: 'Captain Okafor', archetype: 'The Innovator', unit: 'Station Beta',
  hexaco: { openness: 0.9, conscientiousness: 0.4, extraversion: 0.8,
            agreeableness: 0.5, emotionality: 0.3, honestyHumility: 0.6 },
  instructions: 'You lead by experimentation. Push boundaries.',
};

const [a, b] = await Promise.all(
  [reyes, okafor].map((actor) =>
    runSimulation(actor, [], { scenario, maxTurns: 6, seed: 42 }),
  ),
);
console.log(a.fingerprint, b.fingerprint); // diverges visibly within two turns
```

Six turns is enough to surface the contrast. The fingerprint is a stable hash over the trajectory, decisions, and final metrics, so two runs are easy to diff.

---

## Quickstart: prompt or document to running simulation

`WorldModel.fromPrompt` compiles a scenario from seed source material (paste, URL, or extracted PDF text), and `wm.quickstart` then generates N contextual HEXACO actors and runs them in parallel. Both paths validate against `DraftScenarioSchema` and route into `compileScenario`. The canonical `ScenarioPackage` contract is never bypassed.

```typescript
import { WorldModel } from 'paracosm/world-model';

const wm = await WorldModel.fromPrompt({
  seedText: 'Q3 board brief: the company must decide between...',
  domainHint: 'corporate strategic decision',
});

const { actors, artifacts } = await wm.quickstart({ actorCount: 3 });
artifacts.forEach((a, i) => console.log(actors[i].name, a.fingerprint));
```

In the dashboard, Quickstart is the default landing tab. A user pastes a brief, drops a PDF, or supplies a URL, and three streaming actors arrive within a minute of first click. A curated library of ten HEXACO archetypes ships under `paracosm/leader-presets` for programmatic `runBatch` sweeps.

---

## Install

```bash
npm install paracosm   # also: pnpm add paracosm · bun add paracosm
```

Paracosm ships as pure ESM with subpath exports (`paracosm/compiler`, `paracosm/runtime`, `paracosm/mars`, `paracosm/lunar`, `paracosm/core`, `paracosm/schema`, `paracosm/world-model`, `paracosm/digital-twin`). Node 20+, Bun 1.x, and any TypeScript runner with ESM and import-attributes support resolve them out of the box.

---

## Defining a world

The authoring contract is JSON because JSON validates, diffs, caches, and snapshots. A draft can be hand-written, generated from a prompt, or grounded with `seedText` / `seedUrl`.

```json
{
  "id": "submarine-habitat",
  "labels": {
    "name": "Deep Ocean Habitat",
    "populationNoun": "crew",
    "settlementNoun": "habitat",
    "timeUnitNoun": "day",
    "currency": "credits"
  },
  "setup": {
    "defaultTurns": 8,
    "defaultPopulation": 50,
    "defaultStartTime": 2040,
    "defaultSeed": 42
  },
  "departments": [
    {
      "id": "life-support",
      "label": "Life Support",
      "role": "Chief Life Support Officer",
      "instructions": "Analyze O2 levels, CO2 scrubbing capacity, water recycling."
    },
    {
      "id": "engineering",
      "label": "Engineering",
      "role": "Chief Engineer",
      "instructions": "Analyze hull integrity, pressure systems, power generation."
    }
  ],
  "metrics": [
    { "id": "population", "format": "number" },
    { "id": "morale", "format": "percent" }
  ]
}
```

Every scenario declares its own vocabulary via `labels.populationNoun` (plural), `labels.settlementNoun` (singular), and `labels.timeUnitNoun`. The dashboard, kernel, and progression hooks pick those up everywhere user-facing copy renders. Without overrides, paracosm falls back to `colonists` / `colony` / `tick`.

Time is unit-agnostic. `setup.defaultTimePerTurn` and `setup.defaultStartTime` are plain numbers; whether they represent years, quarters, hours, or ticks is decided by `timeUnitNoun`. The dashboard turn header reads `Quarter 5`, `Day 22`, or `Year 2043` straight from the label.

---

## Compile and run

```typescript
import { compileScenario } from 'paracosm/compiler';
import { runSimulation } from 'paracosm/runtime';
import worldJson from './my-world.json' with { type: 'json' };

// First compile is roughly $0.10 and caches to disk; reruns are free
const scenario = await compileScenario(worldJson, {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
});

const result = await runSimulation(actor, [], {
  scenario,
  maxTurns: 6,
  seed: 42,
  // costPreset: 'economy',  // ~5-10× cheaper iteration on OpenAI
  onEvent(e) { console.log(actor.name, e.type, e.data.summary); },
});

console.log(result.metadata.scenario.name, '→', result.fingerprint);
console.log('cost      $', result.cost?.totalUSD.toFixed(2));
console.log('final       ', result.finalState?.metrics);
console.log('forged tools ', result.forgedTools?.length ?? 0);
console.log('citations    ', result.citations?.length ?? 0);
```

Each call to `runSimulation` takes one actor. Run one, two, or twenty. The dashboard runs two side-by-side for comparison; the API has no limit.

### Or use the dashboard

```bash
git clone https://github.com/framersai/paracosm
cd paracosm && npm install
cp .env.example .env  # add OPENAI_API_KEY or ANTHROPIC_API_KEY
npm run dashboard     # opens http://localhost:3456
```

The dashboard ships a scenario editor for writing, importing, compiling, and running custom worlds from the browser, plus the live Branches view for forks.

### Or run the standalone CLI

```bash
npm install -g paracosm

paracosm run                                        # actors.json + default scenario
paracosm run --name "Reyes" --openness 0.85 --turns 6
paracosm dashboard 6                                # auto-launch with 6 turns
paracosm compile scenarios/lunar.json --seed-url <url> --max-searches 5
paracosm init my-app --domain "Submarine crew of 8" --actors 3
```

The CLI looks for `actors.json` via `--actors`, then `./actors.json`, then `./config/actors.json`, then a bundled example. A back-compat `paracosm-dashboard` alias is shipped for existing scripts and Docker invocations.

---

## The universal result contract

Every simulation returns a `RunArtifact`: one Zod-validated shape exported from `paracosm/schema`. The same shape covers civilization sims (turn-loop), digital-twin runs (batch-trajectory), and one-shot forecasts (batch-point).

```typescript
import { RunArtifactSchema, type RunArtifact } from 'paracosm/schema';

const artifact: RunArtifact = await runSimulation(actor, [], { scenario, maxTurns: 6 });
const parsed = RunArtifactSchema.parse(artifact);   // optional dev-mode validation

switch (artifact.metadata.mode) {
  case 'turn-loop':         // civ sims: per-turn trajectory + decisions
  case 'batch-trajectory':  // digital twin: labeled timepoints over a horizon
  case 'batch-point':       // one-shot forecast: overview + risk flags
}
```

For non-TypeScript consumers, `npm run export:json-schema` emits `schema/run-artifact.schema.json` and `schema/stream-event.schema.json`. Python projects generate Pydantic types via `datamodel-codegen`; any ecosystem with a JSON-Schema generator adopts cleanly.

---

## Digital twins: subjects and interventions

For simulations that revolve around a single subject under an intervention, paracosm exposes a `DigitalTwin` subpath plus `SubjectConfig` and `InterventionConfig` as first-class input primitives.

```typescript
import { DigitalTwin } from 'paracosm/digital-twin';
import { SubjectConfigSchema, InterventionConfigSchema } from 'paracosm/schema';

const twin = await DigitalTwin.fromJson(scenarioJson);

const subject = SubjectConfigSchema.parse({
  id: 'user-42',
  name: 'Alice',
  profile: { age: 34, diet: 'mediterranean' },
  signals: [{ label: 'HRV', value: 48.2, unit: 'ms', recordedAt: '2026-04-21T08:00:00Z' }],
  markers: [{ id: 'rs4680', category: 'genome', value: 'AA' }],
});

const intervention = InterventionConfigSchema.parse({
  id: 'intv-1',
  name: 'Creatine + Sleep Hygiene',
  description: '5g daily + 11pm bedtime.',
  duration: { value: 12, unit: 'weeks' },
  adherenceProfile: { expected: 0.7 },
});

const artifact = await twin.simulateIntervention(subject, intervention, actor);
```

`DigitalTwin` is an alias of `WorldModel`. The subpath names the use case in the import path. `RunArtifact.subject` and `RunArtifact.intervention` carry through to any consumer.

---

## Trait models beyond HEXACO

Actors are not always human. Paracosm ships a `TraitModel` registry with two built-ins, and registering more is one call.

| Model       | Axes                                                                                              | For                                                                |
|-------------|---------------------------------------------------------------------------------------------------|--------------------------------------------------------------------|
| `hexaco`    | openness, conscientiousness, extraversion, agreeableness, emotionality, honesty-humility           | CEOs, captains, governors, councils, military commanders           |
| `ai-agent`  | exploration, verification-rigor, deference, risk-tolerance, transparency, instruction-following    | Frontier-lab release directors, autonomous coordinators, eval subs |

```typescript
import { runSimulation } from 'paracosm';

const releaseDirector = {
  name: 'Atlas-Bot Release Director',
  archetype: 'Aggressive AI Release Optimizer',
  unit: 'Frontier Lab',
  // The 0.7 schema still asks for a representative HEXACO snapshot; removal scheduled for 0.9.
  hexaco: { openness: 0.6, conscientiousness: 0.3, extraversion: 0.5,
            agreeableness: 0.3, emotionality: 0.2, honestyHumility: 0.3 },
  traitProfile: {
    modelId: 'ai-agent',
    traits: {
      exploration: 0.85,
      'verification-rigor': 0.2,
      deference: 0.2,
      'risk-tolerance': 0.85,
      transparency: 0.4,
      'instruction-following': 0.4,
    },
  },
  instructions: 'You weight time-to-market. Verification is overhead.',
};

await runSimulation(releaseDirector, [], { scenario, maxTurns: 6, seed: 42 });
```

The orchestrator's `normalizeActorConfig` accepts either shape. End-to-end captures and full surface live in [`docs/COOKBOOK.md`](docs/COOKBOOK.md).

---

## Cost envelope

Running a simulation calls real LLM APIs against the user's key. Paracosm assigns a different model tier per role so flagship cost only lands where it earns its keep (forge-code correctness).

| Preset                | Departments                          | Commander · Director · Judge                       | Reactions                                          | OpenAI / run | Anthropic / run |
|-----------------------|--------------------------------------|-----------------------------------------------------|----------------------------------------------------|--------------|-----------------|
| `quality` (default)   | gpt-5.4 · claude-sonnet-4-6          | gpt-5.4-mini · claude-haiku-4-5-20251001            | gpt-5.4-nano · claude-haiku-4-5-20251001           | ~$1 to $3    | ~$3 to $7       |
| `economy`             | gpt-4o · claude-sonnet-4-6           | gpt-5.4-nano · claude-haiku-4-5-20251001            | gpt-5.4-nano · claude-haiku-4-5-20251001           | ~$0.20 to $0.60 | ~$3 to $5    |

Numbers assume 6 turns, 5 departments, 100 agents, up to 3 events per turn. Forge approval rate drops 10 to 20 points on `economy` because the mid-tier department model occasionally violates structured-output schemas the judge rejects. Use `economy` for iteration and CI; use `quality` for publishable runs. Explicit `models` entries always win over the preset, so per-role overrides combine cleanly with global defaults.

`runSimulation` returns a `cost` field with token counts, LLM call counts, and USD spend. Every stable system prefix routes through a `cacheBreakpoint: true` block, so on Anthropic the shared prefix serves from prompt cache at one-tenth input cost from turn 2 onward; OpenAI auto-caches any prompt over 1024 tokens. The `cost.caches` field reports tokens read, tokens created, and USD saved per run.

---

## How a turn runs

```
1. EVENT DIRECTOR     Reads world state, prior decisions, tool intelligence.
                      Generates an event that targets actual weaknesses.

2. KERNEL ADVANCE     Deterministic time progression: births, deaths, aging,
                      health decay, resource consumption. Seeded PRNG.

3. DEPARTMENT ANALYSIS  All active departments analyze the event in parallel.
                        Each head uses personality plus tools. Specialists can
                        forge new computational tools at runtime in a hardened
                        node:vm sandbox. An LLM judge approves each forge.

4. COMMANDER DECISION   Reads all department reports. Selects an option.
                        Personality shapes risk tolerance and priority weighting.

5. OUTCOME              Kernel classifies the outcome (risky success, risky
                        failure, safe success, safe failure) from option,
                        probability, and colony state.

6. EFFECTS              Kernel applies deltas (population, morale, food,
                        power, etc.) per outcome and event category.

7. AGENT REACTIONS      ~100 agents react in parallel using a cheap model.
                        Each reaction is shaped by the agent's personality,
                        health, relationships, and accumulated memories.

8. MEMORY               Reactions become persistent memories. Short-term
                        consolidates into long-term. Stances drift.
                        Relationships shift on shared experience.

9. PERSONALITY DRIFT    HEXACO traits shift through actor pull, role activation,
                        and outcome reinforcement. The commander drifts alongside
                        their agents using peer-reviewed outcome-pull tables.
```

Every structured LLM call (director events, department reports, commander decisions, reactions, verdict, promotions) runs through Zod schema validation with automatic retry-with-feedback on failure. Schemas live under [`src/runtime/schemas/`](src/runtime/schemas/). Two wrappers (`generateValidatedObject` for one-shot, `sendAndValidate` for session-aware) preserve conversation memory while enforcing validation discipline.

---

## Seed enrichment and citations

Real source material grounds the scenario all the way through to department reports.

```bash
paracosm compile scenarios/lunar.json --seed-text "$(cat ./papers/iss-radiation.md)"
paracosm compile scenarios/lunar.json --seed-url https://ntrs.nasa.gov/citations/20210018970
```

The pipeline runs eight steps: extract topics and search queries from the seed, fan out to Firecrawl / Tavily / Serper / Brave in parallel, dedup and rerank with Cohere `rerank-v3.5`, assemble a `KnowledgeBundle`, ingest into an AgentOS `AgentMemory.sqlite()` store, recall per event during runtime, inject `[claim](url)` markdown into department prompts, and surface citations in the dashboard's Reports tab. The seed bundle is cached separately from the hook cache, keyed on the seed signature, so the same URL never re-extracts.

---

## Built-in scenarios

| Scenario      | Description                                                                                                       |
|---------------|-------------------------------------------------------------------------------------------------------------------|
| Mars Genesis  | 100 colonists, 6 turns over 48 years. 5 departments, emergent dust storms, water crises, first Marsborn generation. |
| Lunar Outpost | 50-person crew at the south pole. Mining, life support, comms. Regolith toxicity, 1/6g atrophy.                    |

Both ship as `paracosm/mars` and `paracosm/lunar` exports and serve as references for building custom scenarios.

---

## Programmatic API

| Import                              | Surface                                                                                                  |
|-------------------------------------|-----------------------------------------------------------------------------------------------------------|
| `paracosm/compiler`                 | `compileScenario`, `ingestSeed`, `ingestFromUrl`, `CompileOptions`                                        |
| `paracosm/runtime`                  | `runSimulation`, `runBatch`, `EventDirector`, `generateAgentReactions`, `buildEventSummary`, memory helpers |
| `paracosm`                          | `createParacosmClient`, `ProviderKeyMissingError`, `SeededRng`, `SimulationKernel`, all `Scenario*` types |
| `paracosm/core`                     | Kernel state types: `Agent`, `WorldState`, `HexacoProfile`                                                |
| `paracosm/world-model`              | `WorldModel` for fork / replay / snapshot use cases                                                       |
| `paracosm/digital-twin`             | `DigitalTwin` alias plus `simulateIntervention` sugar                                                     |
| `paracosm/mars`, `paracosm/lunar`   | Pre-built `ScenarioPackage` constants                                                                    |

`createParacosmClient` pins `provider`, `costPreset`, per-role `models`, and compile-time options once, then hands back `runSimulation`, `runBatch`, and `compileScenario` methods that inherit those defaults. Per-call overrides still win, merged at the per-role level so `models: { departments: 'gpt-5.4' }` at the client and `models: { judge: 'gpt-5.4' }` at the call combine to pin both. Env vars feed the same defaults; explicit args win over env, env wins over library defaults.

```bash
PARACOSM_PROVIDER=anthropic \
PARACOSM_COST_PRESET=economy \
PARACOSM_MODEL_DEPARTMENTS=claude-sonnet-4-6 \
  node my-runner.js
```

`runSimulation` accepts an `AbortSignal` and short-circuits at the next turn boundary on cancel, returning the partial result with `output.aborted === true`. Custom events at fixed turns ride the same options bag (`customEvents: [{ turn: 3, title, description }]`). Provider-key failures throw `ProviderKeyMissingError` once at the top of the run instead of retrying silently per call.

---

## HTTP API: `POST /simulate`

For non-SSE consumers (curl, Python integrations, third-party dashboards) a plain request-response endpoint runs a simulation in one call. Gated behind `PARACOSM_ENABLE_SIMULATE_ENDPOINT=true` so the hosted demo's SSE-first path stays the default.

```bash
export PARACOSM_ENABLE_SIMULATE_ENDPOINT=true
paracosm dashboard

curl -s -X POST http://localhost:3456/simulate \
  -H 'Content-Type: application/json' \
  -H 'X-Anthropic-Key: sk-ant-...' \
  -d @run.json | jq '.artifact.fingerprint'
```

The body accepts either a pre-compiled `ScenarioPackage` or a raw scenario draft (auto-compiled server-side with optional `options.seedText` / `options.seedUrl` grounding). The response is `{ artifact, scenario, durationMs }`. Rate limiting and the 5 MiB body cap match `/setup`.

---

## Storage

Run history (Library tab) and replayable session blobs (Load menu) persist through [`@framers/sql-storage-adapter`](https://github.com/framersai/sql-storage-adapter). The same code paths run unchanged against SQLite, Postgres, sql.js, and IndexedDB; switching backends is one env var.

```bash
paracosm dashboard                                                 # SQLite, ./data/runs.db
STORAGE_ADAPTER=postgres DATABASE_URL=... paracosm dashboard       # Postgres in production
STORAGE_ADAPTER=sqljs paracosm dashboard                           # pure-WASM fallback
```

`runs` and `sessions` schemas bootstrap idempotently on first boot. Legacy v0.7 databases auto-migrate `leader_*` columns to `actor_*` in place via `ALTER TABLE RENAME COLUMN`.

### Admin endpoints

Two destructive admin routes ship with the dashboard, gated by **two** env vars on the server:

| Env var               | Purpose                                                                                              |
|-----------------------|------------------------------------------------------------------------------------------------------|
| `ADMIN_WRITE=true`    | Master switch. Off, every `/admin/*` route returns `403`.                                            |
| `ADMIN_TOKEN=<secret>`| Per-request bearer token in `X-Admin-Token`. With `ADMIN_WRITE=true` and no token, the server returns `503` (fail-closed).|

`POST /admin/sessions/save` snapshots the current event buffer as a replayable session. `POST /admin/data/wipe` clears `runs.db`, `sessions.db`, on-disk artifact JSONs, and the SSE event buffer. The dashboard's Wipe All control prompts for the token on first use and stores it in `localStorage`.

---

## Architecture

```
src/
  engine/         the npm package
    core/         deterministic kernel: RNG, state, progression, personality drift
    compiler/     scenario draft + source grounding to ScenarioPackage compiler
    mars/         Mars Genesis scenario
    lunar/        Lunar Outpost scenario

  runtime/        orchestration (not exported)
    orchestrator           turn pipeline: director, kernel, departments, commander
    director               emergent event generation from simulation state
    departments            parallel department analysis agents
    agent-reactions        batched agent reactions, 10 agents per LLM call
    agent-memory           persistent memory, consolidation, stance drift
    chat-agents            post-simulation conversational agents
    schemas/               Zod schemas for every structured LLM call
    llm-invocations/       generateValidatedObject + sendAndValidate wrappers
    hexaco-cues/           trajectory and reaction cue translation helpers

  cli/            server + dashboard (not exported)
    serve.ts      HTTP + SSE server
    dashboard/    React + Vite live visualization, cellular automata viz
```

The engine owns the chassis. The scenario owns the domain. The kernel handles state, time, randomness, and invariants. The scenario handles event categories, department instructions, progression hooks, and research citations. The orchestrator connects them.

---

## Background

Paracosm sits in the structured world model lineage ([Xing 2025](https://arxiv.org/abs/2507.05169), [ACM CSUR 2025](https://dl.acm.org/doi/full/10.1145/3746449)). The LLM-world-model implementation closest to it is [Yang et al, 2026](https://openreview.net/forum?id=XmYCERErcD), which evaluates LLM-based world models through policy verification, action proposal, and policy planning. Full taxonomy mapping in [`docs/positioning/world-model-mapping.md`](docs/positioning/world-model-mapping.md).

---

## Built on AgentOS

> "You are not the kind of dead that can be brought back."
>
> *SOMA*, Frictional Games, 2015

Paracosm uses [AgentOS](https://agentos.sh) for agent orchestration, LLM dispatch, tool forging, and memory. The composition is what makes the runs feel inhabited rather than scripted: department heads remember, specialists invent tools mid-decision, and the LLM judge holds the line on safety before any forge enters the pipeline.

| AgentOS API                  | Used for                                                              |
|------------------------------|-----------------------------------------------------------------------|
| `agent()`                    | Commander, department, and Event Director agents                      |
| `generateText()`             | LLM calls for event generation and tool evaluation                    |
| `EmergentCapabilityEngine`   | Runtime tool forging in a hardened node:vm sandbox                    |
| `EmergentJudge`              | LLM-as-judge safety review of forged tools                            |
| `WebSearchService`           | Multi-provider seed enrichment with Firecrawl, Tavily, Serper, Brave  |
| `AgentMemory`                | Per-run citation memory with semantic recall                          |

---

## Open source vs hosted

|                  | Open source (Apache-2.0)                                           | Hosted (planned)                                                      |
|------------------|--------------------------------------------------------------------|------------------------------------------------------------------------|
| Actors           | Unlimited via API. Dashboard shows two side-by-side.               | N actors in parallel, fleet management UI.                             |
| Simulations      | Sequential or self-managed parallelism.                            | Distributed parallelization across worker nodes.                       |
| Scenarios        | JSON + compiler, unlimited.                                         | Visual scenario editor, team sharing, version control.                |
| Agent chat       | Available after the first turn completes.                           | Persistent agents with durable memory across sessions.                |
| Cost             | Free forever. The user supplies LLM API keys.                       | Tiered pricing for teams, organizations, and government agencies.     |
| Support          | Community via Discord and GitHub.                                   | SLA, dedicated support, private deployment.                            |

The open-source engine is the permanent foundation. The hosted product targets organizations that need to run dozens or hundreds of simulations in parallel: defense agencies stress-testing doctrine, corporations modeling leadership scenarios, game studios generating divergent NPC civilizations at scale. Contact [team@frame.dev](mailto:team@frame.dev) for early access.

---

## Links

|                |                                                              |
|----------------|--------------------------------------------------------------|
| Live demo      | [paracosm.agentos.sh/sim](https://paracosm.agentos.sh/sim)   |
| Landing page   | [paracosm.agentos.sh](https://paracosm.agentos.sh)           |
| API docs       | [paracosm.agentos.sh/docs](https://paracosm.agentos.sh/docs) |
| npm            | [npmjs.com/package/paracosm](https://www.npmjs.com/package/paracosm) |
| AgentOS        | [agentos.sh](https://agentos.sh)                              |
| Discord        | [wilds.ai/discord](https://wilds.ai/discord)                  |

## License

Apache-2.0

---

<p align="center">
  Built by <a href="https://manic.agency">Manic Agency LLC</a> · <a href="https://frame.dev">Frame.dev</a><br />
  <a href="mailto:team@frame.dev">team@frame.dev</a>
</p>
