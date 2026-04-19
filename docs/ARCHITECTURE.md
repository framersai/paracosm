# Paracosm Architecture

Paracosm is an AI agent swarm simulation engine. It runs parallel civilizations with AI commanders that have different HEXACO personality profiles, and produces measurably different outcomes from identical starting conditions.

This document covers the full system: how scenarios become simulations, how agents make decisions, how tools get forged at runtime, how the chat system maintains character consistency, and how the API enables arbitrary scenario types.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Scenario JSON                        │
│  Defines: departments, metrics, events, labels, setup        │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                      Scenario Compiler                       │
│  JSON → LLM-generated hooks (progression, prompts, politics) │
│  Cost: ~$0.10. Cached to disk after first compile.           │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    Deterministic Kernel                       │
│  RNG (seeded), state machine, metric updates, progression    │
│  Same seed + same decisions = same numerical outcomes         │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                     Runtime Orchestrator                      │
│  Turn pipeline: Director → Kernel → Departments → Commander  │
│  Both leaders run in parallel via Promise.all                │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Dashboard (React/Vite) + SSE Stream             │
│  Side-by-side visualization, reports, chat, event log        │
└─────────────────────────────────────────────────────────────┘
```

## The Engine

### Scenario Definition

A scenario is a JSON file that describes the simulation domain. It does not contain any code. The engine handles crisis generation, state transitions, tool forging, and personality drift. The scenario handles domain vocabulary and structure.

```json
{
  "id": "mars-genesis",
  "labels": { "name": "Mars Genesis", "populationNoun": "colonists", "settlementNoun": "colony" },
  "setup": { "defaultTurns": 6, "defaultSeed": 950, "defaultStartYear": 2035, "defaultYearsPerTurn": 8 },
  "departments": [
    { "id": "medical", "label": "Medical", "role": "Chief Medical Officer", "instructions": "Analyze health impacts..." },
    { "id": "engineering", "label": "Engineering", "role": "Chief Engineer", "instructions": "Analyze infrastructure..." }
  ],
  "metrics": [
    { "id": "population", "format": "number" },
    { "id": "morale", "format": "percent" }
  ]
}
```

**Any domain works.** Mars colonies, submarine habitats, space stations, medieval kingdoms. The engine is domain-agnostic. The scenario JSON defines what gets simulated.

**Terminology.** The `labels.populationNoun` (plural, e.g. `colonists` → `crew` → `subjects`) and `labels.settlementNoun` (singular, e.g. `colony` → `habitat` → `kingdom`) fields flavour every user-facing string in the dashboard — help legends, roster headers, empty states, ARIA labels, report copy. The engine defaults to `colonists` / `colony` when omitted (Mars heritage), but non-Mars scenarios should override both. Singular/capitalized variants are derived automatically by the dashboard's `useScenarioLabels()` hook.

### Seed Enrichment & Citation Flow

The compiler accepts real-world source material (`--seed-text` or `--seed-url`) and threads citations end-to-end through the simulation:

```
SEED                            (text or URL — Firecrawl extracts markdown)
  ↓
EXTRACT                         (LLM → topics, facts, searchQueries, crisisCategories)
  ↓
SEARCH                          (AgentOS WebSearchService: Firecrawl + Tavily +
                                  Serper + Brave in parallel, semantic dedup,
                                  RRF fusion, optional Cohere rerank-v3.5)
  ↓
KNOWLEDGE BUNDLE                (topics[].canonicalFacts[], categoryMapping)
  ↓ runtime init
RESEARCH MEMORY                 (AgentOS AgentMemory.sqlite — semantic recall)
  ↓ per event
recallResearch(query, keywords) (semantic memory recall, fall back to bundle,
                                  fall back to live web search if liveSearch=on)
  ↓
DEPARTMENT PROMPT               (citations injected as `[claim](url)` markdown)
  ↓
DEPARTMENT REPORT               (LLM returns citations[]; orchestrator auto-fills
                                  from packet if LLM omits them — provenance
                                  guarantee)
  ↓
SSE dept_done event             (citationList[]: text, url, doi)
  ↓
DASHBOARD REPORTS TAB           (clickable citation links beneath each summary)
```

The Event Director also receives the knowledge bundle's `topics` and `categories`. Its `researchKeywords` and `category` fields stay grounded in actual citation entries, so retrieval downstream finds matches.

### Scenario Compiler

The compiler turns JSON into a runnable `ScenarioPackage` by generating TypeScript hook functions via LLM calls:

| Hook | What it generates | Called when |
|------|-------------------|------------|
| `progressionHook` | Between-turn state updates (radiation, bone density, etc.) | Between every turn |
| `departmentPromptHook` | Department-specific analysis context | Before each department analyzes |
| `fingerprintHook` | Timeline classification from final state | After simulation completes |
| `politicsHook` | Political/social effects for relevant events | After political/social crises |
| `getMilestoneEvent` | Fixed narrative events (Turn 1 founding, final assessment) | Turn 1 and final turn |
| `reactionsHook` | Colonist personality-aware reactions | After each commander decision |

Compilation costs ~$0.10 and is cached to disk. The compiler accepts `--seed-text` and `--seed-url` for domain research, and `--no-web-search` to skip web enrichment.

### Deterministic Kernel

The `SimulationKernel` manages all numerical state. It is deterministic: given the same seed and the same commander decisions, it produces identical outcomes.

The kernel tracks:
- **Colony metrics**: population, morale, food reserves, power, infrastructure modules, science output
- **Agent population**: each colonist has health (alive, psychScore, conditions), career (role, rank, specialization), social (partner, children, friends), and narrative (featured, quotes) data
- **Progression**: between-turn updates (aging, mortality, births, career advancement, personality drift)

The kernel uses a `SeededRng` (deterministic PRNG) for all random decisions: colonist generation, mortality probability, birth events, personality drift magnitudes. Two simulations with the same seed produce the same colonist names, the same birth/death events, and the same base progression.

What differs is the commander's decisions. The crisis is the same, the department analysis is the same, but two commanders with different HEXACO profiles choose differently. The kernel applies different numerical effects based on the choice, and divergence compounds.

### Health Fields

Core agent health fields (`AgentHealth`):
- `alive`, `psychScore`, `conditions` are universal (every scenario)
- `boneDensityPct`, `cumulativeRadiationMsv` are optional (Mars/Lunar specific)
- `[key: string]: unknown` index signature allows any scenario to add custom health fields

Custom scenarios define their own health metrics in their progression hooks. The kernel doesn't hard-code any domain-specific health logic.

## The Runtime

### Turn Pipeline

Each turn follows a fixed pipeline:

```
1. Event Director generates a crisis from current colony state
   └── LLM reads: colony metrics, recent events, population health, tool history
   └── Produces: title, description, options (safe/risky), category, research keywords

2. Kernel applies between-turn progression
   └── Aging, mortality, births, career advancement
   └── Scenario-specific hooks (radiation, bone density for Mars)

3. Department agents analyze the crisis IN PARALLEL
   └── Each department gets: crisis context, colony snapshot, research citations, memory
   └── Each department produces: summary, risks, recommended actions, forged tools
   └── All 5 departments run concurrently via Promise.all (~30s total vs ~150s sequential)

4. Commander reads department reports and decides
   └── LLM reads: crisis, all department summaries, HEXACO personality profile
   └── Produces: decision text, rationale, selected policies, risky/safe choice

5. Kernel applies decision effects
   └── Outcome determined by crisis probability + commander choice
   └── Bounded numerical effects applied to colony metrics

6. Colonist reactions generated
   └── Featured colonists react based on their personality and the decision
   └── Reactions are mood-tagged and personality-aware

7. State broadcast via SSE
   └── All events streamed to dashboard in real time
```

### LLM Reliability

Every structured LLM call in paracosm routes through one of two schema-validated wrappers:

- **[`generateValidatedObject`](../src/runtime/llm-invocations/generateValidatedObject.ts)** — one-shot calls over AgentOS `generateObject`. Used for director event batches, reaction batches, verdict.
- **[`sendAndValidate`](../src/runtime/llm-invocations/sendAndValidate.ts)** — session-aware wrapper over AgentOS `session.send()`. Preserves conversation memory (commander remembers prior events, dept heads remember prior analyses) while adding Zod retry-with-feedback. Used for commander decisions, department reports, and promotions.

Both wrappers return the fully-validated object matching a Zod schema in [`src/runtime/schemas/`](../src/runtime/schemas/). Validation failures trigger up to 2 retries with the Zod error appended to the retry prompt so the model self-corrects. If retries exhaust, the wrapper returns a caller-provided fallback skeleton and emits a `validation_fallback` SSE event so the dashboard can surface the degradation.

| Call site | Schema | Wrapper |
|-----------|--------|---------|
| Director event batch | `DirectorEventBatchSchema` | `generateValidatedObject` |
| Department report | `DepartmentReportSchema` | `sendAndValidate` |
| Commander decision | `CommanderDecisionSchema` | `sendAndValidate` |
| Promotions | `PromotionsSchema` | `sendAndValidate` |
| Reactions batch | `ReactionBatchSchema` | `generateValidatedObject` |
| Verdict | `VerdictSchema` | `generateValidatedObject` |

The commander, verdict, and director all write their stepwise reasoning into a `reasoning` field on their schema. The field is preserved in the run artifact (previously reasoning lived in stripped-and-discarded `<thinking>` tags). Dashboard renders the compressed `rationale` by default and the full `reasoning` behind a "show full analysis" expand.

### Emergent Tool Forging

Department agents forge computational tools at runtime using AgentOS's `EmergentCapabilityEngine`. When a department encounters a crisis it cannot analyze with existing tools, it writes JavaScript code to build a custom calculator.

**How it works:**

1. The department agent calls `forge_tool` with a name, description, input/output schema, implementation code, and test cases.
2. A pre-judge validator (`validateForgeShape`) checks the request is well-formed. When the LLM emits concrete test cases but forgets to declare `inputSchema.properties` / `outputSchema.properties`, a companion helper `inferSchemaFromTestCases` synthesizes the missing properties from the test data so the forge doesn't get rejected on a formality the test cases already witnessed.
3. The `SandboxedToolForge` executes the code in an isolated V8 context with hard resource limits:
   - Memory: 128 MB
   - Timeout: 10 seconds
   - Blocked APIs: `eval`, `require`, `process`, `fs.write*`
   - Allowed APIs (opt-in): `fetch` (domain-restricted), `fs.readFile` (path-restricted), `crypto` (hashing only)
4. The `EmergentJudge` (LLM-as-judge) reviews the tool for safety, correctness, determinism, and schema compliance.
5. If approved, the tool is registered at session scope and available for future turns via the `call_forged_tool` meta-tool (no re-forge required).

**Example:** The Medical department faces a radiation crisis. It forges a `radiation_dose_calculator` that computes cumulative dose from exposure rate and duration. The tool passes judge review and is registered. On the next turn, the same department uses the calculator to project 10-year exposure trends.

Tools start at session scope and can be promoted:
- Session → Agent (5+ uses, >0.8 confidence, two-reviewer panel)
- Agent → Shared (human approval required)

### HEXACO Personality Model

Each commander and colonist has a HEXACO personality profile (Ashton & Lee, 2007): six orthogonal trait dimensions measured on a [0, 1] scale.

| Trait | Dimension | High value | Low value |
|-------|-----------|------------|-----------|
| H | Honesty-Humility | Sincere, fair | Self-interested, status-seeking |
| E | Emotionality | Empathetic, anxious | Detached, stoic |
| X | Extraversion | Sociable, assertive | Reserved, quiet |
| A | Agreeableness | Patient, cooperative | Critical, confrontational |
| C | Conscientiousness | Disciplined, thorough | Flexible, spontaneous |
| O | Openness | Creative, curious | Conventional, practical |

In Paracosm, HEXACO influences:

- **Commander decisions**: conditional cues fire at the 0.7 / 0.3 poles, translating trait values into concrete behavioral implications (e.g., high openness → "the unknown is opportunity, not threat"; high conscientiousness → "you would rather be slow and right than fast and wrong").
- **Colonist reactions**: per-agent reaction blocks include cue strings from `buildReactionCues` so reacting agents don't have to re-derive personality behavior from a vector each call. All six axes have both-pole cues.
- **Personality drift**: all six traits drift turn-over-turn from experience. Three forces combine per trait:
  - *Leader pull* — trait value converges toward the commander's (Van Iddekinge 2023)
  - *Role pull* — department role activates specific traits (Tett & Burnett 2003)
  - *Outcome pull* — every (trait, outcome) pair has a peer-reviewed sign (Silvia & Sanders 2010 for openness; Roberts et al. 2006 for conscientiousness; Smillie et al. 2012 for extraversion; Graziano et al. 2007 for agreeableness; Lee & Ashton 2004 for emotionality; Hilbig & Zettler 2009 for honesty-humility)
  - Rate-capped at ±0.05/turn; bounds [0.05, 0.95]
- **Commander drift**: the commander's HEXACO evolves alongside agents. `runSimulation` clones `leader.hexaco` at run start and applies outcome-pull after every turn's resolution. The final output carries both the drifted `hexaco`, the original `hexacoBaseline`, and a per-turn `hexacoHistory` for trajectory visualization. The caller's `LeaderConfig` is never mutated.
- **Trajectory cues**: commander, director, and department-head prompts all receive a one-line cue describing drift since turn 0 ("Since you took command, your personality has drifted substantially toward higher openness and measurably away from higher conscientiousness. Notice how recent decisions have shaped your judgment."). Threshold 0.05 matches the per-turn rate cap.
- **Chat memory retrieval**: AgentOS uses HEXACO to modulate which memories surface during character chat.

### Parallel Execution

Both commanders run in parallel via `Promise.all` in `pair-runner.ts`. Within each commander's turn, all department analyses also run in parallel. This produces two independent timelines from the same starting conditions:

```
Turn N:
  Commander A (Promise.all[0]):
    Departments [medical, engineering, agriculture, psychology, governance] → Promise.all
    Commander decision
    Outcome + effects
  Commander B (Promise.all[1]):
    Departments [medical, engineering, agriculture, psychology, governance] → Promise.all
    Commander decision
    Outcome + effects
```

The Event Director generates different crises for each commander based on their colony's current state. Same seed controls the deterministic kernel, but the LLM-generated crises diverge based on accumulated state differences.

## Post-Simulation

### LLM Verdict

After both commanders complete all turns, an LLM compares their final states and produces a verdict:

```json
{
  "winner": "A",
  "winnerName": "Aria Chen",
  "headline": "Bold expansion outpaced cautious engineering",
  "summary": "Chen's high openness led to riskier decisions that paid off in population growth...",
  "keyDivergence": "Turn 3 dust storm response: Chen sent exterior repair crews while Voss reinforced from inside",
  "scores": {
    "a": { "survival": 8, "prosperity": 9, "morale": 6, "innovation": 9 },
    "b": { "survival": 9, "prosperity": 7, "morale": 7, "innovation": 5 }
  }
}
```

The verdict is broadcast as an SSE `verdict` event and rendered in the dashboard as a comparison card with score bars.

### Character Chat

After the simulation, users can chat with any colonist. Each colonist is a full AgentOS `agent()` instance with:

- **HEXACO personality** passed to `agent({ personality: { ... } })`
- **Episodic memory** seeded with their simulation experiences (reactions, crises, department reports, decisions)
- **Full conversation history** managed automatically by `session.send()`
- **RAG retrieval** before each turn: `memory.getContext()` retrieves relevant simulation memories

This prevents the contradictions that plagued the old system. The colonist cannot claim Yoruba heritage in one message and deny it in the next because both statements are stored in episodic memory and retrieved by the RAG pipeline.

Agents are created lazily on first chat message (~2-3s init) and pooled (max 10, LRU eviction).

## API

### HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/setup` | Start a new simulation with leaders, turns, seed, departments |
| `GET` | `/events` | SSE stream of simulation events |
| `POST` | `/clear` | Clear simulation state and chat agent pool |
| `POST` | `/chat` | Chat with a colonist agent |
| `GET` | `/results` | Full simulation results including verdict |
| `GET` | `/rate-limit` | Check rate limit status |
| `POST` | `/compile` | Compile a custom scenario from JSON |
| `GET` | `/retry-stats` | Cross-run reliability rollup (schemas + forges + caches + providerErrors) over the last N completed runs. Query param: `?limit=N` |

### Reliability telemetry (`/retry-stats`)

Every Zod-validated LLM call site reports `{ attempts, calls, fallbacks }` to the run-scoped cost tracker. Every forge attempt reports `{ approved, confidence, name, errorReason }`. Every LLM call that throws gets classified by the provider-error classifier. Every cache hit/write on supported providers increments the cache tracker. On run completion the server snapshots the per-run rollup into a rotating ring of the last 100 runs (`.retry-stats.json` on disk).

`GET /retry-stats` aggregates the ring into a unified response:

```json
{
  "runCount": 87,
  "schemas": {
    "DepartmentReport":     { "calls": 2608, "attempts": 2721, "fallbacks": 3, "avgAttempts": 1.04, "fallbackRate": 0.0012, "runsPresent": 87 },
    "CommanderDecision":    { "calls": 1056, "attempts": 1089, ... },
    "compile:fingerprint":  { "calls": 87,  "attempts": 87, ... },
    "compile:politics":     { "calls": 87,  "attempts": 87, ... }
  },
  "forges": {
    "totalAttempts": 1420, "approved": 1180, "rejected": 240,
    "approvalRate": 0.8310, "avgApprovedConfidence": 0.92,
    "totalUniqueNames": 1020, "totalUniqueApproved": 1015,
    "totalUniqueTerminalRejections": 5,
    "uniqueApprovalRate": 0.9951,
    "rejectionReasons": {
      "schema_extra_field": 210, "shape_check": 18,
      "parse_error": 4, "judge_correctness": 8, "other": 0
    },
    "runsPresent": 72
  },
  "caches": {
    "totalReadTokens": 18420000, "totalCreationTokens": 2800000,
    "totalSavingsUSD": 42.35, "readRatio": 0.8681, "runsPresent": 65
  },
  "providerErrors": {
    "auth": 0, "quota": 12, "rate_limit": 28, "network": 2, "unknown": 4,
    "total": 46, "runsPresent": 18
  }
}
```

Interpretation:

- `schemas.compile:*` — compiler hook generation reliability. `fallbackRate > 0` on a `compile:*` entry means silent-degradation compiles landed on the host (investigate via `compile_validation_fallback` SSE events).
- `forges.approvalRate` — attempt-level including retries. `uniqueApprovalRate` is the real quality signal: unique tools that landed in the toolbox / unique names attempted.
- `forges.rejectionReasons` — failure-mode histogram. A dominant `schema_extra_field` bucket means the LLM is declaring strict output schemas then returning extra fields (the 2026-04-18 forge-guidance prompt fix targets this).
- `caches.readRatio` < 0.7 means the cache keeps getting invalidated. Zero `caches` fields mean the provider doesn't expose cache counters (OpenAI auto-caches opaquely; Anthropic reports).
- `providerErrors.auth` + `.quota` are terminal (run aborts). `.rate_limit` + `.network` + `.unknown` are non-terminal; the retry layer handles them.

`avgAttempts > 1.2` on a schema means the model is retrying on validation failure often enough to be worth tuning. `fallbackRate > 0` means the run served degraded data on at least one turn.

### Custom scenarios — compile before running

Source scenarios (`<name>.json`) are sparse authoring files. They must be **compiled** before the runtime can execute them. Compilation generates six hooks (progression, prompts, fingerprint, politics, reactions, director instructions, milestones) via LLM calls (~$0.10 once, then disk-cached).

Dashboard flow:

1. Paste or load JSON into the Scenario Editor.
2. Click **Compile** — watches the SSE progress stream (`compile_hook` events per hook generated). Cost is billed against the user-supplied API key when provided, else the host's.
3. After `compile_done`, the scenario is both added to `customScenarioCatalog` AND set as the active scenario. The Sim tab will run it on the next RUN click.

Common mistake: clicking **Store** (saves the JSON draft, does not generate hooks) and then hitting RUN. The run proceeds with whichever scenario was previously active (Mars by default) — the editor still shows Mercury, the page title pulls the label from the stored JSON, but the simulation runs Mars. Fix: click Compile, not Store.

Programmatic flow:

```ts
import { compileScenario } from 'paracosm/compiler';
import { runSimulation } from 'paracosm/runtime';
import sourceJson from './mission-mercury.json';

const scenario = await compileScenario(sourceJson, { provider: 'anthropic', model: 'claude-sonnet-4-6' });
await runSimulation(leader, personnel, { scenario, maxTurns: 8 });
```

The runtime `scenario` parameter MUST be a compiled `ScenarioPackage` (has `hooks`), not the raw source JSON.

### npm Package Exports

| Import | What |
|--------|------|
| `paracosm` | Engine types, registries, kernel |
| `paracosm/compiler` | `compileScenario()` |
| `paracosm/runtime` | `runSimulation()`, `runBatch()` |
| `paracosm/mars` | Mars Genesis scenario package |
| `paracosm/lunar` | Lunar Outpost scenario package |
| `paracosm/core` | Kernel state types |

### Programmatic Usage

```typescript
import { compileScenario } from 'paracosm/compiler';
import { runSimulation } from 'paracosm/runtime';

const scenario = await compileScenario(worldJson, { provider: 'anthropic' });

const result = await runSimulation(leader, [], {
  scenario,
  maxTurns: 6,
  seed: 42,
  onEvent(e) { console.log(e.type, e.data?.title); },
});

console.log(result.finalState.colony.population);
console.log(result.totalToolsForged);
```

## Built on AgentOS

Paracosm uses AgentOS for all agent orchestration, LLM calls, tool forging, and memory:

| AgentOS API | Used For |
|------------|----------|
| `agent()` + `session()` | Commander, department, and chat colonist agents (conversation memory) |
| `generateObject()` | Zod-validated one-shot calls (director, reactions, verdict) via `generateValidatedObject` |
| `session.send()` + Zod validation | Session-aware Zod-validated calls (commander, departments, promotions) via `sendAndValidate` |
| `ObjectGenerationError` | Typed error surfaced on exhausted retries; wrappers fall back to empty skeleton + emit `validation_fallback` SSE |
| `extractJson` | Multi-strategy JSON extraction (code fence, thinking-tag strip, greedy brace match) used by `sendAndValidate` |
| `SystemContentBlock` w/ `cacheBreakpoint` | Stable system prefixes cached at 0.1× cost across turns (director instructions, dept system prompt, reaction batch system) |
| `EmergentCapabilityEngine` | Runtime tool forging in sandboxed V8 |
| `EmergentJudge` | LLM-as-judge safety review of forged tools |
| `AgentMemory.sqlite()` | Colonist chat memory with episodic storage and RAG |
| HEXACO personality | Trait-modulated decision making, memory retrieval, mood adaptation |

## Source Structure

```
src/
  engine/           the npm package (exported)
    core/           deterministic kernel (RNG, state, progression, personality drift)
    compiler/       JSON → ScenarioPackage compiler
    mars/           Mars Genesis scenario
    lunar/          Lunar Outpost scenario

  runtime/          orchestration (not exported)
    orchestrator              turn pipeline: director → kernel → departments → commander
    director                  emergent crisis generation from simulation state
    departments               parallel department analysis agents
    chat-agents               post-simulation colonist chat with AgentOS memory
    schemas/                  Zod schemas for every structured LLM call
    llm-invocations/          generateValidatedObject + sendAndValidate wrappers
    hexaco-cues/              trajectory + reaction cue translation helpers

  cli/              server + dashboard (not exported)
    serve.ts        HTTP + SSE server
    pair-runner.ts  parallel leader execution + verdict
    server-app.ts   all HTTP endpoints
    dashboard/      React/Vite live visualization
```

## References

- Ashton, M. C., & Lee, K. (2007). Empirical, theoretical, and practical advantages of the HEXACO model of personality structure. *Personality and Social Psychology Review*, 11(2), 150-166. [hexaco.org](https://hexaco.org/)
- Lee, K., & Ashton, M. C. (2004). Psychometric properties of the HEXACO personality inventory. *Multivariate Behavioral Research*, 39(2), 329-358.
- Roberts, B. W., Walton, K. E., & Viechtbauer, W. (2006). Patterns of mean-level change in personality traits across the life course. *Psychological Bulletin*, 132(1), 1-25.
- Graziano, W. G., et al. (2007). Agreeableness, empathy, and helping: A person × situation perspective. *Journal of Personality and Social Psychology*, 93(4), 583-599.
- Silvia, P. J., & Sanders, C. E. (2010). Why are smart people curious? Fluid intelligence, openness to experience, and interest. *Personality and Individual Differences*, 49(3), 242-245.
- Smillie, L. D., et al. (2012). Extraversion and reward-processing: Consolidating evidence from an electroencephalographic index of reward-prediction-error. *European Journal of Personality*, 26(5), 508-521.
- Hilbig, B. E., & Zettler, I. (2009). Pillars of cooperation: Honesty-Humility, social value orientations, and economic behavior. *Journal of Research in Personality*, 43(3), 516-519.
- Tett, R. P., & Burnett, D. D. (2003). A personality trait-based interactionist model of job performance. *Journal of Applied Psychology*, 88(3), 500-517.
- Van Iddekinge, C. H. (2023). Leader-follower personality similarity and work outcomes: A meta-analysis. *Journal of Management*.
- AgentOS documentation: [docs.agentos.sh](https://docs.agentos.sh)
- AgentOS Emergent Capabilities: [docs.agentos.sh/features/emergent-capabilities](https://docs.agentos.sh/docs/features/emergent-capabilities)
- AgentOS Cognitive Memory: [docs.agentos.sh/features/cognitive-memory](https://docs.agentos.sh/docs/features/cognitive-memory)
- AgentOS HEXACO Personality: [docs.agentos.sh/features/hexaco-personality](https://docs.agentos.sh/docs/features/hexaco-personality)
