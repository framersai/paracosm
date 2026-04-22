# P1 — Domain-Agnostic Core Schema (rename + cache-bust)

**Status:** design, awaiting approval
**Date:** 2026-04-21
**Scope:** first of a multi-phase generalization effort that turns paracosm from a civilization-simulation engine into a counterfactual multi-agent world engine. This spec covers ONLY the domain-agnostic schema cleanup (P1 in the roadmap). P2 (multi-agent / peer mode), P3 (scoring framework), P4 (agent adapter interface), P5 (intervention framework), and every vertical product (Arena, War Room, LaunchLab, Worlds) are deliberately out of scope here and each get their own spec.

---

## Motivation

Paracosm's public API still carries Mars-heritage vocabulary in the type system — `LeaderConfig.colony`, `SimulationState.colony`, `SimEvent.data.colony`, `SimEvent.data.colonyDeltas`, the `'colony_snapshot'` event type, `ColonyPatch`, and `kernel.applyColonyDeltas`. The scenarios layer already supports non-Mars domains via `labels.populationNoun` + `settlementNoun`, so a submarine habitat or a medieval kingdom compiles and runs today — but the field names a library consumer sees in their editor's autocomplete all read like "colony." That defeats half the positioning of paracosm as a general-purpose counterfactual engine.

This spec: **rename only.** No structural changes. The flat `WorldSystems` runtime type keeps its existing field list; we rename the access path that wraps it (`state.colony` → `state.systems`) and every public identifier that contains "colony." The deeper re-architecting to the structured `WorldState` type (metrics/capacities/statuses/politics bags already declared in `types.ts:89` but never wired through) is a separate project.

---

## Architecture

**Changes confined to rename.** The semantics of every field, method, and event stay identical. What moves is the identifier.

- `WorldSystems` type name stays. Its field list (`population`, `morale`, `foodMonthsReserve`, `powerKw`, `waterLitersPerDay`, `pressurizedVolumeM3`, `lifeSupportCapacity`, `infrastructureModules`, `scienceOutput` + `[key: string]: number` index signature) stays. A new doc comment will call out that these are Mars/space heritage conveniences that non-space scenarios extend via the index signature.
- The access path `state.colony` → `state.systems` — one field rename on `SimulationState`.
- Event shapes (`SimEvent.data.colony`, `.colonyDeltas`, `'colony_snapshot'`) all follow the same rename.
- Public type `ColonyPatch` → `SystemsPatch`. Public method `kernel.applyColonyDeltas()` → `kernel.applySystemDeltas()`.
- Display-label field `LeaderConfig.colony: string` → `LeaderConfig.unit: string` (distinct concept from the world-state rename; this one names the organizational unit the leader commands, not the world-state bag).

**Version bump signal.** Paracosm uses CI-run-number versioning (`${MAJOR}.${MINOR}.${github.run_number}`) reading `package.json`, NOT semantic-release. To signal the break, bump `package.json` version from `0.4.x` to `0.5.0` in the same commit. Downstream consumers using `^0.4.x` caret ranges refuse to auto-upgrade; anyone on `^0.5.0` or unpinned opts in.

**Cache invalidation.** `engine/compiler/cache.ts::COMPILE_SCHEMA_VERSION` bumps 2 → 3. Every cached compiled-scenario hook on a user's disk (`.paracosm/cache/*/manifest.json`) rejects on next `readCache()` call and regenerates. Cost impact per user: one-time ~$0.10 per previously-compiled scenario. Documented in the CHANGELOG.

---

## Rename map (exact before / after)

### Public API (shipped types, external consumers depend on these)

| Before | After |
|---|---|
| `LeaderConfig.colony: string` | `LeaderConfig.unit: string` |
| `SimulationState.colony: WorldSystems` | `SimulationState.systems: WorldSystems` |
| `ColonyPatch` (exported from `engine/core/kernel.ts`) | `SystemsPatch` |
| `kernel.applyColonyDeltas(deltas, events)` | `kernel.applySystemDeltas(deltas, events)` |
| `SimEvent.data.colony: Record<string, number>` (on `turn_start`, `turn_done`, `sim_aborted`) | `SimEvent.data.systems` |
| `SimEvent.data.colonyDeltas: Record<string, number>` (on `outcome`) | `SimEvent.data.systemDeltas` |
| `SimEventType` literal `'colony_snapshot'` | `'systems_snapshot'` |
| CLI `--colony <value>` flag | `--unit <value>` |
| `WorldSystems` type name | **unchanged** |
| `ScenarioPackage.world: ScenarioWorldSchema` (schema declaration) | **unchanged** (distinct concept) |
| `WorldState` (structured type in types.ts:89) | **unchanged** (not yet wired; out of scope) |

### Internal-only consistency renames (not public API, but part of this commit for the codebase to read cleanly)

| Before | After | Files |
|---|---|---|
| `colony` local parameter / variable in `progression.ts` (~10 call sites) | `systems` | `engine/core/progression.ts` |
| `ctx.state.colony.*` in hand-written prompt strings | `ctx.state.systems.*` | `engine/mars/prompts.ts`, `engine/lunar/prompts.ts`, `engine/mars/fingerprint.ts`, `engine/lunar/fingerprint.ts` |
| "Access `ctx.state.colony`" in compiler-generated LLM instructions | "Access `ctx.state.systems`" | `engine/compiler/generate-prompts.ts` |
| "hurts the colony" / "colony morale" in judge prompts | "hurts the simulation state" / "systems state morale" | `runtime/orchestrator.ts` judge prompts |
| Dashboard `ColonyState` interface | `SystemsState` | `useGameState.ts` |
| Dashboard `SideState.colony` / `.prevColony` | `.systems` / `.prevSystems` | `useGameState.ts` + consumers |
| Dashboard `LeaderInfo.colony: string` | `LeaderInfo.unit: string` | `useGameState.ts` + consumers |
| Dashboard props `colonyA` / `colonyB` / `prevColonyA` / `prevColonyB` | `systemsA` / `systemsB` / `prevSystemsA` / `prevSystemsB` | `StatsBar.tsx`, `SimView.tsx`, etc. |
| Dashboard `LeaderConfig.tsx` form field `data.colony` input | `data.unit` input | `settings/LeaderConfig.tsx` |
| Config `"colony": "..."` field in `leaders.json` / `leaders.example.json` | `"unit": "..."` | `config/leaders.json`, `config/leaders.example.json` |

### Strings to leave alone (user-facing vocabulary, NOT field names)

- `settlementNoun: 'colony'` default + the docstrings that cite it as an example
- Chat-agent `settlement` argument fallback of `'colony'`
- `scenario.labels` content — never touched by rename
- Comments that describe Mars scenario behavior ("colony-wide starvation" etc.) — rephrase opportunistically if crossed during edits, not a hard requirement

---

## Legacy-data load migration

Paracosm ships saved run-output JSON (`output/v3-*.json`), and the dashboard reloads them via `handleLoad`. The server also persists sessions in `session-store.ts` and replays them via `/sessions/:id/replay` SSE. Both store events serialized with the old field names. After rename, old files and old sessions would render as broken (undefined metrics, missing snapshot events) without a migration hop.

**`migrateLegacyEventShape(events, results?)`** — a pure function added to the dashboard's persistence layer. For each event:

- If `data.colony` is set and `data.systems` is not → alias `data.systems = data.colony`
- If `data.colonyDeltas` is set and `data.systemDeltas` is not → alias `data.systemDeltas = data.colonyDeltas`
- If `event.type === 'colony_snapshot'` → rewrite to `'systems_snapshot'`
- **Never clobber new keys with old**: the check always gates on the new field being absent, so a future emitter writing both forms is safe.

For `results[]` (run-output file format):
- If `results[i].leader.colony` exists and `results[i].leader.unit` does not → alias.

**Call sites in the dashboard:**
1. `useGamePersistence.ts::load()` — file-load path. Migrate before dispatching to `sse.loadEvents(...)`.
2. `useSSE.ts` replay EventSource handler — migrate each event as it arrives from the `/sessions/:id/replay` endpoint. Legacy sessions in the server's store replay cleanly.

Cost: ~40 lines of pure function + two 1-line integration points.

---

## Rollout sequence (single atomic commit, staged edits)

1. **Bump `package.json` version** `0.4.88` → `0.5.0`. Next CI build publishes `0.5.<run_number>`. `^0.4.x` ranges refuse to auto-upgrade.
2. **Core types.** Rename in `src/engine/types.ts` + `src/engine/core/{state,kernel,progression}.ts` + `src/runtime/orchestrator.ts`. Includes `progression.ts` local parameter names. `tsc --noEmit` then gives an exhaustive error list.
3. **Chase tsc errors through runtime + scenarios.** `reaction-step.ts`, `commander-setup.ts`, `output-writer.ts`, `emergent-setup.ts`, `chat-agents.ts`, Mars + Lunar prompts + fingerprint hooks.
4. **Compiler template + cache bust.** `compiler/generate-prompts.ts` LLM instructions rewritten. `COMPILE_SCHEMA_VERSION` 2 → 3 in `engine/compiler/cache.ts`.
5. **Config + CLI.** `config/leaders.json`, `config/leaders.example.json` (rename `"colony"` → `"unit"` field). CLI flag `--colony` → `--unit` in `cli/run.ts`. `cli/pair-runner.ts` + `cli/serve.ts` updated.
6. **Dashboard (~15-20 files).** Rename `ColonyState` → `SystemsState`, `colony`/`prevColony` → `systems`/`prevSystems`, `colonyA`/`colonyB` → `systemsA`/`systemsB`. Imports + field references across the 10 files identified in verification.
7. **Legacy load migration.** Add `migrateLegacyEventShape` function + call from the two identified sites.
8. **Tests.** `tests/engine/core/golden-run.test.ts` snapshot regenerated. Rest are rename-in-place (10+ files).
9. **Docs.** README, landing-page `api-code`, ARCHITECTURE.md, any other `.md` referencing `leader.colony` / `state.colony`. Regenerate TypeDoc.
10. **Verify before commit.** `npm run build` + targeted tests + manual `bun src/index.ts` against quickstart (LLM smoke, ~$0.30) + load one pre-rename saved run through the dashboard to confirm migration works.

**Commit type.** Subject uses `feat!:` — breaking-change signal for reviewers + CHANGELOG generators. Paracosm's CI doesn't branch on commit type, so this is a human signal only.

**Rollback plan.** `git revert` + immediate patch release. No DB migrations, no persistent state that's hard to roll back — the load migration is read-only.

**Hosted demo deploy.** `paracosm.agentos.sh` auto-redeploys on master push via CI/CD. Cache dir on the server regenerates harmlessly on first compile after deploy. No manual server action.

---

## Risks + edge cases

**Risks**

1. **User scenario caches on disk.** Anyone with a `.paracosm/cache/` dir holding pre-0.5.0 compiled hooks pays a one-time ~$0.10 recompile per scenario on first upgrade. Documented in CHANGELOG.
2. **Downstream programmatic consumers.** Anyone with code against `leader.colony` / `event.data.colony` / `'colony_snapshot'` gets a TypeScript error on upgrade (TS users) or silent `undefined` at runtime (JS users). The minor bump + release notes are the mitigation.
3. **Migration function misses a field.** Verification includes loading a real pre-rename saved run through the dashboard before ship.

**Edge cases handled explicitly**

- `results[].leader.colony` → alias in load migration.
- Events where old + new keys both present → new wins (no-op overwrite), migration only fills missing new keys.
- Downstream users who forked Mars/Lunar scenarios and ship their own: their hand-written `ctx.state.colony.X` references break. No library-level mitigation; CHANGELOG flags the required update.
- Hosted demo live sessions during deploy: SSE connections drop (normal); reconnect triggers replay through new migration path.

---

## Out of scope for P1

- `WorldSystems` field list stays. Making all fields optional / fully scenario-declared is its own project (P1.5).
- Migrating runtime to the structured `WorldState` type (metrics/capacities/statuses/politics bags) stays out.
- `ScenarioPackage.world` schema — unchanged.
- Scenario-pack distribution format (npm sub-package convention, registry, discovery) — P1.1 if needed later.
- Dashboard UI label copy — already uses `labels.settlementNoun`; no Mars-ism in what the user reads.
- Anything P2+ (multi-agent peer mode, scoring framework, agent adapters, intervention framework, vertical products).

---

## Testing plan

**Golden fixtures captured before the rename**

- `tests/fixtures/legacy-0.4-run.json` — full event stream + result from a Mars 3-turn run at the current `0.4.x` state. This becomes the migration input fixture.
- `tests/fixtures/legacy-0.4-cache/` — a scrubbed `.paracosm/cache/` snapshot with a `v2` manifest + one progression hook source referencing `ctx.state.colony.population`.

**New tests added in this spec**

- `tests/runtime/migrate-legacy-event-shape.test.ts`:
  - Event with `data.colony` only → output has `data.systems` populated, `data.colony` preserved.
  - Event with both `colony` and `systems` → new key untouched.
  - Event `type: 'colony_snapshot'` → output `type: 'systems_snapshot'`.
  - `results[].leader.colony` → aliased to `.unit`.
- `tests/engine/compiler/cache-version-bust.test.ts`:
  - `v2` manifest → `readCache` returns null after `COMPILE_SCHEMA_VERSION` bump.

**Existing tests**

- Rename in place across 10+ test files touching `colony` / `ColonyState`.
- `tests/engine/core/golden-run.test.ts` snapshot regenerated.

**Build + type-check gates**

- `npm run build` (`tsc -p tsconfig.build.json --noEmit`) passes after every major edit batch.
- `cd src/cli/dashboard && npx tsc --noEmit -p tsconfig.json` passes.
- `node --import tsx --test tests/**/*.test.ts` passes (skipping LLM-cost tests).

**Real-LLM smoke (~$0.30)**

- `bun src/index.ts` against the quickstart landing example:
  - `result.leader.unit === 'Station Alpha'` ✓
  - `result.finalState.systems.population` populated ✓
  - `e.data.summary` reads correctly for `systems_snapshot` events ✓
  - `.paracosm/cache/` regenerates at v3 on first run ✓

**Legacy-data end-to-end**

- Load `tests/fixtures/legacy-0.4-run.json` through the dashboard's file-load path:
  - Timeline, viz, reports, cost breakdown all render.
  - No console errors or `undefined` placeholders in the DOM.

**Post-deploy**

- Open `https://paracosm.agentos.sh/sim` after CI deploys. Launch one simulation. Confirm: no undefineds in console, event log renders, cost counter ticks, final verdict renders.

---

## Acceptance criteria

- `tsc --noEmit` passes across `src/` + `src/cli/dashboard/`.
- All existing + new tests pass.
- `bun src/index.ts` against the quickstart example runs end-to-end and produces a `result.leader.unit` / `result.finalState.systems.*` shape.
- Loading a pre-0.5.0 `output/v3-*.json` saved run through the dashboard renders all tabs without console errors.
- npm publishes as `0.5.<run_number>`.
- Hosted demo at `paracosm.agentos.sh` launches a sim successfully after deploy.
- CHANGELOG entry cites the rename + links to the migration path.

---

## Follow-ups (deferred to subsequent specs)

- **P1.1**: Scenario-pack distribution format + registry (if vertical demos demand it).
- **P1.5**: Collapse `WorldSystems` Mars-heritage fields to fully scenario-declared (or migrate runtime to the structured `WorldState` type).
- **P2**: Multi-agent / peer mode — run N leaders against the same seed without a hierarchy.
- **P3**: Scoring / judging framework for head-to-head benchmark runs.
- **P4**: Agent adapter interface so LangGraph / CrewAI / AgentOS / custom agents can plug in as the decision-maker.
- **P5**: Intervention framework — mid-run parameter / agent / policy injection.
- Vertical demos: AgentBench Arena, War Room, LaunchLab, Worlds.
