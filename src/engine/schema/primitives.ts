/**
 * Universal primitive schemas for the paracosm run artifact + streaming
 * event envelope. Exported from `paracosm/schema`.
 *
 * Every primitive is defined as `*Schema` (Zod v4) with a type alias
 * derived via `z.infer<>` in [./types.ts](./types.ts). Consumers import
 * either the schema (for runtime validation) or the type (for TS-only
 * consumption) — both come from one source of truth.
 *
 * Design rules enforced by every schema below:
 *
 *  1. No fixed counts. No `.length(5)` hardcodes. Scenario declares shape.
 *  2. `scenarioExtensions?: Record<string, unknown>` on every primitive —
 *     escape hatch for domain-specific payloads (Mars `boneDensityPct`,
 *     digital-twin `genome_signals`, game `inventoryState`). Typed `unknown`
 *     so consumers narrow explicitly.
 *  3. Explicit bounds metadata on numerics (see {@link ScoreSchema}).
 *     Rejects digital-twin's hardcoded 0-100 health_score.
 *  4. Thin required core + optional thick detail. See
 *     {@link SpecialistNoteSchema} for the core/detail split.
 *  5. Visual hints (`color`, `icon`) are optional — data contract, not
 *     style sheet. Renderers override.
 *
 * @module paracosm/schema/primitives
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Escape-hatch bag for scenario-specific fields that don't belong on a
 * universal primitive (e.g., Mars radiation dose, digital-twin genome markers,
 * game inventory state). Universal consumers ignore it; scenario-aware
 * consumers narrow the `unknown` values explicitly.
 */
export const ScenarioExtensionsSchema = z.record(z.string(), z.unknown()).optional();

// ---------------------------------------------------------------------------
// 1. RunMetadata — identifying info for a single simulation run
// ---------------------------------------------------------------------------

/**
 * Simulation modes. Discriminator for {@link RunArtifactSchema}.
 *
 * - `turn-loop`: iterative, turn-by-turn, state carries forward. Paracosm's
 *   civ-sim shape. Always populates `trajectory.timepoints` + `decisions`.
 * - `batch-trajectory`: one-shot LLM synthesis emitting labeled timepoints
 *   in a single call. Digital-twin-style digital-twin shape. Populates
 *   `trajectory.timepoints` + `specialistNotes` + `riskFlags`.
 * - `batch-point`: one-shot summary without trajectory. Pure forecast or
 *   overview-only output. Populates `specialistNotes` + `riskFlags` only.
 */
export const SimulationModeSchema = z.enum(['turn-loop', 'batch-trajectory', 'batch-point']);

export const RunMetadataSchema = z.object({
  /** Unique identifier for this run. UUID, slug, or host-assigned id. */
  runId: z.string().min(1),
  scenario: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** Scenario version; not artifact version. Optional. */
    version: z.string().optional(),
  }),
  /** Absent for non-deterministic runs (digital-twin LLM-only synthesis). */
  seed: z.number().int().optional(),
  mode: SimulationModeSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  scenarioExtensions: ScenarioExtensionsSchema,
});

// ---------------------------------------------------------------------------
// 2. WorldSnapshot — state at a point in time
// ---------------------------------------------------------------------------

/**
 * Five-bag world state. Promotes the internal
 * [`WorldState`](../types.ts) declaration to public API. All bags optional
 * except `metrics` — a sim without any numeric metric is degenerate.
 */
export const WorldSnapshotSchema = z.object({
  /** Numeric gauges: food, power, population, morale, VO2max, whatever. */
  metrics: z.record(z.string(), z.number()),
  /** Capacity constraints: life support, housing, budget. */
  capacities: z.record(z.string(), z.number()).optional(),
  /** Categorical state: governance status, alignment, phase. */
  statuses: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
  /** Political/social pressures. Values may be numeric or categorical. */
  politics: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
  /** Environmental conditions: weather, radiation, depth, altitude. */
  environment: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
  scenarioExtensions: ScenarioExtensionsSchema,
});

// ---------------------------------------------------------------------------
// 3. Score — bounded numeric score with metadata
// ---------------------------------------------------------------------------

/**
 * Score with explicit bounds. Digital-twin's hardcoded `health_score: [0, 100]`
 * becomes `{ value: 72, min: 0, max: 100, label: 'Health Score' }`. A
 * kingdom-prosperity sim uses `{ value: -3, min: -10, max: 10, label: 'Realm Stability' }`.
 */
export const ScoreSchema = z.object({
  value: z.number(),
  min: z.number(),
  max: z.number(),
  label: z.string().min(1),
});

// ---------------------------------------------------------------------------
// 4. HighlightMetric — featured metric inside a Timepoint
// ---------------------------------------------------------------------------

/**
 * Featured metric card shown alongside a Timepoint. Value is a
 * pre-formatted string (the scenario decides units + precision); direction
 * + color are optional rendering hints.
 */
export const HighlightMetricSchema = z.object({
  label: z.string().min(1),
  /** Pre-formatted display string: `"48.2 ml/kg/min"`, `"72%"`, `"$1.2M"`. */
  value: z.string().min(1),
  direction: z.enum(['up', 'down', 'stable']).optional(),
  /** Hex color hint — renderers override. */
  color: z.string().optional(),
});

// ---------------------------------------------------------------------------
// 5. Timepoint — labeled rich snapshot
// ---------------------------------------------------------------------------

/**
 * Labeled snapshot with prose + score + highlight metrics. Works for
 * digital-twin's 5-timepoint forecast AND paracosm's per-turn snapshots.
 *
 * No hardcoded count of timepoints (digital-twin's `.length(5)` is dropped);
 * no hardcoded count of highlight metrics (digital-twin's `.length(3)` dropped);
 * no hardcoded score bounds.
 */
export const TimepointSchema = z.object({
  /** Scenario time-units. Post-F23 generic (not "year"). */
  time: z.number(),
  /** Display label: `"Now"`, `"2 Weeks"`, `"Turn 3"`, `"Year 2043"`. */
  label: z.string().min(1),
  /** Prose description. Replaces digital-twin's `body_description`. */
  narrative: z.string().optional(),
  score: ScoreSchema.optional(),
  highlightMetrics: z.array(HighlightMetricSchema).optional(),
  confidence: z.number().min(0).max(1).optional(),
  reasoning: z.string().optional(),
  worldSnapshot: WorldSnapshotSchema.optional(),
  scenarioExtensions: ScenarioExtensionsSchema,
});

// ---------------------------------------------------------------------------
// 6. TrajectoryPoint — lightweight metric sample
// ---------------------------------------------------------------------------

/**
 * Lightweight sibling of {@link TimepointSchema}. Metric samples without
 * prose — for sparklines, CSV export, chart axes.
 */
export const TrajectoryPointSchema = z.object({
  time: z.number(),
  metrics: z.record(z.string(), z.number()),
  scenarioExtensions: ScenarioExtensionsSchema,
});

// ---------------------------------------------------------------------------
// 7. Trajectory — ordered series container
// ---------------------------------------------------------------------------

/**
 * Series container. One or both of `points` / `timepoints` populated.
 * `timeUnit` drives axis labels + relative-time rendering.
 */
export const TrajectorySchema = z.object({
  timeUnit: z.object({
    singular: z.string().min(1),
    plural: z.string().min(1),
  }),
  /** Lightweight per-sample metric records; good for sparklines. */
  points: z.array(TrajectoryPointSchema).optional(),
  /** Rich labeled snapshots with narrative + score; good for timepoint cards. */
  timepoints: z.array(TimepointSchema).optional(),
});

// ---------------------------------------------------------------------------
// 8. Citation — evidence backing
// ---------------------------------------------------------------------------

/**
 * Re-uses the shape of
 * [runtime CitationSchema](../../runtime/schemas/department.ts) so
 * existing paracosm internal callers don't break.
 */
export const CitationSchema = z.object({
  text: z.string().min(1),
  url: z.string().min(1),
  doi: z.string().optional(),
  context: z.string().default(''),
});

// ---------------------------------------------------------------------------
// 9. SpecialistNote — domain analysis (thin core + optional thick detail)
// ---------------------------------------------------------------------------

/**
 * Optional thick detail for paracosm department-style rich reports. When
 * a scenario populates `SpecialistNote.detail`, consumers get the full
 * risks + opportunities + actions + citations drill-down. Digital-twin-style
 * thin specialist notes leave it undefined.
 */
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
});

export const SpecialistNoteSchema = z.object({
  /** Domain name: `"sleep"`, `"medical"`, `"engineering"`, `"governance"`. */
  domain: z.string().min(1),
  summary: z.string().min(1),
  trajectory: z.enum(['positive', 'mixed', 'negative', 'neutral']).optional(),
  confidence: z.number().min(0).max(1).optional(),
  detail: SpecialistDetailSchema.optional(),
  scenarioExtensions: ScenarioExtensionsSchema,
});

// ---------------------------------------------------------------------------
// 10. RiskFlag — callout with severity
// ---------------------------------------------------------------------------

/**
 * Field-for-field compat with digital-twin's `SimulationRiskFlag`.
 */
export const RiskFlagSchema = z.object({
  label: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high']),
  detail: z.string().min(1),
  scenarioExtensions: ScenarioExtensionsSchema,
});

// ---------------------------------------------------------------------------
// 11. Decision — a chosen action (commander decision, intervention, policy)
// ---------------------------------------------------------------------------

/**
 * Outcome classification for a decision. Paracosm-native values; a
 * scenario that doesn't map onto risk/conservative semantics leaves this
 * undefined.
 */
export const DecisionOutcomeSchema = z.enum([
  'risky_success',
  'risky_failure',
  'conservative_success',
  'conservative_failure',
]);

export const DecisionSchema = z.object({
  /** When the decision was made. Scenario time-units. */
  time: z.number(),
  /** Who decided. `"Captain Reyes"` / `"system"` / `"protocol-alpha"`. */
  actor: z.string().optional(),
  /** The chosen option (short form). */
  choice: z.string().min(1),
  /** Compressed justification (one paragraph). */
  rationale: z.string().optional(),
  /** Full CoT reasoning. Paracosm populates; batch modes usually omit. */
  reasoning: z.string().optional(),
  outcome: DecisionOutcomeSchema.optional(),
  scenarioExtensions: ScenarioExtensionsSchema,
});

// ---------------------------------------------------------------------------
// Subject (input primitive): who/what is being simulated
// ---------------------------------------------------------------------------

/**
 * One time-stamped observation about a subject. Biometric, telemetry,
 * sensor reading, or any other recorded measurement.
 */
export const SubjectSignalSchema = z.object({
  label: z.string().min(1),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  recordedAt: z.string().datetime().optional(),
});

/**
 * One categorical marker about a subject. Genome rsIDs, clinical flags,
 * classification tags, faction affiliations — anything discrete + labeled.
 */
export const SubjectMarkerSchema = z.object({
  id: z.string().min(1),
  category: z.string().optional(),
  value: z.string().optional(),
  interpretation: z.string().optional(),
});

/**
 * Identity + context for the subject of a simulation. Domain-agnostic:
 * digital-twin = person (profile + genome + biometrics); game = character
 * (traits + inventory); ecology = organism; fleet ops = vessel.
 *
 * `profile` is a free-form `Record<string, unknown>` — consumers narrow
 * to a scenario-specific sub-schema when they need stronger typing.
 */
export const SubjectConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  profile: z.record(z.string(), z.unknown()).optional(),
  signals: z.array(SubjectSignalSchema).optional(),
  markers: z.array(SubjectMarkerSchema).optional(),
  personality: z.record(z.string(), z.number()).optional(),
  conditions: z.array(z.string()).optional(),
  scenarioExtensions: ScenarioExtensionsSchema,
});

// ---------------------------------------------------------------------------
// Intervention (input primitive): what's being tested on the subject
// ---------------------------------------------------------------------------

/**
 * Counterfactual being tested. Digital-twin = a health protocol; game =
 * strategic choice; policy sim = policy; clinical trial = treatment arm.
 *
 * `duration.unit` is not constrained to the scenario's time-unit —
 * interventions may span multiple scenario time-units or be measured in
 * different units than the simulation itself ticks on.
 */
export const InterventionConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.string().optional(),
  mechanism: z.string().optional(),
  targetBehaviors: z.array(z.string()).optional(),
  duration: z.object({
    value: z.number(),
    unit: z.string().min(1),
  }).optional(),
  adherenceProfile: z.object({
    expected: z.number().min(0).max(1),
    risks: z.array(z.string()).optional(),
  }).optional(),
  scenarioExtensions: ScenarioExtensionsSchema,
});

// ---------------------------------------------------------------------------
// Operational schemas (live on the artifact, not simulation content)
// ---------------------------------------------------------------------------

/**
 * Cost breakdown for a single run. Optional because non-LLM simulations
 * (pure mechanistic models) don't track LLM cost.
 */
export const CostSchema = z.object({
  totalUSD: z.number().min(0),
  llmCalls: z.number().int().min(0).optional(),
  inputTokens: z.number().int().min(0).optional(),
  outputTokens: z.number().int().min(0).optional(),
  cachedReadTokens: z.number().int().min(0).optional(),
  cacheSavingsUSD: z.number().min(0).optional(),
  /** Per-site / per-model breakdown: `{ director: 0.12, departments: 0.34 }`. */
  breakdown: z.record(z.string(), z.number()).optional(),
});

/**
 * Classified provider error on terminal failure. Matches
 * [runtime provider-errors.ts](../../runtime/provider-errors.ts).
 */
export const ProviderErrorSchema = z.object({
  kind: z.enum(['auth', 'quota', 'rate_limit', 'network', 'unknown']),
  provider: z.string().min(1),
  message: z.string(),
  actionUrl: z.string().url().optional(),
});
