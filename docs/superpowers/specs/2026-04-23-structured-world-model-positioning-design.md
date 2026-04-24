# Design: paracosm as the structured world model for AI agents

**Date:** 2026-04-23
**Status:** Approved for execution (see Q1a / Q2i / Q3x from the brainstorm)
**Supersedes:** the implicit "AI agent swarm simulation engine" positioning used across 0.1–0.7.x copy.
**Code impact:** additive. No breaking changes to `paracosm`, `paracosm/runtime`, `paracosm/compiler`, `paracosm/schema`, `paracosm/core`, `paracosm/mars`, or `paracosm/lunar`.

---

## 1. Problem

The phrase "AI agent swarm simulation engine" no longer uniquely identifies paracosm in April 2026. Two things broke it:

1. **MiroFish / OASIS own the phrase.** MiroFish (github.com/666ghj/MiroFish) is "A Simple and Universal Swarm Intelligence Engine, Predicting Anything," built on CAMEL-AI's OASIS framework ("Open Agent Social Interaction Simulations with One Million Agents," openreview.net/forum?id=JBzTculaVV). MiroFish has four-digit GitHub stars, a hosted UI at mirofish.us, and raised $4M in 24 hours on its launch cycle. Its secondary marketing already uses the phrase "living world model."
2. **"World model" discourse is the load-bearing category of 2026.** LeCun's AMI Labs closed $1.03B on March 10 2026 (techcrunch.com). Eric Xing's arXiv paper "Critiques of World Models" (arXiv:2507.05169) argues the primary goal of a world model is "simulating all actionable possibilities," which is paracosm's product verbatim. The ACM CSUR 2025 survey "Understanding World or Predicting Future?" (dl.acm.org/doi/full/10.1145/3746449) formally separates world models into two branches: "understanding world" (paracosm-shaped) and "predicting future" (Sora/Genie-shaped): and treats both as legitimate.

Paracosm sits in the academically-well-defined **structured / LLM-based / counterfactual world model** branch and has no incumbent competitor in that exact slot. The current tagline leaves that positioning on the table.

## 2. Competitive landscape as of 2026-04-23

Paracosm is NOT any of these and should be named as not-any-of-these in public copy, so readers place it correctly on first glance:

| Category | Representative projects | What they do | Why paracosm is not this |
|---|---|---|---|
| Generative visual / spatial WM | OpenAI Sora, DeepMind Genie 3, World Labs Marble | Pixel-level or 3D-scene generation; text-to-video / text-to-world | Paracosm is symbolic / structured; its state is JSON-declared metrics, politics, statuses, environment, agents. No pixels. |
| JEPA / predictive-representation WM | LeCun AMI Labs, V-JEPA, I-JEPA | Self-supervised abstract representations trained on video / sensor streams | Paracosm does not train a model; it composes a deterministic kernel with an LLM reasoner. |
| Multi-agent task orchestration | LangGraph, AutoGen / AG2, CrewAI, OpenAI Agents SDK, Google ADK, Mastra | Build agentic workflows that execute tasks against real tools and APIs | Paracosm is a **simulation**, not a task executor. Nothing ships to the real world. The "agents" are simulated leaders, specialists, and colonists, not task runners. |
| Generative agent-based modeling | Google DeepMind Concordia, Stanford Generative Agents (Park et al, Smallville) | LLM-driven emergent social behavior in open-ended sandboxes; "Game Master" | Bottom-up emergent; no top-down leader; no deterministic kernel; no runtime tool forging. |
| Swarm intelligence / social simulation | MiroFish, OASIS (CAMEL-AI), AI Town | 1,000s–1,000,000 agents interacting socially, outputs aggregate prediction reports | MiroFish / OASIS are **emergent-crowd predictive**. Paracosm is **top-down counterfactual**. |
| Classical ABM (non-LLM) | Mesa, NetLogo, MASON, AnyLogic, ABIDES | Rule-based or statistical agent-based modeling; longstanding | No LLM; no scenario compilation from JSON; no runtime tool forging. |
| LLM-native digital-twin tooling | "When Digital Twins Meet LLMs" (arXiv 2507.00319), NVIDIA GTC-26 digital-twin sessions | Model a specific subject (vehicle, patient, factory) under counterfactual intervention | Paracosm's `SubjectConfig` + `InterventionConfig` primitives on `paracosm/schema` plug into this category directly, but paracosm itself is the broader engine. |
| Counterfactual World Simulation Models (CWSM) | Kirfel et al, Stanford 2025 ("Ethical implications of counterfactual world simulation models") | Replay an event with one counterfactual variable changed | **This is paracosm's core research lineage.** Same seed, same deterministic kernel, swap one variable (leader personality / intervention), measure the divergence. |

## 3. Decision

**Primary positioning line:**

> **Paracosm: the structured world model for AI agents. Reproducible counterfactual simulations from JSON.**

**Supporting slogan (retained from existing copy, it was already good):**

> **Same seed. Different leader. Different world.**

**Category claim (verbatim for README, landing page, features/paracosm.md, npm description):**

> Paracosm is a **structured world model** (Xing 2025; ACM CSUR 2025) and a **counterfactual world simulation model** (Kirfel et al, Stanford 2025). It is NOT a generative visual / spatial world model (Sora, Genie 3, World Labs Marble), NOT a JEPA-style predictive-representation model (LeCun / AMI Labs), NOT a multi-agent task orchestration framework (LangGraph, AutoGen, CrewAI, OpenAI Agents SDK), NOT a bottom-up swarm intelligence simulator (MiroFish, OASIS), and NOT a generative agent-based modeling library (Concordia, Stanford Generative Agents). It IS a JSON-defined state space + deterministic seeded kernel + LLM-driven events and specialist analyses + HEXACO-personality leaders + universal Zod-validated run artifact spanning turn-loop civilization simulations, batch-trajectory digital twins, and batch-point forecasts.

**Why this specific phrasing:**

- **"Structured"**: single most important qualifier. Removes Sora / Genie ambiguity on first read. Structured is the antonym readers naturally attach to "generative / pixel-based."
- **"World model"**: academically defensible (Xing 2025, ACM CSUR 2025), rides the $1B+ category narrative, and is the load-bearing phrase for 2026 discovery.
- **"For AI agents"**: scopes it to LLM / agent infrastructure so developer audiences self-identify. Disambiguates from human-facing spatial-WM products (Sora for filmmakers, Marble for 3D artists).
- **"Reproducible counterfactual simulations"**: names the unique mechanism (seeded kernel + swap one variable) and attaches to the CWSM research lineage without needing to spell out HEXACO up front.
- **"From JSON"**: shows the API surface immediately; differentiates from MiroFish (doc-upload UI) and from Sora (text-prompt) and from Concordia (Python library requiring code).

## 4. The seven claim pillars (used consistently across all copy)

Every paracosm surface (README, landing, docs, blog, npm, GitHub topics) leads with one or more of these, and no surface contradicts them. Each is verifiable against the source:

1. **Structured.** JSON-defined state space across five bags: `metrics` / `capacities` / `statuses` / `politics` / `environment`. See `ScenarioWorldSchema` in `src/engine/types.ts`.
2. **Reproducible.** Mulberry32-seeded PRNG for kernel state transitions. Same seed → identical agent rosters, lifecycle schedules, promotions. Divergence is *purely* from LLM leader-personality decisions. See `SeededRng` in `src/engine/core/`.
3. **Counterfactual-first.** The product is shipping two leaders against the same seed and surfacing the divergence. `runBatch` lets you do this at N scenarios × M leaders. See `src/runtime/batch.ts`.
4. **Personality-grounded.** HEXACO-PI-R six-factor model (Ashton & Lee 2007, PSPR 11(2)) with drift under three forces: leader-pull, role-activation, outcome-reinforcement. See `src/engine/core/state.ts` + `src/runtime/hexaco-cues/`.
5. **Research-grounded.** Seed-ingestion pipeline via AgentOS `WebSearchService` (Firecrawl / Tavily / Serper / Brave) + Cohere rerank-v3.5, DOI citations propagated into every department report. See `src/engine/compiler/seed-ingestion.ts` + `src/runtime/research/`.
6. **Tool-forging capable.** Department specialists write TypeScript tools at runtime; execution is sandboxed in a V8 isolate (128 MB / 10 s); an LLM judge approves before the tool enters the decision pipeline. Once a tool is approved, future turns invoke it via `call_forged_tool` at near-zero marginal cost (no second forge, no second judge pass): this is the single biggest lever on total run spend. Via AgentOS `EmergentCapabilityEngine` + `EmergentJudge`. See `src/runtime/emergent-setup.ts`.
7. **Universal artifact.** One Zod-validated `RunArtifact` schema (`paracosm/schema`) covers three simulation modes: `turn-loop`, `batch-trajectory`, `batch-point`. JSON Schema export via `npm run export:json-schema` for non-TypeScript consumers.

Copy everywhere is anchored to those seven claims. Any phrase that isn't anchored to one of them is a candidate for removal.

## 5. Package metadata changes

All landing points get updated in lockstep so a search hit on any one matches the others.

### 5.1 `package.json`

- `description` → "Structured world model for AI agents: reproducible counterfactual simulations with deterministic kernels, HEXACO-personality leaders, LLM-driven events, and runtime tool forging. Built on AgentOS."
- `keywords` → extend from
  `paracosm, simulation, multi-agent, ai-agents, emergent-behavior, tool-forging, hexaco, personality, agentos, typescript`
  to
  `paracosm, world-model, structured-world-model, llm-world-model, counterfactual-simulation, cwsm, digital-twin, decision-simulation, simulation, multi-agent, ai-agents, llm-agents, emergent-behavior, tool-forging, hexaco, personality, agentos, typescript`
- `homepage` unchanged (still https://agentos.sh).
- A new subpath export `paracosm/world-model` → `./dist/engine/world-model/index.js` once the façade lands (see §7).

### 5.2 GitHub repo (framersai/paracosm)

- Description: same line as `package.json` description, truncated to 350 chars for the repo field.
- Topics: add `world-models`, `structured-world-model`, `llm-agents`, `digital-twin`, `counterfactual`, `cwsm`, `agent-based-modeling`. Keep existing `simulation`, `multi-agent`, `hexaco`, `typescript`, `agentos`, `emergent-behavior`.
- Homepage URL stays `paracosm.agentos.sh`.
- (gh CLI isn't authenticated in this workspace; doc the steps here and the human operator runs them.)

### 5.3 npm page

Pulls `description` + `keywords` from `package.json` automatically. No separate action.

## 6. Documentation changes (content map)

Every surface below gets rewritten in this session so there's no old copy contradicting new copy. Source of truth is this spec.

| Surface | File | Change type |
|---|---|---|
| paracosm README | `apps/paracosm/README.md` | Rewrite top half (tagline, opener, taxonomy block); keep install/API/cost-envelope/compiler sections; refresh the "Built on AgentOS" table for consistency. |
| Landing page | `apps/paracosm/src/cli/dashboard/landing.html` | Rewrite `<title>` / `<meta description>` / `<meta keywords>` / OpenGraph / Twitter card / JSON-LD. Rewrite hero `<h1>` tagline + sub-tagline + chips. Add a new "Not these things" anti-positioning block. Keep feature grid + flow + divergence viz + pricing + FAQ. Update About / Roadmap vocabulary to match. |
| agentos-live-docs feature page | `apps/agentos-live-docs/docs/features/paracosm.md` | Rewrite opener + universal-result section; add taxonomy block from §3; leave the "nine stages" table + HEXACO drill-down intact. |
| agentos-live-docs root | `apps/agentos-live-docs/docs/index.md` | One-line reference to paracosm's new positioning where paracosm is mentioned. |
| Paracosm positioning doc (new) | `apps/paracosm/docs/positioning/world-model-mapping.md` | Full taxonomy table (§2) + seven claim pillars (§4) + citations. Links back from README + features/paracosm.md + landing page. |
| Blog post (new) | `apps/agentos.sh/content/blog/paracosm-structured-world-model.md` | 1500–2000 word explainer: "Paracosm is a structured world model." Walks the Xing / CSUR / CWSM lineage, contrasts MiroFish / OASIS / Concordia / Generative Agents, shows the `corporate-quarterly` smoke as evidence. |
| Older blog posts | `apps/agentos.sh/content/blog/build-ai-civilization-simulation-paracosm.md`, `inside-mars-genesis-ai-colony-simulation.md`, `emergent-tools-hexaco-leaders.md` | Leave content; add a short editor's note at top linking the new positioning post. No retroactive rewrite. |

## 7. Code surface additions (thin façade, no breaking changes)

The positioning says "world model" in the vocabulary. The code currently uses `compileScenario` + `runSimulation` / `runBatch`. A thin `WorldModel` façade makes the two line up without deprecating anything:

```typescript
// New: paracosm/world-model subpath
import { WorldModel } from 'paracosm/world-model';

const wm = await WorldModel.fromJson(worldJson, { provider: 'anthropic' });

const result = await wm.simulate(leader, {
  maxTurns: 6,
  seed: 42,
  costPreset: 'economy',
});

// result is a RunArtifact: same universal schema as before.
```

Concretely:

- New file `src/engine/world-model/index.ts` exports class `WorldModel` with:
  - `static async fromJson(worldJson, compileOptions?)`: wraps `compileScenario`.
  - `static async fromScenario(scenarioPackage)`: wraps a pre-compiled `ScenarioPackage`.
  - `simulate(leader, runOptions)`: wraps `runSimulation`.
  - `batch(options)`: wraps `runBatch`.
  - `get scenario()`: returns the underlying `ScenarioPackage` for escape-hatch use.
- Subpath export added to `package.json`: `"./world-model": { "import": "./dist/engine/world-model/index.js", "types": "./dist/engine/world-model/index.d.ts" }`.
- Existing APIs unchanged. `runSimulation`, `runBatch`, `compileScenario`, `createParacosmClient` all keep their current shapes and exports. The façade is a convenience layer, not a replacement.
- Tests: one smoke test in `tests/world-model/facade.test.ts` exercising `fromJson` → `simulate` → `RunArtifactSchema.parse` on a minimal scenario. Targeted, not a new test suite.

## 8. What we are deliberately not doing

- **Not renaming any existing symbol.** `runSimulation` stays `runSimulation`. `ScenarioPackage` stays `ScenarioPackage`. Positioning changes what we call the product in public copy; the API language stays stable.
- **Not deprecating `runSimulation` / `runBatch` / `compileScenario`.** The façade is purely additive.
- **Not rewriting the old blog posts.** Editor's notes only.
- **Not bumping `COMPILE_SCHEMA_VERSION`.** No runtime behavior change.
- **Not touching `src/runtime/state.ts` rename to `metrics` (Tier 2 item 7 in the session handoff).** That's a separate workstream; mentioning it here so we don't conflate.
- **Not shipping Tier 1/2 items from the session handoff** (F23.1 dashboard strings, per-timepoint worldSnapshot widening, CLI run-a fix, sandboxing, HTTP `/simulate`, SQLite adapter). Those land in a follow-up plan.
- **Not advertising the hosted product more aggressively.** Keep the existing "Open Core, Commercial Roadmap" tone; paid tiers stay TBD.

## 9. Success criteria

Ship is judged on four checks:

1. **Category match on a cold read.** A developer who never saw paracosm before lands on the README or landing page and can correctly answer "what category is this" within 15 seconds (structured / LLM-based / counterfactual world model, not a multi-agent framework, not a Sora competitor, not a MiroFish clone). Validated by hand-reading the README + landing + features page end-to-end and asking "would I explain it right now."
2. **No contradictions.** Every surface (README / landing / features/paracosm.md / npm description / GitHub description / new blog post / positioning doc / façade JSDoc) uses the seven claim pillars consistently. Hand-grep for "AI agent swarm simulation engine" returns zero results outside the old-blog-post editor's notes.
3. **Tests stay green.** `npm test` baseline `567 pass / 0 fail / 1 skip` stays green after the façade lands. Façade adds one targeted test; no existing test modified unless a string literal changed.
4. **Type check stays clean.** `npx tsc --noEmit -p tsconfig.build.json` has no new errors beyond the pre-existing Zod-v4 warnings in `src/runtime/llm-invocations/*` and `src/engine/compiler/llm-invocations/*`.

## 10. Execution order

Executed in this session in one coherent push, with commits at natural boundaries so a bisect can isolate regressions:

1. Write + commit this spec. (*In flight.*)
2. Write `docs/positioning/world-model-mapping.md` (reference doc the other surfaces link to).
3. Rewrite `README.md`.
4. Rewrite `src/cli/dashboard/landing.html` meta + hero + anti-positioning block.
5. Rewrite `apps/agentos-live-docs/docs/features/paracosm.md` opener + universal-result section, and refresh any paracosm mentions in `apps/agentos-live-docs/docs/index.md` to match.
6. Update `package.json` description + keywords + subpath export.
7. Add `src/engine/world-model/index.ts` façade + targeted test. Run `npm test` + `tsc --noEmit`. Commit.
8. Draft new blog post `apps/agentos.sh/content/blog/paracosm-structured-world-model.md`.
9. Add editor's notes to the three existing paracosm blog posts.
10. Invoke `superpowers:writing-plans` to design the next round of code follow-ups (Tier 1/2 from the session handoff + any façade extensions we discover in step 7).

Steps 2–9 are commits in `apps/paracosm` and `apps/agentos.sh` (the latter is a submodule; push rules per user guidance apply). The GitHub-repo-description + topics change happens after push; user runs `gh` manually since the CLI isn't auth'd here.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Readers still read "world model" and think Sora/Genie | Anti-positioning block on landing + README explicitly naming Sora / Genie 3 / Marble as *not this*. The word "structured" on every first mention. |
| Existing audience who knew paracosm as "agent swarm" feels bait-and-switched | Old blog posts retained verbatim; editor's notes link forward, not rewrite backward. "Same seed, different leader, different world" slogan retained: that phrase has audience equity. |
| MiroFish claims "living world model" and says we're copying | Our positioning is *structured* + *counterfactual* + *reproducible*; blog post contrasts explicitly and cites academic lineage (Xing, ACM CSUR, Kirfel). Timeline documents we arrived via the research, not the competitor. |
| Tests regress on any rewrite touching strings | Full `npm test` + `tsc --noEmit` in step 7 before commit. Landing-page HTML + README + docs changes are string-only, no code paths touched. |
| Submodule push discipline slips | Work from `apps/paracosm/` per user rule. Never `git add apps/paracosm` from the monorepo root. Push paracosm commits to `paracosm` remote separately from monorepo commits. |

## 12. References

- [Critiques of World Models: Eric Xing, arXiv:2507.05169](https://arxiv.org/abs/2507.05169)
- [Understanding World or Predicting Future? A Comprehensive Survey of World Models: ACM CSUR 2025](https://dl.acm.org/doi/full/10.1145/3746449)
- [Ethical implications of counterfactual world simulation models: Kirfel et al, Stanford 2025 (PDF)](https://cicl.stanford.edu/papers/kirfel2025when.pdf)
- [Large Language Model Based Multi-agents: A Survey of Progress and Challenges: IJCAI 2024](https://www.ijcai.org/proceedings/2024/890)
- [LLM-Based World Models Can Make Decisions Solely: arXiv:2411.08794](https://arxiv.org/html/2411.08794v2)
- [Large language models empowered agent-based modeling and simulation: Nature HSSC 2024](https://www.nature.com/articles/s41599-024-03611-3)
- [World Models: Five Competing Approaches: Themesis, 2026-01-07](https://themesis.com/2026/01/07/world-models-five-competing-approaches/)
- [Yann LeCun's AMI Labs raises $1.03B: TechCrunch 2026-03-09](https://techcrunch.com/2026/03/09/yann-lecuns-ami-labs-raises-1-03-billion-to-build-world-models/)
- [OASIS: Open Agent Social Interaction Simulations: OpenReview](https://openreview.net/forum?id=JBzTculaVV)
- [MiroFish: github.com/666ghj/MiroFish](https://github.com/666ghj/MiroFish)
- [Generative Agents: Interactive Simulacra of Human Behavior: Park et al, 2023, arXiv:2304.03442](https://arxiv.org/abs/2304.03442)
- [Concordia: Generative Agent-Based Modeling: Google DeepMind](https://deepmind.google/research/publications/64717/)
- [When Digital Twins Meet LLMs: arXiv:2507.00319](https://arxiv.org/abs/2507.00319)
- [HEXACO model: Ashton & Lee, 2007: Personality and Social Psychology Review 11(2), doi:10.1177/1088868306294907](https://doi.org/10.1177/1088868306294907)
