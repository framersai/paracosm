/**
 * Top-level `RunArtifact` schema. What every paracosm simulation returns,
 * regardless of scenario or mode. Exported from `paracosm/schema`.
 *
 * Consumers pattern-match on `metadata.mode` to know which optional fields
 * are populated. See the per-mode field matrix in
 * [the design spec](../../../docs/superpowers/specs/2026-04-22-universal-schema-design.md).
 *
 * @module paracosm/schema/artifact
 */
import { z } from 'zod';

import {
  CitationSchema,
  CostSchema,
  DecisionSchema,
  InterventionConfigSchema,
  ProviderErrorSchema,
  RiskFlagSchema,
  RunMetadataSchema,
  ScenarioExtensionsSchema,
  SpecialistNoteSchema,
  SubjectConfigSchema,
  TrajectorySchema,
  WorldSnapshotSchema,
} from './primitives.js';

// ---------------------------------------------------------------------------
// ForgedTool — minimal cross-run summary
// ---------------------------------------------------------------------------

/**
 * Summary of a runtime-forged tool. Full forge attempts (with sandbox
 * output, judge reasoning, etc.) live in the stream event log for the run;
 * this is the deduped catalog that shows up in the artifact.
 */
export const ForgedToolSummarySchema = z.object({
  name: z.string().min(1),
  department: z.string().optional(),
  description: z.string().optional(),
  approved: z.boolean(),
  confidence: z.number().min(0).max(1).optional(),
});

// ---------------------------------------------------------------------------
// RunArtifact — top-level
// ---------------------------------------------------------------------------

/**
 * Universal paracosm run artifact. One shape, three modes, no schema
 * versioning at this layer.
 *
 * Required fields: `metadata` only. Every other field is mode-conditional
 * or scenario-conditional. Consumers switch on `metadata.mode` to know
 * what to expect.
 *
 * @example turn-loop (paracosm civ-sim)
 * ```ts
 * {
 *   metadata: { runId, scenario, seed: 42, mode: 'turn-loop', startedAt, completedAt },
 *   overview: 'Bold expansion outpaced cautious engineering.',
 *   trajectory: { timeUnit, points, timepoints },
 *   specialistNotes: [...],     // one per department-turn
 *   decisions: [...],           // one per commander decision
 *   finalState: { metrics, ... },
 *   fingerprint: { resilience, innovation, riskStyle },
 *   citations: [...],
 *   forgedTools: [...],
 *   cost: { totalUSD, llmCalls, inputTokens, outputTokens },
 *   providerError: null,
 *   aborted: false,
 * }
 * ```
 *
 * @example batch-trajectory (digital-twin digital-twin)
 * ```ts
 * {
 *   metadata: { runId, scenario, mode: 'batch-trajectory', startedAt, completedAt },
 *   overview: 'Creatine + sleep hygiene yields gradual HRV recovery over 3 months.',
 *   assumptions: ['...', '...'],
 *   leveragePoints: ['...', '...'],
 *   disclaimer: 'Not medical advice.',
 *   trajectory: { timeUnit: { singular: 'week', plural: 'weeks' }, timepoints: [...5 items] },
 *   specialistNotes: [...],
 *   riskFlags: [...],
 *   cost: { totalUSD, ... },
 * }
 * ```
 *
 * @example batch-point (pure forecast, no trajectory)
 * ```ts
 * {
 *   metadata: { runId, scenario, mode: 'batch-point', startedAt, completedAt },
 *   overview: 'Short answer: yes, with two caveats.',
 *   assumptions: ['...'],
 *   leveragePoints: ['...'],
 *   specialistNotes: [...],
 *   riskFlags: [...],
 *   cost: { totalUSD, ... },
 * }
 * ```
 */
export const RunArtifactSchema = z.object({
  /** Required. Identifies the run + scenario + mode. */
  metadata: RunMetadataSchema,

  // -----------------------------------------------------------------------
  // Narrative layer — mode-agnostic (all modes may populate)
  // -----------------------------------------------------------------------

  /**
   * Short headline summary. Digital-twin's `overview`, paracosm verdict's
   * `summary`, a game's end-of-run narrator line.
   */
  overview: z.string().optional(),
  /** Assumptions held true during the simulation. */
  assumptions: z.array(z.string()).optional(),
  /** Actionable leverage points for consumers of the artifact. */
  leveragePoints: z.array(z.string()).optional(),
  /** Scenario-supplied disclaimer (digital-twin uses this for medical caveats). */
  disclaimer: z.string().optional(),

  // -----------------------------------------------------------------------
  // Trajectory — core time-series output
  // -----------------------------------------------------------------------

  /**
   * Labeled trajectory of the simulation. `trajectory.points` for sparklines,
   * `trajectory.timepoints` for rich labeled snapshots. Both optional; at
   * least one populated in `turn-loop` and `batch-trajectory` modes.
   */
  trajectory: TrajectorySchema.optional(),

  // -----------------------------------------------------------------------
  // Input primitives (batch-trajectory / batch-point modes populate these;
  // turn-loop stores them verbatim when passed via RunOptions)
  // -----------------------------------------------------------------------

  /** Subject being simulated (person, character, organism, vessel, etc.). */
  subject: SubjectConfigSchema.optional(),
  /** Intervention being tested on the subject. */
  intervention: InterventionConfigSchema.optional(),

  // -----------------------------------------------------------------------
  // Content primitives
  // -----------------------------------------------------------------------

  /** Specialist analyses across domains. Flat list; multiple entries per domain/turn OK. */
  specialistNotes: z.array(SpecialistNoteSchema).optional(),
  /** Risk callouts. Matches digital-twin's `risk_flags`. */
  riskFlags: z.array(RiskFlagSchema).optional(),
  /** Every decision made during the run — one per commander choice in turn-loop. */
  decisions: z.array(DecisionSchema).optional(),

  // -----------------------------------------------------------------------
  // Final state + classification
  // -----------------------------------------------------------------------

  finalState: WorldSnapshotSchema.optional(),
  /** Loose classification scores. Paracosm heritage; scenarios may extend. */
  fingerprint: z.record(z.string(), z.union([z.number(), z.string()])).optional(),

  // -----------------------------------------------------------------------
  // Catalogs (deduped at end of run)
  // -----------------------------------------------------------------------

  citations: z.array(CitationSchema).optional(),
  forgedTools: z.array(ForgedToolSummarySchema).optional(),

  // -----------------------------------------------------------------------
  // Operational
  // -----------------------------------------------------------------------

  cost: CostSchema.optional(),
  providerError: ProviderErrorSchema.nullable().optional(),
  aborted: z.boolean().optional(),

  // -----------------------------------------------------------------------
  // Scenario-specific overflow
  // -----------------------------------------------------------------------

  scenarioExtensions: ScenarioExtensionsSchema,
});
