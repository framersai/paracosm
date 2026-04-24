/**
 * Prompt/document/URL to paracosm scenario compiler (Quickstart).
 *
 * Given seed text (optionally with a domain hint), an LLM proposes a
 * scenario JSON draft against `DraftScenarioSchema`. The draft routes
 * into the existing `compileScenario` pipeline so the `seedText` research
 * grounding + hook generation still fire. JSON is the canonical contract;
 * this module only provides a convenience entry for callers that start
 * from unstructured source material.
 *
 * @module paracosm/compiler/compile-from-seed
 */
import { z } from 'zod';
import { compileScenario } from './index.js';
import type { CompileOptions } from './types.js';
import type { ScenarioPackage } from '../types.js';
import { generateValidatedObject } from '../../runtime/llm-invocations/generateValidatedObject.js';

/**
 * The subset of a scenario JSON the LLM is asked to propose. Lean on
 * purpose: the compiler's existing pipeline fills in defaults, hooks,
 * and seed-ingested citations; we only need the domain-specific fields.
 */
export const DraftScenarioSchema = z.object({
  id: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/, 'kebab-case ids only'),
  labels: z.object({
    name: z.string().min(2).max(80),
    populationNoun: z.string().min(2).max(32),
    settlementNoun: z.string().min(2).max(32),
    timeUnitNoun: z.string().min(2).max(24),
    currency: z.string().min(1).max(16).optional(),
  }),
  setup: z.object({
    defaultTurns: z.number().int().min(2).max(12),
    defaultPopulation: z.number().int().min(10).max(1000),
    defaultStartTime: z.number().int(),
    defaultSeed: z.number().int().optional(),
  }),
  departments: z.array(z.object({
    id: z.string().min(2).max(48).regex(/^[a-z0-9-]+$/),
    label: z.string().min(2).max(48),
    role: z.string().min(2).max(80),
    instructions: z.string().min(10).max(400),
  })).min(2).max(8),
  metrics: z.array(z.object({
    id: z.string().min(2).max(32).regex(/^[a-z0-9-]+$/),
    format: z.enum(['number', 'percent', 'currency']).default('number'),
  })).min(2).max(12),
  theme: z.string().min(10).max(400).optional(),
});

export type DraftScenario = z.infer<typeof DraftScenarioSchema>;

/** Seed source material + optional domain hint passed by the caller. */
export interface CompileFromSeedInput {
  seedText: string;
  domainHint?: string;
  sourceUrl?: string;
}

/**
 * LLM system prompt for draft generation. Emphasizes: (a) match the
 * seed's domain, (b) pick domain-appropriate nouns, (c) keep scope
 * coherent so downstream compilation succeeds.
 */
const DRAFT_SYSTEM_PROMPT = `You are a scenario architect for paracosm, a structured world-model simulator for AI agents.
Given seed source material, propose a paracosm scenario JSON that matches the domain.
Pick populationNoun, settlementNoun, and timeUnitNoun that fit the domain ("crew" / "habitat" / "day" for a submarine; "employees" / "company" / "quarter" for a corporate scenario; "colonists" / "colony" / "year" for a space settlement).
Departments (2-8) should cover the decision-relevant roles in the domain. Metrics (2-12) should be quantifiable state the leader cares about.
Setup: defaultTurns 4-8, defaultPopulation proportional to the scope, defaultStartTime appropriate for the domain.
Keep all labels natural language; leave implementation details (hook code, citation sourcing) to downstream compilation.`;

/** Internal options, a subset of `CompileOptions` that `compileFromSeed` actually reads. */
export interface CompileFromSeedOptions extends CompileOptions {
  /** Override the provider for the draft-generation LLM call. Default: 'anthropic'. */
  draftProvider?: string;
  /** Override the model for the draft-generation LLM call. Default: 'claude-sonnet-4-6'. */
  draftModel?: string;
}

/**
 * Compile a scenario from seed source material. Calls the LLM to
 * propose a `DraftScenario`, validates it via Zod, then routes into
 * the existing `compileScenario` pipeline with `seedText` threading
 * through for research grounding.
 *
 * Retries once on Zod-validation failure (surfaced through
 * `generateValidatedObject`'s maxRetries mechanism).
 *
 * @throws Error when the LLM fails to produce a valid draft after one retry.
 */
export async function compileFromSeed(
  input: CompileFromSeedInput,
  options: CompileFromSeedOptions = {},
): Promise<ScenarioPackage> {
  const provider = options.draftProvider ?? options.provider ?? 'anthropic';
  const model = options.draftModel ?? options.model ?? 'claude-sonnet-4-6';

  const hint = input.domainHint ? `\n\nDomain hint: ${input.domainHint}` : '';
  const prompt = `Seed source material:\n"""\n${input.seedText}\n"""${hint}\n\nRespond with a scenario JSON that matches DraftScenarioSchema.`;

  const result = await generateValidatedObject({
    provider,
    model,
    schema: DraftScenarioSchema,
    schemaName: 'DraftScenario',
    systemCacheable: DRAFT_SYSTEM_PROMPT,
    prompt,
    maxRetries: 1,
  });

  // Route the validated draft into the existing compiler with
  // seedText grounding so the research + hook-generation stages
  // still pull citations and generate TypeScript.
  return compileScenario(result.object as unknown as Record<string, unknown>, {
    ...options,
    seedText: input.seedText,
    seedUrl: input.sourceUrl,
  });
}
