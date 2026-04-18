/**
 * Zod schemas for commander-session outputs.
 *
 * Shape matches [contracts.ts `CommanderDecision`](../contracts.ts) plus
 * one new field: `reasoning` (preserves CoT that was previously stripped
 * and thrown away). The schema is the target for sendAndValidate over
 * the commander session so its conversation memory survives validation
 * retries.
 *
 * @module paracosm/runtime/schemas/commander
 */
import { z } from 'zod';

export const CommanderDecisionSchema = z.object({
  selectedOptionId: z.string().optional(),
  selectedEffectIds: z.array(z.string()).optional(),
  decision: z.string().min(1),
  rationale: z.string().default(''),
  /**
   * Full stepwise reasoning. Replaces the old `<thinking>...</thinking>` tag
   * that was stripped before JSON parse and discarded. Populated BEFORE
   * the model commits to selectedOptionId so the field captures actual
   * deliberation, not post-hoc justification. Dashboard renders this
   * behind a "show full analysis" expand; rationale is the default view.
   */
  reasoning: z.string().default(''),
  departmentsConsulted: z.array(z.string()).default([]),
  selectedPolicies: z.array(z.string()).default([]),
  rejectedPolicies: z.array(
    z.object({ policy: z.string().min(1), reason: z.string().default('') })
  ).default([]),
  expectedTradeoffs: z.array(z.string()).default([]),
  watchMetricsNextTurn: z.array(z.string()).default([]),
});

export const PromotionEntrySchema = z.object({
  agentId: z.string().min(1),
  department: z.string().min(1),
  role: z.string().min(1),
  reason: z.string().default(''),
});

export const PromotionsSchema = z.object({
  promotions: z.array(PromotionEntrySchema).default([]),
});

export type CommanderDecisionZ = z.infer<typeof CommanderDecisionSchema>;
export type PromotionsZ = z.infer<typeof PromotionsSchema>;
export type PromotionEntryZ = z.infer<typeof PromotionEntrySchema>;
