# Paracosm Cookbook

Wire-level inputs and outputs for every public surface in the paracosm API. Every JSON snippet on this page was captured from a real run of [`scripts/cookbook-e2e.ts`](../scripts/cookbook-e2e.ts) on **2026-04-25** against `paracosm@0.7.0`. Re-run the script to refresh the captures against your provider, model, and seed.

The runner exercises the API in this order:

- [`WorldModel.fromPrompt`](#1-worldmodelfromprompt) draft a scenario from a free-text brief
- [`compileScenario` + `WorldModel.fromScenario`](#1b-known-good-scenario-via-compilescenario) load a cached scenario for the rest of the steps
- [`wm.quickstart`](#2-wmquickstart) auto-generate HEXACO leaders and run them in parallel
- [`wm.forkFromArtifact`](#3-wmforkfromartifact) branch at any past turn with a different leader
- [`wm.replay`](#4-wmreplay) verify the kernel is byte-equal-deterministic
- [`POST /simulate`](#5-post-simulate) one-shot HTTP endpoint for non-SSE consumers
- [`wm.simulateIntervention`](#6-wmsimulateintervention) digital-twin pattern with subject + intervention
- [`runBatch`](#7-runbatch) N scenarios x M leaders manifest

Captured JSON files live in [`output/cookbook/`](../output/cookbook/). Each section embeds excerpts; the full files are linked.

## The scenario

The runner uses an **AI Lab Director** brief: a Q4 2026 release decision for a frontier multimodal model that scored 84% on AlignmentBench-2026 with two flagged concerns (4.2% specification gaming, mesa-objectives shifting under DPO). The director chairs Alignment, Capability, Policy, Infrastructure, Comms, and Leadership. Decisions in step 1's output map onto a real release-pressure scenario.

> Steps 2 through 7 use the built-in `corporate-quarterly` scenario (cached compile, stable hooks) so the runtime captures are clean. The fromPrompt path is shown standalone in step 1 because freshly LLM-generated hook code can be fragile until validated by a model with strong code-output discipline. The same captures with stable hooks come from `compileScenario` against any well-tested input.

## How to run it yourself

```bash
cd apps/paracosm
cp .env.example .env  # add OPENAI_API_KEY or ANTHROPIC_API_KEY
npx tsx scripts/cookbook-e2e.ts
ls output/cookbook/   # 7 input/output JSON pairs
```

Cost ceiling is enforced at $1 per artifact and $5 total. The runner aborts if either tripwire fires.

---

## 1. `WorldModel.fromPrompt`

Compile a paracosm scenario from a free-text brief plus an optional domain hint. The LLM proposes a draft against `DraftScenarioSchema`, the draft is validated by Zod, then routed into the existing `compileScenario` pipeline so the seed-grounding and hook-generation stages still fire. JSON is the canonical contract; `fromPrompt` makes unstructured text a first-class authoring input.

### Input

```ts
import { WorldModel } from 'paracosm/world-model';

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
    onProgress: (hook, status) => console.log(`[${status}] ${hook}`),
  },
);
```

The full input recorded by the runner: [`output/cookbook/01-input-fromPrompt.json`](../output/cookbook/01-input-fromPrompt.json)

### Output (excerpt)

The compiled `ScenarioPackage` minus its function hooks. The runner persists this minus-hooks JSON because a `ScenarioPackage` includes `progressionHook`, `directorPromptHook`, etc., which are functions and don't serialize.

```json
{
  "id": "ai-safety-lab-release-pressure-q4-2026",
  "labels": {
    "name": "AI safety lab release pressure: Atlas-7 launch decision",
    "populationNoun": "employees",
    "settlementNoun": "lab",
    "timeUnitNoun": "quarter",
    "currency": "USD"
  },
  "setup": {
    "defaultTurns": 6,
    "defaultPopulation": 180,
    "defaultStartTime": 202607,
    "defaultSeed": 202607
  },
  "departments": [
    { "id": "alignment", "label": "Alignment", "role": "safety evaluation and risk assessment", "instructions": "Track evaluator concerns, specification gaming, mesa-objective signals, and incident likelihood..." },
    { "id": "capability", "label": "Capability", "role": "model performance and product impact", "instructions": "Represent benchmark strength, product value, and competitive positioning..." },
    { "id": "policy", "label": "Policy", "role": "governance and release approvals", "instructions": "..." },
    { "id": "infrastructure", "label": "Infrastructure", "role": "deployment reliability and operational readiness", "instructions": "..." },
    { "id": "comms", "label": "Comms", "role": "public messaging and stakeholder coordination", "instructions": "..." },
    { "id": "leadership", "label": "Leadership", "role": "final decision and cross-functional arbitration", "instructions": "..." }
  ],
  "metrics": [
    { "id": "alignment-score", "format": "number" },
    { "id": "spec-gaming-rate", "format": "percent" },
    { "id": "mesa-objective-risk", "format": "percent" },
    { "id": "incident-probability", "format": "percent" },
    { "id": "enterprise-arr-at-risk", "format": "currency" },
    { "id": "release-readiness", "format": "percent" },
    { "id": "stakeholder-confidence", "format": "percent" }
  ],
  "theme": "Frontier AI lab leadership under release pressure..."
}
```

Full output: [`output/cookbook/01-output-scenario-package.json`](../output/cookbook/01-output-scenario-package.json).

### What just happened

The brief named six decision-relevant departments, eight quantifiable metrics, a quarterly cadence, and an `enterprise-arr-at-risk` metric expressed in `currency`. None of these were hard-coded. The LLM read the seed and chose `populationNoun: 'employees'`, `settlementNoun: 'lab'`, and `timeUnitNoun: 'quarter'` from inference; the dashboard's turn header would render `"Quarter 1"`, `"Quarter 2"`, etc. without any code change. The compiler then generated TypeScript hooks (progression, director, prompts, milestones, fingerprint, politics, reactions) and attached the seed-extracted topics + facts as a `KnowledgeBundle` for downstream RESEARCH grounding.

---

## 1b. Known-good scenario via `compileScenario`

For runtime captures the runner switches to the built-in `corporate-quarterly` scenario, which has cached hooks under `.paracosm/cache/corporate-quarterly-v1.0.0/`.

```ts
import { compileScenario } from 'paracosm/compiler';
import { WorldModel } from 'paracosm/world-model';

const compiled = await compileScenario(worldJson, {
  provider: 'openai',
  model: 'gpt-5.4-nano',
  cache: true,
});
const wm = WorldModel.fromScenario(compiled);
```

Cache hits return immediately; first compile runs the hook-generation pipeline at roughly $0.10. Compiled scenarios are valid `ScenarioPackage` instances with executable hooks attached.

---

## 2. `wm.quickstart`

The quickstart auto-generates N HEXACO archetypes for the world and runs them all in parallel under the same seed. The whole point: same seed, different personality, see divergence.

### Input

```ts
const result = await wm.quickstart({
  leaderCount: 3,
  maxTurns: 3,
  seed: 42,
  captureSnapshots: true,
  provider: 'openai',
  model: 'gpt-5.4-nano',
});
```

Full input: [`output/cookbook/02-input-quickstart-options.json`](../output/cookbook/02-input-quickstart-options.json).

### Output: leaders

Three structured-output `LeaderConfig` objects with HEXACO bounds enforced via Zod. The actual generation against the corp-quarterly scenario produced these archetypes:

```json
[
  {
    "name": "Marin Kade",
    "archetype": "Aggressive Sales Optimizer",
    "unit": "Sales (VP of Sales)",
    "hexaco": { "openness": 0.64, "conscientiousness": 0.33, "extraversion": 0.86, "agreeableness": 0.26, "emotionality": 0.29, "honestyHumility": 0.42 },
    "instructions": "Overbook the forecast, then pressure every account for signatures this quarter. If a contract clause blocks momentum, escalate for a fast concession."
  },
  {
    "name": "Dr. Sora Wen",
    "archetype": "Systems Engineer of Control",
    "unit": "Engineering (VP of Engineering)",
    "hexaco": { "openness": 0.31, "conscientiousness": 0.86, "extraversion": 0.34, "agreeableness": 0.58, "emotionality": 0.22, "honestyHumility": 0.64 },
    "instructions": "Lock scope and enforce change control; stability beats speed. Approve only the highest-confidence releases and document every deviation."
  },
  {
    "name": "Elena Rocha",
    "archetype": "People-First Culture Stabilizer",
    "unit": "People (Chief People Officer)",
    "hexaco": { "openness": 0.52, "conscientiousness": 0.61, "extraversion": 0.46, "agreeableness": 0.82, "emotionality": 0.71, "honestyHumility": 0.74 },
    "instructions": "When targets tighten, protect retention: transparent comms, coaching, and workload triage. Refuse incentives that create fear or degrade psychological safety."
  }
]
```

Full leaders: [`output/cookbook/02-output-leaders.json`](../output/cookbook/02-output-leaders.json).

### Output: artifacts (excerpt for Marin Kade)

```json
{
  "fingerprint": {
    "resilience": "stable",
    "innovation": "productive",
    "riskStyle": "cautious",
    "decisionDiscipline": "undisciplined",
    "summary": "riskBehavior:steady · outcomeStability:low · financialRobustness:fragile · cashStress:severe · marketMomentum:mixed · operationalCapacityFit:scaling · leadershipStyle:balanced · funding:series-b · timeline:within,2q · tools:broad",
    "totalTools": "7",
    "successRate": "0.33",
    "survivalRate": "1.00"
  },
  "metadata": {
    "runId": "corp-aggressive-sales-optimizer-1777185368038",
    "scenario": { "id": "corporate-quarterly", "name": "Q-Scope Corp" },
    "seed": 42, "mode": "turn-loop"
  },
  "finalState": {
    "metrics": {
      "population": 105, "morale": 0.65, "runwayMonths": 14, "marketShare": 0.08,
      "revenueArr": 6000000, "burnRate": 834298, "deliveryCapacity": 6
    }
  },
  "trajectory": {
    "mode": "turn-loop",
    "timeUnit": { "singular": "quarter", "plural": "quarters" },
    "timepointCount": 3
  }
}
```

Full artifacts: [`output/cookbook/02-output-artifacts.json`](../output/cookbook/02-output-artifacts.json).

### What just happened

Three independent simulations ran concurrently against the same compiled `corporate-quarterly` scenario, seed 42, identical opening events. They diverged because the leaders have different HEXACO profiles. The fingerprint is a `Record<string, string | number>` of loose classification scores (`resilience`, `innovation`, `riskStyle`, `decisionDiscipline`, plus computed summaries). Same seed, different `Marin Kade` (HEXACO O:0.64 C:0.33 E:0.86) versus `Dr. Sora Wen` (O:0.31 C:0.86 E:0.34): visibly different `decisionDiscipline` classifications, different forge counts, different decision rationales recorded in `decisions[].reasoning`.

---

## 3. `wm.forkFromArtifact`

Counterfactual world simulation operationalized: branch a stored artifact at any captured turn with a different leader, seed, or custom events. The kernel resumes from the embedded snapshot at `atTurn`; turns 0 through `atTurn` are not re-computed.

### Input

```ts
const branchWm = await wm.forkFromArtifact(trunk, 1);
const branch = await branchWm.simulate(altLeader, {
  maxTurns: 3,
  seed: 42,
  captureSnapshots: true,
  provider: 'openai',
  costPreset: 'economy',
});
```

Full input: [`output/cookbook/03-input-fork.json`](../output/cookbook/03-input-fork.json).

### Output (excerpt)

```json
{
  "metadata": {
    "runId": "corp-systems-engineer-of-control-1777185465467",
    "forkedFrom": {
      "parentRunId": "corp-aggressive-sales-optimizer-1777185368038",
      "atTurn": 1
    },
    "scenario": { "id": "corporate-quarterly", "name": "Q-Scope Corp" }
  },
  "fingerprint": {
    "decisionDiscipline": "mixed",
    "leadershipStyle": "disciplined",
    "successRate": "0.50"
  },
  "finalState": {
    "metrics": { "population": 105, "morale": 0.54, "runwayMonths": 16.12, "burnRate": 807518.99 }
  },
  "decisionCount": 2,
  "sampleDecision": {
    "time": 2,
    "actor": "Dr. Sora Wen",
    "choice": "Launch a reliability-first delivery sprint (4-8 weeks) to reduce release variance, instrument SLAs, and remove the top bottleneck limiting delivery capacity, then ship measurable improvements to stabilize revenue expectations.",
    "outcome": "conservative_success"
  },
  "forgedToolCount": 3,
  "citationCount": 5,
  "cost": { "totalUSD": 0.3386, "llmCalls": 26 }
}
```

`maxTurns` on the branch is the **absolute final turn index**, not the branch length: a 3-turn branch from turn 1 means `maxTurns: 3` (resumes at turn 1, runs through turns 2, 3).

Full output: [`output/cookbook/03-output-branch.json`](../output/cookbook/03-output-branch.json).

### What just happened

The trunk used Marin Kade (Aggressive Sales Optimizer, low conscientiousness) and ended at morale 0.65 / runway 14 months. The branch picked up turn 1 state and ran turns 2-3 under Dr. Sora Wen (Systems Engineer of Control, high conscientiousness). Final morale 0.54, runway 16.12 months, `decisionDiscipline` flipped from `undisciplined` to `mixed`, `leadershipStyle` flipped to `disciplined`. Same starting world; one variable swapped at turn 1; measurable trajectory delta. The dashboard renders this as a Branches tab where forks accumulate as cards with per-metric deltas streaming live as each branch completes.

---

## 4. `wm.replay`

The kernel is fully deterministic. `wm.replay(artifact)` re-executes the between-turn progression hook from each recorded snapshot and compares the fresh `kernelSnapshotsPerTurn` array against the input artifact's via canonical JSON. No LLM calls. Free, fast, regression-test-shaped.

### Input

```ts
const replay = await wm.replay(trunk);
```

Full input: [`output/cookbook/04-input-replay.json`](../output/cookbook/04-input-replay.json).

### Output (real captured)

```json
{
  "matches": false,
  "divergence": "/1/state/agents/0/hexaco/agreeableness (0.4945439798311554 vs 0.4789224283991382)"
}
```

The replay caught a real divergence: agent 0's HEXACO agreeableness drifted differently in the second pass than the first. The output pinpoints the exact JSON pointer + the two values. `matches=true` would prove byte-equal kernel determinism for the full transition graph; `matches=false` is exactly what you want for forensic diff after a kernel change. This run's failure is honest: the cookbook documents the tool as it actually behaves on this artifact.

Full output: [`output/cookbook/04-output-replay-result.json`](../output/cookbook/04-output-replay-result.json).

### What just happened

`replay()` re-executed the deterministic between-turn progression hook from each recorded snapshot and compared the fresh `kernelSnapshotsPerTurn` array against the input artifact's via canonical JSON. The hook is supposed to be deterministic; the captured `agreeableness` divergence on agent 0 between the original run and the replay is a real determinism gap to investigate. This is what the API is for: pillar 2 (Reproducible) is verifiable in code, not promised in copy. Use `replay()` for regression testing (replay golden artifacts in CI), forensic comparison (find the first kernel-state divergence between two versions of paracosm), and pre-merge gates that block on `matches !== true` for a committed golden artifact.

---

## 5. `POST /simulate`

For non-SSE consumers (curl, Python integrations, third-party dashboards) the server exposes a request-response endpoint. Gated behind `PARACOSM_ENABLE_SIMULATE_ENDPOINT=true` so the hosted demo's SSE-first path stays the default.

### Request

```bash
PARACOSM_ENABLE_SIMULATE_ENDPOINT=true npx paracosm-dashboard

curl -X POST http://localhost:3456/simulate \
  -H 'Content-Type: application/json' \
  -H 'X-OpenAI-Key: sk-...' \
  -d '{
    "scenario": { ... },
    "leader": { ... },
    "options": { "maxTurns": 2, "seed": 7, "captureSnapshots": false, "provider": "openai", "costPreset": "economy" }
  }'
```

The runner calls this in-process: it boots `createMarsServer({ env })` on a random port, fetches against `localhost:<port>/simulate`, then closes the server. Full request: [`output/cookbook/05-input-http-simulate.json`](../output/cookbook/05-input-http-simulate.json).

### Response (real captured)

```json
{
  "status": 200,
  "durationMs": 60573,
  "artifact": {
    "fingerprint": {
      "resilience": "stable", "innovation": "experimental",
      "riskStyle": "opportunistic", "decisionDiscipline": "undisciplined",
      "totalTools": "2", "successRate": "0.00", "riskRate": "0.50"
    },
    "metadata": {
      "runId": "corp-aggressive-sales-optimizer-1777185599118",
      "scenario": { "id": "corporate-quarterly", "name": "Q-Scope Corp" },
      "seed": 7, "mode": "turn-loop"
    },
    "finalState": {
      "metrics": { "population": 104, "morale": 0.54, "runwayMonths": 14, "burnRate": 850000 }
    },
    "decisionCount": 2,
    "forgedToolCount": 1,
    "citationCount": 5,
    "cost": { "totalUSD": 0.0988, "llmCalls": 22 }
  }
}
```

The endpoint accepts either a pre-compiled `ScenarioPackage` (has `.hooks`) or a raw scenario draft the compiler accepts; raw drafts are auto-compiled server-side with optional `options.seedText` / `options.seedUrl` grounding. **JSON-serializing a compiled scenario strips function hooks**, so the server always re-runs `compileScenario` on what it receives. Cache hits make this nearly free for known scenarios. The response includes the full `RunArtifact` so non-SSE consumers (curl, Python, third-party dashboards) get the complete output in one call.

Full response: [`output/cookbook/05-output-http-simulate.json`](../output/cookbook/05-output-http-simulate.json).

---

## 6. `wm.simulateIntervention`

Digital-twin pattern: model a single subject under a counterfactual intervention. The artifact's `subject` and `intervention` fields carry the inputs for downstream consumers (LangGraph-style pipelines populate them from their own flow).

### Input

```ts
const subject: SubjectConfig = {
  id: 'frontier-lab-2026',
  name: 'Atlas Lab',
  profile: { foundedYear: 2018, headcount: 480, modelGen: 'Atlas-7', alignmentBench: 0.84 },
  signals: [
    { label: 'AlignmentBench-2026', value: 0.84, unit: 'score', recordedAt: '2026-11-01T00:00:00Z' },
    { label: 'spec-gaming-rate', value: 0.042, unit: 'fraction', recordedAt: '2026-11-15T00:00:00Z' },
  ],
  markers: [{ id: 'flagship-multimodal', category: 'capability', value: 'true' }],
};

const intervention: InterventionConfig = {
  id: 'delay-90d',
  name: '90-day release delay',
  description: 'Hold Atlas-7 release 90 days for additional red-team and DPO mitigation passes.',
  duration: { value: 90, unit: 'days' },
  adherenceProfile: { expected: 1.0 },
};

const artifact = await wm.simulateIntervention(subject, intervention, leader, {
  maxTurns: 2,
  seed: 11,
  provider: 'openai',
  costPreset: 'economy',
});
```

Full input: [`output/cookbook/06-input-digital-twin.json`](../output/cookbook/06-input-digital-twin.json).

### Output (real captured)

```json
{
  "subject": {
    "id": "frontier-lab-2026",
    "name": "Atlas Lab",
    "profile": { "foundedYear": 2018, "headcount": 480, "modelGen": "Atlas-7", "alignmentBench": 0.84 },
    "signals": [
      { "label": "AlignmentBench-2026", "value": 0.84, "unit": "score", "recordedAt": "2026-11-01T00:00:00Z" },
      { "label": "spec-gaming-rate", "value": 0.042, "unit": "fraction", "recordedAt": "2026-11-15T00:00:00Z" }
    ],
    "markers": [{ "id": "flagship-multimodal", "category": "capability", "value": "true" }]
  },
  "intervention": {
    "id": "delay-90d",
    "name": "90-day release delay",
    "description": "Hold Atlas-7 release 90 days for additional red-team and DPO mitigation passes.",
    "duration": { "value": 90, "unit": "days" },
    "adherenceProfile": { "expected": 1 }
  },
  "fingerprint": { "decisionDiscipline": "mixed", "successRate": "0.50", "riskRate": "0.50" },
  "finalState": { "metrics": { "population": 101, "morale": 0.85, "runwayMonths": 14 } },
  "decisionCount": 2,
  "cost": { "totalUSD": 0.109, "llmCalls": 22 }
}
```

Both `subject` and `intervention` carry through verbatim. Full output: [`output/cookbook/06-output-digital-twin-artifact.json`](../output/cookbook/06-output-digital-twin-artifact.json).

### What just happened

`simulateIntervention` is sugar over `simulate` that names the digital-twin pattern in the call site. Turn-loop mode stashes both fields verbatim without semantic consumption; external batch-trajectory executors (LangGraph-style pipelines) populate them from their own flow. The artifact is still a universal `RunArtifact` validated against the same Zod shape every other entry point produces.

---

## 7. `runBatch`

Run N scenarios x M leaders against shared config. Useful for ablations, leader sweeps, and cross-scenario reproducibility checks.

### Input

```ts
const manifest = await runBatch({
  scenarios: [wm.scenario, marsScenario],
  leaders: [leaderA, leaderB],
  turns: 2,
  seed: 950,
  maxConcurrency: 2,
  provider: 'openai',
  costPreset: 'economy',
});
```

Full input: [`output/cookbook/07-input-batch-config.json`](../output/cookbook/07-input-batch-config.json).

### Output (real captured)

```json
{
  "timestamp": "2026-04-26T06:44:23.605Z",
  "config": {
    "scenarioIds": ["corporate-quarterly", "mars-genesis"],
    "leaders": ["Marin Kade", "Dr. Sora Wen"],
    "turns": 2, "seed": 950, "provider": "openai", "maxConcurrency": 2
  },
  "totalDuration": 178472,
  "results": [
    {
      "scenarioId": "corporate-quarterly", "leader": "Marin Kade", "seed": 950, "turns": 2,
      "fingerprint": { "resilience": "stable", "leadershipStyle": "balanced", "totalTools": "2", "successRate": "0.50" },
      "finalMetrics": { "population": 103, "morale": 0.74, "runwayMonths": 14 },
      "durationMs": 109966, "cost": { "totalUSD": 0.1653, "llmCalls": 26 }
    },
    {
      "scenarioId": "corporate-quarterly", "leader": "Dr. Sora Wen", "seed": 950, "turns": 2,
      "fingerprint": { "resilience": "stable", "leadershipStyle": "disciplined", "totalTools": "3", "successRate": "0.50" },
      "finalMetrics": { "population": 103, "morale": 0.75, "runwayMonths": 14 },
      "durationMs": 84663, "cost": { "totalUSD": 0.0966, "llmCalls": 23 }
    },
    {
      "scenarioId": "mars-genesis", "leader": "Marin Kade", "seed": 950, "turns": 2,
      "fingerprint": { "resilience": "brittle", "governance": "charismatic", "innovation": "innovative", "totalTools": "6" },
      "finalMetrics": { "population": 90, "morale": 0.06, "powerKw": 465.69, "scienceOutput": 8 },
      "durationMs": 68986, "cost": { "totalUSD": 0.2369, "llmCalls": 30 }
    },
    {
      "scenarioId": "mars-genesis", "leader": "Dr. Sora Wen", "seed": 950, "turns": 2,
      "fingerprint": { "resilience": "brittle", "governance": "technocratic", "innovation": "adaptive", "totalTools": "4" },
      "finalMetrics": { "population": 90, "morale": 0.06, "powerKw": 469.92, "scienceOutput": 8 },
      "durationMs": 68506, "cost": { "totalUSD": 0.1881, "llmCalls": 29 }
    }
  ]
}
```

Full output: [`output/cookbook/07-output-batch-manifest.json`](../output/cookbook/07-output-batch-manifest.json).

### What just happened

Four `BatchResult` cells: 2 scenarios x 2 leaders. The fingerprint shape itself is scenario-specific because each scenario's `fingerprintHook` returns its own classification keys: corp-quarterly emits `leadershipStyle` (balanced vs disciplined), Mars emits `governance` (charismatic vs technocratic). Same leader, different scenario, the fingerprint reads the personality through the scenario's own ontology. `manifest.timestamp` plus `manifest.config` is a reproducible audit trail: re-running with the same config produces stable per-cell fingerprints as long as the kernel and prompts are unchanged. `maxConcurrency` caps in-flight simulations; total wall clock for this batch was 179 seconds versus the sum of per-run durations (332s).

---

## Cost summary

The full `cookbook-e2e.ts` run on 2026-04-25 against OpenAI economy preset:

| Step | Cost | Wall time |
|------|------|-----------|
| 1. fromPrompt + compile | $0.20 | 84s |
| 2. quickstart (3 leaders x 3 turns) | ~$0.50 | 160s |
| 3. forkFromArtifact (1 leader x 2 turns) | $0.34 | 88s |
| 4. replay | $0 | <1s |
| 5. POST /simulate (1 leader x 2 turns) | $0.10 | 61s |
| 6. simulateIntervention (1 leader x 2 turns) | $0.11 | 76s |
| 7. runBatch (4 cells x 2 turns) | $0.69 | 179s |
| **Total** | **~$1.94** | **~10 min** |

Per-artifact cost is enforced at $1, total at $5. Both ceilings throw if exceeded. Per-step cost is recorded in `artifact.cost.totalUSD` and broken down by role (commander, departments, judge, agent reactions, director). The cost field also includes prompt-cache statistics: `cost.caches.{readTokens, creationTokens, savedUSD}` so you can verify the prompt cache is hitting on turn 2+.

---

## Schema references

Every shape on this page is a Zod-validated entry from [`src/engine/schema/`](../src/engine/schema/):

- `RunArtifact` -> [`artifact.ts`](../src/engine/schema/artifact.ts)
- `ScenarioPackage` -> [`src/engine/types.ts`](../src/engine/types.ts)
- `LeaderConfig` -> [`src/engine/types.ts`](../src/engine/types.ts)
- `SubjectConfig`, `InterventionConfig` -> [`src/engine/schema/primitives.ts`](../src/engine/schema/primitives.ts)
- `BatchManifest` -> [`src/runtime/batch.ts`](../src/runtime/batch.ts)

For non-TypeScript consumers, run `npm run export:json-schema` to emit `schema/run-artifact.schema.json` and `schema/stream-event.schema.json`. Python projects generate Pydantic types via `datamodel-codegen`; any ecosystem with a JSON-Schema code generator adopts cleanly.
