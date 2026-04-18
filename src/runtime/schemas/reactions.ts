/**
 * Zod schema for batched agent reactions.
 *
 * WHY WRAPPED IN AN OBJECT: OpenAI's `response_format: json_object` native
 * JSON mode rejects a root-level JSON array. The old reactions prompt
 * asked for `[{...}, ...]` directly, which worked with plain generateText
 * but breaks under generateObject's json_object hint. Wrapping in
 * { "reactions": [...] } satisfies the root-object constraint without
 * changing the downstream consumer (which already destructured `.reactions`
 * from the parsed result in some code paths).
 *
 * @module paracosm/runtime/schemas/reactions
 */
import { z } from 'zod';

export const MOOD_DOMAIN = [
  'positive', 'negative', 'neutral', 'anxious', 'defiant', 'hopeful', 'resigned',
] as const;

export const ReactionEntrySchema = z.object({
  agentId: z.string().min(1),
  quote: z.string().min(1),
  mood: z.enum(MOOD_DOMAIN),
  intensity: z.number().min(0).max(1),
});

export const ReactionBatchSchema = z.object({
  reactions: z.array(ReactionEntrySchema).default([]),
});

export type ReactionEntryZ = z.infer<typeof ReactionEntrySchema>;
export type ReactionBatchZ = z.infer<typeof ReactionBatchSchema>;
