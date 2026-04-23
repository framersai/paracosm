# F23 — Generic time units (year → time, 0.6.0 breaking)

**Status:** design, awaiting approval
**Date:** 2026-04-22
**Scope:** engine + runtime + compiler + scenarios + dashboard + saved-file migration. Cross-cutting rename of the same shape as 0.5.0's P1 rename (`colony → unit/systems`). Ships as 0.6.0 breaking change.

---

## Motivation

Paracosm's simulated time is hardcoded to years throughout: `year`, `startYear`, `yearsPerTurn`, `yearDelta`, `defaultStartYear`, `defaultYearsPerTurn`. Any scenario that doesn't map naturally to yearly ticks (a submarine habitat with hour-granular decisions, a corporate quarterly-strategy sim, an AgentOS Arena benchmark with real-time latency ticks) has to pretend. Labels like `"Year 2043"` lie in these contexts. Progression hooks receive `yearDelta` but need to interpret it as whatever unit the scenario actually uses.

After 0.5.0's P1 rename, `WorldSystems` and `settlementNoun` are already domain-agnostic. Time is the last remaining Mars-ism in the public type system. F23 finishes the cleanup.

This spec covers ONLY the rename + minimal label plumbing. Deeper changes (e.g., sub-turn time resolution, wall-clock sync, or turn-length dynamism) are out of scope.

---

## Rename map

### Public API (shipped types, external consumers depend on these)

| Before | After |
|---|---|
| `ScenarioSetupSchema.defaultStartYear: number` | `defaultStartTime: number` |
| `ScenarioSetupSchema.defaultYearsPerTurn?: number` | `defaultTimePerTurn?: number` |
| `SimulationMetadata.startYear: number` | `startTime: number` |
| `SimulationMetadata.currentYear: number` | `currentTime: number` |
| `SimEvent.data.year: number` (on turn/outcome/drift events) | `SimEvent.data.time` |
| `SimEvent.data.yearDelta: number` (on progression/outcome events) | `data.timeDelta` |
| `TurnEventInfo.year` (dashboard) | `.time` |
| `kernel.advanceTurn(nextTurn, nextYear, ...)` | `kernel.advanceTurn(nextTurn, nextTime, ...)` |
| `progressionHook` ctx `{ year, yearDelta, startYear, ... }` | `{ time, timeDelta, startTime, ... }` |
| `fingerprintHook` `outcomeLog[].year` | `.time` |
| `reactionContextHook` ctx `{ year, turn }` | `{ time, turn }` |
| `Agent.hexacoHistory[].year` | `.time` |
| `LeaderConfig` / `Personnel` — no-change (units are population-level, not time-level) | n/a |

### Scenario-label additions (new fields, additive)

| New field | Purpose | Example (Mars) |
|---|---|---|
| `labels.timeUnitNoun: string` | Singular display word for a single time-unit | `'year'` |
| `labels.timeUnitNounPlural: string` | Plural display word | `'years'` |

These are additive so Mars/Lunar continue working unchanged at the label layer. Default when absent: `'tick'` / `'ticks'` (most neutral).

### Internal-only consistency renames

| Before | After | Files |
|---|---|---|
| Local `startYear` variable in `agent-generator.ts`, `progression.ts` | `startTime` | engine/core/*.ts |
| `year` parameter in `createColonist` | `time` | `agent-generator.ts` |
| `yearsOnMoon` / `yearsOnMars` local-var naming | Keep (scenario-specific narrative); these are Mars/Lunar-domain names, not public API | (preserved) |
| Dashboard `state.year` → `state.time` | `state.time` | `hooks/useGameState.ts` + consumers |
| Compiler prompt strings: "over 48 years", "ctx.year", "currentYear: 2070" | Regenerate with generic `time` phrasing + scenario's `timeUnitNoun` where possible | `engine/compiler/generate-*.ts` |
| Dashboard UI literals `"Year 2043"`, `"T3/6 Year 2043"` | `"${labels.timeUnitNoun} 2043"` or just `"T2043"` depending on context | `components/sim/TurnEventHeader.tsx`, `StatsBar.tsx`, event renderers |

### Strings to leave alone

- Mars scenario narrative in `engine/mars/prompts.ts` can still say "years" — it's domain copy, not API surface
- Compiler-generated scenario hooks' prose for non-Mars scenarios will use the new `timeUnitNoun` field (regeneration cost below)
- HEXACO trait names, decision text, department names — all unchanged

---

## Cache invalidation

`engine/compiler/cache.ts::COMPILE_SCHEMA_VERSION` bumps **3 → 4**. Every cached compiled-scenario hook on a user's disk (`.paracosm/cache/*/manifest.json`) rejects on next `readCache()` and regenerates. Cost impact per user: one-time ~$0.10 per previously-compiled scenario. Documented in CHANGELOG.

The generated-hook prompt templates regenerate with the new `time` vocabulary so the LLM-emitted code references `ctx.time` / `ctx.timeDelta` instead of `ctx.year` / `ctx.yearDelta`.

---

## Dashboard saved-file migration

Saved files (`output/v3-*.json`, client-side history entries, server-side session replays) carry the old `year` / `yearDelta` / `startYear` / `currentYear` field names. After F23 these files break silently without a migration hop. F11's migration chain (shipped today) is the integration point — this is exactly what it was built for.

**Migration: `1 → 2`** already lives in `migrations[1]` (P1 legacy shape).
**Migration: `2 → 3`** is F23's new step. Adds to `migrations[2]` in `hooks/schemaMigration.ts`:

For each event in `data.events`:
- If `data.year` is set and `data.time` is not → alias `data.time = data.year`
- If `data.yearDelta` is set and `data.timeDelta` is not → alias `data.timeDelta = data.yearDelta`
- If `data.metadata.startYear` is set → alias `startTime`
- If `data.metadata.currentYear` is set → alias `currentTime`

For each entry in `data.results`:
- Same aliases applied to `metadata.*` and any nested `year` fields

**Never clobber new keys with old.** The check gates on the new field being absent, so a file already at v3 schema that somehow also carries the legacy field is safe.

**`CURRENT_SCHEMA_VERSION` bumps from 2 → 3** in `hooks/schemaMigration.ts`.

---

## Rollout sequence (phased plan)

Each phase is its own commit (or tight cluster) so bisect stays useful.

### Phase A — Engine core rename (types + kernel + progression + agent-generator)

- `src/engine/types.ts`: `defaultStartYear → defaultStartTime`, `defaultYearsPerTurn → defaultTimePerTurn`, `yearDelta → timeDelta` + `year → time` in all hook contexts
- `src/engine/core/state.ts`: `startYear → startTime`, `currentYear → currentTime`, event-payload `year → time`
- `src/engine/core/kernel.ts`: `advanceTurn(nextTurn, nextTime, ...)` signature, `init.startTime` field, all internal references
- `src/engine/core/progression.ts`: `yearDelta → timeDelta`, `ctx.time`, `ctx.startTime`
- `src/engine/core/agent-generator.ts`: parameter names

Result: `tsc --noEmit` gives an exhaustive error list chasing references through runtime + scenarios + compiler + dashboard.

### Phase B — Runtime rename (orchestrator + commander-setup + event emission)

- `src/runtime/orchestrator.ts`: every `event.year` emission → `.time`; every `year:` field passed to hooks → `time:`
- `src/runtime/commander-setup.ts` + `output-writer.ts`: align with new kernel shape
- `src/runtime/reaction-step.ts`, `emergent-setup.ts` if they read year/yearDelta

### Phase C — Compiler regeneration (prompt templates + cache bust)

- `src/engine/compiler/generate-progression.ts`, `generate-director.ts`, `generate-milestones.ts`, `generate-fingerprint.ts`, `generate-politics.ts`, `generate-reactions.ts`, `generate-prompts.ts`: prompt text rewritten from "year" / "yearDelta" / "startYear" / "currentYear" → "time" / "timeDelta" / "startTime" / "currentTime". Per-scenario dynamic: when scenario has `labels.timeUnitNoun: 'year'`, prompt keeps "year" phrasing; when it's `'hour'` or `'tick'`, prompt uses that.
- `src/engine/compiler/cache.ts`: `COMPILE_SCHEMA_VERSION: 3 → 4`
- `src/engine/compiler/validate.ts`: test fixtures use `startTime` / `currentTime`

### Phase D — Scenarios (built-in Mars + Lunar + any authored)

- `src/engine/mars/scenario.json`: `defaultStartYear → defaultStartTime: 2035`, `defaultYearsPerTurn → defaultTimePerTurn: 8`, `labels.timeUnitNoun: 'year'`, `labels.timeUnitNounPlural: 'years'`
- `src/engine/lunar/scenario.json`: same, `defaultStartTime: 2030`, `timeUnitNoun: 'year'`
- `scenarios/submarine.json`: `defaultStartTime: 2038`, still year-unit (submarine flows on a year cadence by default; future hour-granular variants set their own)
- `src/engine/_template/index.ts`: `defaultStartTime: 2040`
- `src/engine/mars/progression-hooks.ts`, `lunar/progression-hooks.ts`: destructure from new ctx shape

### Phase E — Dashboard (types + display)

- `src/cli/dashboard/src/hooks/useGameState.ts`: reducer reads `data.time` / `data.timeDelta`, exposes `state.time`, `TurnEventInfo.time`
- `src/cli/dashboard/src/hooks/schemaMigration.ts`: bump `CURRENT_SCHEMA_VERSION: 2 → 3`, add `migrations[2]` with year→time aliasing
- `src/cli/dashboard/src/hooks/useGamePersistence.ts`: `save()` writes `schemaVersion: 3` (already uses `CURRENT_SCHEMA_VERSION` constant from F4 batch 2, no manual edit needed)
- `src/cli/dashboard/src/components/sim/TurnEventHeader.tsx`: display uses `state.time` + `scenario.labels.timeUnitNoun` for label ("Year 2043" vs "Minute 308")
- `src/cli/dashboard/src/components/layout/StatsBar.tsx`: time-axis label uses `timeUnitNoun`
- Any event-renderer emitting "Year N" text

### Phase F — Tests

- `tests/engine/core/golden-run.test.ts`: snapshot regenerated (field renames propagate)
- `tests/engine/compiler/cache-version-bust.test.ts`: assert v3 manifest rejected after 3→4 bump
- New `tests/runtime/migrate-v2-to-v3-event-shape.test.ts`: covers year→time aliasing
- `useLoadPreview.helpers.test.ts`, `useGameState.test.ts`: fixtures updated

### Phase G — Docs

- `README.md`, `docs/ARCHITECTURE.md`: year-ism copy scrubbed or made conditional on scenario's `timeUnitNoun`
- Landing-page code example
- CHANGELOG.md: 0.6.0 entry with migration path, cost impact, rollback notes

### Phase H — Version bump + publish

- `package.json`: `0.5.X → 0.6.0`
- CI-run-number versioning means next publish is `0.6.<run_number>`
- Commit subject uses `feat!:` prefix (breaking-change signal)

---

## Testing plan

**Golden fixtures captured before the rename**

- `tests/fixtures/legacy-0.5-run.json` — full event stream + result from a Mars run at current 0.5.x state. Becomes the 2→3 migration input fixture.
- `tests/fixtures/legacy-0.5-cache/` — scrubbed `.paracosm/cache/` snapshot with a `v3` manifest + one progression hook source referencing `ctx.year`. Used by the v3→v4 cache-bust test.

**New tests**

- `tests/runtime/migrate-v2-to-v3-event-shape.test.ts`: event with `data.year` only → output has `data.time`, `data.year` preserved; event with both → new key untouched; metadata startYear → startTime alias.
- `tests/engine/compiler/cache-version-bust.test.ts` (extend): v3 manifest → null after bump to v4.
- Dashboard `schemaMigration.test.ts` extended: fixture with `schemaVersion: 2` → migrates via chain to v3.

**Existing tests**

- Rename in place across ~10 test files touching `year` / `startYear` / `yearsPerTurn`.
- `tests/engine/core/golden-run.test.ts` snapshot regenerated.

**Build + type-check gates**

- `npm run build` passes after each phase.
- Dashboard typecheck passes after Phase E.
- Full dashboard test suite (201+ today) passes after Phase F.

**Real-LLM smoke (~$0.30)**

- `bun src/index.ts` against the quickstart landing example at Phase G completion:
  - `result.finalState.metadata.currentTime === 2043` ✓
  - `e.data.time` reads correctly on `systems_snapshot` events ✓
  - `.paracosm/cache/` regenerates at v4 on first run ✓

**Legacy-data end-to-end**

- Load `tests/fixtures/legacy-0.5-run.json` through the dashboard's file-load path:
  - Timeline, viz, reports, cost breakdown all render.
  - No console errors or `undefined` placeholders.
  - TurnEventHeader shows "Year 2043" (Mars has `timeUnitNoun: 'year'`).

**Post-deploy**

- Open `https://paracosm.agentos.sh/sim` after CI deploys. Launch one run. No undefineds, event log renders, cost ticks, verdict lands.

---

## Risks + edge cases

**Risks**

1. **User scenario caches on disk.** Anyone with `.paracosm/cache/` holding pre-0.6 hooks pays ~$0.10 recompile per scenario. Documented.
2. **Downstream programmatic consumers.** Code against `result.finalState.metadata.currentYear` or `event.data.year` gets a TypeScript error (TS users) or silent `undefined` at runtime (JS users). The 0.6.0 bump + CHANGELOG are the mitigation.
3. **Compiler-generated hooks cached on the hosted demo server.** Deploy bumps `COMPILE_SCHEMA_VERSION`; the first run after deploy pays ~$0.10 to regenerate. Acceptable one-time cost.
4. **Labels missing on older scenarios.** `labels.timeUnitNoun` is additive; existing scenarios without it fall back to `'tick'` / `'ticks'`. Mars + Lunar get explicit `'year'` in this PR so nothing visible changes there.

**Edge cases handled explicitly**

- `results[].metadata.startYear` → aliased to `startTime` in the load migration.
- Events where old + new keys both present → new wins.
- `yearDelta` in a progression hook's context is used by Mars/Lunar hooks — both scenarios updated in Phase D to read `timeDelta`.
- Hosted demo live sessions during deploy: SSE connections drop (normal); reconnect triggers replay through the new migration path.

---

## Out of scope for F23

- **Sub-turn time granularity.** Each turn is still one tick of whatever unit; no partial-turn state.
- **Real-time clock sync.** The engine doesn't sync simulated time to wall-clock time; that'd be an AgentOS Arena feature, separate spec.
- **Per-leader time divergence.** Leaders still share the same tick cadence; divergence lives in decisions + outcomes, not time itself.
- **Backward-compat flags.** No `--legacy-year-fields` compatibility toggle. The 0.6.0 version bump IS the opt-in; downstream pins `^0.5.x` if they need the old shape.

---

## Acceptance criteria

- `tsc --noEmit` passes across `src/` + `src/cli/dashboard/`
- All existing + new tests pass
- `bun src/index.ts` against the quickstart runs end-to-end and produces `result.finalState.metadata.currentTime` / `result.finalState.metadata.startTime`
- Loading a pre-0.6 `output/v3-*.json` through the dashboard file-load path renders all tabs without console errors
- npm publishes as `0.6.<run_number>`
- Hosted demo at `paracosm.agentos.sh` launches a sim successfully after deploy
- CHANGELOG entry cites the rename + links to the migration path

---

## Follow-ups (deferred)

- **F23.1: `timeUnitNoun`-aware UI polish.** Not every dashboard string that currently says "year" gets threaded through `timeUnitNoun` in this PR. Subsequent pass when a non-year scenario is actually authored.
- **F23.2: Alternative time-unit scenarios.** Once the rename lands, author one non-year scenario (submarine hourly, or corporate quarterly) to validate the end-to-end works. Separate spec.
- **F23.3: Sub-turn time resolution** (if AgentOS Arena wants ms-granular event emission).
