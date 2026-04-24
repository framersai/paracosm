# Design: `WorldModel.fork()` + snapshot API

**Date:** 2026-04-24
**Status:** Approved for execution.
**Scope:** Spec 2A of the Tier 2 arc (backend fork API). Spec 2B (dashboard alternate-timeline UX) gets its own document once 2A ships.
**Depends on:** Tier 1 Phase B ([ed10e3a8](../../../)) which widened `TurnArtifact.stateSnapshotAfter` to the five-bag structural shape. The kernel snapshot in this spec consumes that shape.
**Code impact:** Additive. No breaking API changes. No `COMPILE_SCHEMA_VERSION` bump. `RunArtifact.metadata` gains one optional field.

---

## 1. Problem

Paracosm's positioning (structured world model + counterfactual world simulation model, see [positioning spec](2026-04-23-structured-world-model-positioning-design.md)) promises reproducible counterfactuals: same seed, different one variable, measurable divergence. The existing API forces users to re-run from turn 0 every time they want to explore a counterfactual. For a 6-turn run on OpenAI quality that costs ~$2-3 per exploration, and the first N turns get re-computed identically across every branch.

What the CWSM framing actually requires: fork any past turn, swap one variable (typically the leader's HEXACO profile or a custom event), and continue from there. Costs half. Matches the research lineage ([Kirfel et al, 2025](https://link.springer.com/article/10.1007/s43681-025-00718-4)). Closes the roadmap's Enterprise-tier line "Alternate Timelines: fork a simulation mid-run to explore 'what if' branches."

This spec delivers the programmatic API for that capability. The dashboard UX that sits on top ships in Spec 2B.

## 2. Feasibility (verified earlier)

From the feasibility sweep on 2026-04-23 (logged in the roadmap):

- `SimulationKernel.getState()` / `.export()` already use `structuredClone(this.state)` to deep-copy ([kernel.ts:160](../../src/engine/core/kernel.ts#L160), [kernel.ts:362](../../src/engine/core/kernel.ts#L362)). Serialization path is live.
- `SeededRng.state` is a single 32-bit integer. PRNG resume is `new SeededRng(seed)` then force `state` assignment.
- `SimulationState` top-level fields (`metadata`, `systems`, `agents`, `politics`, `statuses`, `environment`, `eventLog`) are all plain objects and arrays. No `Date`, no `Map`, no `Set`. Round-trips cleanly through `JSON.stringify` + `JSON.parse`.
- Tier 1 Phase B widened `TurnArtifact.stateSnapshotAfter` to carry all four runtime bags. The kernel snapshot uses the same five-bag shape.

Nothing blocks this work.

## 3. Design

Five surfaces, tight boundaries, independent tests.

### 3.1 Kernel snapshot + restore

New exports from `src/engine/core/kernel.ts` (or a new sibling `src/engine/core/snapshot.ts` if the kernel file is already too large; decision deferred to the plan step).

```typescript
/** Serializable kernel state bundle. Versioned so future migrations
 *  can land without a silent drift. */
export interface KernelSnapshot {
  /** Format discriminator. Bump when the shape changes. Version 1 is
   *  the shape spec'd here. */
  snapshotVersion: 1;
  /** Scenario id the snapshot was taken against. `fork` asserts a
   *  match before restoring; cross-scenario forks throw. */
  scenarioId: string;
  /** Turn index the snapshot captures state AT THE END OF. A snapshot
   *  taken after `kernel.advanceTurn(3, …)` has `turn = 3` and
   *  represents the state going into turn 4. */
  turn: number;
  /** Simulation wall-clock time that corresponds to `turn`. Used by
   *  downstream SimulationMetadata reconstruction. */
  time: number;
  /** Full five-bag SimulationState, deep-cloned at capture time. */
  state: SimulationState;
  /** Mulberry32 PRNG state at capture. Resumed verbatim on restore. */
  rngState: number;
  /** Starting values restored into SimulationMetadata so the resumed
   *  kernel reports the same origin as the original run. */
  startTime: number;
  /** Original seed integer (SeededRng is re-hydrated with this plus
   *  the exact state override above). */
  seed: number;
}

class SimulationKernel {
  /** Current method, preserved for back-compat. */
  getState(): SimulationState;
  /** Current method, preserved for back-compat. */
  export(): SimulationState;

  /** Capture a snapshot bundle that can be round-tripped through JSON
   *  and restored via {@link SimulationKernel.fromSnapshot}. */
  toSnapshot(scenarioId: string): KernelSnapshot;

  /** Reverse of toSnapshot. Constructs a fresh kernel positioned at
   *  the snapshot's turn, with state + PRNG restored. Throws on
   *  scenario-id mismatch or snapshotVersion that isn't 1. */
  static fromSnapshot(snap: KernelSnapshot, scenarioId: string): SimulationKernel;
}
```

### 3.2 `WorldModel` façade additions

New methods on the existing `WorldModel` class at [src/runtime/world-model/index.ts](../../src/runtime/world-model/index.ts).

```typescript
/** Snapshot of a `WorldModel` positioned at a specific turn. Contains
 *  everything needed to reconstruct an equivalent WorldModel. */
export interface WorldModelSnapshot {
  snapshotVersion: 1;
  /** Kernel state at capture time. */
  kernel: KernelSnapshot;
  /** Run-id the snapshot was captured from, when available.
   *  `undefined` when snapshotting a kernel that never lived inside a
   *  runSimulation() call (tests, direct kernel manipulation). */
  parentRunId?: string;
}

/** Reserved options accepted by `fork()`. */
export interface ForkOptions {
  /** Reserved for a future single-call fork API. Pass the leader to
   *  the subsequent `.simulate()` call today. */
  leader?: LeaderConfig;
  /** Reserved for a future single-call fork API. Pass the seed to the
   *  subsequent `.simulate()` call today. */
  seed?: number;
  /** Reserved for a future single-call fork API. Pass custom events to
   *  the subsequent `.simulate()` call today. */
  customEvents?: Array<{ turn: number; title: string; description: string }>;
}

class WorldModel {
  // Existing: fromJson, fromScenario, simulate, batch, scenario

  /** Capture a snapshot of the most recent simulate() invocation's
   *  terminal kernel state. Requires a prior simulate() to have run
   *  at least one turn on this WorldModel; throws otherwise. */
  snapshot(): WorldModelSnapshot;

  /** Construct a new WorldModel positioned at the snapshot's turn.
   *  Scenario must match snapshot.kernel.scenarioId; otherwise throws.
   *  The new WorldModel has no prior run, is ready for .simulate(leader, opts)
   *  to resume. `forkedFrom` metadata is threaded onto the resulting
   *  RunArtifact's `metadata.forkedFrom` so audit chains reconstruct. */
  fork(snapshot: WorldModelSnapshot, opts?: ForkOptions): Promise<WorldModel>;

  /** Convenience: pulls snapshot[atTurn] from
   *  `artifact.scenarioExtensions.kernelSnapshotsPerTurn` (populated
   *  when the parent run was created with `captureSnapshots: true`)
   *  and calls fork(). Throws a clear error pointing at
   *  captureSnapshots when the artifact has no embedded snapshots. */
  forkFromArtifact(artifact: RunArtifact, atTurn: number, opts?: ForkOptions): Promise<WorldModel>;
}
```

### 3.3 `runSimulation` opt-in snapshot capture

One new field on `RunOptions` at [src/runtime/orchestrator.ts](../../src/runtime/orchestrator.ts):

```typescript
interface RunOptions {
  // Existing fields unchanged.

  /**
   * Capture a kernel snapshot at the end of every turn and stash the
   * array under `artifact.scenarioExtensions.kernelSnapshotsPerTurn`.
   * Enables `WorldModel.forkFromArtifact(artifact, atTurn)` on the
   * returned artifact. Default OFF so normal runs stay lean
   * (snapshots add ~100 KB per turn for 100-agent Mars). Turn on
   * for runs you intend to fork later.
   */
  captureSnapshots?: boolean;
}
```

Behavior when `captureSnapshots: true`:
- At the end of each turn, `kernel.toSnapshot(scenario.id)` is called and pushed into an internal array.
- `buildRunArtifact` reads the array and merges into `inputs.scenarioExtensionsExtra.kernelSnapshotsPerTurn`.
- Final artifact has `scenarioExtensions.kernelSnapshotsPerTurn: KernelSnapshot[]` with entries ordered by turn.

Behavior when `captureSnapshots: false` (default):
- Same as today. Zero overhead.

### 3.4 Artifact metadata addition

One new optional field on `RunMetadataSchema` at [src/engine/schema/primitives.ts](../../src/engine/schema/primitives.ts):

```typescript
export const RunMetadataSchema = z.object({
  // Existing fields unchanged.

  /** When this run was produced by forking a prior run, records the
   *  parent run-id and the turn at which the fork happened. Consumers
   *  walking a fork chain follow this link transitively through
   *  stored artifacts. Omitted for fresh (non-forked) runs. */
  forkedFrom: z.object({
    parentRunId: z.string().min(1),
    atTurn: z.number().int().min(0),
  }).optional(),
});
```

The field lives on `RunMetadata` directly (not in `scenarioExtensions`) because it's universally meaningful: any consumer of any `RunArtifact` benefits from typed access to "where did this branch come from."

No `COMPILE_SCHEMA_VERSION` bump: adding an optional field is backward-compatible for both schema validation and consumer code. Existing artifacts round-trip cleanly.

### 3.5 Orchestrator wiring

Two small changes in `src/runtime/orchestrator.ts`:

1. **Snapshot capture loop.** When `captureSnapshots: true`, maintain a `kernelSnapshots: KernelSnapshot[]` array and push `kernel.toSnapshot(scenario.id)` after each turn's kernel advance.
2. **Metadata forwarding.** `runSimulation` accepts a new internal-only `_forkedFrom` parameter (not on `RunOptions`; set by `WorldModel.fork` under the hood) that populates `artifact.metadata.forkedFrom`.

The public `runSimulation` signature stays backward-compatible. Forkedness threads through via an internal option that only `WorldModel.fork` sets.

## 4. Data flow

### 4.1 Snapshot then fork (in-memory)

```typescript
const wm = await WorldModel.fromJson(worldJson);
const artifact = await wm.simulate(visionaryLeader, { maxTurns: 6, seed: 42 });
// wm is now "used"; snapshot() returns the terminal kernel state
const snap = wm.snapshot();

const wm2 = await wm.fork(snap);
const artifactB = await wm2.simulate(pragmatistLeader, { maxTurns: 9 });
// artifactB.metadata.forkedFrom === { parentRunId: artifact.metadata.runId, atTurn: 6 }
```

For fork-at-turn-N (not terminal), capture snapshots during the first run:

```typescript
const artifact = await wm.simulate(visionaryLeader, {
  maxTurns: 6, seed: 42, captureSnapshots: true,
});

const wm2 = await wm.forkFromArtifact(artifact, 3);
const artifactB = await wm2.simulate(pragmatistLeader, { maxTurns: 6 });
// artifactB.metadata.forkedFrom === { parentRunId: artifact.metadata.runId, atTurn: 3 }
```

### 4.2 Snapshot then fork (disk)

```typescript
const artifact = await wm.simulate(visionaryLeader, {
  maxTurns: 6, seed: 42, captureSnapshots: true,
});
fs.writeFileSync('run.json', JSON.stringify(artifact, null, 2));

// Later, different process:
const reloaded = JSON.parse(fs.readFileSync('run.json', 'utf8')) as RunArtifact;
const wm2 = await wm.forkFromArtifact(reloaded, 3);
const artifactB = await wm2.simulate(pragmatistLeader, { maxTurns: 6 });
```

### 4.3 Determinism invariant

For the same scenario + same seed + same leader, these two flows produce byte-equal kernel state at turn 6:

- **Continuous:** `wm.simulate(leader, { maxTurns: 6, seed: 42 })`
- **Fork-continued:** `wm.simulate(leader, { maxTurns: 3, seed: 42, captureSnapshots: true })` then `wm.forkFromArtifact(artifact, 3).simulate(leader, { maxTurns: 6 })`

LLM-driven stages (director, departments, commander, reactions) may diverge because the LLM provider isn't deterministic. The kernel stages (progression, mortality, births, RNG-driven agent generation) MUST byte-equal. This is the central test of correctness.

## 5. What's deliberately not in scope

Items that could land in follow-ups but are out of this spec:

- **`WorldModel.replay(artifact): Promise<WorldModel>`.** Deterministic re-execution of a stored artifact's decisions without new LLM calls. Useful for audit. Deferred to a T5.5 plan. No user currently requesting it.
- **Cross-scenario forks.** `fork()` asserts `snapshot.kernel.scenarioId === this.scenario.id`. Cross-scenario semantics are unclear and no use case is pushing for them. Explicit error, not silent.
- **Fork genealogy visualization.** `forkedFrom` is a single-parent link. A multi-branch genealogy tree is Spec 2B's dashboard scope.
- **Snapshot compaction.** For 100-agent 24-turn runs, the `kernelSnapshotsPerTurn` array could reach multi-megabyte size. No streaming or delta encoding in 2A; if it becomes a pain point, follow-up with a delta-snapshot mode.
- **Replay-for-regression CI mode.** Running `forkFromArtifact(artifact, 0)` on every stored artifact in CI to catch kernel regressions is an idea for later. The hooks are in place after 2A but the CI integration isn't.
- **Dashboard UX.** Spec 2B.

## 6. Tests

New test file: `tests/runtime/world-model/snapshot-fork.test.ts` (the existing WorldModel façade test is at `tests/runtime/world-model.test.ts`; this new file is adjacent because it's the larger block).

Coverage plan:

1. **Kernel round-trip structural.** `toSnapshot` followed by `JSON.stringify` + `JSON.parse` + `fromSnapshot` produces a kernel whose `getState()` deep-equals the original's `getState()`.
2. **Kernel determinism invariant.** Advance kernel to turn 3, `toSnapshot`, `fromSnapshot`, advance 3 more turns. Compare against a fresh kernel that advanced 6 turns continuously with the same seed. `structuredClone(a) === structuredClone(b)` via deep-equal on all five state bags.
3. **SeededRng round-trip.** Snapshot → restore → next `rng.next()` matches continuous `rng.next()` at the same position.
4. **`WorldModel.snapshot()` throws when no prior simulate.** Clear error message pointing at the need for a prior run.
5. **`WorldModel.fork()` scenario mismatch throws.** `fork(snapFromLunar)` on a Mars WorldModel throws with a message naming both scenario ids.
6. **`WorldModel.forkFromArtifact` without captureSnapshots throws.** Error message includes the `captureSnapshots: true` pointer.
7. **`WorldModel.forkFromArtifact` with captureSnapshots succeeds.** Builds a WorldModel ready for `.simulate()` from a persisted artifact's embedded snapshots.
8. **`forkedFrom` metadata lands on the child artifact.** Parent artifact's runId + the fork-turn match.
9. **JSON round-trip preserves all snapshot fields.** Specifically: `rngState` (number) survives, `hexacoHistory` arrays on every agent survive, `eventLog` survives.
10. **`snapshotVersion: 1` is set on every snapshot produced.**
11. **Agent hexaco history continues past fork.** After fork + 3 more turns, every agent's `hexacoHistory.length` equals pre-fork length + 3. Regression guard against the "forked kernel starts a fresh history" bug.

No real-LLM tests in 2A. The `WorldModel.fork(...).simulate(...)` path is covered indirectly by Spec 2B's dashboard tests once they exist; for 2A, unit coverage of the kernel invariants plus façade shape is sufficient.

All tests: `node --import tsx --test tests/runtime/world-model/snapshot-fork.test.ts`. Target: 11 tests.

## 7. Docs

1. **JSDoc on every new symbol.** Match the voice + depth of the existing `WorldModel` class file. Every public method gets `@param`, `@returns`, `@throws`, and an `@example` block.
2. **README** (paracosm): new section titled "Counterfactual simulations with `WorldModel.fork()`", placed after the existing "Counterfactual first" bullet in the opener. ~15 lines + one worked code sample using the in-memory fork flow.
3. **Positioning map** (`docs/positioning/world-model-mapping.md`): §4 "Counterfactual World Simulation Models (CWSMs)" gains a closing line "Paracosm ships `WorldModel.fork()` in v0.7.x+ for this pattern; see API reference."
4. **Roadmap** (`docs/superpowers/plans/2026-04-23-paracosm-roadmap.md`): move Tier 2 to "Shipped" with commit hashes.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Snapshot captures too much memory on long runs | `captureSnapshots` defaults OFF; only opt-in. Document the size cost in the RunOptions JSDoc. |
| Kernel state drift between snapshot + continuous paths over many turns | Tests 2 and 11 cover this. If drift appears, the deterministic kernel has a bug (not the snapshot); fix upstream. |
| `SeededRng.state` is a private field today | Access via a getter, add if not present. The pull-through is one line. |
| Agent objects mutate in-place during kernel.advanceTurn | Already addressed: kernel uses `structuredClone` when exporting, and snapshots capture the clone, not a live reference. |
| Users serialize a snapshot and expect it to work with a future paracosm version | `snapshotVersion: 1` guards against silent drift. On mismatch, `fromSnapshot` throws with a migration pointer (v2 would add a migration fn). |
| `forkedFrom` on metadata makes old artifacts fail validation | Optional field on Zod, backward compatible. Old artifacts parse successfully; they just don't have the field populated. |

## 9. Success criteria

1. Tests: 592 baseline → 603 pass / 0 fail / 1 skip (11 new tests from §6).
2. `tsc --noEmit` stays clean (only pre-existing Zod-v4 warnings).
3. `npm run build` exit 0; `dist/runtime/world-model/index.js` + `dist/engine/core/kernel.js` emit updated signatures.
4. Worked example from §4.1 runs end-to-end in a quick scripted test with a fake LLM provider (deterministic). Kernel round-trip byte-equal verification passes.
5. README + positioning-map reflect the new API. JSDoc complete on every new symbol.
6. `captureSnapshots: true` on a 6-turn Mars run adds no more than ~500 KB to the artifact JSON (rough bound; real size verified in the test).
7. Zero new em-dashes in any authored file.

## 10. Execution order

Maps to the implementation plan we'll write next:

1. Add `KernelSnapshot` type + `SimulationKernel.toSnapshot` / `fromSnapshot` + unit tests (round-trip + determinism invariant).
2. Add `WorldModelSnapshot` + `ForkOptions` + `WorldModel.snapshot()` + `WorldModel.fork()` + façade tests.
3. Add `RunOptions.captureSnapshots` + orchestrator capture loop + artifact embedding via `scenarioExtensionsExtra`.
4. Add `RunMetadata.forkedFrom` optional field to `RunMetadataSchema` + `buildRunArtifact` passthrough + `WorldModel.fork` plumbing to thread the parent id.
5. Add `WorldModel.forkFromArtifact` + failure-path test.
6. Add `RunArtifactSchema.parse` round-trip test to confirm artifacts with/without `forkedFrom` + with/without `kernelSnapshotsPerTurn` both validate.
7. JSDoc pass on every new symbol.
8. README + positioning-map updates.
9. Roadmap shipped-section move.
10. Single atomic commit (matches user's commit-batching preference): "feat(world-model): fork + snapshot API for mid-run counterfactual branching".

## 11. References

- Roadmap Tier 2 sketch: [`2026-04-23-paracosm-roadmap.md`](../plans/2026-04-23-paracosm-roadmap.md#tier-2-worldmodelforkatturn-session-after-tier-1)
- Positioning spec: [`2026-04-23-structured-world-model-positioning-design.md`](2026-04-23-structured-world-model-positioning-design.md)
- Positioning map (CWSM section): [`../positioning/world-model-mapping.md`](../../positioning/world-model-mapping.md)
- Kirfel et al, 2025, "When AI meets counterfactuals: the ethical implications of counterfactual world simulation models" ([PDF](https://link.springer.com/article/10.1007/s43681-025-00718-4))
- Related LLM-counterfactual research: [AXIS, arXiv 2505.17801](https://arxiv.org/html/2505.17801v1); [Counterfactual Effect Decomposition in Multi-Agent Sequential Decision Making, ICML 2025](https://icml.cc/virtual/2025/poster/44311)
- Existing kernel export: [kernel.ts:160](../../src/engine/core/kernel.ts#L160)
- Existing `WorldModel` facade: [src/runtime/world-model/index.ts](../../src/runtime/world-model/index.ts)
