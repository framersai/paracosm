/**
 * Zod schemas for department agent reports.
 *
 * The shape matches [contracts.ts `DepartmentReport`](../contracts.ts) so
 * downstream consumers (orchestrator, kernel, dashboard) can keep their
 * current typings. The schema adds structural defaults — the old
 * `emptyReport()` skeleton disappears once every caller migrates.
 *
 * @module paracosm/runtime/schemas/department
 */
import { z } from 'zod';

export const CitationSchema = z.object({
  text: z.string().min(1),
  url: z.string().min(1),
  doi: z.string().optional(),
  context: z.string().default(''),
});

export const RiskSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().min(1),
});

export const OpportunitySchema = z.object({
  impact: z.enum(['low', 'medium', 'high']),
  description: z.string().min(1),
});

export const ForgedToolUsageSchema = z.object({
  name: z.string().min(1),
  mode: z.enum(['compose', 'sandbox']),
  description: z.string().default(''),
  output: z.unknown(),
  confidence: z.number().min(0).max(1).default(0.7),
});

export const FeaturedAgentUpdateSchema = z.object({
  agentId: z.string().min(1),
  updates: z.object({
    health: z.record(z.string(), z.unknown()).optional(),
    career: z.record(z.string(), z.unknown()).optional(),
    narrative: z.object({ event: z.string() }).optional(),
  }),
});

/**
 * Typed effect the commander can select from dept recommendations.
 * Mirrors `TypedPolicyEffect` in contracts.ts.
 */
export const RecommendedEffectSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'resource_shift', 'capacity_expansion', 'population_intake',
    'risk_mitigation', 'governance_change', 'social_investment', 'research_bet',
  ]),
  description: z.string().default(''),
  colonyDelta: z.record(z.string(), z.number()).optional(),
  politicsDelta: z.record(z.string(), z.number()).optional(),
});

export const DepartmentReportSchema = z.object({
  department: z.string().min(1),
  summary: z.string().min(1),
  citations: z.array(CitationSchema).default([]),
  risks: z.array(RiskSchema).default([]),
  opportunities: z.array(OpportunitySchema).default([]),
  recommendedActions: z.array(z.string()).default([]),
  proposedPatches: z.record(z.string(), z.unknown()).default({}),
  forgedToolsUsed: z.array(ForgedToolUsageSchema).default([]),
  featuredAgentUpdates: z.array(FeaturedAgentUpdateSchema).default([]),
  confidence: z.number().min(0).max(1).default(0.7),
  openQuestions: z.array(z.string()).default([]),
  recommendedEffects: z.array(RecommendedEffectSchema).default([]),
});

export type DepartmentReportZ = z.infer<typeof DepartmentReportSchema>;
export type RiskZ = z.infer<typeof RiskSchema>;
export type OpportunityZ = z.infer<typeof OpportunitySchema>;
export type RecommendedEffectZ = z.infer<typeof RecommendedEffectSchema>;
