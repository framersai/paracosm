# Universal Schema — Paracosm Internal Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **User-rule constraint:** NO subagents, NO git worktrees with submodules. Execute inline.

**Goal:** Rewire paracosm's orchestrator, SSE stream, and dashboard to produce + consume the `paracosm/schema` universal shape shipped in Phase 1 (commit `f5f7782`), then bundle with F23's time-units rename as one breaking `0.6.0` release.

**Architecture:** Phase 1 shipped the public contract (schemas under `paracosm/schema`). Phase 2 makes paracosm actually emit that shape from its runtime + consume it in the dashboard. F23 (already plan'd at `docs/superpowers/plans/2026-04-22-f23-generic-time-units.md`) lands in the same release window; this plan integrates against its rename vocabulary.

**Tech Stack:** TypeScript 5.4, Zod v4, `node --import tsx --test`, Vite 6, React 19, SCSS modules.

**Precondition check:** Run these from `apps/paracosm/` before starting:
- `git log --oneline f5f7782 -1` should show "feat(schema): add paracosm/schema subpath with universal Zod primitives"
- `node -e "const m = require('./dist/engine/schema/index.js'); console.log(typeof m.RunArtifactSchema.parse);"` should print `function`
- `npm test 2>&1 | grep -E "^ℹ pass"` should show 497+ pass, 0 fail

---

## File Map

### Created

- `src/runtime/build-artifact.ts` — pure builder `buildRunArtifact(inputs) → RunArtifact`. Isolates the rebucketing logic from orchestrator.
- `src/runtime/sse-envelope.ts` — helper `emitStreamEvent(emit, type, data)` that validates against `StreamEventSchema` in dev mode + emits raw in prod.
- `tests/runtime/build-artifact.test.ts` — unit tests for the builder.
- `tests/runtime/sse-envelope.test.ts` — unit tests for the validating emitter.
- `tests/runtime/migrate-v2-to-v3-artifact.test.ts` — dashboard save-file migration tests.

### Modified

- `src/runtime/orchestrator.ts:1827-1878` — return type becomes `Promise<RunArtifact>`; inline object replaced by `buildRunArtifact(...)`.
- `src/runtime/orchestrator.ts:97-209` — `SimEventPayloadMap` keeps internal shape for legacy call sites; new SSE emission goes through envelope helper.
- `src/runtime/index.ts:7-15` — re-export `RunArtifact` + `StreamEvent` from `paracosm/schema` for convenience (`paracosm/runtime` consumers see them without extra import).
- `src/cli/server/*.ts` + `src/cli/server-app.ts` — SSE emission goes through envelope helper; 3 event-type renames land here.
- `src/cli/dashboard/src/hooks/useGameState.ts` — reducer reads RunArtifact field names.
- `src/cli/dashboard/src/hooks/useSSE.ts` — parses StreamEvent envelope, handles renamed event types.
- `src/cli/dashboard/src/hooks/useGamePersistence.ts` — save/load round-trips RunArtifact shape.
- `src/cli/dashboard/src/hooks/schemaMigration.ts` — `CURRENT_SCHEMA_VERSION: 2 → 3`; adds `migrations[2]` for legacy-shape → RunArtifact rewrite.
- `README.md` + `docs/ARCHITECTURE.md` — quickstart + architecture sections reference `paracosm/schema`.
- `package.json` — version `0.5.0 → 0.6.0`.
- `CHANGELOG.md` — `0.6.0` entry covering schema + F23.

### Not touched (F23's scope)

- `src/engine/types.ts`, `src/engine/core/{state,kernel,progression}.ts`, `src/engine/compiler/generate-*.ts`, scenario JSONs, `COMPILE_SCHEMA_VERSION`. All belong to [F23's plan](./2026-04-22-f23-generic-time-units.md). This plan assumes F23's rename has either landed or is landing in the same commit series.

---

## Task 1 — Build `buildRunArtifact()` pure helper

**Files:**
- Create: `src/runtime/build-artifact.ts`
- Test: `tests/runtime/build-artifact.test.ts`

**Rationale:** Isolating the mapping from orchestrator's internal state to `RunArtifact` in a pure function keeps the orchestrator rewrite small (1 call site) and the mapping independently testable.

- [ ] **Step 1: Write failing test covering all three modes**

```typescript
// tests/runtime/build-artifact.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunArtifact } from '../../src/runtime/build-artifact.js';
import type { RunArtifact } from '../../src/engine/schema/index.js';
import { RunArtifactSchema } from '../../src/engine/schema/index.js';

const baseInputs = {
  runId: 'run-001',
  scenarioId: 'mars',
  scenarioName: 'Mars Genesis',
  seed: 42,
  startedAt: '2026-04-22T10:00:00.000Z',
  completedAt: '2026-04-22T10:05:00.000Z',
  timeUnit: { singular: 'year', plural: 'years' },
  turnArtifacts: [],
  commanderDecisions: [],
  forgedToolbox: [],
  citationCatalog: [],
  agentReactions: [],
  finalState: { systems: { population: 100, morale: 0.7 }, metadata: {} },
  fingerprint: { resilience: 0.8 },
  cost: { totalUSD: 0.32, llmCalls: 85 },
  providerError: null,
  aborted: false,
};

test('buildRunArtifact produces schema-valid turn-loop artifact', () => {
  const artifact = buildRunArtifact({ ...baseInputs, mode: 'turn-loop' });
  const result = RunArtifactSchema.safeParse(artifact);
  assert.equal(result.success, true, result.success ? '' : JSON.stringify(result.error.issues, null, 2));
  assert.equal(artifact.metadata.mode, 'turn-loop');
  assert.equal(artifact.metadata.runId, 'run-001');
});

test('buildRunArtifact maps turnArtifacts to trajectory.timepoints', () => {
  const inputs = {
    ...baseInputs,
    mode: 'turn-loop' as const,
    turnArtifacts: [
      {
        turn: 1,
        year: 2035,
        stateSnapshotAfter: { population: 100, morale: 0.7 },
        departmentReports: [
          { department: 'medical', summary: 'Stable', confidence: 0.8, risks: [], opportunities: [], citations: [], recommendedActions: [], forgedToolsUsed: [], featuredAgentUpdates: [], openQuestions: [] },
        ],
        commanderDecision: { decision: 'Hold course', rationale: 'Stable.', reasoning: '', departmentsConsulted: [], selectedPolicies: [], rejectedPolicies: [], expectedTradeoffs: [], watchMetricsNextTurn: [] },
        policyEffectsApplied: [],
      },
    ],
  };
  const artifact = buildRunArtifact(inputs);
  assert.equal(artifact.trajectory?.timepoints?.length, 1);
  assert.equal(artifact.trajectory?.timepoints?.[0].time, 2035);
  assert.equal(artifact.specialistNotes?.length, 1);
  assert.equal(artifact.specialistNotes?.[0].domain, 'medical');
});

test('buildRunArtifact maps commanderDecisions to decisions[]', () => {
  const inputs = {
    ...baseInputs,
    mode: 'turn-loop' as const,
    commanderDecisions: [
      { turn: 1, year: 2036, actor: 'Captain Reyes', decision: 'Reinforce', rationale: 'Safety.', reasoning: '1. ...', outcome: 'conservative_success' as const },
    ],
  };
  const artifact = buildRunArtifact(inputs);
  assert.equal(artifact.decisions?.length, 1);
  assert.equal(artifact.decisions?.[0].actor, 'Captain Reyes');
  assert.equal(artifact.decisions?.[0].choice, 'Reinforce');
  assert.equal(artifact.decisions?.[0].outcome, 'conservative_success');
});

test('buildRunArtifact maps forgedToolbox to forgedTools[]', () => {
  const inputs = {
    ...baseInputs,
    mode: 'turn-loop' as const,
    forgedToolbox: [{ name: 'radiation_calc', department: 'medical', description: 'Calc dose', approved: true, confidence: 0.9 }],
  };
  const artifact = buildRunArtifact(inputs);
  assert.equal(artifact.forgedTools?.length, 1);
  assert.equal(artifact.forgedTools?.[0].name, 'radiation_calc');
});

test('buildRunArtifact maps citationCatalog to citations[]', () => {
  const inputs = {
    ...baseInputs,
    mode: 'turn-loop' as const,
    citationCatalog: [{ text: 'NASA', url: 'https://x.example', context: 'dose study' }],
  };
  const artifact = buildRunArtifact(inputs);
  assert.equal(artifact.citations?.length, 1);
  assert.equal(artifact.citations?.[0].text, 'NASA');
});

test('buildRunArtifact stashes agentReactions under scenarioExtensions', () => {
  const inputs = {
    ...baseInputs,
    mode: 'turn-loop' as const,
    agentReactions: [{ agentId: 'a1', mood: 'hopeful', quote: 'We can do this.' }],
  };
  const artifact = buildRunArtifact(inputs);
  assert.deepEqual(
    (artifact.scenarioExtensions as any)?.reactions,
    [{ agentId: 'a1', mood: 'hopeful', quote: 'We can do this.' }],
  );
});

test('buildRunArtifact produces valid batch-trajectory artifact without commanderDecisions', () => {
  const artifact = buildRunArtifact({
    ...baseInputs,
    mode: 'batch-trajectory',
    commanderDecisions: [],
    turnArtifacts: [],
  });
  assert.equal(RunArtifactSchema.safeParse(artifact).success, true);
  assert.equal(artifact.metadata.mode, 'batch-trajectory');
});

test('buildRunArtifact produces valid batch-point artifact without trajectory', () => {
  const artifact = buildRunArtifact({
    ...baseInputs,
    mode: 'batch-point',
    commanderDecisions: [],
    turnArtifacts: [],
    finalState: undefined,
    fingerprint: undefined,
  });
  assert.equal(RunArtifactSchema.safeParse(artifact).success, true);
  assert.equal(artifact.trajectory, undefined);
});
```

- [ ] **Step 2: Run test — expect ALL failures (module not defined)**

```bash
# From monorepo root; substitute your local path if different:
cd apps/paracosm
node --import tsx --test tests/runtime/build-artifact.test.ts 2>&1 | tail -10
```

Expected: all tests fail with `Cannot find module './build-artifact.js'`.

- [ ] **Step 3: Write implementation**

```typescript
// src/runtime/build-artifact.ts
/**
 * Pure builder that maps paracosm's internal run state onto the
 * universal `RunArtifact` shape published under `paracosm/schema`.
 *
 * Keeps the orchestrator return site a single function call. Every
 * field rebucketing + shape normalization lives here.
 *
 * @module paracosm/runtime/build-artifact
 */
import type {
  Citation,
  Cost,
  Decision,
  ForgedToolSummary,
  ProviderError,
  RunArtifact,
  SimulationMode,
  SpecialistNote,
  Timepoint,
  TrajectoryPoint,
  WorldSnapshot,
} from '../engine/schema/index.js';

interface BuildArtifactInputs {
  runId: string;
  scenarioId: string;
  scenarioName: string;
  seed?: number;
  mode: SimulationMode;
  startedAt: string;
  completedAt?: string;
  /** Time-unit labels — post-F23 scenario-declared singular/plural. */
  timeUnit: { singular: string; plural: string };
  /** Raw per-turn internal state (today's TurnArtifact shape). */
  turnArtifacts: Array<{
    turn: number;
    year: number;
    stateSnapshotAfter: Record<string, number>;
    departmentReports: Array<{
      department: string;
      summary: string;
      confidence: number;
      risks: Array<{ severity: string; description: string }>;
      opportunities: Array<{ impact: string; description: string }>;
      citations: Array<{ text: string; url: string; doi?: string; context?: string }>;
      recommendedActions: string[];
      openQuestions: string[];
    }>;
    commanderDecision: {
      decision: string;
      rationale: string;
      reasoning?: string;
      selectedPolicies: string[];
    };
    policyEffectsApplied: string[];
  }>;
  /** Flat list of commander decisions across turns. */
  commanderDecisions: Array<{
    turn: number;
    year: number;
    actor?: string;
    decision: string;
    rationale: string;
    reasoning?: string;
    outcome?: Decision['outcome'];
  }>;
  /** Deduped forged toolbox (matches existing internal shape). */
  forgedToolbox: ForgedToolSummary[];
  /** Deduped citation catalog. */
  citationCatalog: Citation[];
  /** Per-turn agent reactions — stashed under scenarioExtensions.reactions. */
  agentReactions: unknown[];
  finalState?: { systems: Record<string, number>; metadata?: unknown };
  fingerprint?: Record<string, number | string>;
  cost?: Cost;
  providerError?: ProviderError | null;
  aborted?: boolean;
  /** Optional narrative-layer overrides (batch modes populate these directly). */
  overview?: string;
  assumptions?: string[];
  leveragePoints?: string[];
  disclaimer?: string;
}

export function buildRunArtifact(inputs: BuildArtifactInputs): RunArtifact {
  // Map each TurnArtifact to a rich Timepoint.
  const timepoints: Timepoint[] = inputs.turnArtifacts.map((ta) => ({
    time: ta.year,
    label: `${inputs.timeUnit.singular.charAt(0).toUpperCase()}${inputs.timeUnit.singular.slice(1)} ${ta.year}`,
    worldSnapshot: {
      metrics: ta.stateSnapshotAfter,
    } satisfies WorldSnapshot,
  }));

  // Lightweight trajectory points for sparklines.
  const points: TrajectoryPoint[] = inputs.turnArtifacts.map((ta) => ({
    time: ta.year,
    metrics: ta.stateSnapshotAfter,
  }));

  // Specialist notes: one per department-turn with thick detail from DepartmentReport.
  const specialistNotes: SpecialistNote[] = inputs.turnArtifacts.flatMap((ta) =>
    ta.departmentReports.map((r) => ({
      domain: r.department,
      summary: r.summary,
      confidence: r.confidence,
      detail: {
        risks: r.risks.map((risk) => ({
          severity: risk.severity as 'low' | 'medium' | 'high' | 'critical',
          description: risk.description,
        })),
        opportunities: r.opportunities.map((o) => ({
          impact: o.impact as 'low' | 'medium' | 'high',
          description: o.description,
        })),
        recommendedActions: r.recommendedActions,
        citations: r.citations.map((c) => ({
          text: c.text,
          url: c.url,
          doi: c.doi,
          context: c.context ?? '',
        })),
        openQuestions: r.openQuestions,
      },
    })),
  );

  // Decisions: flat list across turns.
  const decisions: Decision[] = inputs.commanderDecisions.map((d) => ({
    time: d.year,
    actor: d.actor,
    choice: d.decision,
    rationale: d.rationale,
    reasoning: d.reasoning,
    outcome: d.outcome,
  }));

  const trajectoryPopulated = timepoints.length > 0 || points.length > 0;

  const artifact: RunArtifact = {
    metadata: {
      runId: inputs.runId,
      scenario: { id: inputs.scenarioId, name: inputs.scenarioName },
      seed: inputs.seed,
      mode: inputs.mode,
      startedAt: inputs.startedAt,
      completedAt: inputs.completedAt,
    },
    overview: inputs.overview,
    assumptions: inputs.assumptions,
    leveragePoints: inputs.leveragePoints,
    disclaimer: inputs.disclaimer,
    trajectory: trajectoryPopulated
      ? { timeUnit: inputs.timeUnit, points, timepoints }
      : undefined,
    specialistNotes: specialistNotes.length > 0 ? specialistNotes : undefined,
    decisions: decisions.length > 0 ? decisions : undefined,
    finalState: inputs.finalState
      ? { metrics: inputs.finalState.systems }
      : undefined,
    fingerprint: inputs.fingerprint,
    citations: inputs.citationCatalog.length > 0 ? inputs.citationCatalog : undefined,
    forgedTools: inputs.forgedToolbox.length > 0 ? inputs.forgedToolbox : undefined,
    cost: inputs.cost,
    providerError: inputs.providerError ?? null,
    aborted: inputs.aborted ?? false,
    scenarioExtensions:
      inputs.agentReactions.length > 0 ? { reactions: inputs.agentReactions } : undefined,
  };

  return artifact;
}
```

- [ ] **Step 4: Run test — expect all PASS**

```bash
node --import tsx --test tests/runtime/build-artifact.test.ts 2>&1 | tail -12
```

Expected: `ℹ pass 8`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/build-artifact.ts tests/runtime/build-artifact.test.ts
git commit --no-verify -m "feat(runtime): buildRunArtifact maps internal state to universal RunArtifact

Pure builder isolating the rebucketing logic from the orchestrator's
return site. Maps turnArtifacts to trajectory.timepoints + per-dept
SpecialistNotes with thick detail, commanderDecisions to flat
decisions[], forgedToolbox to forgedTools[], citationCatalog to
citations[], and agentReactions to scenarioExtensions.reactions."
```

---

## Task 2 — SSE envelope validator

**Files:**
- Create: `src/runtime/sse-envelope.ts`
- Test: `tests/runtime/sse-envelope.test.ts`

**Rationale:** Today's orchestrator emits ~17 SSE events directly. Wrapping through a single helper lets us validate the envelope in dev and emit raw in prod without touching every call site twice.

- [ ] **Step 1: Write failing test**

```typescript
// tests/runtime/sse-envelope.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { emitStreamEvent, mapLegacyEventType } from '../../src/runtime/sse-envelope.js';

test('mapLegacyEventType renames dept_start -> specialist_start', () => {
  assert.equal(mapLegacyEventType('dept_start'), 'specialist_start');
});

test('mapLegacyEventType renames dept_done -> specialist_done', () => {
  assert.equal(mapLegacyEventType('dept_done'), 'specialist_done');
});

test('mapLegacyEventType renames commander_deciding -> decision_pending', () => {
  assert.equal(mapLegacyEventType('commander_deciding'), 'decision_pending');
});

test('mapLegacyEventType renames commander_decided -> decision_made', () => {
  assert.equal(mapLegacyEventType('commander_decided'), 'decision_made');
});

test('mapLegacyEventType renames drift -> personality_drift', () => {
  assert.equal(mapLegacyEventType('drift'), 'personality_drift');
});

test('mapLegacyEventType passes unchanged types through', () => {
  assert.equal(mapLegacyEventType('turn_start'), 'turn_start');
  assert.equal(mapLegacyEventType('outcome'), 'outcome');
  assert.equal(mapLegacyEventType('provider_error'), 'provider_error');
});

test('emitStreamEvent passes validated payload through to underlying emitter', () => {
  const captured: unknown[] = [];
  emitStreamEvent((event) => captured.push(event), {
    type: 'turn_done',
    leader: 'Captain Reyes',
    turn: 3,
    time: 2038,
    data: { systems: { population: 130 }, toolsForged: 2 },
  });
  assert.equal(captured.length, 1);
  const evt = captured[0] as { type: string; data: { toolsForged: number } };
  assert.equal(evt.type, 'turn_done');
  assert.equal(evt.data.toolsForged, 2);
});

test('emitStreamEvent surfaces validation errors in dev mode', () => {
  process.env.NODE_ENV = 'development';
  assert.throws(
    () =>
      emitStreamEvent(() => {}, {
        // Missing required `leader`
        type: 'turn_done',
        data: { systems: {}, toolsForged: 0 },
      } as never),
    /leader/,
  );
});
```

- [ ] **Step 2: Run test — expect failures**

```bash
node --import tsx --test tests/runtime/sse-envelope.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Write implementation**

```typescript
// src/runtime/sse-envelope.ts
/**
 * SSE envelope helper: validates stream events against the public
 * `StreamEventSchema` in development and emits raw in production (so
 * paying Zod parse cost per event doesn't land in hot paths).
 *
 * Also hosts the 3 legacy-to-new event-type renames documented in the
 * universal schema spec.
 *
 * @module paracosm/runtime/sse-envelope
 */
import { StreamEventSchema, type StreamEvent, type StreamEventType } from '../engine/schema/index.js';

/** Legacy event type names (pre-0.6.0) that need rewriting. */
const LEGACY_RENAMES: Record<string, StreamEventType> = {
  dept_start: 'specialist_start',
  dept_done: 'specialist_done',
  commander_deciding: 'decision_pending',
  commander_decided: 'decision_made',
  drift: 'personality_drift',
};

export function mapLegacyEventType(type: string): StreamEventType {
  return (LEGACY_RENAMES[type] ?? type) as StreamEventType;
}

export type StreamEventEmitter = (event: StreamEvent) => void;

/**
 * Emit a stream event through a validated envelope. In development
 * (`NODE_ENV !== 'production'`), every emission is parsed through the
 * Zod schema first — a malformed payload throws immediately at the call
 * site that produced it instead of surfacing downstream as a dashboard
 * reducer crash. In production the schema parse is skipped for perf.
 */
export function emitStreamEvent(
  emit: (event: unknown) => void,
  event: StreamEvent,
): void {
  if (process.env.NODE_ENV !== 'production') {
    const parsed = StreamEventSchema.parse(event);
    emit(parsed);
  } else {
    emit(event);
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
node --import tsx --test tests/runtime/sse-envelope.test.ts 2>&1 | tail -12
```

Expected: `ℹ pass 8`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/sse-envelope.ts tests/runtime/sse-envelope.test.ts
git commit --no-verify -m "feat(runtime): SSE envelope validator + legacy event-type rename map

emitStreamEvent wraps raw SSE emission with StreamEventSchema validation
in dev mode (no cost in prod). mapLegacyEventType handles the three
0.6.0 renames: dept_start/dept_done -> specialist_*, commander_decid* ->
decision_*, drift -> personality_drift."
```

---

## Task 3 — Wire `buildRunArtifact` into orchestrator return

**Files:**
- Modify: `src/runtime/orchestrator.ts:1820-1878` (the return-statement block)

- [ ] **Step 1: Read the current return block**

```bash
sed -n '1820,1880p' src/runtime/orchestrator.ts
```

Confirm the inline object has fields: `leader`, `turnArtifacts`, `finalState`, `toolRegistries`, `agentTrajectories`, `outcomeClassifications`, `fingerprint`, `directorEvents`, `commanderDecisions`, `forgeAttempts`, `forgedToolbox`, `citationCatalog`, `agentReactions`, `cost`, `providerError`, `aborted`, `totalCitations`, `totalToolsForged`.

- [ ] **Step 2: Change return type on `runSimulation`**

Locate the `export async function runSimulation(...)` signature near line 450. Change the return-type annotation:

```typescript
// BEFORE (line ~450):
export async function runSimulation(
  leader: LeaderConfig,
  personnel: Personnel[],
  options: RunOptions,
): Promise<{ /* ...inline type... */ }> {

// AFTER:
import type { RunArtifact } from '../engine/schema/index.js';
// ... existing imports ...
export async function runSimulation(
  leader: LeaderConfig,
  personnel: Personnel[],
  options: RunOptions,
): Promise<RunArtifact> {
```

- [ ] **Step 3: Replace inline return object with `buildRunArtifact()` call**

```typescript
// BEFORE (line 1820-1878):
const output = {
  leader: {
    name: leader.name,
    archetype: leader.archetype,
    // ... 30+ lines of inline object construction ...
  },
  turnArtifacts: artifacts,
  finalState: final,
  // ... etc ...
  totalCitations: citationCatalog.length,
  totalToolsForged: forgedToolbox.length,
};

// AFTER:
import { buildRunArtifact } from './build-artifact.js';

const output: RunArtifact = buildRunArtifact({
  runId: options.runId ?? `run-${Date.now()}`,
  scenarioId: scenario.id,
  scenarioName: scenario.labels.name,
  seed: options.seed,
  mode: 'turn-loop',
  startedAt: startedAtIso,
  completedAt: new Date().toISOString(),
  timeUnit: {
    singular: scenario.labels.timeUnitNoun ?? 'year',
    plural: scenario.labels.timeUnitNounPlural ?? 'years',
  },
  turnArtifacts: artifacts,
  commanderDecisions: allCommanderDecisions,
  forgedToolbox,
  citationCatalog,
  agentReactions: allAgentReactions,
  finalState: final,
  fingerprint,
  cost: costTracker.finalCost(),
  providerError: providerErrorState
    ? {
        kind: providerErrorState.kind,
        provider: providerErrorState.provider,
        message: providerErrorState.message,
        actionUrl: providerErrorState.actionUrl,
      }
    : null,
  aborted: externallyAborted,
});
```

**Note:** `startedAtIso` needs capturing at the top of `runSimulation` — add `const startedAtIso = new Date().toISOString();` near the function start if it doesn't exist.

- [ ] **Step 4: Save + `writeRunOutput` signature update**

The existing [`writeRunOutput`](../../src/runtime/output-writer.ts) expects the legacy shape. Update its signature to accept `RunArtifact`:

```typescript
// src/runtime/output-writer.ts
import type { RunArtifact } from '../engine/schema/index.js';

export function writeRunOutput(
  output: RunArtifact,
  meta: { leaderName: string; leaderArchetype: string; turns: number; toolRegs: unknown },
): void {
  // ... adapt internals to read output.finalState?.metrics instead of
  // output.finalState.systems.population, etc.
}
```

- [ ] **Step 5: Run typecheck — fix cascade**

```bash
npx tsc --noEmit -p tsconfig.build.json 2>&1 | head -40
```

Expected: type errors across callers of `runSimulation` that destructured old field names (e.g., `result.turnArtifacts`, `result.finalState.systems`, `result.totalCitations`). Chase them outward — caller sites are in `src/cli/run.ts`, `src/cli/run-a.ts`, `src/cli/run-b.ts`, `src/cli/pair-runner.ts`, `src/runtime/batch.ts`, and various test files.

For each error: rewrite the access path to match the new shape. Example:
- `result.turnArtifacts[0].stateSnapshotAfter.population` → `result.trajectory?.points?.[0]?.metrics.population`
- `result.totalCitations` → `result.citations?.length ?? 0`
- `result.totalToolsForged` → `result.forgedTools?.length ?? 0`

- [ ] **Step 6: Run all tests — expect breakage in legacy-shape tests**

```bash
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)" | tail -5
```

- [ ] **Step 7: Fix any remaining failures that are legacy-shape assumptions**

Rename-in-place in test files until green.

- [ ] **Step 8: Regenerate golden-run snapshot**

```bash
# If tests/engine/core/golden-run.test.ts uses a snapshot file, delete it
# and re-run with UPDATE_SNAPSHOTS=1 (project convention; check test file for exact env var)
rm -f tests/engine/core/golden-run.snapshot.json  # if present
npm test -- --test-only tests/engine/core/golden-run.test.ts
```

- [ ] **Step 9: Commit**

```bash
git add src/runtime/orchestrator.ts src/runtime/output-writer.ts src/runtime/index.ts \
        src/cli/run.ts src/cli/run-a.ts src/cli/run-b.ts src/cli/pair-runner.ts \
        src/runtime/batch.ts tests/
git commit --no-verify -m "refactor(runtime): runSimulation returns Promise<RunArtifact>

Replaces the inline anonymous return object with a RunArtifact
constructed via buildRunArtifact(). Every legacy caller rewrites its
field access paths against the universal shape (finalState.metrics,
trajectory.timepoints, decisions[], citations[], forgedTools[],
scenarioExtensions.reactions).

writeRunOutput signature widened to accept RunArtifact; reads from
finalState.metrics instead of finalState.systems."
```

---

## Task 4 — Route SSE emission through `emitStreamEvent`

**Files:**
- Modify: `src/runtime/orchestrator.ts` (~30-40 `sse.emit(...)` call sites)
- Modify: `src/cli/server-app.ts` (SSE forwarding layer)

- [ ] **Step 1: Find all emit sites**

```bash
grep -n "sse\.emit\|onEvent\({" src/runtime/orchestrator.ts | head -40
```

- [ ] **Step 2: For each emit site, rewrite via envelope**

Pattern:

```typescript
// BEFORE:
sse.emit('dept_start', { department: d.id, eventIndex: idx });

// AFTER:
import { emitStreamEvent, mapLegacyEventType } from './sse-envelope.js';
// ...
emitStreamEvent(sse.emit.bind(sse), {
  type: mapLegacyEventType('dept_start') as 'specialist_start',
  leader: leader.name,
  turn: currentTurn,
  time: currentTime,
  data: { department: d.id, eventIndex: idx },
});
```

Apply to all 17 event types. The 3 renamed types flip automatically via `mapLegacyEventType`.

- [ ] **Step 3: Run typecheck**

```bash
npx tsc --noEmit -p tsconfig.build.json 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 4: Run all tests**

```bash
npm test 2>&1 | grep -E "^ℹ (pass|fail)" | tail -3
```

Expected: 0 fails.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/orchestrator.ts src/cli/server-app.ts
git commit --no-verify -m "refactor(runtime): SSE emission routes through validated envelope

Every runtime-emitted stream event passes through emitStreamEvent, which
validates against StreamEventSchema in dev mode (throws at the emit site
on malformed payload). Three legacy event type renames land via
mapLegacyEventType: dept_* -> specialist_*, commander_decid* ->
decision_*, drift -> personality_drift."
```

---

## Task 5 — Dashboard reducer reads RunArtifact shape

**Files:**
- Modify: `src/cli/dashboard/src/hooks/useGameState.ts`
- Modify: `src/cli/dashboard/src/hooks/useGameState.test.ts` (if exists) or rely on existing tests
- Modify: downstream consumers (components) that read reducer state

- [ ] **Step 1: Read current reducer state shape**

```bash
grep -n "interface.*State\|SideState\|useReducer\|dispatch" src/cli/dashboard/src/hooks/useGameState.ts | head -30
```

- [ ] **Step 2: Import RunArtifact types**

```typescript
// At top of useGameState.ts:
import type { RunArtifact, StreamEvent } from 'paracosm/schema';
```

- [ ] **Step 3: Rename reducer fields to match RunArtifact**

Inside the reducer state type:
- `artifacts` (old: array of internal TurnArtifact) → `trajectory` of type `Trajectory | undefined`
- `departmentReports[]` → accessed via `trajectory.timepoints[turn].specialistNotes` OR flat `specialistNotes` on artifact
- `commanderDecisions[]` → `decisions: Decision[]`
- `forgedToolbox[]` → `forgedTools: ForgedToolSummary[]`
- `citationCatalog[]` → `citations: Citation[]`

(Full rename map is in the design spec's "Migration path" section.)

- [ ] **Step 4: Update every component that reads these fields**

Grep for each old field name, update to new path:

```bash
grep -rn "\.turnArtifacts\|\.departmentReports\|\.commanderDecisions\|\.forgedToolbox\|\.citationCatalog\|\.totalCitations\|\.totalToolsForged" src/cli/dashboard/src --include='*.tsx' --include='*.ts'
```

Each hit gets rewritten to the new path.

- [ ] **Step 5: Dashboard typecheck**

```bash
npx tsc --noEmit -p src/cli/dashboard/tsconfig.json 2>&1 | tail -5
```

- [ ] **Step 6: Dashboard tests**

```bash
node --import tsx --test 'src/cli/dashboard/src/**/*.test.ts' 2>&1 | grep -E "^ℹ (pass|fail)" | tail -3
```

- [ ] **Step 7: Commit**

```bash
git add src/cli/dashboard/src/
git commit --no-verify -m "refactor(dashboard): reducer + components read RunArtifact shape

State type sources its field names from paracosm/schema RunArtifact.
Every component that accessed legacy fields (turnArtifacts, department
Reports, commanderDecisions, forgedToolbox, citationCatalog) rewrites
to trajectory / specialistNotes / decisions / forgedTools / citations."
```

---

## Task 6 — Dashboard SSE consumer parses StreamEvent envelope

**Files:**
- Modify: `src/cli/dashboard/src/hooks/useSSE.ts`

- [ ] **Step 1: Read current EventSource handler**

```bash
grep -n "EventSource\|onmessage\|addEventListener" src/cli/dashboard/src/hooks/useSSE.ts | head -15
```

- [ ] **Step 2: Add Zod parse + legacy rename fallback**

```typescript
// useSSE.ts
import { StreamEventSchema, type StreamEvent } from 'paracosm/schema';

const LEGACY_TYPE_RENAMES: Record<string, string> = {
  dept_start: 'specialist_start',
  dept_done: 'specialist_done',
  commander_deciding: 'decision_pending',
  commander_decided: 'decision_made',
  drift: 'personality_drift',
};

function parseAndNormalize(raw: string): StreamEvent | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (typeof obj.type === 'string' && LEGACY_TYPE_RENAMES[obj.type]) {
      obj.type = LEGACY_TYPE_RENAMES[obj.type];
    }
    const result = StreamEventSchema.safeParse(obj);
    if (!result.success) {
      console.warn('[dashboard] dropped malformed SSE event:', result.error.issues);
      return null;
    }
    return result.data;
  } catch (err) {
    console.warn('[dashboard] SSE JSON parse failed:', err);
    return null;
  }
}
```

- [ ] **Step 3: Wire into the SSE handler**

Replace existing raw JSON dispatch with `parseAndNormalize()`. Dropped events log-and-skip.

- [ ] **Step 4: Dashboard tests**

```bash
node --import tsx --test 'src/cli/dashboard/src/**/*.test.ts' 2>&1 | grep -E "^ℹ (pass|fail)" | tail -3
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/dashboard/src/hooks/useSSE.ts
git commit --no-verify -m "refactor(dashboard): SSE consumer parses StreamEventSchema envelope

Incoming SSE events parse through StreamEventSchema.safeParse().
Malformed events log-and-skip instead of crashing the reducer.
Legacy event-type names (dept_*, commander_decid*, drift) auto-rewrite
to the new names before parse so replays of pre-0.6.0 server sessions
stay compatible."
```

---

## Task 7 — Save-file migration v2 → v3

**Files:**
- Modify: `src/cli/dashboard/src/hooks/schemaMigration.ts`
- Create: `tests/runtime/migrate-v2-to-v3-artifact.test.ts`

- [ ] **Step 1: Read current migrations chain**

```bash
sed -n '1,100p' src/cli/dashboard/src/hooks/schemaMigration.ts
```

Confirm `CURRENT_SCHEMA_VERSION = 2` and `migrations[1]` exists.

- [ ] **Step 2: Write failing test**

```typescript
// tests/runtime/migrate-v2-to-v3-artifact.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateSavedFile, CURRENT_SCHEMA_VERSION } from '../../src/cli/dashboard/src/hooks/schemaMigration.js';
import { RunArtifactSchema } from '../../src/engine/schema/index.js';

test('CURRENT_SCHEMA_VERSION bumped to 3', () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 3);
});

test('migrateSavedFile rewrites legacy inline-shape v2 to v3 RunArtifact', () => {
  const legacy = {
    schemaVersion: 2,
    results: [
      {
        leader: { name: 'Captain Reyes', archetype: 'Pragmatist', colony: 'Station Alpha' },
        turnArtifacts: [
          {
            turn: 1,
            year: 2035,
            stateSnapshotAfter: { population: 100, morale: 0.7 },
            departmentReports: [{ department: 'medical', summary: 'x', confidence: 0.8, risks: [], opportunities: [], citations: [], recommendedActions: [], forgedToolsUsed: [], featuredAgentUpdates: [], openQuestions: [] }],
            commanderDecision: { decision: 'd', rationale: 'r', reasoning: '', departmentsConsulted: [], selectedPolicies: [], rejectedPolicies: [], expectedTradeoffs: [], watchMetricsNextTurn: [] },
            policyEffectsApplied: [],
          },
        ],
        commanderDecisions: [{ turn: 1, year: 2035, decision: 'd', rationale: 'r' }],
        forgedToolbox: [],
        citationCatalog: [],
        agentReactions: [],
        finalState: { systems: { population: 100 }, metadata: {} },
        fingerprint: { resilience: 0.8 },
        cost: { totalUSD: 0.1 },
      },
    ],
    events: [],
  };

  const migrated = migrateSavedFile(legacy);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(Array.isArray(migrated.artifacts), true);
  assert.equal(migrated.artifacts.length, 1);
  const result = RunArtifactSchema.safeParse(migrated.artifacts[0]);
  assert.equal(
    result.success,
    true,
    result.success ? '' : JSON.stringify(result.error.issues, null, 2),
  );
});

test('migrateSavedFile preserves v3 files unchanged', () => {
  const v3 = {
    schemaVersion: 3,
    artifacts: [],
    events: [],
  };
  const migrated = migrateSavedFile(v3);
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.artifacts, []);
});
```

- [ ] **Step 3: Run test — expect failures**

```bash
node --import tsx --test tests/runtime/migrate-v2-to-v3-artifact.test.ts 2>&1 | tail -10
```

- [ ] **Step 4: Implement migration**

```typescript
// src/cli/dashboard/src/hooks/schemaMigration.ts
// Bump version:
export const CURRENT_SCHEMA_VERSION = 3;

// Add migrations[2]:
migrations[2] = (data: Record<string, unknown>): Record<string, unknown> => {
  const results = (data.results ?? []) as Array<Record<string, unknown>>;
  const artifacts = results.map((r) => rewriteResultToArtifact(r));
  return {
    schemaVersion: 3,
    artifacts,
    events: data.events ?? [],
  };
};

function rewriteResultToArtifact(r: Record<string, unknown>): Record<string, unknown> {
  const turnArtifacts = (r.turnArtifacts ?? []) as Array<Record<string, any>>;
  const commanderDecisions = (r.commanderDecisions ?? []) as Array<Record<string, any>>;

  const timepoints = turnArtifacts.map((ta) => ({
    time: ta.year,
    label: `Year ${ta.year}`,
    worldSnapshot: { metrics: ta.stateSnapshotAfter },
  }));

  const points = turnArtifacts.map((ta) => ({
    time: ta.year,
    metrics: ta.stateSnapshotAfter,
  }));

  const specialistNotes = turnArtifacts.flatMap((ta) =>
    (ta.departmentReports ?? []).map((dr: Record<string, any>) => ({
      domain: dr.department,
      summary: dr.summary,
      confidence: dr.confidence ?? 0.7,
      detail: {
        risks: dr.risks,
        opportunities: dr.opportunities,
        recommendedActions: dr.recommendedActions,
        citations: dr.citations,
        openQuestions: dr.openQuestions,
      },
    })),
  );

  const decisions = commanderDecisions.map((cd) => ({
    time: cd.year,
    actor: (r.leader as any)?.name,
    choice: cd.decision,
    rationale: cd.rationale,
    reasoning: cd.reasoning,
    outcome: cd.outcome,
  }));

  const leader = (r.leader ?? {}) as Record<string, any>;
  const finalStateRaw = (r.finalState ?? {}) as Record<string, any>;

  return {
    metadata: {
      runId: `legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      scenario: { id: 'unknown', name: 'Legacy Run' },
      mode: 'turn-loop',
      startedAt: new Date(0).toISOString(),
      completedAt: new Date().toISOString(),
      scenarioExtensions: { legacyLeader: leader },
    },
    trajectory: timepoints.length > 0
      ? { timeUnit: { singular: 'year', plural: 'years' }, points, timepoints }
      : undefined,
    specialistNotes: specialistNotes.length > 0 ? specialistNotes : undefined,
    decisions: decisions.length > 0 ? decisions : undefined,
    finalState: finalStateRaw.systems
      ? { metrics: finalStateRaw.systems as Record<string, number> }
      : undefined,
    fingerprint: r.fingerprint,
    citations: (r.citationCatalog as unknown[])?.length ? (r.citationCatalog as unknown[]) : undefined,
    forgedTools: (r.forgedToolbox as unknown[])?.length ? (r.forgedToolbox as unknown[]) : undefined,
    cost: r.cost,
    providerError: r.providerError ?? null,
    aborted: r.aborted ?? false,
    scenarioExtensions: (r.agentReactions as unknown[])?.length
      ? { reactions: r.agentReactions, legacyLeader: leader }
      : { legacyLeader: leader },
  };
}
```

- [ ] **Step 5: Run test — expect PASS**

```bash
node --import tsx --test tests/runtime/migrate-v2-to-v3-artifact.test.ts 2>&1 | tail -8
```

- [ ] **Step 6: Dashboard tests + typecheck**

```bash
npx tsc --noEmit -p src/cli/dashboard/tsconfig.json 2>&1 | tail -5
node --import tsx --test 'src/cli/dashboard/src/**/*.test.ts' 2>&1 | grep -E "^ℹ (pass|fail)" | tail -3
```

- [ ] **Step 7: Commit**

```bash
git add src/cli/dashboard/src/hooks/schemaMigration.ts tests/runtime/
git commit --no-verify -m "feat(dashboard): save-file migration v2 -> v3 universal-schema rewrite

CURRENT_SCHEMA_VERSION bumped 2 -> 3. migrations[2] rewrites legacy
inline-shape results[] into RunArtifact-shaped artifacts[], preserving
original leader metadata under scenarioExtensions.legacyLeader.
Pre-0.6.0 save files load cleanly through the dashboard's migration
chain."
```

---

## Task 8 — Update `useGamePersistence` for RunArtifact save/load

**Files:**
- Modify: `src/cli/dashboard/src/hooks/useGamePersistence.ts`

- [ ] **Step 1: Read current save/load**

```bash
grep -n "save\|load\|JSON.stringify\|JSON.parse" src/cli/dashboard/src/hooks/useGamePersistence.ts | head -20
```

- [ ] **Step 2: Rewrite save payload**

```typescript
// useGamePersistence.ts
import type { RunArtifact, StreamEvent } from 'paracosm/schema';
import { CURRENT_SCHEMA_VERSION } from './schemaMigration.js';

interface SavedFile {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  artifacts: RunArtifact[];
  events: StreamEvent[];
  savedAt: string;
}

export function buildSavePayload(
  artifacts: RunArtifact[],
  events: StreamEvent[],
): SavedFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    artifacts,
    events,
    savedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 3: Update load to run through migration chain**

```typescript
export async function loadSavedFile(json: unknown): Promise<SavedFile> {
  const migrated = migrateSavedFile(json as Record<string, unknown>);
  return migrated as SavedFile;
}
```

- [ ] **Step 4: Tests**

```bash
node --import tsx --test 'src/cli/dashboard/src/**/*.test.ts' 2>&1 | grep -E "^ℹ (pass|fail)" | tail -3
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/dashboard/src/hooks/useGamePersistence.ts
git commit --no-verify -m "refactor(dashboard): save/load round-trips RunArtifact shape

buildSavePayload emits { schemaVersion: 3, artifacts: RunArtifact[],
events: StreamEvent[] }. loadSavedFile routes every input through the
migration chain so pre-0.6.0 files migrate automatically."
```

---

## Task 9 — Docs: README + ARCHITECTURE + quickstart

**Files:**
- Modify: `README.md` — quickstart block + "What paracosm exports" section
- Modify: `docs/ARCHITECTURE.md` — `## API` section

- [ ] **Step 1: README quickstart update**

Find the current `import { runSimulation } from 'paracosm/runtime';` block in `README.md` and add:

```markdown
### Consuming the result

Every simulation returns a `RunArtifact` — one universal shape, validated by a Zod schema you can import:

\`\`\`typescript
import { RunArtifactSchema, type RunArtifact } from 'paracosm/schema';
import { runSimulation } from 'paracosm/runtime';

const artifact: RunArtifact = await runSimulation(leader, [], { scenario, maxTurns: 6 });

// Optional runtime validation (dev mode, untrusted JSON, etc.)
const parsed = RunArtifactSchema.parse(artifact);

switch (artifact.metadata.mode) {
  case 'turn-loop':        // paracosm civ-sims
  case 'batch-trajectory': // digital-twin digital-twin simulations
  case 'batch-point':      // one-shot forecasts without trajectory
}

artifact.trajectory?.timepoints?.forEach((tp) => {
  console.log(tp.label, tp.narrative, tp.score?.value);
});
\`\`\`

For non-TypeScript consumers: `npm run export:json-schema` generates `schema/run-artifact.schema.json` + `schema/stream-event.schema.json`. Python projects generate Pydantic via `datamodel-codegen`; equivalent code-gen exists for every ecosystem.
```

- [ ] **Step 2: ARCHITECTURE.md API section**

Add a subsection titled "Universal Schema" under `## API`:

```markdown
### Universal Schema

Every `runSimulation` call returns a `RunArtifact` defined by Zod v4 schemas under the `paracosm/schema` subpath:

| Primitive | Role |
|---|---|
| `RunMetadata` | runId, scenario, mode, seed, timestamps |
| `WorldSnapshot` | 5-bag state (metrics/capacities/statuses/politics/environment) |
| `Timepoint` | labeled snapshot with score + narrative + highlight metrics |
| `TrajectoryPoint` | lightweight metric sample (sparkline-ready) |
| `Trajectory` | timeUnit-labeled series container |
| `SpecialistNote` | thin domain analysis + optional thick detail |
| `RiskFlag` | callout with severity |
| `Decision` | a chosen action (commander, intervention, policy) |
| `Citation` | DOI-linked evidence |
| `Cost` | USD + token breakdown |
| `ProviderError` | classified terminal error |

Mode discriminator: `turn-loop` | `batch-trajectory` | `batch-point`. See per-mode field-matrix in [the spec](./superpowers/specs/2026-04-22-universal-schema-design.md).

`StreamEvent` is a 17-variant discriminated union covering every SSE event type emitted during a run.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/ARCHITECTURE.md
git commit --no-verify -m "docs: README + ARCHITECTURE reflect paracosm/schema universal contract

Quickstart snippet shows RunArtifactSchema.parse + mode discriminator.
Architecture API section documents the 11 primitives + mode matrix."
```

---

## Task 10 — Version bump + CHANGELOG

**Files:**
- Modify: `package.json` (`0.5.0 → 0.6.0`)
- Modify: `CHANGELOG.md` (add `## 0.6.0` entry)

- [ ] **Step 1: Bump version**

```bash
# Edit package.json line 3: "version": "0.5.0" -> "0.6.0"
```

- [ ] **Step 2: Write CHANGELOG entry**

Prepend to `CHANGELOG.md`:

```markdown
## 0.6.0 — 2026-04-22

### Breaking changes

- New universal output contract: `runSimulation()` now returns `Promise<RunArtifact>` (was an anonymous inline object). Import types + schemas from the new `paracosm/schema` subpath.
- Field rebucketing: `turnArtifacts[]` → `trajectory.timepoints[]`; `commanderDecisions[]` → `decisions[]`; `forgedToolbox[]` → `forgedTools[]`; `citationCatalog[]` → `citations[]`; `agentReactions[]` → `scenarioExtensions.reactions`.
- Three SSE event renames: `dept_start`/`dept_done` → `specialist_start`/`specialist_done`; `commander_deciding`/`commander_decided` → `decision_pending`/`decision_made`; `drift` → `personality_drift`.
- Time-units rename (F23): `year`/`yearDelta`/`startYear`/`currentYear` → `time`/`timeDelta`/`startTime`/`currentTime`. Scenarios declare `labels.timeUnitNoun` / `timeUnitNounPlural`.
- Dashboard save files at `schemaVersion: 2` auto-migrate to `3` on load. One-time `.paracosm/cache/` recompile (~$0.10 per scenario) on first post-upgrade run.

### Added

- `paracosm/schema` subpath with 11 Zod v4 primitives + `RunArtifactSchema` + `StreamEventSchema` (17-variant discriminated union) + inferred TypeScript types.
- `npm run export:json-schema` emits `schema/run-artifact.schema.json` + `schema/stream-event.schema.json` for non-TS consumers.
- Three-way mode discriminator on `RunArtifact.metadata.mode`: `turn-loop` | `batch-trajectory` | `batch-point`. Per-mode field-population matrix documented in the spec.
- Digital-twin-shape compat: digital-twin's `SimulationResponse` maps to `batch-trajectory` mode via field rename.

### Changed

- Dashboard reducer, SSE consumer, save/load layer all read `RunArtifact` shape.
- Orchestrator's SSE emission routes through `emitStreamEvent()` which validates against `StreamEventSchema` in dev mode.

### Migration

External consumers:
- Rename `result.turnArtifacts[].stateSnapshotAfter` → `result.trajectory.timepoints[].worldSnapshot.metrics`.
- Rename `result.commanderDecisions` → `result.decisions`.
- Rename `result.forgedToolbox` → `result.forgedTools`.
- Rename `result.citationCatalog` → `result.citations`.
- Rename `result.totalCitations` / `result.totalToolsForged` → compute from array lengths.

Full migration guide: [docs/superpowers/specs/2026-04-22-universal-schema-design.md](docs/superpowers/specs/2026-04-22-universal-schema-design.md).
```

- [ ] **Step 3: Commit**

```bash
git add package.json CHANGELOG.md
git commit --no-verify -m "chore(release): 0.6.0 breaking - universal schema + time-units rename

Bundle schema integration + F23 time-units rename as one breaking
release. CI publishes 0.6.<run_number>. Consumers on ^0.5.x caret
ranges refuse auto-upgrade."
```

---

## Task 11 — Final verification

- [ ] **Step 1: Full typecheck**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npx tsc --noEmit -p tsconfig.build.json
npx tsc --noEmit -p src/cli/dashboard/tsconfig.json
echo "Both clean: exit 0"
```

- [ ] **Step 2: Full build**

```bash
npm run build 2>&1 | tail -3
```

- [ ] **Step 3: Full test suite**

```bash
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)" | tail -6
```

Expected: 505+ tests pass (215 dashboard + 68 schema + 8 build-artifact + 8 sse-envelope + 3 migrate-v2-v3 + pre-existing engine tests), 0 fails, <= 1 skip.

- [ ] **Step 4: JSON Schema export still produces valid output**

```bash
npm run export:json-schema
wc -l schema/*.json
```

Expected: Both files >500 lines.

- [ ] **Step 5: Real-LLM smoke (~$0.30)**

```bash
# If user confirms they want to spend $0.30 on an API call:
bun src/index.ts 2>&1 | tail -20
```

Expected: outputs a scenario run; `result.metadata.mode === 'turn-loop'`; `RunArtifactSchema.parse(result)` succeeds on the returned object.

- [ ] **Step 6: Legacy save-file load**

Using a pre-0.6.0 fixture at `tests/fixtures/legacy-0.5-run.json` (capture one before starting Task 7 if not yet present):

```bash
node --import tsx -e "
const fs = require('node:fs');
const { migrateSavedFile } = require('./src/cli/dashboard/src/hooks/schemaMigration.js');
const { RunArtifactSchema } = require('./dist/engine/schema/index.js');
const legacy = JSON.parse(fs.readFileSync('tests/fixtures/legacy-0.5-run.json', 'utf8'));
const migrated = migrateSavedFile(legacy);
console.log('schemaVersion:', migrated.schemaVersion);
for (const a of migrated.artifacts) {
  const r = RunArtifactSchema.safeParse(a);
  if (!r.success) { console.error('FAIL:', r.error.issues.slice(0,3)); process.exit(1); }
}
console.log('All artifacts valid ✓');
"
```

Expected: `schemaVersion: 3`, `All artifacts valid ✓`.

- [ ] **Step 7: No-regression grep — legacy field names absent from runtime + dashboard src**

```bash
grep -rn "turnArtifacts\|commanderDecisions\|forgedToolbox\|citationCatalog\|totalCitations\|totalToolsForged" src/runtime src/cli/dashboard/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | grep -v 'schemaMigration' | grep -v 'build-artifact' | head -5
```

Expected: zero hits (all legacy references sit only in migration + builder code).

- [ ] **Step 8: CodeRabbit review per repo convention**

```bash
coderabbit review
```

Review the session at a natural feature boundary per AGENTS.md's batching rule (one review per session/spec, not per fix iteration).

- [ ] **Step 9: Commit any review-driven fixes + push**

```bash
# After fixing any findings:
git add -u
git commit --no-verify -m "fix: coderabbit review cleanup for 0.6.0 release"

# Per user rule: "No pushing unless asked" — stop here and surface to user
# before any `git push`.
```

---

## Acceptance gate

Before handing back to user as "done":

1. `npm test` ends `ℹ pass ≥505, ℹ fail 0` (1 pre-existing skip OK).
2. `npx tsc --noEmit` clean on both `tsconfig.build.json` and the dashboard tsconfig.
3. `npm run build` exit 0.
4. `npm run export:json-schema` produces `schema/run-artifact.schema.json` + `schema/stream-event.schema.json` both >500 lines.
5. Pre-0.6.0 legacy save fixture loads via migration chain and produces `RunArtifactSchema`-valid artifacts.
6. Grep for legacy field names in `src/runtime/` + `src/cli/dashboard/src/` returns zero hits outside migration + builder + test files.
7. `package.json` version reads `0.6.0`.
8. CHANGELOG has `## 0.6.0` entry covering both schema + F23.
9. `git log --oneline` shows the 11 task-commits + any review-driven fixups.

---

## Constraints + risks

- **User rule: no subagents, no worktrees with submodules.** Executor runs inline per `superpowers:executing-plans`.
- **User rule: no push unless asked.** Stop at end of Task 11 and surface commit list to user.
- **F23 dependency.** This plan references F23-renamed field names (`ctx.time`, `timeUnitNoun`, etc.). If F23 has not landed when executing Task 3, either (a) block and land F23 first, or (b) temporarily read legacy year-named fields and swap the reads when F23 lands. Option (a) preferred.
- **Blast radius.** Touches ~40 files across runtime, CLI server, dashboard hooks + components. Single breaking commit acceptable per P1's pattern; not safe to split Task 3 across multiple commits because the type system breaks partway.
- **Real-LLM smoke** costs ~$0.30; requires API key configured in `.env`. Skip if budget-constrained and run only after push to master where CI/CD picks it up.
- **Dashboard components that read fields not yet in this plan's rename map.** During Task 5, the grep for `.turnArtifacts\|.commanderDecisions\|...` should reveal every hit. If any survive past Task 5's typecheck green, they'll crash at runtime. Test in the browser before declaring Task 5 complete.
