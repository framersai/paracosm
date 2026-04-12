<p align="center">
  <img src="https://raw.githubusercontent.com/framersai/agentos/master/logos/agentos-primary-transparent-2x.png" alt="AgentOS" height="48" />
</p>

<h1 align="center">Mars Genesis Simulation</h1>

<p align="center">
  Multi-agent Mars colony simulation with emergent tool forging, HEXACO personality evolution, and a deterministic kernel. Built with <a href="https://agentos.sh">AgentOS</a>.
</p>

<p align="center">
  <a href="https://agentos.sh"><strong>agentos.sh</strong></a> &middot;
  <a href="https://docs.agentos.sh">Docs</a> &middot;
  <a href="https://github.com/framersai/agentos">AgentOS GitHub</a> &middot;
  <a href="https://www.npmjs.com/package/@framers/agentos">npm</a> &middot;
  <a href="https://discord.gg/VXXC4SJMKh">Discord</a>
</p>

---

## What This Proves

Mars Genesis demonstrates three AgentOS capabilities in a single, runnable simulation:

1. **Emergent tool forging.** Department agents create computational tools at runtime (radiation models, food security calculators, structural analyzers) that are judge-reviewed before activation. The agent invents the tool it needs. Nobody pre-programmed it.

2. **HEXACO personality evolution.** Promoted colonists' six-factor personality traits drift over 50 years based on their commander's leadership style, their department role, and crisis outcomes. Same person under two different commanders becomes a fundamentally different leader by Turn 12.

3. **Deterministic simulation kernel.** Seeded RNG, typed contracts, invariant enforcement. Same seed produces the same births, deaths, and promotions. Only the commander's personality-driven decisions differ. The divergence is entirely explainable.

## The Experiment

Two commanders receive the same colony of 100 colonists, the same 12 crises across 50 years, and the same starting resources. Their HEXACO personalities drive different decisions, different tool inventions, and different civilizational outcomes.

| | Commander Aria Chen | Commander Dietrich Voss |
|---|---|---|
| **Archetype** | The Visionary | The Engineer |
| **Openness** | 0.95 (explores, experiments) | 0.25 (proven methods only) |
| **Conscientiousness** | 0.35 (loose, fast) | 0.97 (precise, thorough) |
| **Extraversion** | 0.85 (charismatic, rallying) | 0.30 (protocols, not speeches) |
| **Emotionality** | 0.30 (cool under pressure) | 0.70 (anxious, contingency-focused) |
| **Honesty-Humility** | 0.65 (spins setbacks) | 0.90 (shares bad news immediately) |

## Architecture

```
mars-genesis-simulation/
├── src/
│   ├── kernel/                  # Deterministic simulation engine (no LLM)
│   │   ├── state.ts             # Canonical types: Colonist, ColonySystems, HEXACO
│   │   ├── rng.ts               # Seeded PRNG (Mulberry32)
│   │   ├── colonist-generator.ts # 100 colonists from seed with random HEXACO
│   │   ├── progression.ts       # Between-turn: aging, births, deaths, drift
│   │   └── kernel.ts            # Policy application, invariants, turn advancement
│   ├── agents/                  # Multi-agent orchestration (uses AgentOS)
│   │   ├── contracts.ts         # Typed DepartmentReport, CommanderDecision
│   │   ├── departments.ts       # Department agent configs and context builders
│   │   └── orchestrator.ts      # Turn pipeline: kernel -> departments -> commander -> kernel
│   ├── research/                # Crisis definitions and curated citations
│   │   ├── scenarios.ts         # 12 crises with riskyOption classification
│   │   └── research.ts          # Per-crisis research packets with DOIs
│   ├── dashboard/               # Live visualization (HTML + SSE)
│   ├── types.ts                 # Shared type definitions
│   ├── run-visionary.ts         # Entry: Aria Chen simulation
│   └── run-engineer.ts          # Entry: Dietrich Voss simulation
├── output/                      # JSON run artifacts
├── package.json
└── tsconfig.json
```

### Design Principle

**The host runtime owns truth. The agents own interpretation.**

The kernel owns canonical state, time, randomness, and invariants. The agents own research, analysis, disagreement, tool forging, and recommendations. Forged tools produce scores and projections that influence decisions. The kernel applies bounded, deterministic state transitions.

## The 12 Crises

| Turn | Year | Crisis | Real Science |
|------|------|--------|-------------|
| 1 | 2035 | Landfall: choose landing site | [HiRISE terrain](https://www.uahirise.org/), [Curiosity RAD](https://doi.org/10.1126/science.1244797) |
| 2 | 2037 | Water extraction failure | [MARSIS ice](https://www.esa.int/Science_Exploration/Space_Science/Mars_Express), [MOXIE](https://mars.nasa.gov/mars2020/spacecraft/instruments/moxie/) |
| 3 | 2040 | Perchlorate poisoning | [Phoenix lander](https://doi.org/10.1126/science.1172339), [bioremediation](https://doi.org/10.1089/ast.2013.0995) |
| 4 | 2043 | Population pressure from Earth | [NASA ECLSS](https://www.nasa.gov/humans-in-space/eclss/), [habitat sizing](https://doi.org/10.2514/6.2016-5526) |
| 5 | 2046 | Solar particle event (CME) | [Cucinotta 2010](https://doi.org/10.1667/RR2397.1), [Acuna 1999](https://doi.org/10.1126/science.284.5415.790) |
| 6 | 2049 | Mars-born children: bone density | [Sibonga 2019](https://doi.org/10.1038/s41526-019-0075-2), [Hughson 2018](https://doi.org/10.1503/cmaj.180343) |
| 7 | 2053 | Communication blackout | [Solar conjunction](https://mars.nasa.gov/all-about-mars/night-sky/solar-conjunction/) |
| 8 | 2058 | Colony-wide depression | [Mars-500 study](https://doi.org/10.1073/pnas.1212646110), [Palinkas 2008](https://doi.org/10.1146/annurev.psych.58.110405.085726) |
| 9 | 2063 | Independence movement | Space governance, communication delay |
| 10 | 2068 | Terraforming proposal | [Jakosky 2018](https://doi.org/10.1038/s41550-018-0529-6), [Zubrin 1993](https://doi.org/10.1089/153110703769016389) |
| 11 | 2075 | Consequence cascade | Path dependence, compounding decisions |
| 12 | 2085 | Legacy assessment | 50-year civilization scorecard |

## Personality Drift

Promoted colonists' HEXACO traits evolve each turn through three forces:

- **Leader pull** (0.02/year): traits converge toward the commander's profile
- **Role pull** (0.01/year): department role activates specific traits
- **Outcome pull** (event-driven): successful risks boost openness, failed risks boost conscientiousness

Grounded in [leader-follower alignment](https://www.tandfonline.com/doi/full/10.1080/1359432X.2023.2250085), [trait activation theory](https://doi.org/10.1037/0021-9010.88.3.500), and the [social investment principle](https://pmc.ncbi.nlm.nih.gov/articles/PMC3398702/).

## Run

```bash
npm install

# Full 12-turn Visionary simulation
OPENAI_API_KEY=sk-... npm run visionary

# Full 12-turn Engineer simulation
OPENAI_API_KEY=sk-... npm run engineer

# 3-turn smoke test
OPENAI_API_KEY=sk-... npm run smoke

# With live web search (requires SERPER_API_KEY)
OPENAI_API_KEY=sk-... SERPER_API_KEY=... npx tsx src/run-visionary.ts 3 --live
```

Output is written to `output/` as JSON artifacts.

## Requirements

- Node.js 22+
- `OPENAI_API_KEY` (gpt-5.4 for commander, gpt-5.4-mini for departments)
- Optional: `SERPER_API_KEY` for live web search augmentation

## What AgentOS Provides

| Capability | How It's Used |
|-----------|--------------|
| [`agent()`](https://docs.agentos.sh/api) | Commander and department agents with HEXACO personality |
| [`generateText()`](https://docs.agentos.sh/api) | LLM calls for judge evaluation |
| [`EmergentCapabilityEngine`](https://docs.agentos.sh/api/classes/EmergentCapabilityEngine) | Runtime tool forging pipeline |
| [`EmergentJudge`](https://docs.agentos.sh/api/classes/EmergentJudge) | Safety and correctness review of forged tools |
| [`ForgeToolMetaTool`](https://docs.agentos.sh/api/classes/ForgeToolMetaTool) | ITool interface for agents to call forge |
| [`ComposableToolBuilder`](https://docs.agentos.sh/api/classes/ComposableToolBuilder) | Chain existing tools into pipelines |
| [`SandboxedToolForge`](https://docs.agentos.sh/api/classes/SandboxedToolForge) | Isolated V8 execution for forged code |
| [`EmergentToolRegistry`](https://docs.agentos.sh/api/classes/EmergentToolRegistry) | Tiered tool storage and promotion |

## The AgentOS Ecosystem

| Resource | URL |
|----------|-----|
| AgentOS (core runtime) | [agentos.sh](https://agentos.sh) |
| Documentation | [docs.agentos.sh](https://docs.agentos.sh) |
| API Reference | [docs.agentos.sh/api](https://docs.agentos.sh/api) |
| npm | [@framers/agentos](https://www.npmjs.com/package/@framers/agentos) |
| GitHub | [framersai/agentos](https://github.com/framersai/agentos) |
| Extensions (107+) | [framersai/agentos-extensions](https://github.com/framersai/agentos-extensions) |
| Skills (72) | [framersai/agentos-skills](https://github.com/framersai/agentos-skills) |
| Workbench | [framersai/agentos-workbench](https://github.com/framersai/agentos-workbench) |
| Discord | [discord.gg/VXXC4SJMKh](https://discord.gg/VXXC4SJMKh) |

## License

MIT. Built by [Manic Agency](https://manic.agency) / [Frame.dev](https://frame.dev).

<p align="center">
  <a href="https://agentos.sh"><img src="https://raw.githubusercontent.com/framersai/agentos/master/logos/agentos-primary-transparent-2x.png" alt="AgentOS" height="32" /></a>
</p>
