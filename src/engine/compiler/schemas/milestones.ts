/**
 * Zod schema for milestone events (turn 1 founding + final turn legacy).
 *
 * "Milestone events" are the fixed narrative beats that fire on specific
 * turns regardless of sim state. The runtime's emergent events come from
 * the director; milestones are compile-time content.
 *
 * Field shape matches MilestoneEventDef in src/engine/types.ts: a required
 * `description` (primary narrative) and an optional `crisis` (extended
 * detailed text kept for back-compat with Mars-era scenarios). Cross-field
 * refine enforces the risky-option invariant the old parser silently
 * accepted.
 *
 * @module paracosm/engine/compiler/schemas/milestones
 */
import { z } from 'zod';

/** One multiple-choice option within a milestone event. */
export const MilestoneOptionSchema = z.object({
  id: z.string().regex(/^option_[a-c]$/, 'must be option_a, option_b, or option_c'),
  label: z.string().min(1),
  description: z.string().min(1),
  isRisky: z.boolean(),
});

/**
 * A milestone event. The refine catches the common failure mode where
 * the LLM emits a plausible option list but names the wrong id as the
 * risky one — the old parser silently accepted this and the runtime
 * would pick the safe option when the LLM intended risky.
 */
export const MilestoneEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  /** Optional extended narrative text; legacy field kept for back-compat. */
  crisis: z.string().optional(),
  options: z.array(MilestoneOptionSchema).min(2).max(3),
  riskyOptionId: z.string(),
  riskSuccessProbability: z.number().min(0.3).max(0.8),
  category: z.string().min(1),
  researchKeywords: z.array(z.string()).default([]),
  relevantDepartments: z.array(z.string()).min(1),
  turnSummary: z.string().min(1),
}).refine(
  evt => evt.options.some(o => o.id === evt.riskyOptionId && o.isRisky),
  { message: 'riskyOptionId must reference an option where isRisky=true' },
);

/**
 * Wrapping object for the two-milestone compile output. Used instead
 * of a top-level array so OpenAI response_format:json_object accepts it
 * (root arrays are rejected) and so the retry loop can address each
 * milestone by name in the validation-error feedback.
 */
export const MilestonesSchema = z.object({
  founding: MilestoneEventSchema,
  legacy: MilestoneEventSchema,
});

export type MilestoneEventZ = z.infer<typeof MilestoneEventSchema>;
export type MilestonesZ = z.infer<typeof MilestonesSchema>;
