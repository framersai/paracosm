# Universal JSON Schema (`paracosm/schema` subpath)

**Status:** design, awaiting execution
**Date:** 2026-04-22
**Scope:** new public subpath export `paracosm/schema` defining the universal per-run artifact + streaming event envelope that external consumers (digital-twin clones, games, custom dashboards) build against. Zod-first, schema-versionless, one breaking release bundled with F23 as **0.6.0**.
**Out of scope:** simulation-mode abstraction (future P-slot), `SubjectConfig` / `InterventionConfig` input primitives (future P4/P5), dashboard viz-kit componentization, quickstart gallery additions, agentos integration audit. Each of those gets its own spec downstream of this one.

---

## Motivation

Paracosm's run artifact is an anonymous inline object returned by `runSimulation()` in [orchestrator.ts:1827-1878](../../src/runtime/orchestrator.ts#L1827-L1878). There is no named `RunArtifact` type, no exported schema, and no stable contract for consumers. The dashboard reads the shape via close coupling to orchestrator internals; the save-file format is the same inline shape JSON-serialized; digital-twin's `SimulationResponse` ([schemas.py:70-77](../../../digital-twin/ai-agents/app/api/schemas.py)) is an entirely different Pydantic shape that happens to overlap conceptually.

External consumers (digital-twin would-be adopters, game engines, partner dashboards) can't build against paracosm's output because there's nothing to build against — the fields float, migrations aren't possible, and Mars-heritage vocabulary leaks through every level.

This spec ships the universal contract: one Zod-first schema, both for the per-run artifact and for the streaming SSE event envelope, under a new subpath export. Digital-twin's `SimulationResponse` collapses into it by field rename. Paracosm's orchestrator return type becomes `Promise<RunArtifact>`. Games and custom dashboards consume `paracosm/schema` alone (no runtime dep).

---

## Architecture

### Subpath + package layout

New subpath: **`paracosm/schema`**. Matches existing convention (`paracosm/mars`, `paracosm/runtime`, `paracosm/compiler`).

```
src/engine/schema/
├── index.ts               # barrel, re-exports everything
├── primitives.ts          # Zod schemas for 11 shared primitives
├── artifact.ts            # RunArtifactSchema (top-level)
├── stream.ts              # StreamEventSchema (discriminated union)
├── scenario-extensions.ts # Record<string, unknown> helpers
└── types.ts               # z.infer<> type aliases for TS consumers
```

Added to [`package.json:exports`](../../package.json):

```json
"./schema": {
  "import": "./dist/engine/schema/index.js",
  "types": "./dist/engine/schema/index.d.ts"
}
```

### Zod-first, Zod v4

Paracosm's dep is `zod@^4.3.6`. Every primitive is defined as `*Schema` (Zod) with a type alias derived via `z.infer<>`. Consumers who want runtime validation call `.parse()` / `.safeParse()`; consumers who want zero runtime cost use `import type` and get type safety via inference. Single source of truth — no hand-written interface drift.

Public type names **drop the `Z` suffix** (consumer ergonomics). Internal schemas under `src/runtime/schemas/` keep the `*Z` convention (unchanged).

### JSON Schema export for non-TS consumers

New devDependency: `zod-to-json-schema`. New npm script:

```json
"export:json-schema": "tsx scripts/export-json-schema.ts"
```

Emits `schema/run-artifact.schema.json` + `schema/stream-event.schema.json` to the package root at build time. Digital-twin (Python) generates Pydantic via `datamodel-codegen`. Any language with a JSON-Schema code generator adopts cleanly.

### Release model

Bundled with **F23 (time-units rename)** as one combined **0.6.0** release. Rationale: F23 already renames `year → time`; this spec consumes that rename inside Timepoint / TrajectoryPoint / RunMetadata. Shipping them together is one breaking event for consumers instead of two. Subject line for the merge commit: `feat!: 0.6.0 — time-units rename + universal schema`.

- `package.json`: `0.5.x` → `0.6.0`. CI publishes `0.6.<run_number>`.
- No `schemaVersion` field on `RunArtifact`. No migration machinery baked into the schema. Paracosm is pre-1.0; npm caret ranges protect pinned consumers.
- Dashboard save-file migration (the v2 → v3 hop) lives in [hooks/schemaMigration.ts](../../src/cli/dashboard/src/hooks/schemaMigration.ts) — already designed for F23. This spec extends it with a one-pass rewrite from the legacy inline shape to `RunArtifact`. After migration, the dashboard always holds `RunArtifact` state; legacy only exists on first load of pre-0.6.0 files.

---

## Universal primitives

Eleven primitives exported from `paracosm/schema`. Every primitive carries `scenarioExtensions?: Record<string, unknown>` for domain-specific payloads (Mars `boneDensityPct`, digital-twin `genome_signals`, game `inventoryState`). No primitive hard-codes counts, bounds-without-metadata, or style hints.

### 1. `RunMetadata`

```typescript
export const RunMetadataSchema = z.object({
  runId: z.string().min(1),
  scenario: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().optional(),
  }),
  seed: z.number().int().optional(),          // absent for non-deterministic (digital-twin) runs
  mode: z.enum(['turn-loop', 'batch-trajectory', 'batch-point']),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  scenarioExtensions: z.record(z.string(), z.unknown()).optional(),
});
```

### 2. `WorldSnapshot`

Promotes the already-declared [`WorldState`](../../src/engine/types.ts#L89) from internal-only to public. The 5-bag structure (`metrics` / `capacities` / `statuses` / `politics` / `environment`) stays; schema validates shape.

```typescript
export const WorldSnapshotSchema = z.object({
  metrics: z.record(z.string(), z.number()),
  capacities: z.record(z.string(), z.number()).optional(),
  statuses: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
  politics: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
  environment: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
  scenarioExtensions: z.record(z.string(), z.unknown()).optional(),
});
```

### 3. `Score`

```typescript
export const ScoreSchema = z.object({
  value: z.number(),
  min: z.number(),
  max: z.number(),
  label: z.string().min(1),                    // "Health Score", "Prosperity Index", "Realm Stability"
});
```

Bounds are explicit per scenario (digital-twin uses 0-100; a kingdom sim might use -10 to +10). Rejects the digital-twin hardcode.

### 4. `HighlightMetric`

```typescript
export const HighlightMetricSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),                    // pre-formatted string: "48.2 ml/kg/min", "72%"
  direction: z.enum(['up', 'down', 'stable']).optional(),
  color: z.string().optional(),                // hex hint; renderers override
});
```

### 5. `Timepoint`

Labeled rich snapshot. Works for digital-twin's 5-timepoint forecast **and** for paracosm's per-turn snapshots.

```typescript
export const TimepointSchema = z.object({
  time: z.number(),                            // scenario time-units (post-F23: generic)
  label: z.string().min(1),                    // "Now", "2 Weeks", "Turn 3", "Year 2043"
  narrative: z.string().optional(),            // prose — replaces digital-twin's body_description
  score: ScoreSchema.optional(),
  highlightMetrics: z.array(HighlightMetricSchema).optional(),
  confidence: z.number().min(0).max(1).optional(),
  reasoning: z.string().optional(),
  worldSnapshot: WorldSnapshotSchema.optional(),
  scenarioExtensions: z.record(z.string(), z.unknown()).optional(),
});
```

No `.length(5)` constraint. No fixed `highlightMetrics` count. Scenario decides.

### 6. `TrajectoryPoint`

Lightweight sibling. Metric samples without prose — for sparklines, chart axes, CSV export.

```typescript
export const TrajectoryPointSchema = z.object({
  time: z.number(),
  metrics: z.record(z.string(), z.number()),
  scenarioExtensions: z.record(z.string(), z.unknown()).optional(),
});
```

### 7. `Trajectory`

Series container. One or both of `points` / `timepoints` populated.

```typescript
export const TrajectorySchema = z.object({
  timeUnit: z.object({
    singular: z.string().min(1),               // "year", "day", "turn", "week"
    plural: z.string().min(1),                 // "years", "days", "turns", "weeks"
  }),
  points: z.array(TrajectoryPointSchema).optional(),
  timepoints: z.array(TimepointSchema).optional(),
});
```

### 8. `Citation`

Already defined in [runtime/schemas/department.ts:13](../../src/runtime/schemas/department.ts#L13). Re-export from `paracosm/schema`; keep shape identical so existing consumers don't break.

```typescript
export const CitationSchema = z.object({
  text: z.string().min(1),
  url: z.string().min(1),
  doi: z.string().optional(),
  context: z.string().default(''),
});
```

### 9. `SpecialistNote`

Thin required core + optional thick `detail`. Digital-twin-style specialists leave `detail` undefined; paracosm departments populate it with the existing [DepartmentReportSchema](../../src/runtime/schemas/department.ts#L62) shape.

```typescript
export const SpecialistDetailSchema = z.object({
  risks: z.array(z.object({
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    description: z.string().min(1),
  })).optional(),
  opportunities: z.array(z.object({
    impact: z.enum(['low', 'medium', 'high']),
    description: z.string().min(1),
  })).optional(),
  recommendedActions: z.array(z.string()).optional(),
  citations: z.array(CitationSchema).optional(),
  openQuestions: z.array(z.string()).optional(),
}).optional();

export const SpecialistNoteSchema = z.object({
  domain: z.string().min(1),                   // "sleep", "medical", "engineering"
  summary: z.string().min(1),
  trajectory: z.enum(['positive', 'mixed', 'negative', 'neutral']).optional(),
  confidence: z.number().min(0).max(1).optional(),
  detail: SpecialistDetailSchema,
  scenarioExtensions: z.record(z.string(), z.unknown()).optional(),
});
```

### 10. `RiskFlag`

Field-for-field compat with digital-twin's `SimulationRiskFlag`. No changes.

```typescript
export const RiskFlagSchema = z.object({
  label: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high']),
  detail: z.string().min(1),
  scenarioExtensions: z.record(z.string(), z.unknown()).optional(),
});
```

### 11. `Decision`

Unifies commander decisions (civ-sim) and intervention selections (digital-twin).

```typescript
export const DecisionSchema = z.object({
  time: z.number(),
  actor: z.string().optional(),                // "Captain Reyes" | "system" | "protocol-alpha"
  choice: z.string().min(1),
  rationale: z.string().optional(),
  reasoning: z.string().optional(),            // full CoT (paracosm parity)
  outcome: z.enum([
    'risky_success', 'risky_failure',
    'conservative_success', 'conservative_failure',
  ]).optional(),
  scenarioExtensions: z.record(z.string(), z.unknown()).optional(),
});
```

### Operational (not content primitives, but live on the artifact)

```typescript
export const CostSchema = z.object({
  totalUSD: z.number().min(0),
  llmCalls: z.number().int().min(0).optional(),
  inputTokens: z.number().int().min(0).optional(),
  outputTokens: z.number().int().min(0).optional(),
  cachedReadTokens: z.number().int().min(0).optional(),
  cacheSavingsUSD: z.number().min(0).optional(),
  breakdown: z.record(z.string(), z.number()).optional(),
});

export const ProviderErrorSchema = z.object({
  kind: z.enum(['auth', 'quota', 'rate_limit', 'network', 'unknown']),
  provider: z.string().min(1),
  message: z.string(),
  actionUrl: z.string().url().optional(),
});
```

---

## `RunArtifact` — top-level shape

```typescript
export const RunArtifactSchema = z.object({
  metadata: RunMetadataSchema,

  // Narrative layer — mode-agnostic
  overview: z.string().optional(),              // digital-twin's `overview`; paracosm's verdict.summary maps here
  assumptions: z.array(z.string()).optional(),
  leveragePoints: z.array(z.string()).optional(),
  disclaimer: z.string().optional(),            // scenario-supplied (digital-twin)

  // Trajectory — core output
  trajectory: TrajectorySchema.optional(),

  // Content primitives
  specialistNotes: z.array(SpecialistNoteSchema).optional(),
  riskFlags: z.array(RiskFlagSchema).optional(),
  decisions: z.array(DecisionSchema).optional(),

  // Final state
  finalState: WorldSnapshotSchema.optional(),
  fingerprint: z.record(z.string(), z.union([z.number(), z.string()])).optional(),

  // Catalogs (deduped at end of run; paracosm heritage)
  citations: z.array(CitationSchema).optional(),
  forgedTools: z.array(z.object({
    name: z.string(),
    department: z.string().optional(),
    description: z.string().optional(),
    approved: z.boolean(),
    confidence: z.number().min(0).max(1).optional(),
  })).optional(),

  // Operational
  cost: CostSchema.optional(),
  providerError: ProviderErrorSchema.nullable().optional(),
  aborted: z.boolean().optional(),

  // Scenario-specific overflow
  scenarioExtensions: z.record(z.string(), z.unknown()).optional(),
});
```

### Per-mode field matrix

Consumers switch on `metadata.mode`. The matrix below documents which fields are populated for each mode. Tests enforce the contract.

| Field | `turn-loop` | `batch-trajectory` | `batch-point` |
|---|---|---|---|
| `metadata.*` | populated | populated | populated |
| `overview` | optional (from verdict) | populated | populated |
| `assumptions` | optional | populated | populated |
| `leveragePoints` | optional | populated | populated |
| `disclaimer` | optional | populated | optional |
| `trajectory.points` | populated (per-turn samples) | optional | — |
| `trajectory.timepoints` | populated (per-turn rich snapshots) | populated | — |
| `specialistNotes` | populated (one per department-turn) | populated | optional |
| `riskFlags` | optional | populated | populated |
| `decisions` | populated (one per commander decision; `maxEventsPerTurn` may produce >1 per turn) | optional | — |
| `finalState` | populated | optional | — |
| `fingerprint` | populated | optional | — |
| `citations` | populated | optional | optional |
| `forgedTools` | populated | — | — |
| `cost` | populated | populated | populated |
| `providerError` / `aborted` | populated | populated | populated |

A batch-trajectory mode (digital-twin's shape) populates: metadata, overview, assumptions, leveragePoints, disclaimer, trajectory.timepoints, specialistNotes, riskFlags, cost. Maps 1:1 to digital-twin's current response.

A batch-point mode populates: metadata, overview, assumptions, leveragePoints, disclaimer, specialistNotes, riskFlags, cost. No trajectory, no finalState.

A turn-loop mode (paracosm today) populates everything listed except `disclaimer`, mapping 1:1 to today's anonymous return shape.

---

## `StreamEvent` — SSE envelope

Currently paracosm emits 17 event types via [`SimEventPayloadMap`](../../src/runtime/orchestrator.ts#L97-L209). This spec formalizes them as one discriminated union. No event type is removed; three are renamed for consistency; field shapes are normalized but semantics stay identical.

### Event type map (rename column applies; none removed)

| Current | New | Reason |
|---|---|---|
| `turn_start` | `turn_start` | unchanged |
| `event_start` | `event_start` | unchanged |
| `dept_start` | `specialist_start` | rename (match `SpecialistNote` primitive) |
| `dept_done` | `specialist_done` | rename |
| `forge_attempt` | `forge_attempt` | unchanged |
| `commander_deciding` | `decision_pending` | rename (works for non-commander actors) |
| `commander_decided` | `decision_made` | rename |
| `outcome` | `outcome` | unchanged |
| `drift` | `personality_drift` | rename (clarity) |
| `agent_reactions` | `agent_reactions` | unchanged |
| `bulletin` | `bulletin` | unchanged |
| `turn_done` | `turn_done` | unchanged |
| `promotion` | `promotion` | unchanged |
| `systems_snapshot` | `systems_snapshot` | unchanged (post-P1) |
| `provider_error` | `provider_error` | unchanged |
| `validation_fallback` | `validation_fallback` | unchanged |
| `sim_aborted` | `sim_aborted` | unchanged |

### Schema

```typescript
export const StreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('turn_start'),         leader: z.string(), turn: z.number().optional(), time: z.number().optional(), data: TurnStartDataSchema }),
  z.object({ type: z.literal('event_start'),        leader: z.string(), turn: z.number().optional(), time: z.number().optional(), data: EventStartDataSchema }),
  z.object({ type: z.literal('specialist_start'),   leader: z.string(), turn: z.number().optional(), time: z.number().optional(), data: SpecialistStartDataSchema }),
  z.object({ type: z.literal('specialist_done'),    leader: z.string(), turn: z.number().optional(), time: z.number().optional(), data: SpecialistDoneDataSchema }),
  z.object({ type: z.literal('forge_attempt'),      leader: z.string(), turn: z.number().optional(), time: z.number().optional(), data: ForgeAttemptDataSchema }),
  z.object({ type: z.literal('decision_pending'),   leader: z.string(), turn: z.number().optional(), time: z.number().optional(), data: DecisionPendingDataSchema }),
  z.object({ type: z.literal('decision_made'),      leader: z.string(), turn: z.number().optional(), time: z.number().optional(), data: DecisionMadeDataSchema }),
  z.object({ type: z.literal('outcome'),            leader: z.string(), turn: z.number().optional(), time: z.number().optional(), data: OutcomeDataSchema }),
  z.object({ type: z.literal('personality_drift'),  leader: z.string(), turn: z.number().optional(), time: z.number().optional(), data: PersonalityDriftDataSchema }),
  z.object({ type: z.literal('agent_reactions'),    leader: z.string(), turn: z.number().optional(), time: z.number().optional(), data: AgentReactionsDataSchema }),
  z.object({ type: z.literal('bulletin'),           leader: z.string(), turn: z.number().optional(), time: z.number().optional(), data: BulletinDataSchema }),
  z.object({ type: z.literal('turn_done'),          leader: z.string(), turn: z.number().optional(), time: z.number().optional(), data: TurnDoneDataSchema }),
  z.object({ type: z.literal('promotion'),          leader: z.string(), turn: z.number().optional(), time: z.number().optional(), data: PromotionDataSchema }),
  z.object({ type: z.literal('systems_snapshot'),   leader: z.string(), turn: z.number().optional(), time: z.number().optional(), data: SystemsSnapshotDataSchema }),
  z.object({ type: z.literal('provider_error'),     leader: z.string(), turn: z.number().optional(), time: z.number().optional(), data: ProviderErrorDataSchema }),
  z.object({ type: z.literal('validation_fallback'),leader: z.string(), turn: z.number().optional(), time: z.number().optional(), data: ValidationFallbackDataSchema }),
  z.object({ type: z.literal('sim_aborted'),        leader: z.string(), turn: z.number().optional(), time: z.number().optional(), data: SimAbortedDataSchema }),
]);
```

Each `*DataSchema` is a Zod variant of the corresponding payload in [`SimEventPayloadMap`](../../src/runtime/orchestrator.ts#L97-L209), with field-level renames applied (systemDeltas stays; year → time per F23).

### `_cost` field

The current runtime spreads a `_cost` book-keeping payload onto every event for the live-cost counter. This stays as an additive optional field on every variant via schema extension, not a separate event type. Consumers that don't track live cost ignore it.

---

## Migration path

### Paracosm internal

1. **Create `src/engine/schema/`** — the 11 primitives + artifact + stream schemas.
2. **Name the orchestrator return type.** Current inline type → `Promise<RunArtifact>`. Export `RunArtifact` from both `paracosm/schema` and `paracosm/runtime`.
3. **Rewrite the orchestrator return construction** ([orchestrator.ts:1827-1878](../../src/runtime/orchestrator.ts#L1827-L1878)) to populate `RunArtifact` fields. Existing internal field names (`turnArtifacts`, `directorEvents`, `commanderDecisions`, `forgedToolbox`, `citationCatalog`, `agentReactions`) get rebucketed:
   - `turnArtifacts[]` → `trajectory.timepoints[]` (each with `worldSnapshot`, `specialistNotes`, `decisions`)
   - `directorEvents[]` — drop from artifact; lives in stream only
   - `commanderDecisions[]` → `decisions[]` (flat list across turns)
   - `forgedToolbox[]` → `forgedTools[]`
   - `citationCatalog[]` → `citations[]`
   - `agentReactions[]` → `scenarioExtensions.reactions` (narrative-mode primitive; not universal)
4. **Rewrite SSE emission.** Each current `sse.emit(type, data)` call runs through `StreamEventSchema.parse()` in dev mode + raw serialize in prod. Wraps in a helper so the dev-mode validation is one line.
5. **Dashboard consumption.** [useGameState.ts](../../src/cli/dashboard/src/hooks/useGameState.ts), [useSSE.ts](../../src/cli/dashboard/src/hooks/useSSE.ts), [useGamePersistence.ts](../../src/cli/dashboard/src/hooks/useGamePersistence.ts) all switch to reading `RunArtifact` shape. Reducer field-rename matches the internal rebucketing above.
6. **Dashboard save-file migration.** Extend [schemaMigration.ts](../../src/cli/dashboard/src/hooks/schemaMigration.ts)'s migration chain: v2 → v3 covers F23's time-units rename AND the artifact reshape (trajectory, specialistNotes, decisions, etc.). `CURRENT_SCHEMA_VERSION` 2 → 3.
7. **Compile schema bust.** [cache.ts](../../src/engine/compiler/cache.ts)'s `COMPILE_SCHEMA_VERSION` 3 → 4 (combined with F23's bump). One-time $0.10 recompile per user cached scenario.

### External consumers

**Digital-twin adoption (illustrative, not part of this release):**

Digital-twin's `SimulationResponse` renames field-for-field:
- `overview` → `overview` (same)
- `timepoints` → `trajectory.timepoints`
- `assumptions` → `assumptions` (same)
- `leverage_points` → `leveragePoints`
- `risk_flags` → `riskFlags` (field rename in array items: `label`/`severity`/`detail` stay identical)
- `specialist_notes` → `specialistNotes` (field rename in array items: `domain`/`summary`/`trajectory`/`confidence` stay identical)
- `disclaimer` → `disclaimer` (same)

Per-timepoint rename in digital-twin:
- `label`/`health_score`/`body_description`/`key_metrics`/`confidence`/`reasoning` → `label`/`score`/`narrative`/`highlightMetrics`/`confidence`/`reasoning`
- `health_score: int(0, 100)` → `score: { value, min: 0, max: 100, label: 'Health Score' }`
- `body_description: str` → `narrative: str`

Digital-twin's Python consumers generate Pydantic from `schema/run-artifact.schema.json` via `datamodel-codegen`.

**Mars-specific extensions preserved:** `boneDensityPct`, `cumulativeRadiationMsv`, `foodMonthsReserve`, `pressurizedVolumeM3` etc. all live in `WorldSnapshot.metrics` / `WorldSnapshot.capacities` (already declared in Mars scenario JSON). No universal-schema field knows about them — they flow through the generic record types.

---

## Testing plan

### New test files

- `tests/engine/schema/primitives.test.ts` — each primitive Zod-parses its valid canonical shape, rejects common malformed inputs, respects `scenarioExtensions` opacity.
- `tests/engine/schema/run-artifact.test.ts` — per-mode matrix enforcement: `mode === 'turn-loop'` artifact has `trajectory.timepoints` populated + `decisions[]` non-empty; `mode === 'batch-point'` artifact has no `trajectory` field.
- `tests/engine/schema/stream-event.test.ts` — every `StreamEventSchema` variant parses; unknown `type` rejected by discriminated union.
- `tests/engine/schema/digital-twin-compat.test.ts` — fixture: a field-renamed copy of digital-twin's `SimulationResponse`; `RunArtifactSchema.parse()` accepts it as `mode: 'batch-trajectory'`.
- `tests/runtime/migrate-v2-to-v3-artifact.test.ts` — load a scrubbed pre-0.6.0 save file; migration chain produces a valid `RunArtifact`; no console errors when reducer consumes it.

### Existing tests affected

- [tests/engine/core/golden-run.test.ts](../../tests/engine/core/golden-run.test.ts) — snapshot regenerated with new artifact shape.
- Dashboard test files that assert on `state.systems` / `directorEvents` / `turnArtifacts` — rename-in-place (~20 files).
- [cache-version-bust.test.ts](../../tests/engine/compiler/cache-version-bust.test.ts) — extend for v3 → v4 bump.

### Real-LLM smoke (~$0.30)

- `bun src/index.ts` against landing-page quickstart:
  - `result.metadata.mode === 'turn-loop'`
  - `RunArtifactSchema.parse(result)` succeeds
  - `result.trajectory.timepoints.length >= maxTurns` (paracosm emits at least one snapshot per turn; `maxEventsPerTurn` may produce more)
  - `result.decisions.length > 0` and every entry has `time`, `choice`, `actor`
  - `.paracosm/cache/` regenerates at v4 on first run

### Legacy-data load

- Load `tests/fixtures/legacy-0.5-run.json` through the dashboard file-load path. Migration chain produces valid `RunArtifact`. All tabs render, no console errors.

### JSON Schema export

- `npm run export:json-schema` emits two files; both pass `ajv validate` against an example artifact.

### Build + type-check gates

- `npm run build` passes after every phase.
- Dashboard typecheck clean.
- Full dashboard test suite (~215 tests) passes.

---

## Acceptance criteria

1. `paracosm/schema` subpath exports `RunArtifactSchema`, `StreamEventSchema`, all 11 primitive schemas + inferred types.
2. `runSimulation()`'s return type is `Promise<RunArtifact>` (no inline anonymous object).
3. Every SSE event emitted by the orchestrator validates against `StreamEventSchema` in dev mode.
4. `RunArtifactSchema.parse(artifact)` succeeds on: (a) a live turn-loop Mars run, (b) a hand-authored digital-twin-shape batch-trajectory fixture, (c) a minimal batch-point fixture.
5. `schema/run-artifact.schema.json` + `schema/stream-event.schema.json` generated, committed, published with the npm package.
6. Dashboard loads a pre-0.6.0 legacy save file via migration without console errors.
7. `.paracosm/cache/` regenerates at `COMPILE_SCHEMA_VERSION: 4` on first post-upgrade compile.
8. `package.json` version at `0.6.0`; CI publishes `0.6.<run_number>` as a single breaking release.
9. README + ARCHITECTURE.md reflect the new schema + subpath; quickstart snippet updated to reference `import { RunArtifactSchema } from 'paracosm/schema'`.
10. Full test suite + typecheck + build green.

---

## Risks

1. **Blast radius.** Touches ~40 files across engine/runtime/dashboard/tests. Mitigated by bundling with F23 (already plans a comparable sweep) and landing as one commit with exhaustive `tsc --noEmit` chase.
2. **Dashboard save-file migration correctness.** The v2→v3 migration handles both F23's time rename AND the artifact reshape; bugs in the chain produce silent-broken legacy loads. Mitigated by the `legacy-0.5-run.json` fixture + end-to-end dashboard test.
3. **External consumers with scripts against the current anonymous shape.** Anyone who wrote `result.turnArtifacts[0].departmentReports[0]` breaks. Release notes flag the field-rename table; npm `^0.5.x` caret protects pinned consumers.
4. **Zod 4 discriminated-union syntax.** Zod 4 moved the options arg shape vs 3. Verified before coding; no copy-paste from Zod 3 examples.
5. **`scenarioExtensions` escape-hatch discipline.** If scenarios start dumping everything into extensions, the universal shape becomes meaningless. Mitigated by docs: inclusion criterion for a universal primitive = "non-trivially reusable across ≥2 simulation domains."

---

## Out of scope (future specs)

- **P2 — multi-agent peer mode.** The universal schema supports multiple leaders via multiple `decisions[]` entries with different `actor` values, but full peer-mode semantics (shared state, cross-leader events) is a separate spec.
- **P4 — agent adapter interface.** `SubjectConfig` primitive for genome/biometric/condition inputs. The universal schema's `scenarioExtensions` handles digital-twin subjects today; formalizing them is the next step.
- **P5 — intervention framework.** `InterventionConfig` primitive for counterfactual protocols. Today a "leader" models the thing-being-tested; a future `InterventionConfig` splits subject (the person) from protocol (the intervention being tested on them).
- **Dashboard viz kit.** `<TimepointCard>`, `<TrajectoryStrip>`, `<RiskFlagList>` as composable primitives. Depends on this spec; gets its own.
- **Quickstart gallery expansion.** Digital-twin-clone, longevity sim, biometric projection quickstarts. Depend on the schema being stable + digital-twin adoption POC.
- **AgentOS integration audit.** HEXACO-optional leaders, emergent-forging default-off for lightweight sims, per-subject memory scope. Cross-cuts the work above; surfaces issues during implementation rather than upfront.
