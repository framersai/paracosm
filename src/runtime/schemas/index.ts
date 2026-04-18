/**
 * Barrel exports for all Zod schemas covering paracosm's structured LLM
 * outputs. One schema per call site, each pair-tested in its own *.test.ts.
 *
 * Schemas are the single source of truth for shape and constraints. The
 * inferred types (`z.infer<typeof X>`) are preferred over the legacy
 * interfaces in contracts.ts for new code; legacy interfaces stay for
 * backward compat until every consumer migrates.
 *
 * @module paracosm/runtime/schemas
 */

export * from './director.js';
export * from './department.js';
export * from './commander.js';
export * from './reactions.js';
export * from './verdict.js';
