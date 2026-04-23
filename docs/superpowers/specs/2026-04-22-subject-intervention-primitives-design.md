# Subject + Intervention Input Primitives (P4 + P5)

**Status:** design, awaiting execution
**Date:** 2026-04-22
**Scope:** additive schema + RunOptions + RunArtifact + docs. Completes the INPUT side of the universal contract that 0.6.0 established for the output side. Ships as `0.6.<next_run_number>` additive release — no breaking changes, no version-minor bump.
**Out of scope:** batch-trajectory execution pipeline (paracosm-side specialist fanout). Multi-subject / multi-intervention simultaneous runs. Deeper integration of subjects/interventions into turn-loop semantics (subject fields pass through; don't influence existing turn-loop behavior). `buildRunArtifact` public promotion (rejected — too paracosm-coupled; external consumers construct artifacts via TS object literals + `RunArtifactSchema.parse()`).

---

## Motivation

0.6.0 shipped a clean OUTPUT contract (`RunArtifact` via `paracosm/schema`) and made `runSimulation()` return it. Digital-twin's existing `SimulationResponse` field-renames 1:1 into batch-trajectory mode. That half of the story is solid.

The INPUT side is still civilization-sim-shaped. `RunOptions` carries `maxTurns`, `seed`, `startYear`, `activeDepartments` — all turn-loop-specific. `LeaderConfig` has HEXACO + `unit` label — leader-driven model. `KeyPersonnel[]` is for civilization rosters. Nothing lets a caller say "simulate *this person* (profile + genome + biometrics) under *this intervention* (creatine + sleep hygiene, 12-week window)."

Until inputs have primitives, external consumers either:
1. Shoehorn their inputs into `LeaderConfig` (awkward semantically — "leader" doesn't mean "person under study")
2. Ignore paracosm's input typing and bolt their own on top (defeats the universal contract)

This spec adds `SubjectConfig` and `InterventionConfig` as first-class primitives under `paracosm/schema`, threads them through `RunOptions` + `RunArtifact`, and documents the digital-twin adoption path end-to-end.

**Important scope constraint:** this is schema + data-plumbing only. No new execution modes. Turn-loop mode stores `subject` + `intervention` verbatim on the artifact without consuming them semantically. External consumers running their own executors (digital-twin's LangGraph pipeline, game engines, custom logic) construct `RunArtifact` objects that carry subject + intervention. Future spec adds paracosm-side batch-trajectory executor; until then, subject + intervention are a data contract, not a runtime feature.

---

## Primitives

### `SubjectConfigSchema`

Domain-agnostic identity + context for "who/what is being simulated." Digital-twin: a person (profile + genome rsIDs + biometric signals). Game: a character (profile + traits + inventory). Ecology: an organism. Fleet ops: a vessel. The structure accommodates any subject of study.

```typescript
/** One time-stamped observation: biometric, sensor, telemetry. */
export const SubjectSignalSchema = z.object({
  label: z.string().min(1),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  recordedAt: z.string().datetime().optional(),
});

/** One categorical marker: rsID, clinical flag, classification tag. */
export const SubjectMarkerSchema = z.object({
  id: z.string().min(1),              // 'rs4680', 'high-risk-apoe', 'faction-red'
  category: z.string().optional(),    // 'genome', 'clinical', 'behavioral', 'affiliation'
  value: z.string().optional(),       // 'AA', 'present', 'member'
  interpretation: z.string().optional(),
});

export const SubjectConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Free-form attributes. Age, weight, diet, location, goals, allergies, etc. */
  profile: z.record(z.string(), z.unknown()).optional(),
  /** Time-series observations. Biometric / telemetry / sensor data. */
  signals: z.array(SubjectSignalSchema).optional(),
  /** Categorical markers. rsIDs, tags, clinical flags, classifications. */
  markers: z.array(SubjectMarkerSchema).optional(),
  /** HEXACO or any trait vector. Keeps the schema open for non-HEXACO models. */
  personality: z.record(z.string(), z.number()).optional(),
  /** Active conditions / flags. */
  conditions: z.array(z.string()).optional(),
  scenarioExtensions: z.record(z.string(), z.unknown()).optional(),
});
```

Design notes:
- `profile` as `Record<string, unknown>` — no fixed schema. Digital-twin puts age/weight/diet; a game puts inventory/faction; an ecology sim puts species/habitat. Consumers of the primitive narrow via `.parse()` on their own sub-schema when they need to.
- `signals.value: string | number` — digital-twin formats as "48.2 ml/kg/min" (string); raw telemetry might ship numeric. Both are valid; consumers format to taste.
- `markers` and `conditions` are separate because they're semantically different: markers are observed traits (genotype, classification), conditions are active state flags (pregnant, injured, promoted). Overlap is allowed but not required.
- `personality` is optional — digital-twin has no HEXACO; a paracosm leader-sim has one. Schema accommodates both without forcing either.

### `InterventionConfigSchema`

What's being tested on the subject. Digital-twin: a health protocol. Game: a strategic choice. Policy sim: a policy. Clinical trial: a treatment arm.

```typescript
export const InterventionConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.string().optional(),  // 'diet', 'exercise', 'medication', 'policy', 'strategy'
  /** Expected mechanism of action. */
  mechanism: z.string().optional(),
  /** Concrete behaviors the subject needs to perform. */
  targetBehaviors: z.array(z.string()).optional(),
  /** Expected intervention window (scenario time-units). */
  duration: z.object({
    value: z.number(),
    unit: z.string().min(1),
  }).optional(),
  /** Realism factor — likelihood of adherence + common failure modes. */
  adherenceProfile: z.object({
    expected: z.number().min(0).max(1),
    risks: z.array(z.string()).optional(),
  }).optional(),
  scenarioExtensions: z.record(z.string(), z.unknown()).optional(),
});
```

Design notes:
- `description` required; `mechanism` optional because not every intervention has a known mechanism worth writing down.
- `duration.unit: string` (not constrained to the scenario's `timeUnit` — interventions may span multiple scenario-time-units or be measured in different units like "days" for a health protocol embedded in a "weeks"-ticked sim).
- `adherenceProfile` is digital-twin-prominent but generalizes — game engines model "strategy stickiness," policy sims model "political will to sustain." Optional.

### Cardinality

Single `SubjectConfig` per run. Single `InterventionConfig` per run. Matches pair-runner's per-leader pattern. Callers compare N protocols on one subject by running paracosm N times and diffing the artifacts. A future multi-intervention-per-run feature would require a different execution model; not in scope here.

---

## `RunArtifact` additions

Additive `.optional()` fields at the top level:

```typescript
export const RunArtifactSchema = z.object({
  // ... all existing fields unchanged ...
  subject: SubjectConfigSchema.optional(),
  intervention: InterventionConfigSchema.optional(),
  // ... rest unchanged ...
});
```

Populated by:
- `batch-trajectory` and `batch-point` modes — external executors (digital-twin) construct `RunArtifact` objects with both fields populated.
- `turn-loop` mode when caller passes them in `RunOptions` (stored verbatim, no semantic effect on the run).

Left `undefined` when:
- A legacy turn-loop run with no subject/intervention specified.
- Scenarios that don't fit the subject + intervention pattern (ecosystem-evolution sims, market simulations, etc. — they populate other fields).

---

## `RunOptions` additions

```typescript
export interface RunOptions {
  // ... existing 17 fields unchanged ...
  /**
   * Subject being simulated (digital-twin digital twin, game character, etc.).
   * Passed through verbatim to `RunArtifact.subject`. Turn-loop mode does not
   * consume this semantically; future batch-trajectory executor will.
   */
  subject?: SubjectConfig;
  /**
   * Intervention being tested on the subject. Passed through verbatim to
   * `RunArtifact.intervention`. Turn-loop ignores; batch modes consume.
   */
  intervention?: InterventionConfig;
}
```

Turn-loop orchestrator's call to `buildRunArtifact()` threads them through:

```typescript
const output: RunArtifact = buildRunArtifact({
  // ... existing fields ...
  subject: opts.subject,
  intervention: opts.intervention,
  // ... rest ...
});
```

`BuildArtifactInputs` gains the two optional fields; `buildRunArtifact()` assigns them onto the artifact. +4 LOC total in build-artifact.ts.

---

## Schema barrel export additions

Add to `src/engine/schema/index.ts`:

```typescript
// Added to Content primitives export block:
export {
  // ... existing ...
  SubjectSignalSchema,
  SubjectMarkerSchema,
  SubjectConfigSchema,
  InterventionConfigSchema,
} from './primitives.js';

// Added to type aliases export block:
export type {
  // ... existing ...
  SubjectSignal,
  SubjectMarker,
  SubjectConfig,
  InterventionConfig,
} from './types.js';
```

`types.ts` adds corresponding `z.infer<typeof X>` aliases.

---

## Adoption docs — digital-twin worked example

New file: `docs/adoption/digital-twin.md`. Shows the complete field-rename + validation + artifact construction flow using digital-twin's actual schema shapes from [schemas.py](../../../digital-twin/ai-agents/app/api/schemas.py):

### Input side — digital-twin request → paracosm inputs

```typescript
import {
  SubjectConfigSchema,
  InterventionConfigSchema,
  type SubjectConfig,
  type InterventionConfig,
} from 'paracosm/schema';

// Digital-twin's SimulationRequest -> paracosm SubjectConfig
function toSubject(req: Digital-twinSimulationRequest): SubjectConfig {
  return {
    id: req.user_id,
    name: req.profile?.name ?? 'unknown',
    profile: {
      age: req.profile?.age,
      gender: req.profile?.gender,
      weight: req.profile?.weight_value ?? req.profile?.weight,
      diet: req.profile?.diet_preferences,
      activityLevel: req.profile?.work_activity_type,
      allergies: req.profile?.allergies,
      supplements: req.profile?.current_supplements,
      goals: req.profile?.goals,
    },
    signals: (req.health_signals ?? []).map((s) => ({
      label: s.label,
      value: s.value,
      recordedAt: s.recorded_at ?? undefined,
    })),
    markers: (req.genome_signals ?? []).map((g) => ({
      id: g.rsid,
      category: 'genome',
      value: g.genotype ?? undefined,
      interpretation: g.interpretation ?? undefined,
      scenarioExtensions: g.gene ? { gene: g.gene } : undefined,
    })),
  };
}

// Digital-twin's internal ScenarioPlan -> paracosm InterventionConfig
function toIntervention(plan: Digital-twinScenarioPlan): InterventionConfig {
  return {
    id: `intv-${Date.now()}`,
    name: plan.intervention,
    description: plan.intervention,
    category: plan.primary_domains?.[0],
    targetBehaviors: plan.target_behaviors,
    adherenceProfile: {
      expected: 0.7, // heuristic default; digital-twin may want to derive from plan.adherence_risk
      risks: [plan.adherence_risk],
    },
  };
}

const subject = SubjectConfigSchema.parse(toSubject(req));
const intervention = InterventionConfigSchema.parse(toIntervention(plan));
```

### Output side — digital-twin SimulationResponse → RunArtifact

```typescript
import {
  RunArtifactSchema,
  type RunArtifact,
  type Timepoint,
  type SpecialistNote,
  type RiskFlag,
} from 'paracosm/schema';

function toArtifact(
  synthesis: Digital-twinSimulationSynthesis,
  analyses: Digital-twinDomainAnalysis[],
  subject: SubjectConfig,
  intervention: InterventionConfig,
  cost: { totalUSD: number; llmCalls: number },
): RunArtifact {
  const timepoints: Timepoint[] = synthesis.timepoints.map((t, idx) => ({
    time: idx,                   // relative index, or convert from labels
    label: t.label,
    narrative: t.body_description,
    score: {
      value: t.health_score,
      min: 0,
      max: 100,
      label: 'Health Score',
    },
    highlightMetrics: t.key_metrics.map((m) => ({
      label: m.label,
      value: m.value,
      direction: m.direction,
      color: m.color,
    })),
    confidence: t.confidence,
    reasoning: t.reasoning,
  }));

  const specialistNotes: SpecialistNote[] = analyses.map((a) => ({
    domain: a.domain,
    summary: a.summary,
    trajectory: a.trajectory,
    confidence: a.confidence,
    detail: {
      recommendedActions: a.leverage_points,
      openQuestions: a.missing_data,
    },
  }));

  const riskFlags: RiskFlag[] = synthesis.risk_flags.map((rf) => ({
    label: rf.label,
    severity: rf.severity,
    detail: rf.detail,
  }));

  return {
    metadata: {
      runId: `digital-twin-${subject.id}-${Date.now()}`,
      scenario: { id: 'digital-twin-digital-twin', name: 'Digital-twin Digital Twin' },
      mode: 'batch-trajectory',
      startedAt: new Date(Date.now() - 5000).toISOString(),
      completedAt: new Date().toISOString(),
    },
    subject,
    intervention,
    overview: synthesis.overview,
    assumptions: synthesis.assumptions,
    leveragePoints: synthesis.leverage_points,
    disclaimer: synthesis.disclaimer,
    trajectory: {
      timeUnit: { singular: 'week', plural: 'weeks' },
      timepoints,
    },
    specialistNotes,
    riskFlags,
    cost,
  };
}

const artifact = RunArtifactSchema.parse(toArtifact(synthesis, analyses, subject, intervention, cost));
return artifact; // ship over HTTP
```

### Python consumers

Digital-twin's Python stack generates types via:

```bash
datamodel-codegen \
  --input schema/subject-config.schema.json \
  --input schema/intervention-config.schema.json \
  --output src/paracosm_types.py \
  --output-model-type pydantic_v2.BaseModel
```

`npm run export:json-schema` already emits JSON Schemas for RunArtifact + StreamEvent; this spec's additions appear automatically on next regen. Digital-twin re-runs `datamodel-codegen` and their Pydantic types are in sync.

---

## Tests

### New test files

- `tests/engine/schema/subject-config.test.ts` — parsing valid/invalid SubjectConfig fixtures across shape variants:
  - Minimal (id + name only)
  - Full digital-twin shape (profile + signals + markers + personality + conditions)
  - Game shape (profile with inventory, markers with faction tags)
  - Rejects missing id / empty id / empty name
  - signal.value accepts both string and number
  - marker with only id (all other fields optional)

- `tests/engine/schema/intervention-config.test.ts` — similar coverage:
  - Minimal (id + name + description)
  - Full (all fields)
  - Rejects adherence expected outside [0, 1]
  - Accepts any numeric `duration.value` including negative (consumers may model retroactive / reverse-time windows); schema does not constrain it

### Extended tests

- `tests/engine/schema/digital-twin-compat.test.ts` — extend the existing fixture with `subject` + `intervention` populated. `RunArtifactSchema.parse()` succeeds. Confirms the full end-to-end round-trip.

- `tests/runtime/build-artifact.test.ts` — add test: `buildRunArtifact({ subject, intervention, mode: 'turn-loop', ... })` produces an artifact with both fields populated verbatim.

- `tests/runtime/orchestrator-passthrough.test.ts` (NEW if not existing) — verifies `runSimulation({ subject, intervention, scenario, maxTurns: 2, ... })` stashes both on the returned artifact. Mocks LLM calls to keep test fast.

### Removed tests

None. Fully additive; no legacy behavior changes.

---

## Acceptance criteria

1. `SubjectConfigSchema`, `InterventionConfigSchema`, and sub-schemas (`SubjectSignalSchema`, `SubjectMarkerSchema`) exported from `paracosm/schema`.
2. Inferred types (`SubjectConfig`, `InterventionConfig`, `SubjectSignal`, `SubjectMarker`) exported alongside.
3. `RunArtifactSchema` accepts optional `subject` + `intervention` without breaking any existing field parse.
4. `RunOptions` gains optional `subject` + `intervention`; `runSimulation()` threads them to the returned artifact.
5. `npm run export:json-schema` regenerates both the run-artifact and stream-event JSON Schema files; the run-artifact file contains `subject` + `intervention` property definitions.
6. Digital-twin's complete worked-example fixture (subject + intervention + artifact round-trip) passes in `digital-twin-compat.test.ts`.
7. Adoption doc published at `docs/adoption/digital-twin.md` with working TypeScript + Python code paths.
8. Full test suite green (`npm test` → 0 fails); typecheck clean on build + dashboard configs; build clean.
9. `package.json` version stays `0.6.0` for now; CI publishes as `0.6.<next_run_number>` additive release.
10. No existing test file requires rewriting for new field names — this is purely additive.

---

## Risks + mitigations

1. **Scope creep toward `execute batch-trajectory` pipeline.** The temptation is real: once subjects + interventions exist, the next natural step is "have paracosm run them through specialist fanout." Resist in this spec. Batch-trajectory executor gets its own spec + plan + implementation session; premature here.

2. **Over-constraining `profile` shape.** `Record<string, unknown>` is loose on purpose. If consumers ask for stronger typing, later specs can add domain-specific sub-schemas (`Digital-twinProfileSchema extends SubjectConfig.profile`) without breaking the universal primitive.

3. **`subject` + `intervention` drift from the rest of `RunArtifact`.** Since turn-loop mode ignores them semantically, an over-eager caller could pass a subject that doesn't match the scenario's actual state. Mitigation: document clearly that turn-loop passthrough is "store and return"; no cross-validation against world state. Consumers enforce their own consistency.

4. **Digital-twin's `gene` field lost.** The worked example puts `gene` under `marker.scenarioExtensions.gene`. Acceptable — `gene` is a derived annotation that could go through scenarioExtensions OR through a more structured annotation field in a future schema minor. Don't bake genome-specific assumptions into the universal primitive.

5. **JSON Schema export size growth.** Adding two primitives + their sub-schemas grows the exported JSON files. Unlikely to matter (~200 lines combined) but worth noting — consumers that hot-load the schema pay a slight parse cost.

---

## Out of scope (future specs)

- Batch-trajectory execution pipeline in `runSimulation()` (paracosm-side LLM fanout: planner → specialists → synthesis → timepoints). The biggest remaining architectural gap; deserves its own spec.
- `SubjectConfig.profile` domain-specific sub-schemas (digital-twin-specific profile validation, game-specific inventory validation). Can layer on later.
- Multi-subject / multi-intervention per run. Would need execution-model changes; separate concern.
- Subject persistence / CRUD API over HTTP. Ties into the server/persistence sub-project, not this one.
- HEXACO migration of `SubjectConfig.personality` (e.g., restricting `personality` to the HEXACO keyset when scenario declares it uses HEXACO). Can add via scenario-level schema constraint later.
- Dashboard UI components that visualize subject + intervention (digital-twin subject cards + intervention bars). Belongs in the viz-kit spec (direction C).

---

## Release

No version-minor bump. Ships as `0.6.<next_run_number>` additive via CI on next merge to master. npm consumers pinning `^0.6.0` or `^0.5.0` receive the new exports automatically — fully backward compatible.

CHANGELOG entry added under existing `## 0.6.0 (2026-04-22)` section as an `### Added` bullet group (not a new heading — same release family).
