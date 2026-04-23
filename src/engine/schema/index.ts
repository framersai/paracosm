/**
 * Paracosm Universal Schema — public contract for run artifacts + stream events.
 *
 * One import surface, two consumption flavors:
 *
 * ```ts
 * // Runtime-validating consumers:
 * import { RunArtifactSchema, StreamEventSchema } from 'paracosm/schema';
 * const artifact = RunArtifactSchema.parse(json);
 *
 * // Type-only consumers:
 * import type { RunArtifact, StreamEvent, Timepoint } from 'paracosm/schema';
 * ```
 *
 * @module paracosm/schema
 */

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

export {
  // Shared helpers
  ScenarioExtensionsSchema,
  // Enums
  SimulationModeSchema,
  DecisionOutcomeSchema,
  // Content primitives
  RunMetadataSchema,
  WorldSnapshotSchema,
  ScoreSchema,
  HighlightMetricSchema,
  TimepointSchema,
  TrajectoryPointSchema,
  TrajectorySchema,
  CitationSchema,
  SpecialistDetailSchema,
  SpecialistNoteSchema,
  RiskFlagSchema,
  DecisionSchema,
  // Operational
  CostSchema,
  ProviderErrorSchema,
  // Subject + Intervention input primitives
  SubjectSignalSchema,
  SubjectMarkerSchema,
  SubjectConfigSchema,
  InterventionConfigSchema,
} from './primitives.js';

export { RunArtifactSchema, ForgedToolSummarySchema } from './artifact.js';

export { StreamEventSchema, STREAM_EVENT_TYPES } from './stream.js';
export type { StreamEventType } from './stream.js';

// ---------------------------------------------------------------------------
// TypeScript type aliases (no runtime cost for type-only consumers)
// ---------------------------------------------------------------------------

export type {
  ScenarioExtensions,
  SimulationMode,
  RunMetadata,
  WorldSnapshot,
  Score,
  HighlightMetric,
  Timepoint,
  TrajectoryPoint,
  Trajectory,
  Citation,
  SpecialistDetail,
  SpecialistNote,
  RiskFlag,
  DecisionOutcome,
  Decision,
  Cost,
  ProviderError,
  ForgedToolSummary,
  RunArtifact,
  StreamEvent,
} from './types.js';
