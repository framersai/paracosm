<p align="center">
  <a href="https://paracosm.agentos.sh"><img src="assets/favicons/icon.svg" alt="Paracosm" height="64" /></a>
</p>

<h1 align="center">PARACOSM</h1>

<p align="center">
  <em>AI Agent Swarm Simulation Engine</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/paracosm"><img src="https://img.shields.io/npm/v/paracosm?style=flat-square&color=e8b44a&labelColor=14110e" alt="npm" /></a>
  <a href="https://github.com/framersai/paracosm/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-e06530?style=flat-square&labelColor=14110e" alt="License" /></a>
  <a href="https://paracosm.agentos.sh/docs"><img src="https://img.shields.io/badge/docs-API%20Reference-4ca8a8?style=flat-square&labelColor=14110e" alt="Docs" /></a>
  <a href="https://agentos.sh"><img src="https://img.shields.io/badge/built%20on-AgentOS-e06530?style=flat-square&labelColor=14110e" alt="AgentOS" /></a>
</p>

<p align="center">
  <a href="https://paracosm.agentos.sh"><strong>paracosm.agentos.sh</strong></a> &middot;
  <a href="https://paracosm.agentos.sh/sim">Live Demo</a> &middot;
  <a href="https://paracosm.agentos.sh/docs">API Docs</a> &middot;
  <a href="https://www.npmjs.com/package/paracosm">npm</a> &middot;
  <a href="https://wilds.ai/discord">Discord</a>
</p>

---

## What Is Paracosm

Define a world as JSON. Assign AI leaders with distinct personalities. Watch their decisions compound into divergent outcomes from identical starting conditions.

Leaders are top-down decision makers. They can be colony commanders, CEOs, generals, ship captains, department heads, AI systems, governing councils, or any entity that receives information, evaluates options, and makes choices that shape the world. The simulation doesn't care what they represent. It cares how they decide.

Each turn: a Event Director generates events based on the world's current state. Department agents analyze the situation and forge computational tools at runtime. Leaders decide. A deterministic kernel applies consequences. Personality traits drift from experience. The world evolves.

Same seed, same starting conditions, different leaders, different civilizations.

## Quickstart

```bash
npm install paracosm      # also works: pnpm add paracosm / bun add paracosm
```

Paracosm ships as pure ESM with subpath exports (`paracosm/compiler`, `paracosm/runtime`, `paracosm/mars`, `paracosm/lunar`, `paracosm/core`). Node 20+, Bun 1.x, and any TypeScript runner with ESM + import-attributes support (`tsx`, `ts-node --esm`) resolve them out of the box. If `import ... from 'paracosm/compiler'` fails with a module-not-found error, the dependency was never installed in that project — `cd` into the right directory and run one of the commands above.

### 1. Define your world

Every scenario declares its own vocabulary via `labels.populationNoun`
(plural, e.g. `"colonists"` / `"crew"` / `"citizens"`) and
`labels.settlementNoun` (singular, e.g. `"colony"` / `"habitat"` /
`"kingdom"`). The dashboard + runtime pick these up everywhere
user-facing copy renders.

If you omit `labels`, Paracosm falls back to `"colonists"` /
`"colony"` — defaults that read fine across most domains but usually
feel sharper when you pick your own. "Colony" is the default because
it's narratively richer than a neutral "group" / "unit" while still
translating to Mars habitats, medieval holds, corporate teams, or any
bounded collective under a leader's decisions.

```json
{
  "id": "submarine-habitat",
  "labels": {
    "name": "Deep Ocean Habitat",
    "populationNoun": "crew",
    "settlementNoun": "habitat",
    "currency": "credits"
  },
  "setup": {
    "defaultTurns": 8,
    "defaultPopulation": 50,
    "defaultStartYear": 2040,
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

> **Terminology — `labels.populationNoun` + `settlementNoun`**
>
> The engine defaults to **`colonists` / `colony`** (Mars-flavoured) when a scenario omits these
> fields, but every scenario can — and should — override them. The dashboard uses the overridden
> nouns throughout: help legends, roster headers, empty states, screen-reader text, the viz tab,
> report summaries. A handful of examples:
>
> | Scenario       | `settlementNoun` | `populationNoun` |
> |----------------|------------------|------------------|
> | Mars Genesis   | `colony`         | `colonists`      |
> | Submarine      | `habitat`        | `crew`           |
> | Medieval       | `kingdom`        | `subjects`       |
> | Corporate      | `company`        | `employees`      |
> | Space Station  | `station`        | `operators`      |
> | Generation Ship| `vessel`         | `passengers`     |
>
> `populationNoun` is the **plural** form; the dashboard derives the singular (`colonists` →
> `colonist`) and capitalised variants automatically. `settlementNoun` is **singular** (`colony`,
> not `colonies`). Paracosm the engine is an "AI agent swarm" at the meta layer; what it simulates
> inside each run is scenario-flavoured via these fields.

### 2. Compile and run

```typescript
import { compileScenario } from 'paracosm/compiler';
import { runSimulation } from 'paracosm/runtime';
import worldJson from './my-world.json' with { type: 'json' };

// Compile JSON into a runnable scenario (~$0.10, cached to disk)
const scenario = await compileScenario(worldJson, {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
});

// Define leaders with HEXACO personality profiles.
// Leaders can be any top-down decision maker: commander, CEO, general,
// governing council, AI system, department head. The engine doesn't care
// what they represent, only how their personality shapes decisions.
const leaders = [
  {
    name: 'Captain Reyes',
    archetype: 'The Pragmatist',
    colony: 'Station Alpha',
    hexaco: { openness: 0.4, conscientiousness: 0.9,
              extraversion: 0.3, agreeableness: 0.6,
              emotionality: 0.5, honestyHumility: 0.8 },
    instructions: 'You lead by protocol. Safety margins first.',
  },
  {
    name: 'Captain Okafor',
    archetype: 'The Innovator',
    colony: 'Station Beta',
    hexaco: { openness: 0.9, conscientiousness: 0.4,
              extraversion: 0.8, agreeableness: 0.5,
              emotionality: 0.3, honestyHumility: 0.6 },
    instructions: 'You lead by experimentation. Push boundaries.',
  },
];

// Run in parallel: same seed, same crises, different outcomes
const results = await Promise.all(
  leaders.map(leader =>
    runSimulation(leader, [], {
      scenario,
      maxTurns: 8,
      seed: 42,
      // Every event carries a universal `e.data.summary` one-liner the
      // runtime populates for you — prints cleanly for all 17 event
      // types without guessing which fields exist where.
      //
      // For full intellisense on per-event data, narrow via e.type:
      //   if (e.type === 'event_start') e.data.title          // string
      //   if (e.type === 'outcome')     e.data.colonyDeltas   // Record<string,number>
      //   if (e.type === 'forge_attempt') e.data.approved     // boolean
      onEvent(e) { console.log(leader.name, e.type, e.data.summary); },
    })
  )
);

// The return value is a full run artifact. A few of the fields most
// consumers want right away:
for (const r of results) {
  console.log(r.leader.name, '→', r.fingerprint);
  console.log('  cost   $', r.cost.totalCostUSD.toFixed(2), `(${r.cost.llmCalls} LLM calls)`);
  console.log('  final    ', r.finalState.colony);        // population, morale, foodMonthsReserve, powerKw, …
  console.log('  tools    ', r.forgedToolbox.length,      // deduped forge ledger
               'citations', r.citationCatalog.length);     // DOI-linked references
  if (r.providerError) {
    console.error('  provider error:', r.providerError.kind, r.providerError.message);
  }
}
```

Each call to `runSimulation` takes one leader. Run one, two, or twenty. The dashboard runs two side-by-side for comparison, but the API has no limit. Leaders don't need to be people. They can model competing strategies, policy frameworks, organizational philosophies, or autonomous systems responding to the same events with different decision profiles.

### 3. Or use the dashboard

```bash
git clone https://github.com/framersai/paracosm
cd paracosm && npm install
cp .env.example .env  # add your OpenAI or Anthropic key
npm run dashboard      # opens http://localhost:3456
```

The dashboard includes a scenario editor where you can write, import, compile, and run custom worlds from the browser.

### 4. Or run the standalone CLI

After `npm install paracosm` you get two binaries:

```bash
paracosm                # run one leader once; prints turn-by-turn narrative
paracosm-dashboard 6    # start the web dashboard and run a 6-turn sim
```

Both CLIs look for `leaders.json` in this order:

1. `--leaders <path>` flag (explicit)
2. `./leaders.json` in your current directory
3. `./config/leaders.json` in your current directory
4. A bundled `config/leaders.example.json` (so commands work out of the box)

Copy the example to start customizing:

```bash
# Option 1: in your project root
cp node_modules/paracosm/config/leaders.example.json leaders.json

# Option 2: organized in a config/ folder
mkdir -p config && cp node_modules/paracosm/config/leaders.example.json config/leaders.json
```

Then edit the HEXACO sliders and `instructions` fields to describe your own leaders — the simulation picks up the file on the next run.

## Scenario Compiler

The compiler turns your JSON into a runnable scenario by generating TypeScript hooks via LLM calls:

```bash
npm run compile -- scenarios/submarine.json \
  --seed-url https://example.com/report \
  --no-web-search
```

Options: `--seed-text`, `--seed-url`, `--no-web-search`, `--max-searches`. Compiled scenarios appear in the dashboard selector. Cost is roughly $0.10 per compile, cached to disk after first generation.

### Programmatic compiler options

Every CLI flag has a matching programmatic option on `compileScenario`. The compiler caches per-hook on the scenario hash + model + schema version, and separately caches the seed bundle on the seed signature (text/URL + `webSearch` + `maxSearches`), so re-running the same call is free after the first hit.

```typescript
import { compileScenario } from 'paracosm/compiler';

const scenario = await compileScenario(worldJson, {
  provider: 'anthropic',             // 'openai' (default) or 'anthropic'
  model: 'claude-sonnet-4-6',        // omit → provider default (gpt-5.4-mini / claude-sonnet-4-6)
  cache: true,                       // default. Set false to force regeneration.
  cacheDir: '.paracosm/cache',       // default. Change per project / per CI run.
  seedUrl: 'https://ntrs.nasa.gov/citations/20210018970',  // or: seedText: '…inline markdown…'
  webSearch: true,                   // fan out to Firecrawl/Tavily/Serper/Brave
  maxSearches: 5,
  onProgress(hookName, status) {
    // 'generating' | 'cached' | 'done' | 'fallback'
    console.log(`  [${status.padEnd(10)}] ${hookName}`);
  },
});
```

Cache hits show up as `cached` in the progress callback. First-run cost is roughly $0.10; cached re-runs are free. If neither `OPENAI_API_KEY` nor `ANTHROPIC_API_KEY` is set, the compiler throws `ProviderKeyMissingError` before making any calls — see [Error handling](#error-handling).

## Cost Envelope

Running a simulation calls real LLM APIs against your key. Typical spend per run on provider defaults (6 turns, 5 departments, 100 agents, up to 3 events per turn). Paracosm assigns a different tier per role so flagship cost only lands where it earns its keep (forge-code correctness):

| Provider  | Departments (flagship) | Commander / Director / Judge (mid-tier) | Reactions (cheapest) | Per-run total |
|-----------|------------------------|------------------------------------------|----------------------|---------------|
| OpenAI    | `gpt-5.4`              | `gpt-5.4-mini`                           | `gpt-5.4-nano`       | ~$1-3  |
| Anthropic | `claude-sonnet-4-6`    | `claude-haiku-4-5-20251001`              | `claude-haiku-4-5-20251001` | ~$3-7  |

The single biggest lever is the judge model — it runs once per forge attempt (easily 60+ calls per 6-turn run) so keeping it on the mid-tier is what makes the run affordable. Promoting the judge to flagship triples the total. Override any role via `models` on `RunOptions`: `{ models: { judge: 'gpt-5.4' } }` if you want to pay for stricter review.

The orchestrator's `runSimulation()` returns a `cost` field with token counts, LLM call counts, and USD spend aggregated from every tracked call (director, departments, commander, judge, agent reactions). The dashboard StatsBar shows this live.

### Prompt caching

Every LLM call site on both providers routes its stable system prefix through a `cacheBreakpoint: true` block (director instructions, department prompts, reaction batches, compile-time hook generators). On Anthropic, turn 2+ of every run serves the shared prefix from the provider's prompt cache at 0.1× input cost. On OpenAI, any prompt ≥ 1024 tokens auto-caches. The `cost.caches` field reports read / creation tokens and USD saved per run, and `/retry-stats` rolls the numbers up across the last 100 runs so you can verify the cache is actually hitting. No configuration required — the `system: Array<{ text; cacheBreakpoint }>` shape is built into the validated-call wrappers in `src/engine/compiler/llm-invocations/` and `src/runtime/llm-invocations/`.

## Programmatic API

Everything the dashboard does is also available as library calls. The exports fall into five buckets:

| Import | Surface |
|--------|---------|
| `paracosm/compiler` | `compileScenario`, `ingestSeed`, `ingestFromUrl`, type `CompileOptions` |
| `paracosm/runtime`  | `runSimulation`, `runBatch`, `EventDirector`, `generateAgentReactions`, `buildEventSummary`, memory helpers |
| `paracosm`          | `ProviderKeyMissingError`, `SeededRng`, `SimulationKernel`, all `Scenario*` types |
| `paracosm/core`     | Kernel state types (`Agent`, `WorldState`, `HexacoProfile`, …) |
| `paracosm/mars`, `paracosm/lunar` | Pre-built `ScenarioPackage` constants to use or fork |

### Batch runner — N scenarios × M leaders

```typescript
import { runBatch } from 'paracosm/runtime';
import { marsScenario, lunarScenario } from 'paracosm';

const manifest = await runBatch({
  scenarios: [marsScenario, lunarScenario],
  leaders,                // LeaderConfig[] — same shape as runSimulation
  turns: 6,
  seed: 950,
  maxConcurrency: 2,      // how many sims to run in parallel
  provider: 'anthropic',
});

// manifest.results[i] carries { scenarioId, leader, fingerprint, output, duration }
// manifest.timestamp + manifest.config is a reproducible audit trail
```

### Seed ingestion from a URL or inline text

The compiler grounds agents in real sources. Pass `seedText` for inline markdown / PDFs you already have, or `seedUrl` to let Firecrawl extract clean markdown from any public page. The bundle is cached separately from the hook cache, keyed on the seed signature, so the same URL never re-extracts.

```typescript
const scenario = await compileScenario(worldJson, {
  seedUrl: 'https://ntrs.nasa.gov/citations/20210018970',
  webSearch: true,        // also fan out to Tavily/Serper/Brave for more citations
  maxSearches: 5,
});
// Every department prompt, Event Director batch, and report.citations[] entry
// at runtime will draw from this bundle.
```

### Cancellation via AbortSignal

The server wires this to a cancel-on-disconnect watchdog; any programmatic consumer can do the same. When `.aborted` flips to true, the turn loop short-circuits at the next turn boundary, emits a `sim_aborted` event, and returns the partial result accumulated so far with `output.aborted === true`.

```typescript
const ctrl = new AbortController();
setTimeout(() => ctrl.abort(), 60_000);            // kill after 60s wall time

const output = await runSimulation(leader, [], {
  scenario, maxTurns: 8, seed: 42,
  signal: ctrl.signal,
});

if (output.aborted) console.log('partial result; turns completed:', output.turnArtifacts.length);
```

### Custom events injected at specific turns

When you want a scripted event at a fixed turn (smoke tests, pedagogical demos, reproducing a scenario from a paper), supply `customEvents`:

```typescript
await runSimulation(leader, [], {
  scenario, maxTurns: 8, seed: 42,
  customEvents: [
    { turn: 3, title: 'Dust storm', description: 'A 72-hour planetary dust storm cuts solar output by 80%.' },
    { turn: 6, title: 'Supply drop', description: 'Earth relief mission delivers 3 months of food reserves.' },
  ],
});
```

### Error handling

```typescript
import { runSimulation, ProviderKeyMissingError } from 'paracosm';

try {
  const output = await runSimulation(leader, [], { scenario, maxTurns: 8, seed: 42 });
  if (output.providerError) {
    // Terminal provider failure (invalid key, quota exhausted) — the run
    // aborted mid-way. turnArtifacts / finalState are partial.
    console.error(output.providerError.kind,        // 'auth' | 'quota' | 'rate_limit' | 'network' | 'unknown'
                  output.providerError.provider,
                  output.providerError.message,
                  output.providerError.actionUrl);
  }
} catch (err) {
  if (err instanceof ProviderKeyMissingError) {
    console.error('set OPENAI_API_KEY or ANTHROPIC_API_KEY before running');
    process.exit(1);
  }
  throw err;
}
```

The resolver inspects `process.env` once up front, so a missing key fails loudly at the top of the run instead of retrying silently on every LLM call.

### Where run output lands

Every finished run writes a JSON snapshot to `<cwd>/output/v3-<archetype>-<timestamp>.json` — the same payload `runSimulation` returns, persisted so you can diff runs, reload them into the dashboard, or feed them into downstream tooling. Set `PARACOSM_OUTPUT_DIR` to redirect (absolute path, or relative to cwd). The directory is created on first write if it doesn't exist.

```bash
# Default: ./output/v3-the-pragmatist-2026-04-21T16-02-41-550Z.json
bun src/index.ts

# Custom location
PARACOSM_OUTPUT_DIR=./artifacts/run-001 bun src/index.ts
```

## Seed Enrichment & Citation Flow

Pass real-world source material into the compiler and Paracosm grounds the scenario in citations that flow all the way through to department reports.

```bash
# Inline text seed
npx paracosm compile scenarios/lunar.json \
  --seed-text "$(cat ./papers/iss-radiation-overview.md)"

# URL seed (Firecrawl extracts clean markdown)
npx paracosm compile scenarios/lunar.json \
  --seed-url https://ntrs.nasa.gov/citations/20210018970
```

Pipeline:

1. **Extract** — LLM reads the seed, returns `topics`, `facts`, `searchQueries`, `crisisCategories`.
2. **Search** — AgentOS `WebSearchService` queries Firecrawl, Tavily, Serper, and Brave in parallel. Results pass through semantic dedup, RRF fusion, and (with `COHERE_API_KEY`) Cohere `rerank-v3.5` neural reranking.
3. **Assemble** — extracted facts plus search hits become a `KnowledgeBundle` with `topics[].canonicalFacts[]` and `categoryMapping`.
4. **Ingest** — at runtime, `initResearchMemory` writes every citation into an AgentOS `AgentMemory.sqlite()` store keyed by topic tags.
5. **Recall** — for each event, `recallResearch(query, keywords)` runs semantic recall over the memory store. Live web search fills in when memory is sparse.
6. **Inject** — citations land in each department's prompt under `RESEARCH:` as `[claim](url)` markdown links.
7. **Surface** — department reports return `citations[]`. The orchestrator guarantees provenance: when the LLM omits citations, the research packet is auto-attached so the report always carries the same sources the agent saw.
8. **Render** — the dashboard "Reports" tab renders citations as clickable links with optional DOIs.

The Event Director also receives the bundle's `topics` and `categories`, so its `researchKeywords` and `category` fields stay grounded in entries that actually exist in your knowledge bundle.

## Built-in Scenarios

| Scenario | Description |
|----------|-------------|
| **Mars Genesis** | 100 colonists, 6 turns over 48 years. 5 departments, emergent dust storms, water crises, first Marsborn generation. |
| **Lunar Outpost** | 50-person crew at the south pole. Mining, life support, communications. Regolith toxicity, 1/6g atrophy. |

Both are included as `paracosm/mars` and `paracosm/lunar` exports. Use them as references for building your own scenarios.

## How a Simulation Works

### Turn 0: Promotions

The commander evaluates the full agent roster and promotes department heads. Each department (Medical, Engineering, Agriculture, etc.) gets a leader chosen by the commander based on personality fit, specialization, and experience. A high-openness commander picks unconventional candidates. A high-conscientiousness commander picks by-the-book specialists.

This matters because promoted agents become the department analysis LLM agents for the rest of the simulation. Their personality colors every analysis they produce, which shapes the information the commander sees, which shapes decisions. The commander never directly analyzes events. They only read department reports and decide.

### Turns 1-N: The Turn Loop

Each turn represents a configurable time period (default ~4 years). Every turn follows this pipeline:

```
1. EVENT DIRECTOR    Reads world state, prior decisions, tool intelligence.
                     Generates an event that targets actual weaknesses.

2. KERNEL ADVANCE    Deterministic time progression: births, deaths, aging,
                     health decay, resource consumption. Seeded PRNG.

3. DEPARTMENT ANALYSIS   All active departments analyze the event in parallel.
                         Each department head (promoted at turn 0) uses their
                         personality and tools. Departments can forge new
                         computational tools at runtime (sandboxed V8, LLM-judged).

4. COMMANDER DECISION    Reads all department reports. Selects an option.
                         Personality shapes risk tolerance and priority weighting.

5. OUTCOME               Deterministic kernel classifies the outcome (risky success,
                         risky failure, safe success, safe failure) based on the
                         option chosen, probability, and colony state.

6. EFFECTS               Kernel applies colony deltas (population, morale, food,
                         power, etc.) based on outcome and event category.

7. AGENT REACTIONS       All alive agents (~100) react in parallel using a cheap
                         model. Each reaction is shaped by the agent's personality,
                         health, relationships, and accumulated memories.

8. MEMORY                Reactions become persistent memories. Short-term memories
                         consolidate into long-term beliefs. Stances drift.
                         Relationships shift based on shared experiences.

9. PERSONALITY DRIFT     HEXACO traits shift through leader pull, role activation,
                         and outcome reinforcement. All six traits drift
                         (openness, conscientiousness, extraversion,
                         agreeableness, emotionality, honesty-humility)
                         with peer-reviewed outcome-pull tables. The
                         commander drifts alongside their agents.
```

Every structured LLM call in this pipeline (director events, department reports, commander decisions, reactions, verdict, promotions) runs through Zod schema validation with automatic retry-with-feedback on validation failure. Schemas live in [`src/runtime/schemas/`](src/runtime/schemas/); two wrappers (`generateValidatedObject` one-shot, `sendAndValidate` session-aware) preserve conversation memory while adding validation discipline. See [ARCHITECTURE.md#llm-reliability](docs/ARCHITECTURE.md#llm-reliability).

### What Department Heads Do

Department heads are LLM agents with domain-specific instructions, access to research citations, and the ability to forge computational tools. When a medical crisis hits, the Chief Medical Officer doesn't just say "this is bad." They:

- Analyze the event against their department's research knowledge
- Cite relevant scientific literature (DOI-linked)
- Forge computational tools (e.g., a radiation dose calculator) in a sandboxed V8 environment
- An LLM judge reviews each tool for safety and correctness
- Produce a structured report: summary, risks, recommended actions, proposed colony state changes

The commander sees all department reports and makes a decision. Different commanders weight different departments' advice differently based on personality.

## Architecture

```
src/
  engine/         the npm package
    core/         deterministic kernel (RNG, state, progression, personality drift)
    compiler/     JSON -> ScenarioPackage compiler
    mars/         Mars Genesis scenario
    lunar/        Lunar Outpost scenario

  runtime/        orchestration (not exported)
    orchestrator            turn pipeline: director -> kernel -> departments -> commander
    director                emergent event generation from simulation state
    departments             parallel department analysis agents
    agent-reactions         batched agent reactions (10 agents per LLM call)
    agent-memory            persistent memory, consolidation, stance drift
    chat-agents             post-simulation conversational agents
    schemas/                Zod schemas for every structured LLM call
    llm-invocations/        generateValidatedObject + sendAndValidate wrappers
    hexaco-cues/            trajectory + reaction cue translation helpers

  cli/            server + dashboard (not exported)
    serve.ts      HTTP + SSE server
    dashboard/    React/Vite live visualization + cellular automata viz
```

**Design principle:** The engine owns the chassis. The scenario owns the domain. The kernel handles state, time, randomness, and invariants. The scenario handles event categories, department instructions, progression hooks, and research citations. The orchestrator connects them.

## Package Exports

| Import | What |
|--------|------|
| `paracosm` | Engine types, registries, `SimulationKernel`, `SeededRng`, scenario packages, `ProviderKeyMissingError` |
| `paracosm/compiler` | `compileScenario()`, `ingestSeed()`, `ingestFromUrl()` |
| `paracosm/runtime` | `runSimulation()`, `runBatch()`, `EventDirector`, `generateAgentReactions()`, `buildEventSummary()`, memory helpers |
| `paracosm/mars` | Mars Genesis `ScenarioPackage` |
| `paracosm/lunar` | Lunar Outpost `ScenarioPackage` |
| `paracosm/core` | Kernel state types (`Agent`, `WorldState`, `HexacoProfile`) |

## Built on AgentOS

Paracosm uses [AgentOS](https://agentos.sh) for agent orchestration, LLM calls, tool forging, and memory:

| AgentOS API | Used For |
|------------|----------|
| `agent()` | Commander, department, and Event Director agents |
| `generateText()` | LLM calls for event generation and tool evaluation |
| `EmergentCapabilityEngine` | Runtime tool forging in sandboxed V8 |
| `EmergentJudge` | LLM-as-judge safety review of forged tools |

## Links

| | |
|-|-|
| Live Demo | [paracosm.agentos.sh/sim](https://paracosm.agentos.sh/sim) |
| Landing Page | [paracosm.agentos.sh](https://paracosm.agentos.sh) |
| API Docs | [paracosm.agentos.sh/docs](https://paracosm.agentos.sh/docs) |
| npm | [npmjs.com/package/paracosm](https://www.npmjs.com/package/paracosm) |
| AgentOS | [agentos.sh](https://agentos.sh) |
| Discord | [wilds.ai/discord](https://wilds.ai/discord) |

## What You Can Simulate

Leaders are abstract decision-making entities. The same engine handles any domain where top-down decisions shape outcomes over time:

| Domain | Leaders | Departments | Events |
|--------|---------|-------------|--------|
| **Space colonies** | Colony commanders | Medical, Engineering, Agriculture | Dust storms, water crises, first native-born generation |
| **Corporate strategy** | CEOs, board members | Finance, Operations, R&D, Legal | Market shifts, acquisitions, regulatory changes |
| **Military wargaming** | Theater commanders | Intelligence, Logistics, Air, Ground | Escalation, supply disruption, allied coordination |
| **Game worlds** | Faction leaders, AI governors | Economy, Military, Diplomacy, Culture | Invasions, trade disputes, technological breakthroughs |
| **Policy simulation** | Government agencies, councils | Healthcare, Education, Infrastructure | Pandemics, budget crises, demographic shifts |
| **Autonomous systems** | AI decision frameworks | Sensor, Planning, Execution | Sensor failure, objective conflict, resource contention |

Define departments, metrics, events, and progression hooks in JSON. The engine generates crises, runs department analysis, forges tools, and applies consequences through the deterministic kernel. The scenario owns the domain. The engine owns the chassis.

## Open Source vs. Hosted

| | Open Source (Apache-2.0) | Hosted Dashboard (Planned) |
|-|--------------------------|---------------------------|
| **Leaders** | Unlimited via API. Dashboard shows 2 side-by-side. | N leaders in parallel with fleet management UI. |
| **Simulations** | Sequential or self-managed parallelism. | Distributed parallelization across worker nodes. |
| **Scenarios** | JSON + Compiler, unlimited. | Visual scenario editor, team sharing, version control. |
| **Agent Chat** | Available after first turn completes. | Persistent agents with durable memory across sessions. |
| **Cost** | Free forever. You provide LLM API keys. | Tiered pricing for teams, orgs, and government agencies. |
| **Support** | Community (Discord, GitHub). | SLA, dedicated support, private deployment. |

The open-source engine and library are the permanent foundation. The API (`runSimulation`, `runBatch`, `compileScenario`) supports unlimited leaders and simulations today. The dashboard demo at [paracosm.agentos.sh](https://paracosm.agentos.sh) runs two leaders side-by-side to demonstrate divergence.

The planned hosted product targets organizations that need to run dozens or hundreds of simulations in parallel: defense agencies stress-testing doctrine, corporations modeling leadership scenarios, game studios generating divergent NPC civilizations at scale. Distributed parallelization, fleet orchestration, team workspaces, persistent storage, and enterprise auth are on the roadmap.

Contact [team@frame.dev](mailto:team@frame.dev) for early access or partnership.

## Roadmap

### Enterprise Edition (Planned)

| Feature | Description |
|---------|-------------|
| **Fleet Orchestration** | Run 10, 50, or 100+ leaders through the same scenario in parallel. Distributed worker nodes. Aggregate comparison dashboards. |
| **Alternate Timelines** | Fork a simulation mid-run to explore "what if" branches. Split at any turn, change leader or settings, compare divergent futures from a single decision point. |
| **Custom Scenario Forms** | Visual form-based scenario editor instead of raw JSON. Drag-and-drop departments, metric configuration, event category builder. |
| **Persistent Agents** | Agent chat that persists across sessions with durable memory. Resume conversations days later with full recall. |
| **Multi-Scenario Comparison** | Run the same leaders across different scenarios and compare how personality adapts to different domains. |
| **Private Deployment** | Self-hosted or cloud-managed deployment for organizations that need data sovereignty, audit trails, and compliance controls. |

## License

Apache-2.0

---

<p align="center">
  Built by <a href="https://manic.agency">Manic Agency LLC</a> / <a href="https://frame.dev">Frame.dev</a><br>
  <a href="mailto:team@frame.dev">team@frame.dev</a>
</p>
