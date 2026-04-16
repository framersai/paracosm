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
npm install paracosm
```

### 1. Define your world

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

### 2. Compile and run

```typescript
import { compileScenario } from 'paracosm/compiler';
import { runSimulation } from 'paracosm/runtime';
import worldJson from './my-world.json';

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
      onEvent(e) { console.log(leader.name, e.type, e.data?.title); },
    })
  )
);
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

## Scenario Compiler

The compiler turns your JSON into a runnable scenario by generating TypeScript hooks via LLM calls:

```bash
npm run compile -- scenarios/submarine.json \
  --seed-url https://example.com/report \
  --no-web-search
```

Options: `--seed-text`, `--seed-url`, `--no-web-search`, `--max-searches`. Compiled scenarios appear in the dashboard selector. Cost is roughly $0.10 per compile, cached to disk after first generation.

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
                         and outcome reinforcement.
```

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
    core/         deterministic kernel (RNG, state, progression)
    compiler/     JSON -> ScenarioPackage compiler
    mars/         Mars Genesis scenario
    lunar/        Lunar Outpost scenario

  runtime/        orchestration (not exported)
    orchestrator  turn pipeline: director -> kernel -> departments -> commander
    director      emergent event generation from simulation state
    departments   parallel department analysis agents
    agent-reactions  parallel agent reactions (100+ cheap LLM calls)
    agent-memory     persistent memory, consolidation, stance drift
    chat-agents      post-simulation conversational agents

  cli/            server + dashboard (not exported)
    serve.ts      HTTP + SSE server
    dashboard/    React/Vite live visualization + cellular automata viz
```

**Design principle:** The engine owns the chassis. The scenario owns the domain. The kernel handles state, time, randomness, and invariants. The scenario handles event categories, department instructions, progression hooks, and research citations. The orchestrator connects them.

## Package Exports

| Import | What |
|--------|------|
| `paracosm` | Engine types, registries, kernel |
| `paracosm/compiler` | `compileScenario()` |
| `paracosm/runtime` | `runSimulation()`, `runBatch()` |
| `paracosm/mars` | Mars Genesis scenario |
| `paracosm/lunar` | Lunar Outpost scenario |
| `paracosm/core` | Kernel state types |

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
