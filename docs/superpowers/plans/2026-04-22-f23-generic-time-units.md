# F23 implementation plan — generic time-units rename

**Spec:** [2026-04-22-f23-generic-time-units-design.md](../specs/2026-04-22-f23-generic-time-units-design.md)
**Target:** 0.6.0 breaking release (`feat!:` prefix)
**Shape:** 3 commits — atomic rename, tests refresh, docs + version bump
**Effort estimate:** 2-3 hours of focused work, ~40 files of edits

This plan is the operational checklist. The design rationale lives in the spec; read that first to understand why the rename matters.

---

## Pre-flight (before touching any code)

- [ ] Confirm master is clean: `git status` shows no modified tracked files
- [ ] Confirm recent F14 / F15 / F4-batch-3 commits are pushed
- [ ] Capture a golden legacy fixture BEFORE the rename:
  - `cp output/v3-*.json tests/fixtures/legacy-0.5-run.json` (a real Mars run from 0.5.x)
  - Include one pre-F23 compiled-scenario cache snapshot at `tests/fixtures/legacy-0.5-cache/`
- [ ] Take a baseline screenshot of the live dashboard's TurnEventHeader + StatsBar for manual regression diff
- [ ] Verify `npm run build` + `node --import tsx --test 'src/cli/dashboard/src/**/*.test.ts'` are both green

## Commit 1 — atomic rename (`feat!:`)

**Subject:** `feat!: F23 generic time-units rename (year → time, 0.6.0)`

Lands the full rename as one typecheck-green commit. Within the commit, order edits phase A→E so `tsc --noEmit` only lights up the next layer out.

### Phase A — engine core types

- [ ] `src/engine/types.ts`
  - [ ] `ScenarioSetupSchema.defaultStartYear → defaultStartTime`
  - [ ] `ScenarioSetupSchema.defaultYearsPerTurn → defaultTimePerTurn`
  - [ ] `ProgressionHookContext.yearDelta → timeDelta`, `.year → .time`, `.startYear → .startTime`
  - [ ] `ScenarioHooks.reactionContextHook` ctx `{ year, turn } → { time, turn }`
  - [ ] `ScenarioHooks.fingerprintHook` outcomeLog `year → time`
  - [ ] `Scenario.year → .time`
- [ ] `src/engine/core/state.ts`
  - [ ] `HexacoSnapshot.year → .time`
  - [ ] `LifeEvent.year → .time`
  - [ ] `AgentCore.birthYear → birthTime`
  - [ ] `AgentHealth.deathYear → deathTime`
  - [ ] `SimulationMetadata.startYear → startTime`
  - [ ] `SimulationMetadata.currentYear → currentTime`
  - [ ] Any `SimEvent` payload field carrying year → time
- [ ] `src/engine/core/kernel.ts`
  - [ ] `init.startYear → startTime` (defaults to 2035 still)
  - [ ] `advanceTurn(nextTurn, nextYear, ...) → advanceTurn(nextTurn, nextTime, ...)`
  - [ ] Internal `yearDelta → timeDelta`, `currentYear → currentTime`
  - [ ] `applyDrift(commanderHexaco, outcome, yearDelta) → (..., timeDelta)`
- [ ] `src/engine/core/progression.ts`
  - [ ] Function-level `yearDelta` parameter → `timeDelta`
  - [ ] `progressionHook` ctx fields updated
  - [ ] Local `year`/`birthYear` references updated (careful — some `year` vars are from ctx, some are new-age calcs)
- [ ] `src/engine/core/agent-generator.ts`
  - [ ] `startYear: number` parameter → `startTime`
  - [ ] `birthYear` property on generated Agent.core → `birthTime`
  - [ ] `hexacoHistory[].year → .time`

Run `tsc --noEmit -p tsconfig.build.json` — expect a wall of errors propagating outward. Use them as the checklist for Phase B.

### Phase B — runtime

- [ ] `src/runtime/orchestrator.ts` — every `e.year` emission → `.time`; every hook ctx building → `time`/`timeDelta`/`startTime`; age calcs `year - birthYear → time - birthTime`
- [ ] `src/runtime/commander-setup.ts` — `startYear` → `startTime`; age calcs
- [ ] `src/runtime/departments.ts`, `director.ts`, `reaction-step.ts`, `parsers.ts`, `runtime-helpers.ts`, `tool-ledger.ts`, `generic-fingerprint.ts` — each file's year refs
- [ ] `src/runtime/agent-reactions.ts` — `ctx.year` → `ctx.time`; `agent.core.birthYear` → `birthTime`
- [ ] `src/runtime/research/*` — if any year/startYear references
- [ ] `src/runtime/hexaco-cues/*` — same
- [ ] `src/runtime/output-writer.ts` — confirm it's clean (grep above showed no year refs)

### Phase C — compiler

- [ ] `src/engine/compiler/cache.ts` — `COMPILE_SCHEMA_VERSION: 3 → 4`
- [ ] `src/engine/compiler/generate-progression.ts` — prompt template: replace `ctx.year`, `ctx.yearDelta`, `ctx.startYear` with `ctx.time`, `ctx.timeDelta`, `ctx.startTime`. Type doc strings for the generated function signature. When `scenario.labels.timeUnitNoun === 'year'`, keep "year" phrasing in prompt narrative; otherwise parameterize.
- [ ] `src/engine/compiler/generate-director.ts` — same pattern
- [ ] `src/engine/compiler/generate-milestones.ts` — same
- [ ] `src/engine/compiler/generate-fingerprint.ts` — `{ currentYear, startYear }` → `{ currentTime, startTime }` in prompt + test fixture
- [ ] `src/engine/compiler/generate-politics.ts` — same
- [ ] `src/engine/compiler/generate-reactions.ts` — `defaultStartYear` ref → `defaultStartTime`; `ctx.year` → `ctx.time`; narrative "Arrived N years ago" parameterized via `timeUnitNounPlural`
- [ ] `src/engine/compiler/generate-prompts.ts` — any ctx.year references
- [ ] `src/engine/compiler/validate.ts` — test fixture `startYear → startTime`, `currentYear → currentTime`, `birthYear → birthTime`

### Phase D — scenarios

- [ ] `src/engine/_template/index.ts` — `defaultStartYear: 2040 → defaultStartTime: 2040`; add `timeUnitNoun: 'year'`, `timeUnitNounPlural: 'years'`
- [ ] `src/engine/mars/scenario.json`
  - [ ] `defaultStartYear: 2035 → defaultStartTime: 2035`
  - [ ] `defaultYearsPerTurn: 8 → defaultTimePerTurn: 8`
  - [ ] Add `labels.timeUnitNoun: 'year'`, `labels.timeUnitNounPlural: 'years'`
- [ ] `src/engine/mars/progression-hooks.ts` — ctx destructure updated; `yearsOnMars` narrative string stays (scenario-specific)
- [ ] `src/engine/mars/prompts.ts` — `state.metadata.currentYear` → `currentTime`; `c.core.birthYear` → `birthTime`
- [ ] `src/engine/mars/fingerprint.ts` — outcomeLog field name
- [ ] `src/engine/lunar/scenario.json` — same as Mars
- [ ] `src/engine/lunar/progression-hooks.ts` — same
- [ ] `src/engine/lunar/prompts.ts` + `fingerprint.ts` — same
- [ ] `scenarios/submarine.json` — `defaultStartYear → defaultStartTime`; add `timeUnitNoun: 'year'` for now (future variant can switch to 'hour')

### Phase E — dashboard

- [ ] `src/cli/dashboard/src/hooks/useGameState.ts`
  - [ ] Reducer reads `data.time` / `data.timeDelta` (with fallback to legacy `data.year` / `data.yearDelta` until migration runs)
  - [ ] Exposes `state.time`, `TurnEventInfo.time`, `hexacoHistory[].time`
  - [ ] Update test fixtures in `useGameState.test.ts` — expected shape uses new keys
- [ ] `src/cli/dashboard/src/hooks/schemaMigration.ts`
  - [ ] `CURRENT_SCHEMA_VERSION: 2 → 3`
  - [ ] Add `migrations[2]`: for each event, if `data.year` set and `data.time` absent → alias; same for `yearDelta → timeDelta`; metadata `startYear → startTime`, `currentYear → currentTime`
  - [ ] For `results[]`: alias nested metadata + agent `birthYear → birthTime`
  - [ ] `schemaMigration.test.ts` — update `CURRENT_SCHEMA_VERSION is 2 today` → `3`, add new test for v2→v3 migration
- [ ] `src/cli/dashboard/src/hooks/useGamePersistence.ts` — verify `save()` uses `CURRENT_SCHEMA_VERSION` constant (already does since F9 review fixes — no edit needed, but confirm)
- [ ] `src/cli/dashboard/src/hooks/useLocalHistory.helpers.ts` — `summarizeEvents` still works on event stream (events are migrated before reaching here); no change unless the ring stores year-keyed metadata
- [ ] `src/cli/dashboard/src/hooks/useLoadPreview.helpers.ts` — `extractTurn` works off `data.turn` (unchanged); no edits needed. Confirm fixtures.
- [ ] `src/cli/dashboard/src/components/sim/TurnEventHeader.tsx` — display uses `event.time` + `scenario.labels.timeUnitNoun` for label ("Year 2043" vs "Minute 308"); import `useScenarioContext` or get labels via prop
- [ ] `src/cli/dashboard/src/components/layout/StatsBar.tsx` — time-axis references updated if any
- [ ] `src/cli/dashboard/src/components/viz/TurnBanner.tsx` — dynamic turn banner text
- [ ] `src/cli/dashboard/src/components/viz/grid/HudLayer.ts` — any `year` references
- [ ] `src/cli/dashboard/src/components/sim/Timeline.tsx` — time-axis
- [ ] `src/cli/dashboard/src/components/chat/ChatPanel.tsx` — any `year` references (likely display strings)
- [ ] `src/cli/dashboard/src/components/reports/ReportView.tsx` + `reports-shared.ts` — display strings
- [ ] `src/cli/dashboard/src/components/tour/demoData.ts` — demo fixture events carry `year` field; update to `time`
- [ ] `src/cli/dashboard/src/components/settings/SettingsPanel.tsx` — `scenario.setup.defaultStartYear` → `defaultStartTime`; `defaultYearsPerTurn` → `defaultTimePerTurn`; state variables `startYear → startTime`, `yearsPerTurn → timePerTurn`
- [ ] `src/cli/dashboard/src/hooks/useScenario.ts` — `ScenarioClientPayload` type updated to match engine
- [ ] Grep `grep -rn '\byear\b' src/cli/dashboard/src` — triage any remaining hits

**Verify Commit 1 green:**
- `tsc --noEmit -p tsconfig.build.json` clean
- `npx tsc --noEmit -p src/cli/dashboard/tsconfig.json` clean
- `npm run build` exit 0
- Commit with subject `feat!: F23 generic time-units rename (year → time, 0.6.0)`

## Commit 2 — tests + fixtures (`test:`)

**Subject:** `test(paracosm): F23 refresh golden run + add v2→v3 migration tests`

- [ ] `tests/engine/core/golden-run.test.ts` — regenerate snapshot (run `bun src/index.ts` with seed 100 + mars; delete + regenerate snapshot file)
- [ ] `tests/runtime/migrate-v2-to-v3-event-shape.test.ts` — new file
  - [ ] Event with `data.year` only → output has `data.time`, `data.year` preserved
  - [ ] Event with both → new key untouched
  - [ ] Metadata `startYear → startTime` alias
  - [ ] Agent `birthYear → birthTime` alias
- [ ] `tests/engine/compiler/cache-version-bust.test.ts` — extend to assert v3 manifest → null after bump to v4
- [ ] `tests/runtime/chat-roster.test.ts`, `agent-memory.test.ts`, `runtime-helpers.test.ts` — field-name renames in expected values
- [ ] `tests/cli/server-app.test.ts`, `sim-config.test.ts`, `cli-run-options.test.ts` — same
- [ ] `tests/engine/core/progression.test.ts` — `birthYear` in fixture objects → `birthTime`; `yearDelta` in ctx → `timeDelta`
- [ ] `tests/engine/core/kernel.test.ts` — `advanceTurn` signature, `currentYear` → `currentTime`
- [ ] Dashboard tests: `schemaMigration.test.ts` + `useGameState.test.ts` (already covered in Phase E)
- [ ] `tests/fixtures/legacy-0.4-run.json` — KEEP as-is (pre-F23 fixture for testing v1→v3 full migration chain)

**Verify:**
- `node --import tsx --test tests/**/*.test.ts` — all pass
- Commit with subject `test(paracosm): F23 refresh golden run + add v2→v3 migration tests`

## Commit 3 — docs + version bump (`chore(release):`)

**Subject:** `chore(release): 0.6.0 F23 generic time-units breaking rename`

- [ ] `README.md` — year-ism copy in Quick Start + Programmatic Usage sections → use `timeUnitNoun` phrasing OR keep "year" for Mars-example consistency (Mars keeps `timeUnitNoun: 'year'` so narrative is unchanged there). Update `r.finalState.metadata.currentYear` → `.currentTime` in the code example.
- [ ] `docs/ARCHITECTURE.md` — same surface, mostly under "How HEXACO drives decisions" + "The Runtime"
- [ ] `CHANGELOG.md` — 0.6.0 entry:
  - [ ] Breaking: `year` → `time` across all public API fields
  - [ ] `birthYear` → `birthTime`
  - [ ] New: `labels.timeUnitNoun` + `timeUnitNounPlural`
  - [ ] Migration: old saved files auto-alias via `migrations[2]`
  - [ ] Cost: one-time ~$0.10 per previously-compiled scenario for cache-bust recompile
  - [ ] Downstream: `^0.5.x` caret ranges refuse to auto-upgrade (intentional)
- [ ] `package.json` — `0.5.X → 0.6.0`
- [ ] Landing-page code example (if the marketing site is part of this repo / submodule)

**Verify:**
- `npm run build` clean
- `bun src/index.ts` against quickstart produces `result.finalState.metadata.currentTime` + `r.leader.unit`
- Load `tests/fixtures/legacy-0.5-run.json` through dashboard file-picker → renders clean, TurnEventHeader shows "Year 2043"
- Commit with subject `chore(release): 0.6.0 F23 generic time-units breaking rename`

## Post-commit verification

- [ ] `npx tsc --noEmit -p tsconfig.build.json` clean
- [ ] Dashboard typecheck clean
- [ ] Full test suite green (200+ dashboard, 40+ library)
- [ ] `coderabbit review --agent --plain --base <3-commits-ago>` — address any findings; commit fixes as `fix(scope): F23 coderabbit review (<summary>)`
- [ ] `superpowers:requesting-code-review` (or structured self-review) — structural pass against spec
- [ ] Push paracosm master
- [ ] Bump monorepo submodule pointer; push monorepo

## Post-deploy verification (once CI/CD publishes 0.6.x)

- [ ] `paracosm.agentos.sh` launches a Mars sim cleanly (no undefineds in console)
- [ ] Cached compiled-hooks on the hosted server regenerate at `v4`
- [ ] Load a saved run from a pre-F23 browser cache via the file picker → v2→v3 migration fires transparently
- [ ] Dashboard `Event Log` → Schema chip reads `v3`

## Rollback plan

- `git revert <3 commit shas>` + immediate `0.6.1` patch release
- No DB migrations, no persistent state that's hard to roll back
- Cached compiled-hooks on users' disk regenerate harmlessly on first post-rollback run

## Follow-ups (tracked separately)

- **F23.1** — thread `labels.timeUnitNoun` into dashboard display strings that still hardcode "year" (few survive Phase E; this is cleanup). Minor; ships when a non-year scenario is actually authored.
- **F23.2** — author a non-year scenario (submarine-hourly or corporate-quarterly) as the end-to-end validation that the rename actually unlocks the new use case.
- **F23.3** — sub-turn time resolution (if AgentOS Arena wants ms-granular event emission). Separate spec, well-beyond F23's scope.
