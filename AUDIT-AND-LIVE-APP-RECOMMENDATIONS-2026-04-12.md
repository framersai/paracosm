# Mars Genesis Audit, Live App Recommendations, and Next Steps

**Date:** 2026-04-12  
**Repo:** `apps/mars-genesis-simulation/`  
**Context reviewed:** Mars Genesis app code in full, plus the AgentOS docs/architecture, skills-extension, skills-registry, and extensions surfaces that shape how this demo is explained and trusted.

## Executive Summary

Mars Genesis already has the right core shape for a strong public demo:

- a deterministic colony kernel
- personality-shaped commanders
- department agents with runtime tool forging
- a side-by-side presentation that makes divergence legible

The strongest part of the system is the kernel and the weakest part is the orchestration/UI layer. Right now the main risk is not "the idea is wrong." The risk is that the current implementation makes claims the code does not fully support yet:

- the two timelines do **not** currently start from the same seed
- births and deaths are **not** tracked against the right turn/year
- governance is described as a live department but is **never actually instantiated**
- commander choices are often **narrative-only** and do not materially change canonical state
- the dashboard assumes both sides share one crisis and one global turn header, which breaks once crises become truly emergent

If you fix those correctness problems first, the v4 director redesign becomes much more credible. If you do not fix them first, the emergent layer will sit on top of compromised accounting and the demo will look more impressive than it is.

## What I Verified In Code

### 1. The side-by-side comparison is not currently a same-seed comparison

**Files:** `src/agents/orchestrator.ts:249-250`, `src/kernel/colonist-generator.ts`

The kernel seed is derived from the leader's openness:

- Aria seed => `950`
- Dietrich seed => `250`

That means the two colonies do not begin from the same randomly generated roster or the same deterministic downstream event stream. This directly contradicts the README/demo framing that only the leaders' decisions differ.

This is the highest-priority credibility issue in the whole demo.

### 2. Between-turn births and deaths are logged against the wrong turn and year

**Files:** `src/kernel/kernel.ts:113-129`, `src/kernel/progression.ts:105-186`

`progressBetweenTurns()` uses the *current* metadata turn/year before `advanceTurn()` updates metadata to the next turn:

- births/deaths generated while progressing from 2035 to 2037 are logged as turn `1`, year `2035`
- the orchestrator then counts births/deaths by the *new* turn number after `advanceTurn()`

Result:

- population changes
- event logs show births/deaths
- `turnArtifacts[*].stateSnapshotAfter.births/deaths` can still stay at `0`

The saved artifact under `src/output/v3-the-visionary-2026-04-12T18-55-31-182Z.json` shows this clearly: population rises from 100 to 103 while turn 2 still records `births: 0`.

This also means age-gated logic is skewed:

- mortality checks use the old year
- workforce entry uses the old year
- children born during a 2-year gap can be stamped with the earlier year

### 3. Governance is listed as a department but never actually runs

**Files:** `src/agents/orchestrator.ts:266-324`, `src/agents/departments.ts:55-64`, `src/agents/departments.ts:134-139`

The system only promotes four departments at turn 0:

- medical
- engineering
- agriculture
- psychology

`getDepartmentsForTurn()` can request `governance` in late turns, but no governance colonist is ever promoted, so no governance session exists and those turns silently skip governance analysis.

So the demo currently has:

- four real department agents
- one advertised-but-missing governance agent
- one advertised key scientist who also never becomes an agent

### 4. Commander decisions often do not change canonical state

**Files:** `src/agents/orchestrator.ts:203-214`, `src/agents/contracts.ts:38-50`

`decisionToPolicy()` only applies:

- `proposedPatches.colony`
- `proposedPatches.politics`
- `proposedPatches.colonistUpdates`

But in the saved run artifacts, department reports mostly return:

- empty `proposedPatches`
- rich `selectedPolicies`
- occasional `featuredColonistUpdates`

`featuredColonistUpdates` are stored in the contract but are never merged into kernel state. So a lot of what looks like strategic choice is currently presentational rather than causal.

The commander is making readable decisions, but the kernel often does not feel those decisions.

### 5. Outcome classification is text-fragile

**File:** `src/kernel/progression.ts:73-94`

Risk classification is based on whether the command text includes the `riskyOption` string. That will misclassify cases like:

- "do not pursue independence"
- "we reject Valles Marineris"
- any rationale that quotes the risky option while choosing the safe one

You need stable option IDs, not substring matching.

### 6. The dashboard has a structural model problem, not just a styling problem

**Files:** `src/dashboard/index.html:321-329`, `src/dashboard/index.html:412-416`

The current UI keeps one global:

- turn number
- year
- crisis banner

That only works while both timelines are synchronized around the same crisis. The moment the director generates different crises or one side runs slower, the top row becomes a race condition. The last event wins.

This is why the v4 redesign should move the active crisis header into each column. Shared global chrome should only show:

- run status
- shared seed/config
- overall compare metrics

### 7. The dashboard defaults to 3 turns, not 12

**Files:** `src/serve.ts:18-19`, `package.json`

`npm run dashboard` launches `src/serve.ts` with no CLI arg, and `serve.ts` defaults to `3` turns. That is at odds with the README and with the mental model of "run the full demo."

Smoke mode should be explicit. Full demo should be the default.

### 8. The current SSE error handling is unsafe

**Files:** `src/serve.ts:123-129`, `src/dashboard/index.html:433-438`

The server emits a custom SSE event named `error`, but browsers also use `error` for native EventSource connection problems. The dashboard then does:

```js
es.addEventListener('error', e => {
  const d = JSON.parse(e.data);
});
```

If the browser fires a transport-level error event without JSON payload, that handler can throw. Use a custom event name like `sim_error` and keep `es.onerror` only for network state.

### 9. The parser problems are real and broader than the dashboard symptoms

**Files:** `src/agents/orchestrator.ts:148-194`

You already flagged `parseDeptReport()` and `cleanSummary()`, but the same general fragility exists in:

- department parsing
- commander parsing
- promotion parsing

Every structured response currently relies on a greedy regex grab of a JSON-looking block. That is okay for a quick prototype and not okay for a demo meant to prove "emergent capabilities" with confidence.

## Architecture Direction I Recommend

### Keep this principle

**The host runtime owns truth. The agents own interpretation.**

That is still the right foundation.

### Tighten the contract before adding more emergence

Before the director, fix these invariants:

1. One shared simulation seed for both timelines.
2. Turn progression must stamp events to the correct year and turn.
3. Each department shown in the product must be a real agent with a real promoted leader.
4. Commander choices must map to explicit kernel actions, not just prose.
5. Outcomes must be keyed off structured option IDs, not string inclusion.

### Then add the director

The director concept is good, but it should sit on top of a cleaner pipeline:

`director crisis -> department analyses -> commander choice -> explicit policy effect -> kernel progression -> outcome -> narrative summary`

The main change I would make to the Claude spec is this:

- do not let the director return only prose and option labels
- let it return a typed crisis object with stable option IDs and a crisis category
- let the commander return `selectedOptionId`
- let the kernel/outcome system consume IDs, not fuzzy text

### Add a real policy layer

Right now policy application is underpowered. I would introduce a typed policy/effect layer with a small set of canonical effect families:

- `resource_shift`
- `capacity_expansion`
- `population_intake`
- `risk_mitigation`
- `governance_change`
- `social_investment`
- `research_bet`

Departments can recommend them. Commanders can select them. The kernel can apply bounded effects. That makes the demo much easier to explain.

## Live App Recommendations

### Make the first 15 seconds understandable

The current dashboard assumes the viewer already understands:

- what a department is
- what the gauges mean
- what forged tools are
- why there are two timelines

Add a persistent "How to read this" panel or intro overlay with three points:

1. Same colony setup, two different commanders.
2. Departments analyze the crisis, commanders decide, colony state changes.
3. Forged tools are new models invented during the run, not hardcoded utilities.

### Give each column its own active turn header

Each timeline should have its own:

- turn
- year
- crisis title
- one-line "why this crisis emerged"
- active phase indicator

The global header should stop pretending both sides are always on the same exact moment.

### Add a "Why They Diverged" rail

This is the missing killer feature.

After each turn, compute a machine-readable diff card:

- different crisis generated because of prior state delta
- different department recommendation emphasis
- different commander choice
- different colony effect

One short compare card per turn will do more for clarity than twenty aesthetic tweaks.

### Promote tools from "cute side effect" to "visible proof"

Right now tool cards still read like implementation exhaust.

Show:

- human title
- one-sentence purpose
- what input it used
- what result it produced
- whether it changed the choice

Good example:

- `Radiation Storm Triage Model`
- "Estimated acute exposure if 28 colonists remain in module 7 for 6 hours."
- "Predicted 11 severe cases if evacuation is delayed."

That is much stronger than `landing_site_score_model_v2`.

### Add a colonist lens, not just top-level colony stats

The demo talks about emergent civilization. The UI mostly shows gauges.

Add one featured colonist module per turn:

- portrait or badge
- role
- quote
- HEXACO drift delta
- what changed in their life this turn

This is where the simulation becomes memorable.

### Separate "simulation mode" from "replay mode"

For a live web app, you want both:

- live mode for spectacle
- replay mode for understanding

Replay mode should allow:

- scrubbing turn by turn
- collapsing/expanding departments
- comparing a single turn across both sides
- showing the causal chain from crisis to policy to outcome

### Add setup and presets

The setup page is worth doing, but do not ship it as only a form builder. Make it a demo launcher with presets:

- "Balanced founders"
- "Risk-taker vs operator"
- "Overcrowded landing"
- "Earth funding collapse"
- "Isolation stress test"

Presets make the app faster to demo live and easier to share.

### Make the stats legible as change, not just state

Show:

- current value
- delta since last turn
- whether the delta came from kernel progression, policy effect, or crisis impact

A viewer should be able to tell whether morale fell because of a crisis, a commander decision, or natural long-horizon drift.

## Additional Feature Ideas Beyond The Current Spec

These are the improvements I would add after the v4 fixes, not before them.

### 1. Causality inspector

Click any turn and open:

- triggering conditions
- department advice summary
- commander choice
- kernel effects applied
- downstream consequences that seeded the next crisis

### 2. Timeline fingerprints

At the end of the run, classify each colony with descriptors like:

- brittle / antifragile
- Earth-tethered / autonomous
- technocratic / communal
- expansionist / conservative

This gives the audience a memorable synthesis.

### 3. Personality drift visualizer

Instead of raw O/C/E/A numbers, show:

- starting trait
- current trait
- what pushed it

For example:

- "Erik Lindqvist became more open after 3 successful risky engineering bets."

### 4. Department trust model

Track whether the commander is learning to trust or ignore certain departments. Then surface:

- who was right most often
- who influenced the commander most
- which department was chronically ignored

That would make the multi-agent story much richer.

### 5. Shareable run artifacts

After a run, generate a share page with:

- seed
- config
- final comparison
- best tool forged
- biggest divergence turn
- downloadable JSON artifact

## AgentOS Ecosystem Notes That Matter For This Demo

### 1. Docs counts drift across the ecosystem

I found multiple conflicting skill counts in the reviewed AgentOS docs surfaces:

- `packages/agentos/docs/extensions/SKILLS.md` says **69**
- `packages/agentos-skills-registry/src/index.ts` and `src/catalog.ts` say **72**
- `packages/agentos/docs/QUERY_ROUTER.md` says **80**
- `packages/agentos/docs/architecture/ARCHITECTURE.md` says **72**

That kind of drift weakens trust. For a demo whose selling point is "real platform capabilities," the docs site should generate counts directly from registry metadata instead of hardcoding them in prose.

### 2. The skills packages are strategically useful but type-discipline is weak

`packages/agentos-ext-skills` and `packages/agentos-skills-registry` rely heavily on `// @ts-nocheck`.

That does not mean they are broken. It does mean the ecosystem is currently presenting a typed, structured platform while opting out of type safety in some of the exact packages that define the catalog and install/enable flow.

If you want the Mars demo to reinforce AgentOS credibility, tighten those surfaces too.

### 3. `skills_enable` has better security discipline than `skills_install`

`SkillsEnableTool` includes:

- path containment checks
- symlink rejection
- destination containment validation

`SkillsInstallTool` can:

- download an archive
- extract it into a target directory

but it does not apply the same level of checksum, archive-entry, or post-extract containment validation. That is a real security maturity gap.

The demo does not directly depend on this, but the platform story does.

### 4. The content/runtime split is the right pattern and Mars Genesis should mirror it

AgentOS already separates:

- runtime engine
- content package
- catalog SDK

Mars Genesis should mirror that more clearly:

- kernel and state engine
- research/knowledge content
- narrative orchestration/director layer
- presentation/dashboard layer

That separation will make the demo easier to maintain and much easier to explain on stage or in docs.

## Recommended Implementation Order

### Phase 0: Correctness and trust

1. Use one explicit shared seed for both timelines.
2. Fix turn/year stamping in progression.
3. Fix births/deaths accounting end to end.
4. Instantiate every department the product claims exists, or stop claiming it.
5. Replace text-based risky option detection with structured option IDs.
6. Make full 12-turn runs the default dashboard behavior.

### Phase 1: Causal simulation

1. Introduce typed policy effects.
2. Ensure department recommendations can map to kernel changes.
3. Apply featured colonist updates or remove them from the contract.
4. Add retries/fallbacks for all structured LLM calls.

### Phase 2: Emergent narrative

1. Add the director.
2. Add per-column crisis headers.
3. Add turn summaries and colonist quotes.
4. Add the divergence rail.

### Phase 3: Productize the live app

1. Setup page with presets.
2. Replay mode.
3. Share/export flow.
4. Better tool cards and causality inspector.

## Bottom Line

The demo should lean harder into one claim:

**"Different leadership personalities create different civilizations under the same deterministic constraints."**

That claim is strong, defensible, and visually interesting.

The current codebase is close to it, but not there yet. Fix the correctness gaps first, then make the UI explain causality, then add the director. If you do that in that order, the live web app can become a genuinely compelling proof of emergent multi-agent behavior instead of just a stylish stream of LLM prose.
