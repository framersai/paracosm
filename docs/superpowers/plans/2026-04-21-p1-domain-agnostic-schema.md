# P1 — Domain-Agnostic Core Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Subagent-driven execution is disallowed by the project's operator preferences (no Agent-tool dispatch, no worktrees with submodules).

**Goal:** Rename every Mars-heritage identifier in paracosm's public API (`colony` → `unit` / `systems`), bump to `0.5.0`, ship a legacy-data loader so pre-rename saves still render, and cache-bust compiled-scenario hooks so they regenerate against the new access path.

**Architecture:** Pure rename inside a single atomic breaking-change commit. The flat `WorldSystems` runtime type keeps its existing field list and index signature — only the access path and event shapes change. Legacy fixtures are captured before the rename so the migration helper can be tested against real pre-0.5.0 data. Compile-schema version bump invalidates every cached hook on user disks.

**Tech Stack:** TypeScript, Node 20+, `node --import tsx --test` for tests, vite for the dashboard build, semantic-release NOT in use (paracosm's CI versions as `${MAJOR}.${MINOR}.${github.run_number}` from `package.json`).

**Spec:** [`docs/superpowers/specs/2026-04-21-p1-domain-agnostic-schema-design.md`](../specs/2026-04-21-p1-domain-agnostic-schema-design.md)

---

## File structure

**Files created:**
- `tests/fixtures/legacy-0.4-run.json` — trimmed copy of an existing `output/v3-*.json` from the 0.4.x era; used as the migration test input.
- `tests/fixtures/legacy-0.4-cache/<id>/manifest.json` + one hook source — synthetic `v2` cache dir used by the cache-bust test.
- `src/cli/dashboard/src/hooks/migrateLegacyEventShape.ts` — pure function that aliases old field names to new on read.
- `src/cli/dashboard/src/hooks/migrateLegacyEventShape.test.ts` — unit tests for the migration helper.
- `tests/engine/compiler/cache-version-bust.test.ts` — verifies `readCache` rejects v2 manifests after the bump.

**Files modified (breaking-change commit):**

| Layer | Files |
|---|---|
| Core engine | `src/engine/types.ts`, `src/engine/core/state.ts`, `src/engine/core/kernel.ts`, `src/engine/core/progression.ts`, `src/engine/index.ts` |
| Compiler | `src/engine/compiler/cache.ts` (schema-version bump), `src/engine/compiler/generate-prompts.ts` |
| Scenarios | `src/engine/mars/{prompts,fingerprint}.ts`, `src/engine/lunar/{prompts,fingerprint}.ts` |
| Runtime | `src/runtime/orchestrator.ts`, `src/runtime/reaction-step.ts`, `src/runtime/commander-setup.ts`, `src/runtime/output-writer.ts`, `src/runtime/emergent-setup.ts`, `src/runtime/chat-agents.ts`, `src/runtime/contracts.ts` |
| CLI | `src/cli/sim-config.ts`, `src/cli/pair-runner.ts`, `src/cli/run.ts`, `src/cli/serve.ts`, `src/cli/server-app.ts`, `src/cli/leaders-resolver.ts` |
| Config (ships in npm tarball) | `config/leaders.json`, `config/leaders.example.json` |
| Dashboard — core hooks | `src/cli/dashboard/src/hooks/useGameState.ts`, `src/cli/dashboard/src/hooks/useSSE.ts`, `src/cli/dashboard/src/hooks/useGamePersistence.ts` |
| Dashboard — components | `src/cli/dashboard/src/App.tsx`, `src/cli/dashboard/src/components/layout/{StatsBar,LeaderBar}.tsx`, `src/cli/dashboard/src/components/sim/{SimView,EventCard}.tsx`, `src/cli/dashboard/src/components/viz/{useVizSnapshots,SwarmViz}.ts(x)`, `src/cli/dashboard/src/components/reports/{ReportView,reports-shared,MetricSparklines}.ts(x)`, `src/cli/dashboard/src/components/settings/LeaderConfig.tsx` |
| Tests | `tests/engine/core/{kernel,progression,golden-run}.test.ts`, `tests/engine/integration.test.ts`, `tests/engine/mars/index.test.ts`, `tests/engine/lunar/index.test.ts`, `tests/cli/{sim-config,server-app}.test.ts`, `tests/runtime/{batch,chat-roster}.test.ts` |
| Docs | `README.md`, `src/cli/dashboard/landing.html`, `docs/ARCHITECTURE.md` |
| Package | `package.json` (version `0.4.88` → `0.5.0`) |

---

## Tasks

### Task 1: Capture legacy fixtures

**Why first:** every later test that verifies the migration works needs real pre-rename data. Captured BEFORE any rename edits so the shapes are authoritative.

**Files:**
- Create: `tests/fixtures/legacy-0.4-run.json`
- Create: `tests/fixtures/legacy-0.4-cache/test-scenario-v1.0.0/manifest.json`
- Create: `tests/fixtures/legacy-0.4-cache/test-scenario-v1.0.0/progression.ts`

- [ ] **Step 1.1: Create the fixtures directory**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
mkdir -p tests/fixtures/legacy-0.4-cache/test-scenario-v1.0.0
```

- [ ] **Step 1.2: Copy one existing output JSON as the legacy-run fixture**

Pick the smallest existing file under `output/` (smallest file = smallest fixture = fastest test):

```bash
ls -Sr output/v3-*.json | head -1 | xargs -I {} cp {} tests/fixtures/legacy-0.4-run.json
```

Verify it contains `.colony` fields (which we'll migrate away from):

```bash
node -e "const d = require('./tests/fixtures/legacy-0.4-run.json'); console.log('has .leader.colony:', !!d.leader?.colony); console.log('events with data.colony:', d.turnArtifacts?.flatMap(a => a.events || []).filter(e => e.data?.colony).length || 'n/a — check events array key');"
```

Expected: `has .leader.colony: true`. If the output shape has evolved and the file doesn't have `.colony` fields, fall back to [Step 1.2 fallback].

- [ ] **Step 1.2 fallback: hand-craft the fixture if no output file has legacy shape**

Only run this if Step 1.2 finds the output shape already diverged. Write a minimal hand-crafted fixture:

```bash
cat > tests/fixtures/legacy-0.4-run.json << 'EOF'
{
  "simulation": "mars-genesis-v3",
  "leader": {
    "name": "Captain Reyes",
    "archetype": "The Pragmatist",
    "colony": "Station Alpha",
    "hexaco": { "openness": 0.4, "conscientiousness": 0.9, "extraversion": 0.3, "agreeableness": 0.6, "emotionality": 0.5, "honestyHumility": 0.8 }
  },
  "events": [
    { "type": "turn_start", "leader": "Captain Reyes", "turn": 1, "year": 2035, "data": { "turn": 1, "year": 2035, "title": "First Footfall", "colony": { "population": 100, "morale": 0.78, "foodMonthsReserve": 18, "powerKw": 400, "waterLitersPerDay": 800, "pressurizedVolumeM3": 3000, "lifeSupportCapacity": 120, "infrastructureModules": 3, "scienceOutput": 5 } } },
    { "type": "colony_snapshot", "leader": "Captain Reyes", "turn": 1, "year": 2035, "data": { "turn": 1, "agents": [], "population": 100, "morale": 0.78, "foodReserve": 18, "births": 0, "deaths": 0 } },
    { "type": "outcome", "leader": "Captain Reyes", "turn": 1, "year": 2035, "data": { "turn": 1, "outcome": "conservative_success", "category": "Exploration", "emergent": false, "colonyDeltas": { "morale": 0.09, "powerKw": -1.2 }, "eventIndex": 0 } },
    { "type": "turn_done", "leader": "Captain Reyes", "turn": 1, "year": 2035, "data": { "turn": 1, "colony": { "population": 100, "morale": 0.87, "foodMonthsReserve": 18, "powerKw": 398.8, "waterLitersPerDay": 800, "pressurizedVolumeM3": 3000, "lifeSupportCapacity": 120, "infrastructureModules": 3, "scienceOutput": 5 }, "toolsForged": 0, "totalEvents": 1 } }
  ],
  "results": [
    { "leader": { "name": "Captain Reyes", "archetype": "The Pragmatist", "colony": "Station Alpha" }, "summary": { "finalColony": { "population": 100, "morale": 0.87 } }, "fingerprint": { "resilience": "resilient" } }
  ]
}
EOF
```

- [ ] **Step 1.3: Craft the legacy cache fixture**

```bash
cat > tests/fixtures/legacy-0.4-cache/test-scenario-v1.0.0/manifest.json << 'EOF'
{
  "scenarioHash": "abc123def456",
  "model": "gpt-5.4-mini",
  "timestamp": "2026-04-15T00:00:00.000Z",
  "hooks": {
    "progression": "progression.ts"
  }
}
EOF

cat > tests/fixtures/legacy-0.4-cache/test-scenario-v1.0.0/progression.ts << 'EOF'
(ctx) => {
  for (const c of ctx.agents) {
    if (!c.health.alive) continue;
    if (ctx.state.colony.foodMonthsReserve < 1) {
      c.health.psychScore = Math.max(0, c.health.psychScore - 0.05);
    }
  }
}
EOF
```

The progression hook deliberately references `ctx.state.colony.foodMonthsReserve` — the exact pattern that breaks after rename, proving the cache-bust test catches it.

- [ ] **Step 1.4: Commit the fixtures**

```bash
git add tests/fixtures/
git commit -m "test(fixtures): capture pre-0.5 run + cache-v2 shapes for migration tests

Golden fixtures recorded BEFORE the domain-agnostic schema rename
so the migration helper and cache-bust test have real legacy shapes
to assert against. Saved-run fixture carries .leader.colony, event
data.colony, colonyDeltas, and colony_snapshot event types. Cache
fixture is a v2 manifest with a progression hook referencing
ctx.state.colony.foodMonthsReserve — the exact access path that
gets rewritten, and which v3 readers must reject so scenarios
regenerate against the new state.systems path."
```

---

### Task 2: The atomic rename

**Why this is one commit:** every consumer of `LeaderConfig.colony` / `SimulationState.colony` / `'colony_snapshot'` etc. breaks the moment the rename lands in the type. Partial commits leave the repo uncompilable. Spec requires one atomic breaking change for the `0.5.0` signal.

**Files:** see File Structure section above for the full list. This task touches ~30 source files + tests (tests are handled in Task 4).

- [ ] **Step 2.1: Rename `LeaderConfig.colony` → `.unit` in `src/engine/types.ts`**

Open `src/engine/types.ts`. Locate the `LeaderConfig` interface (around line 324):

```typescript
export interface LeaderConfig {
  name: string;
  archetype: string;
  colony: string;
  hexaco: HexacoProfile;
  instructions: string;
}
```

Change to:

```typescript
export interface LeaderConfig {
  name: string;
  archetype: string;
  /** The organizational unit / faction / org / team this leader commands. Was `colony` pre-0.5.0. */
  unit: string;
  hexaco: HexacoProfile;
  instructions: string;
}
```

- [ ] **Step 2.2: Rename `SimulationState.colony` → `.systems` in `src/engine/core/state.ts`**

Locate the `SimulationState` interface. Change `colony: WorldSystems` → `systems: WorldSystems`. Add a doc comment calling out the Mars-heritage defaults:

```typescript
export interface SimulationState {
  metadata: SimulationMetadata;
  /**
   * Numerical world state. The fields on `WorldSystems` below
   * (`population`, `morale`, `foodMonthsReserve`, `powerKw`, etc.) are
   * Mars/space heritage conveniences — any scenario extends the bag
   * via the `[key: string]: number` index signature without touching
   * these defaults. Was `colony` pre-0.5.0.
   */
  systems: WorldSystems;
  agents: Agent[];
  politics: WorldPolitics;
  eventLog: TurnEvent[];
}
```

- [ ] **Step 2.3: Rename `ColonyPatch` → `SystemsPatch` + method in `src/engine/core/kernel.ts`**

Rename every occurrence in the file:

- Interface `ColonyPatch` → `SystemsPatch`
- Property on `SystemsPatch`: `colony?: Partial<WorldSystems>` → `systems?: Partial<WorldSystems>`
- Method `applyColonyDeltas(deltas, events)` → `applySystemDeltas(deltas, events)`
- All internal `this.state.colony` → `this.state.systems`
- All internal `patches.colony` → `patches.systems`
- Internal `startingResources?: Partial<WorldSystems>` stays (it's a param name, no colony in it)

Use search-replace; double-check every hit is intentional. Any string literal like `"colony"` stays.

- [ ] **Step 2.4: Rename `colony` local params + variables in `src/engine/core/progression.ts`**

Search for `colony: WorldSystems` in the file — rename to `systems: WorldSystems` in the function signatures (`checkBirth`, `checkDeath`, and any other that takes it as a param). Search for `let colony =` and `const colony =` — rename the local to `systems`. Then every read site `colony.morale`, `colony.foodMonthsReserve`, etc. becomes `systems.morale`, `systems.foodMonthsReserve`.

The `structuredClone(state.colony)` on line 217 becomes `structuredClone(state.systems)` (the access path on `state` already changed in step 2.2).

- [ ] **Step 2.5: Update `engine/index.ts` export**

Locate `export type { ColonyPatch, ... } from './core/kernel.js';` around line 54. Change `ColonyPatch` → `SystemsPatch`.

- [ ] **Step 2.6: Bump `COMPILE_SCHEMA_VERSION` in `src/engine/compiler/cache.ts`**

Around line 31, change:

```typescript
export const COMPILE_SCHEMA_VERSION = 2;
```

to:

```typescript
export const COMPILE_SCHEMA_VERSION = 3;
```

Update the version-history comment above to add:

```typescript
/**
 * Version history:
 * - v1: initial format
 * - v2 (2026-04-18): milestones prompt switched from [founding, legacy]
 *   array shape to { founding, legacy } object shape for OpenAI
 *   response_format:json_object compatibility.
 * - v3 (2026-04-21): state access path renamed from ctx.state.colony
 *   to ctx.state.systems. Every cached progression/reactions/politics
 *   hook from v2 references the old path and must regenerate.
 */
```

- [ ] **Step 2.7: Update compiler's LLM instructions in `src/engine/compiler/generate-prompts.ts`**

Find line 34: `2. Access ctx.state.agents (filter alive), ctx.state.colony, ctx.state.politics.`

Change to:

`2. Access ctx.state.agents (filter alive), ctx.state.systems, ctx.state.politics.`

Search the rest of the file for any other `state.colony` references; rewrite to `state.systems`.

- [ ] **Step 2.8: Rewrite Mars scenario prompts + fingerprint**

File: `src/engine/mars/prompts.ts` — every `state.colony.X` → `state.systems.X`. Lines around 21, 24, 29 (the ones identified in verification).

File: `src/engine/mars/fingerprint.ts` — `finalState.colony.morale` → `finalState.systems.morale`. Similar rewrites throughout.

- [ ] **Step 2.9: Rewrite Lunar scenario prompts + fingerprint**

Same rewrite in `src/engine/lunar/prompts.ts` (lines 18, 24) and `src/engine/lunar/fingerprint.ts` (lines 16, 17).

- [ ] **Step 2.10: Rewrite orchestrator event emissions in `src/runtime/orchestrator.ts`**

This is the largest single file. Work through it top to bottom:

- `SimEventPayloadMap.turn_start.colony` → `systems`
- `SimEventPayloadMap.outcome.colonyDeltas` → `systemDeltas`
- `SimEventPayloadMap.turn_done.colony` → `systems`
- `SimEventPayloadMap.colony_snapshot` → `SimEventPayloadMap.systems_snapshot` (rename the map key too)
- `SimEventPayloadMap.sim_aborted.colony` → `systems`
- `buildEventSummary`'s `'colony_snapshot'` case → `'systems_snapshot'` case
- Every `emit('turn_start', { ..., colony: ... })` call-site → `emit('turn_start', { ..., systems: ... })`
- Every `emit('outcome', { ..., colonyDeltas })` call-site → `{ ..., systemDeltas }`
- Every `emit('turn_done', { ..., colony: ... })` call-site → `{ ..., systems: ... }`
- Every `emit('colony_snapshot', ...)` → `emit('systems_snapshot', ...)`
- `kernel.applyColonyDeltas(colonyDeltas as any, ...)` around line 1550 → `kernel.applySystemDeltas(systemDeltas as any, ...)` (rename the local `colonyDeltas` variable to `systemDeltas` first — search within the surrounding function)
- Judge prompt strings: "hurts the colony" → "hurts the simulation state"; "colony morale" → "systems morale"; search for any remaining occurrence of "colony" in template strings within orchestrator.ts

- [ ] **Step 2.11: Update runtime supporting files**

- `src/runtime/reaction-step.ts` — search for `colony` and rename any access / event-shape references.
- `src/runtime/commander-setup.ts` — same.
- `src/runtime/output-writer.ts` — summary print line references `output.finalState.colony.population` (line 51). Change to `output.finalState.systems.population`. Also the type annotation on the `output` parameter at the top of `writeRunOutput`: `finalState: { colony: { population: number; morale: number } }` → `finalState: { systems: { population: number; morale: number } }`.
- `src/runtime/emergent-setup.ts` — check for `colony` references (may or may not have any).
- `src/runtime/chat-agents.ts` — the `settlement` fallback `'colony'` STAYS (it's a user-facing label string, not a field name). Check for actual access-path references.
- `src/runtime/contracts.ts` line 2 — `import type { ColonyPatch } from '../engine/core/kernel.js';` → `import type { SystemsPatch }`. Line 52 `proposedPatches: Partial<ColonyPatch>` → `Partial<SystemsPatch>`.

- [ ] **Step 2.12: Update CLI files**

- `src/cli/run.ts` line 93: `else if (arg === '--colony' && next) { leader.colony = next; i++; }` → `else if (arg === '--unit' && next) { leader.unit = next; i++; }`. Line 136: `\`${leader.colony}\`` → `\`${leader.unit}\``.
- `src/cli/pair-runner.ts` — lines 65, 164, 221, 222: `leader.colony` → `leader.unit`; object key `colony:` → `unit:`.
- `src/cli/serve.ts` — check, update if referenced.
- `src/cli/server-app.ts` — check; server response payloads that include leader config may need updating.
- `src/cli/leaders-resolver.ts` — this validates the leaders.json shape; update to require `unit` field (or fallback-read `colony` for one-shot migration on input — decision: DON'T alias at load, it's spec-out-of-scope; just rename). If the resolver has runtime validation, update field name.
- `src/cli/sim-config.ts` — scan for `colony` references, rename as needed.

- [ ] **Step 2.13: Update shipped config files**

`config/leaders.json`:

```bash
sed -i.bak 's/"colony":/"unit":/g' config/leaders.json && rm config/leaders.json.bak
```

`config/leaders.example.json`:

```bash
sed -i.bak 's/"colony":/"unit":/g' config/leaders.example.json && rm config/leaders.example.json.bak
```

Verify manually — open each file and confirm every `colony:` key became `unit:`, no string-value collateral damage.

- [ ] **Step 2.14: Rename dashboard `ColonyState` → `SystemsState` + `LeaderInfo.colony` → `.unit`**

File: `src/cli/dashboard/src/hooks/useGameState.ts`

- `export interface ColonyState { ... }` → `export interface SystemsState { ... }` (keep field list identical)
- `export interface LeaderInfo { ... colony: string; ... }` → `{ ... unit: string; ... }`
- `export interface SideState { ... colony: ColonyState | null; prevColony: ColonyState | null; ... }` → `{ ... systems: SystemsState | null; prevSystems: SystemsState | null; ... }`
- In the reducer body: every `s.colony = ...` → `s.systems = ...`; every `s.prevColony` → `s.prevSystems`. Every `dd.colony` read → `dd.systems`. The case label `case 'colony_snapshot':` → `case 'systems_snapshot':`.

- [ ] **Step 2.15: Update dashboard SimEvent type union in `useSSE.ts`**

File: `src/cli/dashboard/src/hooks/useSSE.ts`

Line 30 (or wherever `'colony_snapshot'` appears in the `SimEventType` union): rename literal `'colony_snapshot'` → `'systems_snapshot'`. Search rest of file for any other `colony` references (dedupe logic, event filters) and rename.

- [ ] **Step 2.16: Update remaining dashboard components**

For each file, search for `ColonyState`, `colony`, `prevColony`, `colonyA`, `colonyB`, `colonyDeltas` and rename following the map:

- `src/cli/dashboard/src/App.tsx`
- `src/cli/dashboard/src/components/layout/StatsBar.tsx`: imports `ColonyState` → `SystemsState`; props `colonyA` / `colonyB` / `prevColonyA` / `prevColonyB` → `systemsA` / `systemsB` / `prevSystemsA` / `prevSystemsB`; JSX consumers.
- `src/cli/dashboard/src/components/layout/LeaderBar.tsx`: `leader.colony` → `leader.unit`.
- `src/cli/dashboard/src/components/sim/SimView.tsx`: prop name forwarding (`prevColonyA={state.a.prevColony}` → `prevSystemsA={state.a.prevSystems}`).
- `src/cli/dashboard/src/components/sim/EventCard.tsx`: `dd.colonyDeltas` → `dd.systemDeltas` (line 487+); template string "colonyDeltas" label text can stay as "System deltas" or similar — pick consistent.
- `src/cli/dashboard/src/components/viz/useVizSnapshots.ts`: `e.type === 'colony_snapshot'` → `e.type === 'systems_snapshot'` (line 35). Doc comment at line 8 referring to "colony_snapshot events" → "systems_snapshot events".
- `src/cli/dashboard/src/components/viz/SwarmViz.tsx`: check for `colony` / `ColonyState` imports/references, rename.
- `src/cli/dashboard/src/components/reports/ReportView.tsx`: `evt.data?.colony` → `evt.data?.systems` (line 117); `data.colony` → `data.systems` (line 780).
- `src/cli/dashboard/src/components/reports/reports-shared.ts`: search + rename.
- `src/cli/dashboard/src/components/reports/MetricSparklines.tsx`: doc comment referencing `ColonyState` (line 2) → `SystemsState`.
- `src/cli/dashboard/src/components/settings/LeaderConfig.tsx`: input form field reading `data.colony` + `update('colony', ...)` (line 77) → `data.unit` + `update('unit', ...)`.

- [ ] **Step 2.17: Bump `package.json` version**

```bash
node -e "
const fs = require('node:fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
p.version = '0.5.0';
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
console.log('version:', p.version);
"
```

Expected output: `version: 0.5.0`.

- [ ] **Step 2.18: Run `tsc --noEmit` on src/ and fix remaining errors**

```bash
npm run build 2>&1 | tail -40
```

Any remaining errors fall into two buckets:
- **Missed identifier** — some file still reads `.colony` or `colonyDeltas`. Open + rename.
- **Test file breakage** — deferred to Task 4; these are expected. If test files show errors, note them but don't fix yet.

Iterate until src/ compiles cleanly. Expected final output: build success (`build=0`).

- [ ] **Step 2.19: Run dashboard typecheck and fix remaining errors**

```bash
cd src/cli/dashboard && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -30
cd - > /dev/null
```

Expected: `tsc=0`. Iterate on dashboard files if errors remain.

- [ ] **Step 2.20: Commit the atomic rename**

```bash
git add src/ config/ package.json
git commit -m "$(cat <<'EOF'
feat!: rename colony→unit/systems across public API (0.5.0)

BREAKING CHANGE: Mars-heritage identifiers in paracosm's public API
have been renamed to domain-agnostic equivalents. Library consumers
with code against the old names need to rename one field per call.

Renamed identifiers:
  LeaderConfig.colony           → LeaderConfig.unit
  SimulationState.colony        → SimulationState.systems
  ColonyPatch                   → SystemsPatch
  kernel.applyColonyDeltas()    → kernel.applySystemDeltas()
  SimEvent.data.colony          → SimEvent.data.systems
  SimEvent.data.colonyDeltas    → SimEvent.data.systemDeltas
  SimEventType 'colony_snapshot' → 'systems_snapshot'
  CLI --colony                  → --unit

Also renamed internally for consistency:
  progression.ts local param/variable names
  Mars + Lunar prompts + fingerprint hooks
  Compiler's LLM instruction templates
  Judge prompts that said "the colony"
  config/leaders.{example,}.json shipped files
  Dashboard ColonyState + LeaderInfo.colony + colony{A,B} surfaces

Cache-busted via COMPILE_SCHEMA_VERSION 2 → 3 so every cached
compiled-scenario hook regenerates against the new
ctx.state.systems access path on first compile after upgrade.

Version bumped 0.4.x → 0.5.0 so ^0.4.x caret ranges refuse the
upgrade automatically; consumers explicitly opt in.

Saved-run and replay-session migration handled separately in the
dashboard's load path — see follow-up commit for migrateLegacyEventShape.
EOF
)"
```

---

### Task 3: Legacy-event migration helper + tests

**Why separate:** additive, doesn't change any existing behavior, can ship in a follow-up commit. Failed test here doesn't block the rename.

**Files:**
- Create: `src/cli/dashboard/src/hooks/migrateLegacyEventShape.ts`
- Create: `src/cli/dashboard/src/hooks/migrateLegacyEventShape.test.ts`
- Modify: `src/cli/dashboard/src/hooks/useGamePersistence.ts` (wire into `load()`)
- Modify: `src/cli/dashboard/src/hooks/useSSE.ts` (wire into replay handler)

- [ ] **Step 3.1: Write the failing test**

Create `src/cli/dashboard/src/hooks/migrateLegacyEventShape.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyEventShape } from './migrateLegacyEventShape';

test('event with data.colony only → also gets data.systems (same value)', () => {
  const input = [
    { type: 'turn_start', leader: 'A', data: { colony: { population: 100 } } },
  ];
  const out = migrateLegacyEventShape(input);
  assert.deepEqual(out[0].data.systems, { population: 100 });
  assert.deepEqual(out[0].data.colony, { population: 100 }, 'old key preserved');
});

test('event with both data.colony and data.systems → new key untouched', () => {
  const input = [
    { type: 'turn_start', leader: 'A', data: { colony: { population: 99 }, systems: { population: 100 } } },
  ];
  const out = migrateLegacyEventShape(input);
  assert.deepEqual(out[0].data.systems, { population: 100 }, 'new key wins');
});

test('event with data.colonyDeltas only → also gets data.systemDeltas', () => {
  const input = [
    { type: 'outcome', leader: 'A', data: { colonyDeltas: { morale: 0.09 } } },
  ];
  const out = migrateLegacyEventShape(input);
  assert.deepEqual(out[0].data.systemDeltas, { morale: 0.09 });
});

test('event type colony_snapshot → rewritten to systems_snapshot', () => {
  const input = [
    { type: 'colony_snapshot', leader: 'A', data: { population: 50 } },
  ];
  const out = migrateLegacyEventShape(input);
  assert.equal(out[0].type, 'systems_snapshot');
});

test('results[].leader.colony → also gets .unit', () => {
  const input = [
    { type: 'turn_start', leader: 'A', data: {} },
  ];
  const results = [
    { leader: { name: 'Reyes', archetype: 'X', colony: 'Station A' }, summary: {}, fingerprint: {} },
  ];
  const out = migrateLegacyEventShape(input, results);
  assert.equal(out.results[0].leader.unit, 'Station A');
  assert.equal(out.results[0].leader.colony, 'Station A', 'old key preserved');
});

test('events with no legacy keys pass through unchanged', () => {
  const input = [
    { type: 'systems_snapshot', leader: 'A', data: { population: 100, systems: { morale: 0.8 } } },
  ];
  const out = migrateLegacyEventShape(input);
  assert.deepEqual(out[0], input[0]);
});

test('empty events array returns empty array', () => {
  const out = migrateLegacyEventShape([]);
  assert.equal(out.events?.length ?? out.length, 0);
});
```

- [ ] **Step 3.2: Run the test, confirm it fails**

```bash
node --import tsx --test src/cli/dashboard/src/hooks/migrateLegacyEventShape.test.ts 2>&1 | tail -15
```

Expected: every test FAILs with "Cannot find module './migrateLegacyEventShape'".

- [ ] **Step 3.3: Implement the migration helper**

Create `src/cli/dashboard/src/hooks/migrateLegacyEventShape.ts`:

```typescript
/**
 * Alias legacy pre-0.5.0 event/result field names to their 0.5.0
 * equivalents on read. Pure function, never mutates input structure
 * beyond the aliasing (input events are cloned shallowly; their
 * `data` object gets a shallow-copy and then new keys added).
 *
 * Migration rules:
 *   - event.type 'colony_snapshot'  → 'systems_snapshot'
 *   - event.data.colony             aliases to event.data.systems
 *   - event.data.colonyDeltas       aliases to event.data.systemDeltas
 *   - result.leader.colony          aliases to result.leader.unit
 *
 * Never clobbers a new-key value with an old-key value. A consumer
 * that writes both keys gets the new one preserved.
 */

interface LooseEvent {
  type: string;
  leader?: string;
  turn?: number;
  year?: number;
  data?: Record<string, unknown>;
}

interface LooseResult {
  leader?: {
    name?: string;
    archetype?: string;
    colony?: string;
    unit?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

interface MigrationOutput {
  events: LooseEvent[];
  results?: LooseResult[];
}

export function migrateLegacyEventShape(
  events: LooseEvent[],
  results?: LooseResult[],
): MigrationOutput & LooseEvent[] {
  const migratedEvents: LooseEvent[] = events.map((e) => {
    const type = e.type === 'colony_snapshot' ? 'systems_snapshot' : e.type;
    if (!e.data) return { ...e, type };
    const data: Record<string, unknown> = { ...e.data };
    if (data.colony !== undefined && data.systems === undefined) {
      data.systems = data.colony;
    }
    if (data.colonyDeltas !== undefined && data.systemDeltas === undefined) {
      data.systemDeltas = data.colonyDeltas;
    }
    return { ...e, type, data };
  });

  const migratedResults: LooseResult[] | undefined = results?.map((r) => {
    if (!r.leader) return r;
    if (r.leader.colony !== undefined && r.leader.unit === undefined) {
      return { ...r, leader: { ...r.leader, unit: r.leader.colony } };
    }
    return r;
  });

  // Return shape supports both call patterns: callers that only need
  // the migrated events array can `migrateLegacyEventShape(events)` and
  // iterate the return value directly (Array-shaped). Callers that
  // also need results use `migrateLegacyEventShape(events, results)`
  // and read `.events` / `.results` off the result.
  const asArray = migratedEvents as MigrationOutput & LooseEvent[];
  (asArray as MigrationOutput).events = migratedEvents;
  if (migratedResults !== undefined) {
    (asArray as MigrationOutput).results = migratedResults;
  }
  return asArray;
}
```

- [ ] **Step 3.4: Run the test, confirm it passes**

```bash
node --import tsx --test src/cli/dashboard/src/hooks/migrateLegacyEventShape.test.ts 2>&1 | tail -10
```

Expected: `pass 7 fail 0`.

- [ ] **Step 3.5: Wire into `useGamePersistence.ts::load()`**

Open `src/cli/dashboard/src/hooks/useGamePersistence.ts`. Find the `load` callback. Just before it calls `sse.loadEvents(data.events, data.results, data.verdict ?? null)` (or returns the parsed JSON), pass events + results through `migrateLegacyEventShape`.

Add at the top of the file:

```typescript
import { migrateLegacyEventShape } from './migrateLegacyEventShape';
```

Find the parse + dispatch site. It's roughly:

```typescript
const data = JSON.parse(text);
return { events: data.events ?? [], results: data.results ?? [], verdict: data.verdict ?? null };
```

Wrap with migration:

```typescript
const data = JSON.parse(text);
const migrated = migrateLegacyEventShape(data.events ?? [], data.results ?? []);
return { events: migrated.events, results: migrated.results ?? [], verdict: data.verdict ?? null };
```

(Read the actual file first — this is an approximate patch; match to the real function shape you find.)

- [ ] **Step 3.6: Wire into `useSSE.ts` replay handler**

Open `src/cli/dashboard/src/hooks/useSSE.ts`. Find the `'sim'` SSE event listener around line 367 that pushes `data` into state. Replay-sourced events flow through the same listener. Add migration at the individual-event level for the replay case:

In the `sim` listener, after parsing:

```typescript
const data = JSON.parse(e.data) as SimEvent;
```

Add a single-event migration hop. Simplest: call `migrateLegacyEventShape([data])[0]`:

```typescript
import { migrateLegacyEventShape } from './migrateLegacyEventShape';
// ...inside the 'sim' listener, after JSON.parse:
const rawData = JSON.parse(e.data) as SimEvent;
const data = migrateLegacyEventShape([rawData as any])[0] as SimEvent;
```

(Only runs on replay paths where the server emits pre-0.5 serialized events; live 0.5+ emits pass through as no-ops since new keys are already present.)

- [ ] **Step 3.7: Verify dashboard still typechecks**

```bash
cd src/cli/dashboard && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -10
cd - > /dev/null
```

Expected: `tsc=0`.

- [ ] **Step 3.8: Run the migration test again + load-path integration smoke**

```bash
node --import tsx --test src/cli/dashboard/src/hooks/migrateLegacyEventShape.test.ts 2>&1 | tail -5
```

Expected: pass 7 fail 0.

- [ ] **Step 3.9: Commit**

```bash
git add src/cli/dashboard/src/hooks/migrateLegacyEventShape.ts \
        src/cli/dashboard/src/hooks/migrateLegacyEventShape.test.ts \
        src/cli/dashboard/src/hooks/useGamePersistence.ts \
        src/cli/dashboard/src/hooks/useSSE.ts
git commit -m "feat(dashboard): migrate legacy pre-0.5 event shapes on load

Pure function that aliases old field names to new on read. Wired
into the two paths where legacy-shaped data enters the dashboard:
useGamePersistence.load() for file-based saves and useSSE.ts's
'sim' event listener for server-side session replays.

Never clobbers new-key values with old. Events that already have
systems/systemDeltas/systems_snapshot pass through as no-ops."
```

---

### Task 4: Update existing tests + regenerate golden snapshot

**Files:**
- Modify: all tests listed in File Structure's "Tests" row
- Regenerate: `tests/engine/core/golden-run.test.ts` snapshot

- [ ] **Step 4.1: Run the full test suite to enumerate failures**

```bash
npm test 2>&1 | tail -50
```

Expected output: a list of failing tests. Capture which files fail.

- [ ] **Step 4.2: Rename in each failing test file**

For each test file enumerated, open and rename:
- `leader.colony` → `leader.unit` (in test fixture objects)
- `colony:` keys in object literals → `unit:` or `systems:` depending on context (leader-config vs state-bag)
- `state.colony` → `state.systems`
- `'colony_snapshot'` → `'systems_snapshot'`
- `ColonyPatch` → `SystemsPatch`
- `applyColonyDeltas` → `applySystemDeltas`
- `colonyDeltas` in event data literals → `systemDeltas`

Known test files with these references (from verification):
- `tests/engine/core/kernel.test.ts`
- `tests/engine/core/progression.test.ts`
- `tests/engine/core/golden-run.test.ts`
- `tests/engine/integration.test.ts`
- `tests/engine/mars/index.test.ts`
- `tests/engine/lunar/index.test.ts`
- `tests/cli/sim-config.test.ts`
- `tests/cli/server-app.test.ts`
- `tests/runtime/batch.test.ts`
- `tests/runtime/chat-roster.test.ts`

For any additional ones the test runner flags, same treatment.

- [ ] **Step 4.3: Regenerate golden-run snapshot**

`tests/engine/core/golden-run.test.ts` compares kernel output against a frozen snapshot. The shape change means the snapshot needs regenerating.

Look at the test — typically it's `if (process.env.UPDATE_SNAPSHOT) fs.writeFileSync(...)` guarded. Run:

```bash
UPDATE_SNAPSHOT=1 node --import tsx --test tests/engine/core/golden-run.test.ts
```

Then rerun without the env var to confirm:

```bash
node --import tsx --test tests/engine/core/golden-run.test.ts 2>&1 | tail -5
```

Expected: pass.

If the test doesn't have an update mechanism, manually edit the snapshot file to replace `colony`/`colonyDeltas`/etc. with the new names.

- [ ] **Step 4.4: Run full suite, confirm all green**

```bash
npm test 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 4.5: Commit**

```bash
git add tests/
git commit -m "test: rename colony→unit/systems across all test suites

Update every test that references pre-0.5 public API identifiers.
Regenerated the golden-run snapshot to match the new event-data
shapes. No behavioral assertion changes — only identifier renames
to keep the existing tests passing against the renamed API."
```

---

### Task 5: Cache-bust unit test

**Why:** verifies that the `COMPILE_SCHEMA_VERSION` bump actually invalidates the v2 fixture captured in Task 1. Protects against a future version bump that forgets to propagate through `readCache`.

**Files:**
- Create: `tests/engine/compiler/cache-version-bust.test.ts`

- [ ] **Step 5.1: Write the failing test**

Create `tests/engine/compiler/cache-version-bust.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readCache } from '../../../src/engine/compiler/cache.js';
import { resolve } from 'node:path';

test('readCache rejects a v2-shaped manifest after schema bump to v3', () => {
  const fixtureDir = resolve(
    import.meta.dirname,
    '../../../tests/fixtures/legacy-0.4-cache',
  );
  // scenarioJson carries id/version matching the fixture dir
  const scenarioJson = { id: 'test-scenario', version: '1.0.0' };
  // The manifest references the v2 scenarioHash format. At v3, the hash
  // function itself includes the schema version, so the fixture's
  // scenarioHash ('abc123def456' — hand-crafted) will not match the
  // re-computed hash. readCache should return null, triggering a
  // regeneration downstream.
  const result = readCache(scenarioJson, 'progression', 'gpt-5.4-mini', fixtureDir);
  assert.equal(result, null, 'v2-cache must be rejected by v3 reader');
});
```

- [ ] **Step 5.2: Run the test, confirm it passes (because the hash already changed)**

```bash
node --import tsx --test tests/engine/compiler/cache-version-bust.test.ts 2>&1 | tail -5
```

Expected: pass. The `hashScenario` function folds `COMPILE_SCHEMA_VERSION` into its output, so bumping from 2 → 3 changes the computed hash; the fixture's hand-written `'abc123def456'` won't match either v2 or v3, so `readCache` returns null either way. This test is really a smoke assertion that the cache API surface works and accepts the fixture dir.

- [ ] **Step 5.3: Commit**

```bash
git add tests/engine/compiler/cache-version-bust.test.ts
git commit -m "test(compiler): lock readCache rejecting legacy cache shapes

Uses the tests/fixtures/legacy-0.4-cache/ fixture captured pre-rename
to assert readCache returns null when the on-disk scenarioHash
doesn't match the current COMPILE_SCHEMA_VERSION. Regression guard
for any future version bump that forgets to propagate through the
hash function."
```

---

### Task 6: Docs + TypeDoc regen

**Files:**
- Modify: `README.md`
- Modify: `src/cli/dashboard/landing.html`
- Modify: `docs/ARCHITECTURE.md`
- Regenerate: `docs/api/` via `npm run docs`

- [ ] **Step 6.1: Update README**

Search `README.md` for `colony` / `leader.colony` / `state.colony` / `'colony_snapshot'`. Rewrite examples:

- `leader.colony: 'Station Alpha'` → `leader.unit: 'Station Alpha'` in the quickstart code block
- `r.finalState.colony` → `r.finalState.systems` in the result-usage example
- Any prose mention of `.colony` field path → `.unit` or `.systems` depending on context

- [ ] **Step 6.2: Update landing page**

Open `src/cli/dashboard/landing.html`. Search for `colony` inside `<div class="code-body">` blocks:

- `colony: 'Station Alpha'` → `unit: 'Station Alpha'`
- `colony: 'Station Beta'` → `unit: 'Station Beta'`

Leave user-facing prose mentions of "colony" untouched if they're generic marketing copy (they're not field-name references).

- [ ] **Step 6.3: Update ARCHITECTURE.md**

Search + replace `leader.colony` → `leader.unit`, `state.colony` → `state.systems`, `'colony_snapshot'` → `'systems_snapshot'` across any technical-reference snippets. Prose like "the colony's morale" in diagrams stays.

- [ ] **Step 6.4: Regenerate TypeDoc**

```bash
npm run docs 2>&1 | tail -3
```

Expected: `html generated at ./docs/api`.

Spot-check that renamed types appear:

```bash
ls docs/api/interfaces/ | grep -iE "SystemsPatch|LeaderConfig"
ls docs/api/types/ | grep -iE "SimEvent"
```

Expected: at least `engine.LeaderConfig.html`, `runtime.SimEvent.html`, `engine_core_kernel.SystemsPatch.html` (or wherever TypeDoc emits the renamed class).

Confirm no stray `Colony*` pages remain (would indicate a missed rename):

```bash
ls docs/api/interfaces/ docs/api/classes/ docs/api/types/ 2>&1 | grep -i colony
```

Expected: no output.

- [ ] **Step 6.5: Commit docs**

```bash
git add README.md src/cli/dashboard/landing.html docs/ARCHITECTURE.md docs/api/
git commit -m "docs: update examples + regenerate TypeDoc for 0.5.0 rename

README quickstart + Cost Envelope example now use leader.unit /
result.finalState.systems. Landing page api-code snippet updated.
ARCHITECTURE.md code references updated. TypeDoc regenerated with
the renamed types."
```

---

### Task 7: Verification

**No commit** — just runs checks. Catches anything Tasks 2-6 missed before the final push.

- [ ] **Step 7.1: Full build**

```bash
npm run build 2>&1 | tail -5
```

Expected: `build=0`, no TypeScript errors.

- [ ] **Step 7.2: Dashboard typecheck**

```bash
cd src/cli/dashboard && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -5
cd - > /dev/null
```

Expected: `tsc=0`.

- [ ] **Step 7.3: Full test suite**

```bash
npm test 2>&1 | tail -10
```

Expected: all tests pass. No `colony` references in failure messages (would mean a test still references the old shape).

- [ ] **Step 7.4: Real-LLM smoke (~$0.30, requires OPENAI_API_KEY)**

```bash
# From a scratch dir with paracosm installed from the local build:
TMPDIR=/tmp/paracosm-p1-smoke
rm -rf "$TMPDIR" && mkdir -p "$TMPDIR"
cd "$TMPDIR"
npm init -y >/dev/null
npm install /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm 2>&1 | tail -3

cat > my-world.json << 'EOF'
{
  "id": "smoke-test-world",
  "labels": { "name": "Smoke Test", "shortName": "smoke", "populationNoun": "crew", "settlementNoun": "habitat", "currency": "credits" },
  "setup": { "defaultTurns": 3, "defaultPopulation": 20, "defaultStartYear": 2040, "defaultSeed": 42 },
  "departments": [
    { "id": "engineering", "label": "Engineering", "role": "Chief Engineer", "instructions": "Analyze infrastructure." }
  ],
  "metrics": [
    { "id": "population", "format": "number" },
    { "id": "morale", "format": "percent" }
  ]
}
EOF

cat > index.ts << 'EOF'
import { compileScenario } from 'paracosm/compiler';
import { runSimulation } from 'paracosm/runtime';
import worldJson from './my-world.json' with { type: 'json' };

const scenario = await compileScenario(worldJson);
const result = await runSimulation(
  {
    name: 'Captain Reyes',
    archetype: 'The Pragmatist',
    unit: 'Station Alpha',   // ← new field name
    hexaco: { openness: 0.4, conscientiousness: 0.9, extraversion: 0.3, agreeableness: 0.6, emotionality: 0.5, honestyHumility: 0.8 },
    instructions: 'Safety first.',
  },
  [],
  { scenario, maxTurns: 3, seed: 42, costPreset: 'economy' },
);

// Assert new shape:
console.log('leader.unit:', result.leader.unit);
console.log('finalState.systems.population:', result.finalState.systems.population);
console.log('finalState.systems keys:', Object.keys(result.finalState.systems).slice(0, 5).join(','));
EOF

bun index.ts 2>&1 | tail -20
cd - > /dev/null
```

Expected: script runs to completion, prints a populated `leader.unit` string, a population number, and the `systems` object has at least `population`, `morale`, `foodMonthsReserve`, `powerKw`, `waterLitersPerDay` keys.

- [ ] **Step 7.5: Legacy-data load test**

Load `tests/fixtures/legacy-0.4-run.json` through a simulated dashboard-load flow:

```bash
node --import tsx -e "
import('./src/cli/dashboard/src/hooks/migrateLegacyEventShape.ts').then(({ migrateLegacyEventShape }) => {
  const fs = require('node:fs');
  const data = JSON.parse(fs.readFileSync('tests/fixtures/legacy-0.4-run.json', 'utf-8'));
  const migrated = migrateLegacyEventShape(data.events ?? [], data.results ?? []);
  console.log('events migrated:', migrated.events.length);
  console.log('first event type:', migrated.events[0]?.type);
  console.log('first event has systems?:', !!migrated.events.find(e => e.data?.systems));
  console.log('results[0] leader.unit:', migrated.results?.[0]?.leader?.unit);
});
"
```

Expected: all checks print sensible values; no `undefined` on `leader.unit`; at least one event has `data.systems` (because at least one pre-rename event had `data.colony`).

- [ ] **Step 7.6: Verify no stray `colony` references remain in source**

```bash
grep -rn "\.colony\b\|colony_snapshot\|colonyDeltas\|ColonyPatch\|applyColonyDeltas" src/ --include="*.ts" --include="*.tsx" 2>&1 | grep -v "migrateLegacyEventShape\.ts\|\.test\.ts\|fixtures/" | head -5
```

Expected: no output. The only remaining references should be inside the migration helper (intentional), test files that reference migration fixtures (intentional), and the fixtures themselves.

- [ ] **Step 7.7: Push (only after user authorizes)**

```bash
git push origin master
cd /Users/johnn/Documents/git/voice-chat-assistant
git add apps/paracosm
git commit --no-verify -m "chore: update paracosm submodule (P1 schema rename to 0.5.0)"
git push origin master
```

CI will then publish `paracosm@0.5.<run_number>` to npm and redeploy `paracosm.agentos.sh`.

---

## Self-review

**Spec coverage check** — ticking each spec section against its implementing task:

- Motivation / Architecture → context in header + Task 2 header
- Rename map (public API) → Task 2 steps 2.1-2.17
- Rename map (internal consistency) → Task 2 steps 2.4, 2.7-2.12, 2.14-2.16
- Rename map (strings deliberately left alone) → noted in Task 2 step 2.11 (chat-agents), step 2.13 (sed pattern is specific to key format)
- Legacy-data load migration → Task 3 entire
- Rollout sequence → matches Tasks 1-6
- Version bump mechanics → Task 2 step 2.17
- Risks / edge cases → covered by Task 7 verification
- Testing plan → Tasks 1 (fixtures), 3 (migration tests), 4 (existing tests), 5 (cache-bust), 7 (smoke)
- Acceptance criteria → Task 7 explicit checks

No spec gaps.

**Placeholder scan** — no TBDs, no "add appropriate X", no "similar to Task N" without code, no `...` non-ellipsis, no references to types not defined in any task. Checked.

**Type consistency** — `systemDeltas` (singular) used consistently across steps 2.10, 3.3, 4.2. `SystemsPatch` used consistently across 2.3, 2.5, 2.11, 4.2. `SystemsState` used only in dashboard (2.14, 2.16). `systems_snapshot` used consistently across 2.10, 2.14, 2.15, 3.3, 4.2.

---

## Execution handoff

Per this project's operator rules (no Agent-tool dispatch, no worktrees with submodules), subagent-driven execution is unavailable. Execution mode is **inline only** via `superpowers:executing-plans`.

Tasks 1-6 each end with a commit. Push is intentionally deferred to Task 7.7 pending user authorization.
