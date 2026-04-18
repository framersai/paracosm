# Compiler Hook Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (user rule: no subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every compile-time LLM call through a validated wrapper with retry-with-prior-output feedback, emit `compile_validation_fallback` SSE events on exhaustion, and surface compile retry counts in `/retry-stats`.

**Architecture:** Three wrappers (`generateValidatedObject` for milestones JSON, `generateValidatedCode` for the five TS-code hooks, `generateValidatedProse` for director prose) + a minimal `CompilerTelemetry` aggregator. `/compile` SSE forwards fallbacks in real time and snapshots per-hook attempts/fallbacks into the existing ring buffer using synthetic `compile:*` schema names.

**Tech Stack:** TypeScript, Zod, AgentOS (`generateObject`, `generateText`, `ObjectGenerationError`, cache breakpoints), `node:test` runner.

**Spec:** [docs/superpowers/specs/2026-04-18-compiler-hook-reliability-design.md](../specs/2026-04-18-compiler-hook-reliability-design.md)

---

## File Structure

**New files:**

```
src/engine/compiler/
  schemas/
    index.ts                                      barrel
    milestones.ts                                 MilestonesSchema + MilestoneEventSchema
    milestones.test.ts

  llm-invocations/
    generateValidatedObject.ts                    compile-side Zod JSON wrapper (milestones)
    generateValidatedObject.test.ts
    generateValidatedCode.ts                      TS-code wrapper (5 hooks)
    generateValidatedCode.test.ts
    generateValidatedProse.ts                     prose wrapper (director)
    generateValidatedProse.test.ts

  telemetry.ts                                    CompilerTelemetry interface + default impl
  telemetry.test.ts
```

**Modified files:**

```
src/engine/compiler/
  types.ts                                        GenerateTextFn expansion + CompilerTelemetry option
  index.ts                                        thread telemetry into each hook, new compile version
  cache.ts                                        COMPILE_SCHEMA_VERSION bump for milestones reshape
  generate-progression.ts                         use generateValidatedCode
  generate-director.ts                            use generateValidatedProse
  generate-prompts.ts                             use generateValidatedCode
  generate-milestones.ts                          use generateValidatedObject + MilestonesSchema
  generate-fingerprint.ts                         use generateValidatedCode
  generate-politics.ts                            use generateValidatedCode
  generate-reactions.ts                           use generateValidatedCode

src/cli/
  server-app.ts                                   /compile telemetry + SSE forwarding
```

**Conventions:**
- Test alongside source (`foo.ts` + `foo.test.ts`), per existing paracosm pattern
- `node:test` runner, `node:assert/strict`
- TSDoc on every exported symbol
- No `console.warn` in library code; log via telemetry callback

---

## Task 1: Milestones Zod schema

**Files:**
- Create: `src/engine/compiler/schemas/milestones.ts`
- Create: `src/engine/compiler/schemas/milestones.test.ts`
- Create: `src/engine/compiler/schemas/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/engine/compiler/schemas/milestones.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { MilestonesSchema, MilestoneEventSchema } from './milestones.js';

const validFounding = {
  title: 'Arrival at Mars',
  crisis: 'The colonists arrive at Mars and must choose their first strategy.',
  options: [
    { id: 'option_a', label: 'Safe Base', description: 'Conservative settlement', isRisky: false },
    { id: 'option_b', label: 'Ambitious Expansion', description: 'Aggressive expansion', isRisky: true },
  ],
  riskyOptionId: 'option_b',
  riskSuccessProbability: 0.55,
  category: 'infrastructure',
  researchKeywords: ['mars landing', 'colony foundation'],
  relevantDepartments: ['engineering', 'medical'],
  turnSummary: 'First decisions shape the colony.',
};

const validLegacy = {
  title: 'Legacy Assessment',
  crisis: 'Submit a comprehensive status report.',
  options: [
    { id: 'option_a', label: 'Honest', description: 'Factual report', isRisky: false },
    { id: 'option_b', label: 'Ambitious', description: 'Bold projection', isRisky: true },
  ],
  riskyOptionId: 'option_b',
  riskSuccessProbability: 0.5,
  category: 'political',
  researchKeywords: [],
  relevantDepartments: ['governance'],
  turnSummary: 'Time to assess the colony.',
};

test('MilestoneEventSchema accepts a canonical valid event', () => {
  const result = MilestoneEventSchema.safeParse(validFounding);
  assert.equal(result.success, true);
});

test('MilestoneEventSchema rejects when riskyOptionId does not match an isRisky option', () => {
  const bad = { ...validFounding, riskyOptionId: 'option_a' };
  const result = MilestoneEventSchema.safeParse(bad);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some(i => i.message.includes('isRisky')));
  }
});

test('MilestoneEventSchema rejects option id outside option_a/b/c', () => {
  const bad = {
    ...validFounding,
    options: [
      { id: 'option_x', label: 'x', description: 'x', isRisky: false },
      { id: 'option_b', label: 'b', description: 'b', isRisky: true },
    ],
  };
  const result = MilestoneEventSchema.safeParse(bad);
  assert.equal(result.success, false);
});

test('MilestoneEventSchema rejects riskSuccessProbability outside [0.3, 0.8]', () => {
  const tooLow = { ...validFounding, riskSuccessProbability: 0.1 };
  const tooHigh = { ...validFounding, riskSuccessProbability: 0.95 };
  assert.equal(MilestoneEventSchema.safeParse(tooLow).success, false);
  assert.equal(MilestoneEventSchema.safeParse(tooHigh).success, false);
});

test('MilestoneEventSchema fills researchKeywords default when omitted', () => {
  const { researchKeywords: _omit, ...noKeywords } = validFounding;
  const result = MilestoneEventSchema.safeParse(noKeywords);
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.researchKeywords, []);
  }
});

test('MilestonesSchema accepts object shape { founding, legacy }', () => {
  const result = MilestonesSchema.safeParse({ founding: validFounding, legacy: validLegacy });
  assert.equal(result.success, true);
});

test('MilestonesSchema rejects array shape (legacy format)', () => {
  const result = MilestonesSchema.safeParse([validFounding, validLegacy]);
  assert.equal(result.success, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm && npx tsx --test src/engine/compiler/schemas/milestones.test.ts`
Expected: FAIL with "Cannot find module './milestones.js'"

- [ ] **Step 3: Write the schema**

Create `src/engine/compiler/schemas/milestones.ts`:

```ts
/**
 * Zod schema for milestone crises (turn 1 founding + final turn legacy).
 * Shape matches the existing MilestoneEventDef at src/engine/types.ts
 * with cross-field invariants added.
 *
 * @module paracosm/engine/compiler/schemas/milestones
 */
import { z } from 'zod';

/** One multiple-choice option within a milestone crisis. */
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
  crisis: z.string().min(1),
  options: z.array(MilestoneOptionSchema).min(2).max(3),
  riskyOptionId: z.string(),
  riskSuccessProbability: z.number().min(0.3).max(0.8),
  category: z.string().min(1),
  researchKeywords: z.array(z.string()).default([]),
  relevantDepartments: z.array(z.string()).min(1),
  turnSummary: z.string().min(1),
  description: z.string().optional(),
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
```

Create `src/engine/compiler/schemas/index.ts`:

```ts
/**
 * Barrel for compile-time Zod schemas.
 *
 * @module paracosm/engine/compiler/schemas
 */
export * from './milestones.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm && npx tsx --test src/engine/compiler/schemas/milestones.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/engine/compiler/schemas/
git commit -m "feat(compiler): add Zod schemas for milestones

Matches existing MilestoneEventDef shape with cross-field refine
catching riskyOptionId-doesn't-point-to-risky-option bugs the old
parser silently accepted."
```

---

## Task 2: Compile-side generateValidatedObject wrapper

**Files:**
- Create: `src/engine/compiler/llm-invocations/generateValidatedObject.ts`
- Create: `src/engine/compiler/llm-invocations/generateValidatedObject.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/engine/compiler/llm-invocations/generateValidatedObject.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { ObjectGenerationError } from '@framers/agentos';
import { generateValidatedObject } from './generateValidatedObject.js';

const S = z.object({ name: z.string(), count: z.number() });

test('returns validated object on success', async () => {
  const mock = async () => ({ object: { name: 'ok', count: 3 }, text: '{"name":"ok","count":3}' });
  const result = await generateValidatedObject({
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    schema: S,
    schemaName: 'test',
    prompt: 'generate',
    _generateObjectImpl: mock as any,
  });
  assert.equal(result.fromFallback, false);
  assert.equal(result.object.count, 3);
  assert.equal(result.attempts, 1);
});

test('returns fallback when ObjectGenerationError thrown and fallback provided', async () => {
  let onFallbackCalled = false;
  const mock = async () => { throw new ObjectGenerationError('bad', 'raw text here', undefined as any); };
  const result = await generateValidatedObject({
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    schema: S,
    schemaName: 'test',
    prompt: 'generate',
    fallback: { name: 'fallback', count: 0 },
    onValidationFallback: () => { onFallbackCalled = true; },
    _generateObjectImpl: mock as any,
  });
  assert.equal(result.fromFallback, true);
  assert.equal(result.object.name, 'fallback');
  assert.equal(onFallbackCalled, true);
});

test('rethrows ObjectGenerationError when no fallback provided', async () => {
  const mock = async () => { throw new ObjectGenerationError('bad', 'raw text', undefined as any); };
  await assert.rejects(
    () => generateValidatedObject({
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      schema: S,
      prompt: 'generate',
      _generateObjectImpl: mock as any,
    }),
    /bad/,
  );
});

test('passes systemCacheable with cacheBreakpoint:true into generateObject', async () => {
  let capturedSystem: unknown;
  const mock = async (args: any) => { capturedSystem = args.system; return { object: { name: 'ok', count: 1 }, text: '{}' }; };
  await generateValidatedObject({
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    schema: S,
    systemCacheable: 'stable prefix',
    prompt: 'generate',
    _generateObjectImpl: mock as any,
  });
  assert.deepEqual(capturedSystem, [{ text: 'stable prefix', cacheBreakpoint: true }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm && npx tsx --test src/engine/compiler/llm-invocations/generateValidatedObject.test.ts`
Expected: FAIL with "Cannot find module './generateValidatedObject.js'"

- [ ] **Step 3: Write the wrapper**

Create `src/engine/compiler/llm-invocations/generateValidatedObject.ts`:

```ts
/**
 * Compile-side Zod-validated one-shot LLM wrapper.
 *
 * Mirrors the runtime's generateValidatedObject (src/runtime/llm-invocations/
 * generateValidatedObject.ts) but lives under src/engine/ to preserve the
 * engine-cannot-import-runtime boundary. Both wrap AgentOS generateObject
 * with paracosm's observability conventions (cost tracking, validation
 * fallback, provider-error forwarding).
 *
 * @module paracosm/engine/compiler/llm-invocations/generateValidatedObject
 */
import { generateObject as agentosGenerateObject, ObjectGenerationError } from '@framers/agentos';
import type { ZodType, z } from 'zod';

export interface ValidatedObjectOptions<T extends ZodType> {
  provider: string;
  model: string;
  schema: T;
  schemaName?: string;
  schemaDescription?: string;
  /** Cached system block (wrapped in cacheBreakpoint:true automatically). */
  systemCacheable?: string;
  /** Non-cached system content appended after the cached block. */
  systemTail?: string;
  prompt: string;
  maxRetries?: number;
  onUsage?: (r: { usage?: unknown }) => void;
  onProviderError?: (err: unknown) => void;
  /** Fires when retries exhaust and fallback is used. Separate from
   *  onProviderError so quota/auth failures are distinguishable from
   *  schema-validation misbehavior. */
  onValidationFallback?: (details: { rawText: string; schemaName?: string; err: unknown }) => void;
  fallback?: z.infer<T>;
  /** Test-only injection point. */
  _generateObjectImpl?: typeof agentosGenerateObject;
}

export interface ValidatedObjectResult<T> {
  object: T;
  fromFallback: boolean;
  rawText: string;
  usage?: unknown;
  attempts: number;
}

export async function generateValidatedObject<T extends ZodType>(
  opts: ValidatedObjectOptions<T>,
): Promise<ValidatedObjectResult<z.infer<T>>> {
  const impl = opts._generateObjectImpl ?? agentosGenerateObject;

  const systemBlocks: Array<{ text: string; cacheBreakpoint?: boolean }> = [];
  if (opts.systemCacheable) systemBlocks.push({ text: opts.systemCacheable, cacheBreakpoint: true });
  if (opts.systemTail) systemBlocks.push({ text: opts.systemTail });

  try {
    const result = await impl({
      provider: opts.provider,
      model: opts.model,
      schema: opts.schema,
      schemaName: opts.schemaName,
      schemaDescription: opts.schemaDescription,
      system: systemBlocks.length ? systemBlocks : undefined,
      prompt: opts.prompt,
      maxRetries: opts.maxRetries,
    });
    opts.onUsage?.({ usage: (result as { usage?: unknown }).usage });
    return {
      object: result.object,
      fromFallback: false,
      rawText: (result as { text?: string }).text ?? '',
      usage: (result as { usage?: unknown }).usage,
      attempts: 1,
    };
  } catch (err) {
    opts.onProviderError?.(err);
    if (err instanceof ObjectGenerationError && opts.fallback !== undefined) {
      opts.onValidationFallback?.({
        rawText: err.rawText ?? '',
        schemaName: opts.schemaName,
        err,
      });
      return {
        object: opts.fallback,
        fromFallback: true,
        rawText: err.rawText ?? '',
        attempts: (opts.maxRetries ?? 2) + 1,
      };
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm && npx tsx --test src/engine/compiler/llm-invocations/generateValidatedObject.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/compiler/llm-invocations/generateValidatedObject.ts src/engine/compiler/llm-invocations/generateValidatedObject.test.ts
git commit -m "feat(compiler): compile-side generateValidatedObject wrapper

Mirrors the runtime wrapper while staying inside src/engine/ to
respect the engine-cannot-import-runtime boundary. Wraps AgentOS
generateObject with cache-breakpoint system block, validation
fallback, and provider-error forwarding."
```

---

## Task 3: generateValidatedCode wrapper (the big one)

**Files:**
- Create: `src/engine/compiler/llm-invocations/generateValidatedCode.ts`
- Create: `src/engine/compiler/llm-invocations/generateValidatedCode.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/engine/compiler/llm-invocations/generateValidatedCode.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateValidatedCode } from './generateValidatedCode.js';
import { createCompilerTelemetry } from '../telemetry.js';

type TestFn = (x: number) => number;
const parseAsFn = (text: string): TestFn | null => {
  const cleaned = text.trim().replace(/^```(?:typescript|ts|javascript|js)?\n?/i, '').replace(/\n?```$/i, '');
  try {
    const fn = new Function('return ' + cleaned)();
    return typeof fn === 'function' ? fn : null;
  } catch {
    return null;
  }
};
const smokeTest = (fn: TestFn) => {
  const out = fn(3);
  if (typeof out !== 'number') throw new Error('must return number');
};
const fallback: TestFn = () => 0;

test('returns parsed fn on first try', async () => {
  const calls: string[] = [];
  const mock = async (p: string | { prompt: string }) => {
    calls.push(typeof p === 'string' ? p : p.prompt);
    return '(x) => x * 2';
  };
  const result = await generateValidatedCode({
    hookName: 'test',
    systemCacheable: 'sys',
    prompt: 'write a doubler',
    parse: parseAsFn,
    smokeTest,
    fallback,
    fallbackSource: 'fallback',
    generateText: mock as any,
  });
  assert.equal(result.fromFallback, false);
  assert.equal(result.attempts, 1);
  assert.equal(result.hook(5), 10);
  assert.equal(calls.length, 1);
});

test('retries with YOUR PRIOR OUTPUT when parse fails, then succeeds', async () => {
  let call = 0;
  const seen: string[] = [];
  const mock = async (p: string | { prompt: string }) => {
    call += 1;
    seen.push(typeof p === 'string' ? p : p.prompt);
    return call === 1 ? 'this is not code' : '(x) => x + 1';
  };
  const result = await generateValidatedCode({
    hookName: 'test',
    systemCacheable: 'sys',
    prompt: 'write an incrementer',
    parse: parseAsFn,
    smokeTest,
    fallback,
    fallbackSource: 'fallback',
    generateText: mock as any,
  });
  assert.equal(result.fromFallback, false);
  assert.equal(result.attempts, 2);
  assert.equal(result.hook(4), 5);
  // Second prompt must contain the prior bad output
  assert.ok(seen[1].includes('YOUR PRIOR OUTPUT'), 'retry prompt missing prior-output block');
  assert.ok(seen[1].includes('this is not code'), 'retry prompt missing actual prior text');
});

test('retries when smokeTest throws and exposes error in retry prompt', async () => {
  let call = 0;
  const seen: string[] = [];
  const mock = async (p: string | { prompt: string }) => {
    call += 1;
    seen.push(typeof p === 'string' ? p : p.prompt);
    return call === 1 ? '(x) => "not a number"' : '(x) => x';
  };
  const result = await generateValidatedCode({
    hookName: 'test',
    systemCacheable: 'sys',
    prompt: 'write identity',
    parse: parseAsFn,
    smokeTest,
    fallback,
    fallbackSource: 'fallback',
    generateText: mock as any,
  });
  assert.equal(result.fromFallback, false);
  assert.equal(result.attempts, 2);
  assert.ok(seen[1].includes('must return number'));
});

test('returns fallback + records telemetry after exhausting retries', async () => {
  const tele = createCompilerTelemetry();
  const mock = async () => 'still not code';
  const result = await generateValidatedCode({
    hookName: 'progression',
    systemCacheable: 'sys',
    prompt: 'write code',
    parse: parseAsFn,
    smokeTest,
    fallback,
    fallbackSource: 'fallback',
    maxRetries: 2,
    generateText: mock as any,
    telemetry: tele,
  });
  assert.equal(result.fromFallback, true);
  assert.equal(result.attempts, 3);
  assert.equal(result.hook, fallback);
  const snap = tele.snapshot();
  assert.ok(snap.schemaRetries['compile:progression']);
  assert.equal(snap.schemaRetries['compile:progression'].fallbacks, 1);
  assert.equal(snap.fallbacks.length, 1);
  assert.equal(snap.fallbacks[0].hookName, 'progression');
  assert.ok(snap.fallbacks[0].rawText.includes('still not code'));
});

test('passes system block with cacheBreakpoint to generateText', async () => {
  let capturedCall: unknown;
  const mock = async (p: string | { system?: unknown; prompt: string }) => {
    capturedCall = p;
    return '(x) => x';
  };
  await generateValidatedCode({
    hookName: 'test',
    systemCacheable: 'stable',
    prompt: 'identity',
    parse: parseAsFn,
    smokeTest,
    fallback,
    fallbackSource: 'fallback',
    generateText: mock as any,
  });
  assert.ok(typeof capturedCall === 'object', 'should call with options form');
  assert.deepEqual((capturedCall as { system: unknown }).system, [{ text: 'stable', cacheBreakpoint: true }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm && npx tsx --test src/engine/compiler/llm-invocations/generateValidatedCode.test.ts`
Expected: FAIL with "Cannot find module './generateValidatedCode.js'" or "Cannot find module '../telemetry.js'" (telemetry added in Task 5 but referenced here; expected order is Task 5 first — adjust if you skipped ahead)

- [ ] **Step 3: Defer dependency on telemetry and use a stub test double**

Since Task 5 creates the telemetry module, either do Task 5 first or replace the telemetry import in this test with an inline stub. Inline the stub:

Replace the `import { createCompilerTelemetry }` line in the test with:

```ts
interface StubTele {
  snapshot: () => { schemaRetries: Record<string, { calls: number; attempts: number; fallbacks: number }>; fallbacks: Array<{ hookName: string; rawText: string }> };
}
const createStubTele = (): StubTele & { recordAttempt: (...a: unknown[]) => void; recordFallback: (n: string, d: { rawText: string }) => void } => {
  const schemaRetries: Record<string, { calls: number; attempts: number; fallbacks: number }> = {};
  const fallbacks: Array<{ hookName: string; rawText: string }> = [];
  return {
    recordAttempt: () => {},
    recordFallback: (n, d) => {
      fallbacks.push({ hookName: n, rawText: d.rawText });
      schemaRetries[`compile:${n}`] = schemaRetries[`compile:${n}`] ?? { calls: 0, attempts: 0, fallbacks: 0 };
      schemaRetries[`compile:${n}`].fallbacks += 1;
    },
    snapshot: () => ({ schemaRetries, fallbacks }),
  };
};
```

And replace `const tele = createCompilerTelemetry();` with `const tele = createStubTele();`.

(This keeps the test self-contained. If Task 5 runs before Task 3 in practice, the inline stub can stay — it's a test-only shim.)

- [ ] **Step 4: Write the wrapper**

Create `src/engine/compiler/llm-invocations/generateValidatedCode.ts`:

```ts
/**
 * Shared wrapper for TS-code-producing compile hooks (progression,
 * prompts, fingerprint, politics, reactions). Encapsulates the parse +
 * smoke-test + retry + telemetry loop that each hook file used to
 * hand-roll, plus prompt caching and prior-output retry feedback.
 *
 * The retry feedback includes the LLM's prior malformed output truncated
 * to 2000 chars. This lives in the USER prompt, not the SYSTEM block,
 * so it does not invalidate the AgentOS / Anthropic prompt cache on
 * repeat retries across the same compile run.
 *
 * @module paracosm/engine/compiler/llm-invocations/generateValidatedCode
 */
import type { GenerateTextFn } from '../types.js';
import type { CompilerTelemetry } from '../telemetry.js';

const MAX_PRIOR_OUTPUT_CHARS = 2000;

export interface ValidatedCodeOptions<Fn> {
  /** Used as `compile:<hookName>` in /retry-stats and in error messages. */
  hookName: string;
  /** Stable prefix wrapped with cacheBreakpoint:true. */
  systemCacheable: string;
  /** User-facing prompt; attempt-specific retry hint appended after. */
  prompt: string;
  /** Parse raw text into the target function. Return null on parse failure. */
  parse: (text: string) => Fn | null;
  /** Canonical smoke test. Must throw with a readable message on failure. */
  smokeTest: (fn: Fn) => void;
  /** Fallback function when retries exhaust. */
  fallback: Fn;
  /** Fallback source text for cache-format parity. */
  fallbackSource: string;
  maxRetries?: number;
  generateText: GenerateTextFn;
  telemetry?: CompilerTelemetry;
}

export interface ValidatedCodeResult<Fn> {
  hook: Fn;
  source: string;
  attempts: number;
  fromFallback: boolean;
  failedRawText?: string;
  failedReason?: string;
}

function buildRetryPrompt(originalPrompt: string, priorText: string, reason: string): string {
  const excerpt = priorText.length > MAX_PRIOR_OUTPUT_CHARS
    ? priorText.slice(-MAX_PRIOR_OUTPUT_CHARS)
    : priorText;
  return `${originalPrompt}\n\nPrevious attempt failed: ${reason}\n\nYOUR PRIOR OUTPUT (the code that failed):\n\`\`\`\n${excerpt}\n\`\`\`\n\nFix the specific issue named above. Return ONLY the corrected function. No markdown fences, no explanation.`;
}

export async function generateValidatedCode<Fn>(
  opts: ValidatedCodeOptions<Fn>,
): Promise<ValidatedCodeResult<Fn>> {
  const maxRetries = opts.maxRetries ?? 3;
  let lastRawText = '';
  let lastReason = '';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const prompt = attempt === 0
      ? opts.prompt
      : buildRetryPrompt(opts.prompt, lastRawText, lastReason);

    const text = await opts.generateText({
      system: [{ text: opts.systemCacheable, cacheBreakpoint: true }],
      prompt,
    });
    lastRawText = text;

    const fn = opts.parse(text);
    if (!fn) {
      lastReason = 'Could not parse response into a callable function (markdown wrapper, syntax error, or non-function export)';
      continue;
    }
    try {
      opts.smokeTest(fn);
      opts.telemetry?.recordAttempt(opts.hookName, attempt + 1, false);
      return { hook: fn, source: text.trim(), attempts: attempt + 1, fromFallback: false };
    } catch (err) {
      lastReason = err instanceof Error ? err.message : String(err);
    }
  }

  opts.telemetry?.recordFallback(opts.hookName, {
    rawText: lastRawText,
    reason: lastReason,
    attempts: maxRetries,
  });
  return {
    hook: opts.fallback,
    source: opts.fallbackSource,
    attempts: maxRetries,
    fromFallback: true,
    failedRawText: lastRawText,
    failedReason: lastReason,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm && npx tsx --test src/engine/compiler/llm-invocations/generateValidatedCode.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/engine/compiler/llm-invocations/generateValidatedCode.ts src/engine/compiler/llm-invocations/generateValidatedCode.test.ts
git commit -m "feat(compiler): generateValidatedCode wrapper for code-producing hooks

Shared retry + smoke-test + telemetry loop replacing the hand-rolled
version in each generate-*.ts. Retry prompt now includes the prior
malformed LLM output so the model can self-correct against its own
text, matching the runtime sendAndValidate pattern."
```

---

## Task 4: generateValidatedProse wrapper

**Files:**
- Create: `src/engine/compiler/llm-invocations/generateValidatedProse.ts`
- Create: `src/engine/compiler/llm-invocations/generateValidatedProse.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/engine/compiler/llm-invocations/generateValidatedProse.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateValidatedProse } from './generateValidatedProse.js';

const validate = (text: string): { ok: true } | { ok: false; reason: string } => {
  if (text.length < 20) return { ok: false, reason: 'too short' };
  if (!text.includes('departments')) return { ok: false, reason: 'missing "departments" keyword' };
  return { ok: true };
};

test('returns validated prose on first try', async () => {
  const mock = async () => 'These are crisis director instructions mentioning departments clearly.';
  const result = await generateValidatedProse({
    hookName: 'director',
    systemCacheable: 'sys',
    prompt: 'write instructions',
    validate,
    fallback: 'fb',
    generateText: mock as any,
  });
  assert.equal(result.fromFallback, false);
  assert.equal(result.attempts, 1);
});

test('retries with prior output on validation failure', async () => {
  let call = 0;
  const seen: string[] = [];
  const mock = async (p: string | { prompt: string }) => {
    call += 1;
    seen.push(typeof p === 'string' ? p : p.prompt);
    return call === 1 ? 'too short' : 'longer text that mentions departments and explains things.';
  };
  const result = await generateValidatedProse({
    hookName: 'director',
    systemCacheable: 'sys',
    prompt: 'write instructions',
    validate,
    fallback: 'fb',
    generateText: mock as any,
  });
  assert.equal(result.fromFallback, false);
  assert.equal(result.attempts, 2);
  assert.ok(seen[1].includes('YOUR PRIOR OUTPUT'));
  assert.ok(seen[1].includes('too short'));
});

test('returns fallback after exhausting retries', async () => {
  const mock = async () => 'short';
  const result = await generateValidatedProse({
    hookName: 'director',
    systemCacheable: 'sys',
    prompt: 'write',
    validate,
    fallback: 'FALLBACK',
    maxRetries: 2,
    generateText: mock as any,
  });
  assert.equal(result.fromFallback, true);
  assert.equal(result.text, 'FALLBACK');
  assert.equal(result.attempts, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm && npx tsx --test src/engine/compiler/llm-invocations/generateValidatedProse.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write the wrapper**

Create `src/engine/compiler/llm-invocations/generateValidatedProse.ts`:

```ts
/**
 * Prose-producing compile hook wrapper. Used by the director
 * instructions generator, which returns a system-prompt string rather
 * than executable code.
 *
 * @module paracosm/engine/compiler/llm-invocations/generateValidatedProse
 */
import type { GenerateTextFn } from '../types.js';
import type { CompilerTelemetry } from '../telemetry.js';

const MAX_PRIOR_OUTPUT_CHARS = 2000;

export type ProseValidator = (text: string) => { ok: true } | { ok: false; reason: string };

export interface ValidatedProseOptions {
  hookName: string;
  systemCacheable: string;
  prompt: string;
  validate: ProseValidator;
  fallback: string;
  maxRetries?: number;
  generateText: GenerateTextFn;
  telemetry?: CompilerTelemetry;
}

export interface ValidatedProseResult {
  text: string;
  attempts: number;
  fromFallback: boolean;
  failedRawText?: string;
  failedReason?: string;
}

function buildRetryPrompt(originalPrompt: string, priorText: string, reason: string): string {
  const excerpt = priorText.length > MAX_PRIOR_OUTPUT_CHARS
    ? priorText.slice(-MAX_PRIOR_OUTPUT_CHARS)
    : priorText;
  return `${originalPrompt}\n\nPrevious attempt failed: ${reason}\n\nYOUR PRIOR OUTPUT:\n\`\`\`\n${excerpt}\n\`\`\`\n\nFix the specific issue named above. Return ONLY the corrected text. No markdown fences, no explanation.`;
}

export async function generateValidatedProse(
  opts: ValidatedProseOptions,
): Promise<ValidatedProseResult> {
  const maxRetries = opts.maxRetries ?? 3;
  let lastRawText = '';
  let lastReason = '';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const prompt = attempt === 0
      ? opts.prompt
      : buildRetryPrompt(opts.prompt, lastRawText, lastReason);

    const text = await opts.generateText({
      system: [{ text: opts.systemCacheable, cacheBreakpoint: true }],
      prompt,
    });
    lastRawText = text;
    const cleaned = text.trim().replace(/^```(?:text)?\n?/i, '').replace(/\n?```$/i, '').trim();

    const verdict = opts.validate(cleaned);
    if (verdict.ok) {
      opts.telemetry?.recordAttempt(opts.hookName, attempt + 1, false);
      return { text: cleaned, attempts: attempt + 1, fromFallback: false };
    }
    lastReason = verdict.reason;
  }

  opts.telemetry?.recordFallback(opts.hookName, {
    rawText: lastRawText,
    reason: lastReason,
    attempts: maxRetries,
  });
  return {
    text: opts.fallback,
    attempts: maxRetries,
    fromFallback: true,
    failedRawText: lastRawText,
    failedReason: lastReason,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm && npx tsx --test src/engine/compiler/llm-invocations/generateValidatedProse.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/compiler/llm-invocations/generateValidatedProse.ts src/engine/compiler/llm-invocations/generateValidatedProse.test.ts
git commit -m "feat(compiler): generateValidatedProse wrapper for director hook

Prose equivalent of generateValidatedCode. Validate callback returns
{ok:false, reason} on failure so the retry prompt can name the
specific shortcoming in the prior output."
```

---

## Task 5: CompilerTelemetry

**Files:**
- Create: `src/engine/compiler/telemetry.ts`
- Create: `src/engine/compiler/telemetry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/engine/compiler/telemetry.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompilerTelemetry } from './telemetry.js';

test('recordAttempt increments calls + attempts', () => {
  const t = createCompilerTelemetry();
  t.recordAttempt('progression', 1, false);
  t.recordAttempt('progression', 2, false);
  const snap = t.snapshot();
  assert.equal(snap.schemaRetries['compile:progression'].calls, 2);
  assert.equal(snap.schemaRetries['compile:progression'].attempts, 3);
  assert.equal(snap.schemaRetries['compile:progression'].fallbacks, 0);
});

test('recordFallback increments fallbacks + appends to fallbacks array', () => {
  const t = createCompilerTelemetry();
  t.recordFallback('fingerprint', { rawText: 'bad output', reason: 'parse fail', attempts: 3 });
  const snap = t.snapshot();
  assert.equal(snap.schemaRetries['compile:fingerprint'].calls, 1);
  assert.equal(snap.schemaRetries['compile:fingerprint'].attempts, 3);
  assert.equal(snap.schemaRetries['compile:fingerprint'].fallbacks, 1);
  assert.equal(snap.fallbacks.length, 1);
  assert.equal(snap.fallbacks[0].hookName, 'fingerprint');
  assert.equal(snap.fallbacks[0].rawText, 'bad output');
  assert.equal(snap.fallbacks[0].attempts, 3);
});

test('multiple hook types aggregate independently', () => {
  const t = createCompilerTelemetry();
  t.recordAttempt('progression', 1, false);
  t.recordAttempt('fingerprint', 2, false);
  t.recordFallback('politics', { rawText: 'x', reason: 'y', attempts: 3 });
  const snap = t.snapshot();
  assert.equal(Object.keys(snap.schemaRetries).length, 3);
  assert.equal(snap.schemaRetries['compile:progression'].attempts, 1);
  assert.equal(snap.schemaRetries['compile:fingerprint'].attempts, 2);
  assert.equal(snap.schemaRetries['compile:politics'].fallbacks, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm && npx tsx --test src/engine/compiler/telemetry.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write the module**

Create `src/engine/compiler/telemetry.ts`:

```ts
/**
 * Compile-time telemetry aggregator. Collects attempts and fallbacks
 * per hook during a single compileScenario() invocation, then exposes
 * a snapshot shaped for /retry-stats ring-buffer persistence.
 *
 * Schema names are synthesized as `compile:<hookName>` so /retry-stats
 * can report compile + runtime schemas under one uniform rollup.
 *
 * @module paracosm/engine/compiler/telemetry
 */

export interface CompilerFallback {
  hookName: string;
  rawText: string;
  reason: string;
  attempts: number;
  timestamp: number;
}

export interface CompilerTelemetrySnapshot {
  schemaRetries: Record<string, { calls: number; attempts: number; fallbacks: number }>;
  fallbacks: CompilerFallback[];
}

export interface CompilerTelemetry {
  recordAttempt(hookName: string, attempts: number, fromFallback: boolean): void;
  recordFallback(hookName: string, details: { rawText: string; reason: string; attempts: number }): void;
  snapshot(): CompilerTelemetrySnapshot;
}

export function createCompilerTelemetry(): CompilerTelemetry {
  const schemaRetries: Record<string, { calls: number; attempts: number; fallbacks: number }> = {};
  const fallbacks: CompilerFallback[] = [];

  const bucket = (hookName: string) => {
    const key = `compile:${hookName}`;
    if (!schemaRetries[key]) schemaRetries[key] = { calls: 0, attempts: 0, fallbacks: 0 };
    return schemaRetries[key];
  };

  return {
    recordAttempt(hookName, attempts, fromFallback) {
      const b = bucket(hookName);
      b.calls += 1;
      b.attempts += attempts;
      if (fromFallback) b.fallbacks += 1;
    },
    recordFallback(hookName, details) {
      const b = bucket(hookName);
      b.calls += 1;
      b.attempts += details.attempts;
      b.fallbacks += 1;
      fallbacks.push({
        hookName,
        rawText: details.rawText,
        reason: details.reason,
        attempts: details.attempts,
        timestamp: Date.now(),
      });
    },
    snapshot() {
      return {
        schemaRetries: JSON.parse(JSON.stringify(schemaRetries)),
        fallbacks: [...fallbacks],
      };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm && npx tsx --test src/engine/compiler/telemetry.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/compiler/telemetry.ts src/engine/compiler/telemetry.test.ts
git commit -m "feat(compiler): CompilerTelemetry aggregator

Pluggable telemetry sink that counts per-hook attempts + fallbacks
and stores the raw text of each exhausted-retries failure for SSE
forwarding. Snapshot shape matches the runtime /retry-stats
schemaRetries rollup exactly."
```

---

## Task 6: Expand GenerateTextFn signature

**Files:**
- Modify: `src/engine/compiler/types.ts`
- Modify: `src/engine/compiler/index.ts`

- [ ] **Step 1: Extend the type**

Edit `src/engine/compiler/types.ts`. Replace the `GenerateTextFn` definition:

```ts
/**
 * Function signature for LLM text generation calls used by compile hooks.
 *
 * Supports two call shapes:
 *   - Legacy: pass a raw prompt string (no caching)
 *   - Cache-aware: pass { system, prompt } to route the stable prefix
 *     through cacheBreakpoint-tagged system blocks
 *
 * Wrappers in llm-invocations/ always use the cache-aware form; direct
 * callers (CLI scripts) can still use the string form.
 */
export type GenerateTextFn = (
  promptOrOptions:
    | string
    | {
        system?: Array<{ text: string; cacheBreakpoint?: boolean }>;
        prompt: string;
      },
) => Promise<string>;
```

Also add the `telemetry` field to `CompileOptions`:

```ts
import type { CompilerTelemetry } from './telemetry.js';
// ...
export interface CompileOptions {
  provider?: LlmProvider;
  model?: string;
  cache?: boolean;
  cacheDir?: string;
  generateText?: GenerateTextFn;
  onProgress?: (hookName: string, status: 'generating' | 'cached' | 'done' | 'fallback') => void;
  seedText?: string;
  seedUrl?: string;
  webSearch?: boolean;
  maxSearches?: number;
  /** Optional telemetry sink for validation fallback tracking. */
  telemetry?: CompilerTelemetry;
}
```

- [ ] **Step 2: Update buildDefaultGenerateText**

Edit `src/engine/compiler/index.ts`. Replace `buildDefaultGenerateText`:

```ts
async function buildDefaultGenerateText(provider: LlmProvider, model: string): Promise<GenerateTextFn> {
  const { generateText } = await import('@framers/agentos');
  return async (promptOrOptions) => {
    if (typeof promptOrOptions === 'string') {
      const r = await generateText({ provider, model, prompt: promptOrOptions });
      return r.text;
    }
    const r = await generateText({
      provider,
      model,
      system: promptOrOptions.system,
      prompt: promptOrOptions.prompt,
    });
    return r.text;
  };
}
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm && npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`
Expected: Existing errors only (no new ones introduced)

- [ ] **Step 4: Commit**

```bash
git add src/engine/compiler/types.ts src/engine/compiler/index.ts
git commit -m "feat(compiler): cache-aware GenerateTextFn signature + telemetry option

Expands the function type to accept either a raw prompt string
(backward compat) or { system, prompt } so wrappers can thread
cacheBreakpoint-tagged system blocks through to AgentOS."
```

---

## Task 7: Migrate milestones hook

**Files:**
- Modify: `src/engine/compiler/generate-milestones.ts`
- Modify: `src/engine/compiler/cache.ts`

- [ ] **Step 1: Read the current cache module to understand signature hashing**

Run: `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm && head -60 src/engine/compiler/cache.ts`

Note where the signature is computed.

- [ ] **Step 2: Bump compile schema version in cache.ts**

Edit `src/engine/compiler/cache.ts`. At the top of the module, add:

```ts
/**
 * Bump this to invalidate cached hook sources after a prompt-format
 * change. Milestones migrated from JSON array to object shape at v2.
 */
export const COMPILE_SCHEMA_VERSION = 2;
```

Then find the function that builds the signature (likely `readCache` / `writeCache` internals or a `signature()` helper) and append `-v${COMPILE_SCHEMA_VERSION}` to the signature string. If the signature is a hash input, append `COMPILE_SCHEMA_VERSION.toString()` to that input.

- [ ] **Step 3: Rewrite generate-milestones.ts to use generateValidatedObject + MilestonesSchema**

Replace the full contents of `src/engine/compiler/generate-milestones.ts`:

```ts
/**
 * Generate milestone crises (turn 1 founding + final turn assessment)
 * from scenario JSON via Zod-validated LLM call.
 *
 * @module paracosm/engine/compiler/generate-milestones
 */
import type { MilestoneEventDef } from '../types.js';
import type { GenerateTextFn } from './types.js';
import type { CompilerTelemetry } from './telemetry.js';
import { MilestonesSchema } from './schemas/milestones.js';
import { generateValidatedObject } from './llm-invocations/generateValidatedObject.js';

function buildSystemBlock(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const depts = (scenarioJson.departments ?? []).map((d: any) => d.id).join(', ');
  return `You are generating milestone crises for a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'}
SETTLEMENT TYPE: ${labels.settlementNoun ?? 'settlement'}
POPULATION NOUN: ${labels.populationNoun ?? 'members'}
DEPARTMENTS: ${depts}
DEFAULT TURNS: ${scenarioJson.setup?.defaultTurns ?? 12}

Output shape:
{
  "founding": { Milestone },
  "legacy":   { Milestone }
}

Milestone shape:
{
  "title": string,
  "crisis": string,
  "options": [
    { "id": "option_a" | "option_b" | "option_c", "label": string, "description": string, "isRisky": boolean }
  ],
  "riskyOptionId": string (MUST reference an option where isRisky=true),
  "riskSuccessProbability": number in [0.3, 0.8],
  "category": string,
  "researchKeywords": string[],
  "relevantDepartments": string[],
  "turnSummary": string
}

Rules:
1. "founding" is turn 1. The population_noun arrive at the settlement_noun and must make their first major decision.
2. "legacy" is the final turn. The settlement submits a comprehensive status report.
3. Each milestone needs exactly 2-3 options, one with isRisky=true.
4. riskyOptionId MUST name an option whose isRisky is true.
5. Research keywords ground in real science/domain knowledge.`;
}

const userPrompt = 'Generate the founding and legacy milestones now. Return ONLY valid JSON matching the schema.';

function fallbackMilestones(scenarioJson: Record<string, any>): {
  founding: MilestoneEventDef;
  legacy: MilestoneEventDef;
} {
  const labels = scenarioJson.labels ?? {};
  const founding: MilestoneEventDef = {
    title: 'Founding',
    description: `The ${labels.populationNoun ?? 'members'} have arrived at the ${labels.settlementNoun ?? 'settlement'}.`,
    crisis: `The ${labels.populationNoun ?? 'members'} have arrived at the ${labels.settlementNoun ?? 'settlement'}. Choose your initial strategy.`,
    options: [
      { id: 'option_a', label: 'Conservative Start', description: 'Establish a safe, stable foundation', isRisky: false },
      { id: 'option_b', label: 'Ambitious Start', description: 'Push for rapid expansion with higher risk', isRisky: true },
    ],
    riskyOptionId: 'option_b',
    riskSuccessProbability: 0.6,
    category: 'infrastructure',
    researchKeywords: [labels.settlementNoun ?? 'settlement'],
    relevantDepartments: (scenarioJson.departments ?? []).slice(0, 2).map((d: any) => d.id),
    turnSummary: `The ${labels.settlementNoun ?? 'settlement'} is founded. First decisions shape everything.`,
  };
  const legacy: MilestoneEventDef = {
    title: 'Legacy Assessment',
    description: `Submit a comprehensive status report on the ${labels.settlementNoun ?? 'settlement'}.`,
    crisis: `Submit a comprehensive status report on the ${labels.settlementNoun ?? 'settlement'}.`,
    options: [
      { id: 'option_a', label: 'Honest Assessment', description: 'Report factually, including failures', isRisky: false },
      { id: 'option_b', label: 'Ambitious Projection', description: 'Emphasize achievements, propose bold vision', isRisky: true },
    ],
    riskyOptionId: 'option_b',
    riskSuccessProbability: 0.5,
    category: 'political',
    researchKeywords: [],
    relevantDepartments: (scenarioJson.departments ?? []).slice(0, 3).map((d: any) => d.id),
    turnSummary: 'Time for a comprehensive assessment.',
  };
  return { founding, legacy };
}

/** Parse a cached milestones source back into the two milestones. */
export function parseMilestones(text: string): [MilestoneEventDef, MilestoneEventDef] | null {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    // Accept object shape (new) and array shape (legacy) for cache back-compat
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.founding && parsed.legacy) {
      return [parsed.founding, parsed.legacy];
    }
    if (Array.isArray(parsed) && parsed.length >= 2 && parsed[0]?.title && parsed[1]?.title) {
      return [parsed[0], parsed[1]];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Options for generateMilestones. `provider` + `model` are required so
 * the compiler can route through AgentOS generateObject (schema-aware
 * retry). `generateText` stays in the signature for back-compat with
 * external callers that inject a custom LLM, but is unused in the
 * default path.
 */
export interface GenerateMilestonesOptions {
  provider: string;
  model: string;
  telemetry?: CompilerTelemetry;
  onUsage?: (r: { usage?: unknown }) => void;
}

export async function generateMilestones(
  scenarioJson: Record<string, any>,
  _generateText: GenerateTextFn,  // legacy param; default path uses generateObject directly
  opts: GenerateMilestonesOptions,
): Promise<{ hook: (turn: number, maxTurns: number) => MilestoneEventDef | null; source: string; attempts: number; fromFallback: boolean }> {
  const fallback = fallbackMilestones(scenarioJson);
  const result = await generateValidatedObject({
    provider: opts.provider,
    model: opts.model,
    schema: MilestonesSchema,
    schemaName: 'compile:milestones',
    systemCacheable: buildSystemBlock(scenarioJson),
    prompt: userPrompt,
    fallback,
    onUsage: opts.onUsage,
    onValidationFallback: (details) => {
      opts.telemetry?.recordFallback('milestones', {
        rawText: details.rawText,
        reason: (details.err instanceof Error ? details.err.message : String(details.err)).slice(0, 500),
        attempts: 3,
      });
    },
  });

  if (!result.fromFallback) {
    opts.telemetry?.recordAttempt('milestones', result.attempts, false);
  }

  const { founding, legacy } = result.object as { founding: MilestoneEventDef; legacy: MilestoneEventDef };
  return {
    hook: (turn, maxTurns) => {
      if (turn === 1) return founding;
      if (turn === maxTurns) return legacy;
      return null;
    },
    source: JSON.stringify({ founding, legacy }, null, 2),
    attempts: result.attempts,
    fromFallback: result.fromFallback,
  };
}
```

- [ ] **Step 4: Update the call site in index.ts**

Edit `src/engine/compiler/index.ts`. In the milestones branch of the for-loop (around line 166):

```ts
case 'milestones': {
  const result = await generateMilestones(json, genText, {
    provider,
    model,
    telemetry: options.telemetry,
  });
  hooks.getMilestoneEvent = result.hook;
  if (cache) writeCache(json, hookName, result.source, model, cacheDir);
  break;
}
```

- [ ] **Step 5: Type-check**

Run: `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "generate-milestones|compiler/index"`
Expected: no errors in these files

- [ ] **Step 6: Commit**

```bash
git add src/engine/compiler/generate-milestones.ts src/engine/compiler/cache.ts src/engine/compiler/index.ts
git commit -m "feat(compiler): route milestones through generateValidatedObject + Zod

Milestones prompt switches from [founding, legacy] array shape to
{ founding, legacy } object shape so OpenAI response_format works.
Cache version bumps to 2 to invalidate legacy array entries.
parseMilestones accepts both shapes for back-compat on unmigrated
caches."
```

---

## Task 8: Migrate progression hook

**Files:**
- Modify: `src/engine/compiler/generate-progression.ts`
- Modify: `src/engine/compiler/index.ts`

- [ ] **Step 1: Rewrite generate-progression.ts using generateValidatedCode**

Replace the body of `generateProgressionHook`. Split `buildPrompt` into stable + user parts:

```ts
/**
 * Generate a progression hook from scenario JSON via
 * generateValidatedCode (schema-validated code wrapper).
 *
 * @module paracosm/engine/compiler/generate-progression
 */
import type { ProgressionHookContext } from '../types.js';
import type { GenerateTextFn } from './types.js';
import type { CompilerTelemetry } from './telemetry.js';
import { generateValidatedCode } from './llm-invocations/generateValidatedCode.js';

function buildSystemBlock(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const env = scenarioJson.world?.environment ?? {};
  const depts = (scenarioJson.departments ?? []).map((d: any) => d.id).join(', ');
  return `You are generating a between-turn progression hook for a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'} — ${labels.settlementNoun ?? 'settlement'} simulation
POPULATION NOUN: ${labels.populationNoun ?? 'members'}
SETTLEMENT: ${labels.settlementNoun ?? 'settlement'}
ENVIRONMENT VARIABLES: ${JSON.stringify(env, null, 2)}
DEPARTMENTS: ${depts}

Function signature: (ctx: ProgressionHookContext) => void
ctx shape:
- ctx.agents: array of { core: { marsborn, birthYear, name }, health: { alive, boneDensityPct, cumulativeRadiationMsv, psychScore } }
- ctx.yearDelta: number (simulated years since last turn)
- ctx.year, ctx.turn, ctx.startYear: number
- ctx.rng: { chance(p): bool, next(): number, pick<T>(arr): T, int(min, max): number }

Rules:
1. Only modify health on ALIVE agents (check c.health.alive)
2. Domain-appropriate degradation for this scenario
3. Multiply time-scaled effects by ctx.yearDelta
4. Use Math.max/Math.min to keep: boneDensityPct in [0,100], psychScore in [0,1], cumulativeRadiationMsv >= 0
5. NO external imports, NO require
6. Use ctx.rng.chance(p) for probabilistic effects, not Math.random`;
}

const userPrompt = `Return ONLY the complete arrow function. No markdown fences. Example:
(ctx) => { for (const c of ctx.agents) { if (!c.health.alive) continue; /* effects */ } }`;

export function parseResponse(text: string): ((ctx: ProgressionHookContext) => void) | null {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:typescript|ts|javascript|js)?\n?/i, '').replace(/\n?```$/i, '').trim();
  if (cleaned.endsWith(';')) cleaned = cleaned.slice(0, -1).trim();
  try {
    const fn = new Function('return ' + cleaned)();
    if (typeof fn === 'function') return fn;
    return null;
  } catch {
    try {
      const fn = new Function('ctx', cleaned);
      return (ctx: ProgressionHookContext) => fn(ctx);
    } catch {
      return null;
    }
  }
}

function smokeTest(fn: (ctx: ProgressionHookContext) => void): void {
  const testColonists = [
    { core: { marsborn: false, birthYear: 2010, name: 'Test' }, health: { alive: true, boneDensityPct: 95, cumulativeRadiationMsv: 100, psychScore: 0.7 }, career: {}, social: {}, narrative: {}, hexaco: {} },
    { core: { marsborn: false, birthYear: 2010, name: 'Dead' }, health: { alive: false, boneDensityPct: 80, cumulativeRadiationMsv: 50, psychScore: 0.5 }, career: {}, social: {}, narrative: {}, hexaco: {} },
  ];
  fn({
    agents: testColonists as any,
    yearDelta: 4,
    year: 2045,
    turn: 3,
    startYear: 2035,
    rng: { chance: () => false, next: () => 0.5, pick: (arr: any) => arr[0], int: (min: number, _max: number) => min },
  } as ProgressionHookContext);
}

const fallback: (ctx: ProgressionHookContext) => void = () => {};

export interface GenerateProgressionOptions {
  telemetry?: CompilerTelemetry;
}

export async function generateProgressionHook(
  scenarioJson: Record<string, any>,
  generateText: GenerateTextFn,
  options: GenerateProgressionOptions = {},
): Promise<{ hook: (ctx: ProgressionHookContext) => void; source: string; attempts: number; fromFallback: boolean }> {
  const result = await generateValidatedCode<(ctx: ProgressionHookContext) => void>({
    hookName: 'progression',
    systemCacheable: buildSystemBlock(scenarioJson),
    prompt: userPrompt,
    parse: parseResponse,
    smokeTest,
    fallback,
    fallbackSource: '// No-op: generation failed',
    generateText,
    telemetry: options.telemetry,
  });
  return { hook: result.hook, source: result.source, attempts: result.attempts, fromFallback: result.fromFallback };
}
```

- [ ] **Step 2: Update the call site in index.ts**

```ts
case 'progression': {
  const result = await generateProgressionHook(json, genText, { telemetry: options.telemetry });
  hooks.progressionHook = result.hook;
  if (cache) writeCache(json, hookName, result.source, model, cacheDir);
  break;
}
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "generate-progression"`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/engine/compiler/generate-progression.ts src/engine/compiler/index.ts
git commit -m "feat(compiler): route progression hook through generateValidatedCode"
```

---

## Task 9: Migrate prompts hook

**Files:**
- Modify: `src/engine/compiler/generate-prompts.ts`
- Modify: `src/engine/compiler/index.ts`

- [ ] **Step 1: Rewrite generateDepartmentPromptHook using generateValidatedCode**

Replace the body of `src/engine/compiler/generate-prompts.ts`:

```ts
/**
 * Generate a department prompt hook from scenario JSON via
 * generateValidatedCode.
 *
 * @module paracosm/engine/compiler/generate-prompts
 */
import type { GenerateTextFn } from './types.js';
import type { CompilerTelemetry } from './telemetry.js';
import { generateValidatedCode } from './llm-invocations/generateValidatedCode.js';

function buildSystemBlock(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const depts = (scenarioJson.departments ?? []).map((d: any) => `- ${d.id}: ${d.label} (${d.role}) — ${d.instructions}`).join('\n');
  return `You are generating a department prompt hook for a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'} — ${labels.settlementNoun ?? 'settlement'} simulation
DEPARTMENTS:
${depts}

Function signature: (ctx) => string[]
ctx shape:
- ctx.department: string (department ID)
- ctx.state: { agents, colony, politics, metadata: { currentYear } }
- ctx.scenario: any
- ctx.researchPacket: { canonicalFacts[], counterpoints[], departmentNotes }

For each department, compute and return 2-4 lines of scenario-relevant stats from ctx.state.

Rules:
1. Switch on ctx.department with a case per department ID listed above.
2. Access ctx.state.agents (filter alive), ctx.state.colony, ctx.state.politics.
3. Return string[]; empty array for unknown departments.
4. NO external imports.`;
}

const userPrompt = 'Return ONLY the arrow function. No markdown fences, no explanation.';

export function parseResponse(text: string): ((ctx: any) => string[]) | null {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:typescript|ts|javascript|js)?\n?/i, '').replace(/\n?```$/i, '').trim();
  if (cleaned.endsWith(';')) cleaned = cleaned.slice(0, -1).trim();
  try {
    const fn = new Function('return ' + cleaned)();
    return typeof fn === 'function' ? fn : null;
  } catch {
    return null;
  }
}

function smokeTest(scenarioJson: Record<string, any>): (fn: (ctx: any) => string[]) => void {
  return (fn) => {
    const deptId = (scenarioJson.departments ?? [])[0]?.id ?? 'engineering';
    const result = fn({
      department: deptId,
      state: {
        agents: [{ core: { name: 'Test' }, health: { alive: true, boneDensityPct: 90, cumulativeRadiationMsv: 100, psychScore: 0.7 } }],
        colony: { morale: 0.6, population: 80, foodMonthsReserve: 6, powerKw: 300, infrastructureModules: 10, scienceOutput: 5, lifeSupportCapacity: 100 },
        politics: { earthDependencyPct: 50, governanceStatus: 'colonial' },
        metadata: { currentYear: 2045 },
      },
      scenario: scenarioJson,
      researchPacket: { canonicalFacts: [], counterpoints: [], departmentNotes: {} },
    });
    if (!Array.isArray(result)) throw new Error('Must return an array of strings');
  };
}

function buildFallback(scenarioJson: Record<string, any>): (ctx: any) => string[] {
  return (ctx) => [`[${ctx.department}] No scenario-specific context available.`];
}

export interface GeneratePromptsOptions {
  telemetry?: CompilerTelemetry;
}

export async function generateDepartmentPromptHook(
  scenarioJson: Record<string, any>,
  generateText: GenerateTextFn,
  options: GeneratePromptsOptions = {},
): Promise<{ hook: (ctx: any) => string[]; source: string; attempts: number; fromFallback: boolean }> {
  const result = await generateValidatedCode<(ctx: any) => string[]>({
    hookName: 'prompts',
    systemCacheable: buildSystemBlock(scenarioJson),
    prompt: userPrompt,
    parse: parseResponse,
    smokeTest: smokeTest(scenarioJson),
    fallback: buildFallback(scenarioJson),
    fallbackSource: '// Fallback department prompts',
    generateText,
    telemetry: options.telemetry,
  });
  return { hook: result.hook, source: result.source, attempts: result.attempts, fromFallback: result.fromFallback };
}
```

- [ ] **Step 2: Update the call site in index.ts**

```ts
case 'prompts': {
  const result = await generateDepartmentPromptHook(json, genText, { telemetry: options.telemetry });
  hooks.departmentPromptHook = result.hook;
  if (cache) writeCache(json, hookName, result.source, model, cacheDir);
  break;
}
```

- [ ] **Step 3: Type-check and commit**

Run: `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "generate-prompts"`
Expected: no errors

```bash
git add src/engine/compiler/generate-prompts.ts src/engine/compiler/index.ts
git commit -m "feat(compiler): route department prompts through generateValidatedCode"
```

---

## Task 10: Migrate fingerprint hook

**Files:**
- Modify: `src/engine/compiler/generate-fingerprint.ts`
- Modify: `src/engine/compiler/index.ts`

- [ ] **Step 1: Rewrite generateFingerprintHook using generateValidatedCode**

Replace body of `src/engine/compiler/generate-fingerprint.ts`:

```ts
/**
 * Generate a fingerprint hook from scenario JSON via generateValidatedCode.
 *
 * @module paracosm/engine/compiler/generate-fingerprint
 */
import type { GenerateTextFn } from './types.js';
import type { CompilerTelemetry } from './telemetry.js';
import { generateValidatedCode } from './llm-invocations/generateValidatedCode.js';

type FingerprintFn = (finalState: any, outcomeLog: any[], leader: any, toolRegs: Record<string, string[]>, maxTurns: number) => Record<string, string>;

function buildSystemBlock(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const depts = (scenarioJson.departments ?? []).map((d: any) => d.id).join(', ');
  return `You are generating a timeline fingerprint hook for a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'} — ${labels.settlementNoun ?? 'settlement'} simulation
DEPARTMENTS: ${depts}

Function signature: (finalState, outcomeLog, leader, toolRegs, maxTurns) => Record<string, string>

Inputs:
- finalState: { agents, colony, politics, metadata: { currentYear, startYear } }
- outcomeLog: [{ turn, year, outcome: 'risky_success' | 'risky_failure' | 'conservative_success' | 'conservative_failure' }]
- leader: { name, archetype, hexaco }
- toolRegs: Record<dept, string[]> (department -> tool names)
- maxTurns: number

Output: object with 5-7 classification dimensions (each 2-3 possible values e.g. "resilient" | "brittle") PLUS a "summary" key joining them with " · ".

Rules:
1. Scenario-relevant classification names (not Mars-specific)
2. Base classifications on final state, outcome patterns, leader personality
3. Always include "summary"
4. NO external imports`;
}

const userPrompt = 'Return ONLY the arrow function. No markdown fences.';

export function parseResponse(text: string): FingerprintFn | null {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:typescript|ts|javascript|js)?\n?/i, '').replace(/\n?```$/i, '').trim();
  if (cleaned.endsWith(';')) cleaned = cleaned.slice(0, -1).trim();
  try {
    const fn = new Function('return ' + cleaned)();
    return typeof fn === 'function' ? fn : null;
  } catch {
    return null;
  }
}

function smokeTest(fn: FingerprintFn): void {
  const result = fn(
    { agents: [], colony: { morale: 0.6, population: 80 }, politics: { earthDependencyPct: 50 }, metadata: { currentYear: 2070, startYear: 2035 } },
    [{ turn: 1, year: 2035, outcome: 'conservative_success' }],
    { name: 'Test', archetype: 'test', hexaco: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5 } },
    { engineering: ['tool1'] },
    8,
  );
  if (typeof result !== 'object' || !result.summary) {
    throw new Error('Fingerprint must return object with summary key');
  }
}

const fallback: FingerprintFn = (_fs, outcomeLog, leader, toolRegs, maxTurns) => {
  const riskyWins = outcomeLog.filter(o => o.outcome === 'risky_success').length;
  const riskyLosses = outcomeLog.filter(o => o.outcome === 'risky_failure').length;
  const conservativeWins = outcomeLog.filter(o => o.outcome === 'conservative_success').length;
  const totalTools = Object.values(toolRegs).flat().length;
  const riskProfile = riskyWins + riskyLosses > conservativeWins ? 'expansionist' : 'conservative';
  const innovation = totalTools > maxTurns * 2 ? 'innovative' : totalTools > maxTurns ? 'adaptive' : 'conventional';
  const leadership = leader.hexaco?.extraversion > 0.7 ? 'charismatic' : leader.hexaco?.conscientiousness > 0.7 ? 'methodical' : 'collaborative';
  const summary = `${riskProfile} · ${innovation} · ${leadership}`;
  return { riskProfile, innovation, leadership, summary };
};

export interface GenerateFingerprintOptions {
  telemetry?: CompilerTelemetry;
}

export async function generateFingerprintHook(
  scenarioJson: Record<string, any>,
  generateText: GenerateTextFn,
  options: GenerateFingerprintOptions = {},
): Promise<{ hook: FingerprintFn; source: string; attempts: number; fromFallback: boolean }> {
  const result = await generateValidatedCode<FingerprintFn>({
    hookName: 'fingerprint',
    systemCacheable: buildSystemBlock(scenarioJson),
    prompt: userPrompt,
    parse: parseResponse,
    smokeTest,
    fallback,
    fallbackSource: '// Fallback fingerprint',
    generateText,
    telemetry: options.telemetry,
  });
  return { hook: result.hook, source: result.source, attempts: result.attempts, fromFallback: result.fromFallback };
}
```

- [ ] **Step 2: Update the call site in index.ts**

```ts
case 'fingerprint': {
  const result = await generateFingerprintHook(json, genText, { telemetry: options.telemetry });
  hooks.fingerprintHook = result.hook;
  if (cache) writeCache(json, hookName, result.source, model, cacheDir);
  break;
}
```

- [ ] **Step 3: Type-check and commit**

Run: `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "generate-fingerprint"`
Expected: no errors

```bash
git add src/engine/compiler/generate-fingerprint.ts src/engine/compiler/index.ts
git commit -m "feat(compiler): route fingerprint hook through generateValidatedCode"
```

---

## Task 11: Migrate politics hook

**Files:**
- Modify: `src/engine/compiler/generate-politics.ts`
- Modify: `src/engine/compiler/index.ts`

- [ ] **Step 1: Rewrite generatePoliticsHook**

Replace body of `src/engine/compiler/generate-politics.ts`:

```ts
/**
 * Generate a politics hook from scenario JSON via generateValidatedCode.
 *
 * @module paracosm/engine/compiler/generate-politics
 */
import type { GenerateTextFn } from './types.js';
import type { CompilerTelemetry } from './telemetry.js';
import { generateValidatedCode } from './llm-invocations/generateValidatedCode.js';

type PoliticsFn = (category: string, outcome: string) => Record<string, number> | null;

function buildSystemBlock(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const effects = scenarioJson.effects ?? {};
  const categories = typeof effects === 'object' && !Array.isArray(effects)
    ? Object.keys(effects)
    : [];
  return `You are generating a politics hook for a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'} — ${labels.settlementNoun ?? 'settlement'} simulation
CRISIS CATEGORIES: ${categories.join(', ')}

Function signature: (category, outcome) => Record<string, number> | null

Return:
- null for non-political categories
- Record<string, number> of politics field deltas for political/social categories

Rules:
1. Success → push toward independence/autonomy
2. Failure → push toward dependency/instability
3. 1-3 politics fields appropriate to this scenario
4. Small deltas (0.01-0.10 for pct, 1-5 for ints)
5. NO external imports`;
}

const userPrompt = 'Return ONLY the arrow function. No markdown fences.';

export function parseResponse(text: string): PoliticsFn | null {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:typescript|ts|javascript|js)?\n?/i, '').replace(/\n?```$/i, '').trim();
  if (cleaned.endsWith(';')) cleaned = cleaned.slice(0, -1).trim();
  try {
    const fn = new Function('return ' + cleaned)();
    return typeof fn === 'function' ? fn : null;
  } catch {
    return null;
  }
}

function smokeTest(fn: PoliticsFn): void {
  const political = fn('political', 'risky_success');
  if (political !== null && typeof political !== 'object') {
    throw new Error('Political result must be null or object');
  }
}

const fallback: PoliticsFn = () => null;

export interface GeneratePoliticsOptions {
  telemetry?: CompilerTelemetry;
}

export async function generatePoliticsHook(
  scenarioJson: Record<string, any>,
  generateText: GenerateTextFn,
  options: GeneratePoliticsOptions = {},
): Promise<{ hook: PoliticsFn; source: string; attempts: number; fromFallback: boolean }> {
  const result = await generateValidatedCode<PoliticsFn>({
    hookName: 'politics',
    systemCacheable: buildSystemBlock(scenarioJson),
    prompt: userPrompt,
    parse: parseResponse,
    smokeTest,
    fallback,
    fallbackSource: '// No-op: generation failed',
    generateText,
    telemetry: options.telemetry,
  });
  return { hook: result.hook, source: result.source, attempts: result.attempts, fromFallback: result.fromFallback };
}
```

- [ ] **Step 2: Update call site in index.ts**

```ts
case 'politics': {
  const result = await generatePoliticsHook(json, genText, { telemetry: options.telemetry });
  hooks.politicsHook = result.hook;
  if (cache) writeCache(json, hookName, result.source, model, cacheDir);
  break;
}
```

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "generate-politics"
git add src/engine/compiler/generate-politics.ts src/engine/compiler/index.ts
git commit -m "feat(compiler): route politics hook through generateValidatedCode"
```

---

## Task 12: Migrate reactions hook

**Files:**
- Modify: `src/engine/compiler/generate-reactions.ts`
- Modify: `src/engine/compiler/index.ts`

- [ ] **Step 1: Rewrite generateReactionContextHook**

Replace body of `src/engine/compiler/generate-reactions.ts`:

```ts
/**
 * Generate a reaction context hook from scenario JSON via generateValidatedCode.
 *
 * @module paracosm/engine/compiler/generate-reactions
 */
import type { GenerateTextFn } from './types.js';
import type { CompilerTelemetry } from './telemetry.js';
import { generateValidatedCode } from './llm-invocations/generateValidatedCode.js';

type ReactionContextFn = (colonist: any, ctx: any) => string;

function buildSystemBlock(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  return `You are generating a reaction context hook for a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'} — ${labels.settlementNoun ?? 'settlement'} simulation
POPULATION NOUN: ${labels.populationNoun ?? 'members'}
START YEAR: ${scenarioJson.setup?.defaultStartYear ?? 2035}

Function signature: (colonist, ctx) => string

Inputs:
- colonist: { core: { marsborn, birthYear, name }, health: { alive, boneDensityPct, cumulativeRadiationMsv, psychScore } }
- ctx: { year, turn }

Return a 1-3 sentence string providing identity + health context for a ${labels.populationNoun ?? 'member'} reaction prompt.

Rules:
1. Return a string, not an object
2. 1-3 short sentences
3. Reference scenario-specific health concerns
4. NO external imports`;
}

const userPrompt = 'Return ONLY the arrow function. No markdown fences.';

export function parseResponse(text: string): ReactionContextFn | null {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:typescript|ts|javascript|js)?\n?/i, '').replace(/\n?```$/i, '').trim();
  if (cleaned.endsWith(';')) cleaned = cleaned.slice(0, -1).trim();
  try {
    const fn = new Function('return ' + cleaned)();
    return typeof fn === 'function' ? fn : null;
  } catch {
    return null;
  }
}

function smokeTest(fn: ReactionContextFn): void {
  const result = fn(
    { core: { marsborn: false, birthYear: 2010, name: 'Test' }, health: { alive: true, boneDensityPct: 80, cumulativeRadiationMsv: 200, psychScore: 0.6 } },
    { year: 2045, turn: 3 },
  );
  if (typeof result !== 'string') throw new Error('Must return a string');
}

function buildFallback(scenarioJson: Record<string, any>): ReactionContextFn {
  const labels = scenarioJson.labels ?? {};
  return (colonist, ctx) => {
    const lines: string[] = [];
    if (colonist.core?.marsborn) {
      lines.push(`Born at the ${labels.settlementNoun ?? 'settlement'}.`);
    } else {
      lines.push(`Arrived ${ctx.year - (scenarioJson.setup?.defaultStartYear ?? 2035)} years ago.`);
    }
    if (colonist.health?.psychScore < 0.4) lines.push('Struggling with low morale.');
    return lines.join(' ');
  };
}

export interface GenerateReactionsOptions {
  telemetry?: CompilerTelemetry;
}

export async function generateReactionContextHook(
  scenarioJson: Record<string, any>,
  generateText: GenerateTextFn,
  options: GenerateReactionsOptions = {},
): Promise<{ hook: ReactionContextFn; source: string; attempts: number; fromFallback: boolean }> {
  const result = await generateValidatedCode<ReactionContextFn>({
    hookName: 'reactions',
    systemCacheable: buildSystemBlock(scenarioJson),
    prompt: userPrompt,
    parse: parseResponse,
    smokeTest,
    fallback: buildFallback(scenarioJson),
    fallbackSource: '// Fallback reaction context',
    generateText,
    telemetry: options.telemetry,
  });
  return { hook: result.hook, source: result.source, attempts: result.attempts, fromFallback: result.fromFallback };
}
```

- [ ] **Step 2: Update call site in index.ts**

```ts
case 'reactions': {
  const result = await generateReactionContextHook(json, genText, { telemetry: options.telemetry });
  hooks.reactionContextHook = result.hook;
  if (cache) writeCache(json, hookName, result.source, model, cacheDir);
  break;
}
```

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "generate-reactions"
git add src/engine/compiler/generate-reactions.ts src/engine/compiler/index.ts
git commit -m "feat(compiler): route reactions context hook through generateValidatedCode"
```

---

## Task 13: Migrate director hook

**Files:**
- Modify: `src/engine/compiler/generate-director.ts`
- Modify: `src/engine/compiler/index.ts`

- [ ] **Step 1: Find runtime's DEFAULT_DIRECTOR_INSTRUCTIONS for the fallback**

Run: `grep -n "DEFAULT_DIRECTOR_INSTRUCTIONS" src/runtime/director.ts | head -3`

Expected output includes a line like `export const DEFAULT_DIRECTOR_INSTRUCTIONS = ` near line 93.

Since engine cannot import from runtime, copy the content of that constant into the director fallback, or inline a ~300-word canonical fallback that mirrors it.

- [ ] **Step 2: Rewrite generateDirectorInstructions**

Replace body of `src/engine/compiler/generate-director.ts`:

```ts
/**
 * Generate Crisis Director system instructions via generateValidatedProse.
 *
 * @module paracosm/engine/compiler/generate-director
 */
import type { GenerateTextFn } from './types.js';
import type { CompilerTelemetry } from './telemetry.js';
import { generateValidatedProse } from './llm-invocations/generateValidatedProse.js';

function buildSystemBlock(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const depts = (scenarioJson.departments ?? []).map((d: any) => `- ${d.id}: ${d.label} (${d.role})`).join('\n');
  const effects = scenarioJson.effects ?? {};
  const categories = typeof effects === 'object' && !Array.isArray(effects)
    ? Object.keys(effects)
    : (effects as any[]).flatMap?.((e: any) => Object.keys(e.categoryDefaults ?? {})) ?? [];
  return `You are generating system instructions for a Crisis Director agent in a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'}
SETTLEMENT TYPE: ${labels.settlementNoun ?? 'settlement'}
POPULATION NOUN: ${labels.populationNoun ?? 'members'}
DEPARTMENTS:
${depts}
CRISIS CATEGORIES: ${categories.join(', ')}

The instructions you produce must:
1. Explain the Director's role: observe ${labels.settlementNoun} state and generate crises
2. List rules (2-3 options per crisis, one risky; reference real science; escalate from prior decisions; calibrate to ${labels.settlementNoun} state)
3. List ALL crisis categories with brief descriptions relevant to this scenario
4. List ALL available departments by exact ID (use ONLY the department IDs listed above)
5. Specify the JSON output format: {"title","crisis","options":[{"id","label","description","isRisky"}],"riskyOptionId","riskSuccessProbability","category","researchKeywords","relevantDepartments","turnSummary"}`;
}

const userPrompt = 'Return ONLY the instructions text. No markdown fences. No code. Just the system prompt text the Director agent will receive.';

function buildValidator(scenarioJson: Record<string, any>): (text: string) => { ok: true } | { ok: false; reason: string } {
  const deptIds = (scenarioJson.departments ?? []).map((d: any) => d.id);
  const minMentions = Math.min(2, deptIds.length);
  return (text: string) => {
    if (text.length < 200) return { ok: false, reason: `instructions too short (${text.length} chars, need ≥ 200)` };
    const mentioned = deptIds.filter((id: string) => text.toLowerCase().includes(id.toLowerCase()));
    if (mentioned.length < minMentions) {
      return { ok: false, reason: `instructions mention only ${mentioned.length} of ${deptIds.length} department IDs (need ≥ ${minMentions})` };
    }
    return { ok: true };
  };
}

function buildFallback(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const deptList = (scenarioJson.departments ?? []).map((d: any) => d.id).join(', ');
  return `You are the Crisis Director for a ${labels.settlementNoun ?? 'settlement'} simulation. Your role: observe the state of the ${labels.settlementNoun ?? 'settlement'} each turn and generate one crisis event.

Rules:
1. Each crisis must have 2-3 options; one MUST be isRisky=true.
2. Ground descriptions in real science and domain references.
3. Escalate from prior turn outcomes. Do not repeat crisis categories consecutively.
4. Calibrate difficulty to current state (resources, morale, population).
5. Identify relevantDepartments from this fixed list: ${deptList}.

Return JSON with fields: title, crisis, options[{id,label,description,isRisky}], riskyOptionId, riskSuccessProbability (0.3-0.8), category, researchKeywords, relevantDepartments, turnSummary.`;
}

export interface GenerateDirectorOptions {
  telemetry?: CompilerTelemetry;
}

export async function generateDirectorInstructions(
  scenarioJson: Record<string, any>,
  generateText: GenerateTextFn,
  options: GenerateDirectorOptions = {},
): Promise<{ hook: () => string; source: string; attempts: number; fromFallback: boolean }> {
  const result = await generateValidatedProse({
    hookName: 'director',
    systemCacheable: buildSystemBlock(scenarioJson),
    prompt: userPrompt,
    validate: buildValidator(scenarioJson),
    fallback: buildFallback(scenarioJson),
    generateText,
    telemetry: options.telemetry,
  });
  return {
    hook: () => result.text,
    source: result.text,
    attempts: result.attempts,
    fromFallback: result.fromFallback,
  };
}
```

- [ ] **Step 2: Update call site in index.ts**

```ts
case 'director': {
  const result = await generateDirectorInstructions(json, genText, { telemetry: options.telemetry });
  hooks.directorInstructions = result.hook;
  if (cache) writeCache(json, hookName, result.source, model, cacheDir);
  break;
}
```

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "generate-director"
git add src/engine/compiler/generate-director.ts src/engine/compiler/index.ts
git commit -m "feat(compiler): route director instructions through generateValidatedProse

Fallback is a structurally-correct generic instruction block rather
than the old single-sentence fragment, so degraded compiles still
produce a runtime-usable director."
```

---

## Task 14: Server-side /compile telemetry + SSE

**Files:**
- Modify: `src/cli/server-app.ts`

- [ ] **Step 1: Read current /compile handler**

Run: `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm && grep -n "compile" src/cli/server-app.ts | head -30`

Locate the `/compile` POST handler and the `recordSchemaRetries` call site used elsewhere (for runtime completion).

- [ ] **Step 2: Instantiate telemetry and wire into compileScenario**

Edit the `/compile` handler. Where it currently calls `compileScenario(...)` on the server side, add:

```ts
import { createCompilerTelemetry } from '../engine/compiler/telemetry.js';
// (Existing imports stay.)
```

In the handler body, before the compile call:

```ts
const compileTelemetry = createCompilerTelemetry();
```

Pass it in:

```ts
const scenarioPkg = await compileScenario(scenarioJson, {
  provider,
  model,
  cache: true,
  telemetry: compileTelemetry,
  onProgress: (hookName, status) => {
    sse.write({ type: 'compile_hook', data: { hookName, status } });
  },
});
```

- [ ] **Step 3: Forward validation fallbacks as SSE events**

The `CompilerTelemetry.recordFallback` doesn't emit SSE directly. Inject a forwarding wrapper instead of the default telemetry:

```ts
const baseTelemetry = createCompilerTelemetry();
const compileTelemetry = {
  recordAttempt: baseTelemetry.recordAttempt,
  recordFallback: (hookName: string, details: { rawText: string; reason: string; attempts: number }) => {
    baseTelemetry.recordFallback(hookName, details);
    sse.write({
      type: 'compile_validation_fallback',
      data: {
        hookName,
        attempts: details.attempts,
        reason: details.reason,
        rawTextExcerpt: details.rawText.slice(-500),
      },
    });
  },
  snapshot: baseTelemetry.snapshot,
};
```

- [ ] **Step 4: After successful compile, record retry stats**

After `compileScenario` returns, before sending `compile_done`:

```ts
const snap = compileTelemetry.snapshot();
// Merge into the existing retry-stats ring buffer. recordSchemaRetries
// is already exported from src/cli/retry-stats.ts — use the same helper
// the runtime uses on run completion.
recordSchemaRetries(snap.schemaRetries);

sse.write({
  type: 'compile_metrics',
  data: {
    hooks: Object.fromEntries(
      Object.entries(snap.schemaRetries).map(([k, v]) => [
        k.replace(/^compile:/, ''),
        { attempts: v.attempts, fromFallback: v.fallbacks > 0 },
      ]),
    ),
    totalFallbacks: snap.fallbacks.length,
  },
});
```

Import `recordSchemaRetries` if not already imported:

```ts
import { recordSchemaRetries } from './retry-stats.js';
```

(If the import path differs in the actual file, adjust to match existing imports.)

- [ ] **Step 5: Type-check**

Run: `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "server-app"`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/cli/server-app.ts
git commit -m "feat(server): /compile emits compile_validation_fallback SSE + retry-stats

Compile-time attempts + fallbacks land in the same .retry-stats.json
ring buffer under compile:* schema names. Every exhausted-retry hook
emits a compile_validation_fallback SSE event with the raw text
excerpt so the dashboard can surface degraded compiles."
```

---

## Task 15: Run the full compiler test suite

- [ ] **Step 1: Run all new compiler tests**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npx tsx --test \
  src/engine/compiler/schemas/milestones.test.ts \
  src/engine/compiler/llm-invocations/generateValidatedObject.test.ts \
  src/engine/compiler/llm-invocations/generateValidatedCode.test.ts \
  src/engine/compiler/llm-invocations/generateValidatedProse.test.ts \
  src/engine/compiler/telemetry.test.ts
```

Expected: ALL PASS

- [ ] **Step 2: Run previously-passing test suite**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npx tsx --test \
  src/runtime/schemas/*.test.ts \
  src/runtime/llm-invocations/*.test.ts \
  src/runtime/hexaco-cues/*.test.ts \
  src/runtime/emergent-setup.test.ts \
  src/runtime/cost-tracker.test.ts \
  src/engine/core/progression.test.ts \
  src/runtime/orchestrator-leader-mutation.test.ts \
  src/cli/retry-stats.test.ts
```

Expected: ALL PASS (same set as before the migration; no regressions)

- [ ] **Step 3: Full TypeScript type check**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npx tsc --noEmit -p tsconfig.json
```

Expected: exits with no new errors beyond the baseline (if there's a pre-existing baseline, compare by diffing against `git stash` of the baseline error list — otherwise clean).

---

## Task 16: Manual smoke test against Mars scenario

- [ ] **Step 1: Clear compiler cache**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
rm -rf .paracosm/cache/mars-genesis
```

- [ ] **Step 2: Run a 3-turn Mars compile + smoke**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npm run smoke 2>&1 | tail -60
```

Expected: the compile output shows 7 hooks each taking 1 attempt with no fallbacks. A completed 3-turn simulation. No `[compiler]` warnings in the output.

- [ ] **Step 3: Verify retry-stats output locally**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
cat .retry-stats.json | jq '.'
```

Expected (if the smoke run went through the server path — if not, this step can be skipped): JSON contains `compile:progression`, `compile:director`, `compile:prompts`, `compile:milestones`, `compile:fingerprint`, `compile:politics`, `compile:reactions` entries with `calls: 1` and `fallbacks: 0` each.

- [ ] **Step 4: Push to remote (only if user has explicitly asked)**

This plan does not push by default. If the user asks to push:

```bash
# paracosm submodule first
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git push paracosm master

# then monorepo pointer
cd /Users/johnn/Documents/git/voice-chat-assistant
git add apps/paracosm
git commit -m "chore: update paracosm submodule (compiler hook reliability)"
git push --no-verify origin master
```

CI/CD will build + deploy to the Linode origin automatically.

- [ ] **Step 5: Post-deploy verification**

After the deploy workflow succeeds:

```bash
curl -s https://paracosm.agentos.sh/retry-stats | jq '.schemas | keys | map(select(startswith("compile:")))'
```

Expected (after at least one fresh compile on the server): list of `compile:*` schema names. Before any live compile, the list is empty — acceptable, and the post-deploy server logs should no longer show repeated `[compiler] Fingerprint hook generation failed` lines across fresh compiles.

---

## Self-review

**Spec coverage** — ran down each goal in the spec:
1. Every compile call emits structured attempts/fallback telemetry → Tasks 3,4,5,7-13 all thread `CompilerTelemetry` through the wrappers. ✓
2. `/compile` SSE emits `compile_validation_fallback` → Task 14 Step 3. ✓
3. Milestones Zod + `generateValidatedObject` → Tasks 1,2,7. ✓
4. Five code hooks share `generateValidatedCode` → Tasks 3, 8-12. ✓
5. Director uses `generateValidatedProse` → Tasks 4, 13. ✓
6. Cache-aware `GenerateTextFn` with system blocks → Task 6. Used in every wrapper. ✓
7. `compile:*` schema names in `/retry-stats` → Task 5 (telemetry bucket naming), Task 14 Step 4 (ring-buffer write). ✓

**Placeholder scan** — no TBDs; every code block shows the exact content to paste. A single soft dependency (Task 3's test references telemetry before Task 5 defines it) is called out explicitly with an inline stub and an order note.

**Type consistency** —
- `generateValidatedCode` returns `{ hook, source, attempts, fromFallback, ... }` consistently in wrapper + all 5 hook call sites.
- `generateValidatedProse` returns `{ text, attempts, fromFallback }` and director wraps it in `{ hook: () => result.text, source: result.text, ... }`.
- `CompilerTelemetry.recordAttempt/recordFallback` signatures identical across Task 5 impl and Tasks 3/4 usage.
- `ValidatedCodeOptions<Fn>` generic threads through properly in every migration task.
- `parseMilestones` deliberately accepts both old-array and new-object shapes for back-compat (Task 7 Step 3).
- `GenerateTextFn` legacy string call shape preserved via `typeof promptOrOptions === 'string'` branch in `buildDefaultGenerateText`.

**Scope check** — single spec → single plan. Server-side SSE + retry-stats integration lives in the same plan because it is the observability surface the compiler changes depend on.

---

## Execution Handoff

Plan complete and saved to [docs/superpowers/plans/2026-04-18-compiler-hook-reliability.md](.). Two execution options per the writing-plans skill:

1. **Subagent-Driven (default recommendation)** — fresh subagent per task with two-stage review between.
2. **Inline Execution** — execute in this session using executing-plans, batch with checkpoints.

**Blocked option:** Subagent-Driven conflicts with the user's global rule *"No subagents — Do ALL work directly, never dispatch Agent tool"* ([feedback_no_subagents.md](../../../../../.claude/projects/-Users-johnn-Documents-git-voice-chat-assistant/memory/feedback_no_subagents.md)). Use Inline Execution via superpowers:executing-plans.
