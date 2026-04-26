---
title: Pluggable Trait-Model Registry for Leaders
date: 2026-04-26
status: in-progress
package: paracosm
---

# Pluggable Trait-Model Registry for Leaders

## Goal

Today every leader in paracosm carries a fixed six-axis HEXACO personality profile (`openness`, `conscientiousness`, `extraversion`, `agreeableness`, `emotionality`, `honestyHumility`). The README and landing copy claim leaders can be "colony commanders, CEOs, generals, ship captains, department heads, AI systems, governing councils, or any entity that receives information, evaluates options, and makes choices that shape the world", but the schema is human-personality-only. A "Bayesian Risk Optimizer" leader works only by metaphorically mapping AI-system tendencies onto a model designed for humans.

This spec replaces the hardcoded HEXACO field with a pluggable **TraitModel registry**. Two built-in models ship in v1: `hexaco` (the canonical Ashton-Lee shape, the existing default) and `ai-agent` (a new six-axis model designed for AI-system leaders). Adding a third model requires a build-time / engine-load `traitModelRegistry.register(model)` call inside paracosm itself; there is no runtime `paracosm.registerTraitModel()` API in v1 (see Non-goals).

## Non-goals

- **Big Five, DISC, Hofstede, Schwartz values, or any third trait model in v1.** The registry exists; adding more models is a 2-3 day extension per model. Out of scope for v1 to keep test surface bounded.
- **Custom user-defined trait models at runtime.** The registry is registration-time-only. No `paracosm.registerTraitModel()` API in v1.
- **Blended / hierarchical leaders.** A council of three traders, each with a different profile, aggregated into one decision-maker. Conceptually possible on top of the trait-model layer, but not implemented in v1.
- **Cross-model leader comparison on a normalized axis.** Comparing a `hexaco` leader's "openness" against an `ai-agent` leader's "exploration" requires a normalization mapping the registry does not provide.
- **Replacing AgentOS.** Every LLM call still goes through `agent()`, `generateText()`, `generateObject()`, `EmergentCapabilityEngine`, `EmergentJudge`, `AgentMemory`. The trait-model generalization is paracosm-internal.

## Architecture

A `TraitModel` is a typed object that defines:

1. **Identity**: `id` (kebab-case string used in artifacts), `name` (human-readable), `description`.
2. **Axes**: ordered list of trait dimensions, each with `id` (kebab-case for serialization), `label` (UI display), `description`, optional `lowPole` / `highPole` short labels for UI tooltips.
3. **Bounds**: trait values are floats in `[0, 1]`. The model can declare per-axis defaults (used when an axis is omitted from a partial profile).
4. **Drift table**: an outcome-class → axis-delta map describing how each axis shifts after each outcome class (`risky_success`, `risky_failure`, `conservative_success`, `conservative_failure`, `safe_success`, `safe_failure`). Plus leader-pull weight (how strongly agents drift toward their leader's profile per turn) and role-activation weights (how strongly being promoted to a department amplifies the relevant axis).
5. **Cue dictionary**: keyed by `axis-id` + `zone` (`low` ≤ 0.35, `mid` 0.35-0.65, `high` ≥ 0.65), each entry is a short prose cue the prompt builder can splice in ("you lean exploratory: prefer untested options when standard ones fail"). All three zones are optional per `CueZone` (defined `{ low?, mid?, high? }`); the cue translator silently skips axes whose matching zone is undefined rather than throwing. By design, `mid` is rarely populated: only polarized axes (low or high) emit cues, matching the legacy HEXACO behavior.
6. **Default profile**: a neutral baseline used when a leader provides no traits (all 0.5 by convention).

The **TraitModelRegistry** is an in-memory `Map<string, TraitModel>` populated at engine load time. Two built-ins are registered:
- `hexaco` (replaces today's hardcoded shape)
- `ai-agent` (new)

`LeaderConfig` grows a typed `traitProfile?: TraitProfile` field where `TraitProfile = { modelId: string; traits: Record<string, number> }`. The legacy `hexaco?: HexacoProfile` field stays for back-compat: when present and `traitProfile` is absent, a normalizer synthesizes `traitProfile = { modelId: 'hexaco', traits: hexaco }`. Existing leaders compile and run without changes.

`RunArtifact.metadata.traitModelId` records which model the run used so replays reconstruct the correct cue + drift behavior even if the registry shape evolves.

```
src/engine/trait-models/
  index.ts              TraitModel + TraitProfile types, TraitModelRegistry, helpers
  hexaco.ts             6-axis Ashton-Lee model (lifted from today's hardcoded shape)
  ai-agent.ts           6-axis AI-system model (new)
  cue-translator.ts     model-agnostic prose cue generator
  drift.ts              applyOutcomeDrift, applyLeaderPull, applyRoleActivation,
                        driftLeaderProfile (kernel-discipline drift, ±0.05/turn,
                        bounds [0.05, 0.95], byte-identical to driftCommanderHexaco
                        for HEXACO)
  normalize-leader.ts   normalizeLeaderConfig back-compat resolver: synthesizes
                        traitProfile from legacy hexaco field, validates trait
                        keys against model.axes, throws clear errors on missing
                        / unknown axes
  builtins.ts           auto-registers hexaco + ai-agent on import (side effect)

src/engine/schema/primitives.ts
  TraitProfileSchema    Zod schema (modelId regex + traits record [0,1])

tests/engine/trait-models/
  registry.test.ts      register / get / require / validation
  hexaco.test.ts        axes, defaults, cue strings, drift values
  ai-agent.test.ts      axes, drift sanity, cue dictionary coverage
  cue-translator.test.ts buildCueLine / pickCues / axisIntensities
  drift.test.ts         applyOutcomeDrift + applyLeaderPull + applyRoleActivation
                        + driftLeaderProfile byte-equality regression vs
                        driftCommanderHexaco for every outcome class
  normalize-leader.test.ts back-compat synthesis + axis validation
  safety.test.ts        negative-path: missing zones / outcomes,
                        unknown axis rejection, UnknownTraitModelError fields

src/runtime/trait-cues/   (canonical entry; runtime/hexaco-cues/ is a back-compat shim)
  index.ts              re-exports buildReactionCues + buildTrajectoryCue
  reaction.ts           buildReactionCues(profile) + buildReactionCuesFromHexaco
  trajectory.ts         buildTrajectoryCue(history, current) + ...FromHexaco

tests/runtime/
  orchestrator-trait-model.test.ts   leader normalization at runSimulation entry
```

Implementation note: the runtime module is named `runtime/trait-cues/` and the
legacy `runtime/hexaco-cues/` files were reduced to thin re-export shims that
delegate to the new path, preserving byte-identical output for HEXACO callers.
The 4 active prompt-builder consumers (orchestrator, departments, director,
agent-reactions) keep importing from the legacy path unchanged in v1; orchestrator
adds a parallel `commanderTraitProfile` branch that drifts via `driftLeaderProfile`
and dispatches the trajectory cue on `modelId` so non-HEXACO leaders pick up
the registered model's cue dictionary.

## Components

### `TraitModel` interface

```ts
export interface TraitAxis {
  id: string;                       // kebab-case, used in serialization
  label: string;                    // human-readable for UI
  description: string;
  lowPole?: string;                 // short label, e.g. "exploits known options"
  highPole?: string;                // short label, e.g. "tries untested options"
}

export type Outcome =
  | 'risky_success' | 'risky_failure'
  | 'conservative_success' | 'conservative_failure'
  | 'safe_success' | 'safe_failure';

export interface DriftTable {
  /** axis-id -> outcome -> delta (typically -0.05 to +0.05) */
  outcomes: Record<string, Partial<Record<Outcome, number>>>;
  /** axis-id -> per-turn pull strength toward leader's value (0..1) */
  leaderPull: Record<string, number>;
  /** axis-id -> per-turn amplification when promoted to a relevant department */
  roleActivation: Record<string, number>;
}

export interface CueZone { low?: string; mid?: string; high?: string }

export interface TraitModel {
  id: string;                       // 'hexaco', 'ai-agent', ...
  name: string;
  description: string;
  axes: readonly TraitAxis[];       // 2-12 axes per model
  defaults: Record<string, number>; // axis-id -> default float
  drift: DriftTable;
  cues: Record<string, CueZone>;    // axis-id -> per-zone prose cue
}

export interface TraitProfile {
  modelId: string;
  traits: Record<string, number>;
}

export class TraitModelRegistry {
  register(model: TraitModel): void;
  get(modelId: string): TraitModel | undefined;
  require(modelId: string): TraitModel; // throws on miss
  list(): TraitModel[];
}

export const traitModelRegistry: TraitModelRegistry; // singleton
```

### `hexaco` model definition

Lifts the existing six axes (openness, conscientiousness, extraversion, agreeableness, emotionality, honestyHumility) into the new shape. Drift table preserves the current Ashton-Lee-derived numbers (live in `runtime/hexaco-cues/` today; the spec relocates them, behavior unchanged). Cue dictionary preserves the current cue strings.

Default profile: all 0.5.

### `ai-agent` model definition

Six axes designed for AI-system leaders:

| axis-id | label | low pole | high pole |
|---------|-------|----------|-----------|
| `exploration` | Exploration | exploits known options | tries untested options when standard ones fail |
| `verification-rigor` | Verification rigor | accepts first plausible answer | double-checks claims, runs tests |
| `deference` | Deference | overrides operator constraints when confident | defers to user / supervisor / safety constraints |
| `risk-tolerance` | Risk tolerance | refuses low-confidence actions | acts on partial information |
| `transparency` | Transparency | terse outputs, no working shown | shows reasoning, cites sources |
| `instruction-following` | Instruction following | interpolates intent from context | obeys explicit instructions verbatim |

Drift example (calibrated v1, expected to tune over real runs):

- `risky_failure` -> `verification-rigor` +0.04, `transparency` +0.05, `risk-tolerance` -0.04, `exploration` -0.03, `deference` +0.02 (rigor and visibility increase after a public miss; risk-taking gets pulled back)
- `risky_success` -> `exploration` +0.05, `risk-tolerance` +0.03, `deference` -0.02 (positive feedback on bold action erodes deference)
- `conservative_failure` -> `risk-tolerance` +0.04, `exploration` +0.03, `instruction-following` +0.02 (over-cautiousness penalized; reverts toward following the playbook)
- `conservative_success` -> `verification-rigor` +0.02 (rigor reinforced when deliberation pays off)
- `safe_failure` -> `deference` +0.03, `verification-rigor` +0.03, `transparency` +0.03, `instruction-following` +0.03 (when supervisor signals were ignored, every guard tightens)
- `safe_success` -> no axes drift (the playbook worked; no signal to update)

The drift dispatcher (`applyOutcomeDrift` / `driftLeaderProfile` in
`src/engine/trait-models/drift.ts`) safely treats missing
`model.drift.outcomes[axis][outcome]` entries as zero delta via `?? 0`,
so the four-pole HEXACO drift table (which omits the two `safe_*`
classes) and the partially-populated `safe_success` row above never
throw at runtime.

Default profile: all 0.5.

### Schema + back-compat

```ts
// engine/schema/primitives.ts
export const TraitProfileSchema = z.object({
  modelId: z.string().min(2).max(32).regex(/^[a-z0-9-]+$/),
  traits: z.record(z.string(), z.number().min(0).max(1)),
});

// engine/types.ts: LeaderConfig
export interface LeaderConfig {
  name: string;
  archetype: string;
  unit: string;
  instructions: string;
  /** @deprecated since 0.8: use traitProfile instead. Kept for back-compat. */
  hexaco?: HexacoProfile;
  traitProfile?: TraitProfile;
}
```

A new `normalizeLeaderConfig` helper resolves the trait profile:

```
if (leader.traitProfile)
  -> verify modelId is registered (throws UnknownTraitModelError if not)
  -> verify every key in traits[] is declared by model.axes
     (throws "references axes not declared by the model: [keys]" if any unknown)
  -> fill missing axes with model.defaults
  -> return as-is
else if (leader.hexaco)
  -> synthesize { modelId: 'hexaco', traits: leader.hexaco }
else
  -> throw "must have either traitProfile or the legacy hexaco field"
```

`runSimulation` calls `normalizeLeaderConfig` once before the run starts; downstream code reads `traitProfile` only. The legacy `hexaco` field is preserved on the artifact for back-compat consumers but is informational, not load-bearing.

`RunArtifact.metadata` adds `traitModelId: string` (defaults to `'hexaco'` when reading a legacy artifact). Replay validates the registry has the model registered before re-executing.

### Drift mechanism

The drift surface lives in `src/engine/trait-models/drift.ts`. Three functions cover the three drift sources from the original HEXACO design:

- `applyOutcomeDrift(profile, model, { outcome })`: applies `model.drift.outcomes[axisId][outcome]` per axis, clamped to `[0, 1]` (no kernel-bounds tightening, used in component tests).
- `applyLeaderPull(agent, model, { leader })`: applies `leaderPull[axisId] * (leader[axis] - agent[axis])` per axis. No-op when agent and leader use different `modelId`.
- `applyRoleActivation(profile, model, { axisSigns })`: applies `roleActivation[axisId] * sign` for axes the caller flags via the per-axis sign map.
- `driftLeaderProfile(profile, model, { outcome, timeDelta, turn, time, history })`: kernel-discipline drift that mirrors `driftCommanderHexaco` semantics for HEXACO: ±0.05/turn cap **before** `timeDelta` scaling, output clamped to `[0.05, 0.95]` (the saturation-prevention bounds used by the kernel), and a snapshot pushed to `history`.

For HEXACO leaders, `driftLeaderProfile(_, hexacoModel, _)` produces byte-identical output to `driftCommanderHexaco` because `hexacoModel.drift.outcomes` mirrors `progression.ts:outcomePullForTrait` exactly, and the cap + bounds match. The 6-case regression test in `tests/engine/trait-models/drift.test.ts` locks this in.

All four functions safely default missing `model.drift.outcomes[axisId][outcome]` entries to zero (`?? 0`), so a partial drift table never throws.

`Agent` schema growth (deferred to a Phase 5b follow-up): `Agent.traitProfile` will parallel the leader's. Today `Agent.hexaco` remains the canonical agent-side trait field; the orchestrator wiring at `c1684f13` only swaps the leader-side cue + drift dispatch. Agents continue to drift via `applyPersonalityDrift` in `progression.ts` against their HEXACO field. Migration:

- `Agent.hexaco` deprecated, `Agent.traitProfile` added.
- Initial agent generation reads the leader's `traitProfile.modelId` and seeds agents with the model's defaults plus per-agent variance.
- Existing serialized agents (in artifacts) parse with `Agent.hexaco` which the resolver promotes to `Agent.traitProfile = { modelId: 'hexaco', traits: ... }`.

### Prompt cue translation

`src/engine/trait-models/cue-translator.ts` exports `buildCueLine(profile, model, opts?)` and `pickCues(profile, model, opts?)`. Both take an explicit `TraitModel` (caller looks up via `traitModelRegistry.require(profile.modelId)` first). The runtime entry point at `src/runtime/trait-cues/reaction.ts::buildReactionCues(profile)` does the registry lookup for callers and is the canonical site for orchestrator + dept + director + agent-reactions.

The translator:

1. Iterates `model.axes` in declaration order (stable across runs).
2. For each axis whose value sits in `low` (≤ 0.35) or `high` (≥ 0.65), looks up `model.cues[axisId]?.[zone]`. Mid-zone is intentionally skipped; the legacy HEXACO behavior the runtime preserves only emits cues for polarized axes.
3. Skips axes whose cue entry is undefined for the matching zone (no error, no console warn). This keeps a partially-defined cue dictionary usable.
4. Caps the emitted cues at `opts.maxCues` (default 6, matching HEXACO's six axes).

`axisIntensities(profile, model)` is also exported for future use cases (sparkline highlighting, prompt-budget-constrained cue selection); current cue selection iterates in declaration order and does not weight by intensity. The original "top 3-5 axes by intensity" plan was simplified during implementation: declaration-order iteration produces stable, debuggable output and matches the legacy HEXACO translator's behavior, so users moving from v0.7 see identical cue ordering.

Commander, department, director, and agent-reaction prompts all read cues via the runtime entry. The system prompts switch from "your openness score is X" to "your profile cues: <cues>", model-agnostic by construction.

### Dashboard

`LeaderBar.tsx`, `LeaderConfigForm.tsx`, the HEXACO sparklines, and the agent chat trait chips read axes from `traitModel.axes` instead of hardcoding `[openness, ...]`.

A `<TraitModelPicker>` component lets the user choose which model when creating a leader. Defaults to `hexaco` for parity. The Quickstart wizard gains a model dropdown next to the leader-count selector. Existing scenarios still ship HEXACO leaders.

## Data flow

```
1. User creates a leader via dashboard or programmatic API
2. LeaderConfigForm picks a TraitModel from the registry
3. Sliders render based on model.axes; user sets values
4. LeaderConfig.traitProfile = { modelId, traits } persisted

5. runSimulation receives leader -> normalizeLeaderConfig -> traitProfile guaranteed
6. Director, commander, departments, agent reactions all call cuesForLeader(leader, model)
7. After each turn outcome:
   - applyTraitDrift mutates agent + leader trait profiles using model.drift
8. Final artifact records:
   - metadata.traitModelId
   - leader.traitProfile (final state)
   - decisions[].leaderTraitsAtDecision (snapshot at each decision)
   - agents[].traitProfile (final state per agent)
```

Replay reads `metadata.traitModelId`, looks up the model in the registry, fails fast with a clear error if the model isn't registered ("paracosm version mismatch: this artifact was created with trait model 'ai-agent', which this build does not register").

## Error handling

- **Unknown `traitProfile.modelId` at simulate time**: `normalizeLeaderConfig` calls `traitModelRegistry.require(modelId)` which throws `UnknownTraitModelError` carrying the unknown id and the registered list (`UnknownTraitModelError.modelId` + `UnknownTraitModelError.registered`). Action for callers: register the model at engine load before simulating.

- **Trait value out of bounds**: `TraitProfileSchema` (in `engine/schema/primitives.ts`) rejects at parse time via Zod's `.number().min(0).max(1)`. Entry paths that don't go through Zod still get clamped on first read by `withDefaults` (which calls `clampTrait`).

- **Trait keys reference axes the model doesn't declare**: `normalizeLeaderConfig` cross-validates `traitProfile.traits` keys against `model.axes` and throws an explicit error listing every unknown axis ("references axes not declared by the model: [creativity, patience]. Declared axes: [openness, conscientiousness, ...]"). This is the user-input / config-error case (typo, hallucinated axis name from an LLM-generated config). Action: fix the config.

- **Cue dictionary missing a zone for an axis**: the cue translator (`pickCues` in `engine/trait-models/cue-translator.ts`) skips the axis silently when `model.cues[axisId]?.[zone]` is undefined. No console warn, no throw. This is the partial-cue-dictionary case (model author defined `high` but not `low`); the runtime tolerates incomplete dictionaries gracefully so models can ship in stages.

- **Drift table missing an outcome for an axis**: `applyOutcomeDrift`, `applyLeaderPull`, `applyRoleActivation`, and `driftLeaderProfile` all default missing entries to zero via `?? 0`. No throw. Same rationale as missing cue zones: partial drift tables are valid, just produce no movement on the omitted outcome.

- **Replay against a missing model**: throws `WorldModelReplayError("Trait model X not registered")` before kernel re-execution starts. Action: ensure the registered models match the artifact's `metadata.traitModelId`. (The orchestrator does not currently emit `metadata.traitModelId` on artifacts; that's a Phase 5b follow-up. Until then replay forensics rely on the leader's `traitProfile.modelId` being inspectable in `metadata.leader`.)

## Testing

Test files actually shipped (counts reflect the implementation that landed):

1. `tests/engine/trait-models/registry.test.ts` (8 tests)
   - `register` / `get` / `require` happy paths + miss path
   - re-register same id throws
   - kebab-case + camelCase axis ids accepted (HEXACO uses `honestyHumility` for back-compat with the legacy field name)
   - axes-count bounds (2..12), defaults bounds [0, 1], drift references unknown axis rejected

2. `tests/engine/trait-models/hexaco.test.ts` (6 tests)
   - Six canonical axes present
   - Defaults all 0.5
   - Cue dictionary preserves legacy strings byte-for-byte for high-extraversion + high-openness, and low-conscientiousness + low-agreeableness combinations
   - Empty cue line for all-mid profile
   - Drift values lock against `outcomePullForTrait` per-axis (table match)

3. `tests/engine/trait-models/ai-agent.test.ts` (8 tests)
   - Six canonical axes present, defaults all 0.5
   - Cue dictionary covers low + high for every axis
   - Aggressive AI archetype emits expected polarized cues
   - Conservative AI archetype emits expected polarized cues
   - `risky_failure` raises `verification-rigor` and `transparency`
   - `risky_success` raises `exploration` and `risk-tolerance`
   - Drift values clamp to [0, 1]

4. `tests/engine/trait-models/cue-translator.test.ts` (7 tests)
   - `maxCues` cap honored
   - Default maxCues = 6 (HEXACO axis count)
   - Mid-zone axes skipped
   - Configurable preface
   - Partial trait map fills with defaults
   - `axisIntensities` reports |value - 0.5|
   - Empty output when profile has no polarized axis

5. `tests/engine/trait-models/drift.test.ts` (15+ tests including byte-equality regressions)
   - `applyOutcomeDrift` per-model + per-axis sanity
   - `applyLeaderPull` and `applyRoleActivation` semantics
   - `driftLeaderProfile` byte-identical to `driftCommanderHexaco` across all four outcome classes used by HEXACO
   - timeDelta=2 compounding equality
   - kernel-bounds clamp [0.05, 0.95]
   - history snapshot push
   - ai-agent drift produces expected per-outcome deltas

6. `tests/engine/trait-models/normalize-leader.test.ts` (9 tests)
   - Synthesizes traitProfile from legacy hexaco field
   - Preserves explicit traitProfile when set (modelId + traits)
   - Fills missing axes with model defaults (no axis-validation error)
   - Throws `UnknownTraitModelError` on unregistered modelId
   - Uses singleton registry by default
   - hexacoToTraits + traitsToHexaco round-trip correctness
   - traitsToHexaco clamps out-of-range values

7. `tests/engine/trait-models/safety.test.ts` (12 tests)
   - Cue translator silently skips axes whose model.cues entry omits the matching zone
   - Mid-zone is never emitted by design
   - Drift dispatcher tolerates missing outcome entry (zero delta, no throw)
   - `driftLeaderProfile` tolerates null outcome (no-op on first turn)
   - normalizeLeaderConfig rejects unknown axis keys (single + multi + lists every bad axis)
   - normalizeLeaderConfig rejects leaders missing both hexaco and traitProfile
   - `UnknownTraitModelError` carries `modelId` + `registered[]` fields for replay forensics

8. `tests/runtime/orchestrator-trait-model.test.ts` (4 tests)
   - Legacy hexaco-only leader normalizes to a hexaco traitProfile
   - ai-agent leader passes through normalization unchanged
   - Partial ai-agent traits fill missing axes from defaults
   - UnknownTraitModelError on unregistered modelId at the orchestrator entry

**Total: 76 trait-model + cue + safety tests passing**, plus the 13 legacy `runtime/hexaco-cues/*.test.ts` tests that continue to pass through the back-compat shims.

The full project test suite (`npm test`) includes additional coverage on the surrounding kernel, runtime, and dashboard surfaces. Pre-commit checklist runs the trait-model targeted tests; CI runs the full suite to catch surface-area changes.

## Migration / rollout

**Single-pass, no flag.** The registry + back-compat resolver makes the schema change non-breaking: existing leaders, existing artifacts, existing serialized agents all continue to work. New scenarios can opt into ai-agent by setting `traitProfile.modelId = 'ai-agent'`.

Deprecation timeline:
- 0.8.x: `LeaderConfig.hexaco` marked `@deprecated` in TSDoc; resolver still synthesizes `traitProfile` from it. Shipped in this v1.
- 0.9.x: `LeaderConfig.hexaco` removed from the schema. Callers must use `traitProfile`.

The cookbook gains a new `scripts/cookbook-ai-agent.ts` script that demonstrates an "Aggressive AI Release Director" archetype running through corp-quarterly. Captured input + output JSON lives at `output/cookbook/ai-agent/`. The README + landing copy got a one-paragraph "Pluggable Trait Models" section pointing to the captured run; the dashboard's `LeaderConfig` form gained a `TraitModelNotice` component announcing the registry to dashboard users (full slider generalization queued for a Phase 6 follow-up).

## Effort

| Phase | Touches | Estimate |
|-------|---------|----------|
| 1. Engine layer | `trait-models/index.ts`, `registry`, `cue-translator`, `drift` | 4h |
| 2. Trait model definitions | `hexaco.ts`, `ai-agent.ts` | 3h |
| 3. Schema + resolver | `engine/schema/primitives.ts`, `engine/types.ts`, `normalizeLeaderConfig` | 3h |
| 4. Drift + cue rename | `runtime/hexaco-cues/` -> `runtime/trait-cues/` + dispatch | 4h |
| 5. Prompt integration | commander/department/director/reactions templates | 3h |
| 6. Dashboard generalization | `LeaderBar`, `LeaderConfigForm`, sparklines, picker | 4h |
| 7. Tests | 5 new files + 1 regression | 4h |
| 8. Docs + cookbook example | README, landing, ai-agent cookbook scenario | 2h |
| **Total** | | **~27h** |

Single-session executable on Opus 4.7 1M context.

## Risks

- **Drift-table calibration for `ai-agent`**. No published research equivalent to Ashton-Lee for AI systems. The proposed numbers are reasoned from first principles and need empirical tuning across runs. Documented as "v1 calibration; expected to tighten over time".
- **Prompt regression on HEXACO**. The cue-translator rewrite must produce the same cue strings the existing `runtime/hexaco-cues/` produces for the same input, or HEXACO scenario behavior shifts subtly. Regression test in `hexaco.test.ts` locks the cue values.
- **Dashboard slider state migration**. If a user has a leader saved with HEXACO traits and switches the picker to `ai-agent`, the sliders should reset to ai-agent defaults rather than try to map HEXACO values onto ai-agent axes. The picker emits a `confirm reset?` modal when traits exist.
- **Replay against an artifact whose model isn't registered**. Surfaced as a clean error rather than a silent shape mismatch. Documented in the WorldModelReplayError message.

## Verification gate

Before commit:

1. `npm run typecheck:dashboard` clean.
2. **Full** test suite passes: `npm test`. Trait-model changes touch shared types (`LeaderConfig`, `RunArtifact`, `Agent`) and the renamed `runtime/trait-cues/` module; targeted tests alone can miss surface-area regressions. Targeted run during iteration is fine, but the full suite is the merge gate. Today's pre-existing test failures in `tests/cli/sim-config.test.ts` and `tests/runtime/economics-profile.test.ts` (unrelated `gpt-5.4-mini` vs `gpt-4o` model-string drift, predates this work) should not block; everything else green.
3. End-to-end smoke: run an ai-agent leader through a 2-3 turn corp-quarterly scenario, verify decision rationale references ai-agent axes. Captured in `output/cookbook/ai-agent/` and committed for replay-without-LLM-spend by future readers.
4. Replay smoke: replay the resulting artifact, expect `matches: true` (deferred until `metadata.traitModelId` lands in Phase 5b).
5. Back-compat smoke: any v0.7 artifact still parses and runs through `normalizeLeaderConfig` to a valid `traitProfile` (covered by `normalize-leader.test.ts` synthetic fixtures).
6. em-dash sweep clean across all touched files: `grep -nE "&mdash;|—" <files>` returns empty (em-dashes are the #1 LLM-writing tell per project memory).
7. Run `coderabbit:review` on the diff. Address Critical + Major findings before pushing; defer Minor + spec-doc tightening to a focused follow-up if scope is bounded.
