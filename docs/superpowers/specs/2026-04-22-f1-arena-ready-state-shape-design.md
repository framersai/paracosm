# F1 — Arena-Ready Dashboard State Shape (internal refactor)

**Status:** design, awaiting approval
**Date:** 2026-04-22
**Scope:** first finding from the 2026-04-22 dashboard UI/UX audit. Internal refactor of `useGameState` to support N leaders without changing any visible UI. F2 (layout modes for N>2) and F3 (StatsBar/LeaderBar N-leader redesign) are deliberately deferred to ship with P2 arena mode, when actual N>2 data exists to validate display decisions against.

**Audit finding:** [`docs/audit-2026-04-22-dashboard-ui-ux.md#f1-hardcoded-two-leader-boundary-gamestatea--gamestateb`](../../audit-2026-04-22-dashboard-ui-ux.md)

---

## Motivation

The dashboard's central state projection (`useGameState`) exposes exactly two leader slots: `gameState.a` and `gameState.b`. Every downstream component (SimView, LeaderBar, StatsBar, DivergenceRail, Timeline, EventCard, VerdictCard, SimFooterBar, App's `handleCopySummary`) hardcodes access to these two slots, and most carry a `side: 'a' | 'b'` discriminator.

P2 (multi-agent / peer mode, tracked separately in `docs/superpowers/specs/` for later phase) replaces `runSimulation(leader, ...)` with `runArena({ leaders: LeaderConfig[], ... })` that emits N leaders' results against the same seed. The dashboard cannot render those results without rewriting the state shape and every consumer. Doing that work under time pressure when P2 ships is risky; doing it now as a pure internal refactor with zero visible change is safe and unblocks P2's display work.

**What this spec delivers:** a generalized state shape ready for N leaders. **What this spec explicitly does NOT deliver:** any visible rendering change. The dashboard still shows exactly two columns after this lands; any N>2 rendering path is F2/F3, deferred.

---

## Architecture

**Pure rename + shape generalization.** No behavioural change.

### State shape

**Before** ([`useGameState.ts`](../../../src/cli/dashboard/src/hooks/useGameState.ts)):

```typescript
export type Side = 'a' | 'b';

export interface SideState {
  leader: LeaderInfo | null;
  systems: SystemsState | null;
  prevSystems: SystemsState | null;
  events: UiEvent[];
  crisis: CrisisState | null;
  deaths: number;
  deathCauses: Record<string, number>;
  tools: number;
  citations: number;
  decisions: number;
  popHistory: number[];
  moraleHistory: number[];
}

export interface GameState {
  a: SideState;
  b: SideState;
  turn: number;
  year: number;
  maxTurns: number;
  seed: number;
  isRunning: boolean;
  isComplete: boolean;
  cost: CostState | null;
}
```

**After:**

```typescript
/**
 * Per-leader dashboard projection. Identical field list to the old
 * `SideState`; renamed to the domain-agnostic label since a leader
 * isn't conceptually a "side" anymore (side-by-side is a rendering
 * choice, not a state-shape property).
 */
export interface LeaderSideState {
  leader: LeaderInfo | null;
  systems: SystemsState | null;
  prevSystems: SystemsState | null;
  events: UiEvent[];
  crisis: CrisisState | null;
  deaths: number;
  deathCauses: Record<string, number>;
  tools: number;
  citations: number;
  decisions: number;
  popHistory: number[];
  moraleHistory: number[];
}

export interface GameState {
  /** Per-leader state, keyed by `leader.name` (matches `event.leader`). */
  leaders: Record<string, LeaderSideState>;
  /** Launch order. `leaderIds[0]` renders in the first column, `leaderIds[1]` second. */
  leaderIds: string[];
  turn: number;
  year: number;
  maxTurns: number;
  seed: number;
  isRunning: boolean;
  isComplete: boolean;
  cost: CostState | null;
}

// `Side` type is removed. Callers use `leaderIndex: number` or the
// leader id directly.
```

### Leader identity + ordering

- **Identity.** `leader.name` is the map key. Events already carry `leader: string` (the name) as the leader discriminator; reusing the name avoids a new id-generation layer.
- **Ordering.** `leaderIds` is append-on-first-seen. The reducer adds a new leader to `leaderIds` the first time an event with a previously-unseen `leader` name arrives. This matches current behaviour: leader A's events land first because pair-runner's `Promise.allSettled` starts both in parallel but the first emitter wins the first slot.
- **Same-name collision.** Today's pair-runner enforces unique names via the user's leader config. If two leaders share a name (unlikely but possible via manual `/setup` payload), the second leader's state merges into the first. Flagged as a follow-up risk for P2 arena (where N>2 raises the collision probability); fixed in P2 with stable ID generation.

### Color palette helper

```typescript
// New helper in useGameState.ts (or a sibling file, e.g. leader-colors.ts)
export function getLeaderColorVar(index: number): string {
  // Today's palette: only two colors are visually defined.
  // F2/F3 extend this to a rotation when N>2 rendering arrives.
  if (index === 0) return 'var(--vis)';
  if (index === 1) return 'var(--eng)';
  // Fallback for unexpected N>2 that slips in pre-F2. Visually-
  // distinct but not tuned; flag appears in the dashboard rendering
  // as a generic amber so it's visible the palette needs updating.
  return 'var(--amber)';
}
```

### Side → index mapping in the reducer

Where the reducer previously switched on `e.leader === state.a.leader?.name` or similar, it now:

```typescript
// Old
if (e.leader === state.a.leader?.name) { /* update state.a */ }
else if (e.leader === state.b.leader?.name) { /* update state.b */ }

// New
const sideState = state.leaders[e.leader];
if (sideState) { /* update sideState */ }
else {
  // First time we see this leader — append
  state.leaders[e.leader] = createEmptyLeaderSideState();
  state.leaderIds.push(e.leader);
  // Then update
}
```

---

## Component migration map

Atomic commit touching 12 files + their tests.

| File | Current contract | New contract |
|---|---|---|
| `hooks/useGameState.ts` | exports `Side`, `SideState`, `GameState { a, b }` | exports `LeaderSideState`, `GameState { leaders, leaderIds }`, `getLeaderColorVar(index)` |
| `components/sim/SimView.tsx` | `<SideColumn side="a" sideState={state.a} />` ×2 | `<LeaderColumn leaderId={state.leaderIds[0]} leaderIndex={0} />` ×2 (iterate `state.leaderIds.slice(0, 2)` for current 2-column layout) |
| `components/layout/StatsBar.tsx` | props `systemsA`, `systemsB`, `prevSystemsA`, `prevSystemsB`, `deathsA`, `deathsB`, `deathCausesA`, `deathCausesB`, `toolsA`, `toolsB`, `citationsA`, `citationsB` | single prop `leaders: Array<{ id: string; state: LeaderSideState }>` + existing `crisisText` + `toolRegistry`. The `state` object carries current AND previous systems (`state.systems` + `state.prevSystems`) so no separate `prev` field is needed. |
| `components/layout/LeaderBar.tsx` | prop `side: Side` | prop `leaderIndex: number` |
| `components/sim/DivergenceRail.tsx` | reads `state.a` + `state.b` | reads `state.leaders[state.leaderIds[0]]` + `state.leaders[state.leaderIds[1]]`; pattern generalizes for future `.slice(0, N)` |
| `components/sim/CrisisHeader.tsx` | prop `side: Side` | prop `leaderIndex: number` |
| `components/sim/Timeline.tsx` | reads `state.a.events`, `state.b.events` | iterates `state.leaderIds.map(id => state.leaders[id])` |
| `components/sim/EventCard.tsx` | prop `side: Side` | prop `leaderIndex: number` |
| `components/sim/VerdictCard.tsx` | reads `state.a.leader`, `state.b.leader` | reads via leaderIds[0]/[1] |
| `components/sim/SimFooterBar.tsx` | reads both sides | iterates leaderIds |
| `App.tsx:452-486` (handleCopySummary) | reads `gameState.a.systems.population` etc. | reads via leaderIds[0]/[1] |
| Tests | reference `state.a` / `state.b` / `side: 'a'` | use new shape |

Component RENAMES:
- `SideColumn` (inside SimView) → `LeaderColumn` (internal rename inside the same file)
- `SideState` type → `LeaderSideState` type

Component DELETIONS:
- `Side` type (export from useGameState)

### Prop-shape change for `StatsBar` — worked example

The old API has 12 flat props. The new API takes one `leaders` array:

```typescript
// Old usage
<StatsBar
  systemsA={state.a.systems}
  systemsB={state.b.systems}
  prevSystemsA={state.a.prevSystems}
  prevSystemsB={state.b.prevSystems}
  deathsA={state.a.deaths}
  deathsB={state.b.deaths}
  deathCausesA={state.a.deathCauses}
  deathCausesB={state.b.deathCauses}
  toolsA={state.a.tools}
  toolsB={state.b.tools}
  citationsA={state.a.citations}
  citationsB={state.b.citations}
  crisisText={crisisText}
  toolRegistry={toolRegistry}
/>

// New usage
<StatsBar
  leaders={state.leaderIds.map(id => ({ id, state: state.leaders[id] }))}
  crisisText={crisisText}
  toolRegistry={toolRegistry}
/>
```

Inside StatsBar: today's implementation reads the 12 flat props and renders two columns. The new implementation iterates `leaders`, rendering one column per leader. For the current N=2 rendering, this produces identical output.

### What stays unchanged

- Visual output. Identical 2-column layout. Identical colors. Identical prop shapes flowing into atomic rendering components (SparkLine, Tooltip, Badge).
- `SimEvent` type in `useSSE.ts` — already keyed by `leader: string`
- `useSSE` hook shape — no public API change
- Saved-file JSON format — already uses leader names in `results[]`, not `a`/`b`
- All hooks' external APIs (`useCitationRegistry`, `useToolRegistry`, etc.)
- CSS — no token or class changes

---

## Rollout sequence (single atomic commit)

Per the no-tech-debt decision, one commit rewrites everything. Iteration happens locally against a failing-test harness before the commit lands.

1. **Rewrite `useGameState.ts`** — new state shape + reducer + `getLeaderColorVar` helper. Tests for the hook itself pass first.
2. **Rewrite each consumer** in a single editing session. After each file: `tsc --noEmit -p tsconfig.json` in `src/cli/dashboard/` to catch type errors as they emerge.
3. **Update tests** — grep for `state.a`, `state.b`, `side:`, `SideState`, `Side` across `src/cli/dashboard/src/**/*.test.ts` and update.
4. **Full dashboard typecheck** passes.
5. **Full test suite** passes: `node --import tsx --test 'src/cli/dashboard/src/**/*.test.ts'`.
6. **Visual smoke.** Launch dashboard via `npm run dashboard`, run one guided-tour simulation (no LLM calls since tour uses canned events), visually confirm identical layout + colors to pre-refactor.
7. **Commit.** Subject `refactor(dashboard): generalize state shape for N leaders (arena-ready)`. Body cites the audit finding F1.

**Commit type.** `refactor:` — no behavioural change, no breaking-change marker. This commit does NOT bump paracosm's version (refactor is internal to the dashboard; npm package surface unchanged).

---

## Risks + edge cases

**Risks**

1. **12-file rename misses a call site.** Mitigation: `grep -rn '\bstate\.a\b\|\bstate\.b\b\|\bSideState\b\|side: *Side\|side="[ab]"' src/cli/dashboard/src/` after each consumer's edit. Build + typecheck after each to catch what grep misses. Final full grep pass before commit.

2. **Reducer ordering bug.** If the reducer processes a second leader's event before the first leader's event (possible if the server buffer replays out-of-order), `leaderIds` would end up in a different order. Mitigation: unit test specifically for out-of-order events (leader B's `turn_start` arrives before leader A's). The reducer MUST preserve first-seen order, which is what `[...leaderIds, newLeader]` natively gives us.

3. **Visual regression that escapes typecheck.** Example: a CSS custom property was depending on the parent-chain of a specific `<SideColumn>` structure and the rename breaks the selector. Mitigation: the visual smoke test in step 6. If tooling allows, snapshot the guided-tour end-state visually before + after and compare.

4. **Tests that mocked `GameState` shape break.** Mitigation: test updates land in the same commit as the main refactor. All tests green pre-commit.

5. **The new `LeaderColumn` component name collides with something existing.** Verified none exists in the repo (`grep -rn 'LeaderColumn' src/cli/dashboard/src/` returns nothing). Safe.

**Edge cases handled explicitly**

- **Zero leaders.** Initial state has `leaders: {}`, `leaderIds: []`. Every consumer that iterates gets an empty list + renders the existing empty state. No access to `leaderIds[0]` without an `if (leaderIds.length > 0)` guard (or the `?? null` fallback via `state.leaders[leaderIds[0]] ?? null`).
- **One leader arrives, second never does.** `leaderIds` = `['Alice']`. Consumers rendering two columns get `state.leaders[leaderIds[1]]` → `undefined`. Today's code handles `state.b.leader === null` via fallback to preset leader; new code handles `state.leaders[leaderIds[1]] === undefined` the same way via `?? null` conversion.
- **Same-name leaders.** Second leader's events merge into the first's state (map keyed by name). Visible only if a user manually crafts a `/setup` payload with duplicate names. Flagged as a P2-follow-up risk, not blocking this refactor.
- **Leader name changes mid-run.** Not possible today (name is fixed at run start). No handling needed.
- **Reset via `sse.reset()`.** Reducer's reset case produces `leaders: {}, leaderIds: []`. Existing `useSSE.reset()` already clears `events: []` which triggers the reducer path.

---

## Testing plan

**Unit tests updated / added** in `src/cli/dashboard/src/hooks/useGameState.test.ts`:

- **Shape sanity.** Empty initial state has `leaders === {}`, `leaderIds === []`.
- **First leader seen.** After one `turn_start` event for leader "Alice", `leaderIds === ['Alice']`, `leaders.Alice.systems.population === <expected>`.
- **Second leader seen.** After a `turn_start` event for leader "Bob" follows Alice's, `leaderIds === ['Alice', 'Bob']`.
- **Out-of-order leaders.** Bob's event arrives before Alice's; `leaderIds === ['Bob', 'Alice']`. This validates that launch order is preserved.
- **Reset.** After reset, `leaders === {}`, `leaderIds === []`.
- **Color helper.** `getLeaderColorVar(0) === 'var(--vis)'`, `getLeaderColorVar(1) === 'var(--eng)'`, `getLeaderColorVar(2) === 'var(--amber)'`.

**Tests updated (rename-in-place)** across the dashboard test suite:

Every test file that references `state.a`, `state.b`, `Side`, `SideState`, `side: 'a'` gets rewritten. Exact list produced during execution by the grep pass.

**Build + typecheck gates**

- `cd src/cli/dashboard && npx tsc --noEmit -p tsconfig.json` passes after every consumer edit.
- `node --import tsx --test 'src/cli/dashboard/src/**/*.test.ts'` passes before commit.
- Full-suite paracosm test (`npm test` at repo root) passes — this covers the runtime + engine tests that the dashboard does not touch, serving as a regression guard for unintended cross-layer changes.

**Visual smoke**

- `npm run dashboard` in one terminal
- Open `http://localhost:3456/sim` in a browser
- Click "Take the guided tour" (canned demo, zero LLM cost)
- Visually compare against a same-tour screenshot taken before the refactor (reference image in `~/Desktop/paracosm-f1-smoke-before.png` captured as the first step of execution)
- Check: two columns present, leader names + HEXACO radars render, sparklines render, EventCards render with correct colors, StatsBar populated, verdict card reads correctly after tour completes
- ALSO: launch a real 3-turn sim against OpenAI (~$0.30) to confirm live-event path works end-to-end

**Grep pass (final)**

```bash
# Should return only legitimate matches (prose in comments, English text, etc.)
grep -rn '\bstate\.a\b\|\bstate\.b\b\|\bSideState\b\|side: *Side\|Side = .a. | .b.\|side="[ab]"' src/cli/dashboard/src/ | grep -v '\.test\.ts'
```

Expected output: empty, OR only hits inside comments explaining the historical `a`/`b` shape (permissible).

---

## Acceptance criteria

- `tsc --noEmit -p tsconfig.json` in `src/cli/dashboard/` passes clean
- `npm test` (full paracosm suite) passes — no non-dashboard regressions
- Dashboard test suite passes; new tests for the reducer's leaderIds ordering included
- Visual smoke on guided tour shows zero pixel-level difference from pre-refactor
- Grep pass returns only prose matches (no live code still reading `state.a`/`.b` or `side: Side`)
- Live-sim smoke: a 3-turn OpenAI run produces the same dashboard state it would have before
- No change to npm package surface — the library's public exports are unaffected

---

## Out of scope

- **F2** (layout modes for N>2 — solo / pair / grid). Deferred to ship with P2 arena.
- **F3** (StatsBar / LeaderBar N-leader redesign for horizontal overflow). Deferred to P2.
- **Stable leader ID generation** (replacing name-as-key with a unique id). Deferred until P2 arena raises the duplicate-name collision probability.
- **Color rotation beyond index 0/1.** Helper is extensible but only two colors are defined; third+ fall back to amber. F2/F3 territory.
- **Saved-file schema changes.** Files already use leader names in `results[]`; no migration needed.
- **Any visible UI change.** If a visual diff appears, it's a regression, not a feature.
- **`SwarmViz`, `LivingSwarmGrid`, viz/grid/* internals.** Those read `gameState` but do so mostly through `useVizSnapshots` which can be updated in the same commit. If the viz layer surfaces hidden coupling, flag it during execution and scope-extend — do NOT hack around it.
- **Updates to `useVizSnapshots.ts`.** If this hook reads `state.a` / `state.b`, it's in scope for the refactor (counts as one of the "12 files") even though the audit didn't call it out explicitly.

---

## Follow-ups (deferred to subsequent specs)

- **F2:** Layout modes for N=1, N=2, N≥3 rendering. Ships with P2 arena.
- **F3:** StatsBar + LeaderBar redesign for N>2 horizontal scroll or grid. Ships with P2 arena.
- **Stable leader-id generation.** Ship with P2 arena spec.
- **Color rotation beyond index 1.** Define a 5-10 color palette when F2+F3 land.
- **`SwarmViz` + `LivingSwarmGrid` audit.** The god-viz files from audit finding F6, scheduled as a dedicated audit pass before refactoring.
