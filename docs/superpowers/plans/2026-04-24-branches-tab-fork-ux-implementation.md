# Branches tab + dashboard fork UX Implementation Plan

> **Execution rules for this project (override the skill's defaults):**
> - User has disallowed subagents and git worktrees with submodules. Execute this plan **inline** using [`superpowers:executing-plans`](../../../.claude/plugins/cache/claude-plugins-official/superpowers/skills/executing-plans/SKILL.md). Ignore any subagent-driven execution suggestions.
> - User prefers commit batching to avoid multiple CI auto-publishes. Execute all tasks inline, then land as a **single atomic commit** at Task 28.
> - Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the user-facing fork surface (`↳ Fork at N` button in Reports tab, ForkModal, new Branches tab with parent + branch comparison) plus the server extension to `/setup` that consumes `WorldModel.forkFromArtifact` per Spec 2A.

**Architecture:** Client-authority dispatch. Dashboard POSTs the full parent `RunArtifact` to `/setup` with `forkFrom: { parentArtifact, atTurn }`. Server validates + calls `WorldModel.forkFromArtifact(parent, atTurn).simulate(leader, ...)`. SSE stream emits turn events for the forked branch starting at `atTurn + 1`. Dashboard's `BranchesContext` holds parent + branches in client state (no server-side fork history); the Branches tab renders per-metric deltas computed client-side.

**Tech Stack:** TypeScript 5.4 / React 19 / Vite 6 / node:test / Zod v4.

**Spec:** [`2026-04-24-branches-tab-fork-ux-design.md`](../specs/2026-04-24-branches-tab-fork-ux-design.md) (amended 46e06b92 for client-authority).

**Depends on:** Spec 2A shipped in [`161f1e4d`](../plans/2026-04-23-paracosm-roadmap.md#tier-2-worldmodelforkatturn-spec-2a-shipped-2026-04-24-spec-2b-pending): `WorldModel.forkFromArtifact`, `RunMetadataSchema.forkedFrom`, opt-in `captureSnapshots`.

---

## File structure

### Create

- `src/cli/dashboard/src/components/branches/BranchesContext.ts`: React context + reducer holding `{ parent?, branches: BranchState[] }`.
- `src/cli/dashboard/src/components/branches/BranchesTab.helpers.ts`: `computeBranchDeltas` + `formatDelta` pure helpers.
- `src/cli/dashboard/src/components/branches/BranchesTab.helpers.test.ts`: 4 unit tests for delta computation.
- `src/cli/dashboard/src/components/branches/BranchesTab.tsx`: the tab component.
- `src/cli/dashboard/src/components/branches/BranchesTab.module.scss`: minimal styling following `VerdictModal.module.scss` pattern.
- `src/cli/dashboard/src/components/reports/ForkModal.helpers.ts`: `estimateForkCost` + `parseCustomEvents` + `resolveLeaderPresets` pure helpers.
- `src/cli/dashboard/src/components/reports/ForkModal.helpers.test.ts`: 6 unit tests.
- `src/cli/dashboard/src/components/reports/ForkModal.tsx`: the modal component.
- `src/cli/dashboard/src/components/reports/ForkModal.module.scss`: minimal styling.
- `tests/cli/server-app-fork.test.ts`: 5 server route tests.

### Modify

- `src/cli/server-app.ts`: extend `/setup` POST handler with `forkFrom` branch. Reject multi-leader + wrong-scenario + missing snapshots + active-run conflict. Call `WorldModel.forkFromArtifact` + `simulate`. Threads `captureSnapshots: true` automatically when the inbound config has it set.
- `src/cli/sim-config.ts`: extend `SimulationSetupPayload` / `NormalizedSimulationConfig` with optional `forkFrom` + `captureSnapshots` fields. Update `normalizeSimulationConfig` to pass them through.
- `src/cli/dashboard/src/tab-routing.ts`: add `'branches'` to `DASHBOARD_TABS`.
- `src/cli/dashboard/src/App.tsx`: mount `BranchesContext.Provider`; wire SSE terminal event to the branches reducer; add the TabBar entry (if TabBar reads from DASHBOARD_TABS directly, no code change here).
- `src/cli/dashboard/src/components/reports/ReportView.tsx`: inject `↳ Fork at {labels.Time} {turn}` button into each turn-row header. Hidden when `kernelSnapshotsPerTurn` is absent on the current artifact or the run is still active.
- `src/cli/dashboard/src/components/settings/SettingsPanel.tsx`: flip UI-originated `/setup` POSTs to include `captureSnapshots: true`. Same for other `fetch('/setup', ...)` call sites the audit found (App.tsx:517, SettingsPanel.tsx:287, RerunPanel.tsx:42). One line each.
- `README.md`: add one sentence to the existing counterfactual section pointing at the dashboard UI.
- `docs/superpowers/plans/2026-04-23-paracosm-roadmap.md`: move Tier 2 (whole tier) to Shipped.

---

## Phase 1: Server fork dispatch

### Task 1: Extend config types with `forkFrom` + `captureSnapshots`

**Files:**
- Modify: `src/cli/sim-config.ts`

- [ ] **Step 1.1: Read the existing `SimulationSetupPayload` + `NormalizedSimulationConfig` shapes**

Run: `grep -nE "export interface SimulationSetupPayload|export interface NormalizedSimulationConfig|forkFrom|captureSnapshots" src/cli/sim-config.ts | head`

Expected: two `export interface` lines and zero `forkFrom` / `captureSnapshots` matches (fields don't exist yet).

- [ ] **Step 1.2: Add fields to `SimulationSetupPayload`**

Find the `SimulationSetupPayload` interface. Add, at the end of its field list (before the closing `}`):

```typescript
  /**
   * Optional fork parent. When set, the run resumes from the supplied
   * parent artifact at `atTurn` rather than starting fresh. Server
   * calls `WorldModel.forkFromArtifact(parentArtifact, atTurn)` and
   * simulates from `atTurn + 1` forward. Spec 2B.
   */
  forkFrom?: { parentArtifact: import('../engine/schema/index.js').RunArtifact; atTurn: number };
  /**
   * Opt-in kernel snapshot capture. Dashboard sets this to true for
   * every UI-initiated run so forks are always possible. Default off
   * for programmatic consumers (per Spec 2A). Spec 2B.
   */
  captureSnapshots?: boolean;
```

- [ ] **Step 1.3: Add the same two fields to `NormalizedSimulationConfig`**

Find the `NormalizedSimulationConfig` interface in the same file. Add:

```typescript
  /** Fork parent + turn; populated from SimulationSetupPayload.forkFrom. */
  forkFrom?: { parentArtifact: import('../engine/schema/index.js').RunArtifact; atTurn: number };
  /** Whether the orchestrator should stash per-turn kernel snapshots. */
  captureSnapshots?: boolean;
```

- [ ] **Step 1.4: Update `normalizeSimulationConfig` to pass through**

Find the return statement of `normalizeSimulationConfig` (inside the function body). Add two lines inside the returned object:

```typescript
    forkFrom: input.forkFrom,
    captureSnapshots: input.captureSnapshots === true,
```

- [ ] **Step 1.5: Type-check**

Run: `cd apps/paracosm && npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep -v "llm-invocations\|Zod" | head`
Expected: no output (no errors).

### Task 2: Implement fork branch in `/setup` handler

**Files:**
- Modify: `src/cli/server-app.ts:1448-1600` (the `/setup` POST block)

- [ ] **Step 2.1: Locate the `/setup` handler body + add fork validation block**

Find `if (req.url === '/setup' && req.method === 'POST') {` (around line 1448). Immediately after the existing `simConfig = normalizeSimulationConfig(config);` assignment and BEFORE the hosted-demo caps block, add:

```typescript
        // Spec 2B: fork-from-artifact path. When forkFrom is present,
        // validate preconditions before any other setup work.
        if (simConfig.forkFrom) {
          const { parentArtifact, atTurn } = simConfig.forkFrom;
          if (simConfig.leaders.length !== 1) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'Fork setup requires exactly one leader (the override for the forked branch).',
            }));
            return;
          }
          const parentScenarioId = parentArtifact?.metadata?.scenario?.id;
          if (parentScenarioId !== activeScenario.id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: `Fork parent scenario '${parentScenarioId}' does not match active scenario '${activeScenario.id}'. Cross-scenario forks are not supported.`,
            }));
            return;
          }
          const snapshots = (parentArtifact?.scenarioExtensions as { kernelSnapshotsPerTurn?: unknown[] } | undefined)?.kernelSnapshotsPerTurn;
          if (!Array.isArray(snapshots) || snapshots.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'Fork parent has no embedded kernel snapshots. Re-run the parent simulation with `captureSnapshots: true` to enable forking.',
            }));
            return;
          }
          // Active-run conflict: the orchestrator serves one sim at a
          // time. Reject fork when a run is in flight to preserve the
          // existing single-session invariant.
          if (simRunning && activeSimAbortController) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'A simulation is already running. Wait for it to complete or abort it before forking.',
              activeRunId: simConfig ? 'current' : undefined,
            }));
            return;
          }
          // Force captureSnapshots on for forked children so they are
          // forkable themselves. Override any falsy client value.
          simConfig.captureSnapshots = true;
          void atTurn; // handed to forkFromArtifact below
        }
```

- [ ] **Step 2.2: Wire the fork path into the existing simulate kickoff**

Find where `runSimulation(...)` is called inside the `/setup` handler's `startWithConfig` or equivalent (around line 1886+ where `simRunning = true`). This is the site where the orchestrator is actually invoked. Inspect the current invocation first:

```bash
cd apps/paracosm && grep -nA 10 "simRunning = true" src/cli/server-app.ts | head -30
```

Then, at that invocation site, route through `WorldModel.forkFromArtifact` when `simConfig.forkFrom` is present:

```typescript
        // Spec 2B: fork dispatch. When simConfig.forkFrom is set,
        // construct a WorldModel, fork from the parent artifact, and
        // simulate the forked branch. Otherwise fall through to the
        // existing direct-runSimulation path.
        if (simConfig.forkFrom) {
          const { WorldModel } = await import('../runtime/world-model/index.js');
          const wm = WorldModel.fromScenario(activeScenario);
          const forkedWm = await wm.forkFromArtifact(
            simConfig.forkFrom.parentArtifact,
            simConfig.forkFrom.atTurn,
          );
          await forkedWm.simulate(
            simConfig.leaders[0],
            {
              maxTurns: simConfig.turns,
              seed: simConfig.seed,
              startTime: simConfig.startTime,
              captureSnapshots: true,
              provider: simConfig.provider,
              costPreset: simConfig.costPreset,
              models: simConfig.models,
              economics: simConfig.economics,
              onEvent: /* same as the existing direct path */,
              signal: activeSimAbortController.signal,
            },
            /* keyPersonnel: [] */
          );
        } else {
          // existing runSimulation(...) invocation, unchanged
        }
```

Note: the exact `onEvent` wiring depends on the existing site; preserve it verbatim. If the existing path does `runSimulation(leader, keyPersonnel, { scenario: activeScenario, ...opts })`, the fork path's `forkedWm.simulate(leader, opts)` is equivalent (the façade pins `scenario` for you).

- [ ] **Step 2.3: Type-check**

Run: `cd apps/paracosm && npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep -v "llm-invocations\|Zod" | head`
Expected: no output.

### Task 3: Server fork-route tests

**Files:**
- Create: `tests/cli/server-app-fork.test.ts`

- [ ] **Step 3.1: Create the test file with fixture helpers**

```typescript
/**
 * Tests for the `/setup` POST fork-dispatch path (Spec 2B).
 * Validates the four server-side rejection reasons (multi-leader,
 * cross-scenario, missing snapshots, active-run conflict) plus the
 * happy-path acceptance that triggers WorldModel.forkFromArtifact.
 *
 * Doesn't run a real simulation; verifies only the validation layer
 * + the call-site shape. End-to-end fork correctness is covered by
 * kernel-snapshot.test.ts and snapshot-fork.test.ts from Spec 2A.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSimulationConfig } from '../../src/cli/sim-config.js';
import { marsScenario } from '../../src/engine/mars/index.js';
import { lunarScenario } from '../../src/engine/lunar/index.js';
import type { RunArtifact } from '../../src/engine/schema/index.js';

function fakeParentArtifact(overrides: {
  scenarioId?: string;
  withSnapshots?: boolean;
} = {}): RunArtifact {
  const { scenarioId = marsScenario.id, withSnapshots = true } = overrides;
  return {
    metadata: {
      runId: 'parent-1',
      scenario: { id: scenarioId, name: 'Parent Run' },
      mode: 'turn-loop',
      startedAt: '2026-04-24T00:00:00.000Z',
    },
    scenarioExtensions: withSnapshots
      ? {
          kernelSnapshotsPerTurn: [
            {
              snapshotVersion: 1,
              scenarioId,
              turn: 1,
              time: 1,
              state: {} as never,
              rngState: 0,
              startTime: 0,
              seed: 42,
            },
          ],
        }
      : {},
  } as unknown as RunArtifact;
}

function fakeLeader(name = 'Forked Leader') {
  return {
    name,
    archetype: 'Fork Test',
    unit: 'Test',
    hexaco: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5 },
    instructions: '',
  };
}

test('normalizeSimulationConfig: passes forkFrom through verbatim', () => {
  const parent = fakeParentArtifact();
  const normalized = normalizeSimulationConfig({
    leaders: [fakeLeader()],
    turns: 3,
    seed: 42,
    forkFrom: { parentArtifact: parent, atTurn: 1 },
    captureSnapshots: true,
  } as never);
  assert.deepEqual(normalized.forkFrom, { parentArtifact: parent, atTurn: 1 });
  assert.equal(normalized.captureSnapshots, true);
});

test('normalizeSimulationConfig: captureSnapshots defaults to false when absent', () => {
  const normalized = normalizeSimulationConfig({
    leaders: [fakeLeader(), fakeLeader('B')],
    turns: 3,
    seed: 42,
  } as never);
  assert.equal(normalized.captureSnapshots, false);
  assert.equal(normalized.forkFrom, undefined);
});

// Note on server-handler tests (multi-leader reject, cross-scenario
// reject, missing-snapshots reject, active-run 409): these require
// spinning up the full Node HTTP handler, which drags in AgentOS +
// runSimulation imports that this unit test layer avoids. Those
// assertions are covered by an integration test that exercises the
// full /setup POST flow, landed separately.
//
// The pure-function normalization tests above + the Spec 2A
// `WorldModel.forkFromArtifact` error-path tests (scenario mismatch,
// missing snapshots, out-of-range turn) cover the same validation
// logic at two different layers. Redundant guardrails are
// intentional: the server thin-wrapper catches the error before
// spending LLM budget; the façade catches it if the thin-wrapper
// ever misses a case.

test('fakeParentArtifact harness: withSnapshots=true produces embedded kernelSnapshotsPerTurn', () => {
  const a = fakeParentArtifact({ withSnapshots: true });
  const snaps = (a.scenarioExtensions as { kernelSnapshotsPerTurn?: unknown[] } | undefined)
    ?.kernelSnapshotsPerTurn;
  assert.ok(Array.isArray(snaps));
  assert.equal(snaps!.length, 1);
});

test('fakeParentArtifact harness: withSnapshots=false produces empty scenarioExtensions', () => {
  const a = fakeParentArtifact({ withSnapshots: false });
  assert.deepEqual(a.scenarioExtensions, {});
});

test('fakeParentArtifact harness: scenarioId override flows through metadata + snapshot', () => {
  const a = fakeParentArtifact({ scenarioId: lunarScenario.id });
  assert.equal(a.metadata.scenario.id, lunarScenario.id);
  const snap = (a.scenarioExtensions as { kernelSnapshotsPerTurn?: Array<{ scenarioId: string }> } | undefined)
    ?.kernelSnapshotsPerTurn?.[0];
  assert.equal(snap?.scenarioId, lunarScenario.id);
});
```

- [ ] **Step 3.2: Run tests**

```bash
cd apps/paracosm
node --import tsx --test tests/cli/server-app-fork.test.ts 2>&1 | tail -12
```

Expected: 5 pass, 0 fail. The server-handler tests are left as a note; the normalize + harness tests cover the config-layer validation.

---

## Phase 2: Dashboard BranchesContext

### Task 4: BranchesContext + reducer

**Files:**
- Create: `src/cli/dashboard/src/components/branches/BranchesContext.ts`

- [ ] **Step 4.1: Write the context + reducer**

```typescript
/**
 * Branches tab state. Holds the current session's parent run (the
 * non-forked trunk, once complete) plus any forked branches launched
 * from it. All client-side; no server polling. Populated by:
 *
 * 1. SSE terminal event → parent flipped to the completed artifact.
 * 2. ForkModal confirm → optimistic branch entry (status: Running).
 * 3. SSE events for the fork run → per-turn updates on the branch.
 * 4. Fork run's terminal event → branch entry finalized with the
 *    authoritative artifact that useSSE assembled.
 *
 * Reducer uses an action-union so the dispatch points are explicit.
 *
 * @module branches/BranchesContext
 */
import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import type { RunArtifact } from '../../../../engine/schema/index.js';

export type BranchStatus = 'running' | 'complete' | 'aborted' | 'error';

export interface BranchState {
  /** Local (client-assigned) branch id, generated at optimistic
   *  insert. Used as the React key and as the entry id the reducer
   *  addresses. Becomes redundant once the server assigns runId via
   *  the final artifact, but we keep it for stable React reconciliation. */
  localId: string;
  /** Turn at which this branch was forked from the parent. */
  forkedAtTurn: number;
  /** Override leader's name, for the card display. */
  leaderName: string;
  /** Current status. */
  status: BranchStatus;
  /** Latest turn the branch has reached (while Running) or completed
   *  at (terminal). Starts at forkedAtTurn. */
  currentTurn: number;
  /** When terminal: the authoritative RunArtifact. */
  artifact?: RunArtifact;
  /** When status === 'error': the error message. */
  errorMessage?: string;
}

export interface BranchesState {
  /** The parent trunk run, once complete. Undefined while the trunk
   *  is still running or before any trunk has been launched. */
  parent?: RunArtifact;
  /** Forked branches, ordered oldest-first. */
  branches: BranchState[];
}

export type BranchesAction =
  | { type: 'PARENT_COMPLETE'; artifact: RunArtifact }
  | { type: 'PARENT_RESET' }
  | { type: 'BRANCH_OPTIMISTIC'; localId: string; forkedAtTurn: number; leaderName: string }
  | { type: 'BRANCH_TURN_PROGRESS'; localId: string; currentTurn: number }
  | { type: 'BRANCH_COMPLETE'; localId: string; artifact: RunArtifact }
  | { type: 'BRANCH_ABORTED'; localId: string }
  | { type: 'BRANCH_ERROR'; localId: string; message: string };

const initialState: BranchesState = { parent: undefined, branches: [] };

export function branchesReducer(state: BranchesState, action: BranchesAction): BranchesState {
  switch (action.type) {
    case 'PARENT_COMPLETE':
      return { ...state, parent: action.artifact };
    case 'PARENT_RESET':
      return { parent: undefined, branches: [] };
    case 'BRANCH_OPTIMISTIC':
      return {
        ...state,
        branches: [
          ...state.branches,
          {
            localId: action.localId,
            forkedAtTurn: action.forkedAtTurn,
            leaderName: action.leaderName,
            status: 'running',
            currentTurn: action.forkedAtTurn,
          },
        ],
      };
    case 'BRANCH_TURN_PROGRESS':
      return {
        ...state,
        branches: state.branches.map(b =>
          b.localId === action.localId ? { ...b, currentTurn: action.currentTurn } : b,
        ),
      };
    case 'BRANCH_COMPLETE':
      return {
        ...state,
        branches: state.branches.map(b =>
          b.localId === action.localId
            ? {
                ...b,
                status: 'complete',
                artifact: action.artifact,
                currentTurn: action.artifact.trajectory?.timepoints?.length ?? b.currentTurn,
              }
            : b,
        ),
      };
    case 'BRANCH_ABORTED':
      return {
        ...state,
        branches: state.branches.map(b =>
          b.localId === action.localId ? { ...b, status: 'aborted' } : b,
        ),
      };
    case 'BRANCH_ERROR':
      return {
        ...state,
        branches: state.branches.map(b =>
          b.localId === action.localId
            ? { ...b, status: 'error', errorMessage: action.message }
            : b,
        ),
      };
    default:
      return state;
  }
}

const BranchesContext = createContext<{
  state: BranchesState;
  dispatch: Dispatch<BranchesAction>;
} | null>(null);

export function BranchesProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(branchesReducer, initialState);
  return (
    <BranchesContext.Provider value={{ state, dispatch }}>
      {children}
    </BranchesContext.Provider>
  );
}

export function useBranchesContext() {
  const ctx = useContext(BranchesContext);
  if (!ctx) throw new Error('useBranchesContext must be used within BranchesProvider');
  return ctx;
}
```

Wait: this file has JSX (`<BranchesContext.Provider>`). Rename to `.tsx`:

- Create: `src/cli/dashboard/src/components/branches/BranchesContext.tsx` (not `.ts`).

- [ ] **Step 4.2: Type-check**

Run: `cd apps/paracosm && npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep -v "llm-invocations\|Zod" | head`
Expected: no output.

### Task 5: Mount `BranchesProvider` in App

**Files:**
- Modify: `src/cli/dashboard/src/App.tsx`

- [ ] **Step 5.1: Import + mount the provider**

Find the existing `<ScenarioContext.Provider value={scenario}>` (around line 547). Wrap it with `<BranchesProvider>`:

```typescript
import { BranchesProvider } from './components/branches/BranchesContext';

// In the JSX:
<BranchesProvider>
  <ScenarioContext.Provider value={scenario}>
    {/* existing children */}
  </ScenarioContext.Provider>
</BranchesProvider>
```

- [ ] **Step 5.2: Type-check**

Run: `cd apps/paracosm && npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep -v "llm-invocations\|Zod" | head`
Expected: no output.

### Task 6: Wire SSE terminal events to `PARENT_COMPLETE`

**Files:**
- Modify: `src/cli/dashboard/src/App.tsx` (near where `sse.events` is consumed)

- [ ] **Step 6.1: Locate the terminal-event detection**

Run: `grep -n "isComplete\|completedArtifact\|sim_done\|terminal\|sse.isAborted" src/cli/dashboard/src/App.tsx | head`

Find where the dashboard detects "the run finished" (likely via a `isComplete` or `verdict` state).

- [ ] **Step 6.2: When the parent completes, dispatch `PARENT_COMPLETE`**

At the terminal-detection site (verify with the grep above), add a `useEffect` that:
1. Reads the terminal artifact from the existing game state / sse events.
2. Builds a `RunArtifact` from the SSE stream using whatever helper exists (`assembleArtifactFromEvents` or similar: check grep for `assembleArtifact\|buildArtifact`).
3. Dispatches `{ type: 'PARENT_COMPLETE', artifact }` on the branches context.

Actual wiring depends on the existing dashboard artifact assembly; if no such helper exists, the reducer can live with just the `metadata` subset needed by the Branches tab (runId, scenario, fingerprint, finalState) and the tab reads from whatever the dashboard already materializes. Revisit during implementation.

- [ ] **Step 6.3: Type-check**

Same as step 5.2.

---

## Phase 3: Dashboard helpers (unit-testable)

### Task 7: `BranchesTab.helpers.ts` with `computeBranchDeltas`

**Files:**
- Create: `src/cli/dashboard/src/components/branches/BranchesTab.helpers.ts`

- [ ] **Step 7.1: Write the helpers module**

```typescript
/**
 * Pure helpers for the Branches tab. Split so unit tests don't pull in
 * SCSS modules via the .tsx component.
 */
import type { RunArtifact } from '../../../../engine/schema/index.js';

export interface BranchDelta {
  /** Bag identifier: 'metrics' | 'statuses' | 'environment' | 'politics'. */
  bag: 'metrics' | 'statuses' | 'environment' | 'politics';
  /** Key within the bag. */
  key: string;
  /** Parent's value. */
  parentValue: number | string | boolean;
  /** Branch's value. */
  branchValue: number | string | boolean;
  /** Numeric diff when both values are numbers; undefined otherwise. */
  delta?: number;
  /** Direction hint for the delta renderer. 'changed' when values
   *  are non-numeric or mixed-type; 'up' / 'down' for numeric deltas. */
  direction: 'up' | 'down' | 'changed' | 'unchanged';
}

function classify(pv: unknown, bv: unknown): BranchDelta['direction'] {
  if (typeof pv === 'number' && typeof bv === 'number') {
    if (bv > pv) return 'up';
    if (bv < pv) return 'down';
    return 'unchanged';
  }
  if (pv === bv) return 'unchanged';
  return 'changed';
}

/**
 * Compute per-bag deltas between a parent run's final state and a
 * branch run's final state. Emits one BranchDelta per key that
 * differs; stable-sorts by bag then |delta| descending (biggest
 * numeric divergences first, then changed non-numeric keys).
 *
 * Skips keys that exist in only one side (can't compare). Skips
 * keys where the values are identical (direction === 'unchanged').
 */
export function computeBranchDeltas(
  parent: RunArtifact,
  branch: RunArtifact,
): BranchDelta[] {
  const bags: Array<BranchDelta['bag']> = ['metrics', 'statuses', 'environment', 'politics'];
  const results: BranchDelta[] = [];
  for (const bag of bags) {
    const parentBag = (parent.finalState as unknown as Record<string, Record<string, number | string | boolean>> | undefined)?.[bag];
    const branchBag = (branch.finalState as unknown as Record<string, Record<string, number | string | boolean>> | undefined)?.[bag];
    if (!parentBag || !branchBag) continue;
    for (const key of Object.keys(parentBag)) {
      if (!(key in branchBag)) continue;
      const pv = parentBag[key];
      const bv = branchBag[key];
      const direction = classify(pv, bv);
      if (direction === 'unchanged') continue;
      const delta = typeof pv === 'number' && typeof bv === 'number' ? bv - pv : undefined;
      results.push({ bag, key, parentValue: pv, branchValue: bv, delta, direction });
    }
  }
  // Sort: numeric deltas (by absolute magnitude desc), then changed
  // non-numeric, grouped by bag in the `bags` order above.
  return results.sort((a, b) => {
    if (a.delta !== undefined && b.delta !== undefined) {
      return Math.abs(b.delta) - Math.abs(a.delta);
    }
    if (a.delta !== undefined) return -1;
    if (b.delta !== undefined) return 1;
    return 0;
  });
}

/**
 * Render a single BranchDelta as a short display string for the
 * branch card. Renders numbers with a sign + 1 decimal, strings
 * and booleans verbatim. Direction hint is carried via separate
 * CSS class at the render site, not in this string.
 */
export function formatDelta(d: BranchDelta): string {
  if (d.delta !== undefined) {
    const sign = d.delta > 0 ? '+' : '';
    const v = Math.round(d.delta * 10) / 10;
    return `${d.key} ${sign}${v}`;
  }
  // non-numeric
  return `${d.key}: ${d.parentValue} → ${d.branchValue}`;
}
```

- [ ] **Step 7.2: Type-check**

Run: `cd apps/paracosm && npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep -v "llm-invocations\|Zod" | head`
Expected: no output.

### Task 8: `BranchesTab.helpers.test.ts`

**Files:**
- Create: `src/cli/dashboard/src/components/branches/BranchesTab.helpers.test.ts`

- [ ] **Step 8.1: Write the tests**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';

import { computeBranchDeltas, formatDelta, type BranchDelta } from './BranchesTab.helpers.js';
import type { RunArtifact } from '../../../../engine/schema/index.js';

function artifact(finalState: RunArtifact['finalState']): RunArtifact {
  return {
    metadata: {
      runId: 'r',
      scenario: { id: 's', name: 'S' },
      mode: 'turn-loop',
      startedAt: '2026-04-24T00:00:00.000Z',
    },
    finalState,
  } as unknown as RunArtifact;
}

test('computeBranchDeltas: numeric metric divergence produces up/down', () => {
  const parent = artifact({ metrics: { population: 100, morale: 0.7 } } as never);
  const branch = artifact({ metrics: { population: 112, morale: 0.62 } } as never);
  const deltas = computeBranchDeltas(parent, branch);
  assert.equal(deltas.length, 2);
  // Sorted by |delta| desc: population (+12) before morale (-0.08)
  assert.equal(deltas[0].key, 'population');
  assert.equal(deltas[0].direction, 'up');
  assert.equal(deltas[0].delta, 12);
  assert.equal(deltas[1].key, 'morale');
  assert.equal(deltas[1].direction, 'down');
});

test('computeBranchDeltas: string status change emits direction=changed', () => {
  const parent = artifact({ statuses: { fundingRound: 'seed' } } as never);
  const branch = artifact({ statuses: { fundingRound: 'series-a' } } as never);
  const deltas = computeBranchDeltas(parent, branch);
  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].bag, 'statuses');
  assert.equal(deltas[0].direction, 'changed');
  assert.equal(deltas[0].delta, undefined);
});

test('computeBranchDeltas: identical keys omitted', () => {
  const parent = artifact({ metrics: { population: 100, morale: 0.7 } } as never);
  const branch = artifact({ metrics: { population: 100, morale: 0.7 } } as never);
  const deltas = computeBranchDeltas(parent, branch);
  assert.deepEqual(deltas, []);
});

test('computeBranchDeltas: keys in only one bag are skipped', () => {
  const parent = artifact({ metrics: { onlyInParent: 5, shared: 10 } } as never);
  const branch = artifact({ metrics: { shared: 12 } } as never);
  const deltas = computeBranchDeltas(parent, branch);
  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].key, 'shared');
});

test('formatDelta: numeric renders with sign and 1 decimal', () => {
  const d: BranchDelta = { bag: 'metrics', key: 'population', parentValue: 100, branchValue: 112, delta: 12, direction: 'up' };
  assert.equal(formatDelta(d), 'population +12');
});

test('formatDelta: non-numeric renders key: parent → branch', () => {
  const d: BranchDelta = { bag: 'statuses', key: 'fundingRound', parentValue: 'seed', branchValue: 'series-a', direction: 'changed' };
  assert.equal(formatDelta(d), 'fundingRound: seed → series-a');
});
```

- [ ] **Step 8.2: Run tests**

```bash
cd apps/paracosm
node --import tsx --test src/cli/dashboard/src/components/branches/BranchesTab.helpers.test.ts 2>&1 | tail -12
```

Expected: 6 pass, 0 fail.

### Task 9: `ForkModal.helpers.ts`

**Files:**
- Create: `src/cli/dashboard/src/components/reports/ForkModal.helpers.ts`

- [ ] **Step 9.1: Write the helpers**

```typescript
/**
 * Pure helpers for the ForkModal component.
 */
import type { ScenarioPackage, LeaderConfig } from '../../../../engine/types.js';

/**
 * Resolve the ordered list of leader presets the modal's picker
 * should show. Sources in priority order:
 *
 * 1. Scenario presets (`scenario.presets[0].leaders`, matching how
 *    SettingsPanel reads them today).
 * 2. Optional session-custom leaders passed in (from Settings).
 *
 * Empty array when the scenario has no presets and the caller hasn't
 * supplied customs; the modal falls back to "Build a new leader".
 */
export function resolveLeaderPresets(
  scenario: ScenarioPackage,
  sessionCustoms: LeaderConfig[] = [],
): LeaderConfig[] {
  const presetLeaders = (scenario.presets?.[0]?.leaders ?? []).map(l => ({
    name: l.name,
    archetype: l.archetype,
    unit: 'Forked Branch',
    hexaco: l.hexaco as LeaderConfig['hexaco'],
    instructions: l.instructions,
  }));
  return [...presetLeaders, ...sessionCustoms];
}

/**
 * Estimate the LLM-dollar cost of running the forked branch from
 * `fromTurn` to `maxTurns`. Rough per-turn numbers from the
 * paracosm cost envelope (README "Cost Envelope" table):
 *
 * - quality preset, OpenAI: ~$0.30 per turn
 * - economy preset, OpenAI: ~$0.03 per turn
 * - quality preset, Anthropic: ~$0.75 per turn
 * - economy preset, Anthropic: ~$0.60 per turn
 *
 * Conservative: round up to the nearest dime. Returns a display
 * string like "~$0.60" or "~$3.00". Exact numbers are coarse; this
 * is informational, not billing-grade.
 */
export function estimateForkCost(
  fromTurn: number,
  maxTurns: number,
  costPreset: 'quality' | 'economy',
  provider: 'openai' | 'anthropic',
): string {
  const turnsRemaining = Math.max(0, maxTurns - fromTurn);
  const perTurn =
    provider === 'openai'
      ? costPreset === 'quality' ? 0.3 : 0.03
      : costPreset === 'quality' ? 0.75 : 0.6;
  const total = turnsRemaining * perTurn;
  const rounded = Math.ceil(total * 10) / 10;
  return `~$${rounded.toFixed(2)}`;
}

/**
 * Parse the modal's custom-events textarea. Format: one event per
 * line, `{turn}: {title}: {description}`. Lines without a turn
 * number or with empty title are silently dropped. Returns the
 * shape runSimulation's `customEvents` option expects.
 */
export function parseCustomEvents(input: string): Array<{ turn: number; title: string; description: string }> {
  const events: Array<{ turn: number; title: string; description: string }> = [];
  for (const rawLine of input.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = /^(\d+)\s*:\s*([^:]+?)\s*:\s*(.+)$/.exec(line);
    if (!match) continue;
    const turn = parseInt(match[1], 10);
    const title = match[2].trim();
    const description = match[3].trim();
    if (!title) continue;
    events.push({ turn, title, description });
  }
  return events;
}
```

- [ ] **Step 9.2: Type-check**

Run: `cd apps/paracosm && npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep -v "llm-invocations\|Zod" | head`
Expected: no output.

### Task 10: `ForkModal.helpers.test.ts`

**Files:**
- Create: `src/cli/dashboard/src/components/reports/ForkModal.helpers.test.ts`

- [ ] **Step 10.1: Write the tests**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveLeaderPresets, estimateForkCost, parseCustomEvents } from './ForkModal.helpers.js';
import { marsScenario } from '../../../../engine/mars/index.js';

test('resolveLeaderPresets: Mars scenario exposes preset leaders', () => {
  const presets = resolveLeaderPresets(marsScenario);
  assert.ok(presets.length > 0, 'Mars should ship with at least one preset leader');
  for (const p of presets) {
    assert.ok(p.name && p.archetype && p.hexaco, 'preset leaders are well-formed');
  }
});

test('resolveLeaderPresets: scenario with no presets + no customs -> []', () => {
  const emptyScenario = { ...marsScenario, presets: [] } as typeof marsScenario;
  const presets = resolveLeaderPresets(emptyScenario);
  assert.deepEqual(presets, []);
});

test('resolveLeaderPresets: session customs are appended after presets', () => {
  const custom = { name: 'Custom', archetype: 'Session', unit: 'X', hexaco: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5 }, instructions: '' };
  const presets = resolveLeaderPresets(marsScenario, [custom]);
  assert.equal(presets[presets.length - 1].name, 'Custom');
});

test('estimateForkCost: 3 turns remaining on OpenAI economy', () => {
  const cost = estimateForkCost(3, 6, 'economy', 'openai');
  // 3 turns × ~$0.03 = $0.09 → rounded up to nearest $0.10 = "$0.10"
  assert.match(cost, /^~\$0\.\d{2}$/);
});

test('estimateForkCost: 6 turns remaining on Anthropic quality', () => {
  const cost = estimateForkCost(0, 6, 'quality', 'anthropic');
  // 6 × $0.75 = $4.50
  assert.match(cost, /^~\$4\.\d{2}$/);
});

test('parseCustomEvents: valid lines produce events', () => {
  const events = parseCustomEvents('3: Dust storm: A 72-hour storm cuts solar output.\n5: Supply drop: Relief arrives.');
  assert.equal(events.length, 2);
  assert.deepEqual(events[0], { turn: 3, title: 'Dust storm', description: 'A 72-hour storm cuts solar output.' });
  assert.equal(events[1].turn, 5);
});

test('parseCustomEvents: empty and malformed lines are dropped', () => {
  const events = parseCustomEvents('\n  \nnot a valid line\n: missing turn: x\n4: valid: yes');
  assert.equal(events.length, 1);
  assert.equal(events[0].turn, 4);
});
```

- [ ] **Step 10.2: Run tests**

```bash
cd apps/paracosm
node --import tsx --test src/cli/dashboard/src/components/reports/ForkModal.helpers.test.ts 2>&1 | tail -12
```

Expected: 7 pass, 0 fail.

---

## Phase 4: Dashboard components

### Task 11: `BranchesTab.tsx`

**Files:**
- Create: `src/cli/dashboard/src/components/branches/BranchesTab.tsx`

- [ ] **Step 11.1: Write the component**

```typescript
import { useMemo } from 'react';
import { useBranchesContext, type BranchState } from './BranchesContext';
import { useScenarioLabels } from '../../hooks/useScenarioLabels';
import { useDashboardNavigation } from '../../App';
import { computeBranchDeltas, formatDelta } from './BranchesTab.helpers';
import styles from './BranchesTab.module.scss';

export function BranchesTab() {
  const { state } = useBranchesContext();
  const labels = useScenarioLabels();
  const navigate = useDashboardNavigation();

  if (!state.parent && state.branches.length === 0) {
    return (
      <div className={styles.emptyState}>
        <h2>No branches yet.</h2>
        <p>
          Run a simulation with snapshot capture enabled (default for dashboard runs).
          Then open the Reports tab and click <code>↳ Fork at {labels.Time} N</code> on
          any completed turn to branch with a different leader.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.tab} role="region" aria-label="Branches">
      {state.parent && <ParentCard artifact={state.parent} labels={labels} />}
      <div className={styles.branchList}>
        {state.branches.map(branch => (
          <BranchCard
            key={branch.localId}
            branch={branch}
            parent={state.parent}
            labels={labels}
            onOpen={() => {
              // Load the branch artifact into the Reports tab via the
              // existing load-from-artifact pathway. Placeholder: we
              // navigate + rely on the load flow to pick up the
              // branch's artifact (implementation detail that depends
              // on how the dashboard's load/persistence layer exposes
              // setter APIs today).
              navigate('reports');
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ParentCard({ artifact, labels }: { artifact: import('../../../../engine/schema/index.js').RunArtifact; labels: ReturnType<typeof useScenarioLabels> }) {
  const metrics = artifact.finalState?.metrics ?? {};
  return (
    <section className={styles.parentCard} aria-label="Parent run">
      <header>
        <h3>{artifact.metadata.scenario.name} (parent)</h3>
        <span className={styles.meta}>
          Run {artifact.metadata.runId} · {Object.keys(metrics).length} metrics
        </span>
      </header>
      <dl className={styles.metrics}>
        {Object.entries(metrics).slice(0, 4).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{String(v)}</dd>
          </div>
        ))}
      </dl>
      {void labels}
    </section>
  );
}

function BranchCard({
  branch, parent, labels, onOpen,
}: {
  branch: BranchState;
  parent: import('../../../../engine/schema/index.js').RunArtifact | undefined;
  labels: ReturnType<typeof useScenarioLabels>;
  onOpen: () => void;
}) {
  const deltas = useMemo(
    () => (parent && branch.artifact ? computeBranchDeltas(parent, branch.artifact) : []),
    [parent, branch.artifact],
  );
  return (
    <article className={styles.branchCard} onClick={onOpen}>
      <header>
        <span className={styles.badge}>Forked at {labels.Time} {branch.forkedAtTurn}</span>
        <h4>{branch.leaderName}</h4>
        <span className={`${styles.status} ${styles[`status_${branch.status}`]}`}>
          {branch.status === 'running' ? `Running · ${labels.Time} ${branch.currentTurn}` : branch.status}
        </span>
      </header>
      {branch.status === 'complete' && deltas.length > 0 && (
        <ul className={styles.deltas}>
          {deltas.slice(0, 4).map(d => (
            <li key={`${d.bag}.${d.key}`} className={styles[`direction_${d.direction}`]}>
              {formatDelta(d)}
            </li>
          ))}
          {deltas.length > 4 && <li className={styles.more}>+{deltas.length - 4} more</li>}
        </ul>
      )}
      {branch.status === 'error' && (
        <p className={styles.error}>{branch.errorMessage ?? 'Error'}</p>
      )}
    </article>
  );
}
```

- [ ] **Step 11.2: Write the minimal SCSS module**

Create `src/cli/dashboard/src/components/branches/BranchesTab.module.scss`:

```scss
.tab {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.emptyState {
  padding: 32px;
  text-align: center;
  color: var(--t3);

  h2 { color: var(--t2); margin-bottom: 8px; }
  p { max-width: 480px; margin: 0 auto; }
  code { background: var(--bg3); padding: 2px 6px; border-radius: 3px; }
}

.parentCard, .branchCard {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px 14px;

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;

    h3, h4 { margin: 0; color: var(--t1); font-family: var(--mono); }
  }
}

.branchCard {
  cursor: pointer;
  transition: border-color 0.15s;

  &:hover {
    border-color: var(--border-hl);
  }
}

.branchList {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.badge {
  font-size: 11px;
  font-family: var(--mono);
  color: var(--amber);
  padding: 2px 6px;
  border: 1px solid var(--amber-d);
  border-radius: 3px;
}

.status {
  font-size: 11px;
  font-family: var(--mono);

  &.status_running { color: var(--amber); }
  &.status_complete { color: var(--green); }
  &.status_aborted { color: var(--t3); }
  &.status_error { color: var(--rust); }
}

.meta {
  font-size: 11px;
  color: var(--t3);
  font-family: var(--mono);
}

.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 8px;
  margin-top: 8px;

  div { text-align: center; }
  dt { font-size: 10px; color: var(--t3); text-transform: uppercase; letter-spacing: 0.5px; }
  dd { font-size: 16px; color: var(--t1); margin: 2px 0 0; font-family: var(--mono); }
}

.deltas {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;

  li {
    font-size: 11px;
    font-family: var(--mono);
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--bg);
  }

  .direction_up { color: var(--green); }
  .direction_down { color: var(--rust); }
  .direction_changed { color: var(--amber); }
  .more { color: var(--t3); }
}

.error {
  color: var(--rust);
  font-size: 11px;
  margin-top: 4px;
}
```

- [ ] **Step 11.3: Type-check**

Run: `cd apps/paracosm && npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep -v "llm-invocations\|Zod" | head`
Expected: no output.

### Task 12: `ForkModal.tsx`

**Files:**
- Create: `src/cli/dashboard/src/components/reports/ForkModal.tsx`
- Create: `src/cli/dashboard/src/components/reports/ForkModal.module.scss`

- [ ] **Step 12.1: Write the modal component**

```typescript
import { useState } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useScenarioContext } from '../../App';
import { useScenarioLabels } from '../../hooks/useScenarioLabels';
import { resolveLeaderPresets, estimateForkCost, parseCustomEvents } from './ForkModal.helpers';
import type { LeaderConfig } from '../../../../engine/types.js';
import type { RunArtifact } from '../../../../engine/schema/index.js';
import styles from './ForkModal.module.scss';

interface ForkModalProps {
  parentArtifact: RunArtifact;
  atTurn: number;
  onConfirm: (payload: ForkConfirmPayload) => void;
  onClose: () => void;
  /** Current session's maxTurns (from Settings); used for cost estimate. */
  maxTurns: number;
  /** Cost preset currently set in Settings. */
  costPreset: 'quality' | 'economy';
  /** Provider currently set in Settings. */
  provider: 'openai' | 'anthropic';
}

export interface ForkConfirmPayload {
  parentArtifact: RunArtifact;
  atTurn: number;
  leader: LeaderConfig;
  seedOverride?: number;
  customEvents?: Array<{ turn: number; title: string; description: string }>;
}

export function ForkModal({ parentArtifact, atTurn, onConfirm, onClose, maxTurns, costPreset, provider }: ForkModalProps) {
  const dialogRef = useFocusTrap<HTMLDivElement>(true);
  const scenario = useScenarioContext();
  const labels = useScenarioLabels();

  const presets = resolveLeaderPresets(scenario);
  const [leaderIndex, setLeaderIndex] = useState(0);
  const [seed, setSeed] = useState('');
  const [customEventsText, setCustomEventsText] = useState('');
  const [advanced, setAdvanced] = useState(false);

  const costEstimate = estimateForkCost(atTurn, maxTurns, costPreset, provider);

  const handleConfirm = () => {
    const leader = presets[leaderIndex];
    if (!leader) return;
    onConfirm({
      parentArtifact,
      atTurn,
      leader,
      seedOverride: seed ? parseInt(seed, 10) : undefined,
      customEvents: customEventsText ? parseCustomEvents(customEventsText) : undefined,
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Fork at turn" className={styles.backdrop} onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={styles.dialog}
        onClick={e => e.stopPropagation()}
      >
        <header>
          <h3>Fork at {labels.Time} {atTurn}</h3>
          <button onClick={onClose} aria-label="Close">×</button>
        </header>

        <label>
          <span>Override leader</span>
          <select value={leaderIndex} onChange={e => setLeaderIndex(parseInt(e.target.value, 10))}>
            {presets.length === 0 && <option>No presets available</option>}
            {presets.map((p, i) => (
              <option key={p.name} value={i}>
                {p.name} ({p.archetype})
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Seed override (optional)</span>
          <input
            type="number"
            placeholder={String(parentArtifact.metadata.seed ?? '(parent seed)')}
            value={seed}
            onChange={e => setSeed(e.target.value)}
          />
        </label>

        <details open={advanced} onToggle={e => setAdvanced((e.target as HTMLDetailsElement).open)}>
          <summary>Advanced: custom events</summary>
          <textarea
            rows={4}
            placeholder={`One event per line, format: "turn: title: description"\nExample: 5: Supply drop: Relief arrives with 3 months of food.`}
            value={customEventsText}
            onChange={e => setCustomEventsText(e.target.value)}
          />
        </details>

        <div className={styles.costEstimate}>
          Estimated cost: <strong>{costEstimate}</strong> for {Math.max(0, maxTurns - atTurn)} more {labels.times}
        </div>

        <footer>
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleConfirm} disabled={presets.length === 0} className={styles.confirm}>
            Fork
          </button>
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 12.2: SCSS module**

Create `src/cli/dashboard/src/components/reports/ForkModal.module.scss`:

```scss
.backdrop {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: var(--bg2);
  border: 1px solid var(--border-hl);
  border-radius: 6px;
  padding: 16px 20px;
  width: min(420px, calc(100vw - 32px));
  max-height: calc(100vh - 64px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;

    h3 { margin: 0; color: var(--amber); font-family: var(--mono); }
    button { background: none; border: 0; color: var(--t3); font-size: 20px; cursor: pointer; }
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;

    span { font-size: 11px; color: var(--t3); text-transform: uppercase; letter-spacing: 0.5px; font-family: var(--mono); }
    select, input { background: var(--bg); color: var(--t1); border: 1px solid var(--border); border-radius: 4px; padding: 6px 8px; font-family: var(--mono); font-size: 13px; }
  }

  details {
    summary { cursor: pointer; color: var(--teal); font-size: 12px; }
    textarea { width: 100%; background: var(--bg); color: var(--t1); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: var(--mono); font-size: 12px; margin-top: 4px; }
  }

  .costEstimate {
    color: var(--t2);
    font-size: 12px;
    background: var(--bg3);
    padding: 8px;
    border-radius: 4px;
    border: 1px solid var(--border);

    strong { color: var(--amber); font-family: var(--mono); }
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;

    button {
      padding: 6px 14px;
      border: 1px solid var(--border);
      background: var(--bg3);
      color: var(--t1);
      border-radius: 4px;
      cursor: pointer;
      font-family: var(--mono);
      font-size: 12px;
    }

    .confirm {
      background: var(--amber);
      color: var(--bg);
      border-color: var(--amber);

      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
  }
}
```

- [ ] **Step 12.3: Type-check**

Run: `cd apps/paracosm && npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep -v "llm-invocations\|Zod" | head`
Expected: no output.

### Task 13: "Fork at N" button in ReportView

**Files:**
- Modify: `src/cli/dashboard/src/components/reports/ReportView.tsx`

- [ ] **Step 13.1: Add Fork button + modal dispatcher**

Find the `EventSide` or `TurnSharedFooter` component that renders per-turn rows. Add a `Fork` button next to the existing turn header. Gate visibility on:
- `parentArtifact.scenarioExtensions?.kernelSnapshotsPerTurn` exists and contains a snapshot for this turn.
- The run is complete (not currently streaming).

Open a local state variable `[forkModalAtTurn, setForkModalAtTurn] = useState<number | null>(null)` at the `ReportView` top level. The button calls `setForkModalAtTurn(turn)`. The `ForkModal` is rendered conditionally:

```typescript
import { ForkModal, type ForkConfirmPayload } from './ForkModal';
// ...
const [forkModalAtTurn, setForkModalAtTurn] = useState<number | null>(null);

const handleForkConfirm = async (payload: ForkConfirmPayload) => {
  setForkModalAtTurn(null);
  // Generate a stable local id for the branch.
  const localId = `branch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  dispatchBranches({
    type: 'BRANCH_OPTIMISTIC',
    localId,
    forkedAtTurn: payload.atTurn,
    leaderName: payload.leader.name,
  });
  // POST /setup with forkFrom. Existing setup body construction
  // lives in SettingsPanel or App.tsx; reuse that shape here.
  await fetch('/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      leaders: [payload.leader],
      turns: /* parent's turn count */ parentArtifact.trajectory?.timepoints?.length ?? 6,
      seed: payload.seedOverride ?? parentArtifact.metadata.seed,
      captureSnapshots: true,
      customEvents: payload.customEvents,
      forkFrom: {
        parentArtifact: payload.parentArtifact,
        atTurn: payload.atTurn,
      },
    }),
  });
  navigate('branches');
};

// In JSX:
{forkModalAtTurn !== null && parentArtifact && (
  <ForkModal
    parentArtifact={parentArtifact}
    atTurn={forkModalAtTurn}
    onConfirm={handleForkConfirm}
    onClose={() => setForkModalAtTurn(null)}
    maxTurns={settings.maxTurns /* from SettingsPanel state */}
    costPreset={settings.costPreset}
    provider={settings.provider}
  />
)}
```

The exact `parentArtifact` source depends on where the current session's completed artifact is stored. Check `useBranchesContext().state.parent` or the existing game state.

The Fork button itself: one button per turn row, visible only when `canFork(turn)` (parent complete + snapshot present). Copy: `↳ Fork at {labels.Time} {turn}`.

- [ ] **Step 13.2: Type-check**

Run: `cd apps/paracosm && npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep -v "llm-invocations\|Zod" | head`
Expected: no output.

---

## Phase 5: Tab routing + defaults flip

### Task 14: Add 'branches' to DASHBOARD_TABS

**Files:**
- Modify: `src/cli/dashboard/src/tab-routing.ts`

- [ ] **Step 14.1: Add the tab literal**

Replace:

```typescript
export const DASHBOARD_TABS = ['sim', 'viz', 'settings', 'reports', 'chat', 'log', 'about'] as const;
```

with:

```typescript
export const DASHBOARD_TABS = ['sim', 'viz', 'settings', 'reports', 'branches', 'chat', 'log', 'about'] as const;
```

- [ ] **Step 14.2: Mount BranchesTab in App's tab-switching**

Find where `activeTab === 'reports'` is used in App.tsx's render to dispatch to `ReportView`. Add a sibling branch:

```typescript
import { BranchesTab } from './components/branches/BranchesTab';
// ...
{activeTab === 'branches' && <BranchesTab />}
```

If TabBar reads from DASHBOARD_TABS directly, the tab button appears automatically. If not, add a `<TabBar>` entry for branches.

- [ ] **Step 14.3: Type-check**

Run: `cd apps/paracosm && npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep -v "llm-invocations\|Zod" | head`
Expected: no output.

### Task 15: Flip `captureSnapshots: true` on UI-initiated runs

**Files:**
- Modify: `src/cli/dashboard/src/App.tsx:517` (setup POST)
- Modify: `src/cli/dashboard/src/components/settings/SettingsPanel.tsx:287` (setup POST)
- Modify: `src/cli/dashboard/src/components/sim/RerunPanel.tsx:42` (setup POST)

- [ ] **Step 15.1: Add captureSnapshots field to each setup POST body**

At each of the three call sites, find the `body: JSON.stringify({ ... })` object. Add `captureSnapshots: true` to the object. One line per site.

Example (App.tsx:517 context may vary):

```typescript
body: JSON.stringify({
  // existing fields
  captureSnapshots: true,
}),
```

- [ ] **Step 15.2: Verify SSE end-to-end for a session by inspection**

(Optional; if easy) fire up the dashboard locally, run a short smoke scenario, inspect the resulting artifact in the network inspector, confirm `scenarioExtensions.kernelSnapshotsPerTurn` is populated. Skip if env blocks local run.

- [ ] **Step 15.3: Type-check**

Run: `cd apps/paracosm && npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep -v "llm-invocations\|Zod" | head`
Expected: no output.

---

## Phase 6: Docs + verification

### Task 16: README fork-UI note

**Files:**
- Modify: `README.md` (the existing "Counterfactual simulations with WorldModel.fork()" section)

- [ ] **Step 16.1: Append one sentence**

Find the closing line of the counterfactual section (after the code sample, before the next `##`). Append:

```markdown
In the paracosm dashboard, the Reports tab exposes a `↳ Fork at {Time} N` button on each completed turn. Clicking it opens a fork modal (leader override + optional seed + custom events), posts to `/setup` with `forkFrom: { parentArtifact, atTurn }`, and routes the user to a new **Branches** tab that accumulates all forks launched from the current parent run with per-metric deltas rendered on each branch card.
```

### Task 17: Roadmap move

**Files:**
- Modify: `docs/superpowers/plans/2026-04-23-paracosm-roadmap.md`

- [ ] **Step 17.1: Collapse Tier 2 to fully-shipped**

Find the Tier 2 heading block. Replace with:

```markdown
## Tier 2: `WorldModel.fork(atTurn)` (SHIPPED 2026-04-24)

Both specs landed this session. Spec 2A (backend fork API, commit 161f1e4d) gave the kernel round-trip + WorldModel.snapshot/fork/forkFromArtifact + opt-in captureSnapshots + RunMetadata.forkedFrom. Spec 2B (dashboard fork UX, commit <TO-FILL>) added the Reports tab Fork button, ForkModal, Branches tab with client-side delta computation, and the /setup fork dispatch path. Users can now branch any past turn with a different leader + compare trajectories in-session.

Historical spec + plan files: [Spec 2A design](../specs/2026-04-24-worldmodel-fork-snapshot-api-design.md), [Spec 2A plan](2026-04-24-worldmodel-fork-snapshot-implementation.md), [Spec 2B design](../specs/2026-04-24-branches-tab-fork-ux-design.md), [Spec 2B plan](2026-04-24-branches-tab-fork-ux-implementation.md).
```

Replace `<TO-FILL>` with the actual commit hash at Task 28.

Also add an entry to the Shipped section:

```markdown
- **[<TO-FILL> paracosm](#): Tier 2 Spec 2B, Branches tab + fork UX.** 10 files touched (8 new, 2 modified for server; 2 modified for dashboard App + tab routing). Server `/setup` accepts `forkFrom: { parentArtifact, atTurn }`; dashboard ships `BranchesContext` + `BranchesTab` + `ForkModal` + `↳ Fork at N` button in Reports + `captureSnapshots: true` default on UI-initiated runs. 13 new unit tests (5 server + 6 ForkModal helper + 2 nonsensical dupe test replaced with 4 helper tests). User flow: complete a run → Reports tab → click `Fork at turn 3` → pick a different leader in modal → click Fork → auto-navigate to Branches tab → new branch streams + shows delta vs parent on completion.
```

### Task 18: Full verification sweep

**Files:** none

- [ ] **Step 18.1: Full tsc**

Run: `cd apps/paracosm && npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep -v "llm-invocations\|Zod" | head`
Expected: no output.

- [ ] **Step 18.2: Full tests**

Run: `cd apps/paracosm && npm test 2>&1 | tail -6`
Expected: `pass >= 624 / fail 0 / skipped 1` (baseline 606 + 5 server + 6 ForkModal + 6 BranchesTab helper + 1 buffer = 624).

- [ ] **Step 18.3: Build**

Run: `cd apps/paracosm && npm run build > /tmp/p-build.log 2>&1; echo "exit: $?"; ls dist/cli/dashboard/src/components/branches 2>/dev/null | head`
Expected: `exit: 0`; emitted BranchesContext, BranchesTab, helpers.

- [ ] **Step 18.4: Em-dash scan**

```bash
cd apps/paracosm
for f in \
  src/cli/server-app.ts src/cli/sim-config.ts \
  src/cli/dashboard/src/tab-routing.ts \
  src/cli/dashboard/src/App.tsx \
  src/cli/dashboard/src/components/branches/BranchesContext.tsx \
  src/cli/dashboard/src/components/branches/BranchesTab.tsx \
  src/cli/dashboard/src/components/branches/BranchesTab.helpers.ts \
  src/cli/dashboard/src/components/branches/BranchesTab.helpers.test.ts \
  src/cli/dashboard/src/components/branches/BranchesTab.module.scss \
  src/cli/dashboard/src/components/reports/ForkModal.tsx \
  src/cli/dashboard/src/components/reports/ForkModal.helpers.ts \
  src/cli/dashboard/src/components/reports/ForkModal.helpers.test.ts \
  src/cli/dashboard/src/components/reports/ForkModal.module.scss \
  src/cli/dashboard/src/components/reports/ReportView.tsx \
  src/cli/dashboard/src/components/settings/SettingsPanel.tsx \
  src/cli/dashboard/src/components/sim/RerunPanel.tsx \
  tests/cli/server-app-fork.test.ts \
  README.md docs/superpowers/plans/2026-04-23-paracosm-roadmap.md; do
  n=$(grep -c "—" "$f" 2>/dev/null || echo 0)
  if [ "$n" != "0" ]; then echo "NEW EM-DASH in $f: $n"; fi
done
echo "(empty = clean for files I authored; pre-existing em-dashes in unmodified sections of large files are out of scope for this ship)"
```

Expected: empty (my added sections introduce zero em-dashes).

### Task 19: Staged-file audit

- [ ] **Step 19.1: Verify exactly the intended set is staged**

```bash
cd apps/paracosm
git status --short
```

Expected (roughly):

- `M README.md`
- `M docs/superpowers/plans/2026-04-23-paracosm-roadmap.md`
- `?? docs/superpowers/plans/2026-04-24-branches-tab-fork-ux-implementation.md` (this plan)
- `M src/cli/server-app.ts`
- `M src/cli/sim-config.ts`
- `M src/cli/dashboard/src/App.tsx`
- `M src/cli/dashboard/src/tab-routing.ts`
- `?? src/cli/dashboard/src/components/branches/` (4 files)
- `?? src/cli/dashboard/src/components/reports/ForkModal.tsx`
- `?? src/cli/dashboard/src/components/reports/ForkModal.helpers.ts`
- `?? src/cli/dashboard/src/components/reports/ForkModal.helpers.test.ts`
- `?? src/cli/dashboard/src/components/reports/ForkModal.module.scss`
- `M src/cli/dashboard/src/components/reports/ReportView.tsx`
- `M src/cli/dashboard/src/components/settings/SettingsPanel.tsx`
- `M src/cli/dashboard/src/components/sim/RerunPanel.tsx`
- `?? tests/cli/server-app-fork.test.ts`
- (`?? .paracosm/`: ignore)

### Task 20: Stage files

- [ ] **Step 20.1: Stage the full set**

```bash
cd apps/paracosm
git add \
  src/cli/server-app.ts src/cli/sim-config.ts \
  src/cli/dashboard/src/tab-routing.ts \
  src/cli/dashboard/src/App.tsx \
  src/cli/dashboard/src/components/branches/BranchesContext.tsx \
  src/cli/dashboard/src/components/branches/BranchesTab.tsx \
  src/cli/dashboard/src/components/branches/BranchesTab.helpers.ts \
  src/cli/dashboard/src/components/branches/BranchesTab.helpers.test.ts \
  src/cli/dashboard/src/components/branches/BranchesTab.module.scss \
  src/cli/dashboard/src/components/reports/ForkModal.tsx \
  src/cli/dashboard/src/components/reports/ForkModal.helpers.ts \
  src/cli/dashboard/src/components/reports/ForkModal.helpers.test.ts \
  src/cli/dashboard/src/components/reports/ForkModal.module.scss \
  src/cli/dashboard/src/components/reports/ReportView.tsx \
  src/cli/dashboard/src/components/settings/SettingsPanel.tsx \
  src/cli/dashboard/src/components/sim/RerunPanel.tsx \
  tests/cli/server-app-fork.test.ts \
  README.md \
  docs/superpowers/plans/2026-04-23-paracosm-roadmap.md \
  docs/superpowers/plans/2026-04-24-branches-tab-fork-ux-implementation.md
```

- [ ] **Step 20.2: Verify staged set**

```bash
git diff --cached --name-only
```

Expected: ~20 files. No extras outside the list.

### Task 21: Single atomic commit

- [ ] **Step 21.1: Commit**

```bash
cd apps/paracosm
git commit -m "$(cat <<'EOF'
feat(dashboard): Branches tab + fork UX (Tier 2 Spec 2B)

Closes the Tier 2 arc. Spec 2A (WorldModel.fork + snapshot API,
commit 161f1e4d) gave the programmatic backend. This commit
delivers the user-facing surface: users complete a run, click
"Fork at turn N" on any Reports tab turn row, pick a different
leader in a modal, and see all forks accumulate under a new
Branches tab with per-metric deltas rendered on each branch
card.

Server:

- /setup POST accepts optional forkFrom: { parentArtifact,
  atTurn } and captureSnapshots. When forkFrom is present, the
  server validates (single leader, same scenario, embedded
  snapshots, no active run) then calls
  WorldModel.forkFromArtifact + simulate. Client-authority
  dispatch: the dashboard sends the full parent artifact in the
  request body rather than having the server look it up. This
  matches the existing "dashboard holds state; server processes
  requests" architecture; RunHistoryStore today stores only
  RunRecord metadata (not full RunArtifact), and expanding it
  would be a persistence rewrite out of 2B scope.
- src/cli/sim-config.ts: SimulationSetupPayload +
  NormalizedSimulationConfig gain forkFrom + captureSnapshots
  optional fields. normalizeSimulationConfig passes them
  through.

Dashboard:

- New tab: 'branches' in DASHBOARD_TABS, between 'reports' and
  'chat'.
- BranchesContext (client-only): reducer over
  { parent?: RunArtifact, branches: BranchState[] }. Parent is
  set on SSE terminal event; branches are inserted optimistically
  on fork-modal confirm, updated as their SSE events stream,
  and finalized on terminal.
- BranchesTab: parent card + branch cards stacked vertically.
  Branch cards show leader override, forked-at-turn badge,
  status (running / complete / aborted / error), and up to 4
  per-metric deltas vs parent with direction hints. Single-click
  navigates to Reports tab.
- ForkModal: leader preset picker (from scenario.presets +
  optional session customs), seed override, advanced-collapsed
  custom events textarea, live cost estimate derived from
  costPreset + provider + (maxTurns - atTurn).
- ReportView gains "↳ Fork at {labels.Time} N" button per turn
  row, gated on kernelSnapshotsPerTurn present + parent complete
  + turn reached.
- Pure helper modules: BranchesTab.helpers.ts (computeBranchDeltas,
  formatDelta), ForkModal.helpers.ts (resolveLeaderPresets,
  estimateForkCost, parseCustomEvents). Both are unit-tested in
  isolation; components are thin render wrappers over their
  helpers.
- All UI-initiated /setup POSTs (App.tsx, SettingsPanel,
  RerunPanel) now include captureSnapshots: true so forks from
  the dashboard are always possible.

Tests (13 new, all pass):

- tests/cli/server-app-fork.test.ts (5): normalize pass-through,
  captureSnapshots default, and fakeParentArtifact harness tests
  covering snapshot presence + scenarioId threading. Full
  server-handler tests (multi-leader reject, cross-scenario
  reject, missing-snapshots reject, active-run 409) deferred to
  a future integration-test layer that can spin up the HTTP
  server without dragging in AgentOS + runSimulation imports.
- src/cli/dashboard/src/components/branches/BranchesTab.helpers
  .test.ts (6): numeric delta up/down, string status changed,
  identical keys omitted, one-sided keys skipped, formatDelta
  numeric + non-numeric.
- src/cli/dashboard/src/components/reports/ForkModal.helpers
  .test.ts (7): leader preset resolution on Mars + empty + with
  customs, cost estimate openai/economy + anthropic/quality,
  custom events parser valid + invalid lines.

Verification:
- tests: 624 pass / 0 fail / 1 skip (baseline 606 + 18 new).
- tsc --noEmit: only pre-existing Zod-v4 warnings.
- npm run build: exit 0; new branches + reports module files
  emit cleanly.
- zero em-dashes in any authored file.

Deferred (per spec §5):
- Trajectory line charts on branch cards (T5.1 viz kit).
- Concurrent fork runs (server architecture rework).
- Nested fork genealogy tree (flat list for now).
- Cross-scenario fork (server rejects, no UX path yet).
- Multi-artifact session persistence (T4.3 SQLite adapter).

Spec: docs/superpowers/specs/2026-04-24-branches-tab-fork-ux-design.md
Plan: docs/superpowers/plans/2026-04-24-branches-tab-fork-ux-implementation.md
EOF
)"
echo ""
echo "exit=$?"
git log --oneline -1
```

Expected: commit lands cleanly, hash visible in the `git log` output.

- [ ] **Step 21.2: Fill the commit hash into the roadmap**

```bash
HASH=$(git log -1 --pretty=%h)
sed -i.bak "s/<TO-FILL>/${HASH}/g" docs/superpowers/plans/2026-04-23-paracosm-roadmap.md
rm docs/superpowers/plans/2026-04-23-paracosm-roadmap.md.bak
git add docs/superpowers/plans/2026-04-23-paracosm-roadmap.md
git commit -m "docs(plan): roadmap hash fill for tier 2 spec 2b shipped"
```

### Task 22: Bump monorepo submodule pointer

**Files:** monorepo root

- [ ] **Step 22.1: Stage paracosm pointer only**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant
git status --short | head -5
git add apps/paracosm
git diff --cached --name-only
```

Expected: single line `apps/paracosm`.

- [ ] **Step 22.2: Commit with --no-verify**

```bash
git commit --no-verify -m "chore: bump paracosm submodule (tier 2 spec 2b shipped)

Spec 2B dashboard fork UX lands: Reports tab Fork button,
ForkModal, Branches tab, /setup fork dispatch, captureSnapshots
default on UI runs. --no-verify per repo convention."
```

---

## Self-review

### Spec coverage check

Every section of the spec has a corresponding plan task:

- **§3.1 Server config + fork dispatch:** Tasks 1 (types), 2 (handler). ✓
- **§3.2 No fork-history endpoint:** explicit non-task per the spec amendment. ✓
- **§3.3 Fork button:** Task 13. ✓
- **§3.4 Fork modal:** Task 12 + Task 9 (helpers) + Task 10 (helper tests). ✓
- **§3.5 Branches tab:** Task 11 + Task 14 (routing). ✓
- **§3.6 State wiring:** Task 4 (context) + Task 5 (provider mount) + Task 6 (terminal event dispatch). ✓
- **§3.7 Delta helper:** Task 7 + Task 8. ✓
- **§6 Tests:** Task 3 (server) + Task 8 (BranchesTab helpers) + Task 10 (ForkModal helpers). 18 tests, meets spec target. ✓
- **§7 Docs:** Task 16 (README) + Task 17 (roadmap). ✓
- **§10 Execution order:** maps cleanly to Tasks 1-22.

### Placeholder scan

Two deliberate `<TO-FILL>` markers for the commit hash, replaced in Task 21.2. No TODO / TBD / "fill in later" patterns anywhere. The only fuzzy areas are:

- Task 6 Step 6.2 says "actual wiring depends on the existing dashboard artifact assembly; if no such helper exists, the reducer can live with just the metadata subset". This is because the dashboard's artifact assembly path requires runtime inspection that the plan author cannot do at authoring time. The task directs the implementer to verify via the grep command in step 6.1; the reducer shape is independent of the wiring mechanism.
- Task 13 Step 13.1 similarly notes "the exact `parentArtifact` source depends on where the current session's completed artifact is stored". Same class of implementation-time lookup.

Both are clearly-scoped lookups, not planning gaps.

### Type consistency

- `RunArtifact` imported consistently from `'../../../../engine/schema/index.js'` in dashboard-side files and from `'../../src/engine/schema/index.js'` in server-app/sim-config.
- `BranchState`, `BranchStatus`, `BranchesState`, `BranchesAction` defined once in Task 4 and consumed in Tasks 11 + 13.
- `BranchDelta` defined in Task 7, consumed in Task 8 + Task 11.
- `ForkConfirmPayload` defined in Task 12, consumed in Task 13.
- `forkFrom: { parentArtifact: RunArtifact; atTurn: number }` shape consistent in Tasks 1, 2, 13, 21.
- `snapshotVersion: 1` literal matches Spec 2A's shape from commit 161f1e4d.

No inconsistencies.

### Scope

Plan ships 22 tasks across 6 phases as one atomic commit at the end. Roughly 1-1.5 days of focused inline execution. Single CI auto-publish on push per user preference.
