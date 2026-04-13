# Mars-First Modular Simulation Product Review

**Date:** 2026-04-13
**Status:** Ready for review
**Scope:** Critical review of [Scenario Engine Generalization](./2026-04-13-scenario-engine-generalization-design.md), plus concrete recommendations for turning Mars Genesis into a first-class product built on a reusable simulation engine.

## 1. Executive Assessment

The core thesis is right:

- the host runtime should own truth
- the scenario should own domain
- Mars should become a scenario package instead of remaining hardcoded into every layer

But the current generalization design is still too shallow and too broad at the same time.

It is too shallow because it mostly generalizes labels, resources, departments, and hooks, while large parts of the real Mars-specific behavior still live in:

- prompt construction
- effect application
- crisis generation
- artifact schemas
- dashboard rendering rules
- setup UX
- product defaults
- output fingerprints
- bulletin/chat/report surfaces

It is too broad because it implies one engine should cleanly cover Mars, corporate, medieval, and possibly MiroFish-style worlds in one move. That is a scope trap. Mars Genesis today is a **closed-state, turn-based, kernel-owned simulation**. MiroFish is a **graph-seeded, open-world, social prediction engine**. Those are different simulation archetypes.

If you implement the current design as written, you will likely get a relabeled Mars app, not a truly modular simulation device.

## 2. What The Current Design Gets Right

These should stay:

- Keep deterministic kernel state separate from LLM interpretation.
- Keep tool forging as analysis, not direct world-state mutation.
- Keep scenario content versioned and local to the repo.
- Keep Mars as the default scenario so the current user experience remains intact.
- Keep batch execution as a first-class feature, not a later afterthought.
- Keep research provenance scenario-scoped instead of mixing all citation logic into the engine.

## 3. Main Critique

### 3.1 The proposed `ScenarioDefinition` is not rich enough

The current interface covers:

- labels
- theme
- resources
- departments
- crisis categories
- agent fields
- a few hooks

That is not enough to carry the actual domain boundary.

The engine also needs scenario-owned definitions for:

- setup schema: what knobs the user can configure before the run
- effect catalog: valid policy effects and how they apply
- event taxonomy: scenario-specific event kinds and how to render them
- artifact schema: what gets saved, replayed, exported, and compared
- UI schema: which metrics, tabs, charts, and hover cards exist
- capability policy: whether tool forging, live search, bulletin, or colonist chat are enabled
- lifecycle policy: births, hiring, immigration, promotions, succession, retirement
- scenario metrics: derived values that are not raw resources

Without those, Mars-specific logic will simply migrate from `kernel/` into `orchestrator.ts`, `main.js`, and output shaping code.

### 3.2 `Systems.resources` is too flat

Replacing named fields with `resources: Record<string, number>` is directionally good, but the current proposal over-flattens the model.

Not everything in Mars is a resource:

- `morale` is a global sentiment metric
- `population` is a demographic count
- `lifeSupportCapacity` is a capacity constraint
- `earthDependencyPct` is a political dependency metric
- `governanceStatus` is categorical state
- `independencePressure` is socio-political pressure

These should not all be shoved into one numeric bag.

Recommended shape:

```ts
interface WorldState {
  metrics: Record<string, number>;
  capacities: Record<string, number>;
  statuses: Record<string, string | boolean>;
  politics?: Record<string, number | string | boolean>;
  environment?: Record<string, number | string | boolean>;
}
```

Then let scenarios declare which of those appear in the header, are diffed in reports, and affect crisis escalation.

### 3.3 `AgentFieldDefinition` is too numeric and too narrow

Mars currently uses:

- cumulative radiation
- bone density
- psych score
- Mars-born identity
- relationships
- promotion state

Future scenarios will want:

- faction alignment
- burnout stage
- debt
- infection state
- injury type
- loyalty band
- reputation
- legal status

Some are numeric. Some are categorical. Some are sets or flags.

So `fields: Record<string, number>` will break quickly. Use typed scenario field definitions instead:

```ts
type ScenarioFieldValue = number | string | boolean | string[];
```

and make field schemas explicit.

### 3.4 The real coupling is in orchestration, not just state

The current app hardcodes Mars logic in places the generalization spec does not fully account for:

- [`src/agents/director.ts`](../../../src/agents/director.ts): Mars-only director instructions, categories, and prompt wording
- [`src/agents/departments.ts`](../../../src/agents/departments.ts): Mars-only role instructions, context builders, and role summaries
- [`src/agents/colonist-reactions.ts`](../../../src/agents/colonist-reactions.ts): Mars-born phrasing, radiation/bone-density reaction context
- [`src/agents/orchestrator.ts`](../../../src/agents/orchestrator.ts): hardcoded category effects, fingerprinting, colonist bulletin generation, and promotion flow
- [`src/dashboard/main.js`](../../../src/dashboard/main.js): Mars copy, Mars presets, colony-specific tooltips, bulletin/chat wording

The engine/scenario split has to move these boundaries too, not just rename `Colonist` to `Agent`.

### 3.5 The dashboard needs a view schema, not just labels and theme

The design says:

- replace labels
- inject theme colors
- show scenario resources

That is not enough.

The current UI assumes:

- colonist hover cards have bone density and radiation
- bulletin posts are colony posts
- chat asks about life on Mars
- reports describe commander reasoning about a colony
- presets name colonies and commanders
- department icons are fixed
- stats bars assume population + morale + tools + citations

The general engine needs a `ScenarioUiDefinition` that tells the dashboard:

- which primary metrics to show
- how to format them
- which agent fields to show in tooltips
- whether bulletin, chat, and reaction cards are enabled
- how to render event cards and outcome cards
- whether the setup screen exposes leaders, personnel, scenario presets, or world seeds

Otherwise the dashboard remains a Mars dashboard with variable CSS.

### 3.6 Research memory is not product-ready yet

Current Mars research memory is useful for the demo, but not a stable engine boundary.

Observed issues:

- [`src/research/research-memory.ts`](../../../src/research/research-memory.ts) creates an in-memory SQLite store every run
- it re-ingests static citations every run
- on failure it falls back to `getResearchForCategory('infrastructure', keywords)`, which is the wrong fallback behavior for many crises

For a reusable engine, research should be scenario-packaged and durable:

- prebuilt scenario knowledge bundles
- scenario-scoped retrieval
- durable store option for repeated runs
- explicit provenance metadata
- deterministic offline mode for demos
- live-search policy owned by the scenario or product preset

### 3.7 The current migration path moves files too early

The proposed sequence starts with large structural moves:

1. create generic engine types
2. move Mars into `src/scenarios/mars`
3. refactor kernel paths

That is high blast radius too early.

Safer order:

1. freeze current Mars behavior with compatibility tests and golden artifacts
2. fix known config/output bugs
3. introduce adapter interfaces inside existing files
4. move Mars behavior behind those interfaces
5. only then split directories and package boundaries

File moves should follow proven abstraction seams, not define them.

### 3.8 The design overgeneralizes the target problem

Mars, Antarctic base, lunar outpost, underwater habitat, and generation ship are all close cousins. They share:

- constrained resources
- population management
- infrastructure capacity
- health and morale drift
- governance pressure
- long-horizon crises

Corporate sim, medieval kingdom, and MiroFish-style social prediction do not.

Recommendation:

- v1 engine target: **closed-state, turn-based settlement simulation**
- v2: expand to adjacent habitat or institutional sims
- separate future archetype: **graph-seeded social prediction engine**

Do not let the Mars product get dragged into supporting every simulation genre on day one.

## 4. Concrete Bugs And Risks Found

These are worth fixing before or during any generalization work.

### 4.1 Director model override bug

In [`src/sim-config.ts`](../../../src/sim-config.ts), `resolveSimulationModels()` sets:

```ts
director: normalizeModel(models?.commander, defaults.director)
```

That means the director currently cannot be independently overridden and will silently track the commander model.

### 4.2 Setup surface cannot override all runtime models

`SimulationSetupPayload.models` omits `director` and `colonistReactions`, while `runSimulation()` already has separate behavior for both. The setup contract and runtime contract are out of sync.

### 4.3 Research fallback is wrong

If research memory initialization fails, the fallback category is hardcoded to `infrastructure` in [`src/research/research-memory.ts`](../../../src/research/research-memory.ts). That produces domain drift and bad citations for non-infrastructure crises.

### 4.4 Reproducibility is weaker than the product claims

Current non-deterministic pieces include:

- `simulationId: \`mars-genesis-${seed}-${Date.now()}\`` in [`src/kernel/kernel.ts`](../../../src/kernel/kernel.ts)
- `Math.random()` for bulletin likes/replies in [`src/agents/orchestrator.ts`](../../../src/agents/orchestrator.ts)

That does not invalidate deterministic kernel claims, but it does weaken reproducible artifacts and report comparisons.

### 4.5 Outcome effects are still hardcoded in orchestration

`categoryEffects` and outcome application live in [`src/agents/orchestrator.ts`](../../../src/agents/orchestrator.ts), not in the scenario. That is one of the most important Mars couplings in the entire app.

### 4.6 Fingerprinting is not scenario-neutral and not fully state-driven

Current fingerprint logic depends partly on leader personality rather than only final-world evidence. That is fine for a Mars demo, but not for a generic comparison engine.

### 4.7 Residual department mismatch

`science` still exists in state and population progression, while the active promoted departments are now medical, engineering, agriculture, psychology, and governance. That mismatch suggests the domain model is still between versions.

### 4.8 Pair runner tags are leader-order dependent

[`src/pair-runner.ts`](../../../src/pair-runner.ts) emits `visionary` for index 0 and `engineer` for index 1 regardless of the actual leader archetypes. That is a product bug once presets become configurable.

### 4.9 Server lifecycle cleanup is incomplete by inspection

[`src/server-app.ts`](../../../src/server-app.ts) allocates an IP rate limiter cleanup interval but does not clear it on server shutdown. Even if this does not surface immediately in production, it is exactly the kind of lifecycle leak that becomes painful once the product gains scenario registries and batch workers.

### 4.10 Server tests are not portable in the current sandbox

`server-app.test.ts` attempts to listen on the default bind target and fails under the current sandbox with `EPERM`. That is not a product defect by itself, but it does mean the current verification story is weaker than it looks.

## 5. What A Better Architecture Looks Like

### 5.1 Split engine, runtime, and product

Do not make `apps/mars-genesis-simulation/src` both the engine and the product forever.

Recommended structure:

```text
packages/
  sim-core/                 deterministic state engine, schemas, RNG, progression primitives
  sim-runtime/              agents, crisis orchestration, tool forging, research integration
  sim-dashboard/            generic event/report renderer and setup form primitives
  scenarios-mars/           Mars scenario package

apps/
  mars-genesis-simulation/  branded Mars product
  scenario-lab/             optional generic authoring/batch surface later
```

Mars should remain a product app, not merely one folder under a generic engine.

### 5.2 Expand the scenario contract

Recommended high-level contract:

```ts
interface ScenarioPackage {
  id: string;
  version: string;
  engineArchetype: 'closed_turn_based_settlement';
  labels: ScenarioLabels;
  theme: ScenarioTheme;
  setup: ScenarioSetupSchema;
  world: ScenarioWorldSchema;
  departments: DepartmentDefinition[];
  metrics: MetricDefinition[];
  events: EventDefinition[];
  effects: EffectDefinition[];
  ui: ScenarioUiDefinition;
  knowledge: KnowledgeBundle;
  policies: ScenarioPolicies;
  hooks: ScenarioHooks;
}
```

Key addition: `engineArchetype`.

That prevents the engine from pretending Mars and MiroFish are the same class of simulation.

### 5.3 Separate engine concerns from product presets

`defaultLeaders` and `defaultPersonnel` are product-level defaults, not core engine requirements.

Move them under setup or presets:

```ts
interface ScenarioPreset {
  id: string;
  label: string;
  leaders?: LeaderConfig[];
  personnel?: PersonnelConfig[];
  startingState?: Partial<WorldState>;
}
```

### 5.4 Add scenario-owned capability policy

The engine should not assume every scenario:

- allows tool forging
- forces every department to forge at least once
- allows live search
- exposes bulletin/chat
- uses the same sandbox limits

Add:

```ts
interface ScenarioPolicies {
  toolForging: { enabled: boolean; requiredDepartments?: string[] };
  liveSearch: { enabled: boolean; mode: 'off' | 'manual' | 'auto' };
  bulletin: { enabled: boolean };
  characterChat: { enabled: boolean };
}
```

### 5.5 Add a UI schema

The generic dashboard needs scenario-owned render metadata:

- metric cards
- agent tooltip fields
- report sections
- event icons
- field formatters
- setup fields

This is the difference between a reusable renderer and a rebranded Mars page.

## 6. Mars-First Product Recommendations

If Mars Genesis is the first-class product, do this explicitly.

### 6.1 Keep a branded Mars app

Do not collapse Mars into a generic scenario lab UI. Mars should keep:

- its own landing/about copy
- its own screenshots and demo artifacts
- its own presets and commander personalities
- its own science/provenance framing

### 6.2 Prove modularity with a close cousin first

Do not prove the engine with `corporate` or `medieval` first.

Better second scenarios:

- lunar outpost
- Antarctic station
- orbital habitat
- submarine habitat

Those will stress the abstraction honestly without forcing a different simulation archetype.

### 6.3 Treat MiroFish as a future sibling, not the same engine

The main lesson from MiroFish is not "copy its graph stack into Mars."

The lesson is:

- graph-seeded real-world prediction is a different product lane
- if you want that later, define it as another simulation archetype with a different world-seeding layer
- do not contaminate the Mars refactor by trying to support both in one pass

## 7. Revised Delivery Plan

### Phase 0: Stabilize current Mars behavior

- fix config/runtime mismatches
- fix director model override
- remove obvious non-deterministic artifact noise
- add golden-run compatibility fixtures
- add contract tests for saved output shape

### Phase 1: Introduce internal abstraction seams

- metric registry
- effect registry
- event taxonomy
- scenario-owned prompt builders
- scenario-owned research bundle

No directory moves yet.

### Phase 2: Externalize Mars behind a scenario adapter

- move crises
- move research
- move prompt fragments
- move progression additions
- move names and presets
- move fingerprint logic

### Phase 3: Generalize the dashboard through a UI schema

- labels
- theme
- metrics
- hover cards
- reports
- setup form sections

### Phase 4: Split package boundaries

- extract engine/runtime/dashboard packages
- keep Mars as the product app using those packages

### Phase 5: Add batch runner and second scenario

- reproducible experiment manifests
- artifact comparison
- cost tracking
- failure isolation
- second scenario from the same engine archetype

## 8. Updated Success Criteria

Replace the current success criteria with these:

1. `npm run dashboard` still launches Mars with the same branded experience.
2. Mars logic can be loaded through a scenario package boundary without changing output behavior for a fixed seed.
3. Saved run artifacts are scenario-agnostic at the top level and scenario-specific only in a namespaced extension block.
4. A second **settlement-style** scenario can be added without editing engine or dashboard code.
5. The dashboard renders scenario-owned metrics and tooltip fields, not just renamed Mars strings.
6. Batch runs are reproducible and persist a manifest containing scenario ID, scenario version, seed, model config, and output schema version.
7. Tool-forging, research, bulletin, and chat behavior are controlled by scenario/product policy rather than hardcoded assumptions.

## 9. Bottom Line

The current design is a strong starting direction, but it is not yet the design that turns Mars Genesis into a reusable simulation product.

The most important correction is this:

- do not generalize only the nouns
- generalize the contracts that own behavior, outputs, UI, and lifecycle policy

And the most important scope correction is this:

- do not try to make Mars, corporate, medieval, and MiroFish all fit one engine in v1
- make Mars first-class
- make the engine honest about which simulation archetype it supports
- prove modularity with one neighboring scenario, not every imaginable one

That path will produce a better product, a safer refactor, and a more credible engine.
