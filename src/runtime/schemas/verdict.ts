/**
 * Zod schema for the pair-runner verdict call.
 *
 * Replaces the existing `<thinking>...</thinking><verdict>{...}</verdict>`
 * transport. Reasoning (previously thrown away after the strip) now lives
 * in the `reasoning` field. The schema enforces 0-10 score bounds per
 * axis — the old parser silently accepted any number.
 *
 * @module paracosm/runtime/schemas/verdict
 */
import { z } from 'zod';

const ScoreAxesSchema = z.object({
  survival: z.number().min(0).max(10),
  prosperity: z.number().min(0).max(10),
  morale: z.number().min(0).max(10),
  innovation: z.number().min(0).max(10),
});

export const VerdictScoresSchema = z.object({
  a: ScoreAxesSchema,
  b: ScoreAxesSchema,
});

export const VerdictSchema = z.object({
  winner: z.enum(['A', 'B', 'tie']),
  winnerName: z.string().min(1),
  headline: z.string().min(1).max(80),
  summary: z.string().min(1),
  keyDivergence: z.string().min(1),
  scores: VerdictScoresSchema,
  reasoning: z.string().default(''),
});

export type VerdictZ = z.infer<typeof VerdictSchema>;
export type VerdictScoresZ = z.infer<typeof VerdictScoresSchema>;
