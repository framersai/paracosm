---
title: "AgentOS Forge Telemetry — extract paracosm patterns into AgentOS"
date: 2026-04-18
status: design — spec-only; execution batch separate
scope: AgentOS (packages/agentos) + paracosm (consumer)
---

# AgentOS Forge Telemetry

Through the 2026-04-18 session, paracosm accumulated a forge-observability toolkit that lives entirely in `apps/paracosm/src/runtime/`. AgentOS already ships the forge pipeline (`EmergentJudge`, `ForgeToolMetaTool`, `SandboxedToolForge`, `EmergentToolRegistry`) but none of the instrumentation: the rejection-reason classifier, the forge-stats counters, the wrapper that captures every attempt with normalization, the pre-judge shape validator, and the schema inference from testCases.

Any AgentOS consumer that wants to observe forge health has to re-implement the same ~400 lines paracosm already wrote. Extracting the instrumentation into AgentOS's existing `emergent/` module gives every consumer the same observability surface for free.

## What paracosm built that AgentOS should inherit

| Source | Responsibility | AgentOS target |
|---|---|---|
| [`src/runtime/forge-rejection-classifier.ts`](../../../src/runtime/forge-rejection-classifier.ts) | Classify errorReason strings into {schema_extra_field, shape_check, parse_error, judge_correctness, other} | `packages/agentos/src/emergent/ForgeRejectionClassifier.ts` |
| [`src/runtime/emergent-setup.ts`](../../../src/runtime/emergent-setup.ts) `validateForgeShape` | Pre-judge shape validator (catches empty schema properties, empty testCases, empty-input testCases) | `packages/agentos/src/emergent/ForgeShapeValidator.ts` |
| [`src/runtime/emergent-setup.ts`](../../../src/runtime/emergent-setup.ts) `inferSchemaFromTestCases` | Synthesize missing inputSchema/outputSchema properties from testCase data | `packages/agentos/src/emergent/ForgeSchemaInference.ts` |
| [`src/runtime/emergent-setup.ts`](../../../src/runtime/emergent-setup.ts) `wrapForgeTool` | Normalize LLM-emitted forge args (mode strings, stringified JSON), capture every attempt, log dept-scoped outcome | `packages/agentos/src/emergent/wrapForgeTool.ts` |
| [`src/runtime/cost-tracker.ts`](../../../src/runtime/cost-tracker.ts) `ForgeStats` + counters | Per-run aggregate: attempts, approved, rejected, approvedConfidenceSum, uniqueNames, uniqueApproved, uniqueTerminalRejections, rejectionReasons histogram | `packages/agentos/src/emergent/ForgeStatsAggregator.ts` |

## Goals

1. AgentOS ships all five paracosm-authored utilities under `packages/agentos/src/emergent/`, with the same test coverage as today.
2. Paracosm consumes them via `import { ... } from '@framers/agentos'` instead of its local copies. Local copies are deleted.
3. Zero behavior change for paracosm — same tests pass, same production telemetry.
4. Each new AgentOS utility is standalone (no runtime dependency on paracosm-specific types like `SimulationModelConfig` or `CostSite`). Where paracosm had tight coupling (e.g., `recordForgeAttempt` is a method on `CostTracker`), the AgentOS version is a free function or a standalone aggregator class the caller composes into their own tracker.

## Non-Goals

- No changes to the judge rubric itself (separate AgentOS PR).
- No SSE event shapes change in either project.
- Not publishing as a separate sibling npm package. These utilities belong in AgentOS's existing `emergent/` module — the same module that ships `EmergentJudge` + `ForgeToolMetaTool`. A sibling package would fragment the emergent-tool surface across two install targets for no gain.

## Architecture

### AgentOS-side additions

```
packages/agentos/src/emergent/
  ForgeRejectionClassifier.ts       pure function classifyForgeRejection(reason) → category
  ForgeShapeValidator.ts            pure function validateForgeShape(req) → error[]
  ForgeSchemaInference.ts           pure function inferSchemaFromTestCases(req) → void (mutates)
  wrapForgeTool.ts                  wrapper that normalizes args + captures outcomes (dept-neutral)
  ForgeStatsAggregator.ts           standalone aggregator class, same shape as paracosm's ForgeStats
```

Public barrel `@framers/agentos` re-exports all five. Each file ships its `*.test.ts` alongside (ported from paracosm's existing tests).

### Consumer migration (paracosm)

```diff
-import { validateForgeShape, inferSchemaFromTestCases, wrapForgeTool, ... } from './emergent-setup.js';
-import { classifyForgeRejection } from './forge-rejection-classifier.js';
+import {
+  validateForgeShape, inferSchemaFromTestCases, wrapForgeTool,
+  classifyForgeRejection, ForgeStatsAggregator,
+} from '@framers/agentos';
```

Paracosm's `cost-tracker.ts` continues to host per-run forgeStats counters, but delegates to `ForgeStatsAggregator` for the actual state management. The tracker's `recordForgeAttempt` becomes a thin pass-through.

Paracosm's `src/runtime/forge-rejection-classifier.ts` and the forge-related exports from `emergent-setup.ts` are deleted. Tests migrate to AgentOS or stay with paracosm as integration tests that exercise the AgentOS import path.

### `wrapForgeTool` dept-neutrality

Paracosm's current `wrapForgeTool` takes `dept: string` and records it in `CapturedForge`. The AgentOS version generalizes to `scope?: string` — an optional free-form scope label so callers that don't have departments can still capture attempts with semantic grouping (e.g., a chat agent forging personal tools uses `scope: 'chat:${agentId}'`).

### `ForgeStatsAggregator` standalone class

```ts
export class ForgeStatsAggregator {
  recordAttempt(approved: boolean, confidence: number, toolName?: string, errorReason?: string): void;
  snapshot(): ForgeStats;
  reset(): void;
}
```

No dependency on `CostTracker`, `SimulationModelConfig`, or any paracosm type. Consumer composes it into whatever telemetry layer they already have. Paracosm's `CostTracker` instantiates one and delegates to it.

## Testing

- All paracosm forge-related unit tests (classifier, validateForgeShape, inferSchemaFromTestCases, wrapForgeTool integration test, cost-tracker forge paths) move to `packages/agentos/src/emergent/__tests__/` where relevant, OR stay in paracosm as contract tests asserting the AgentOS imports produce the expected results on canonical inputs.
- New AgentOS integration test: a minimal consumer scenario that uses `wrapForgeTool` + `ForgeStatsAggregator` end-to-end, without any paracosm dependencies, proves the API is truly standalone.
- Paracosm's existing 192 tests must all pass after migration with zero code changes beyond the import swap.

## Release + Version

- AgentOS bumps minor version (new public API surface). Goes through the existing CI auto-release path (`packages/agentos/.github/workflows/*`).
- Paracosm bumps its `@framers/agentos` dependency to the new version, deletes local copies, and ships a patch release.

## Risks

1. **API stability.** Once these land in AgentOS, they're public surface. Mitigation: keep function signatures minimal and type-pure. No paracosm-specific enums leak out. Field names in `ForgeStats` are stable since they already shipped in `/retry-stats` responses.
2. **Back-compat for other AgentOS consumers.** None today for these functions — they don't exist in AgentOS yet. Additive change only.
3. **Test coverage parity.** The ported tests must exercise the same failure modes. Mitigation: paracosm's tests are already comprehensive (19 tests on `emergent-setup.test.ts`, 13 on the classifier, 17 on cost-tracker forge paths). Verbatim port.
4. **Published paracosm still depends on the old local copies until the AgentOS version ships.** Mitigation: land AgentOS changes first, wait for auto-release, then migrate paracosm in a second PR. Standard two-step the monorepo already uses.

## Implementation order

1. AgentOS: port classifier + tests.
2. AgentOS: port validateForgeShape + inferSchemaFromTestCases + tests.
3. AgentOS: port wrapForgeTool (with dept → scope generalization) + tests.
4. AgentOS: add ForgeStatsAggregator + tests.
5. AgentOS: publish.
6. Paracosm: bump dependency, swap imports, delete local copies.
7. Paracosm: CI green, push.

Each step is a separate commit within each repo.

## Success Criteria

- `@framers/agentos` public API exports: `classifyForgeRejection`, `ForgeRejectionCategory`, `validateForgeShape`, `inferSchemaFromTestCases`, `wrapForgeTool`, `ForgeStatsAggregator`, `ForgeStats`.
- Paracosm `src/runtime/forge-rejection-classifier.ts` deleted; forge exports from `emergent-setup.ts` collapsed to thin re-exports or deleted.
- Paracosm test suite: 192+ tests pass unchanged.
- `/retry-stats.forges` response shape unchanged.
- AgentOS typedoc (agentos-live-docs) picks up the new exports automatically on next auto-regen.
