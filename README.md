<p align="center">
  <a href="https://agentos.sh"><img src="assets/agentos-logo.png" alt="AgentOS" height="48" /></a>
</p>

<h1 align="center">Paracosm</h1>

<p align="center">
  Closed-state, turn-based settlement simulation engine with emergent crises, runtime tool forging, HEXACO personality evolution, and a deterministic kernel.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/paracosm"><img src="https://img.shields.io/npm/v/paracosm?style=flat-square&color=6366f1" alt="npm" /></a>
  <a href="https://github.com/framersai/paracosm/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square" alt="License" /></a>
  <a href="https://docs.agentos.sh"><img src="https://img.shields.io/badge/docs-agentos.sh-orange?style=flat-square" alt="Docs" /></a>
</p>

<p align="center">
  <a href="https://agentos.sh"><strong>agentos.sh</strong></a> &middot;
  <a href="https://docs.agentos.sh">Docs</a> &middot;
  <a href="https://github.com/framersai/paracosm">GitHub</a> &middot;
  <a href="https://www.npmjs.com/package/paracosm">npm</a> &middot;
  <a href="https://frame.dev">Frame.dev</a> &middot;
  <a href="https://wilds.ai/discord">Discord</a>
</p>

---

## What Is Paracosm

Paracosm is a scenario-driven simulation engine. You define a `ScenarioPackage` describing your world (departments, metrics, crises, progression hooks, research citations), and the engine runs it: emergent AI crisis generation, multi-agent department analysis, runtime tool forging, HEXACO personality drift, and deterministic state transitions.

The engine handles orchestration. The scenario handles domain.

**Engine archetype:** closed-state, turn-based settlement simulation. Covers Mars colony, lunar outpost, Antarctic station, orbital habitat, submarine habitat, generation ship. Does not cover graph-seeded social prediction or open-world sims.

## Scenarios

### Mars Genesis (flagship)

Two commanders receive the same colony of 100 colonists and the same starting resources. Their HEXACO personalities drive different decisions, different tool inventions, and different civilizational outcomes over 50 years.

```bash
npm run dashboard
# Open http://localhost:3456
```

### Lunar Outpost

50-person crew at the lunar south pole. Different departments (mining, life-support, communications), different progression (regolith toxicity, 1/6g atrophy), different milestones. Proves the engine works without editing engine code.

## Install

```bash
npm install paracosm
```

## Usage

### As a library

```typescript
import type { ScenarioPackage, Agent } from 'paracosm';
import { marsScenario } from 'paracosm/mars';
import { lunarScenario } from 'paracosm/lunar';
import { runSimulation, runBatch } from 'paracosm/runtime';
import { SimulationKernel, SeededRng } from 'paracosm';

// Run a single simulation
const output = await runSimulation(leader, keyPersonnel, {
  scenario: marsScenario,
  maxTurns: 12,
  seed: 950,
});

// Batch run across scenarios
const manifest = await runBatch({
  scenarios: [marsScenario, lunarScenario],
  leaders: [leaderA, leaderB],
  turns: 5,
  seed: 950,
});
```

### Mars Dashboard (standalone)

```bash
git clone https://github.com/framersai/paracosm
cd paracosm
npm install
cp .env.example .env  # add your API key

npm run dashboard        # full dashboard with settings
npm run dashboard:smoke  # 3-turn smoke test
```

## Architecture

```
src/
  engine/           importable library (the package)
    types.ts        ScenarioPackage, WorldState, hooks
    core/           deterministic kernel (RNG, state, progression)
    mars/           Mars Genesis scenario package
    lunar/          Lunar Outpost scenario package
    index.ts        barrel exports

  runtime/          orchestration (agents, crisis director, departments)
    orchestrator.ts turn pipeline: director -> kernel -> departments -> commander
    batch.ts        multi-scenario batch runner
    index.ts        barrel exports

  cli/              server + dashboard + CLI (not exported by package)
    serve.ts        HTTP + SSE server
    dashboard/      live visualization (static HTML/JS)
```

### Design Principle

**The engine owns the chassis. The scenario owns the domain.**

The kernel owns canonical state, time, randomness, and invariants. The scenario owns crisis categories, department instructions, progression hooks, fingerprint classification, and research citations. The orchestrator connects them.

## Package Exports

| Import | What |
|--------|------|
| `paracosm` | Engine types, registries, kernel, scenario packages |
| `paracosm/mars` | Mars Genesis scenario package |
| `paracosm/lunar` | Lunar Outpost scenario package |
| `paracosm/runtime` | `runSimulation`, `runBatch`, orchestration |
| `paracosm/core` | Kernel state types |

## Creating a Scenario

A `ScenarioPackage` defines everything the engine needs:

```typescript
const myScenario: ScenarioPackage = {
  id: 'my-scenario',
  version: '1.0.0',
  engineArchetype: 'closed_turn_based_settlement',
  labels: { name: 'My Scenario', shortName: 'my', populationNoun: 'members', settlementNoun: 'base', currency: 'credits' },
  theme: { primaryColor: '#22c55e', accentColor: '#86efac', cssVariables: {} },
  setup: { defaultTurns: 8, defaultSeed: 100, defaultStartYear: 2040, defaultPopulation: 30 },
  world: { metrics: {}, capacities: {}, statuses: {}, politics: {}, environment: {} },
  departments: [
    { id: 'engineering', label: 'Engineering', role: 'Chief Engineer', icon: '⚙️', defaultModel: 'gpt-5.4-mini', instructions: '...' },
  ],
  hooks: {
    progressionHook: (ctx) => { /* your domain-specific progression */ },
    directorInstructions: () => '...',
    getMilestoneCrisis: (turn, max) => turn === 1 ? { /* ... */ } : null,
  },
  // ... metrics, events, effects, ui, knowledge, policies, presets
};
```

## What AgentOS Provides

| Capability | How It's Used |
|-----------|--------------|
| [`agent()`](https://docs.agentos.sh/api) | Commander, department, and Crisis Director agents |
| [`generateText()`](https://docs.agentos.sh/api) | LLM calls for judge evaluation and crisis generation |
| [`EmergentCapabilityEngine`](https://docs.agentos.sh/api/classes/EmergentCapabilityEngine) | Runtime tool forging pipeline |
| [`EmergentJudge`](https://docs.agentos.sh/api/classes/EmergentJudge) | Safety and correctness review of forged tools |
| [`AgentMemory`](https://docs.agentos.sh/api/classes/AgentMemory) | Semantic research memory with DOI citations |

## The AgentOS Ecosystem

| Resource | URL |
|----------|-----|
| AgentOS (core runtime) | [github.com/framersai/agentos](https://github.com/framersai/agentos) |
| Documentation | [docs.agentos.sh](https://docs.agentos.sh) |
| API Reference | [docs.agentos.sh/api](https://docs.agentos.sh/api) |
| npm | [@framers/agentos](https://www.npmjs.com/package/@framers/agentos) |
| Paracosm | [github.com/framersai/paracosm](https://github.com/framersai/paracosm) |
| Website | [agentos.sh](https://agentos.sh) |

## License

Apache-2.0. Built by [Manic Agency](https://manic.agency) / [Frame.dev](https://frame.dev).

<p align="center">
  <a href="https://frame.dev"><img src="https://img.shields.io/badge/Frame.dev-team%40frame.dev-blue?style=flat-square" alt="Frame.dev" /></a>
  &nbsp;&middot;&nbsp;
  <a href="https://manic.agency"><img src="https://img.shields.io/badge/Manic_Agency-manic.agency-purple?style=flat-square" alt="Manic Agency" /></a>
  &nbsp;&middot;&nbsp;
  <a href="https://agentos.sh"><img src="assets/agentos-logo.png" alt="AgentOS" height="20" /></a>
</p>
