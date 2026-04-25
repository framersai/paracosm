# Replay endpoint + Library verification loop closure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. **Do NOT** use `superpowers:subagent-driven-development` — paracosm work is constrained by the user's "no subagents" rule (see CLAUDE.md and `feedback_no_subagents.md`). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Library tab's Replay button work end to end against a populated `runs.db` by adding `POST /api/v1/runs/:runId/replay`, plus close two adjacent verification gaps (dashboard tsc parity + CI lockfile-contamination guard).

**Architecture:** New route block inserted into the existing platform-api dispatcher; receives a `scenarioLookup` callback wired by `server-app.ts` so the route can look up the original scenario from the in-memory catalog and reconstruct a `WorldModel` for replay. The route mirrors the conservative error-response pattern (pass `runId` only, not the full `record`) used by the concurrently-hardened detail GET on the same handler.

**Tech Stack:** TypeScript, node:test runner, node:http, SQLite (`better-sqlite3` via `createSqliteRunHistoryStore`), `@framers/agentos` (transitively via `paracosm/runtime`), GitHub Actions workflow YAML.

**Spec:** [`docs/superpowers/specs/2026-04-26-replay-endpoint-and-verification-loop-design.md`](../specs/2026-04-26-replay-endpoint-and-verification-loop-design.md).

**Working directory:** Always `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm` before any command. paracosm is a submodule with its own remote (`framersai/paracosm`); never run paracosm commands from monorepo root.

**Push policy:** Each task commits to paracosm `master` locally. Do NOT push until the user explicitly says "push". Per the user's "no pushing unless asked" rule.

---

## File map

**Created:**
- `tests/cli/platform-api-runs.test.ts` modifications (no new files)

**Modified:**
- `src/cli/server/routes/platform-api.ts` — add `scenarioLookup` to `HandlePlatformApiOptions` (Task 1) + insert new replay route (Task 3)
- `src/cli/server-app.ts` — extend `handlePlatformApiRoute` call site with the lookup closure (Task 1)
- `tests/cli/platform-api-runs.test.ts` — extend `ENABLED` constant + append helpers + 7 new tests (Tasks 1+2)
- `package.json` — add `typecheck:dashboard` script + chain into `test` script (Task 4)
- `.github/workflows/deploy.yml` — insert pnpm-contamination guard before `npm ci` (Task 5)
- `docs/ARCHITECTURE.md` — add HTTP-surface paragraph under existing "Replay" section (Task 6)

**Read-only references (do NOT modify):**
- `src/runtime/world-model/index.ts:582-594` — `WorldModel.replay` already implemented
- `src/runtime/orchestrator.ts:2049-2138` — `WorldModelReplayError` + `replaySimulation`
- `src/cli/dashboard/src/components/library/hooks/useReplayRun.ts` — client contract (already targets the URL + consumes the response shape this plan produces)
- `tests/runtime/world-model/replay.test.ts:19-52` — `captureSnapshots` + `syntheticArtifact` helpers (we copy these verbatim into the new test in Task 2)

---

## Concurrent-session awareness

`src/cli/server/routes/platform-api.ts` has uncommitted modifications from another session (visible via `git diff src/cli/server/routes/platform-api.ts`). The mods harden the existing `/replay-result` and detail GET routes to use `runId` rather than `record` in error bodies. Our new route in Task 3 mirrors that pattern. When the concurrent session commits, the line numbers in this plan shift by ~13 lines but the insertion points (after `/replay-result` block, before `:runId` detail GET regex) are unchanged.

**If the concurrent session has landed before this plan executes:** the existing tests in `tests/cli/platform-api-runs.test.ts` may have changed shape too. Re-read the file before adding helpers/tests in Task 2 and follow whatever scaffolding pattern is current.

---

## Pre-flight verification

Run before starting Task 1 to confirm the spec's audit is still accurate:

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git log --oneline -3                                          # expect 710f6e3f, 9ec24075, 5ea29fec
npx tsc --noEmit 2>&1 | grep -c "error TS"                    # expect 0
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)" | tail -5
# expect: tests 817 / pass 816 / fail 0 / skipped 1
```

If these don't match, stop and reconcile before proceeding.

---

## Task 1: Extend `HandlePlatformApiOptions` with `scenarioLookup`

**Files:**
- Modify: `src/cli/server/routes/platform-api.ts:28-40` (interface) + add import at top of file
- Modify: `src/cli/server-app.ts:824` (handler call site)
- Modify: `tests/cli/platform-api-runs.test.ts:58` (ENABLED constant)

- [ ] **Step 1.1: Add `ScenarioPackage` import to `platform-api.ts`**

Open `src/cli/server/routes/platform-api.ts`. Locate the existing imports at the top (lines 1-3 currently). Add a new import line so the imports become:

```ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ListRunsFilters, RunHistoryStore } from '../run-history-store.js';
import type { ParacosmServerMode } from '../server-mode.js';
import type { ScenarioPackage } from '../../../engine/types.js';
```

- [ ] **Step 1.2: Add `scenarioLookup` field to `HandlePlatformApiOptions`**

In the same file, locate `export interface HandlePlatformApiOptions` (currently line 28). Add the new field:

```ts
export interface HandlePlatformApiOptions {
  runHistoryStore: RunHistoryStore;
  corsHeaders: Record<string, string>;
  /**
   * When false, every /api/v1/runs* route returns 403. When true, the
   * routes serve normally. Configured at server-app caller via
   * PARACOSM_ENABLE_RUN_HISTORY_ROUTES env var; default true except in
   * hosted_demo (where the public-demo billing surface should not expose
   * run-history without explicit opt-in).
   */
  paracosmRoutesEnabled: boolean;
  /**
   * Resolves a scenarioId to its compiled ScenarioPackage. The route
   * handler uses this to construct a WorldModel for replay. Returns
   * undefined when the id is not in the catalog (built-in or custom).
   * Wired by server-app.ts as `(id) => customScenarioCatalog.get(id)?.scenario`.
   */
  scenarioLookup: (scenarioId: string) => ScenarioPackage | undefined;
}
```

- [ ] **Step 1.3: Update `server-app.ts` call site**

Open `src/cli/server-app.ts`. Find the `handlePlatformApiRoute` call (currently line 824). Change from:

```ts
if (await handlePlatformApiRoute(req, res, { runHistoryStore, corsHeaders, paracosmRoutesEnabled })) {
  return;
}
```

to:

```ts
if (await handlePlatformApiRoute(req, res, {
  runHistoryStore,
  corsHeaders,
  paracosmRoutesEnabled,
  scenarioLookup: (id) => customScenarioCatalog.get(id)?.scenario,
})) {
  return;
}
```

`customScenarioCatalog` is already in scope (declared at `server-app.ts:380`).

- [ ] **Step 1.4: Update `ENABLED` test constant**

Open `tests/cli/platform-api-runs.test.ts`. Find the `ENABLED` constant (currently line 58: `const ENABLED = { paracosmRoutesEnabled: true };`). Change to:

```ts
const ENABLED = {
  paracosmRoutesEnabled: true,
  scenarioLookup: () => undefined,
};
```

The stub returns undefined for all ids; existing tests don't exercise the replay path so they don't care about the lookup result.

- [ ] **Step 1.5: Run tsc + tests to confirm no regression**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npx tsc --noEmit
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)" | tail -5
```

Expected: tsc 0 errors. Tests: `tests 817 / pass 816 / fail 0 / skipped 1`.

If tsc errors: most likely cause is a missed callsite of `handlePlatformApiRoute`. Run `grep -rn "handlePlatformApiRoute" src/ tests/` to find others; the spec's audit confirms only the two updated above exist.

- [ ] **Step 1.6: Em-dash sweep on changed files**

```bash
perl -ne 'print "$ARGV:$.: $_" if /\x{2014}/' \
  src/cli/server/routes/platform-api.ts \
  src/cli/server-app.ts \
  tests/cli/platform-api-runs.test.ts
```

Expected: no output.

- [ ] **Step 1.7: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/cli/server/routes/platform-api.ts src/cli/server-app.ts tests/cli/platform-api-runs.test.ts
git commit -m "$(cat <<'EOF'
feat(platform-api): add scenarioLookup option for replay route

Adds a required scenarioLookup field to HandlePlatformApiOptions so a
follow-up replay endpoint can resolve `artifact.metadata.scenario.id`
back to the compiled ScenarioPackage. server-app wires it from
customScenarioCatalog; the existing test fixture's ENABLED constant
stubs it as () => undefined since current tests don't exercise the
replay path.

No behavioral change yet. Existing 817 tests still pass.
EOF
)"
```

---

## Task 2: Append seven failing tests for the replay endpoint

**Files:**
- Modify: `tests/cli/platform-api-runs.test.ts` (append at end)

The seven tests cover happy path (match + diverge), four guard clauses (404, 410 artifact_unavailable, 410 scenario_unavailable, 422 preconditions), and counter persistence. Helpers (`captureSnapshots`, `syntheticArtifact`) are copied from `tests/runtime/world-model/replay.test.ts:19-52` because they are scenario-agnostic and there is no shared-fixture extraction in this plan.

- [ ] **Step 2.1: Add new imports + helpers + the seven tests**

Open `tests/cli/platform-api-runs.test.ts`. Append at the end of the file:

```ts
// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/runs/:runId/replay tests
// Helpers copied from tests/runtime/world-model/replay.test.ts:19-52.
// ─────────────────────────────────────────────────────────────────────
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { SimulationKernel } from '../../src/engine/core/kernel.js';
import { marsScenario } from '../../src/engine/mars/index.js';
import type { RunArtifact } from '../../src/engine/schema/index.js';
import type { KernelSnapshot } from '../../src/engine/core/snapshot.js';
import type { ScenarioPackage } from '../../src/engine/types.js';

function captureMarsSnapshots(turns: number, seed = 42): KernelSnapshot[] {
  const kernel = new SimulationKernel(seed, 'leader-a', [], {
    startTime: marsScenario.setup.defaultStartTime,
    scenario: marsScenario,
  });
  const snapshots: KernelSnapshot[] = [kernel.toSnapshot(marsScenario.id)];
  for (let t = 1; t <= turns; t++) {
    kernel.advanceTurn(t, marsScenario.setup.defaultStartTime + t, marsScenario.hooks?.progressionHook);
    snapshots.push(kernel.toSnapshot(marsScenario.id));
  }
  return snapshots;
}

function syntheticReplayArtifact(snaps: KernelSnapshot[], scenarioId = marsScenario.id): RunArtifact {
  return {
    metadata: {
      runId: 'replay-test-run',
      scenario: { id: scenarioId, name: marsScenario.labels.name },
      mode: 'turn-loop',
      startedAt: '2026-04-26T00:00:00.000Z',
      seed: 42,
    },
    decisions: snaps.slice(0, -1).map((_, i) => ({
      id: `dec-${i}`,
      turn: i + 1,
      label: `Test decision turn ${i + 1}`,
      chosenOptionId: 'safe',
      reasoning: 'test',
    })),
    scenarioExtensions: {
      kernelSnapshotsPerTurn: snaps,
    },
  } as unknown as RunArtifact;
}

function writeArtifactToTemp(artifact: RunArtifact): string {
  const dir = mkdtempSync(join(tmpdir(), 'paracosm-replay-test-'));
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, 'artifact.json');
  writeFileSync(path, JSON.stringify(artifact, null, 2));
  return path;
}

function lookupReturning(scenario: ScenarioPackage | undefined): (id: string) => ScenarioPackage | undefined {
  return () => scenario;
}

test('POST /api/v1/runs/:runId/replay returns 200 + matches=true on equal-snapshot replay', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  const snaps = captureMarsSnapshots(3);
  const artifact = syntheticReplayArtifact(snaps);
  const artifactPath = writeArtifactToTemp(artifact);
  await store.insertRun(makeRun({ runId: 'r-replay-match', scenarioId: marsScenario.id, artifactPath }));

  const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  const handled = await handlePlatformApiRoute(
    makeReq('/api/v1/runs/r-replay-match/replay', 'POST'),
    makeRes(captured),
    { runHistoryStore: store, corsHeaders: {}, paracosmRoutesEnabled: true, scenarioLookup: lookupReturning(marsScenario) },
  );
  assert.equal(handled, true);
  assert.equal(captured.statusCode, 200);
  const body = JSON.parse(captured.body);
  assert.equal(body.matches, true, `expected matches=true; divergence: ${body.divergence}`);
  assert.equal(body.divergence, '');
});

test('POST /api/v1/runs/:runId/replay returns 200 + matches=false with divergence on tampered snapshots', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  const snaps = captureMarsSnapshots(3);
  const tampered = JSON.parse(JSON.stringify(snaps)) as KernelSnapshot[];
  (tampered[2].state as unknown as { metrics: Record<string, number> }).metrics.morale = 0.123456789;
  const artifact = syntheticReplayArtifact(tampered);
  const artifactPath = writeArtifactToTemp(artifact);
  await store.insertRun(makeRun({ runId: 'r-replay-diverge', scenarioId: marsScenario.id, artifactPath }));

  const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  const handled = await handlePlatformApiRoute(
    makeReq('/api/v1/runs/r-replay-diverge/replay', 'POST'),
    makeRes(captured),
    { runHistoryStore: store, corsHeaders: {}, paracosmRoutesEnabled: true, scenarioLookup: lookupReturning(marsScenario) },
  );
  assert.equal(handled, true);
  assert.equal(captured.statusCode, 200);
  const body = JSON.parse(captured.body);
  assert.equal(body.matches, false);
  assert.ok(body.divergence.length > 0 && body.divergence.startsWith('/'), `divergence must start with /, got: ${body.divergence}`);
});

test('POST /api/v1/runs/:runId/replay returns 404 for unknown runId', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  const handled = await handlePlatformApiRoute(
    makeReq('/api/v1/runs/r-missing/replay', 'POST'),
    makeRes(captured),
    { runHistoryStore: store, corsHeaders: {}, paracosmRoutesEnabled: true, scenarioLookup: () => undefined },
  );
  assert.equal(handled, true);
  assert.equal(captured.statusCode, 404);
  const body = JSON.parse(captured.body);
  assert.equal(body.error, 'not_found');
  assert.equal(body.runId, 'r-missing');
});

test('POST /api/v1/runs/:runId/replay returns 410 artifact_unavailable when artifactPath missing', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  await store.insertRun(makeRun({ runId: 'r-no-path', scenarioId: marsScenario.id /* no artifactPath */ }));

  const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  const handled = await handlePlatformApiRoute(
    makeReq('/api/v1/runs/r-no-path/replay', 'POST'),
    makeRes(captured),
    { runHistoryStore: store, corsHeaders: {}, paracosmRoutesEnabled: true, scenarioLookup: lookupReturning(marsScenario) },
  );
  assert.equal(handled, true);
  assert.equal(captured.statusCode, 410);
  const body = JSON.parse(captured.body);
  assert.equal(body.error, 'artifact_unavailable');
  assert.equal(body.runId, 'r-no-path');
  assert.equal(body.record, undefined, 'must not leak full record');
});

test('POST /api/v1/runs/:runId/replay returns 410 scenario_unavailable when scenario not in catalog', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  const snaps = captureMarsSnapshots(2);
  const artifact = syntheticReplayArtifact(snaps, 'unknown-scenario-xyz');
  const artifactPath = writeArtifactToTemp(artifact);
  await store.insertRun(makeRun({ runId: 'r-no-scenario', scenarioId: 'unknown-scenario-xyz', artifactPath }));

  const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  const handled = await handlePlatformApiRoute(
    makeReq('/api/v1/runs/r-no-scenario/replay', 'POST'),
    makeRes(captured),
    { runHistoryStore: store, corsHeaders: {}, paracosmRoutesEnabled: true, scenarioLookup: () => undefined },
  );
  assert.equal(handled, true);
  assert.equal(captured.statusCode, 410);
  const body = JSON.parse(captured.body);
  assert.equal(body.error, 'scenario_unavailable');
  assert.equal(body.scenarioId, 'unknown-scenario-xyz');
});

test('POST /api/v1/runs/:runId/replay returns 422 when artifact missing kernelSnapshotsPerTurn', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  const artifactNoSnaps = {
    metadata: {
      runId: 'no-snaps',
      scenario: { id: marsScenario.id, name: 'Mars' },
      mode: 'turn-loop',
      startedAt: '2026-04-26T00:00:00.000Z',
    },
    decisions: [{ id: 'd', turn: 1, label: 'x', chosenOptionId: 'a' }],
  } as unknown as RunArtifact;
  const artifactPath = writeArtifactToTemp(artifactNoSnaps);
  await store.insertRun(makeRun({ runId: 'r-no-snaps', scenarioId: marsScenario.id, artifactPath }));

  const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
  const handled = await handlePlatformApiRoute(
    makeReq('/api/v1/runs/r-no-snaps/replay', 'POST'),
    makeRes(captured),
    { runHistoryStore: store, corsHeaders: {}, paracosmRoutesEnabled: true, scenarioLookup: lookupReturning(marsScenario) },
  );
  assert.equal(handled, true);
  assert.equal(captured.statusCode, 422);
  const body = JSON.parse(captured.body);
  assert.equal(body.error, 'replay_preconditions_unmet');
  assert.match(body.message, /per-turn kernel snapshots/);
});

test('POST /api/v1/runs/:runId/replay calls recordReplayResult with the right argument on each attempt', async () => {
  const baseStore = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  const calls: Array<[string, boolean]> = [];
  const wrapStore = {
    ...baseStore,
    recordReplayResult: async (runId: string, matches: boolean) => {
      calls.push([runId, matches]);
      await baseStore.recordReplayResult?.(runId, matches);
    },
  };

  // Match path
  const snapsMatch = captureMarsSnapshots(2);
  const matchArtifact = syntheticReplayArtifact(snapsMatch);
  const matchPath = writeArtifactToTemp(matchArtifact);
  await wrapStore.insertRun(makeRun({ runId: 'r-counter-match', scenarioId: marsScenario.id, artifactPath: matchPath }));

  // Diverge path
  const snapsDiverge = JSON.parse(JSON.stringify(captureMarsSnapshots(2))) as KernelSnapshot[];
  (snapsDiverge[1].state as unknown as { metrics: Record<string, number> }).metrics.morale = 0.987654321;
  const divergeArtifact = syntheticReplayArtifact(snapsDiverge);
  const divergePath = writeArtifactToTemp(divergeArtifact);
  await wrapStore.insertRun(makeRun({ runId: 'r-counter-diverge', scenarioId: marsScenario.id, artifactPath: divergePath }));

  for (const runId of ['r-counter-match', 'r-counter-diverge']) {
    const captured: CapturedResponse = { statusCode: 0, body: '', headers: {} };
    await handlePlatformApiRoute(
      makeReq(`/api/v1/runs/${runId}/replay`, 'POST'),
      makeRes(captured),
      { runHistoryStore: wrapStore, corsHeaders: {}, paracosmRoutesEnabled: true, scenarioLookup: lookupReturning(marsScenario) },
    );
  }

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ['r-counter-match', true]);
  assert.deepEqual(calls[1], ['r-counter-diverge', false]);
});
```

- [ ] **Step 2.2: Run the tests to confirm all 7 fail**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)" | tail -5
```

Expected: `tests 824 / pass 817 / fail 7 / skipped 1`. The 7 new tests should all fail because the route does not exist yet. The handler currently returns 404 with body `{ "error": "unknown_platform_route", "path": "/api/v1/runs/<id>/replay" }` for unmatched paths, which mismatches every test's status assertion.

If tsc complains about missing imports: verify the imports in Step 2.1 match the existing patterns in the test file's top-of-file imports (specifically `mkdtempSync, writeFileSync` from `node:fs` + `tmpdir` from `node:os` + `join` from `node:path` should already be imported at lines 3-5; if not, add them).

- [ ] **Step 2.3: Em-dash sweep**

```bash
perl -ne 'print "$ARGV:$.: $_" if /\x{2014}/' tests/cli/platform-api-runs.test.ts
```

Expected: no output.

- [ ] **Step 2.4: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add tests/cli/platform-api-runs.test.ts
git commit -m "$(cat <<'EOF'
test(platform-api): add 7 failing tests for replay endpoint

Covers happy path (match + diverge), 404 not_found, 410
artifact_unavailable, 410 scenario_unavailable, 422
replay_preconditions_unmet, and recordReplayResult counter
persistence on both match and diverge paths.

Helpers (captureMarsSnapshots, syntheticReplayArtifact) copied
verbatim from tests/runtime/world-model/replay.test.ts:19-52.

Tests fail until the next commit lands the route handler.
EOF
)"
```

---

## Task 3: Implement the replay route handler (drive all 7 tests to pass)

**Files:**
- Modify: `src/cli/server/routes/platform-api.ts` (add 2 imports + 1 type import already added in Task 1; insert ~50-line route block)

- [ ] **Step 3.1: Add runtime imports to `platform-api.ts`**

Open `src/cli/server/routes/platform-api.ts`. Add two new imports immediately below the `ScenarioPackage` import added in Task 1:

```ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ListRunsFilters, RunHistoryStore } from '../run-history-store.js';
import type { ParacosmServerMode } from '../server-mode.js';
import type { ScenarioPackage } from '../../../engine/types.js';
import { WorldModel, WorldModelReplayError } from '../../../runtime/world-model/index.js';
import type { RunArtifact } from '../../../engine/schema/index.js';
```

- [ ] **Step 3.2: Insert the replay route block**

In the same file, locate the existing `/replay-result` block (the regex `^\/api\/v1\/runs\/([^/]+)\/replay-result$`, currently around line 119). Find the closing `}` of that block (approximately line 145; if the concurrent session has landed, around line 160). Immediately after that closing brace, BEFORE the `// GET /api/v1/runs/:runId — load full RunArtifact` comment and `detailMatch` regex, insert this block:

```ts
    // POST /api/v1/runs/:runId/replay — re-execute kernel progression
    // against the stored artifact and report match/divergence. The
    // outcome is persisted to the run-history store so the
    // /api/v1/runs/aggregate counters reflect every attempt.
    const replayMatch = url.pathname.match(/^\/api\/v1\/runs\/([^/]+)\/replay$/);
    if (replayMatch && req.method === 'POST') {
      const runId = decodeURIComponent(replayMatch[1]);
      const record = await options.runHistoryStore.getRun(runId);
      if (!record) {
        res.writeHead(404, { 'Content-Type': 'application/json', ...options.corsHeaders });
        res.end(JSON.stringify({ error: 'not_found', runId }));
        return true;
      }
      if (!record.artifactPath) {
        res.writeHead(410, { 'Content-Type': 'application/json', ...options.corsHeaders });
        res.end(JSON.stringify({ error: 'artifact_unavailable', runId }));
        return true;
      }

      let artifact: RunArtifact;
      try {
        const fs = await import('node:fs/promises');
        artifact = JSON.parse(await fs.readFile(record.artifactPath, 'utf-8')) as RunArtifact;
      } catch {
        console.warn('[run-history] artifact unreadable for replay:', runId);
        res.writeHead(410, { 'Content-Type': 'application/json', ...options.corsHeaders });
        res.end(JSON.stringify({ error: 'artifact_unreadable', runId, message: 'Artifact file unreadable' }));
        return true;
      }

      const scenarioId = artifact.metadata.scenario.id;
      const scenario = options.scenarioLookup(scenarioId);
      if (!scenario) {
        res.writeHead(410, { 'Content-Type': 'application/json', ...options.corsHeaders });
        res.end(JSON.stringify({ error: 'scenario_unavailable', scenarioId }));
        return true;
      }

      try {
        const wm = WorldModel.fromScenario(scenario);
        const result = await wm.replay(artifact);
        await options.runHistoryStore.recordReplayResult?.(runId, result.matches);
        res.writeHead(200, { 'Content-Type': 'application/json', ...options.corsHeaders });
        res.end(JSON.stringify({ matches: result.matches, divergence: result.divergence }));
        return true;
      } catch (err) {
        if (err instanceof WorldModelReplayError) {
          res.writeHead(422, { 'Content-Type': 'application/json', ...options.corsHeaders });
          res.end(JSON.stringify({ error: 'replay_preconditions_unmet', message: err.message }));
          return true;
        }
        throw err;
      }
    }
```

The order matters: this block must come AFTER the `/replay-result` regex (which would otherwise match nothing similar) and BEFORE the `:runId` detail GET (which would otherwise match `/api/v1/runs/<id>/replay` as id `<id>/replay`).

- [ ] **Step 3.3: Run tsc to verify no type errors**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npx tsc --noEmit
```

Expected: 0 errors. If errors: most common cause is the import path. Verify the relative depth: `routes/platform-api.ts` is 3 directories deep into `src/`, so `../../../runtime/world-model/index.js` resolves to `src/runtime/world-model/index.js`.

- [ ] **Step 3.4: Run tests to confirm all 7 pass**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)" | tail -5
```

Expected: `tests 824 / pass 823 / fail 0 / skipped 1`.

If any of the 7 fail: re-read the failing test's error vs the route block. Common causes:
- Test 1/2 fails with status 500: outer `try/catch` is catching something thrown in WorldModel.replay; check that captureMarsSnapshots is producing snapshots whose scenario.id matches marsScenario.id.
- Test 4 returns 200 instead of 410: the `if (!record.artifactPath)` guard didn't trigger; check the test fixture's `makeRun` doesn't default artifactPath to something truthy.
- Test 5 returns 200 instead of 410: scenarioLookup returned a scenario instead of undefined; the test passes `scenarioLookup: () => undefined` but the route is calling something else.
- Test 6 returns 200 instead of 422: the artifact passed validation; check that `decisions` is populated (the test omits `kernelSnapshotsPerTurn` only, decisions are also required).

- [ ] **Step 3.5: Em-dash sweep**

```bash
perl -ne 'print "$ARGV:$.: $_" if /\x{2014}/' src/cli/server/routes/platform-api.ts
```

Expected: no output.

- [ ] **Step 3.6: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/cli/server/routes/platform-api.ts
git commit -m "$(cat <<'EOF'
feat(platform-api): POST /api/v1/runs/:runId/replay endpoint

Loads stored artifact via record.artifactPath, looks up the
original scenario via the in-memory catalog, constructs a
WorldModel, calls wm.replay(artifact), persists outcome via
runHistoryStore.recordReplayResult, returns
{ matches, divergence } on 200.

Failure modes:
  404 not_found              — runId not in store
  410 artifact_unavailable   — record has no artifactPath
  410 artifact_unreadable    — fs.readFile or JSON.parse fails
  410 scenario_unavailable   — scenarioLookup returned undefined
  422 replay_preconditions_unmet — WorldModelReplayError caught
  500 (outer catch)          — anything else

Mirrors the conservative error-response pattern the
concurrently-hardened /replay-result and detail GET converged on:
pass runId only, never the full record.

Library tab Replay button now works end to end.
EOF
)"
```

---

## Task 4: Add `typecheck:dashboard` script + chain into `npm test`

**Files:**
- Modify: `package.json` (the paracosm root `package.json`, NOT the dashboard's)

- [ ] **Step 4.1: Add the `typecheck:dashboard` script**

Open `apps/paracosm/package.json`. Find the existing scripts section. Locate the `test` script (currently line 74). Add a new script line ABOVE the `test` line:

```json
"typecheck:dashboard": "tsc -p src/cli/dashboard",
```

- [ ] **Step 4.2: Update the `test` script to chain the typecheck**

Change the `test` script value from:

```
"test": "node --import tsx --import ./scripts/test-css-stub.mjs --test 'tests/**/*.test.ts' 'src/cli/dashboard/src/**/*.test.ts' 'src/cli/dashboard/src/**/*.test.tsx'"
```

to:

```
"test": "npm run typecheck:dashboard && node --import tsx --import ./scripts/test-css-stub.mjs --test 'tests/**/*.test.ts' 'src/cli/dashboard/src/**/*.test.ts' 'src/cli/dashboard/src/**/*.test.tsx'"
```

The `--test` glob list is preserved verbatim. The only change is the `npm run typecheck:dashboard &&` prefix.

- [ ] **Step 4.3: Run `npm test` to confirm tsc + tests both pass**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npm test 2>&1 | tail -20
```

Expected: tsc emits no errors (silent success), then `tests 824 / pass 823 / fail 0 / skipped 1` from the runner.

If tsc reports type errors in the dashboard: the dashboard already has 824 passing tests (post-Task 3), so the tsc errors must be pre-existing latent issues that the dashboard's separate `npm run build` was catching. Fix them (or, if scope creep, file an issue and revert this task).

- [ ] **Step 4.4: Verify the guard fires on a deliberate type error**

Introduce a temporary off-by-one import path in any dashboard file as a smoke test:

```bash
# Pick any dashboard component and break one import:
sed -i.bak "s|from '\.\./hooks/useReplayRun'|from '../../../bogus/path/to/useReplayRun'|" \
  src/cli/dashboard/src/components/library/RunDetailDrawer.tsx 2>/dev/null || true
npm test 2>&1 | head -10
```

Expected: tsc fails before the test runner starts. The output should show a TS module-resolution error pointing at the bogus path.

Revert the sed:

```bash
mv src/cli/dashboard/src/components/library/RunDetailDrawer.tsx.bak \
   src/cli/dashboard/src/components/library/RunDetailDrawer.tsx
```

- [ ] **Step 4.5: Final clean run**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)" | tail -5
```

Expected: `tests 824 / pass 823 / fail 0 / skipped 1`.

- [ ] **Step 4.6: Em-dash sweep**

```bash
perl -ne 'print "$ARGV:$.: $_" if /\x{2014}/' package.json
```

Expected: no output.

- [ ] **Step 4.7: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add package.json
git commit -m "$(cat <<'EOF'
chore(test): typecheck dashboard before running test runner

Adds `typecheck:dashboard` script (`tsc -p src/cli/dashboard`) and
chains it into `npm test`. Closes the verification gap that let
six off-by-one cross-package relative imports leak into 5ea29fec
and only surface at vite build time.

The dashboard's tsconfig already has noEmit + bundler resolution,
so --noEmit is omitted from the new script.
EOF
)"
```

---

## Task 5: Add CI pnpm-contamination guard

**Files:**
- Modify: `.github/workflows/deploy.yml` (insert step between line 76 and line 78)

- [ ] **Step 5.1: Insert the guard step**

Open `apps/paracosm/.github/workflows/deploy.yml`. Find the end of the "Verify lockfiles are in sync with package.json" step (currently ends at line 76 with the `popd` + bash function definitions). Find the next step "Install dependencies" (currently at line 78). Between them, insert:

```yaml
      - name: Guard against pnpm-workspace contamination in lockfiles
        run: |
          set -e
          fail=0
          for f in package-lock.json src/cli/dashboard/package-lock.json; do
            if [ ! -f "$f" ]; then continue; fi
            if grep -q 'node_modules/\.pnpm/' "$f"; then
              echo "::error file=$f::Lockfile contains 'node_modules/.pnpm/' substring. This means it was authored from inside a pnpm workspace and references parent paths that do not exist in CI. To repair: copy package.json to a directory outside any pnpm workspace, run 'npm install' there, copy the resulting package-lock.json back, commit, push."
              fail=1
            fi
          done
          exit $fail
```

The indentation is two spaces (matching the existing YAML pattern). The `name:` line should align with the previous step's `- name:` line.

- [ ] **Step 5.2: Verify the YAML parses**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))" && echo "YAML OK"
```

Expected: `YAML OK`. If the import errors with `ModuleNotFoundError`, fall back to `npx --yes js-yaml deploy.yml` or open in any YAML linter; the goal is to confirm the file parses.

- [ ] **Step 5.3: Verify the guard logic locally with a synthetic insertion**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
cp src/cli/dashboard/package-lock.json /tmp/lockfile-test.json
echo '"node_modules/.pnpm/fake-package": {' >> /tmp/lockfile-test.json
grep -q 'node_modules/\.pnpm/' /tmp/lockfile-test.json && echo "GUARD WOULD FIRE" || echo "GUARD WOULD NOT FIRE"
```

Expected: `GUARD WOULD FIRE`. Then verify the clean lockfile passes:

```bash
grep -q 'node_modules/\.pnpm/' src/cli/dashboard/package-lock.json && echo "CONTAMINATED" || echo "CLEAN"
```

Expected: `CLEAN`.

- [ ] **Step 5.4: Em-dash sweep**

```bash
perl -ne 'print "$ARGV:$.: $_" if /\x{2014}/' .github/workflows/deploy.yml
```

Expected: no output.

- [ ] **Step 5.5: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add .github/workflows/deploy.yml
git commit -m "$(cat <<'EOF'
ci: hard-fail on pnpm-workspace contamination in lockfiles

Adds a build-job step that fails the workflow when either
package-lock.json or src/cli/dashboard/package-lock.json contains
the substring 'node_modules/.pnpm/'. That substring is the exact
signature of a lockfile authored from inside a pnpm workspace,
which writes parent-relative paths that don't resolve in CI.

Catches the regression class repaired by 9ec24075. Runs before
the install step so the contaminated state cannot waste a build
slot.

The error message tells the next contributor exactly how to repair
(copy package.json outside any pnpm workspace, npm install,
copy lockfile back).
EOF
)"
```

---

## Task 6: Add architecture doc paragraph

**Files:**
- Modify: `docs/ARCHITECTURE.md` (insert under existing "Replay" section)

- [ ] **Step 6.1: Locate the existing "Replay" section**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
grep -n "^#.*Replay\|## Replay\|^## .*replay" docs/ARCHITECTURE.md
```

Note the line number of the section heading. The 2026-04-25 hotfix push added this section.

- [ ] **Step 6.2: Append the HTTP-surface paragraph**

Open `docs/ARCHITECTURE.md`. Below the existing replay section's content (find the next `##` heading or end-of-section), insert this paragraph as a new sub-section:

```markdown
### HTTP surface

The HTTP surface for replay is `POST /api/v1/runs/:runId/replay` on
the dashboard server. The endpoint loads the stored artifact via
`record.artifactPath`, looks up the original scenario via the
in-memory catalog, constructs a `WorldModel`, calls
`WorldModel.replay(artifact)`, and persists the outcome via
`runHistoryStore.recordReplayResult(runId, matches)`. Returns
`{ matches: boolean, divergence: string }` on 200, structured errors
on 404 / 410 / 422. The client-side hook is
`src/cli/dashboard/src/components/library/hooks/useReplayRun.ts`.
```

If the existing replay section already has subheadings (e.g., `### Why replay`, `### Implementation`), match that style. If it's a flat section, the `### HTTP surface` heading is the right level.

- [ ] **Step 6.3: Em-dash sweep**

```bash
perl -ne 'print "$ARGV:$.: $_" if /\x{2014}/' docs/ARCHITECTURE.md
```

Expected: no output.

- [ ] **Step 6.4: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add docs/ARCHITECTURE.md
git commit -m "$(cat <<'EOF'
docs(arch): document the replay HTTP surface

Adds an "HTTP surface" sub-section under the existing Replay
section noting the POST /api/v1/runs/:runId/replay endpoint, its
inputs (record + artifact + scenario lookup), outputs
({ matches, divergence }), and the client-side hook that targets
it.
EOF
)"
```

---

## Task 7: Final verification (no commit)

This task confirms the full success criteria from the spec's §7. No new commits; failure here means a previous task left an issue and should be fixed in a follow-up commit.

- [ ] **Step 7.1: Full tsc clean**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npx tsc --noEmit && echo "ROOT TSC CLEAN"
npx tsc --noEmit -p tsconfig.build.json && echo "BUILD TSC CLEAN"
npx tsc -p src/cli/dashboard && echo "DASHBOARD TSC CLEAN"
```

Expected: three "CLEAN" lines.

- [ ] **Step 7.2: Full test suite**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)" | tail -5
```

Expected: `tests 824 / pass 823 / fail 0 / skipped 1`.

- [ ] **Step 7.3: Vite build green**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm/src/cli/dashboard
npx vite build 2>&1 | tail -10
```

Expected: `✓ built in <N>s` and emitted chunks. No "UNRESOLVED_IMPORT" warnings.

- [ ] **Step 7.4: Final em-dash sweep across all changed files**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
perl -ne 'print "$ARGV:$.: $_" if /\x{2014}/' \
  src/cli/server/routes/platform-api.ts \
  src/cli/server-app.ts \
  tests/cli/platform-api-runs.test.ts \
  package.json \
  .github/workflows/deploy.yml \
  docs/ARCHITECTURE.md
```

Expected: no output.

- [ ] **Step 7.5: Commit history check**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git log --oneline 710f6e3f..HEAD
```

Expected: 6 commits in this order:
1. `feat(platform-api): add scenarioLookup option for replay route`
2. `test(platform-api): add 7 failing tests for replay endpoint`
3. `feat(platform-api): POST /api/v1/runs/:runId/replay endpoint`
4. `chore(test): typecheck dashboard before running test runner`
5. `ci: hard-fail on pnpm-workspace contamination in lockfiles`
6. `docs(arch): document the replay HTTP surface`

- [ ] **Step 7.6: Manual smoke (optional, requires real LLM credentials)**

Only run this if you have OpenAI / Anthropic API keys loaded. From a terminal:

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
set -a && source ../wilds-ai/.env && set +a
PARACOSM_ENABLE_SIMULATE_ENDPOINT=true npx tsx src/cli/serve.ts &
# wait for "[paracosm] dashboard listening on http://localhost:<port>"
```

In another terminal:

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm/src/cli/dashboard
npm run dev
# open http://localhost:5173
```

In the dashboard:
1. Run a real mars sim with `captureSnapshots: true` (Sim tab → run-a button → wait for completion).
2. Navigate to the Library tab.
3. Click the just-finished run's card.
4. In the side drawer, click the Replay button.
5. Expected: green "match" status panel within ~1 second.
6. Refresh `/api/v1/runs/aggregate` and confirm `replaysAttempted` and `replaysMatched` both incremented.

Kill both processes when done:

```bash
pkill -f "tsx src/cli/serve.ts"
pkill -f "vite"
```

- [ ] **Step 7.7: Report completion**

If all of 7.1-7.6 pass, the implementation is complete. Tell the user that the 6 commits are in `paracosm master` locally, ready to push when they say so.

---

## Self-review

After writing the plan above, the spec was re-read end to end and checked for coverage:

- Goal 1 (`POST /api/v1/runs/:runId/replay`) → Tasks 2 + 3.
- Goal 2 (`recordReplayResult` persistence) → Task 3 step 3.2 + Task 2 test 7.
- Goal 3 (Library Replay end to end) → Task 7 step 7.6 manual smoke.
- Goal 4 (`npm test` fails on dashboard type error) → Task 4 step 4.4 deliberate-error verification.
- Goal 5 (CI fails on `node_modules/.pnpm/` substring) → Task 5 step 5.3 synthetic-insertion verification.
- Spec §4.1 (`HandlePlatformApiOptions` extension) → Task 1.
- Spec §4.2 (route handler) → Task 3.
- Spec §4.3 (status mapping) → enforced by tests in Task 2; tests assert exact status codes + error keys.
- Spec §4.4 (`server-app.ts` wiring) → Task 1 step 1.3.
- Spec §4.5 (dashboard tsc parity) → Task 4.
- Spec §4.6 (CI guard) → Task 5.
- Spec §4.7 (seven tests) → Task 2.
- Spec §4.8 (architecture doc) → Task 6.
- Spec §7 (success criteria) → Task 7.

No placeholder strings ("TBD", "TODO", "implement later") in any task body. Type names consistent across tasks: `HandlePlatformApiOptions`, `ScenarioPackage`, `RunArtifact`, `WorldModel`, `WorldModelReplayError`, `KernelSnapshot`, `RunHistoryStore` all used identically wherever they appear.

Six commits, one per concern. Commit messages avoid AI/Claude/rewrite/em-dash per project rules.

---

## Execution handoff

Per the user's "no subagents" rule (CLAUDE.md + `feedback_no_subagents.md`), the standard subagent-driven option is OFF for paracosm work. Use `superpowers:executing-plans` for inline execution in the current session.

**Approach:** Execute Tasks 1 through 7 sequentially in this session. Each task ends with a commit; do not push until the user explicitly says "push" (rule: `feedback_no_push_unless_asked.md`). Stop and ask the user if any verification step fails in a way the troubleshooting hints don't cover.
