---
title: "Paracosm LLM Reliability + HEXACO Evolution"
date: 2026-04-17
status: design — awaiting user review before plan
scope: paracosm only (no AgentOS changes, no UI/UX work, no cost refactor)
---

# Paracosm LLM Reliability + HEXACO Evolution

End-to-end audit of [apps/paracosm/](../../../) surfaced one root-cause failure and several gaps around HEXACO expression. Prior audit docs ([audit-2026-04-16.md](../../audit-2026-04-16.md), [audit-2026-04-16-full.md](../../audit-2026-04-16-full.md)) covered cost and mobile UX. This spec covers what those audits did not: structured-output discipline, personality prompting across all six HEXACO axes, and LLM-as-judge surfacing.

## Problem Statement

Every structured LLM call in paracosm follows the same brittle pattern:

1. Build a free-form JSON schema inside a prose prompt
2. Call `generateText` and get back markdown-wrapped, code-fenced, or prose-preambled text
3. Manually extract JSON via `extractJson` + regex brace matching
4. `JSON.parse` inside a `try/catch`
5. Fall through to hand-coded salvage regex or a zero-value default on failure

The salvage code lives in [parsers.ts:113-166](../../../src/runtime/parsers.ts#L113) (commander), [director.ts:202-274](../../../src/runtime/director.ts#L202) (director batch + single event), [emergent-setup.ts:355-516](../../../src/runtime/emergent-setup.ts#L355) (forge args normalization), [agent-reactions.ts](../../../src/runtime/agent-reactions.ts) (batched reactions), [pair-runner.ts:180-200](../../../src/cli/pair-runner.ts#L180) (verdict), and [commander-setup.ts:144-156](../../../src/runtime/commander-setup.ts#L144) (promotions). Each salvage path is slightly different. Each has its own failure mode. Each hides real LLM-output bugs behind defaults that keep the simulation running with degraded data.

AgentOS already ships [`generateObject`](../../../../../packages/agentos/src/api/generateObject.ts) with Zod schema validation and automatic retry with validation-error feedback appended to the conversation (max 2 retries by default). Provider-native JSON mode (`response_format: json_object`) is probed via a provider allow-list — currently `{ 'openai', 'openrouter' }` ([generateObject.ts:209](../../../../../packages/agentos/src/api/generateObject.ts#L209)); Anthropic uses prompt-based schema instructions + retry loop, which works but costs slightly more output tokens on markdown wrappers the retry then corrects. Paracosm imports it nowhere (verified: `grep -R "generateObject" apps/paracosm/src → no matches`).

One implication: `response_format: json_object` on OpenAI/OpenRouter rejects root-level JSON arrays. The reactions batch, currently `[{...}, {...}, ...]`, must become `{ "reactions": [...] }` under the new schema. This is a prompt + schema change, not a behavior change — the wrapping object is parsed away by downstream code that only reads the array.

Secondary gaps in HEXACO expression for simulation evolution:

- **Commander HEXACO is frozen**: [progression.ts `applyPersonalityDrift`](../../../src/engine/core/progression.ts#L20) iterates `colonists` (promoted agents) only. The commander is a separate [`LeaderConfig`](../../../src/engine/types.ts#L324) whose `hexaco` field is read in 9+ call sites ([orchestrator.ts:259,270,573,1080,1159,1373](../../../src/runtime/orchestrator.ts#L259); [director.ts:185](../../../src/runtime/director.ts#L185); [pair-runner.ts:30,119](../../../src/cli/pair-runner.ts#L30)) but never mutated. So the system claims "personality drift from experience" as a feature, yet the most visible personality — the commander — never actually evolves. Two commanders with opposing profiles stay opposed, even after 6 turns of outcomes that should reshape them.
- **Partial outcome-pull drift even for agents who do drift**: [progression.ts:46-56](../../../src/engine/core/progression.ts#L46) encodes outcome-based drift for openness + conscientiousness only. The other four traits (E, A, Em, HH) never shift from experience, so a charismatic dept head does not become more extraverted when their rallying speeches work, and a high-honesty one does not lose honesty after a successful cover-up.
- **No trajectory prompting**: `hexacoHistory` is populated every turn for promoted agents ([progression.ts:63](../../../src/engine/core/progression.ts#L63)) and exposed as `agentTrajectories` ([orchestrator.ts:1345](../../../src/runtime/orchestrator.ts#L1345)), but no prompt references it. Dept heads see their current HEXACO snapshot, never "you have drifted +0.10 toward openness since turn 1." Once the commander drift gap is fixed, the same cue needs threading into commander prompts.
- **Reactions send raw HEXACO numbers**: [agent-reactions.ts](../../../src/runtime/agent-reactions.ts) passes `h.openness.toFixed(2)` etc. into the per-agent block. Commanders and dept heads get conditional behavioral cues ("your low openness favours proven methods"), but reacting colonists get a numeric vector. The LLM has to re-derive behavioral implications every call.
- **CoT scaffolds are present but lose the reasoning**: both the commander prompt ([orchestrator.ts:1028-1038](../../../src/runtime/orchestrator.ts#L1028), a numbered `<thinking>` block) and the verdict prompt ([pair-runner.ts:154-166](../../../src/cli/pair-runner.ts#L154), a `<thinking>...</thinking>` block wrapping seven reasoning steps) ask the model to reason step-by-step. The reasoning is then stripped before JSON extraction ([parsers.ts:119](../../../src/runtime/parsers.ts#L119), [pair-runner.ts:184](../../../src/cli/pair-runner.ts#L184)) and thrown away. The director has a `reasoning: string` field in its batch response and preserves reasoning, but its prompt doesn't structure the reasoning. Post-migration, every CoT site should store reasoning in a schema field so it survives into the artifact and can be surfaced in the dashboard.

Verified NON-gaps (claims made during initial triage that turned out to be wrong after reading the source):

- ~~Scenario-generic department prompts~~ — the orchestrator already reads `cfg.instructions` from `scenario.departments[]` ([orchestrator.ts:344,464](../../../src/runtime/orchestrator.ts#L344); [submarine.json:33-38](../../../scenarios/submarine.json#L33) has per-scenario instructions). [`DEPARTMENT_CONFIGS`](../../../src/runtime/departments.ts#L12) is dead code and should be deleted, but the scenario-agnostic path is in place.
- ~~Forge retry-with-feedback loop~~ — the universal forge guidance at [orchestrator.ts:362-456](../../../src/runtime/orchestrator.ts#L362) already instructs the LLM to retry with specific fixes on rejection, `maxSteps` allows multiple tool calls in one session, and [wrapForgeTool](../../../src/runtime/emergent-setup.ts#L346) returns structured rejection in the tool-call result. The loop exists.

## Goals

1. Every structured LLM call in paracosm returns a Zod-validated object or logs a typed `ObjectGenerationError`.
2. Commander HEXACO drifts turn-over-turn from experience (matching the existing dept-head drift mechanic) and the drift is visible in the output.
3. HEXACO drift covers all six traits with peer-reviewed outcome associations.
4. Every HEXACO-aware prompt site (commander, director, departments, reactions) surfaces both the current snapshot AND the trajectory since turn 0.
5. Director and commander emit explicit pre-decision reasoning before the JSON body.
6. Dead-code removal: delete `DEPARTMENT_CONFIGS` from [departments.ts](../../../src/runtime/departments.ts).

## Non-Goals

- UI/UX responsive fixes (tracked in [audit-2026-04-16-full.md](../../audit-2026-04-16-full.md))
- Rate limiter extension to `/compile` and `/chat` (same audit, separate PR)
- `/setup` env mutation cross-user fix (same audit, security PR)
- AgentOS-side judge rubric changes (requires AgentOS PR; out of paracosm repo)
- Batched-reactions architecture change (tier-2 in existing audit)
- Full-trait drift with interaction effects (e.g., high-O × low-C interaction) — the linear additive model stays; only the per-trait outcome-pull table grows

## Architecture Changes

### New modules

```
src/runtime/
  schemas/                              [NEW]
    index.ts                            barrel; exports every Zod schema + inferred types
    director.ts                         DirectorEventBatchSchema, DirectorEventSchema, DirectorOptionSchema
    department.ts                       DepartmentReportSchema, RecommendedEffectSchema, RiskSchema
    commander.ts                        CommanderDecisionSchema, PromotionsSchema
    reactions.ts                        ReactionBatchSchema, ReactionEntrySchema
    verdict.ts                          VerdictSchema, VerdictScoresSchema

  llm-invocations/                      [NEW]
    generateValidatedObject.ts          one-shot wrapper over generateObject (director, reactions, verdict)
    sendAndValidate.ts                  session-aware wrapper (commander, departments, promotions) preserves conversation memory

  hexaco-cues/                          [NEW]
    trajectory.ts                       buildTrajectoryCue(history, currentSnapshot) → string
    translation.ts                      buildReactionCues(hexaco) → cue strings for reactions
```

### Modified modules

- [parsers.ts](../../../src/runtime/parsers.ts) — shrinks to just `cleanSummary` + `humanizeToolName` + `decisionToPolicy` + `emptyReport`/`emptyDecision` (used as fallback skeletons). Drop `parseDeptReport` and `parseCmdDecision` once callers migrate to validated wrappers.
- [director.ts](../../../src/runtime/director.ts) — `EventDirector.generateEventBatch` migrates from `generateText` + `parseBatchResponse` to `generateValidatedObject({ schema: DirectorEventBatchSchema })`. `parseDirectorResponse` + `parseBatchResponse` deleted.
- [orchestrator.ts](../../../src/runtime/orchestrator.ts) — dept report parsing migrates to `sendAndValidate(deptSess, ...)`. Commander decision parsing migrates to `sendAndValidate(cmdSess, ...)`. Commander drift loop added after each turn's outcome (mirrors [kernel.applyDrift](../../../src/engine/core/kernel.ts#L229)). Trajectory cue threaded into commander bootstrap and per-turn prompts. Dead imports/helpers pruned.
- [pair-runner.ts](../../../src/cli/pair-runner.ts#L140) — verdict call migrates to `generateValidatedObject({ schema: VerdictSchema })`. `<thinking>` strip logic is removed; reasoning moves into the schema's `reasoning` field per §7.
- [commander-setup.ts](../../../src/runtime/commander-setup.ts) — promotions migrate to `sendAndValidate(cmdSess, ...)` so the commander session keeps the promotion rationale in its running context (the commander references "you promoted Dr. X as CMO because of Y" in later turns). `buildPersonalityCue` gains a companion `buildTrajectoryCue` call site.
- [agent-reactions.ts](../../../src/runtime/agent-reactions.ts) — batched array response migrates to `generateValidatedObject({ schema: ReactionBatchSchema })`. Per-agent block gets cue translation from raw HEXACO.
- [progression.ts](../../../src/engine/core/progression.ts) — outcome-pull table expanded to cover all six traits with inline paper references. New exported helper `driftCommanderHexaco(hexaco, outcome, yearDelta, turn, year, history)` applies the same pull formula to commander HEXACO and pushes a snapshot onto a provided history array.
- [types.ts](../../../src/engine/types.ts#L324) — `LeaderConfig` is unchanged at the input boundary (still the 5-field shape the caller passes). The orchestrator's output shape (`runSimulation()` return value's `leader` key) gains `hexacoBaseline: HexacoProfile` and `hexacoHistory: HexacoSnapshot[]` — a new `OutputLeader` interface added to [runtime/index.ts](../../../src/runtime/index.ts) or alongside the orchestrator exports.
- [departments.ts](../../../src/runtime/departments.ts) — `DEPARTMENT_CONFIGS` constant deleted. `buildDepartmentContext` gains trajectory cue emission for the dept head (reads their own `c.hexacoHistory`).

### Unchanged

- `EmergentCapabilityEngine` and `EmergentJudge` wiring in [emergent-setup.ts](../../../src/runtime/emergent-setup.ts) — judge prompts live in AgentOS
- `wrapForgeTool` normalization layer — kept as a defensive shim because it guards against AgentOS-side mode-string churn, not model output
- `validateForgeShape` — already well-tested
- Kernel, compiler, dashboard, SSE, cost tracker, provider-error classifier

## Component Designs

### 1. Zod Schema Package (`src/runtime/schemas/`)

Each schema module exports both the schema and the inferred type. Contracts stay backward-compatible: inferred types match the existing `DirectorEvent`, `DepartmentReport`, etc., so downstream code in the orchestrator, kernel, and dashboard sees no breaking change.

**Example — `schemas/director.ts`:**

```ts
import { z } from 'zod';

export const DirectorOptionSchema = z.object({
  id: z.string().regex(/^option_[a-c]$/, 'must be option_a/b/c'),
  label: z.string().min(1),
  description: z.string().min(1),
  isRisky: z.boolean(),
});

export const DirectorEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  options: z.array(DirectorOptionSchema).min(2).max(3),
  riskyOptionId: z.string(),
  riskSuccessProbability: z.number().min(0).max(1),
  category: z.string().min(1),
  researchKeywords: z.array(z.string()).default([]),
  relevantDepartments: z.array(z.string()).min(1),
  turnSummary: z.string().min(1),
}).refine(
  evt => evt.options.some(o => o.id === evt.riskyOptionId && o.isRisky),
  { message: 'riskyOptionId must reference an option where isRisky=true' },
);

export const DirectorEventBatchSchema = z.object({
  events: z.array(DirectorEventSchema).min(1).max(3),
  pacing: z.enum(['calm', 'normal', 'intense']),
  reasoning: z.string().default(''),
});

export type DirectorEventZ = z.infer<typeof DirectorEventSchema>;
export type DirectorEventBatchZ = z.infer<typeof DirectorEventBatchSchema>;
```

Each schema uses:
- `.default()` for optional fields that had ad-hoc defaults in the salvage paths (keeps behavior identical when the LLM omits them)
- `.refine()` for cross-field invariants (e.g., `riskyOptionId` must point to a risky option) — catches semantic errors the old salvage paths silently accepted
- `z.enum()` for bounded string domains (severity, mood, pacing, outcome) — replaces hand-coded allow-lists in the old parsers

**Schema coverage (one per call site):**

| Call site | Schema | Currently |
|-----------|--------|-----------|
| Director event batch | `DirectorEventBatchSchema` | `parseBatchResponse` + regex |
| Department report | `DepartmentReportSchema` | `parseDeptReport` + `extractJson` |
| Commander decision | `CommanderDecisionSchema` | `parseCmdDecision` + 4 regex fallbacks |
| Reactions batch | `ReactionBatchSchema` | inline JSON.parse + array type assertion |
| Verdict | `VerdictSchema` | inline JSON.parse after `<thinking>` strip |
| Promotions | `PromotionsSchema` | inline JSON.parse at [commander-setup.ts:147](../../../src/runtime/commander-setup.ts#L147) |

### 2. Two validation wrappers: one-shot and session-aware

Paracosm's LLM call sites fall into two categories that cannot share a single wrapper:

1. **One-shot calls** — director, reactions, verdict, promotions. No conversation history; each call is independent. Plain `generateObject` works directly.
2. **Session-based calls** — commander and department agents. Use AgentOS `agent().session()` to accumulate turn-over-turn conversation memory ([orchestrator.ts:262,473](../../../src/runtime/orchestrator.ts#L262)). Commander remembers prior events and its own rationale; dept heads remember their prior analyses and forged tools. `generateObject` is one-shot and would drop this memory — a behavior regression.

Two wrappers solve both:

**`generateValidatedObject` (one-shot) — src/runtime/llm-invocations/generateValidatedObject.ts:**

```ts
import { generateObject, type ZodType } from '@framers/agentos';

export interface ValidatedObjectOptions<T extends ZodType> {
  provider: string;
  model: string;
  schema: T;
  schemaName?: string;
  schemaDescription?: string;
  systemCacheable?: string;   // cache-breakpoint system block
  systemTail?: string;         // non-cached system content
  prompt: string;
  maxRetries?: number;         // default 2
  onUsage?: (r: { usage?: any }) => void;
  onProviderError?: (err: unknown) => void;
  fallback?: z.infer<T>;       // returned when retries exhausted
}

export async function generateValidatedObject<T extends ZodType>(
  opts: ValidatedObjectOptions<T>,
): Promise<{ object: z.infer<T>; fromFallback: boolean; usage: TokenUsage }> { /* ... */ }
```

When `generateObject` throws `ObjectGenerationError`: `onProviderError` fires; if `fallback` is set, returns `{ object: fallback, fromFallback: true }`; else re-throws.

**`sendAndValidate` (session-aware) — src/runtime/llm-invocations/sendAndValidate.ts:**

```ts
import { extractJson } from '@framers/agentos';
import type { ZodType, z, ZodError } from 'zod';

/**
 * Schema-aware wrapper over an AgentOS session's .send() call. Preserves
 * the session's running conversation history (the whole point of using a
 * session) while adding the retry-with-validation-feedback loop that
 * generateObject provides for one-shot calls.
 *
 * On validation failure, the corrective prompt is sent as a NEW message in
 * the same session — the model sees its prior malformed output in context
 * and self-corrects. The corrective message is tagged so callers can tell
 * it apart from primary-path messages in logs.
 */
export async function sendAndValidate<T extends ZodType>(args: {
  session: { send: (prompt: string) => Promise<{ text: string; usage?: any }> };
  prompt: string;
  schema: T;
  maxRetries?: number;           // default 2
  onUsage?: (r: { usage?: any }) => void;
  onProviderError?: (err: unknown) => void;
  fallback?: z.infer<T>;
}): Promise<{ object: z.infer<T>; fromFallback: boolean; rawText: string }> {
  const maxRetries = args.maxRetries ?? 2;
  let lastError: ZodError | undefined;
  let lastText = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const retryCorrection = attempt === 0
      ? args.prompt
      : `Your previous JSON did not match the schema. Validation errors:\n${summarizeZodErrors(lastError!)}\n\nReturn ONLY the corrected JSON object. No markdown, no code fences, no explanation.`;

    const r = await args.session.send(retryCorrection);
    args.onUsage?.(r);
    lastText = r.text;

    try {
      const parsed = extractJson(r.text);
      const validation = args.schema.safeParse(parsed);
      if (validation.success) {
        return { object: validation.data, fromFallback: false, rawText: r.text };
      }
      lastError = validation.error;
    } catch {
      // JSON extraction failed; loop to retry with a parse-error message
    }
  }

  const err = new ObjectGenerationError(
    `Validation failed after ${maxRetries + 1} attempts`,
    lastText,
    lastError,
  );
  args.onProviderError?.(err);
  if (args.fallback !== undefined) {
    return { object: args.fallback, fromFallback: true, rawText: lastText };
  }
  throw err;
}
```

The retry message is appended to the same session, so the model sees:
1. Its own prior turn's response (malformed JSON)
2. A new user message naming the Zod errors
3. A request to correct

This mirrors AgentOS's internal retry loop but over a session. It replicates the value of `generateObject` (schema-aware retry) without losing the session memory commander/dept agents depend on.

**Caching**: session-based agents already register their `systemBlocks` at agent creation ([orchestrator.ts:468](../../../src/runtime/orchestrator.ts#L468)) with `cacheBreakpoint: true`. No additional plumbing needed in `sendAndValidate`. For one-shot calls, `generateValidatedObject.systemCacheable` passes `system: [{ text, cacheBreakpoint: true }]` through to `generateObject`. This mirrors existing caching at [director.ts:389](../../../src/runtime/director.ts#L389) and [orchestrator.ts:468](../../../src/runtime/orchestrator.ts#L468).

**Migration mapping:**

| Call site | Wrapper | Session retained |
|-----------|---------|-------------------|
| Director event batch | `generateValidatedObject` | n/a (one-shot) |
| Reactions batch | `generateValidatedObject` | n/a |
| Verdict | `generateValidatedObject` | n/a |
| Department report | `sendAndValidate` | yes (`deptSess`) |
| Commander decision | `sendAndValidate` | yes (`cmdSess`) |
| Promotions | `sendAndValidate` | yes (`cmdSess`; turn 0 call but uses same session so future commander messages see it) |

### 3. HEXACO trajectory cue (`hexaco-cues/trajectory.ts`)

Single helper that takes `hexacoHistory` (already populated in [state.ts:118](../../../src/engine/core/state.ts#L118), [progression.ts:63](../../../src/engine/core/progression.ts#L63)) and emits a concise drift line.

```ts
export function buildTrajectoryCue(
  history: HexacoSnapshot[],
  current: HexacoProfile,
): string {
  if (history.length < 2) return '';  // no drift yet
  const baseline = history[0].hexaco;
  const deltas = HEXACO_TRAITS.map(t => ({ trait: t, delta: current[t] - baseline[t] }));
  const significant = deltas.filter(d => Math.abs(d.delta) >= 0.05);  // matches drift rate cap
  if (!significant.length) return '';

  const lines = significant.map(d => {
    const direction = d.delta > 0 ? 'toward' : 'away from';
    const trait = d.trait === 'honestyHumility' ? 'honesty-humility' : d.trait;
    const magnitude = Math.abs(d.delta) >= 0.15 ? 'substantially' : 'measurably';
    return `${magnitude} ${direction} higher ${trait}`;
  });
  return `Since you took command, your personality has drifted ${lines.join(' and ')}. Notice how recent decisions have shaped your judgment.`;
}
```

**Thresholds** — 0.05 matches `progression.ts`'s per-turn rate cap, so a cue fires only after at least one turn of meaningful drift. 0.15 is three turns' worth at cap, flagged as "substantially."

**Call sites:**

| Site | When | Wiring |
|------|------|--------|
| Commander bootstrap | Turn 0 | Empty (no history) — skipped gracefully |
| Commander per-turn prompt | Every turn | `buildTrajectoryCue(commanderHexacoHistory, commanderHexacoLive)` appended to `cmdPrompt` during prompt build (orchestrator.ts `~990-1038` where `cmdPrompt` is assembled) BEFORE the `cmdSess.send(cmdPrompt)` call at [orchestrator.ts:1050](../../../src/runtime/orchestrator.ts#L1050); both variables introduced in §5 |
| Director context | Every turn | `buildTrajectoryCue(commanderHexacoHistory, commanderHexacoLive)` injected into `buildDirectorPrompt` after the HEXACO snapshot block ([director.ts:184-188](../../../src/runtime/director.ts#L184)) |
| Department context | Every turn | `buildTrajectoryCue(deptHead.hexacoHistory, deptHead.hexaco)` injected into `buildDepartmentContext` hexacoBlock at [departments.ts:147-154](../../../src/runtime/departments.ts#L147) — the dept head's OWN trajectory, not the commander's |
| Reactions batch | Every turn | NOT injected per-agent (would invalidate batch cache); reaction cues stay static via translation.ts |

### 4. Reaction cue translation (`hexaco-cues/translation.ts`)

Reactions currently emit raw numbers. This helper turns the raw HEXACO into 1-2 concise cue strings per agent, applying the same 0.7/0.3 thresholds used in commander/dept prompts.

```ts
export function buildReactionCues(h: HexacoProfile): string {
  const cues: string[] = [];
  if (h.emotionality > 0.7) cues.push('you feel events in your body before words');
  if (h.emotionality < 0.3) cues.push('you stay flat when others panic');
  if (h.openness > 0.7) cues.push('you look for what this moment makes possible');
  if (h.openness < 0.3) cues.push('you stick to what has worked');
  if (h.honestyHumility > 0.7) cues.push('you say what you really think');
  if (h.honestyHumility < 0.3) cues.push('you speak strategically, not confessionally');
  // ... (all six traits, both poles)
  return cues.length ? `Your inner voice: ${cues.slice(0, 3).join('; ')}.` : '';
}
```

Called from [agent-reactions.ts](../../../src/runtime/agent-reactions.ts) `buildBatchAgentBlock`. Adds ~30-80 tokens per agent per batched call. At 10 agents/batch × 2 events × 6 turns × 2 leaders = 240 calls, that is ~15K extra tokens per run on haiku — ~$0.01-0.02. Negligible versus the quality win of not asking the LLM to re-derive personality behavior from a vector every call.

### 5. Commander drift tracking

Do NOT mutate the caller's `LeaderConfig.hexaco`. `runSimulation(leader, ...)` receives `leader` from user code; mutating it leaks run state into the caller's object (e.g., pair-runner passes the same leader config across sequential runs in some integration paths; chat agent init holds references to the baseline profile). Instead, clone at run start and track drift on the clone.

```ts
// src/engine/core/progression.ts — new exported helper
export function driftCommanderHexaco(
  leaderHexaco: HexacoProfile,                 // mutated in place (the orchestrator's local clone)
  outcome: TurnOutcome | null,
  yearDelta: number,
  turn: number,
  year: number,
  history: HexacoSnapshot[],                   // mutated in place
): void {
  for (const trait of HEXACO_TRAITS) {
    let pull = 0;
    // No leader pull for the commander (they ARE the leader)
    // No role pull for the commander (no department activation)
    // Outcome pull matches the full-trait table in §6
    if (outcome) { /* same switch statement as applyPersonalityDrift */ }
    const delta = Math.max(-0.05, Math.min(0.05, pull)) * yearDelta;
    leaderHexaco[trait] = Math.max(0.05, Math.min(0.95, leaderHexaco[trait] + delta));
  }
  history.push({ turn, year, hexaco: { ...leaderHexaco } });
}
```

**Wiring in orchestrator.ts** — clone at run start, drift per turn:

```ts
// At run start, before the turn loop: clone so we don't mutate the caller's config.
const commanderHexacoLive: HexacoProfile = { ...leader.hexaco };
const commanderHexacoHistory: HexacoSnapshot[] = [{ turn: 0, year: startYear, hexaco: { ...leader.hexaco } }];

// After [`kernel.applyDrift`](../../../src/engine/core/kernel.ts#L229) call at [orchestrator.ts:1159](../../../src/runtime/orchestrator.ts#L1159):
driftCommanderHexaco(commanderHexacoLive, lastOutcome, Math.max(1, year - prevYear), turn, year, commanderHexacoHistory);
```

Every call site that currently reads `leader.hexaco` ([orchestrator.ts:259,573,1080,1081,1083,1159](../../../src/runtime/orchestrator.ts#L259); [director.ts:185](../../../src/runtime/director.ts#L185)) migrates to `commanderHexacoLive`. The fingerprint-time snapshot ([orchestrator.ts:1373](../../../src/runtime/orchestrator.ts#L1373)) exports BOTH the original baseline (`leader.hexaco`) AND the drifted final state + history:

```ts
leader: {
  name: leader.name,
  archetype: leader.archetype,
  colony: leader.colony,
  hexaco: commanderHexacoLive,                  // current/final state (drifted)
  hexacoBaseline: leader.hexaco,                // original config (what the caller passed)
  hexacoHistory: commanderHexacoHistory,        // per-turn trajectory
},
```

Rename suggestion (captured in Open Questions) — making `hexaco` the live value while adding `hexacoBaseline` is backward-compatible for consumers that read `leader.hexaco` as "whatever the current profile is." Dashboard doesn't care about the distinction and sees an evolving value.

**Output shape**: the run result's `leader` object gains `hexacoBaseline` and `hexacoHistory`. Dashboard Reports tab can render a commander personality arc (future UI work, not in this spec but blocked on this data being available).

### 6. Full-trait drift (`progression.ts`)

Expand the outcome-pull table in [progression.ts:46-56](../../../src/engine/core/progression.ts#L46) to cover all six traits. Values are kept small (≤ 0.03) so the rate cap (±0.05/turn total drift from all sources combined) is still reachable but not blown out.

```ts
// Outcome pull: success/failure reinforces or punishes traits
if (turnOutcome) {
  // Openness — novelty-seeking reinforced by risky success (existing)
  if (trait === 'openness') {
    if (turnOutcome === 'risky_success') pull += 0.03;
    if (turnOutcome === 'risky_failure') pull -= 0.04;
    if (turnOutcome === 'conservative_failure') pull += 0.02;
  }
  // Conscientiousness — procedure reinforced by risky failure and conservative success (existing)
  if (trait === 'conscientiousness') {
    if (turnOutcome === 'risky_failure') pull += 0.03;
    if (turnOutcome === 'conservative_success') pull += 0.02;
  }
  // [NEW] Extraversion — assertive command reinforced by visible wins
  if (trait === 'extraversion') {
    if (turnOutcome === 'risky_success') pull += 0.02;      // bold call paid off
    if (turnOutcome === 'risky_failure') pull -= 0.02;       // public embarrassment
  }
  // [NEW] Agreeableness — cooperation reinforced by collective wins
  if (trait === 'agreeableness') {
    if (turnOutcome === 'conservative_success') pull += 0.02;  // team coordination worked
    if (turnOutcome === 'risky_failure') pull -= 0.02;         // interpersonal friction after loss
  }
  // [NEW] Emotionality — trait activates under threat (Lee & Ashton 2004 Table 1)
  if (trait === 'emotionality') {
    if (turnOutcome === 'risky_failure') pull += 0.03;        // crisis heightens anxiety/empathy
    if (turnOutcome === 'conservative_failure') pull += 0.02; // slow-burn loss still engages E
  }
  // [NEW] Honesty-Humility — credibility compounds; betrayal erodes
  if (trait === 'honestyHumility') {
    if (turnOutcome === 'risky_success') pull -= 0.02;        // survivors-write-history effect
    if (turnOutcome === 'conservative_success') pull += 0.02; // measured honesty rewarded
  }
}
```

**References** (added as inline comments):
- Openness ↔ exploration success: Silvia & Sanders 2010 (*Personality and Individual Differences*)
- Conscientiousness ↔ discipline under failure: Roberts et al. 2006 (*Psych Bulletin*)
- Extraversion reward sensitivity: Smillie et al. 2012 (*European Journal of Personality*)
- Agreeableness ↔ cooperation under abundance: Graziano et al. 2007 (*JPSP*)
- Emotionality under threat: Lee & Ashton 2004 (*Personality and Individual Differences*, HEXACO foundational paper)
- Honesty-Humility ↔ strategic behavior: Hilbig & Zettler 2009 (*Journal of Research in Personality*)

Each citation slots into the existing reference list in [ARCHITECTURE.md:346-352](../../ARCHITECTURE.md#L346).

### 7. CoT scaffolds (director + commander + verdict)

Commander and verdict prompts **already have `<thinking>` CoT scaffolds** ([orchestrator.ts:1028-1038](../../../src/runtime/orchestrator.ts#L1028); [pair-runner.ts:154-166](../../../src/cli/pair-runner.ts#L154)); they are stripped before JSON extraction and thrown away. The director has a `reasoning` schema field but the prompt doesn't structure it. The migration to `generateObject` preserves reasoning inside the JSON body where it survives into the artifact.

Under `generateObject` + response_format `json_object` (OpenAI), anything outside the top-level JSON is rejected. `<thinking>` tags before the JSON would fail JSON-mode's root-object constraint. Moving the reasoning into a schema field is both a correctness fix (Anthropic retry loop no longer has to strip) and a data-preservation fix (reasoning lives in the artifact).

**Director** — `DirectorEventBatchSchema.reasoning` already exists. Strengthen the prompt at [DEFAULT_DIRECTOR_INSTRUCTIONS](../../../src/runtime/director.ts#L93):

```
REASONING — populate the "reasoning" field before the events array with a
numbered list:
  (1) What stress signal in the current state pattern is most important?
  (2) What consequences of the last turn's outcome still matter now?
  (3) Which categories are still available given the no-repeat rule?
The events array must reference back to these points. Decide on the pacing
(calm/normal/intense) AFTER this reasoning, not before.
```

**Commander** — add `reasoning: z.string().default('')` to `CommanderDecisionSchema`. Rewrite the existing `<thinking>` prompt block at [orchestrator.ts:1028-1038](../../../src/runtime/orchestrator.ts#L1028) to direct the stepwise thinking into the JSON field:

```
REASONING — populate the "reasoning" field BEFORE committing to selectedOptionId.
Numbered list, one point per line:
  (1) What does my personality profile push me toward on this call? Name the specific trait poles at play.
  (2) Do the department reports converge or conflict? If they conflict, which voice do I trust given my profile?
  (3) Which forged-tool outputs in the toolbox above directly inform this decision? Cite numbers where present.
  (4) What risk am I accepting vs refusing? My rationale must name the specific trade.
  (5) Final choice + one-line justification.
Then set selectedOptionId, decision, and rationale. The rationale compresses
the reasoning into a single paragraph for default UI display; the "reasoning"
field stores the full working for "show full analysis" expand.
```

The `parseCmdDecision` `<thinking>` strip at [parsers.ts:119](../../../src/runtime/parsers.ts#L119) disappears along with `parseCmdDecision` itself.

**Verdict** — currently uses `<thinking>` tags wrapping 7 numbered reasoning steps ([pair-runner.ts:154-166](../../../src/cli/pair-runner.ts#L154)) plus `<verdict>` tags wrapping the JSON. Migrate to `generateObject({ schema: VerdictSchema })` where:
- `VerdictSchema.reasoning: z.string().default('')` stores the 7 reasoning steps as a single newline-delimited string
- `VerdictSchema` top-level replaces the `<verdict>{...}</verdict>` block
- Verdict prompt reshaped to request JSON directly with reasoning as the first field

The `<thinking>` strip at [pair-runner.ts:184](../../../src/cli/pair-runner.ts#L184) and the greedy `{...}` match at [pair-runner.ts:185](../../../src/cli/pair-runner.ts#L185) both disappear.

Cost: preserves the reasoning already being generated (not new output). Changes the transport from tags-outside-JSON (stripped, discarded) to fields-inside-JSON (validated, preserved). ~$0 delta; quality win is data preservation.

### 8. Dead code removal

Delete [`DEPARTMENT_CONFIGS`](../../../src/runtime/departments.ts#L12-L65) and `DepartmentConfig` from [departments.ts](../../../src/runtime/departments.ts). Comment at [orchestrator.ts:357-361](../../../src/runtime/orchestrator.ts#L357) confirms it is dead. Scenario JSON (`scenario.departments[]`) supplies `role`, `instructions`, `defaultModel`, and `label` already.

## Data Flow

### Before (current)

```
LLM → generateText (or session.send) → raw text
                    → extractJson (brace match)
                    → JSON.parse (maybe throws)
                    → regex salvage (if throw)
                    → default skeleton (if salvage finds nothing)
                    → downstream consumer
```

### After (one-shot calls: director, reactions, verdict)

```
LLM → generateValidatedObject → generateObject({ schema, system, prompt })
    → internal retry w/ validation feedback (up to maxRetries)
    → typed object (matches T = z.infer<Schema>)
    → ObjectGenerationError → onProviderError fires → fallback skeleton + log
```

### After (session-based calls: commander, department, promotions)

```
LLM → sendAndValidate → session.send(prompt)
    → extractJson(raw) → schema.safeParse(parsed)
    → validation ok → typed object
    → validation fails → session.send(retry with Zod errors)
                       → extractJson / safeParse
                       → up to maxRetries total attempts
    → all retries exhausted → ObjectGenerationError → onProviderError → fallback
```

The session-based retry message lives in the same conversation, so the model's own prior output is in its immediate context when the corrective message arrives. This is why the retry is "self-correcting" rather than blind.

## Error Handling

- `ObjectGenerationError` is logged via `onProviderError` and classified through existing [provider-errors.ts](../../../src/runtime/provider-errors.ts). If it's transient (rate-limit, timeout), the existing abort gate handles it. If it's permanent (validation failure after 2 retries), the call site falls back to the empty-skeleton default (same as the current salvage path's final branch).
- For one-shot calls, AgentOS `generateObject` appends the Zod error to the next retry prompt internally — we don't emulate it.
- For session-based calls, `sendAndValidate` sends the corrective prompt as a new user message in the session; the model's prior malformed response is already in the session's context, so the retry is self-correcting. The retry message text is a standard template (truncated Zod errors + "return ONLY the corrected JSON") defined in `sendAndValidate.ts` — kept stable so it doesn't create per-call cache invalidation.
- Forge args schema (out of scope) — noted as follow-up. AgentOS tool-arg validation is driven by `ITool.inputSchema` (JSON Schema object). Converting the forge meta-tool's input schema to Zod would require AgentOS-side support for Zod tool schemas; this spec does not assume that.

## Testing Strategy

Extend the existing test pattern from [emergent-setup.test.ts](../../../src/runtime/emergent-setup.test.ts):

### Per-schema round-trip tests (`src/runtime/schemas/*.test.ts`)

One test file per schema:
- Accepts a canonical valid example (regression fixture)
- Rejects each required field missing
- Rejects each enum value out of domain
- Rejects each refine violation (e.g., `riskyOptionId` pointing to non-risky option)
- Accepts defaults being filled in when optional fields are absent

### Trajectory cue tests (`src/runtime/hexaco-cues/trajectory.test.ts`)

- Empty history → empty string
- Single snapshot → empty string (no baseline)
- Two snapshots, deltas below threshold → empty string
- Two snapshots, one trait crossed 0.05 → one cue line
- Two snapshots, one trait crossed 0.15 → "substantially" word present
- Multi-trait drift → cues joined with "and"

### Cue translation tests (`src/runtime/hexaco-cues/translation.test.ts`)

- All-0.5 HEXACO → empty string
- Each axis at each pole fires its expected cue
- Only top 3 cues emitted even if all 6 traits are polarized (bound on prompt size)

### Full-trait drift + commander drift tests (extend `src/engine/core/progression.test.ts` if exists, else create)

- Each (trait, outcome) pair produces the expected sign of drift
- Combined with rate cap, no trait drifts more than 0.05 in a single turn even when multiple outcomes align
- Drift is deterministic given same seed + same outcome history
- `driftCommanderHexaco` applies outcome-pull only (no leader-pull, no role-pull), mutates `leaderHexaco` and appends to `history`
- Commander drift respects the same [0.05, 0.95] bounds and ±0.05/turn cap as agent drift
- Fresh `LeaderConfig` with no `hexacoHistory` gets an initial snapshot pushed on first drift call

### Wrapper tests (`src/runtime/llm-invocations/*.test.ts`)

- `generateValidatedObject` success path → mock generateObject returns valid object → wrapper returns it
- `generateValidatedObject` failure path → mock throws `ObjectGenerationError` → `onProviderError` fires → if `fallback` set, returns fallback with `fromFallback: true`; else re-throws
- `sendAndValidate` success on first try → one session.send call, no retry messages
- `sendAndValidate` success after one retry → mock session returns malformed JSON then valid; verify exactly two session.send calls; verify the retry prompt contains the Zod error summary
- `sendAndValidate` session memory preserved → mock session with a memory array; after retry, verify all messages (original prompt, bad response, corrective prompt, good response) are in the session's memory in order — the whole point of the session-based wrapper
- `sendAndValidate` exhausted retries → all attempts fail → `onProviderError` fires → fallback returned OR throws per options

### Integration tests

- [emergent-setup.test.ts](../../../src/runtime/emergent-setup.test.ts) already tests `validateForgeShape` — unchanged.
- New: end-to-end director turn using a mock `generateObject` implementation that returns a valid batch → orchestrator processes it with no salvage path invoked.
- New: director call where the mock returns invalid JSON twice, then valid → verifies the AgentOS retry loop is engaged (not paracosm's own salvage).
- New: dept/commander integration — mock session.send that fails Zod on first call, succeeds on second → verify dept report is valid AND dept session history contains both attempts (the model's prior-turn context survives).

### Manual verification

- Run [pnpm run smoke](../../../package.json#L44) against Mars and Submarine scenarios; confirm no behavioral regressions in event generation, dept reports, commander decisions, reactions, verdict.
- Eye the trajectory cue in Reports tab department context at turn 3+ — should show drift narrative.
- Verify personality scatter in Viz tab still evolves (now on all 6 axes, not just 2).

## Performance & Cost Impact

| Change | Delta | Notes |
|--------|-------|-------|
| Validation wrappers on 6 call sites | +$0 to +$0.20/run (uncertain) | On OpenAI, native JSON mode usually hits first try (neutral). On Anthropic, each call may retry once if first attempt has markdown preamble, adding ~500 input + 200 output tokens = ~$0.005/retry on Sonnet. Worst case all 6 call sites retry once: ~$0.15/run. Measurement will tell; cost ceiling is bounded by `maxRetries=2`. |
| Trajectory cue in prompts | +40-80 tokens/call at affected sites | 4 sites × 12 calls/turn × 6 turns × 2 leaders ≈ +30K tokens/run ≈ $0.02 |
| Reaction cue translation | +60 tokens/agent block | 100 agents × 2 events × 6 turns × 2 leaders ≈ +150K tokens/run ≈ $0.02 on haiku |
| CoT on director + commander + verdict | 0 | Commander and verdict prompts already generate reasoning; we redirect it from thrown-away `<thinking>` tags into preserved JSON fields. Director prompt gains structure for an already-present `reasoning` field. |
| Full-trait drift | 0 | Pure kernel logic, deterministic math |
| Commander drift tracking | 0 | One additional function call per turn + one push onto an array; no LLM call |
| Dead code removal | small negative | `DEPARTMENT_CONFIGS` prompt strings no longer shipped |

**Net**: $0.04 to $0.24/run (best to worst case). Current run is ~$6 head-to-head; this is 0.7% to 4%. The low end is likely on OpenAI; the high end is a pathological Anthropic run where every call retries once. Either way the quality win (schema-enforced correctness, preserved reasoning, full-trait evolution) dominates.

## Risks

1. **`generateObject` provider-native JSON mode is OpenAI/OpenRouter only** — Anthropic falls back to prompt-based schema instructions with the retry loop. On Anthropic, the first attempt more often returns markdown-wrapped JSON; `extractJson` handles that but the retry may fire once per turn, costing an extra ~500 input tokens + 200 output tokens per failed initial attempt. Mitigation: schema prompts are explicit ("respond with ONLY a valid JSON object — no markdown"), `maxRetries=2` is conservative, and cache breakpoints cover the stable schema prefix. Net: a handful of extra retries per run worst-case; still well under the salvage-parser's current failure overhead. Action item: log retry counts per call site in the first week of production and tune maxRetries down to 1 on sites where the first attempt nearly always succeeds.

2. **Session-based retry pollutes the conversation with bad-JSON turns** — the model's malformed response and the corrective "fix the JSON" message both live in the session after retry. Future turns in the same session see them. For dept and commander agents running 6+ turns, this could bloat conversation memory with repeated bad-JSON/correction pairs. Mitigation: `sendAndValidate` could delete the retry exchange from session history after success (AgentOS may or may not expose this; captured in Open Questions). If not possible, accept the pollution; cache breakpoints cover the system prefix so per-call cost stays bounded.

3. **Schema strictness breaks runs** — a schema that rejects today's valid outputs locks up the turn. Mitigation: each schema uses `.default()` generously and matches the field presence of the existing salvage skeleton. CI fixture (captured real LLM outputs from past runs) validates every schema accepts what reality emits.

4. **Trajectory cue noise** — if drift is small and noisy, cues may fire with trivial deltas. Mitigation: 0.05 floor matches drift rate cap; cue only fires when drift is comparable to one full turn of maximum pull.

5. **Full-trait drift balance** — adding four new outcome-pull entries could cascade into personalities flattening toward commander baseline too fast. Mitigation: each new entry ≤ 0.03. Existing rate cap (±0.05) and bounds ([0.05, 0.95]) are unchanged. Drift simulation test confirms turn-over-turn delta stays in cap.

6. **CoT leakage into UI** — if the commander's `reasoning` field ends up in the dashboard decision card by default, it's visual noise. Mitigation: dashboard renders `rationale` (the compressed version) by default; `reasoning` (the full working) is gated behind a "show full analysis" expand. The existing Reports tab already has an expand pattern for department summaries, so this reuses established UX.

7. **Fallback masks regressions** — if `onProviderError` + fallback always fires silently, we lose visibility into validation failures. Mitigation: every `fromFallback: true` result logs a structured warning with `rawText` + `validationErrors` and emits a `provider_error` SSE event tagged as `validation_fallback`. The dashboard already renders provider-error banners.

## Open Questions (for plan phase)

1. Should the fallback skeletons stay in [parsers.ts](../../../src/runtime/parsers.ts) as `emptyReport` / `emptyDecision`, or move into each schema module as `SchemaName.defaultSkeleton()`? Proposed: keep in parsers.ts during migration, re-evaluate post-cleanup.
2. Which test runner pattern — `node:test` (current convention) or migrate schema tests to a richer assertion framework? Proposed: keep `node:test` for consistency with existing suite.
3. Output shape for commander: `final.leader.hexaco` as drifted-current + new `hexacoBaseline`, OR keep `hexaco` as baseline and add `hexacoFinal`? Proposed: `hexaco` = drifted-current (matches the Agent type's pattern where `hexaco` is the live value and `hexacoHistory[0]` is the starting value). Dashboard render logic stays simple.
4. Should the trajectory cue fire when only one trait has meaningful drift, or require two+ to avoid prompt churn on single-axis evolution? Proposed: fire on any single trait ≥ 0.05, matches the "notice how recent decisions shape your judgment" framing — the LLM needs one drifted axis to notice.
5. Does AgentOS's session expose a way to delete/rollback messages (for `sendAndValidate` to scrub the retry exchange after success)? Needs investigation in the plan phase. If no, accept the conversation pollution; cache breakpoints on the system prefix keep per-call cost bounded.

## Success Criteria

- Zero `extractJson` or manual `JSON.parse` calls remain in paracosm runtime code (excluding forge args normalization in `wrapForgeTool`, which is not an LLM-output parse).
- Every call site in the schema coverage table above calls `generateObject` (or the `generateValidatedObject` wrapper).
- [progression.ts](../../../src/engine/core/progression.ts) outcome-pull table has an entry for all six HEXACO traits with peer-reviewed comment citation.
- `driftCommanderHexaco` is exported and called after every turn's outcome; the orchestrator's local `commanderHexacoLive` + `commanderHexacoHistory` accumulate per-turn snapshots. The caller's `LeaderConfig.hexaco` is NOT mutated (verified by a regression test that snapshots the input before `runSimulation` and asserts equality after).
- Commander prompt includes the trajectory cue at turn 3+ (visible in Reports tab "Commander reasoning" output).
- `final.leader.hexacoHistory` and `final.leader.hexacoBaseline` are present in the run output returned by `runSimulation()` and in the SSE completion payload.
- `npm test` passes with added schema + cue + drift tests.
- `npm run smoke` (3-turn Mars run) completes with no regressions in event count, dept report count, verdict shape, or reaction count.
- `DEPARTMENT_CONFIGS` no longer exists in [departments.ts](../../../src/runtime/departments.ts).
