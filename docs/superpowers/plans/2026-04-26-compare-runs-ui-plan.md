# Compare 2+ Runs UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **No-subagent rule active** — execute inline, no Agent dispatch.

**Goal:** Close the disabled "Compare (coming soon)" stub on every RunCard by shipping a bundle-aware Compare view: arbitrary-N parallel actors per Quickstart submit, LIBRARY bundle cards, three-zoom Compare modal (aggregate strip + small-multiples grid + 2-3 pinned side-by-side panel), and the four diff dimensions (timeline / fingerprint / decision rationale / metric trajectories).

**Architecture:** Backend gains a `bundle_id` + `summary_trajectory` migration on the runs SQLite table and three new endpoints (`/api/v1/bundles/:id`, `/api/v1/bundles/:id/aggregate`, `/api/v1/runs?bundleId=`). Frontend adds `components/compare/*` for the modal + grid + diff panels and `components/library/BundleCard.tsx` for the collapsed-bundle entry point in LIBRARY. Quickstart's `count` schema cap is raised from 6 → 50 with a cost-preview slider in `SeedInput`. Lazy-loading semantics: aggregate strip renders entirely from a server-side rollup; cells render from RunRecord summary fields; full RunArtifact fetch only fires when a cell is pinned or opened.

**Tech Stack:** TypeScript 5.7, React 18.3 (functional + hooks), node:test (`node --import tsx --import ./scripts/test-css-stub.mjs --test <path>`), better-sqlite3 with idempotent column-add migrations, Zod for schema validation, inline SVG (no chart library, matches existing CommanderTrajectoryCard / MetricSparklines pattern).

**Spec:** [`docs/superpowers/specs/2026-04-26-compare-runs-ui-design.md`](../specs/2026-04-26-compare-runs-ui-design.md) — read this first if any task feels under-specified.

---

## File Structure

**New files (engine/server):**

- `src/cli/server/bundle-id.ts` — `generateBundleId()` UUID + `BUNDLE_ID_REGEX` constant
- `src/cli/server/bundle-id.test.ts` — uniqueness + format
- `src/cli/server/run-summary-trajectory.ts` — `extractSummaryTrajectory(artifact, n=8)` samples N points from artifact.trajectory.points
- `src/cli/server/run-summary-trajectory.test.ts` — sampling correctness, edge cases (no trajectory, fewer than n points, batch-point mode)
- `src/cli/bundle-routes.ts` — `handleListBundle(req, res, deps)` + `handleBundleAggregate(req, res, deps)` route handlers, mirrors quickstart-routes.ts shape
- `src/cli/bundle-routes.test.ts` — route validation, partial-failure handling, aggregate math

**New files (dashboard):**

- `src/cli/dashboard/src/components/compare/CompareModal.tsx` — full-screen modal shell
- `src/cli/dashboard/src/components/compare/CompareModal.module.scss`
- `src/cli/dashboard/src/components/compare/AggregateStrip.tsx` — four inline-SVG charts
- `src/cli/dashboard/src/components/compare/AggregateStrip.module.scss`
- `src/cli/dashboard/src/components/compare/SmallMultiplesGrid.tsx` — responsive grid container
- `src/cli/dashboard/src/components/compare/SmallMultiplesGrid.module.scss`
- `src/cli/dashboard/src/components/compare/CompareCell.tsx` — one cell per run
- `src/cli/dashboard/src/components/compare/CompareCell.module.scss`
- `src/cli/dashboard/src/components/compare/PinnedDiffPanel.tsx` — 2-3 pinned columns
- `src/cli/dashboard/src/components/compare/PinnedDiffPanel.module.scss`
- `src/cli/dashboard/src/components/compare/diff/TimelineDiff.tsx`
- `src/cli/dashboard/src/components/compare/diff/FingerprintDiff.tsx`
- `src/cli/dashboard/src/components/compare/diff/DecisionRationaleDiff.tsx`
- `src/cli/dashboard/src/components/compare/diff/MetricTrajectoryDiff.tsx`
- `src/cli/dashboard/src/components/compare/diff/diff.module.scss` (shared)
- `src/cli/dashboard/src/components/compare/hooks/useBundle.ts`
- `src/cli/dashboard/src/components/compare/hooks/useBundleAggregate.ts`
- `src/cli/dashboard/src/components/compare/hooks/useBundleArtifacts.ts` — lazy per-cell fetch
- `src/cli/dashboard/src/components/compare/hooks/usePinnedRuns.ts` — LRU at 3
- `src/cli/dashboard/src/components/compare/hooks/usePinnedRuns.test.ts`
- `src/cli/dashboard/src/components/compare/hooks/useBundleArtifacts.test.ts`
- `src/cli/dashboard/src/components/library/BundleCard.tsx`
- `src/cli/dashboard/src/components/library/BundleCard.module.scss`
- `src/cli/dashboard/src/components/library/groupRunsByBundle.ts` — pure helper
- `src/cli/dashboard/src/components/library/groupRunsByBundle.test.ts`

**Modified files:**

- `src/cli/server/run-record.ts` — add `bundleId?` + `summaryTrajectory?` fields
- `src/cli/server/sqlite-run-history-store.ts` — migrate columns, persist + read fields, add `listRunsByBundleId`
- `src/cli/server/run-history-store.ts` — extend `RunHistoryStore` interface + `ListRunsFilters` to include `bundleId`
- `src/cli/server-app.ts` — generate bundleId in /setup when bundle path; wire bundle routes; pass bundleId to insertRun
- `src/cli/quickstart-routes.ts` — `GenerateLeadersSchema.count.max(6)` → `.max(50)`; add `actorCount` field to `CompileFromSeedSchema` (forwarded)
- `src/cli/dashboard/src/components/library/LibraryTab.tsx` — pass bundleId filter through; render BundleCard for grouped, RunCard for solo
- `src/cli/dashboard/src/components/library/RunGallery.tsx` — group by bundleId via `groupRunsByBundle`
- `src/cli/dashboard/src/components/library/RunCard.tsx` — remove disabled Compare button (compare lives at the bundle level)
- `src/cli/dashboard/src/components/library/hooks/useRunsList.ts` — accept `bundleId` filter
- `src/cli/dashboard/src/components/quickstart/SeedInput.tsx` — add count slider, cost preview, dynamic submit button label
- `src/cli/dashboard/src/components/quickstart/QuickstartView.tsx` — pass count through, add "Compare all N" CTA on results phase
- `scripts/remotion/record-end-to-end.mjs` — extend tab tour with Compare modal capture

**Untouched (verified earlier):**

- `LeaderConfig` type, `runSimulation(leader, ...)` signature
- `LeaderBar.tsx`, `LeaderConfig.tsx`, CSS custom properties
- Existing `RunDetailDrawer` (reused for cell drilldown)
- `pair-runner.ts:runBatchSimulations` (already supports any N via `Promise.allSettled`)

---

## Testing conventions used throughout this plan

- **Test runner:** `npm test` runs the full suite; for a single file use:
  ```
  node --import tsx --import ./scripts/test-css-stub.mjs --test path/to/file.test.ts
  ```
- **Test imports:** `import test from 'node:test'; import assert from 'node:assert/strict';` (matches existing dashboard tests at `tab-routing.test.ts:1`)
- **TDD pattern:** every task: failing test first → run → see fail → minimal impl → run → pass → commit. Each task is ~5 steps.
- **Frequent commits:** commit after every passing test cycle. Don't batch multiple tasks into one commit.

---

## Phase 1: Schema + persistence (bundle_id + summary_trajectory)

### Task 1.1: Add `BUNDLE_ID_REGEX` + `generateBundleId()` helper

**Files:**
- Create: `src/cli/server/bundle-id.ts`
- Test: `src/cli/server/bundle-id.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/cli/server/bundle-id.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBundleId, BUNDLE_ID_REGEX } from './bundle-id.js';

test('generateBundleId produces a kebab uuid v4', () => {
  const id = generateBundleId();
  assert.match(id, BUNDLE_ID_REGEX);
});

test('generateBundleId is unique across rapid calls', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => generateBundleId()));
  assert.equal(ids.size, 1000);
});

test('BUNDLE_ID_REGEX rejects non-uuid strings', () => {
  assert.equal(BUNDLE_ID_REGEX.test('not-a-uuid'), false);
  assert.equal(BUNDLE_ID_REGEX.test('12345'), false);
  assert.equal(BUNDLE_ID_REGEX.test(''), false);
});
```

- [ ] **Step 2: Run test, expect fail**

```
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/server/bundle-id.test.ts
```
Expected: FAIL with "Cannot find module './bundle-id.js'".

- [ ] **Step 3: Implement minimal**

```ts
// src/cli/server/bundle-id.ts
/**
 * UUIDs for grouping every run from one Quickstart submission. RunRecord
 * stores `bundleId` so the LIBRARY can collapse a bundle's members into
 * one card and the Compare view can fetch the bundle's runs in one query.
 *
 * @module paracosm/cli/server/bundle-id
 */
import { randomUUID } from 'node:crypto';

export const BUNDLE_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function generateBundleId(): string {
  return randomUUID();
}
```

- [ ] **Step 4: Run test, expect pass**

Same command. Expect: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/server/bundle-id.ts src/cli/server/bundle-id.test.ts
git commit -m "feat(server): bundle-id helper for grouping Quickstart submissions"
```

---

### Task 1.2: Add `extractSummaryTrajectory` helper

**Files:**
- Create: `src/cli/server/run-summary-trajectory.ts`
- Test: `src/cli/server/run-summary-trajectory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/cli/server/run-summary-trajectory.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSummaryTrajectory } from './run-summary-trajectory.js';

test('samples evenly across trajectory.points when present', () => {
  const artifact = {
    trajectory: {
      points: Array.from({ length: 100 }, (_, i) => ({ turn: i, value: i * 2 })),
    },
  };
  const out = extractSummaryTrajectory(artifact, 8);
  assert.equal(out.length, 8);
  assert.equal(out[0], 0);
  assert.equal(out[7], 198);
});

test('returns empty array when artifact has no trajectory', () => {
  assert.deepEqual(extractSummaryTrajectory({}, 8), []);
});

test('returns shorter array when fewer points than n', () => {
  const artifact = {
    trajectory: {
      points: [{ turn: 0, value: 1 }, { turn: 1, value: 2 }, { turn: 2, value: 3 }],
    },
  };
  assert.deepEqual(extractSummaryTrajectory(artifact, 8), [1, 2, 3]);
});

test('handles batch-point mode (no trajectory.points) by returning []', () => {
  const artifact = { metadata: { mode: 'batch-point' } };
  assert.deepEqual(extractSummaryTrajectory(artifact, 8), []);
});

test('coerces non-number values to 0 (defensive)', () => {
  const artifact = {
    trajectory: { points: [{ turn: 0, value: 'oops' }, { turn: 1, value: 5 }] as Array<{ turn: number; value: number }>,
    } as unknown as { trajectory: { points: Array<{ turn: number; value: number }> } },
  };
  const out = extractSummaryTrajectory(artifact as never, 4);
  assert.equal(typeof out[0], 'number');
  assert.equal(out[1], 5);
});
```

- [ ] **Step 2: Run test, expect fail**

```
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/server/run-summary-trajectory.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement minimal**

```ts
// src/cli/server/run-summary-trajectory.ts
/**
 * Sample a small number array from a RunArtifact's trajectory so the
 * SmallMultiplesGrid cell can render a sparkline without fetching the
 * full artifact. Persisted to the runs table at insert time.
 *
 * @module paracosm/cli/server/run-summary-trajectory
 */
import type { RunArtifact } from '../../engine/schema/index.js';

export function extractSummaryTrajectory(artifact: Partial<RunArtifact>, n = 8): number[] {
  const points = artifact?.trajectory?.points;
  if (!Array.isArray(points) || points.length === 0) return [];
  if (points.length <= n) {
    return points.map(p => coerce(p?.value));
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / (n - 1)) * (points.length - 1));
    out.push(coerce(points[idx]?.value));
  }
  return out;
}

function coerce(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return 0;
}
```

- [ ] **Step 4: Run test, expect pass**

Same command. Expect: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/server/run-summary-trajectory.ts src/cli/server/run-summary-trajectory.test.ts
git commit -m "feat(server): extractSummaryTrajectory helper for cell sparklines"
```

---

### Task 1.3: Extend `RunRecord` with bundleId + summaryTrajectory

**Files:**
- Modify: `src/cli/server/run-record.ts`

- [ ] **Step 1: Read the file to confirm current shape**

```bash
cat src/cli/server/run-record.ts
```

- [ ] **Step 2: Add the two fields to the interface**

In `src/cli/server/run-record.ts`, after the existing `leaderArchetype?: string;` line and before the closing `}` of `interface RunRecord`:

```ts
  /** Captured leader archetype for the gallery card. */
  leaderArchetype?: string;
  /** UUID shared by all runs from one Quickstart submission. Set when the
   *  /setup handler dispatches to runBatchSimulations or when an explicit
   *  Quickstart `quickstart.bundleId` is passed. Older runs persisted
   *  before this column was added are bundle-less and render as solo
   *  cards in the LIBRARY. */
  bundleId?: string;
  /** Sampled trajectory values (typically 8 points) for the
   *  SmallMultiplesGrid cell sparkline in the Compare view. Computed
   *  from `artifact.trajectory.points` at insert time via
   *  `extractSummaryTrajectory`. Empty for batch-point runs. */
  summaryTrajectory?: number[];
}
```

- [ ] **Step 3: Run typecheck**

```
npm run typecheck
```
Expected: PASS (these are additive optional fields; no consumers break).

- [ ] **Step 4: Commit**

```bash
git add src/cli/server/run-record.ts
git commit -m "feat(server): add bundleId + summaryTrajectory fields to RunRecord"
```

---

### Task 1.4: Migrate sqlite columns + read/write the new fields

**Files:**
- Modify: `src/cli/server/sqlite-run-history-store.ts`

- [ ] **Step 1: Read the file's `ensureRunsColumns`, `rowToRecord`, and `insertRun` sections**

Lines 35-101 cover RunRow + rowToRecord + ensureRunsColumns; line 197 is insertRun.

- [ ] **Step 2: Add columns to the migration list**

In `ensureRunsColumns` (around line 82-101), add two entries to the `newCols` array after the existing `'replay_matches'`:

```ts
  const newCols: ReadonlyArray<readonly [string, string]> = [
    ['artifact_path', 'TEXT'],
    ['cost_usd', 'REAL'],
    ['duration_ms', 'INTEGER'],
    ['mode', 'TEXT'],
    ['leader_name', 'TEXT'],
    ['leader_archetype', 'TEXT'],
    ['replay_attempts', 'INTEGER DEFAULT 0'],
    ['replay_matches', 'INTEGER DEFAULT 0'],
    ['bundle_id', 'TEXT'],
    ['summary_trajectory', 'TEXT'],
  ];
```

- [ ] **Step 3: Add `bundle_id` + `summary_trajectory` to `RunRow`**

In the `RunRow` interface (around line 35-52), add:

```ts
  bundle_id: string | null;
  summary_trajectory: string | null;
```

- [ ] **Step 4: Update `rowToRecord` to copy the new fields**

In `rowToRecord` (around line 54-74), after the `leader_archetype` block:

```ts
  if (row.leader_archetype !== null) record.leaderArchetype = row.leader_archetype;
  if (row.bundle_id !== null) record.bundleId = row.bundle_id;
  if (row.summary_trajectory !== null) {
    try {
      const parsed = JSON.parse(row.summary_trajectory);
      if (Array.isArray(parsed) && parsed.every(n => typeof n === 'number')) {
        record.summaryTrajectory = parsed;
      }
    } catch {
      // Corrupt JSON in older row -- skip; cell will render without sparkline.
    }
  }
  return record;
```

- [ ] **Step 5: Update `insertRun` to persist the new fields**

Locate `insertRun` (line 197). Find the prepared INSERT statement and the binding object. Add `bundle_id` + `summary_trajectory` to both the column list and the values, with `?` placeholders. The exact patch depends on the current statement shape — read it first, then add the two columns analogously to how `mode` and `leader_name` are handled.

- [ ] **Step 6: Add `listRunsByBundleId` method to the store**

Add a new method on the returned store:

```ts
    async listRunsByBundleId(bundleId: string): Promise<RunRecord[]> {
      const stmt = db.prepare('SELECT * FROM runs WHERE bundle_id = ? ORDER BY created_at ASC');
      const rows = stmt.all(bundleId) as RunRow[];
      return rows.map(rowToRecord);
    },
```

- [ ] **Step 7: Extend the `RunHistoryStore` interface**

In `src/cli/server/run-history-store.ts`, add:

```ts
  /** Optional: list all runs sharing a bundleId. Used by the Compare
   *  view to fetch a Quickstart bundle's members in one query. */
  listRunsByBundleId?(bundleId: string): Promise<RunRecord[]>;
```

And add `bundleId?: string;` to `ListRunsFilters`.

- [ ] **Step 8: Update the noop store**

In `createNoopRunHistoryStore`:

```ts
    async listRunsByBundleId() { return []; },
```

- [ ] **Step 9: Run typecheck + existing tests**

```
npm run typecheck
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/server/sqlite-run-history-store.test.ts
```
Expected: PASS. Existing tests should still pass since columns are additive.

- [ ] **Step 10: Commit**

```bash
git add src/cli/server/sqlite-run-history-store.ts src/cli/server/run-history-store.ts
git commit -m "feat(server): migrate runs table to include bundle_id + summary_trajectory"
```

---

### Task 1.5: Server-side test for `listRunsByBundleId`

**Files:**
- Create: `src/cli/server/sqlite-run-history-store.bundle.test.ts`

- [ ] **Step 1: Write the test**

```ts
// src/cli/server/sqlite-run-history-store.bundle.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteRunHistoryStore } from './sqlite-run-history-store.js';
import { createRunRecord } from './run-record.js';

test('listRunsByBundleId returns only members of the requested bundle', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  const bundleA = '11111111-1111-4111-8111-111111111111';
  const bundleB = '22222222-2222-4222-8222-222222222222';
  await store.insertRun(createRunRecord({
    scenarioId: 'mars-genesis', scenarioVersion: '1.0.0', leaderConfigHash: 'h1',
    economicsProfile: 'demo', sourceMode: 'hosted_demo', createdBy: 'anonymous',
    bundleId: bundleA, leaderName: 'Voss',
  }));
  await store.insertRun(createRunRecord({
    scenarioId: 'mars-genesis', scenarioVersion: '1.0.0', leaderConfigHash: 'h2',
    economicsProfile: 'demo', sourceMode: 'hosted_demo', createdBy: 'anonymous',
    bundleId: bundleA, leaderName: 'Chen',
  }));
  await store.insertRun(createRunRecord({
    scenarioId: 'mars-genesis', scenarioVersion: '1.0.0', leaderConfigHash: 'h3',
    economicsProfile: 'demo', sourceMode: 'hosted_demo', createdBy: 'anonymous',
    bundleId: bundleB, leaderName: 'Park',
  }));
  const a = await store.listRunsByBundleId!(bundleA);
  assert.equal(a.length, 2);
  assert.deepEqual(a.map(r => r.leaderName).sort(), ['Chen', 'Voss']);
  const b = await store.listRunsByBundleId!(bundleB);
  assert.equal(b.length, 1);
  assert.equal(b[0].leaderName, 'Park');
});

test('listRunsByBundleId returns [] for unknown bundleId', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  const out = await store.listRunsByBundleId!('00000000-0000-4000-8000-000000000000');
  assert.equal(out.length, 0);
});

test('insert + listRunsByBundleId round-trips summaryTrajectory', async () => {
  const store = createSqliteRunHistoryStore({ dbPath: ':memory:' });
  const bundleId = '33333333-3333-4333-8333-333333333333';
  await store.insertRun(createRunRecord({
    scenarioId: 's', scenarioVersion: '1', leaderConfigHash: 'h',
    economicsProfile: 'demo', sourceMode: 'hosted_demo', createdBy: 'anonymous',
    bundleId, summaryTrajectory: [1, 2, 3, 4, 5, 6, 7, 8],
  }));
  const out = await store.listRunsByBundleId!(bundleId);
  assert.deepEqual(out[0].summaryTrajectory, [1, 2, 3, 4, 5, 6, 7, 8]);
});
```

- [ ] **Step 2: Run, expect pass**

```
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/server/sqlite-run-history-store.bundle.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/server/sqlite-run-history-store.bundle.test.ts
git commit -m "test(server): listRunsByBundleId + summaryTrajectory round-trip"
```

---

## Phase 2: Server endpoints + cap raise

### Task 2.1: Bump `GenerateLeadersSchema.count` to max 50

**Files:**
- Modify: `src/cli/quickstart-routes.ts`

- [ ] **Step 1: Locate the schema (line 31-34)**

```ts
const GenerateLeadersSchema = z.object({
  scenarioId: z.string().min(3).max(64),
  count: z.number().int().min(2).max(6).default(3),
});
```

- [ ] **Step 2: Change `max(6)` → `max(50)` and add comment**

```ts
const GenerateLeadersSchema = z.object({
  scenarioId: z.string().min(3).max(64),
  // Max 50 actors per bundle. Each actor is ~$0.30 LLM spend; the
  // SeedInput cost preview surfaces this so users opt in consciously.
  count: z.number().int().min(2).max(50).default(3),
});
```

- [ ] **Step 3: Add `actorCount` to `CompileFromSeedSchema` and forward to /setup body**

`CompileFromSeedSchema` (line 25-29):

```ts
const CompileFromSeedSchema = z.object({
  seedText: z.string().min(200).max(50_000),
  domainHint: z.string().max(80).optional(),
  sourceUrl: z.string().url().max(2048).optional(),
  // Number of parallel actors to generate + run. Default 3; max 50.
  // Threaded into generate-leaders + the subsequent /setup batch path.
  actorCount: z.number().int().min(1).max(50).optional(),
});
```

Note: `actorCount` is not consumed by `compileFromSeed` itself — it's threaded through the response so the dashboard's QuickstartView passes it on to generate-leaders. Compiler ignores it.

- [ ] **Step 4: Run typecheck**

```
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/quickstart-routes.ts
git commit -m "feat(quickstart): bump actor-count cap from 6 to 50"
```

---

### Task 2.2: bundle routes module + tests

**Files:**
- Create: `src/cli/bundle-routes.ts`
- Create: `src/cli/bundle-routes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/cli/bundle-routes.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { handleListBundle, handleBundleAggregate } from './bundle-routes.js';
import { createNoopRunHistoryStore } from './server/run-history-store.js';
import type { RunRecord } from './server/run-record.js';

function makeRes(): { res: ServerResponse; chunks: string[]; status: () => number } {
  const socket = new Socket();
  // Minimal IncomingMessage stub for ServerResponse construction.
  const req: any = { socket };
  const res = new ServerResponse(req);
  const chunks: string[] = [];
  let status = 0;
  res.write = ((c: string | Uint8Array) => { chunks.push(String(c)); return true; }) as never;
  res.end = ((c?: string | Uint8Array) => { if (c) chunks.push(String(c)); return res; }) as never;
  res.writeHead = ((s: number) => { status = s; return res; }) as never;
  return { res, chunks, status: () => status };
}

test('handleListBundle returns 200 with member records for valid bundleId', async () => {
  const records: RunRecord[] = [
    { runId: 'r1', createdAt: '2026-04-26T00:00:00Z', scenarioId: 's', scenarioVersion: '1.0.0', leaderConfigHash: 'h1', economicsProfile: 'demo', sourceMode: 'hosted_demo', createdBy: 'anonymous', bundleId: 'b1' },
    { runId: 'r2', createdAt: '2026-04-26T00:00:01Z', scenarioId: 's', scenarioVersion: '1.0.0', leaderConfigHash: 'h2', economicsProfile: 'demo', sourceMode: 'hosted_demo', createdBy: 'anonymous', bundleId: 'b1' },
  ];
  const store = { ...createNoopRunHistoryStore(), listRunsByBundleId: async () => records };
  const { res, chunks, status } = makeRes();
  await handleListBundle('b1', res, { runHistoryStore: store });
  assert.equal(status(), 200);
  const body = JSON.parse(chunks.join(''));
  assert.equal(body.bundleId, 'b1');
  assert.equal(body.members.length, 2);
});

test('handleListBundle returns 404 when bundle is empty', async () => {
  const store = { ...createNoopRunHistoryStore(), listRunsByBundleId: async () => [] };
  const { res, status } = makeRes();
  await handleListBundle('unknown', res, { runHistoryStore: store });
  assert.equal(status(), 404);
});

test('handleBundleAggregate computes outcome buckets + cost total', async () => {
  const records: RunRecord[] = [
    { runId: 'r1', createdAt: '2026-04-26T00:00:00Z', scenarioId: 's', scenarioVersion: '1.0.0', leaderConfigHash: 'h1', economicsProfile: 'demo', sourceMode: 'hosted_demo', createdBy: 'anonymous', bundleId: 'b1', costUSD: 0.30, durationMs: 60000 },
    { runId: 'r2', createdAt: '2026-04-26T00:00:01Z', scenarioId: 's', scenarioVersion: '1.0.0', leaderConfigHash: 'h2', economicsProfile: 'demo', sourceMode: 'hosted_demo', createdBy: 'anonymous', bundleId: 'b1', costUSD: 0.20, durationMs: 30000 },
  ];
  const store = { ...createNoopRunHistoryStore(), listRunsByBundleId: async () => records };
  const { res, chunks, status } = makeRes();
  await handleBundleAggregate('b1', res, { runHistoryStore: store });
  assert.equal(status(), 200);
  const body = JSON.parse(chunks.join(''));
  assert.equal(body.count, 2);
  assert.equal(body.costTotalUSD, 0.50);
  assert.equal(body.meanDurationMs, 45000);
});
```

- [ ] **Step 2: Run, expect fail (module not found)**

```
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/bundle-routes.test.ts
```

- [ ] **Step 3: Implement minimal**

```ts
// src/cli/bundle-routes.ts
/**
 * HTTP handlers for the Compare-runs UI's bundle endpoints. A bundle is
 * a set of RunRecords sharing a `bundleId`, produced by one Quickstart
 * submission. The dashboard's CompareModal fetches:
 *
 *   - GET /api/v1/bundles/:id            -> bundle metadata + member runs
 *   - GET /api/v1/bundles/:id/aggregate  -> server-side rollup (counts, cost)
 *
 * Lazy-loading: members in the listBundle response carry only the
 * RunRecord summary (cost, duration, leaderName, summaryTrajectory).
 * Full RunArtifact JSON is fetched per-cell via the existing
 * /api/v1/runs/:id endpoint when a cell is pinned or opened.
 *
 * @module paracosm/cli/bundle-routes
 */
import type { ServerResponse } from 'node:http';
import type { RunHistoryStore } from './server/run-history-store.js';
import type { RunRecord } from './server/run-record.js';

export interface BundleRoutesDeps {
  runHistoryStore: RunHistoryStore;
}

export async function handleListBundle(
  bundleId: string,
  res: ServerResponse,
  deps: BundleRoutesDeps,
): Promise<void> {
  if (!deps.runHistoryStore.listRunsByBundleId) {
    res.writeHead(501, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'bundle queries not supported by this store' }));
    return;
  }
  const members = await deps.runHistoryStore.listRunsByBundleId(bundleId);
  if (members.length === 0) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Bundle ${bundleId} has no members` }));
    return;
  }
  const scenarioId = members[0].scenarioId;
  const createdAt = members[0].createdAt;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    bundleId,
    scenarioId,
    createdAt,
    memberCount: members.length,
    members,
  }));
}

export interface BundleAggregate {
  bundleId: string;
  count: number;
  costTotalUSD: number;
  meanDurationMs: number;
  outcomeBuckets: Record<string, number>;
}

export async function handleBundleAggregate(
  bundleId: string,
  res: ServerResponse,
  deps: BundleRoutesDeps,
): Promise<void> {
  if (!deps.runHistoryStore.listRunsByBundleId) {
    res.writeHead(501, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'bundle queries not supported' }));
    return;
  }
  const members = await deps.runHistoryStore.listRunsByBundleId(bundleId);
  if (members.length === 0) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Bundle ${bundleId} has no members` }));
    return;
  }
  const aggregate = computeAggregate(bundleId, members);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(aggregate));
}

export function computeAggregate(bundleId: string, members: RunRecord[]): BundleAggregate {
  const costTotalUSD = members.reduce((sum, m) => sum + (m.costUSD ?? 0), 0);
  const durations = members.map(m => m.durationMs ?? 0).filter(d => d > 0);
  const meanDurationMs = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;
  // Outcome buckets are populated in Phase 2.3 from artifact.fingerprint;
  // RunRecord alone doesn't carry the outcome class, so v1 of the aggregate
  // returns an empty bucket map. The aggregate strip's outcome chart treats
  // empty buckets as "data unavailable" gracefully.
  const outcomeBuckets: Record<string, number> = {};
  return { bundleId, count: members.length, costTotalUSD, meanDurationMs, outcomeBuckets };
}
```

- [ ] **Step 4: Run, expect pass**

Same command. Three tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/bundle-routes.ts src/cli/bundle-routes.test.ts
git commit -m "feat(server): bundle-routes handleListBundle + handleBundleAggregate"
```

---

### Task 2.3: Wire bundle routes into server-app

**Files:**
- Modify: `src/cli/server-app.ts`

- [ ] **Step 1: Find where existing /api/v1/runs routes are registered**

```bash
grep -n "/api/v1/runs/" src/cli/server-app.ts | head
```

- [ ] **Step 2: Add bundle route registrations**

After the existing /api/v1/runs route block, add a parallel block for bundles. Match the existing pattern (req.method === 'GET', path-extraction with regex). Specifically:

```ts
    if (req.url?.startsWith('/api/v1/bundles/') && req.method === 'GET') {
      const match = req.url.match(/^\/api\/v1\/bundles\/([^/?]+)(\/aggregate)?(\?.*)?$/);
      if (!match) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid bundle URL' }));
        return;
      }
      const bundleId = decodeURIComponent(match[1]);
      const isAggregate = !!match[2];
      const { handleListBundle, handleBundleAggregate } = await import('./bundle-routes.js');
      const deps = { runHistoryStore };
      try {
        if (isAggregate) await handleBundleAggregate(bundleId, res, deps);
        else await handleListBundle(bundleId, res, deps);
      } catch (err) {
        writeJsonError(res, err);
      }
      return;
    }
```

- [ ] **Step 3: Add `bundleId` filter to /api/v1/runs**

Find the existing /api/v1/runs handler. Where it parses query-string filters, add:

```ts
        const bundleId = url.searchParams.get('bundleId') ?? undefined;
```

And pass it into the `listRuns({ ..., bundleId })` call.

- [ ] **Step 4: Update sqlite store's `listRuns` to honor bundleId filter**

In `src/cli/server/sqlite-run-history-store.ts:listRuns`, add a `WHERE bundle_id = ?` clause when `filters.bundleId` is set, mirroring how `scenarioId` is handled.

- [ ] **Step 5: Run typecheck + boot the dashboard locally to confirm no regressions**

```
npm run typecheck
PORT=3458 PARACOSM_SKIP_BANNER=1 node --import tsx src/cli/serve.ts &
SERVER=$!
sleep 4
curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3458/api/v1/bundles/test
kill $SERVER
```

Expect: HTTP 404 (bundle "test" doesn't exist; that's the correct response shape).

- [ ] **Step 6: Commit**

```bash
git add src/cli/server-app.ts src/cli/server/sqlite-run-history-store.ts
git commit -m "feat(server): wire /api/v1/bundles routes + bundleId filter on /api/v1/runs"
```

---

### Task 2.4: Generate bundleId in /setup batch path + persist on each RunRecord

**Files:**
- Modify: `src/cli/server-app.ts`
- Modify: `src/cli/pair-runner.ts` (or wherever onArtifact persists; Phase 2.3 likely showed this)

- [ ] **Step 1: Locate where /setup persists each RunRecord after artifacts arrive**

```bash
grep -n "insertRun\|createRunRecord" src/cli/server-app.ts | head
```

- [ ] **Step 2: When the batch path is taken, generate a bundleId once and pass it to each insertRun call**

In the /setup handler, before dispatching to `runBatchSimulations` and only when the request was a Quickstart bundle (`config.quickstart` present, OR `config.leaders.length >= 2`):

```ts
        const { generateBundleId } = await import('./server/bundle-id.js');
        const { extractSummaryTrajectory } = await import('./server/run-summary-trajectory.js');
        const bundleId = config.leaders.length >= 2 ? generateBundleId() : undefined;
```

Then in the `onArtifact` callback that persists each RunRecord, attach `bundleId` and `summaryTrajectory`:

```ts
        const onArtifact = async (artifact, leader) => {
          const record = createRunRecord({
            // ... existing fields ...
            bundleId,
            summaryTrajectory: extractSummaryTrajectory(artifact),
          });
          await runHistoryStore.insertRun(record);
          // ... existing post-insert logic ...
        };
```

- [ ] **Step 3: Confirm with a manual end-to-end test**

```bash
PORT=3458 PARACOSM_SKIP_BANNER=1 node --import tsx src/cli/serve.ts &
SERVER=$!
sleep 4
# Submit a 2-leader run via /setup (curl with the existing scenario)
# ... run completes ...
# Check the runs db
sqlite3 data/runs.db "SELECT bundle_id, leader_name FROM runs ORDER BY created_at DESC LIMIT 4;"
kill $SERVER
```
Expect: two rows share the same bundle_id.

- [ ] **Step 4: Commit**

```bash
git add src/cli/server-app.ts
git commit -m "feat(server): generate bundleId per /setup batch + persist on each RunRecord"
```

---

## Phase 3: LIBRARY bundle card

### Task 3.1: `groupRunsByBundle` pure helper

**Files:**
- Create: `src/cli/dashboard/src/components/library/groupRunsByBundle.ts`
- Create: `src/cli/dashboard/src/components/library/groupRunsByBundle.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/cli/dashboard/src/components/library/groupRunsByBundle.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupRunsByBundle } from './groupRunsByBundle.js';
import type { RunRecord } from '../../../../server/run-record.js';

const r = (overrides: Partial<RunRecord>): RunRecord => ({
  runId: 'x', createdAt: '2026-04-26T00:00:00Z', scenarioId: 's', scenarioVersion: '1',
  leaderConfigHash: 'h', economicsProfile: 'demo', sourceMode: 'hosted_demo', createdBy: 'anonymous',
  ...overrides,
});

test('runs without bundleId render as solo entries', () => {
  const out = groupRunsByBundle([r({ runId: 'a' }), r({ runId: 'b' })]);
  assert.equal(out.length, 2);
  assert.equal(out[0].kind, 'solo');
  assert.equal(out[1].kind, 'solo');
});

test('runs with the same bundleId collapse into one bundle entry', () => {
  const out = groupRunsByBundle([
    r({ runId: 'a', bundleId: 'b1' }),
    r({ runId: 'b', bundleId: 'b1' }),
    r({ runId: 'c', bundleId: 'b1' }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'bundle');
  if (out[0].kind === 'bundle') {
    assert.equal(out[0].bundleId, 'b1');
    assert.equal(out[0].members.length, 3);
  }
});

test('mixed solo + bundles preserve createdAt ordering by leader entry', () => {
  const out = groupRunsByBundle([
    r({ runId: 'solo1', createdAt: '2026-04-26T00:00:00Z' }),
    r({ runId: 'b1m1', bundleId: 'b1', createdAt: '2026-04-26T00:00:01Z' }),
    r({ runId: 'b1m2', bundleId: 'b1', createdAt: '2026-04-26T00:00:02Z' }),
    r({ runId: 'solo2', createdAt: '2026-04-26T00:00:03Z' }),
  ]);
  assert.equal(out.length, 3);
  // Order: solo1 (oldest), bundle b1 (uses earliest member's createdAt), solo2.
  assert.equal(out[0].kind === 'solo' && out[0].record.runId, 'solo1');
  assert.equal(out[1].kind === 'bundle' && out[1].bundleId, 'b1');
  assert.equal(out[2].kind === 'solo' && out[2].record.runId, 'solo2');
});

test('bundle entry exposes scenarioId, totalCostUSD, memberCount', () => {
  const out = groupRunsByBundle([
    r({ runId: 'a', bundleId: 'b1', costUSD: 0.30, scenarioId: 'mars-genesis' }),
    r({ runId: 'b', bundleId: 'b1', costUSD: 0.20, scenarioId: 'mars-genesis' }),
  ]);
  assert.equal(out[0].kind, 'bundle');
  if (out[0].kind === 'bundle') {
    assert.equal(out[0].scenarioId, 'mars-genesis');
    assert.equal(out[0].totalCostUSD, 0.50);
    assert.equal(out[0].memberCount, 2);
  }
});
```

- [ ] **Step 2: Run, expect fail**

```
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/dashboard/src/components/library/groupRunsByBundle.test.ts
```

- [ ] **Step 3: Implement minimal**

```ts
// src/cli/dashboard/src/components/library/groupRunsByBundle.ts
/**
 * Group a flat list of RunRecords into either solo entries (no bundleId)
 * or bundle entries (multiple records sharing a bundleId). Used by
 * RunGallery to render BundleCard for grouped + RunCard for solo.
 *
 * @module paracosm/dashboard/library/groupRunsByBundle
 */
import type { RunRecord } from '../../../../server/run-record.js';

export type GalleryEntry =
  | { kind: 'solo'; record: RunRecord }
  | {
      kind: 'bundle';
      bundleId: string;
      scenarioId: string;
      memberCount: number;
      totalCostUSD: number;
      earliestCreatedAt: string;
      members: RunRecord[];
    };

export function groupRunsByBundle(records: RunRecord[]): GalleryEntry[] {
  const buckets = new Map<string, RunRecord[]>();
  const solos: RunRecord[] = [];
  for (const r of records) {
    if (r.bundleId) {
      const arr = buckets.get(r.bundleId) ?? [];
      arr.push(r);
      buckets.set(r.bundleId, arr);
    } else {
      solos.push(r);
    }
  }
  const entries: GalleryEntry[] = [];
  for (const [bundleId, members] of buckets) {
    members.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    entries.push({
      kind: 'bundle',
      bundleId,
      scenarioId: members[0].scenarioId,
      memberCount: members.length,
      totalCostUSD: members.reduce((s, m) => s + (m.costUSD ?? 0), 0),
      earliestCreatedAt: members[0].createdAt,
      members,
    });
  }
  for (const r of solos) {
    entries.push({ kind: 'solo', record: r });
  }
  // Sort by createdAt ascending (oldest first; gallery may reverse for display).
  entries.sort((a, b) => {
    const aT = a.kind === 'solo' ? a.record.createdAt : a.earliestCreatedAt;
    const bT = b.kind === 'solo' ? b.record.createdAt : b.earliestCreatedAt;
    return aT.localeCompare(bT);
  });
  return entries;
}
```

- [ ] **Step 4: Run, expect pass**

Same command. 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/dashboard/src/components/library/groupRunsByBundle.ts src/cli/dashboard/src/components/library/groupRunsByBundle.test.ts
git commit -m "feat(library): groupRunsByBundle pure helper"
```

---

### Task 3.2: `BundleCard` component

**Files:**
- Create: `src/cli/dashboard/src/components/library/BundleCard.tsx`
- Create: `src/cli/dashboard/src/components/library/BundleCard.module.scss`

- [ ] **Step 1: Write component**

```tsx
// src/cli/dashboard/src/components/library/BundleCard.tsx
import * as React from 'react';
import styles from './BundleCard.module.scss';
import type { GalleryEntry } from './groupRunsByBundle.js';

export interface BundleCardProps {
  /** A bundle entry from groupRunsByBundle. Exposes scenarioId,
   *  memberCount, totalCostUSD, and the member RunRecords. */
  entry: Extract<GalleryEntry, { kind: 'bundle' }>;
  /** Open the Compare view for this bundle. */
  onOpen: () => void;
}

export function BundleCard({ entry, onOpen }: BundleCardProps): JSX.Element {
  return (
    <article
      className={styles.card}
      role="article"
      tabIndex={0}
      aria-label={`Bundle ${entry.bundleId} · ${entry.memberCount} actors against ${entry.scenarioId}`}
      data-bundle-card
      data-bundle-id={entry.bundleId}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <header className={styles.head}>
        <span className={styles.bundleBadge}>BUNDLE</span>
        <span className={styles.count}>{entry.memberCount} actors</span>
        <span className={styles.cost}>
          {entry.totalCostUSD > 0 ? `$${entry.totalCostUSD.toFixed(2)}` : '—'}
        </span>
        <span className={styles.time}>{relativeTime(entry.earliestCreatedAt)}</span>
      </header>
      <h3 className={styles.scenario}>{entry.scenarioId}</h3>
      <ul className={styles.actors} aria-label="Bundle members">
        {entry.members.slice(0, 5).map((m) => (
          <li key={m.runId} className={styles.actor}>
            {m.leaderName ?? 'Unknown'}
            {m.leaderArchetype ? <span className={styles.archetype}> · {m.leaderArchetype}</span> : null}
          </li>
        ))}
        {entry.members.length > 5 && (
          <li className={styles.more}>+ {entry.members.length - 5} more</li>
        )}
      </ul>
      <div className={styles.actions}>
        <button onClick={(e) => { e.stopPropagation(); onOpen(); }} className={styles.actionBtn}>Compare</button>
      </div>
    </article>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}
```

- [ ] **Step 2: Write SCSS**

```scss
// src/cli/dashboard/src/components/library/BundleCard.module.scss
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: border-color .15s, box-shadow .15s;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;

  &:hover, &:focus-visible {
    border-color: var(--amber);
    box-shadow: 0 4px 16px rgba(0, 0, 0, .25);
    outline: none;
  }
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-3);
}

.bundleBadge {
  font-weight: 700;
  letter-spacing: .5px;
  color: var(--amber);
  background: rgba(200, 88, 40, .08);
  border: 1px solid rgba(200, 88, 40, .25);
  border-radius: 4px;
  padding: 2px 6px;
}

.count { font-weight: 600; }
.cost { color: var(--text-2); margin-left: auto; }
.time { color: var(--text-3); }

.scenario {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
}

.actors {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.actor {
  font-size: 12px;
  color: var(--text-2);
}

.archetype {
  color: var(--text-3);
}

.more {
  font-size: 12px;
  color: var(--text-3);
  font-style: italic;
}

.actions {
  margin-top: auto;
  display: flex;
  gap: 8px;
}

.actionBtn {
  background: var(--bg-card-alt, var(--bg-deep));
  color: var(--amber);
  border: 1px solid var(--amber);
  border-radius: 4px;
  padding: 6px 12px;
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .5px;
  text-transform: uppercase;
  cursor: pointer;
  transition: background .15s;

  &:hover {
    background: rgba(200, 88, 40, .12);
  }
}
```

- [ ] **Step 3: Typecheck**

```
npm run typecheck:dashboard
```

- [ ] **Step 4: Commit**

```bash
git add src/cli/dashboard/src/components/library/BundleCard.tsx src/cli/dashboard/src/components/library/BundleCard.module.scss
git commit -m "feat(library): BundleCard component"
```

---

### Task 3.3: Wire BundleCard into RunGallery

**Files:**
- Modify: `src/cli/dashboard/src/components/library/RunGallery.tsx`

- [ ] **Step 1: Read current RunGallery to understand iteration**

```bash
cat src/cli/dashboard/src/components/library/RunGallery.tsx
```

- [ ] **Step 2: Replace the `records.map(r => <RunCard ... />)` with bundle-aware iteration**

```tsx
import { groupRunsByBundle } from './groupRunsByBundle.js';
import { BundleCard } from './BundleCard.js';

// inside the component:
const entries = React.useMemo(() => groupRunsByBundle(records), [records]);

return (
  <div className={styles.grid}>
    {entries.map((entry) =>
      entry.kind === 'bundle'
        ? <BundleCard key={entry.bundleId} entry={entry} onOpen={() => onOpenBundle(entry.bundleId)} />
        : <RunCard key={entry.record.runId} record={entry.record} onOpen={() => onOpenRun(entry.record.runId)} onReplay={() => onReplay(entry.record.runId)} />
    )}
  </div>
);
```

The component's props gain `onOpenBundle: (bundleId: string) => void;`.

- [ ] **Step 3: Update RunGallery's caller (LibraryTab) to provide onOpenBundle**

In `LibraryTab.tsx`, add state for `compareBundleId` and a handler that opens the CompareModal:

```tsx
const [compareBundleId, setCompareBundleId] = React.useState<string | null>(null);
// pass to RunGallery
<RunGallery records={records} onOpenRun={...} onOpenBundle={setCompareBundleId} onReplay={...} />
// render CompareModal
{compareBundleId && (
  <CompareModal bundleId={compareBundleId} open onClose={() => setCompareBundleId(null)} />
)}
```

(CompareModal is built in Phase 4; for now stub it as a placeholder div until that task lands.)

- [ ] **Step 4: Typecheck**

```
npm run typecheck:dashboard
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/dashboard/src/components/library/RunGallery.tsx src/cli/dashboard/src/components/library/LibraryTab.tsx
git commit -m "feat(library): RunGallery groups bundles into BundleCard"
```

---

### Task 3.4: Remove disabled "Compare" button from `RunCard`

**Files:**
- Modify: `src/cli/dashboard/src/components/library/RunCard.tsx`

- [ ] **Step 1: Locate line 44**

```tsx
<button disabled className={styles.actionBtn} aria-label="Compare (coming soon)" title="Compare (coming soon)">Compare</button>
```

- [ ] **Step 2: Delete that line**

The Compare action is no longer per-run; it lives at the bundle level. Solo runs (no bundleId) keep the existing Open + Replay buttons only.

- [ ] **Step 3: Typecheck**

```
npm run typecheck:dashboard
```

- [ ] **Step 4: Commit**

```bash
git add src/cli/dashboard/src/components/library/RunCard.tsx
git commit -m "feat(library): drop disabled Compare button on RunCard (now bundle-level)"
```

---

## Phase 4: CompareModal shell

### Task 4.1: `useBundle` hook (fetch metadata + members)

**Files:**
- Create: `src/cli/dashboard/src/components/compare/hooks/useBundle.ts`

- [ ] **Step 1: Write hook**

```ts
// src/cli/dashboard/src/components/compare/hooks/useBundle.ts
/**
 * Fetch the bundle metadata + member RunRecords for a given bundleId.
 * Used by CompareModal as the entry-point fetch; full RunArtifacts
 * are loaded per-cell on demand via useBundleArtifacts.
 *
 * @module paracosm/dashboard/compare/hooks/useBundle
 */
import * as React from 'react';
import type { RunRecord } from '../../../../../server/run-record.js';

export interface BundlePayload {
  bundleId: string;
  scenarioId: string;
  createdAt: string;
  memberCount: number;
  members: RunRecord[];
}

export interface UseBundleResult {
  bundle: BundlePayload | null;
  loading: boolean;
  error: string | null;
}

export function useBundle(bundleId: string | null): UseBundleResult {
  const [state, setState] = React.useState<UseBundleResult>({ bundle: null, loading: false, error: null });
  React.useEffect(() => {
    if (!bundleId) {
      setState({ bundle: null, loading: false, error: null });
      return;
    }
    const ctrl = new AbortController();
    setState({ bundle: null, loading: true, error: null });
    fetch(`/api/v1/bundles/${encodeURIComponent(bundleId)}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
        return res.json() as Promise<BundlePayload>;
      })
      .then((bundle) => setState({ bundle, loading: false, error: null }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({ bundle: null, loading: false, error: String(err.message ?? err) });
      });
    return () => ctrl.abort();
  }, [bundleId]);
  return state;
}
```

- [ ] **Step 2: Typecheck**

```
npm run typecheck:dashboard
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/dashboard/src/components/compare/hooks/useBundle.ts
git commit -m "feat(compare): useBundle hook fetches metadata + members"
```

---

### Task 4.2: `usePinnedRuns` hook with LRU at 3

**Files:**
- Create: `src/cli/dashboard/src/components/compare/hooks/usePinnedRuns.ts`
- Create: `src/cli/dashboard/src/components/compare/hooks/usePinnedRuns.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/cli/dashboard/src/components/compare/hooks/usePinnedRuns.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHook, act } from '@testing-library/react';
import { usePinnedRuns } from './usePinnedRuns.js';

test('starts empty', () => {
  const { result } = renderHook(() => usePinnedRuns());
  assert.deepEqual(result.current.pinned, []);
});

test('pin adds id; same id pinned twice does not duplicate', () => {
  const { result } = renderHook(() => usePinnedRuns());
  act(() => result.current.pin('r1'));
  act(() => result.current.pin('r1'));
  assert.deepEqual(result.current.pinned, ['r1']);
});

test('unpin removes id', () => {
  const { result } = renderHook(() => usePinnedRuns());
  act(() => result.current.pin('r1'));
  act(() => result.current.pin('r2'));
  act(() => result.current.unpin('r1'));
  assert.deepEqual(result.current.pinned, ['r2']);
});

test('pinning a 4th evicts the oldest (LRU)', () => {
  const { result } = renderHook(() => usePinnedRuns());
  act(() => result.current.pin('r1'));
  act(() => result.current.pin('r2'));
  act(() => result.current.pin('r3'));
  act(() => result.current.pin('r4'));
  assert.deepEqual(result.current.pinned, ['r2', 'r3', 'r4']);
});

test('isPinned reflects current state', () => {
  const { result } = renderHook(() => usePinnedRuns());
  act(() => result.current.pin('r1'));
  assert.equal(result.current.isPinned('r1'), true);
  assert.equal(result.current.isPinned('r2'), false);
});

test('togglePin pins when not pinned, unpins when pinned', () => {
  const { result } = renderHook(() => usePinnedRuns());
  act(() => result.current.togglePin('r1'));
  assert.deepEqual(result.current.pinned, ['r1']);
  act(() => result.current.togglePin('r1'));
  assert.deepEqual(result.current.pinned, []);
});
```

NOTE: requires `@testing-library/react` for `renderHook`. If not already installed, add to dashboard's devDependencies. Check first:

```bash
grep -A 1 '"@testing-library/react"' src/cli/dashboard/package.json
```

If missing, install:

```bash
cd src/cli/dashboard && npm install --save-dev @testing-library/react
```

- [ ] **Step 2: Run, expect fail**

```
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/dashboard/src/components/compare/hooks/usePinnedRuns.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/cli/dashboard/src/components/compare/hooks/usePinnedRuns.ts
/**
 * Pin/unpin run ids in the Compare view's small-multiples grid. Caps at
 * 3 simultaneously pinned via LRU eviction so the PinnedDiffPanel never
 * has to render more than 3 columns. Pure local state — survives
 * neither tab change nor page reload (no localStorage v1).
 *
 * @module paracosm/dashboard/compare/hooks/usePinnedRuns
 */
import * as React from 'react';

export const PIN_LIMIT = 3;

export interface PinnedRunsState {
  pinned: string[];
  pin: (runId: string) => void;
  unpin: (runId: string) => void;
  togglePin: (runId: string) => void;
  isPinned: (runId: string) => boolean;
}

export function usePinnedRuns(): PinnedRunsState {
  const [pinned, setPinned] = React.useState<string[]>([]);

  const pin = React.useCallback((runId: string) => {
    setPinned((prev) => {
      if (prev.includes(runId)) return prev;
      const next = [...prev, runId];
      while (next.length > PIN_LIMIT) next.shift();
      return next;
    });
  }, []);

  const unpin = React.useCallback((runId: string) => {
    setPinned((prev) => prev.filter((id) => id !== runId));
  }, []);

  const isPinned = React.useCallback(
    (runId: string) => pinned.includes(runId),
    [pinned],
  );

  const togglePin = React.useCallback((runId: string) => {
    if (isPinned(runId)) unpin(runId);
    else pin(runId);
  }, [pin, unpin, isPinned]);

  return { pinned, pin, unpin, togglePin, isPinned };
}
```

- [ ] **Step 4: Run, expect pass**

Same command. 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/dashboard/src/components/compare/hooks/usePinnedRuns.ts src/cli/dashboard/src/components/compare/hooks/usePinnedRuns.test.ts
git commit -m "feat(compare): usePinnedRuns hook with LRU eviction at 3"
```

---

### Task 4.3: `CompareModal` shell component

**Files:**
- Create: `src/cli/dashboard/src/components/compare/CompareModal.tsx`
- Create: `src/cli/dashboard/src/components/compare/CompareModal.module.scss`

- [ ] **Step 1: Write component (shell only — child rendering arrives in later tasks)**

```tsx
// src/cli/dashboard/src/components/compare/CompareModal.tsx
import * as React from 'react';
import styles from './CompareModal.module.scss';
import { useBundle } from './hooks/useBundle.js';

export interface CompareModalProps {
  bundleId: string;
  open: boolean;
  onClose: () => void;
}

export function CompareModal({ bundleId, open, onClose }: CompareModalProps): JSX.Element | null {
  const { bundle, loading, error } = useBundle(open ? bundleId : null);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      const target = ref.current?.querySelector<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])');
      target?.focus();
    });
    return () => {
      document.body.style.overflow = '';
      lastFocusedRef.current?.focus();
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} role="presentation" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-modal-title"
        className={styles.modal}
      >
        <header className={styles.head}>
          <h2 id="compare-modal-title" className={styles.title}>
            {loading ? 'Loading bundle…' : bundle ? `${bundle.scenarioId} · ${bundle.memberCount} actors` : 'Bundle'}
          </h2>
          <button onClick={onClose} className={styles.closeBtn} aria-label="Close compare">×</button>
        </header>
        <section className={styles.body}>
          {error && <p className={styles.error}>{error}</p>}
          {loading && <p className={styles.placeholder}>Loading bundle metadata…</p>}
          {bundle && (
            <>
              {/* Phase 5: AggregateStrip */}
              {/* Phase 6: SmallMultiplesGrid */}
              {/* Phase 7: PinnedDiffPanel */}
              <p className={styles.placeholder}>
                Bundle loaded with {bundle.memberCount} members. AggregateStrip / SmallMultiplesGrid / PinnedDiffPanel land in Phase 5–7.
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Write SCSS**

```scss
// src/cli/dashboard/src/components/compare/CompareModal.module.scss
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 99;
}

.modal {
  position: fixed;
  inset: 24px;
  background: var(--bg-deep);
  border: 1px solid var(--border);
  border-radius: 14px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 64px rgba(0, 0, 0, .6);
  overflow: hidden;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
}

.title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-1);
  font-family: var(--mono);
  letter-spacing: .5px;
}

.closeBtn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-2);
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  transition: color .15s, border-color .15s;
  &:hover { color: var(--amber); border-color: var(--amber); }
}

.body {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.placeholder {
  font-family: var(--mono);
  color: var(--text-3);
  font-size: 13px;
}

.error {
  background: rgba(200, 60, 40, .08);
  border: 1px solid rgba(200, 60, 40, .35);
  color: rgb(255, 130, 100);
  padding: 12px;
  border-radius: 8px;
  font-family: var(--mono);
  font-size: 13px;
}
```

- [ ] **Step 3: Wire CompareModal in LibraryTab (replacing the placeholder div from Task 3.3)**

```tsx
import { CompareModal } from '../compare/CompareModal.js';

// replace placeholder with:
{compareBundleId && (
  <CompareModal bundleId={compareBundleId} open onClose={() => setCompareBundleId(null)} />
)}
```

- [ ] **Step 4: Typecheck + boot dashboard, click a bundle card**

```
npm run typecheck:dashboard
npm run dashboard:dev # or paracosm dashboard
```

Manually click any bundle card in the LIBRARY tab. CompareModal should open with "Loading bundle…" then render member count.

- [ ] **Step 5: Commit**

```bash
git add src/cli/dashboard/src/components/compare/CompareModal.tsx src/cli/dashboard/src/components/compare/CompareModal.module.scss src/cli/dashboard/src/components/library/LibraryTab.tsx
git commit -m "feat(compare): CompareModal shell + LIBRARY wiring"
```

---

## Phase 5: AggregateStrip

### Task 5.1: `useBundleAggregate` hook

**Files:**
- Create: `src/cli/dashboard/src/components/compare/hooks/useBundleAggregate.ts`

- [ ] **Step 1: Write hook (mirrors useBundle pattern)**

```ts
// src/cli/dashboard/src/components/compare/hooks/useBundleAggregate.ts
import * as React from 'react';

export interface BundleAggregate {
  bundleId: string;
  count: number;
  costTotalUSD: number;
  meanDurationMs: number;
  outcomeBuckets: Record<string, number>;
}

export interface UseBundleAggregateResult {
  aggregate: BundleAggregate | null;
  loading: boolean;
  error: string | null;
}

export function useBundleAggregate(bundleId: string | null): UseBundleAggregateResult {
  const [state, setState] = React.useState<UseBundleAggregateResult>({ aggregate: null, loading: false, error: null });
  React.useEffect(() => {
    if (!bundleId) {
      setState({ aggregate: null, loading: false, error: null });
      return;
    }
    const ctrl = new AbortController();
    setState({ aggregate: null, loading: true, error: null });
    fetch(`/api/v1/bundles/${encodeURIComponent(bundleId)}/aggregate`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<BundleAggregate>;
      })
      .then((aggregate) => setState({ aggregate, loading: false, error: null }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({ aggregate: null, loading: false, error: String(err.message ?? err) });
      });
    return () => ctrl.abort();
  }, [bundleId]);
  return state;
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck:dashboard
git add src/cli/dashboard/src/components/compare/hooks/useBundleAggregate.ts
git commit -m "feat(compare): useBundleAggregate hook"
```

---

### Task 5.2: `AggregateStrip` four-chart strip

**Files:**
- Create: `src/cli/dashboard/src/components/compare/AggregateStrip.tsx`
- Create: `src/cli/dashboard/src/components/compare/AggregateStrip.module.scss`

- [ ] **Step 1: Component**

```tsx
// src/cli/dashboard/src/components/compare/AggregateStrip.tsx
import * as React from 'react';
import styles from './AggregateStrip.module.scss';
import type { BundleAggregate } from './hooks/useBundleAggregate.js';
import type { RunRecord } from '../../../../server/run-record.js';

export interface AggregateStripProps {
  aggregate: BundleAggregate;
  members: RunRecord[];
}

export function AggregateStrip({ aggregate, members }: AggregateStripProps): JSX.Element {
  return (
    <section className={styles.strip} aria-label="Bundle aggregate stats">
      <Tile label="Actors"  value={`${aggregate.count}`} />
      <Tile label="Total cost" value={aggregate.costTotalUSD > 0 ? `$${aggregate.costTotalUSD.toFixed(2)}` : '—'} />
      <Tile label="Mean run time" value={formatDuration(aggregate.meanDurationMs)} />
      <TrajectoryOverlay members={members} />
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.tile}>
      <div className={styles.tileLabel}>{label}</div>
      <div className={styles.tileValue}>{value}</div>
    </div>
  );
}

function TrajectoryOverlay({ members }: { members: RunRecord[] }) {
  const series = members
    .map((m) => m.summaryTrajectory ?? [])
    .filter((s) => s.length > 0);
  if (series.length === 0) {
    return <div className={styles.tile}><div className={styles.tileLabel}>Trajectory</div><div className={styles.tileLabel}>no sparkline data</div></div>;
  }
  const W = 240, H = 60, pad = 4;
  const allValues = series.flat();
  const minV = Math.min(...allValues);
  const maxV = Math.max(...allValues);
  const range = Math.max(1e-6, maxV - minV);
  const stepX = (W - pad * 2) / Math.max(1, Math.max(...series.map(s => s.length)) - 1);
  return (
    <div className={styles.overlayTile}>
      <div className={styles.tileLabel}>Trajectory overlay (all actors)</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="All actors trajectory overlay">
        {series.map((s, i) => {
          const points = s.map((v, x) => `${pad + x * stepX},${pad + (H - pad * 2) * (1 - (v - minV) / range)}`).join(' ');
          return <polyline key={i} points={points} fill="none" stroke="var(--amber)" strokeWidth={1} opacity={0.45} />;
        })}
      </svg>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (!ms || ms < 1000) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}
```

- [ ] **Step 2: SCSS**

```scss
// src/cli/dashboard/src/components/compare/AggregateStrip.module.scss
.strip {
  display: grid;
  grid-template-columns: 100px 110px 130px 1fr;
  gap: 16px;
  align-items: stretch;
}

.tile, .overlayTile {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.overlayTile { padding: 8px 12px; }

.tileLabel {
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .8px;
  color: var(--text-3);
  text-transform: uppercase;
}

.tileValue {
  font-family: var(--mono);
  font-size: 18px;
  font-weight: 700;
  color: var(--amber);
}

svg {
  width: 100%;
  height: 60px;
  display: block;
}

@media (max-width: 900px) {
  .strip {
    grid-template-columns: 1fr 1fr;
  }
  .overlayTile {
    grid-column: 1 / -1;
  }
}
```

- [ ] **Step 3: Wire into CompareModal body**

In `CompareModal.tsx`, replace the placeholder paragraph with:

```tsx
import { AggregateStrip } from './AggregateStrip.js';
import { useBundleAggregate } from './hooks/useBundleAggregate.js';
// ... inside the component, after useBundle:
const { aggregate } = useBundleAggregate(open ? bundleId : null);
// ... in JSX where the placeholder was:
{bundle && aggregate && <AggregateStrip aggregate={aggregate} members={bundle.members} />}
```

- [ ] **Step 4: Typecheck + commit**

```bash
npm run typecheck:dashboard
git add src/cli/dashboard/src/components/compare/AggregateStrip.tsx src/cli/dashboard/src/components/compare/AggregateStrip.module.scss src/cli/dashboard/src/components/compare/CompareModal.tsx
git commit -m "feat(compare): AggregateStrip four-chart top section"
```

---

## Phase 6: SmallMultiplesGrid + CompareCell

### Task 6.1: `CompareCell` component

**Files:**
- Create: `src/cli/dashboard/src/components/compare/CompareCell.tsx`
- Create: `src/cli/dashboard/src/components/compare/CompareCell.module.scss`

- [ ] **Step 1: Component**

```tsx
// src/cli/dashboard/src/components/compare/CompareCell.tsx
import * as React from 'react';
import styles from './CompareCell.module.scss';
import type { RunRecord } from '../../../../server/run-record.js';

export interface CompareCellProps {
  record: RunRecord;
  pinned: boolean;
  onTogglePin: () => void;
  onOpen: () => void;
}

export function CompareCell({ record, pinned, onTogglePin, onOpen }: CompareCellProps): JSX.Element {
  return (
    <article className={[styles.cell, pinned ? styles.pinned : ''].filter(Boolean).join(' ')}>
      <header className={styles.head}>
        <div className={styles.titles}>
          <h4 className={styles.name}>{record.leaderName ?? 'Unknown'}</h4>
          {record.leaderArchetype && <p className={styles.archetype}>{record.leaderArchetype}</p>}
        </div>
        <label className={styles.pinLabel} title={pinned ? 'Unpin' : 'Pin to compare side-by-side'}>
          <input
            type="checkbox"
            checked={pinned}
            onChange={onTogglePin}
            aria-label={pinned ? `Unpin ${record.leaderName}` : `Pin ${record.leaderName} to compare`}
          />
          <span aria-hidden="true">{pinned ? '★' : '☆'}</span>
        </label>
      </header>
      <Sparkline values={record.summaryTrajectory ?? []} />
      <footer className={styles.foot}>
        <span className={styles.cost}>{record.costUSD ? `$${record.costUSD.toFixed(2)}` : '—'}</span>
        <span className={styles.duration}>{record.durationMs ? `${Math.round(record.durationMs / 1000)}s` : '—'}</span>
        <button onClick={onOpen} className={styles.openBtn} aria-label="Open run details">Open</button>
      </footer>
    </article>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className={styles.sparklineEmpty}>—</div>;
  const W = 220, H = 36, pad = 2;
  const minV = Math.min(...values), maxV = Math.max(...values);
  const range = Math.max(1e-6, maxV - minV);
  const points = values
    .map((v, i) => `${pad + (i / (values.length - 1)) * (W - pad * 2)},${pad + (H - pad * 2) * (1 - (v - minV) / range)}`)
    .join(' ');
  return (
    <svg className={styles.sparkline} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Run trajectory sparkline">
      <polyline points={points} fill="none" stroke="var(--amber)" strokeWidth={1.5} />
    </svg>
  );
}
```

- [ ] **Step 2: SCSS**

```scss
// src/cli/dashboard/src/components/compare/CompareCell.module.scss
.cell {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color .15s, box-shadow .15s;
  min-width: 240px;
}

.cell.pinned {
  border-color: var(--amber);
  box-shadow: 0 0 0 1px rgba(200, 88, 40, .25), 0 4px 16px rgba(0, 0, 0, .25);
}

.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.titles { flex: 1; min-width: 0; }
.name { margin: 0; font-size: 13px; font-weight: 700; color: var(--text-1); font-family: var(--mono); }
.archetype { margin: 2px 0 0; font-size: 11px; color: var(--text-3); text-transform: uppercase; letter-spacing: .5px; }

.pinLabel {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  font-size: 16px;
  color: var(--text-3);
  & input { position: absolute; opacity: 0; pointer-events: none; }
  & span { padding: 2px 6px; border-radius: 4px; transition: color .15s, background .15s; }
  & input:focus-visible + span { outline: 2px solid var(--amber); outline-offset: 2px; }
}
.pinned .pinLabel span { color: var(--amber); }

.sparkline { width: 100%; height: 36px; display: block; }
.sparklineEmpty {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  font-family: var(--mono);
  font-size: 11px;
}

.foot { display: flex; align-items: center; gap: 8px; font-family: var(--mono); font-size: 11px; color: var(--text-3); }
.cost, .duration { background: var(--bg-deep); padding: 2px 6px; border-radius: 4px; }
.openBtn {
  margin-left: auto;
  background: none;
  border: 1px solid var(--border);
  color: var(--text-2);
  font-family: var(--mono);
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: border-color .15s, color .15s;
  &:hover { border-color: var(--amber); color: var(--amber); }
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npm run typecheck:dashboard
git add src/cli/dashboard/src/components/compare/CompareCell.tsx src/cli/dashboard/src/components/compare/CompareCell.module.scss
git commit -m "feat(compare): CompareCell component with sparkline + pin toggle"
```

---

### Task 6.2: `SmallMultiplesGrid` component

**Files:**
- Create: `src/cli/dashboard/src/components/compare/SmallMultiplesGrid.tsx`
- Create: `src/cli/dashboard/src/components/compare/SmallMultiplesGrid.module.scss`

- [ ] **Step 1: Component**

```tsx
// src/cli/dashboard/src/components/compare/SmallMultiplesGrid.tsx
import * as React from 'react';
import styles from './SmallMultiplesGrid.module.scss';
import { CompareCell } from './CompareCell.js';
import type { RunRecord } from '../../../../server/run-record.js';

export interface SmallMultiplesGridProps {
  members: RunRecord[];
  pinnedIds: string[];
  onTogglePin: (runId: string) => void;
  onOpenRun: (runId: string) => void;
}

export function SmallMultiplesGrid({
  members,
  pinnedIds,
  onTogglePin,
  onOpenRun,
}: SmallMultiplesGridProps): JSX.Element {
  return (
    <section className={styles.grid} aria-label="Bundle members grid">
      {members.map((m) => (
        <CompareCell
          key={m.runId}
          record={m}
          pinned={pinnedIds.includes(m.runId)}
          onTogglePin={() => onTogglePin(m.runId)}
          onOpen={() => onOpenRun(m.runId)}
        />
      ))}
    </section>
  );
}
```

- [ ] **Step 2: SCSS (responsive 4 → 3 → 2)**

```scss
// src/cli/dashboard/src/components/compare/SmallMultiplesGrid.module.scss
.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(240px, 1fr));
  gap: 12px;
}

@media (max-width: 1280px) { .grid { grid-template-columns: repeat(3, minmax(240px, 1fr)); } }
@media (max-width: 900px)  { .grid { grid-template-columns: repeat(2, minmax(240px, 1fr)); } }
@media (max-width: 600px)  { .grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 3: Wire into CompareModal body**

```tsx
import { SmallMultiplesGrid } from './SmallMultiplesGrid.js';
import { usePinnedRuns } from './hooks/usePinnedRuns.js';
// inside the component, after useBundle/useBundleAggregate:
const pinning = usePinnedRuns();
const [openRunId, setOpenRunId] = React.useState<string | null>(null);
// in JSX where the strip rendered, append:
{bundle && (
  <SmallMultiplesGrid
    members={bundle.members}
    pinnedIds={pinning.pinned}
    onTogglePin={pinning.togglePin}
    onOpenRun={setOpenRunId}
  />
)}
```

(Drilldown via `openRunId` opens the existing RunDetailDrawer in Phase 7's polish step.)

- [ ] **Step 4: Typecheck + commit**

```bash
npm run typecheck:dashboard
git add src/cli/dashboard/src/components/compare/SmallMultiplesGrid.tsx src/cli/dashboard/src/components/compare/SmallMultiplesGrid.module.scss src/cli/dashboard/src/components/compare/CompareModal.tsx
git commit -m "feat(compare): SmallMultiplesGrid with pinning"
```

---

## Phase 7: PinnedDiffPanel + diff components

### Task 7.1: `useBundleArtifacts` lazy-load hook

**Files:**
- Create: `src/cli/dashboard/src/components/compare/hooks/useBundleArtifacts.ts`
- Create: `src/cli/dashboard/src/components/compare/hooks/useBundleArtifacts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/cli/dashboard/src/components/compare/hooks/useBundleArtifacts.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBundleArtifacts } from './useBundleArtifacts.js';

const ORIGINAL_FETCH = globalThis.fetch;

test('does not fetch artifacts that are not in the requested set', async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ metadata: { runId: 'r1', mode: 'turn-loop', scenario: 's', startedAt: '', completedAt: '' } }), { status: 200 });
  }) as typeof fetch;

  const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => useBundleArtifacts(ids), {
    initialProps: { ids: [] as string[] },
  });
  await waitFor(() => assert.equal(calls.length, 0));

  act(() => { rerender({ ids: ['r1'] }); });
  await waitFor(() => assert.equal(calls.length, 1));
  assert.match(calls[0], /\/api\/v1\/runs\/r1$/);
  assert.equal(result.current.artifacts.r1?.metadata?.runId, 'r1');

  globalThis.fetch = ORIGINAL_FETCH;
});

test('caches: refetching same id does not network again', async () => {
  let count = 0;
  globalThis.fetch = (async () => {
    count++;
    return new Response(JSON.stringify({ metadata: { runId: 'r1', mode: 'turn-loop', scenario: 's', startedAt: '', completedAt: '' } }), { status: 200 });
  }) as typeof fetch;

  const { rerender } = renderHook(({ ids }: { ids: string[] }) => useBundleArtifacts(ids), {
    initialProps: { ids: ['r1'] },
  });
  await waitFor(() => assert.equal(count, 1));
  act(() => rerender({ ids: ['r1'] }));
  await waitFor(() => assert.equal(count, 1));

  globalThis.fetch = ORIGINAL_FETCH;
});
```

- [ ] **Step 2: Run, expect fail**

```
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/dashboard/src/components/compare/hooks/useBundleArtifacts.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/cli/dashboard/src/components/compare/hooks/useBundleArtifacts.ts
/**
 * Lazy fetch RunArtifacts by runId. Pass an array of currently-needed
 * runIds (typically pinned cells); the hook fetches each id once and
 * caches the result. Cache survives the lifetime of the CompareModal
 * mount; re-rendering the modal with the same ids is a no-op.
 *
 * @module paracosm/dashboard/compare/hooks/useBundleArtifacts
 */
import * as React from 'react';
import type { RunArtifact } from '../../../../../engine/schema/index.js';

export interface UseBundleArtifactsResult {
  artifacts: Record<string, RunArtifact | undefined>;
  loading: Record<string, boolean>;
  errors: Record<string, string | undefined>;
}

export function useBundleArtifacts(runIds: string[]): UseBundleArtifactsResult {
  const [artifacts, setArtifacts] = React.useState<Record<string, RunArtifact | undefined>>({});
  const [loading, setLoading] = React.useState<Record<string, boolean>>({});
  const [errors, setErrors] = React.useState<Record<string, string | undefined>>({});

  React.useEffect(() => {
    const ctrls: AbortController[] = [];
    for (const id of runIds) {
      if (artifacts[id] !== undefined || loading[id]) continue;
      const ctrl = new AbortController();
      ctrls.push(ctrl);
      setLoading((prev) => ({ ...prev, [id]: true }));
      fetch(`/api/v1/runs/${encodeURIComponent(id)}`, { signal: ctrl.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<RunArtifact>;
        })
        .then((artifact) => {
          setArtifacts((prev) => ({ ...prev, [id]: artifact }));
          setLoading((prev) => ({ ...prev, [id]: false }));
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return;
          setErrors((prev) => ({ ...prev, [id]: String(err.message ?? err) }));
          setLoading((prev) => ({ ...prev, [id]: false }));
        });
    }
    return () => { ctrls.forEach((c) => c.abort()); };
    // intentionally only re-run when runIds changes; artifacts/loading
    // are read inside but updates are guarded by the conditional above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(runIds)]);

  return { artifacts, loading, errors };
}
```

- [ ] **Step 4: Run, expect pass + commit**

```bash
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/dashboard/src/components/compare/hooks/useBundleArtifacts.test.ts
git add src/cli/dashboard/src/components/compare/hooks/useBundleArtifacts.ts src/cli/dashboard/src/components/compare/hooks/useBundleArtifacts.test.ts
git commit -m "feat(compare): useBundleArtifacts lazy-loader with cache"
```

---

### Task 7.2: `FingerprintDiff` — overlaid trait bars

**Files:**
- Create: `src/cli/dashboard/src/components/compare/diff/FingerprintDiff.tsx`
- Create: `src/cli/dashboard/src/components/compare/diff/diff.module.scss` (shared by all four diff components)

- [ ] **Step 1: SCSS (shared file used by 7.2-7.5)**

```scss
// src/cli/dashboard/src/components/compare/diff/diff.module.scss
.diffSection {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.diffHead {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.diffTitle {
  margin: 0;
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .8px;
  color: var(--text-3);
  text-transform: uppercase;
}

.diffEmpty { color: var(--text-3); font-size: 12px; font-style: italic; }

.fingerprintRow {
  display: grid;
  gap: 8px;
  align-items: center;
  grid-template-columns: 130px 1fr;
  font-family: var(--mono);
}

.fingerprintLabel { font-size: 11px; color: var(--text-2); }

.fingerprintBars {
  display: grid;
  grid-template-columns: repeat(var(--n, 3), 1fr);
  gap: 4px;
}

.fingerprintBar {
  height: 8px;
  background: var(--bg-deep);
  border-radius: 2px;
  position: relative;
  overflow: hidden;
}
.fingerprintBarFill {
  position: absolute;
  inset: 0;
  background: var(--amber);
  width: var(--w, 0);
  transition: width .25s;
}
.fingerprintBar[data-archetype-color] .fingerprintBarFill { background: var(--archetype-color); }

.timelineGrid {
  display: grid;
  grid-template-columns: 60px repeat(var(--cols, 3), 1fr);
  gap: 8px;
  align-items: stretch;
}
.timelineRow { display: contents; }
.timelineTurn {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-3);
  padding: 6px 0;
  border-top: 1px solid var(--border);
}
.timelineCell {
  font-size: 12px;
  color: var(--text-2);
  padding: 6px 8px;
  border-top: 1px solid var(--border);
  background: var(--bg-deep);
  border-radius: 4px;
}

.rationaleGrid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(var(--cols, 3), 1fr);
}
.rationaleColumn {
  background: var(--bg-deep);
  border-radius: 4px;
  padding: 10px;
  font-size: 12px;
  color: var(--text-2);
  max-height: 320px;
  overflow-y: auto;
}
.rationaleEntry { margin-bottom: 12px; }
.rationaleEntry:last-child { margin-bottom: 0; }
.rationaleTurn {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--amber);
  text-transform: uppercase;
  letter-spacing: .5px;
}
.rationaleDecision { font-weight: 600; color: var(--text-1); margin: 2px 0 4px; }
.rationaleText { color: var(--text-2); line-height: 1.5; }

.metricCard {
  background: var(--bg-deep);
  border-radius: 4px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.metricLabel {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: .5px;
}
.metricSparkline { width: 100%; height: 40px; display: block; }
.metricGrid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
```

- [ ] **Step 2: Component**

```tsx
// src/cli/dashboard/src/components/compare/diff/FingerprintDiff.tsx
import * as React from 'react';
import styles from './diff.module.scss';
import type { RunArtifact } from '../../../../../engine/schema/index.js';

export interface FingerprintDiffProps {
  artifacts: RunArtifact[];
}

export function FingerprintDiff({ artifacts }: FingerprintDiffProps): JSX.Element {
  // Collect every numeric fingerprint key across all artifacts (dedupe).
  // Non-numeric values (string labels) get a separate row group below.
  const numericKeys = React.useMemo(() => collectNumericKeys(artifacts), [artifacts]);
  if (numericKeys.length === 0) {
    return (
      <section className={styles.diffSection} aria-label="Fingerprint comparison">
        <header className={styles.diffHead}><h5 className={styles.diffTitle}>Fingerprint</h5></header>
        <p className={styles.diffEmpty}>No numeric fingerprint fields available.</p>
      </section>
    );
  }
  const cssVars = { '--n': artifacts.length } as React.CSSProperties;
  return (
    <section className={styles.diffSection} aria-label="Fingerprint comparison">
      <header className={styles.diffHead}><h5 className={styles.diffTitle}>Fingerprint</h5></header>
      {numericKeys.map((key) => (
        <div key={key} className={styles.fingerprintRow}>
          <span className={styles.fingerprintLabel}>{key}</span>
          <div className={styles.fingerprintBars} style={cssVars}>
            {artifacts.map((a, i) => {
              const v = readNumeric(a.fingerprint?.[key]);
              const pct = Math.max(0, Math.min(100, v * 100));
              return (
                <div key={i} className={styles.fingerprintBar} aria-label={`${key}: ${v.toFixed(2)}`}>
                  <div className={styles.fingerprintBarFill} style={{ ['--w' as string]: `${pct}%` }} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

function collectNumericKeys(artifacts: RunArtifact[]): string[] {
  const keys = new Set<string>();
  for (const a of artifacts) {
    if (!a.fingerprint) continue;
    for (const [k, v] of Object.entries(a.fingerprint)) {
      if (typeof v === 'number' && Number.isFinite(v)) keys.add(k);
    }
  }
  return [...keys].sort();
}

function readNumeric(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return 0;
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npm run typecheck:dashboard
git add src/cli/dashboard/src/components/compare/diff/FingerprintDiff.tsx src/cli/dashboard/src/components/compare/diff/diff.module.scss
git commit -m "feat(compare): FingerprintDiff overlaid trait bars"
```

---

### Task 7.3: `TimelineDiff` — turn-by-turn parallel rows

**Files:**
- Create: `src/cli/dashboard/src/components/compare/diff/TimelineDiff.tsx`

- [ ] **Step 1: Component**

```tsx
// src/cli/dashboard/src/components/compare/diff/TimelineDiff.tsx
import * as React from 'react';
import styles from './diff.module.scss';
import type { RunArtifact } from '../../../../../engine/schema/index.js';

export interface TimelineDiffProps {
  artifacts: RunArtifact[];
}

interface TurnRow {
  turn: number;
  cells: Array<string | null>;
}

export function TimelineDiff({ artifacts }: TimelineDiffProps): JSX.Element {
  const rows = React.useMemo<TurnRow[]>(() => buildRows(artifacts), [artifacts]);
  if (rows.length === 0) {
    return (
      <section className={styles.diffSection} aria-label="Timeline comparison">
        <header className={styles.diffHead}><h5 className={styles.diffTitle}>Timeline</h5></header>
        <p className={styles.diffEmpty}>No timepoints in any artifact.</p>
      </section>
    );
  }
  const cssVars = { '--cols': artifacts.length } as React.CSSProperties;
  return (
    <section className={styles.diffSection} aria-label="Timeline comparison">
      <header className={styles.diffHead}><h5 className={styles.diffTitle}>Timeline</h5></header>
      <div className={styles.timelineGrid} style={cssVars}>
        <div className={styles.timelineTurn}>Turn</div>
        {artifacts.map((_, i) => (
          <div key={i} className={styles.timelineCell} aria-label={`Column ${i + 1} header`} style={{ background: 'transparent', fontWeight: 600 }}>—</div>
        ))}
        {rows.map((row) => (
          <React.Fragment key={row.turn}>
            <div className={styles.timelineTurn}>T{row.turn}</div>
            {row.cells.map((c, i) => (
              <div key={i} className={styles.timelineCell}>{c ?? <em style={{ color: 'var(--text-3)' }}>—</em>}</div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

function buildRows(artifacts: RunArtifact[]): TurnRow[] {
  // Each artifact may have trajectory.timepoints (rich) or trajectory.points (lean).
  // Collect (turn -> per-artifact-cell) across the union of all turns observed.
  const byTurn = new Map<number, Array<string | null>>();
  for (let ai = 0; ai < artifacts.length; ai++) {
    const a = artifacts[ai];
    const tps = (a.trajectory?.timepoints ?? []) as Array<{ turn?: number; label?: string; events?: Array<{ title?: string }>; decision?: { decision?: string } }>;
    const points = (a.trajectory?.points ?? []) as Array<{ turn: number; value: number }>;
    const seen = new Set<number>();
    for (const tp of tps) {
      if (typeof tp.turn !== 'number') continue;
      seen.add(tp.turn);
      const summary = summarizeTimepoint(tp);
      ensureRow(byTurn, tp.turn, artifacts.length)[ai] = summary;
    }
    for (const p of points) {
      if (seen.has(p.turn)) continue;
      ensureRow(byTurn, p.turn, artifacts.length)[ai] = `value: ${p.value.toFixed(1)}`;
    }
  }
  return [...byTurn.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([turn, cells]) => ({ turn, cells }));
}

function ensureRow(map: Map<number, Array<string | null>>, turn: number, n: number): Array<string | null> {
  let row = map.get(turn);
  if (!row) { row = Array.from({ length: n }, () => null); map.set(turn, row); }
  return row;
}

function summarizeTimepoint(tp: { label?: string; events?: Array<{ title?: string }>; decision?: { decision?: string } }): string {
  const eventTitle = tp.events?.[0]?.title;
  const decisionLabel = tp.decision?.decision;
  if (eventTitle && decisionLabel) return `${eventTitle} → ${decisionLabel}`;
  if (eventTitle) return eventTitle;
  if (decisionLabel) return decisionLabel;
  if (tp.label) return tp.label;
  return '—';
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck:dashboard
git add src/cli/dashboard/src/components/compare/diff/TimelineDiff.tsx
git commit -m "feat(compare): TimelineDiff turn-by-turn parallel rows"
```

---

### Task 7.4: `DecisionRationaleDiff` — text columns

**Files:**
- Create: `src/cli/dashboard/src/components/compare/diff/DecisionRationaleDiff.tsx`

- [ ] **Step 1: Component**

```tsx
// src/cli/dashboard/src/components/compare/diff/DecisionRationaleDiff.tsx
import * as React from 'react';
import styles from './diff.module.scss';
import type { RunArtifact } from '../../../../../engine/schema/index.js';

export interface DecisionRationaleDiffProps {
  artifacts: RunArtifact[];
}

interface DecisionEntry {
  turn: number;
  decision: string;
  rationale: string;
}

export function DecisionRationaleDiff({ artifacts }: DecisionRationaleDiffProps): JSX.Element {
  // Synchronized scroll: all columns share one scrollTop. Useful when two
  // pinned runs have similar decision counts; less useful at very different
  // counts but harmless either way.
  const refs = React.useRef<Array<HTMLDivElement | null>>([]);
  const onScroll = (idx: number) => (e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    refs.current.forEach((el, i) => {
      if (i !== idx && el && Math.abs(el.scrollTop - top) > 1) el.scrollTop = top;
    });
  };
  const columns = artifacts.map(extractDecisions);
  if (columns.every((c) => c.length === 0)) {
    return (
      <section className={styles.diffSection} aria-label="Decision rationale comparison">
        <header className={styles.diffHead}><h5 className={styles.diffTitle}>Decision rationale</h5></header>
        <p className={styles.diffEmpty}>No decisions recorded (batch-point mode or no commander turns).</p>
      </section>
    );
  }
  const cssVars = { '--cols': artifacts.length } as React.CSSProperties;
  return (
    <section className={styles.diffSection} aria-label="Decision rationale comparison">
      <header className={styles.diffHead}><h5 className={styles.diffTitle}>Decision rationale</h5></header>
      <div className={styles.rationaleGrid} style={cssVars}>
        {columns.map((entries, idx) => (
          <div
            key={idx}
            className={styles.rationaleColumn}
            ref={(el) => { refs.current[idx] = el; }}
            onScroll={onScroll(idx)}
          >
            {entries.length === 0 && <p className={styles.diffEmpty}>—</p>}
            {entries.map((e, i) => (
              <div key={i} className={styles.rationaleEntry}>
                <span className={styles.rationaleTurn}>Turn {e.turn}</span>
                <p className={styles.rationaleDecision}>{e.decision}</p>
                <p className={styles.rationaleText}>{e.rationale}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function extractDecisions(artifact: RunArtifact): DecisionEntry[] {
  const ds = artifact.decisions ?? [];
  return ds
    .map((d) => ({
      turn: typeof d.turn === 'number' ? d.turn : 0,
      decision: typeof d.decision === 'string' ? d.decision : '—',
      rationale: typeof d.rationale === 'string' ? d.rationale : '',
    }))
    .sort((a, b) => a.turn - b.turn);
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck:dashboard
git add src/cli/dashboard/src/components/compare/diff/DecisionRationaleDiff.tsx
git commit -m "feat(compare): DecisionRationaleDiff scroll-synced text columns"
```

---

### Task 7.5: `MetricTrajectoryDiff` — multi-series sparklines per metric

**Files:**
- Create: `src/cli/dashboard/src/components/compare/diff/MetricTrajectoryDiff.tsx`

- [ ] **Step 1: Component**

```tsx
// src/cli/dashboard/src/components/compare/diff/MetricTrajectoryDiff.tsx
import * as React from 'react';
import styles from './diff.module.scss';
import type { RunArtifact } from '../../../../../engine/schema/index.js';

export interface MetricTrajectoryDiffProps {
  artifacts: RunArtifact[];
}

interface MetricSeries {
  metricId: string;
  /** Per-artifact list of {turn, value} pairs. Outer index aligns with `artifacts` arg. */
  perArtifact: Array<Array<{ turn: number; value: number }>>;
}

export function MetricTrajectoryDiff({ artifacts }: MetricTrajectoryDiffProps): JSX.Element {
  const metrics = React.useMemo<MetricSeries[]>(() => collectMetrics(artifacts), [artifacts]);
  if (metrics.length === 0) {
    return (
      <section className={styles.diffSection} aria-label="Metric trajectory comparison">
        <header className={styles.diffHead}><h5 className={styles.diffTitle}>Metric trajectories</h5></header>
        <p className={styles.diffEmpty}>No trajectory.timepoints[*].worldSnapshot.metrics in any artifact.</p>
      </section>
    );
  }
  return (
    <section className={styles.diffSection} aria-label="Metric trajectory comparison">
      <header className={styles.diffHead}><h5 className={styles.diffTitle}>Metric trajectories</h5></header>
      <div className={styles.metricGrid}>
        {metrics.map((m) => (
          <div key={m.metricId} className={styles.metricCard}>
            <span className={styles.metricLabel}>{m.metricId}</span>
            <MultiSparkline series={m.perArtifact} />
          </div>
        ))}
      </div>
    </section>
  );
}

function MultiSparkline({ series }: { series: Array<Array<{ turn: number; value: number }>> }) {
  const W = 200, H = 40, pad = 2;
  const flat = series.flatMap((s) => s.map((p) => p.value)).filter((v) => Number.isFinite(v));
  if (flat.length === 0) return <span className={styles.diffEmpty}>—</span>;
  const minV = Math.min(...flat), maxV = Math.max(...flat);
  const range = Math.max(1e-6, maxV - minV);
  const turnsFlat = series.flatMap((s) => s.map((p) => p.turn));
  const minT = Math.min(...turnsFlat), maxT = Math.max(...turnsFlat);
  const turnRange = Math.max(1, maxT - minT);
  const colors = ['var(--amber)', 'var(--rust)', 'var(--teal)'];
  return (
    <svg className={styles.metricSparkline} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Metric over turns, one series per artifact">
      {series.map((s, i) => {
        if (s.length < 2) return null;
        const points = s
          .map((p) => `${pad + ((p.turn - minT) / turnRange) * (W - pad * 2)},${pad + (H - pad * 2) * (1 - (p.value - minV) / range)}`)
          .join(' ');
        return <polyline key={i} points={points} fill="none" stroke={colors[i % colors.length]} strokeWidth={1.4} opacity={0.85} />;
      })}
    </svg>
  );
}

function collectMetrics(artifacts: RunArtifact[]): MetricSeries[] {
  // Walk every artifact's trajectory.timepoints and accumulate (metricId -> per-artifact (turn,value)).
  const accum = new Map<string, Array<Array<{ turn: number; value: number }>>>();
  for (let ai = 0; ai < artifacts.length; ai++) {
    const tps = (artifacts[ai].trajectory?.timepoints ?? []) as Array<{ turn?: number; worldSnapshot?: { metrics?: Record<string, number> } }>;
    for (const tp of tps) {
      if (typeof tp.turn !== 'number') continue;
      const m = tp.worldSnapshot?.metrics;
      if (!m) continue;
      for (const [metricId, value] of Object.entries(m)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        let perArtifact = accum.get(metricId);
        if (!perArtifact) { perArtifact = artifacts.map(() => []); accum.set(metricId, perArtifact); }
        perArtifact[ai].push({ turn: tp.turn, value });
      }
    }
  }
  return [...accum.entries()]
    .map(([metricId, perArtifact]) => ({ metricId, perArtifact }))
    .filter((m) => m.perArtifact.some((s) => s.length > 0))
    .sort((a, b) => a.metricId.localeCompare(b.metricId));
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck:dashboard
git add src/cli/dashboard/src/components/compare/diff/MetricTrajectoryDiff.tsx
git commit -m "feat(compare): MetricTrajectoryDiff multi-series sparklines"
```

---

### Task 7.6: `PinnedDiffPanel` shell

**Files:**
- Create: `src/cli/dashboard/src/components/compare/PinnedDiffPanel.tsx`
- Create: `src/cli/dashboard/src/components/compare/PinnedDiffPanel.module.scss`

- [ ] **Step 1: Component**

```tsx
// src/cli/dashboard/src/components/compare/PinnedDiffPanel.tsx
import * as React from 'react';
import styles from './PinnedDiffPanel.module.scss';
import { useBundleArtifacts } from './hooks/useBundleArtifacts.js';
import { TimelineDiff } from './diff/TimelineDiff.js';
import { FingerprintDiff } from './diff/FingerprintDiff.js';
import { DecisionRationaleDiff } from './diff/DecisionRationaleDiff.js';
import { MetricTrajectoryDiff } from './diff/MetricTrajectoryDiff.js';
import type { RunRecord } from '../../../../server/run-record.js';

export interface PinnedDiffPanelProps {
  pinnedIds: string[];
  members: RunRecord[];
}

export function PinnedDiffPanel({ pinnedIds, members }: PinnedDiffPanelProps): JSX.Element | null {
  const { artifacts, loading, errors } = useBundleArtifacts(pinnedIds);

  if (pinnedIds.length === 0) {
    return (
      <section className={styles.empty} aria-label="Pinned diff">
        <p>Pin 2-3 cells above with the ☆ toggle to compare them side-by-side.</p>
      </section>
    );
  }

  const recordsById: Record<string, RunRecord> = Object.fromEntries(members.map((m) => [m.runId, m]));
  const pinnedRecords = pinnedIds.map((id) => recordsById[id]).filter(Boolean);
  const pinnedArtifacts = pinnedIds.map((id) => artifacts[id]).filter((a): a is NonNullable<typeof a> => !!a);

  return (
    <section className={styles.panel} aria-label="Pinned runs side-by-side">
      <header className={styles.head}>
        {pinnedRecords.map((r) => (
          <div key={r.runId} className={styles.column}>
            <h4>{r.leaderName ?? 'Unknown'}</h4>
            {r.leaderArchetype && <span className={styles.archetype}>{r.leaderArchetype}</span>}
            {loading[r.runId] && <span className={styles.loading}>loading…</span>}
            {errors[r.runId] && <span className={styles.error}>{errors[r.runId]}</span>}
          </div>
        ))}
      </header>
      {pinnedArtifacts.length > 0 && (
        <>
          <FingerprintDiff artifacts={pinnedArtifacts} />
          <TimelineDiff artifacts={pinnedArtifacts} />
          <DecisionRationaleDiff artifacts={pinnedArtifacts} />
          <MetricTrajectoryDiff artifacts={pinnedArtifacts} />
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: SCSS**

```scss
// src/cli/dashboard/src/components/compare/PinnedDiffPanel.module.scss
.panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.empty {
  padding: 24px;
  text-align: center;
  color: var(--text-3);
  font-family: var(--mono);
  font-size: 13px;
  border: 1px dashed var(--border);
  border-radius: 8px;
}

.head {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(var(--cols, 3), 1fr);
}

.column h4 {
  margin: 0;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--text-1);
}
.archetype {
  display: block;
  font-size: 10px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: .5px;
  margin-top: 2px;
}
.loading { font-size: 11px; color: var(--text-3); margin-left: 8px; }
.error { font-size: 11px; color: rgb(255, 130, 100); margin-left: 8px; }
```

- [ ] **Step 3: Wire into CompareModal**

```tsx
import { PinnedDiffPanel } from './PinnedDiffPanel.js';
// at end of bundle-rendered block:
{bundle && <PinnedDiffPanel pinnedIds={pinning.pinned} members={bundle.members} />}
```

- [ ] **Step 4: Typecheck + commit**

```bash
npm run typecheck:dashboard
git add src/cli/dashboard/src/components/compare/PinnedDiffPanel.tsx src/cli/dashboard/src/components/compare/PinnedDiffPanel.module.scss src/cli/dashboard/src/components/compare/CompareModal.tsx
git commit -m "feat(compare): PinnedDiffPanel composing four diff components"
```

---

## Phase 8: Quickstart actor-count input

### Task 8.1: SeedInput count slider + cost preview

**Files:**
- Modify: `src/cli/dashboard/src/components/quickstart/SeedInput.tsx`

- [ ] **Step 1: Add `actorCount` state and slider UI above the submit button**

```tsx
// inside SeedInput component, alongside seedText / domainHint state:
const [actorCount, setActorCount] = React.useState(3);
const costEstimate = React.useMemo(() => 0.10 + 0.30 * actorCount, [actorCount]);
const wallTimeEstimate = React.useMemo(() => `${Math.max(2, Math.ceil(actorCount / 3) * 4)}–${Math.ceil(actorCount / 3) * 7} min`, [actorCount]);

// Above the submit button:
<div className={styles.countRow}>
  <label htmlFor="quickstart-actor-count" style={{ fontSize: 12, color: 'var(--text-2)' }}>
    Actors: <strong>{actorCount}</strong>
  </label>
  <input
    id="quickstart-actor-count"
    type="range"
    min={1}
    max={50}
    value={actorCount}
    onChange={(e) => setActorCount(parseInt(e.target.value, 10))}
    disabled={disabled}
    style={{ flex: 1 }}
    aria-label="Number of parallel actors to run"
  />
  <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
    ~${costEstimate.toFixed(2)} · {wallTimeEstimate}
  </span>
</div>

// Submit button: include count + cost in the label
<button
  type="button"
  className={styles.runButton}
  onClick={() => submitWithCount(actorCount)}
  disabled={disabled || seedText.trim().length < 200}
>
  Generate + Run {actorCount} {actorCount === 1 ? 'Actor' : 'Actors'} (~${costEstimate.toFixed(2)})
</button>
```

`submitWithCount` is a wrapper around the existing `submit` that passes `actorCount` to the callback:

```tsx
const submitWithCount = React.useCallback((count: number) => {
  // existing submit logic, but pass count to the parent
  onSeedReady({ seedText: trimmedSeed, sourceUrl, domainHint: domainHint.trim() || undefined, actorCount: count });
}, [seedText, sourceUrl, domainHint, onSeedReady]);
```

The `onSeedReady` payload type adds `actorCount?: number`.

- [ ] **Step 2: Update `SeedInputProps` interface**

```ts
onSeedReady: (payload: { seedText: string; sourceUrl?: string; domainHint?: string; actorCount?: number }) => void;
```

- [ ] **Step 3: Typecheck**

```
npm run typecheck:dashboard
```

- [ ] **Step 4: Commit**

```bash
git add src/cli/dashboard/src/components/quickstart/SeedInput.tsx
git commit -m "feat(quickstart): actor-count slider with cost + time preview"
```

---

### Task 8.2: QuickstartView passes count through

**Files:**
- Modify: `src/cli/dashboard/src/components/quickstart/QuickstartView.tsx`

- [ ] **Step 1: Find `handleSeedReady` and accept `actorCount`**

```tsx
const handleSeedReady = useCallback(async (payload: { seedText: string; sourceUrl?: string; domainHint?: string; actorCount?: number }) => {
  // ... existing compile call ...
  const leadersRes = await fetch('/api/quickstart/generate-leaders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenarioId, count: payload.actorCount ?? 3 }),
  });
  // ... rest unchanged ...
}, [sse]);
```

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck:dashboard
git add src/cli/dashboard/src/components/quickstart/QuickstartView.tsx
git commit -m "feat(quickstart): thread actorCount through to generate-leaders"
```

---

## Phase 9: "Compare all N" CTA on results phase

### Task 9.1: Add the CTA

**Files:**
- Modify: `src/cli/dashboard/src/components/quickstart/QuickstartView.tsx`

- [ ] **Step 1: After the run completes (phase = 'results'), render the CTA above the per-actor cards**

```tsx
{phase.kind === 'results' && (
  <>
    {phase.artifacts[0]?.metadata?.runId && (
      <button
        className={styles.compareCta}
        onClick={() => setCompareBundleId(deriveBundleIdFrom(phase.artifacts))}
      >
        Compare all {phase.artifacts.length} actors →
      </button>
    )}
    <QuickstartResults ... />
  </>
)}
```

The `bundleId` for the just-completed run is on each artifact's metadata; pull it from `artifact.metadata.bundleId` (added in Task 2.4 if the artifact captures the bundle id, otherwise we derive from the runId via a separate `/api/v1/runs/:id/bundle` lookup — since RunRecord stores the bundleId, easier: pass it through SSE in the `result` event payload or fetch via runId).

For v1, simplest: when the artifact arrives via SSE, capture the `bundleId` from a new field on the SSE `status: starting` event broadcast at the start of the batch run. The pair-runner already broadcasts `status: 'starting'` — extend that payload with `bundleId` set in /setup.

- [ ] **Step 2: Update `runBatchSimulations` to broadcast `bundleId`**

In `pair-runner.ts:runBatchSimulations`:

```ts
broadcast('status', { phase: 'starting', maxTurns: turns, customEvents, batch: true, leaderCount: leaders.length, bundleId: simConfig.bundleId });
```

`NormalizedSimulationConfig` gains an optional `bundleId?: string` field that /setup populates.

- [ ] **Step 3: Capture `bundleId` from SSE in QuickstartView**

```tsx
const [bundleId, setBundleId] = React.useState<string | null>(null);
React.useEffect(() => {
  const onStatus = (event: { data: { bundleId?: string } }) => {
    if (event.data?.bundleId) setBundleId(event.data.bundleId);
  };
  sse.on('status', onStatus);
  return () => sse.off('status', onStatus);
}, [sse]);
```

(SSE event names in paracosm follow that shape — verify against `useSSE` hook implementation.)

- [ ] **Step 4: Typecheck + commit**

```bash
npm run typecheck:dashboard
git add src/cli/dashboard/src/components/quickstart/QuickstartView.tsx src/cli/pair-runner.ts src/cli/sim-config.ts
git commit -m "feat(quickstart): Compare all N actors CTA on results phase"
```

---

## Phase 10: Recorder tour extension

### Task 10.1: Add Compare modal capture to record-end-to-end.mjs

**Files:**
- Modify: `scripts/remotion/record-end-to-end.mjs`

- [ ] **Step 1: After the LIBRARY tab hold, click the first BundleCard**

In the existing tab-tour section, after `clickTab('library')` and the existing 6s hold, add:

```js
// Compare modal capture: click the first bundle card (the just-finished bundle).
console.log('[e2e] open Compare modal for the most-recent bundle (12s)');
const firstBundle = page.locator('[data-bundle-card]').first();
if (await firstBundle.isVisible({ timeout: 2000 }).catch(() => false)) {
  await firstBundle.click();
  await page.waitForSelector('[role="dialog"][aria-modal="true"]', { state: 'visible', timeout: 4000 });
  await page.waitForTimeout(4000); // hold on aggregate strip + grid
  // Pin two cells
  const pinCheckboxes = page.locator('[role="dialog"] input[type="checkbox"]');
  if (await pinCheckboxes.count() >= 2) {
    await pinCheckboxes.nth(0).check();
    await page.waitForTimeout(2000);
    await pinCheckboxes.nth(1).check();
    await page.waitForTimeout(4000); // hold on PinnedDiffPanel
  }
  // Close
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
}
```

- [ ] **Step 2: Smoke test the recorder**

```bash
cd scripts/remotion
E2E_KEEP_WEBM=1 node record-end-to-end.mjs e2e-atlas-7
```

Expected: log line `[e2e] open Compare modal` fires; new mp4 includes the Compare-view tour.

- [ ] **Step 3: Commit**

```bash
git add scripts/remotion/record-end-to-end.mjs
git commit -m "feat(recorder): include Compare modal + pin tour in end-to-end demo"
```

---

## Phase 11: Wire-up + final verify

### Task 11.1: Build + type check + targeted tests

```bash
npm run build
npm test
```

All tests pass; no typecheck errors.

### Task 11.2: Local server smoke test

```bash
PORT=3458 PARACOSM_SKIP_BANNER=1 node --import tsx src/cli/serve.ts &
SERVER=$!
sleep 4
curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3458/api/v1/bundles/dummy-id-no-such-bundle
# Expect: HTTP 404
kill $SERVER
```

### Task 11.3: Final commit + push paracosm + bump submodule

```bash
git push origin master
cd ../../..
git add apps/paracosm
git commit -m "chore: bump paracosm submodule (Compare 2+ runs UI)"
git push origin master
```

---

## Self-review checklist (run after writing this plan)

1. **Spec coverage:**
   - ✅ Quickstart actor-count 1-50: Phase 8
   - ✅ Bundle metadata + members + aggregate endpoints: Phase 2
   - ✅ LIBRARY BundleCard + grouping: Phase 3
   - ✅ CompareModal shell: Phase 4
   - ✅ AggregateStrip: Phase 5
   - ✅ SmallMultiplesGrid + CompareCell: Phase 6
   - ✅ PinnedDiffPanel + 4 diff components: Phase 7
   - ✅ Lazy load (per-cell artifact fetch): Task 7.1
   - ✅ "Compare all N" CTA on results: Phase 9
   - ✅ Recorder tour extension: Phase 10
   - ✅ Schema migrations bundle_id + summary_trajectory: Phase 1
   - ✅ Removal of disabled "Compare" stub on RunCard: Task 3.4
   - ⚠ Tasks 7.2-7.5 (the four diff components) are sketched but not fully expanded with TDD steps. Each is similar shape; expand at execution time using the spec as reference. Acceptable scope for the plan since all four follow the same component skeleton.

2. **Placeholder scan:** No "TBD", "TODO", "implement later". Tasks 7.2-7.5 expanded with concrete code blocks for FingerprintDiff, TimelineDiff, DecisionRationaleDiff, MetricTrajectoryDiff (and the shared `diff.module.scss`).

3. **Type consistency:** `BundlePayload` (useBundle) vs `BundleAggregate` (useBundleAggregate) are distinct types with consistent fields. `GalleryEntry` discriminated union matches between `groupRunsByBundle` and `RunGallery` consumer. `RunRecord.bundleId` and `RunRecord.summaryTrajectory` consistent across server + client + tests.

4. **Open execution-time decisions:**
   - The exact prepared-statement diff in Task 1.4 step 5 depends on the current `insertRun` text — read it first.
   - The exact SSE event name in Task 9.1 step 3 depends on the `useSSE` API — verify against existing usage.
   - The exact `RunGallery.tsx` props shape in Task 3.3 step 2 depends on the current component — verify against existing usage.
