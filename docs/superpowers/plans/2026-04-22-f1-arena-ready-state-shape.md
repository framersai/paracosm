# F1 — Arena-Ready Dashboard State Shape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Subagent-driven execution is disallowed by the project's operator preferences (no Agent-tool dispatch, no worktrees with submodules).

**Goal:** Generalize the dashboard's `GameState` from `{ a, b }` to `{ leaders: Record<string, LeaderSideState>, leaderIds: string[] }` without any visible UI change. Unblocks P2 arena's N-leader rendering.

**Architecture:** Pure internal refactor. No compat shim — every consumer migrates atomically. Leader identity is `leader.name`; launch order is append-on-first-seen. 2-leader rendering uses `leaderIds[0]` / `leaderIds[1]` in the same components.

**Tech Stack:** TypeScript, React 18+, `node --import tsx --test` for tests, Vite for the dashboard build.

**Spec:** [`docs/superpowers/specs/2026-04-22-f1-arena-ready-state-shape-design.md`](../specs/2026-04-22-f1-arena-ready-state-shape-design.md)

---

## File structure

**Files modified (single atomic commit):**

| Layer | File |
|---|---|
| Core hook | `src/cli/dashboard/src/hooks/useGameState.ts` |
| Consumer hooks | `src/cli/dashboard/src/hooks/useCitationRegistry.ts`, `src/cli/dashboard/src/hooks/useToolRegistry.ts` |
| App shell | `src/cli/dashboard/src/App.tsx` (handleCopySummary) |
| Layout | `src/cli/dashboard/src/components/layout/LeaderBar.tsx`, `Toolbar.tsx`, `TopBar.tsx`, `StatsBar.tsx` |
| Sim | `src/cli/dashboard/src/components/sim/SimView.tsx`, `CrisisHeader.tsx`, `EventCard.tsx`, `Timeline.tsx`, `DivergenceRail.tsx` |
| Reports | `src/cli/dashboard/src/components/reports/ReportView.tsx`, `MetricSparklines.tsx`, `RunStrip.tsx`, `reports-shared.ts`, `CommanderTrajectoryCard.tsx` |
| Viz | `src/cli/dashboard/src/components/viz/SwarmViz.tsx` (20+ refs, largest consumer), `TurnBanner.tsx`, `useVizSnapshots.ts` |
| Tests | `src/cli/dashboard/src/components/reports/reports-shared.test.ts` |

**Files created:**
- `src/cli/dashboard/src/hooks/useGameState.test.ts` — new tests covering leaderIds ordering, first-seen append, reset, and the color palette helper. If this file already exists, extend it.

**22 touched files total** (19 source + 2 hooks + 1 test). Exact grep before commit confirms the final set.

---

## Tasks

### Task 1: Write tests for the new `useGameState` shape (TDD)

**Why first:** the state shape is the contract that all consumers depend on. Getting it right (and covered by tests) before touching consumers catches reducer bugs early.

**Files:**
- Create or modify: `src/cli/dashboard/src/hooks/useGameState.test.ts`

- [ ] **Step 1.1: Check whether a test file already exists**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
ls src/cli/dashboard/src/hooks/useGameState.test.ts 2>&1 || echo "not present, will create"
```

- [ ] **Step 1.2: Write the test file with failing tests**

Create (or append to) `src/cli/dashboard/src/hooks/useGameState.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHook, act } from '@testing-library/react';
import { useGameState, getLeaderColorVar } from './useGameState';
import type { SimEvent } from './useSSE';

const mkEvent = (type: SimEvent['type'], leader: string, turn = 1, data: Record<string, unknown> = {}): SimEvent => ({
  type,
  leader,
  turn,
  data: { turn, ...data },
});

test('useGameState: initial state has empty leaders map and empty ordering', () => {
  const { result } = renderHook(() => useGameState([], false));
  assert.deepEqual(result.current.leaders, {});
  assert.deepEqual(result.current.leaderIds, []);
});

test('useGameState: first turn_start for leader Alice appends her to leaderIds', () => {
  const events: SimEvent[] = [
    mkEvent('turn_start', 'Alice', 1, { title: 'First Footfall' }),
  ];
  const { result } = renderHook(() => useGameState(events, false));
  assert.deepEqual(result.current.leaderIds, ['Alice']);
  assert.ok(result.current.leaders['Alice'], 'Alice has a state entry');
});

test('useGameState: second leader appended after first', () => {
  const events: SimEvent[] = [
    mkEvent('turn_start', 'Alice', 1, { title: 'Event A' }),
    mkEvent('turn_start', 'Bob', 1, { title: 'Event B' }),
  ];
  const { result } = renderHook(() => useGameState(events, false));
  assert.deepEqual(result.current.leaderIds, ['Alice', 'Bob']);
});

test('useGameState: Bob arriving first puts Bob at leaderIds[0]', () => {
  const events: SimEvent[] = [
    mkEvent('turn_start', 'Bob', 1, { title: 'Bob event' }),
    mkEvent('turn_start', 'Alice', 1, { title: 'Alice event' }),
  ];
  const { result } = renderHook(() => useGameState(events, false));
  assert.deepEqual(result.current.leaderIds, ['Bob', 'Alice'], 'launch order preserved');
});

test('useGameState: events without a matching leader entry create one lazily', () => {
  const events: SimEvent[] = [
    mkEvent('outcome', 'Cleo', 1, { outcome: 'risky_success' }),
  ];
  const { result } = renderHook(() => useGameState(events, false));
  assert.deepEqual(result.current.leaderIds, ['Cleo']);
});

test('getLeaderColorVar: index 0 -> vis, index 1 -> eng, index 2+ -> amber fallback', () => {
  assert.equal(getLeaderColorVar(0), 'var(--vis)');
  assert.equal(getLeaderColorVar(1), 'var(--eng)');
  assert.equal(getLeaderColorVar(2), 'var(--amber)');
  assert.equal(getLeaderColorVar(5), 'var(--amber)');
});
```

If `@testing-library/react` is not currently a dependency and tests break, check the existing dashboard test imports (`grep -l '@testing-library' src/cli/dashboard/src/`) and match the existing pattern. If no React testing library is used in the dashboard, fall back to direct reducer imports (export the pure reducer from `useGameState.ts` and test it as a pure function).

- [ ] **Step 1.3: Check test runner setup + confirm tests fail**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/cli/dashboard/src/hooks/useGameState.test.ts 2>&1 | tail -15
```

Expected: fails either with `SyntaxError: Named import 'getLeaderColorVar' does not exist` OR missing `@testing-library/react` import.

If missing `@testing-library/react`: refactor the test to import the pure reducer directly (export it from `useGameState.ts` for testability), avoiding React hooks in tests entirely. This is the simpler path — adjust all tests to call `reducer(state, event)` or the equivalent pure update function.

---

### Task 2: Rewrite `useGameState.ts`

**Files:**
- Modify: `src/cli/dashboard/src/hooks/useGameState.ts`

- [ ] **Step 2.1: Read the current file end to end**

```bash
wc -l src/cli/dashboard/src/hooks/useGameState.ts
```

Expected: 500 lines (per audit). Read with the Read tool.

- [ ] **Step 2.2: Identify the interface exports**

Grep for every exported type:

```bash
grep -n '^export ' src/cli/dashboard/src/hooks/useGameState.ts
```

Expected list includes (at minimum): `Side`, `SideState`, `LeaderInfo`, `SystemsState`, `CrisisState`, `UiEvent`, `CostState`, `GameState`, `useGameState`.

- [ ] **Step 2.3: Rewrite the types**

Replace the type block. Delete `Side` entirely. Rename `SideState` to `LeaderSideState` (same field list). Rewrite `GameState`:

```typescript
// BEFORE (sample — actual file has more fields)
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

// AFTER
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
  // preserve any fields I'm missing — copy the field list verbatim from the
  // current SideState, line by line
}

export interface GameState {
  leaders: Record<string, LeaderSideState>;
  leaderIds: string[];
  turn: number;
  year: number;
  maxTurns: number;
  seed: number;
  isRunning: boolean;
  isComplete: boolean;
  cost: CostState | null;
}

// Side type is gone. Consumers use leaderIndex: number or the leader id.
```

Double-check: copy the EXACT field list from the current `SideState` into `LeaderSideState`. If the current file has fields I didn't list above (it has 500 lines — likely has more), preserve them.

- [ ] **Step 2.4: Add the color helper export**

Add to the same file (top-level export, not inside `useGameState`):

```typescript
/**
 * Map a leader index to its CSS color custom property. Index 0 gets the
 * "visionary" palette (--vis), index 1 gets "engineer" (--eng). Indices
 * 2+ fall back to amber for now — F2/F3 will extend the palette when
 * P2 arena actually renders N>2 leaders.
 */
export function getLeaderColorVar(index: number): string {
  if (index === 0) return 'var(--vis)';
  if (index === 1) return 'var(--eng)';
  return 'var(--amber)';
}
```

- [ ] **Step 2.5: Rewrite the reducer**

Locate the reducer function (likely named `reducer`, `gameReducer`, or inlined inside `useGameState`). Find every `state.a` / `state.b` access and every `state.a.leader?.name === e.leader` pattern. Replace:

```typescript
// BEFORE (sketch)
function reducer(state: GameState, event: SimEvent): GameState {
  const { type, leader } = event;
  if (leader === state.a.leader?.name) {
    return { ...state, a: updateSide(state.a, event) };
  }
  if (leader === state.b.leader?.name) {
    return { ...state, b: updateSide(state.b, event) };
  }
  // First-seen leader: assign to a if empty, else b
  if (state.a.leader === null) {
    return { ...state, a: { ...createEmptySide(), leader: {...}, ...updateSide(state.a, event) } };
  }
  // etc.
}

// AFTER (sketch)
function reducer(state: GameState, event: SimEvent): GameState {
  const { leader } = event;
  if (!leader) return state; // some server-synthetic events have empty leader

  const existing = state.leaders[leader];
  const updatedSide = updateSide(existing ?? createEmptyLeaderSideState(), event);

  return {
    ...state,
    leaders: { ...state.leaders, [leader]: updatedSide },
    leaderIds: state.leaderIds.includes(leader)
      ? state.leaderIds
      : [...state.leaderIds, leader],
  };
}

function createEmptyLeaderSideState(): LeaderSideState {
  return {
    leader: null,
    systems: null,
    prevSystems: null,
    events: [],
    crisis: null,
    deaths: 0,
    deathCauses: {},
    tools: 0,
    citations: 0,
    decisions: 0,
    popHistory: [],
    moraleHistory: [],
    // + any other fields SideState carried
  };
}
```

Every shared field (turn, year, maxTurns, etc.) stays on the top-level state. Only per-leader fields move into `leaders[name]`.

**Important:** preserve every existing reducer case. Don't accidentally drop a handler. The current reducer handles ~20 event types; each one updates some combination of shared state + per-leader state.

- [ ] **Step 2.6: Update the initial state**

```typescript
// BEFORE
const initialState: GameState = {
  a: createEmptySide(),
  b: createEmptySide(),
  turn: 0,
  year: 0,
  maxTurns: 6,
  seed: 0,
  isRunning: false,
  isComplete: false,
  cost: null,
};

// AFTER
const initialState: GameState = {
  leaders: {},
  leaderIds: [],
  turn: 0,
  year: 0,
  maxTurns: 6,
  seed: 0,
  isRunning: false,
  isComplete: false,
  cost: null,
};
```

- [ ] **Step 2.7: Remove the `Side` type export**

```bash
grep -n 'export type Side\b\|export.*\bSide\b' src/cli/dashboard/src/hooks/useGameState.ts
```

Delete the line exporting `Side`. Also delete `SideState` export (the export; keep `LeaderSideState` which replaced it).

- [ ] **Step 2.8: Export the empty-state factory (for tests + consumers who need to construct)**

```typescript
export function createEmptyLeaderSideState(): LeaderSideState { /* as above */ }
```

- [ ] **Step 2.9: Run the hook's tests, confirm they pass**

```bash
node --import tsx --test src/cli/dashboard/src/hooks/useGameState.test.ts 2>&1 | tail -10
```

Expected: tests from Task 1 pass. If any reducer case was missed, a test will catch it here.

- [ ] **Step 2.10: Verify the hook's typecheck compiles in isolation**

```bash
cd src/cli/dashboard && npx tsc --noEmit --jsx preserve src/hooks/useGameState.ts 2>&1 | head -20
cd - > /dev/null
```

Expected: compile errors ONLY in files outside `useGameState.ts` (the consumers — they're still reading `state.a` / `state.b`). Inside `useGameState.ts` itself, zero errors.

**Do not commit yet.** Consumers will be broken; the repo doesn't compile cleanly until Task 10 finishes.

---

### Task 3: Migrate consumer hooks (useCitationRegistry, useToolRegistry, useVizSnapshots)

**Files:**
- Modify: `src/cli/dashboard/src/hooks/useCitationRegistry.ts`
- Modify: `src/cli/dashboard/src/hooks/useToolRegistry.ts`
- Modify: `src/cli/dashboard/src/components/viz/useVizSnapshots.ts`

- [ ] **Step 3.1: Update `useCitationRegistry.ts`**

Current usages:
- Line 2: `import type { GameState, Side } from './useGameState';`
- Line 12: `sides: Set<Side>;`
- Line 48: `for (const side of ['a', 'b'] as Side[]) {`

Replace:
```typescript
// Line 2
import type { GameState } from './useGameState';
// Line 12 — rename `sides` to `leaderIndices` OR keep `sides` but typed differently.
// Simplest: track which leader names cite each source.
leaderNames: Set<string>;
// Line 48 — iterate leaderIds + read from leaders map
for (const leaderName of state.leaderIds) {
  const sideState = state.leaders[leaderName];
  if (!sideState) continue;
  // ...prior loop body
}
```

Walk through the rest of the file: anywhere that built a registry keyed by `Side`, rekey by `leaderName` or `leaderIndex`.

- [ ] **Step 3.2: Update `useToolRegistry.ts`**

Same pattern. Replace `Side` type usage with leader name or leader index. The `sides: Set<Side>` field becomes `leaderNames: Set<string>`.

- [ ] **Step 3.3: Update `useVizSnapshots.ts`**

Current: line 14 `const result: Record<Side, TurnSnapshot[]> = { a: [], b: [] };`, line 16 `for (const side of ['a', 'b'] as Side[]) {`.

Replace with a `Record<string, TurnSnapshot[]>` keyed by leader name:

```typescript
// AFTER
const result: Record<string, TurnSnapshot[]> = {};
for (const leaderName of state.leaderIds) {
  const sideState = state.leaders[leaderName];
  if (!sideState) continue;
  result[leaderName] = [];
  // ...prior loop body, appending to result[leaderName]
}
```

Callers of this hook will now read `snaps[leaderIds[0]]` instead of `snaps.a`. Update call sites in the same task (grep for `snapsA` / `snapsB` or similar).

- [ ] **Step 3.4: Incremental typecheck**

```bash
cd src/cli/dashboard && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'useCitationRegistry|useToolRegistry|useVizSnapshots' | head -10
cd - > /dev/null
```

Expected: no errors in these three files. Other consumer files still have errors (they reference the hooks' old-shape exports from their callers' context) but these three are internally clean.

---

### Task 4: Migrate layout components (LeaderBar, Toolbar, TopBar, StatsBar)

**Files:**
- Modify: `src/cli/dashboard/src/components/layout/LeaderBar.tsx`
- Modify: `src/cli/dashboard/src/components/layout/Toolbar.tsx`
- Modify: `src/cli/dashboard/src/components/layout/TopBar.tsx`
- Modify: `src/cli/dashboard/src/components/layout/StatsBar.tsx`

- [ ] **Step 4.1: Update `LeaderBar.tsx`**

Current:
```typescript
import type { Side } from '../../hooks/useGameState';
interface LeaderBarProps {
  side: Side;
  // ...
}
```

Replace:
```typescript
import { getLeaderColorVar } from '../../hooks/useGameState';
interface LeaderBarProps {
  leaderIndex: number;
  // ...
}
// In the body, replace `const color = side === 'a' ? 'var(--vis)' : 'var(--eng)'`
// with:
const color = getLeaderColorVar(leaderIndex);
```

- [ ] **Step 4.2: Update `Toolbar.tsx`**

Line 25: `const hasEvents = state.a.events.length > 0 || state.b.events.length > 0;`

Replace:
```typescript
const hasEvents = Object.values(state.leaders).some(s => s.events.length > 0);
```

- [ ] **Step 4.3: Update `TopBar.tsx`**

Line 68: same pattern as Toolbar. Replace with `Object.values(gameState.leaders).some(...)`.

Grep the rest of the file for any other `gameState.a` / `gameState.b` uses:
```bash
grep -n '\.a\.\|\.b\.' src/cli/dashboard/src/components/layout/TopBar.tsx
```

Update every hit.

- [ ] **Step 4.4: Rewrite `StatsBar.tsx`**

This is the BIGGEST consumer rewrite. The current prop signature has 12 flat props (`systemsA`, `systemsB`, `prevSystemsA`, `prevSystemsB`, `deathsA`, etc.). Replace with a single `leaders` array prop.

New interface:
```typescript
interface StatsBarProps {
  leaders: Array<{
    id: string;
    state: LeaderSideState;
  }>;
  crisisText: string;
  toolRegistry: ToolRegistry;
}
```

In the body, replace paired reads (`systemsA` + `systemsB`) with iteration over `leaders`. For the current 2-leader rendering, the component renders two columns in a `display: flex` row. The iteration naturally produces this when `leaders.length === 2`:

```tsx
<div style={{ display: 'flex', ... }}>
  {leaders.map(({ id, state }, index) => (
    <StatsColumn
      key={id}
      index={index}
      systems={state.systems}
      prevSystems={state.prevSystems}
      deaths={state.deaths}
      deathCauses={state.deathCauses}
      tools={state.tools}
      citations={state.citations}
    />
  ))}
</div>
```

Extract the inner per-column rendering into a local `<StatsColumn>` helper if it's not already a reusable block. Pass `index` so the column picks its color via `getLeaderColorVar(index)`.

- [ ] **Step 4.5: Incremental typecheck**

```bash
cd src/cli/dashboard && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'layout/' | head -10
cd - > /dev/null
```

Expected: zero errors in layout/ files. Other folders still have errors.

---

### Task 5: Migrate sim components (SimView, CrisisHeader, EventCard, Timeline, DivergenceRail)

**Files:**
- Modify: `src/cli/dashboard/src/components/sim/SimView.tsx`
- Modify: `src/cli/dashboard/src/components/sim/CrisisHeader.tsx`
- Modify: `src/cli/dashboard/src/components/sim/EventCard.tsx`
- Modify: `src/cli/dashboard/src/components/sim/Timeline.tsx`
- Modify: `src/cli/dashboard/src/components/sim/DivergenceRail.tsx`

- [ ] **Step 5.1: Update `SimView.tsx`**

Current: `import type { GameState, Side, SideState, LeaderInfo } from '../../hooks/useGameState';`

Replace:
```typescript
import type { GameState, LeaderSideState, LeaderInfo } from '../../hooks/useGameState';
import { getLeaderColorVar } from '../../hooks/useGameState';
```

The `SideColumn` component inside the file (line 30):
```typescript
// BEFORE
function SideColumn({ side, sideState, state }: { side: Side; sideState: SideState; state: GameState }) {
  // ...
  const sideColor = side === 'a' ? 'var(--vis)' : 'var(--eng)';
  const sideLabel = side === 'a' ? 'Leader A' : 'Leader B';
}

// AFTER
function LeaderColumn({ leaderIndex, sideState, state }: { leaderIndex: number; sideState: LeaderSideState; state: GameState }) {
  // ...
  const sideColor = getLeaderColorVar(leaderIndex);
  const sideLabel = `Leader ${String.fromCharCode(65 + leaderIndex)}`; // A, B, C, ...
}
```

The main SimView body (lines 170-465):
```typescript
// Line 170:
const hasEvents = state.a.events.length > 0 || state.b.events.length > 0;
// →
const hasEvents = Object.values(state.leaders).some(s => s.events.length > 0);

// Lines 203-204:
const crisisA = state.a.crisis;
const crisisText = crisisA ? `T${crisisA.turn} ...` : '';
// →
const firstLeaderState = state.leaderIds[0] ? state.leaders[state.leaderIds[0]] : null;
const crisisA = firstLeaderState?.crisis ?? null;
const crisisText = crisisA ? `T${crisisA.turn} ...` : '';

// Lines 222-223 (LeaderBar instantiation):
<LeaderBar side="a" leader={state.a.leader || presetLeaderA} ... />
<LeaderBar side="b" leader={state.b.leader || presetLeaderB} ... />
// →
{state.leaderIds.slice(0, 2).map((id, index) => {
  const s = state.leaders[id];
  const fallbackPreset = index === 0 ? presetLeaderA : presetLeaderB;
  const fallbackPlacement = index === 0 ? placementA : placementB;
  return (
    <LeaderBar
      key={id}
      leaderIndex={index}
      leader={s?.leader || fallbackPreset}
      popHistory={s?.popHistory || []}
      moraleHistory={s?.moraleHistory || []}
      verdictPlacement={fallbackPlacement}
    />
  );
})}

// Lines 231-246 (StatsBar):
<StatsBar
  systemsA={state.a.systems}
  systemsB={state.b.systems}
  // ... 10 more props
/>
// →
<StatsBar
  leaders={state.leaderIds.slice(0, 2).map(id => ({ id, state: state.leaders[id] }))}
  crisisText={crisisText}
  toolRegistry={toolRegistry}
/>

// Lines 280, 333: .events.length checks
state.a.events.length > 0
// → Object.values(state.leaders).some(s => s.events.length > 0)

// Lines 462-465 (two-column render):
<SideColumn side="a" sideState={state.a} state={state} />
<SideColumn side="b" sideState={state.b} state={state} />
// →
{state.leaderIds.slice(0, 2).map((id, index) => (
  <LeaderColumn key={id} leaderIndex={index} sideState={state.leaders[id]} state={state} />
))}
```

The `.slice(0, 2)` guard is a safety belt: today's `useGameState` won't produce more than 2 leaders (server-side pair-runner sends exactly 2), but if for any reason 3+ appear, only the first 2 render — preventing a visual regression in this refactor. F2/F3 will remove this cap.

- [ ] **Step 5.2: Update `CrisisHeader.tsx`**

```bash
grep -n 'Side\|side: *Side\|\.a\.\|\.b\.' src/cli/dashboard/src/components/sim/CrisisHeader.tsx
```

Likely has a `side: Side` prop. Change to `leaderIndex: number` and use `getLeaderColorVar(leaderIndex)`.

- [ ] **Step 5.3: Update `EventCard.tsx`**

```bash
grep -n 'Side\|side: *Side\|\.a\.\|\.b\.' src/cli/dashboard/src/components/sim/EventCard.tsx
```

Same as CrisisHeader: `side: Side` prop → `leaderIndex: number` + color via helper.

- [ ] **Step 5.4: Update `Timeline.tsx`**

```bash
grep -n 'Side\|state\.a\|state\.b\|\.a\.\|\.b\.' src/cli/dashboard/src/components/sim/Timeline.tsx
```

Update any `state.a.events` / `state.b.events` reads to iterate `state.leaderIds.map(id => state.leaders[id])`. Any `side` prop becomes `leaderIndex`.

- [ ] **Step 5.5: Update `DivergenceRail.tsx`**

Current destructuring: `const { a, b } = state;` (line 8). Replace:

```typescript
const firstId = state.leaderIds[0];
const secondId = state.leaderIds[1];
const a = firstId ? state.leaders[firstId] : null;
const b = secondId ? state.leaders[secondId] : null;
if (!a?.crisis || !b?.crisis) return null;
// ...rest of file keeps using local `a` / `b` vars
```

The local `a` / `b` variables are fine as destructured aliases; we're not renaming identifiers inside this component, only changing where `a` and `b` come from.

- [ ] **Step 5.6: Incremental typecheck**

```bash
cd src/cli/dashboard && npx tsc --noEmit -p tsconfig.json 2>&1 | grep 'sim/' | head -10
cd - > /dev/null
```

Expected: zero errors in sim/ files.

---

### Task 6: Migrate reports components

**Files:**
- Modify: `src/cli/dashboard/src/components/reports/ReportView.tsx`
- Modify: `src/cli/dashboard/src/components/reports/MetricSparklines.tsx`
- Modify: `src/cli/dashboard/src/components/reports/RunStrip.tsx`
- Modify: `src/cli/dashboard/src/components/reports/reports-shared.ts`
- Modify: `src/cli/dashboard/src/components/reports/CommanderTrajectoryCard.tsx`

- [ ] **Step 6.1: Read each file's current contract**

```bash
for f in src/cli/dashboard/src/components/reports/ReportView.tsx src/cli/dashboard/src/components/reports/MetricSparklines.tsx src/cli/dashboard/src/components/reports/RunStrip.tsx src/cli/dashboard/src/components/reports/reports-shared.ts src/cli/dashboard/src/components/reports/CommanderTrajectoryCard.tsx; do
  echo "=== $f ==="
  grep -n 'state\.a\|state\.b\|Side\|SideState\|\.a\.\|\.b\.\|side: *Side' "$f" | head -10
done
```

Build a per-file line-by-line edit plan from the output.

- [ ] **Step 6.2: Apply the edits**

For each file: replace state.a/state.b accesses with `state.leaders[state.leaderIds[N]]`; replace `side: Side` props with `leaderIndex: number`; replace color derivation (`side === 'a' ? --vis : --eng`) with `getLeaderColorVar(leaderIndex)`.

**`reports-shared.ts`** is a module of utility functions; it likely exports functions taking `Side` as parameter. Rename the parameter type to `number` (leaderIndex). All callers in the other reports/ files update in lockstep.

- [ ] **Step 6.3: Incremental typecheck**

```bash
cd src/cli/dashboard && npx tsc --noEmit -p tsconfig.json 2>&1 | grep 'reports/' | head -10
cd - > /dev/null
```

Expected: zero errors in reports/ files.

---

### Task 7: Migrate viz components (TurnBanner + the SwarmViz giant)

**Files:**
- Modify: `src/cli/dashboard/src/components/viz/TurnBanner.tsx`
- Modify: `src/cli/dashboard/src/components/viz/SwarmViz.tsx` — largest consumer, 20+ references

- [ ] **Step 7.1: Update `TurnBanner.tsx`**

Current (lines 2, 22, 63-64):
```typescript
import type { GameState, SideState } from '../../hooks/useGameState.js';
function summarize(side: SideState, turn: number): LeaderTurnSummary | null { /* ... */ }
const a = useMemo(() => summarize(state.a, currentTurn), [state.a, currentTurn]);
const b = useMemo(() => summarize(state.b, currentTurn), [state.b, currentTurn]);
```

Replace:
```typescript
import type { GameState, LeaderSideState } from '../../hooks/useGameState.js';
function summarize(side: LeaderSideState, turn: number): LeaderTurnSummary | null { /* ... */ }
const firstId = state.leaderIds[0];
const secondId = state.leaderIds[1];
const a = useMemo(() => firstId ? summarize(state.leaders[firstId], currentTurn) : null, [state.leaders, firstId, currentTurn]);
const b = useMemo(() => secondId ? summarize(state.leaders[secondId], currentTurn) : null, [state.leaders, secondId, currentTurn]);
```

- [ ] **Step 7.2: Map every SwarmViz.tsx reference**

```bash
grep -n 'state\.a\|state\.b\|\.a\.\|\.b\.\|Side\|SideState\|side="a"\|side="b"\|forgeFeeds\.a\|forgeFeeds\.b\|snapsA\|snapsB\|leaderA\|leaderB\|eventsA\|eventsB' src/cli/dashboard/src/components/viz/SwarmViz.tsx
```

Expected output: ~40 line references. Read each; categorize:
- `state.a.events` / `state.b.events` → iterate leaderIds or directly index
- `const leaderA = state.a.leader ?? presetA` / `const leaderB = state.b.leader ?? presetB` → iterate slice(0, 2)
- `events: { a: state.a.events, b: state.b.events }` → build from leaderIds
- `forgeFeeds.a` / `forgeFeeds.b` → internal state shape of SwarmViz, may need rekeying from `a`/`b` keys to leader names OR indices
- `snapsA` / `snapsB` → return value of `useVizSnapshots`, already updated in Task 3; rename to `snaps[leaderIds[0]]` / `snaps[leaderIds[1]]`
- `eventsA` / `eventsB` as component props → rename prop or pass array

- [ ] **Step 7.3: Apply the SwarmViz edits carefully**

This is the riskiest single-file change in the plan. Work top to bottom through the file. After each logical block (every 50-100 lines of edits) run:

```bash
cd src/cli/dashboard && npx tsc --noEmit -p tsconfig.json 2>&1 | grep 'SwarmViz' | head -5
cd - > /dev/null
```

Fix emerging errors immediately rather than accumulating them.

For internal helpers that currently take `side: 'a' | 'b'`: either rename to `leaderIndex: number` AND remap the `forgeFeeds` key from `a`/`b` to `0`/`1` (`Record<number, ForgeFeed>`), OR keep internal `a`/`b` keys as private labels + map from `leaderIndex` at the boundary. Pick whichever requires fewer changes in the 1500-line file.

**Recommendation**: keep internal a/b as private shape inside SwarmViz's local state/refs (they're never exported); remap from external `leaderIndex`/`leaderIds` at the top of the component. This minimizes churn in a high-risk file.

- [ ] **Step 7.4: Incremental typecheck viz/**

```bash
cd src/cli/dashboard && npx tsc --noEmit -p tsconfig.json 2>&1 | grep 'viz/' | head -10
cd - > /dev/null
```

Expected: zero errors in viz/ files. LivingSwarmGrid and other viz/grid/ files should not require changes since they don't reference `state.a` / `state.b` (they consume derived data from SwarmViz via props).

---

### Task 8: Migrate App.tsx handleCopySummary

**Files:**
- Modify: `src/cli/dashboard/src/App.tsx` (lines 452-486)

- [ ] **Step 8.1: Rewrite handleCopySummary**

Current (lines 452-486):
```typescript
const a = gameState.a;
const b = gameState.b;
const nameA = a.leader?.name || 'Leader A';
// ... reads a.* and b.* throughout
```

Replace:
```typescript
const ids = gameState.leaderIds;
const a = ids[0] ? gameState.leaders[ids[0]] : null;
const b = ids[1] ? gameState.leaders[ids[1]] : null;
const nameA = a?.leader?.name || 'Leader A';
const nameB = b?.leader?.name || 'Leader B';
// ... rest reads a?.leader?.archetype, a?.systems?.population, etc. with optional chaining
```

The `Copy Summary` functionality still outputs exactly two leaders (the current hardcoded 2-leader output format stays). A future spec generalizes to N.

- [ ] **Step 8.2: Verify App.tsx typechecks**

```bash
cd src/cli/dashboard && npx tsc --noEmit -p tsconfig.json 2>&1 | grep App.tsx | head -10
cd - > /dev/null
```

Expected: zero errors in App.tsx.

---

### Task 9: Migrate tests

**Files:**
- Modify: `src/cli/dashboard/src/components/reports/reports-shared.test.ts`

- [ ] **Step 9.1: Update the test file**

```bash
grep -n 'state\.a\|state\.b\|Side\|SideState\|\.a\.\|\.b\.\|side: *Side\|side: *.a.\|side: *.b.' src/cli/dashboard/src/components/reports/reports-shared.test.ts
```

Apply the same rename pattern as the source files. Test fixtures constructed with `a`/`b` fields are now `leaders: { leaderName: {...} }` + `leaderIds: ['leaderName']`.

- [ ] **Step 9.2: Run the dashboard test suite**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test 'src/cli/dashboard/src/**/*.test.ts' 2>&1 | tail -15
```

Expected: all tests pass including the new `useGameState` tests.

---

### Task 10: Final verification + grep pass + commit

**No commit yet until every check passes.**

- [ ] **Step 10.1: Full paracosm typecheck**

```bash
npm run build 2>&1 | tail -5
```

Expected: clean build, no TypeScript errors. This compiles the library (engine + runtime + cli), not the dashboard — serves as a regression guard.

- [ ] **Step 10.2: Dashboard typecheck**

```bash
cd src/cli/dashboard && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -5
cd - > /dev/null
```

Expected: zero errors.

- [ ] **Step 10.3: Full paracosm test suite**

```bash
npm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 10.4: Dashboard test suite**

```bash
node --import tsx --test 'src/cli/dashboard/src/**/*.test.ts' 2>&1 | tail -10
```

Expected: all pass including Task 1's new tests.

- [ ] **Step 10.5: Grep pass — no live `.a` / `.b` / `Side` references remain**

```bash
grep -rn 'state\.a\b\|state\.b\b\|gameState\.a\|gameState\.b\|\bSideState\b\|\bSide\b\|side: *Side\|side="[ab]"' src/cli/dashboard/src --include='*.ts' --include='*.tsx' 2>&1 | grep -v '\.test\.ts' | grep -v '// .*[Ss]ide' | head -10
```

Expected: empty output, OR only prose hits inside comments that explain the historical shape (acceptable).

- [ ] **Step 10.6: Visual smoke — start dashboard and take the guided tour**

```bash
# In a separate terminal / tmux pane:
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npm run dashboard
# Wait for "running on http://localhost:3456"
```

Open `http://localhost:3456/sim`. Click "Take the guided tour" (canned demo — zero LLM cost). Visually confirm:

- Two columns present, one per leader
- Leader names appear in LeaderBar strips
- StatsBar shows both columns' metrics
- EventCards render with their expected colors (rust/amber for Leader A, teal/--eng for Leader B)
- DivergenceRail appears when both crises diverge
- Timeline renders
- Tour completes cleanly, verdict banner + modal open

If any visual regression appears, stop and fix before proceeding. Compare against the pre-refactor screenshot if available.

- [ ] **Step 10.7: Live-sim smoke (~$0.30 OpenAI)**

```bash
# From the same dashboard at /sim, click RUN in the top bar.
# Or via CLI:
bun src/index.ts
```

Watch the dashboard as events stream. Confirm:
- Both leaders' events appear in their respective columns
- Stats update live
- Systems_snapshot events populate the viz
- Forge toasts fire
- Verdict appears at end

Cost: ~$0.20-0.60 per run on economy preset. Budget explicitly.

- [ ] **Step 10.8: Stage + commit (atomic)**

```bash
git status --short
```

Expected: ~22 modified files + 1-2 new test files.

```bash
git add src/cli/dashboard/src/
git commit -m "$(cat <<'EOF'
refactor(dashboard): generalize state shape for N leaders (arena-ready)

Replace gameState.a / gameState.b with gameState.leaders (keyed by
leader name) + gameState.leaderIds (launch order). Every consumer
updated atomically; no compat shim left behind.

Visual output unchanged: the 2-leader rendering is preserved by
reading leaderIds[0] / leaderIds[1] in SimView, StatsBar, LeaderBar,
the two-column viz layout, and handleCopySummary. Color helper
getLeaderColorVar(index) centralizes the vis/eng palette for future
N>2 rotation.

Side type removed entirely. SideColumn renamed to LeaderColumn.
SideState renamed to LeaderSideState.

F2 (layout modes for N>2) and F3 (StatsBar/LeaderBar N-leader
redesign) ship later alongside P2 arena mode where N>2 data
actually exists to validate rendering decisions against.

Unblocks P2 arena implementation: the dashboard state layer now
accepts any number of leaders from the reducer's input events.
EOF
)"
```

- [ ] **Step 10.9: Push (only after user authorizes)**

User's standing rule: never push without explicit authorization. Wait for the user to say "push" before running:

```bash
# Inside paracosm submodule:
git push origin master

# Then bump the monorepo's submodule pointer:
cd /Users/johnn/Documents/git/voice-chat-assistant
git add apps/paracosm
git commit --no-verify -m "chore: update paracosm submodule (F1 arena-ready state shape)"
git push origin master
```

---

## Self-review

**Spec coverage check:**

- State shape change (Side removed, LeaderSideState + leaders map + leaderIds) → Task 2
- Color palette helper → Task 2 Step 2.4
- Component migration map (12 files per spec, 22 actual) → Tasks 3-8
- Rollout sequence → Tasks 1-10 in order
- Risks + edge cases (out-of-order leaders, zero leaders, same-name collision) → Task 1 tests + Task 2 reducer logic
- Testing plan (unit tests, grep pass, visual smoke, live-sim smoke) → Task 10
- Acceptance criteria → Task 10 explicit verifications

Spec gap found: **file count was understated.** Spec said 12; reality is 22 once SwarmViz + the reports/ folder + hook consumers + DivergenceRail are counted. Not a blocker — the plan documents the real list; execution time goes from 1 day estimate to 2 days realistic.

**Placeholder scan:** no TBDs, no "add appropriate X", no "similar to Task N" without code. Every step has concrete grep commands, code blocks, or exact edits. Checked.

**Type consistency:**
- `LeaderSideState` used uniformly across the plan
- `leaderIndex: number` used uniformly for prop types
- `getLeaderColorVar(index)` used uniformly for color resolution
- `state.leaders[id]` / `state.leaderIds[index]` access pattern consistent
- No mixing of "leader name" vs "leader id" — it's always leader name (the field on SimEvent)

**Risk: 22-file atomic commit is big.** Mitigation: per-task incremental typecheck catches errors as they emerge. Tests (especially the new useGameState tests) catch reducer bugs. Visual + live-sim smoke catches behavioural regressions. The alternative (staged commits) was rejected by the user for no-tech-debt reasons.

---

## Execution handoff

Per the operator's standing rules (no Agent-tool dispatch, no worktrees with submodules), subagent-driven execution is unavailable. Execution mode is **inline only** via `superpowers:executing-plans`.

No per-task commits. The goal is a single atomic commit at Step 10.8 after all 22 files are modified + every verification passes. Staging before the final commit uses the uncommitted working tree; if context is at risk, commit earlier and amend at the end — or commit the batches and squash locally before the final commit (but DO NOT force-push once the single commit lands on master).

Push is intentionally deferred to Step 10.9 pending user authorization.
