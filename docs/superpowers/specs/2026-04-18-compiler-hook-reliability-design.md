---
title: "Paracosm Compiler Hook Reliability and Telemetry"
date: 2026-04-18
status: design — awaiting user review before plan
scope: paracosm compiler only (no runtime changes, no AgentOS changes, no dashboard UX work beyond passive /retry-stats consumption)
---

# Paracosm Compiler Hook Reliability and Telemetry

Production pm2 logs on the Linode origin ([***REMOVED***](https://paracosm.agentos.sh)) show every live compile run triggering at least one of:

```
[compiler] Fingerprint hook generation failed. Using fallback.
[compiler] Politics hook generation failed. Using no-op.
[compiler] Reaction context hook generation failed. Using fallback.
[compiler] Department prompt hook generation failed. Using fallback.
```

The fallbacks are hardcoded no-op or generic skeletons. The scenario appears to the user as "compiled", but its runtime reactions, political effects, department context, and timeline fingerprint are all domain-stripped. None of these failures surface in the dashboard, in `/retry-stats`, or in the `compile` SSE stream. The user sees a successful compile and a degraded run.

This spec covers structured-output discipline, telemetry, caching, and retry feedback for the seven compile-time LLM call sites. The runtime-side equivalent shipped 2026-04-17 ([2026-04-17-llm-reliability-and-hexaco-evolution-design.md](2026-04-17-llm-reliability-and-hexaco-evolution-design.md)).

## Problem Statement

[src/engine/compiler/](../../../src/engine/compiler/) generates seven runtime hooks via LLM text calls. Each hook file follows the same brittle pattern:

1. Build a free-form prompt string
2. Call `generateText(prompt)` (plain, no system block, no caching, no cost tracking)
3. Apply ad-hoc `parseResponse` regex to strip markdown fences
4. Run a single canonical smoke test on the resulting function
5. Retry up to 3 times with `lastError` prose appended to the next prompt
6. On exhaustion, `console.warn` and return a hardcoded fallback skeleton

Call-site inventory:

| Hook | File | Output | Current validator | Fallback shape |
|------|------|--------|-------------------|----------------|
| `progressionHook` | [generate-progression.ts](../../../src/engine/compiler/generate-progression.ts) | TS function `(ctx) => void` | `new Function` + smoke test | `() => {}` (no-op aging) |
| `directorInstructions` | [generate-director.ts](../../../src/engine/compiler/generate-director.ts) | prose string | length >= 100 + 2 dept names present | single sentence generic text |
| `departmentPromptHook` | [generate-prompts.ts](../../../src/engine/compiler/generate-prompts.ts) | TS function `(ctx) => string[]` | `new Function` + `Array.isArray` | `[ '[dept] No scenario-specific context available.' ]` |
| `getMilestoneEvent` | [generate-milestones.ts](../../../src/engine/compiler/generate-milestones.ts) | JSON `[founding, legacy]` | `JSON.parse` + field presence checks | hardcoded `Conservative/Ambitious Start` pair |
| `fingerprintHook` | [generate-fingerprint.ts](../../../src/engine/compiler/generate-fingerprint.ts) | TS function `(finalState, outcomeLog, leader, toolRegs, maxTurns) => Record<string, string>` | `new Function` + `result.summary` | 3-axis `expansionist/conservative + innovative/adaptive + charismatic/methodical` canned string |
| `politicsHook` | [generate-politics.ts](../../../src/engine/compiler/generate-politics.ts) | TS function `(category, outcome) => Record<string, number> \| null` | `new Function` + sample call type-check | `() => null` (no political effects ever) |
| `reactionContextHook` | [generate-reactions.ts](../../../src/engine/compiler/generate-reactions.ts) | TS function `(colonist, ctx) => string` | `new Function` + `typeof result === 'string'` | marsborn/age-only phrasing, scenario-name inlined |

Failure modes visible in production log tails:

1. **Silent degradation.** When the LLM writes malformed code, the compile continues end-to-end and emits a "successful" `compile` event. The simulation that follows runs with a fingerprint that always returns `expansionist · adaptive · charismatic`, a politics hook that always returns null, and reaction phrasing that only knows about Mars-style `marsborn` and `boneDensityPct`. The user has no visibility into the degradation.
2. **No telemetry persistence.** `/retry-stats` was shipped 2026-04-17 for runtime schemas. Compile-time retry counts and fallback counts go nowhere. Multi-run compile quality trends are invisible.
3. **No prompt caching.** Every hook call uses plain `generateText({ prompt })`. Seven calls per compile, each ~1500-2500 tokens of shared scenario JSON + labels + departments in the prompt body. Zero cache breakpoints. Compile cost is ~$0.10 today; the first-call cache breakpoint alone would cut that to ~$0.04 on Anthropic.
4. **Retry prompt does not ground the LLM in its own failed output.** `lastError` carries the TypeScript runtime error only (`"Cannot read properties of undefined (reading 'marsborn')"`). The LLM never sees the text IT wrote that caused the failure, so it regenerates blind. Compare to AgentOS `generateObject` which appends the validation error AND the model's prior malformed response on retry.
5. **Hardcoded model on the compile path.** `compileScenario` defaults to `provider: 'anthropic'` and `model: 'claude-sonnet-4-6'` at [index.ts:119-120](../../../src/engine/compiler/index.ts#L119). Demo mode does not override compile-side model. The runtime runs on a different model selection. If the compile hits a host-key quota before the sim starts, the run is dead on arrival with the same fallback text seen in production.
6. **Mixed output kinds.** Five hooks produce TypeScript code; milestones produces JSON; director produces prose. One wrapper cannot fit all three. The runtime migration had this same split (`generateValidatedObject` for JSON, `sendAndValidate` for session JSON). Compile needs its own split.

## Goals

1. Every compile-time LLM call emits structured attempts / fallback telemetry into a single sink that the server can snapshot into `.retry-stats.json` alongside runtime telemetry.
2. The `/compile` SSE stream emits a `compile_validation_fallback` event whenever a hook exhausts retries, with the hook name, final attempt's raw text, parse/smoke reason, and the fallback that was substituted.
3. Milestones migrates to a Zod schema through a compile-side `generateValidatedObject` wrapper (see Boundary rule above) wrapper.
4. The five code-producing hooks share a new `generateValidatedCode` wrapper that carries parse + smokeTest + retry + telemetry + prompt caching and forwards the LLM's prior malformed output into the retry prompt.
5. Director instructions uses a new `generateValidatedProse` helper with the same retry + telemetry plumbing, adapted to prose validators.
6. Compiler prompts use `systemBlocks` with `cacheBreakpoint: true` on the stable portion (scenario labels + department list + generation-rules block). Per-attempt retry hints stay in the unstable tail.
7. Compile attempts/fallbacks appear in `/retry-stats` under the synthetic schema names `compile:progression`, `compile:director`, `compile:prompts`, `compile:milestones`, `compile:fingerprint`, `compile:politics`, `compile:reactions`.

## Non-Goals

- Runtime LLM reliability work (already shipped 2026-04-17)
- Model selection retuning on compile (sub-project D — cost audit)
- Dashboard compile-telemetry surfacing UI beyond the raw `/retry-stats` fields (sub-project F)
- Scenario JSON input validation (out of scope; caller's responsibility)
- Seed ingestion LLM calls in `seed-ingestion.ts` — those are separate and already produce structured data; reviewed briefly, no production failures observed in logs
- Compile cache invalidation policy changes (existing disk cache behavior preserved)

## Architecture Changes

### New modules

```
src/engine/compiler/
  schemas/                                   [NEW]
    index.ts                                 barrel
    milestones.ts                            MilestonesSchema, MilestoneEventSchema

  llm-invocations/                           [NEW]
    generateValidatedObject.ts               compile-side Zod-validated JSON wrapper (milestones)
    generateValidatedCode.ts                 code-producing wrapper
    generateValidatedProse.ts                prose-producing wrapper (director only)

  telemetry.ts                               [NEW]
    CompilerTelemetry interface + in-memory aggregator
```

**Boundary rule.** `src/engine/` cannot import from `src/runtime/` ([ARCHITECTURE.md](../../ARCHITECTURE.md) states "Zero engine->runtime imports"; verified with grep). Runtime already ships its own [`generateValidatedObject`](../../../src/runtime/llm-invocations/generateValidatedObject.ts). The compiler gets a minimal parallel implementation in `src/engine/compiler/llm-invocations/generateValidatedObject.ts`, importing `generateObject` + `ObjectGenerationError` directly from `@framers/agentos`. Both wrappers stay ~80 LOC each; the duplication is cheaper than introducing a shared `src/shared/` module that would need its own package boundary story.

### Modified modules

- [`index.ts`](../../../src/engine/compiler/index.ts) — accepts `telemetry?: CompilerTelemetry` in `CompileOptions`. Threads it into every hook generator. Milestones branch switches to `generateValidatedObject` + `MilestonesSchema`. Post-compile, returns aggregated `{ attempts, fallbacks }` per hook in a new `result.compileMetrics` field.
- Each `generate-*.ts` — migrates body to the new wrapper. `buildPrompt` splits into `buildSystemBlock` (stable, cached) and `buildUserPrompt` (attempt-specific retry hint). `parseResponse` + smokeTest bodies stay identical; they become arguments to `generateValidatedCode`.
- [`types.ts`](../../../src/engine/compiler/types.ts) — `CompileOptions` gains `telemetry?: CompilerTelemetry`, `apiKey?: string`, `anthropicKey?: string`. The `GenerateTextFn` signature expands to optionally accept `{ system, prompt }` for cache-aware calls. Back-compat shim included.
- [`server-app.ts` `/compile`](../../../src/cli/server-app.ts) — instantiates `CompilerTelemetry`, passes it to `compileScenario`, emits `compile_validation_fallback` SSE on every fallback, calls the existing `recordSchemaRetries` ring-buffer helper with the compile schema names on completion.
- [`src/cli/retry-stats.ts`](../../../src/cli/retry-stats.ts) — `aggregateSchemaRetries` already aggregates by schema name; no code change needed. Compile schemas participate automatically via the synthetic `compile:*` naming convention. A new `section` field in the response groups compile vs runtime for the dashboard to distinguish, if desired later.

### Unchanged

- [`src/engine/compiler/cache.ts`](../../../src/engine/compiler/cache.ts) — disk cache behavior, signature hashing, and invalidation untouched. Cached hooks still skip LLM calls entirely (zero telemetry) — the telemetry path only fires on actual LLM attempts.
- [`src/engine/compiler/seed-ingestion.ts`](../../../src/engine/compiler/seed-ingestion.ts) — out of scope.
- Runtime side of the codebase: no changes.
- `restoreHookFromCache` in [index.ts:60](../../../src/engine/compiler/index.ts#L60) keeps its current behavior. A cache hit still replays the same parse helper on the cached source; if parse fails (cache format changed, stale entry), the code falls through to a fresh LLM generation, which then routes through the new wrapper.

## Component Designs

### 1. Milestones Zod schema (`src/engine/compiler/schemas/milestones.ts`)

Milestones is the one compile hook that produces pure JSON. It should route through a compile-side `generateValidatedObject` wrapper (see Boundary rule above) so telemetry, retry-with-schema-feedback, and fallback-skeleton emission all work identically to runtime call sites.

```ts
import { z } from 'zod';

export const MilestoneOptionSchema = z.object({
  id: z.string().regex(/^option_[a-c]$/, 'must be option_a/b/c'),
  label: z.string().min(1),
  description: z.string().min(1),
  isRisky: z.boolean(),
});

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

export const MilestonesSchema = z.object({
  founding: MilestoneEventSchema,
  legacy: MilestoneEventSchema,
});
```

**Prompt change.** The existing milestones prompt asks for a JSON *array* `[founding, legacy]`. OpenAI `response_format: json_object` rejects root arrays, same reasoning as the runtime reactions batch. Switch the prompt to the wrapped object shape `{ "founding": {...}, "legacy": {...} }`. The existing caller code that reads `result[0]` / `result[1]` changes to `result.founding` / `result.legacy` at [generate-milestones.ts:77](../../../src/engine/compiler/generate-milestones.ts#L77).

### 2. `generateValidatedCode` wrapper (`src/engine/compiler/llm-invocations/generateValidatedCode.ts`)

Shared wrapper for the five TS-code-producing hooks. Encapsulates the parse + smokeTest + retry + telemetry loop that each `generate-*.ts` currently hand-rolls.

```ts
export interface ValidatedCodeOptions<Fn> {
  /** Human-readable hook name for telemetry and error messages. */
  hookName: string;

  /** Stable system block with cacheBreakpoint. Typically holds scenario
   *  labels, department list, and generation rules. */
  systemCacheable: string;

  /** Attempt-specific user prompt. Callers build this fresh per attempt
   *  if the retry hint should reference attempt-specific state; otherwise
   *  the wrapper appends the retry hint itself. */
  prompt: string;

  /** Parse raw LLM text into the target function. Returns null on parse
   *  failure. This is the existing parseResponse body from each hook. */
  parse: (text: string) => Fn | null;

  /** Run the canonical smoke test on the parsed function. Throws on
   *  failure with a message the LLM can read on retry. */
  smokeTest: (fn: Fn) => void;

  /** Fallback function returned when retries exhaust. */
  fallback: Fn;

  /** Fallback source text for cache-format parity and debug visibility. */
  fallbackSource: string;

  maxRetries?: number; // default 3
  generateText: GenerateTextFn; // cache-aware signature

  /** Optional telemetry sink. */
  telemetry?: CompilerTelemetry;
}

export interface ValidatedCodeResult<Fn> {
  hook: Fn;
  source: string;
  attempts: number;
  fromFallback: boolean;
  /** Raw final LLM text when fromFallback=true, undefined otherwise. */
  failedRawText?: string;
  /** Human-readable reason the last attempt failed. */
  failedReason?: string;
}
```

Behavior:

1. Start with attempt 0. `prompt` carries the user's primary request.
2. Call `generateText({ system: [{ text: systemCacheable, cacheBreakpoint: true }], prompt: attemptPrompt })`.
3. Run `parse`. On null, set `failedReason = 'Could not parse LLM output into a callable function'` and set `failedRawText` for retry context.
4. Run `smokeTest`. On throw, set `failedReason = String(err)` and `failedRawText` for retry context.
5. On success, return `{ hook, source, attempts: attempt+1, fromFallback: false }` and call `telemetry.recordAttempt(hookName, attempt+1, false)`.
6. On failure after `maxRetries`: call `telemetry.recordFallback(hookName, { rawText, reason, attempts: maxRetries })`, return fallback.

Retry prompt grounds the LLM in its own prior output:

```
Previous attempt failed: {reason}

YOUR PRIOR OUTPUT (the code that failed):
```
{last 2000 chars of failedRawText}
```

Fix the specific issue named above. Return ONLY the corrected function. No markdown fences, no explanation.
```

The prior output is truncated to 2000 chars on the retry side only (the system block stays stable and cached). This keeps cache hits intact and bounds retry cost.

### 3. `generateValidatedProse` wrapper (`src/engine/compiler/llm-invocations/generateValidatedProse.ts`)

Director instructions produces prose. Same retry + telemetry shape as code wrapper, but the validator is a string-returning function:

```ts
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
```

Director's current validator — length >= 100 + at least 2 department IDs mentioned — moves directly into a `validate` callback. Result shape mirrors `ValidatedCodeResult<string>`.

### 4. `CompilerTelemetry` (`src/engine/compiler/telemetry.ts`)

Minimal interface the wrappers call into. Implementation is a plain class with a Map, used synchronously during compile and drained to the server on compile completion.

```ts
export interface CompilerFallback {
  hookName: string;
  rawText: string;
  reason: string;
  attempts: number;
  timestamp: number;
}

export interface CompilerTelemetry {
  recordAttempt(hookName: string, attempts: number, fromFallback: boolean): void;
  recordFallback(hookName: string, details: { rawText: string; reason: string; attempts: number }): void;
  /** Snapshot for /retry-stats aggregation. */
  snapshot(): {
    schemaRetries: Record<string, { calls: number; attempts: number; fallbacks: number }>;
    fallbacks: CompilerFallback[];
  };
}

export function createCompilerTelemetry(): CompilerTelemetry { /* Map-backed impl */ }
```

Schema names emitted are `compile:progression`, `compile:director`, `compile:prompts`, `compile:milestones`, `compile:fingerprint`, `compile:politics`, `compile:reactions`. The `compile:` prefix lets `/retry-stats` group compile vs runtime without changing the existing rollup shape.

### 5. `/compile` SSE integration (`src/cli/server-app.ts`)

The `/compile` handler already streams `compile_start`, `compile_hook`, and `compile_done` events. Add:

```ts
{
  type: 'compile_validation_fallback',
  data: {
    hookName: 'fingerprint' | 'politics' | 'prompts' | 'progression' | 'milestones' | 'reactions' | 'director',
    attempts: number,
    reason: string,
    rawTextExcerpt: string,  // last 500 chars of failed LLM output
    fallbackSource: string,  // what got used instead
  },
}
```

Plus `compile_metrics` at completion:

```ts
{
  type: 'compile_metrics',
  data: {
    hooks: Record<string, { attempts: number; fromFallback: boolean }>,
    totalFallbacks: number,
  },
}
```

On completion, call the existing `recordSchemaRetries(schemaRetries)` helper in [retry-stats.ts](../../../src/cli/retry-stats.ts) with the compile schemas merged in alongside any runtime schemas (a compile-only call has no runtime schemas; the merge is a no-op on the runtime side).

### 6. Prompt caching

The stable prefix for each compile prompt is the combination of `scenarioJson.labels`, `scenarioJson.departments[*]{id,label,role,instructions}`, and the hook-specific generation rules (rules 1-N in the current prompts). The unstable tail is the retry hint injected on attempt > 0.

Split every `buildPrompt` into:

```ts
buildSystemBlock(json) -> string  // cached
buildUserPrompt(attempt, lastRawText?, lastReason?) -> string  // uncached
```

This matches the runtime pattern at [orchestrator.ts:498](../../../src/runtime/orchestrator.ts#L498) and [director.ts:285](../../../src/runtime/director.ts#L285). Cache hits apply on compile 2+ in the same 5-minute window (Anthropic default) or 1h with the extended-cache beta header (already used elsewhere in AgentOS — verify availability before enabling).

### 7. GenerateTextFn signature

The current type is `(prompt: string) => Promise<string>`. Extend to accept an options object, keeping backward compat:

```ts
export type GenerateTextFn = (
  promptOrOptions: string | { system?: Array<{ text: string; cacheBreakpoint?: boolean }>; prompt: string },
) => Promise<string>;
```

The default implementation built in `buildDefaultGenerateText` passes the `system` block through to AgentOS `generateText`. Callers that used the string form keep working unchanged.

## Data Flow

### Before

```
compileScenario(json)
  └── for each hook:
         buildPrompt(json)
           → generateText(prompt)   // no system, no cache, no cost tracking
         parseResponse(text) | null
         smokeTest(fn) | throw
         on throw: retry up to 3x, lastError=stringified error
         on exhaust: console.warn + return hardcoded skeleton  (SILENT)
         → Object.assign(hooks, result)
  └── return ScenarioPackage
```

### After

```
compileScenario(json, { telemetry })
  └── for each hook:
         systemBlock = buildSystemBlock(json)
         prompt      = buildUserPrompt(attempt=0)
         generateValidatedCode({ systemCacheable, prompt, parse, smokeTest, fallback, telemetry, hookName })
           └── for attempt 0..maxRetries:
                  generateText({ system: [{ text, cacheBreakpoint: true }], prompt })
                  parse → null? record reason, retry with 'YOUR PRIOR OUTPUT' block
                  smokeTest → throw? record reason, retry with 'YOUR PRIOR OUTPUT' block
                  success → telemetry.recordAttempt(hookName, attempt+1, false); return
                  exhausted → telemetry.recordFallback(hookName, { rawText, reason, attempts });
                              emit compile_validation_fallback SSE; return fallback
  └── return { ...package, compileMetrics: telemetry.snapshot() }

server /compile
  on compile_validation_fallback → forward SSE to client
  on completion → recordSchemaRetries(compileMetrics.schemaRetries)  // ring buffer
```

## Error Handling

- Provider errors (quota, auth) during compile bubble up the same way runtime provider errors do. The compile handler surfaces them via the existing `provider_error` SSE payload; `/compile` already handles this path.
- A single hook fallback does not abort the compile. Other hooks still generate. The final `ScenarioPackage` uses the fallback for that one hook. The SSE stream is the authoritative signal that a fallback occurred.
- If `telemetry` is not supplied (e.g., CLI single-shot compiles without the server), wrappers operate with a null-object default — no SSE, no `/retry-stats` entry, but the console warnings still fire. This keeps the existing CLI path working identically.
- The retry prompt's `YOUR PRIOR OUTPUT` block is appended to the USER message, not the SYSTEM block, so it does not invalidate the cache key. Verified against Anthropic cache rules: stable content in system stays cached; dynamic content in user triggers new token processing only for the new bit.

## Testing Strategy

Follow the existing pattern of per-module tests under the same directory.

### New tests

- `src/engine/compiler/schemas/milestones.test.ts` — canonical valid example, each required field missing, cross-field refine (`riskyOptionId` must point to risky option), defaults filled in when optional fields absent.
- `src/engine/compiler/llm-invocations/generateValidatedCode.test.ts`:
  - success on first try → telemetry.recordAttempt called once with attempts=1, fromFallback=false
  - success after one retry → first call returns malformed text, second call returns valid code; verify retry prompt contains `YOUR PRIOR OUTPUT` with the malformed text
  - smoke test failure → verifies smoke test error text is in retry prompt
  - exhausted retries → fallback returned, telemetry.recordFallback called, rawText matches final bad response
  - system block includes cacheBreakpoint on every call
- `src/engine/compiler/llm-invocations/generateValidatedProse.test.ts` — same matrix as code wrapper with string validator instead.
- `src/engine/compiler/telemetry.test.ts` — snapshot shape matches `/retry-stats` expected format, multiple hook records aggregate correctly.

### Modified tests

- `src/engine/compiler/generate-progression.test.ts` (if exists; else create) — end-to-end using a mock `generateText` that returns valid code on attempt 1. Verify telemetry is called once.
- `src/engine/compiler/generate-milestones.test.ts` — migration to `generateValidatedObject` + `MilestonesSchema`. Mock `generateObject` with a mock that returns a valid schema object on attempt 1; verify compileScenario's milestones branch works end-to-end.

### Manual verification

- Run `npm run smoke` against Mars and Submarine scenarios; confirm `compile_metrics.totalFallbacks === 0` on a healthy compile.
- Trigger a compile on a scenario with intentionally-broken department IDs (e.g., `{"id": "", "label": "Broken"}`) and verify the smoke test catches it and the retry prompt contains the error name.
- After a successful compile, `GET /retry-stats` should include `compile:fingerprint`, `compile:politics`, `compile:progression`, `compile:prompts`, `compile:reactions`, `compile:director`, `compile:milestones` entries with `calls >= 1` each.

## Performance and Cost Impact

| Change | Delta per compile | Notes |
|--------|-------------------|-------|
| Prompt caching on stable prefix | -30% to -60% on Anthropic | First compile in window pays full cost. Compile 2+ within 5 min benefits. Each hook prompt has ~1200-1800 tokens of stable content out of ~1800-2500 total. |
| Retry prompt carries 2000 chars of prior output | +~500 tokens on retries only | Only fires on failed attempts; typical healthy compile has 0 retries, so no cost. |
| Milestones via `generateObject` | neutral | Same total tokens; schema retries happen on validation failure (rare on flagship model). |
| Telemetry + SSE emission | 0 | Pure in-process bookkeeping. |
| New CompilerTelemetry + /retry-stats write | negligible | ~200 bytes added to `.retry-stats.json` per compile. |

Estimated per-compile cost goes from ~$0.10 to ~$0.04-0.06 on Anthropic when the cache is warm. Cold compiles stay at ~$0.10. Volumes are low (compiles are cached to disk on hit) so this is small-dollar but a positive trend.

## Risks

1. **Retry prompt inflates cache miss rate.** Injecting `YOUR PRIOR OUTPUT` into the user message only matters when retries fire. On clean compiles the user prompt is short and the system prefix cache hits every time. Not a risk in healthy state; on degraded compiles the extra tokens are warranted anyway.
2. **Mock-based tests drift from real LLM output shapes.** Mitigation: a manual smoke test against a real scenario (Mars) must pass before merge, logged in the plan's verification step.
3. **Compile telemetry bloats `.retry-stats.json`.** Each compile adds up to 7 schemas × ring-buffer-size entries. With 100 runs retained, compile data adds ~70KB. Acceptable; file rotation already in place.
4. **`GenerateTextFn` type expansion breaks existing callers.** Mitigation: backward-compat string form preserved. TypeScript narrowing in the implementation distinguishes the two call shapes.
5. **Milestones prompt reshape (`[founding, legacy]` → `{ founding, legacy }`) changes cached entries.** The existing disk cache entries for milestones would fail `restoreHookFromCache`'s `parseMilestones(source)` call. Mitigation: `restoreHookFromCache` catches the failure and falls through to fresh generation — no user-visible break, just a one-time re-generate per scenario. Optionally: add a compatibility path in `parseMilestones` that accepts both the array form (legacy cached) and the object form (new).
6. **SSE payload size.** `rawTextExcerpt` at 500 chars is fine; a full 2000-char `failedRawText` would bloat the SSE message. Keep the excerpt cap at 500 on the wire, the full text stays in-process for debug/logging only.

## Open Questions (resolve in plan phase)

1. Should `compile_metrics` live in the final `ScenarioPackage` returned to the caller, or only in the server-side SSE stream + `/retry-stats` file? Proposed: both. Package-level `compileMetrics` is optional; server-side telemetry is authoritative.
2. Should the fallback paths log the `rawText` to disk somewhere the operator can inspect (e.g., `.paracosm/cache/failed-compiles/<hookName>-<timestamp>.txt`), or rely on SSE + `/retry-stats` for post-hoc forensics? Proposed: SSE + `/retry-stats` only, disk dump is out of scope.
3. The compile cache signature in `cache.ts` hashes `{ json, hookName, model }`. Should it also hash the prompt template version so that a prompt-template change invalidates old cached hook sources? Proposed: add a module-level `COMPILE_SCHEMA_VERSION = 2` const that bumps to invalidate on prompt format changes. Check in the migration commit.
4. Director instructions currently fall back to a single-sentence string that doesn't actually drive the runtime director well. Should the fallback instead embed the same `DEFAULT_DIRECTOR_INSTRUCTIONS` the runtime uses? Proposed: yes. The runtime's canonical instructions work; no reason to ship a degraded fallback.
5. On the server, the compile path runs server-side on the host key when the user did not supply one. Should compile-time quota errors fall through to the same `provider_error` SSE envelope used for runtime, or get a `compile_provider_error` subtype? Proposed: reuse `provider_error` with a `phase: 'compile'` tag to keep the dashboard banner unified.

## Success Criteria

- Every one of the seven compile hook call sites routes through one of: `generateValidatedObject` (milestones), `generateValidatedCode` (the five TS-code hooks), or `generateValidatedProse` (director).
- A compile that triggers any fallback emits a `compile_validation_fallback` SSE event per failing hook.
- `GET /retry-stats` after a compile+run returns entries named `compile:*` for every hook that ran through the LLM path (not from disk cache).
- `compileMetrics` field on `ScenarioPackage` (or equivalent on the server response) carries `{ attempts, fromFallback }` per hook.
- `node --test src/engine/compiler/schemas src/engine/compiler/llm-invocations src/engine/compiler/telemetry.test.ts` passes.
- `npm run smoke` completes with `compileMetrics.totalFallbacks === 0` on the current Mars scenario.
- Existing disk cache behavior unchanged: a second compile of the same scenario within the cache window hits disk and issues zero LLM calls.
