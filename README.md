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

Define a scenario as JSON. Run it with AI commanders that have different personalities. Watch their decisions compound into divergent civilizations from identical starting conditions.

The engine handles crisis generation, department analysis, tool forging, personality drift, and state transitions. You define the world.

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

// Define leaders with HEXACO personality profiles
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

Each call to `runSimulation` takes one leader. Run one, two, or twenty. The dashboard runs two side-by-side for comparison, but the API has no limit.

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

## Built-in Scenarios

| Scenario | Description |
|----------|-------------|
| **Mars Genesis** | 100 colonists, 6 turns over 48 years. 5 departments, emergent dust storms, water crises, first Marsborn generation. |
| **Lunar Outpost** | 50-person crew at the south pole. Mining, life support, communications. Regolith toxicity, 1/6g atrophy. |

Both are included as `paracosm/mars` and `paracosm/lunar` exports. Use them as references for building your own scenarios.

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
    director      emergent crisis generation from simulation state
    departments   parallel department analysis agents

  cli/            server + dashboard (not exported)
    serve.ts      HTTP + SSE server
    dashboard/    React/Vite live visualization
```

**Design principle:** The engine owns the chassis. The scenario owns the domain. The kernel handles state, time, randomness, and invariants. The scenario handles crisis categories, department instructions, progression hooks, and research citations. The orchestrator connects them.

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
| `generateText()` | LLM calls for crisis generation and tool evaluation |
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

## Roadmap

### Enterprise Edition (Planned)

| Feature | Description |
|---------|-------------|
| **Colony Visualization** | Cellular automata view: each colonist as a cell, color-coded by health/mood/department. Watch colony growth patterns diverge in real time. Split canvas showing both settlements side-by-side with metric sparklines and turn-by-turn playback controls. WebGL renderer. |
| **Alternate Timelines** | Fork a simulation mid-run to explore "what if" branches. Split at any turn, change commander or settings, compare divergent futures from a single decision point. |
| **Custom Scenario Forms** | Visual form-based scenario editor instead of raw JSON. Drag-and-drop departments, metric configuration, event category builder. |
| **Persistent Agents** | Colonist chat agents that persist across sessions with durable memory. Resume conversations days later with full recall. |
| **Multi-Scenario Comparison** | Run the same leaders across different scenarios (Mars, Lunar, custom) and compare how personality adapts to different domains. |

## License

Apache-2.0

---

<p align="center">
  Built by <a href="https://manic.agency">Manic Agency LLC</a> / <a href="https://frame.dev">Frame.dev</a><br>
  <a href="mailto:team@frame.dev">team@frame.dev</a>
</p>
