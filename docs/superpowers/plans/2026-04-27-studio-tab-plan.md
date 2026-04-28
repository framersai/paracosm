# Studio Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user has a "no subagents" rule — execute inline.

**Goal:** Drop a `RunArtifact` JSON file into the dashboard, render it via the existing static-mode adapters, and expose Promote-to-Library + Compare-against-Library actions.

**Architecture:** New client-side `studio` tab. The artifact is parsed + Zod-validated in the browser via a pure `parseStudioInput()` helper, then handed to `StudioArtifactView` which delegates to the already-shipped `ReportViewAdapter` (turn-loop) or `BatchArtifactView` (batch modes). Promote calls a new `POST /api/v1/library/import` route that runs `enrichRunRecordFromArtifact` and inserts via `runHistoryStore.insertRun` (now `@framers/sql-storage-adapter`-backed). Compare extends `CompareModal` with an optional `extraArtifacts` prop so the dropped artifact can be diffed against any Library bundle.

**Tech Stack:** TypeScript 5.9, React 18 (dashboard), Zod, `@framers/sql-storage-adapter`, `node --test` + `react-dom/server` for tests.

**Spec:** [`docs/superpowers/specs/2026-04-27-studio-tab-design.md`](../specs/2026-04-27-studio-tab-design.md)

---

## File map

**Create:**
- `src/cli/dashboard/src/components/studio/parseStudioInput.ts`
- `src/cli/dashboard/src/components/studio/parseStudioInput.test.ts`
- `src/cli/dashboard/src/components/studio/StudioArtifactView.tsx`
- `src/cli/dashboard/src/components/studio/StudioArtifactView.test.tsx`
- `src/cli/dashboard/src/components/studio/StudioBundleView.tsx`
- `src/cli/dashboard/src/components/studio/StudioDropZone.tsx`
- `src/cli/dashboard/src/components/studio/StudioTab.tsx`
- `src/cli/dashboard/src/components/studio/StudioTab.module.scss`
- `src/cli/dashboard/src/components/studio/useStudioPromote.ts`
- `src/cli/server/library-import-route.ts`
- `tests/cli/server/library-import-route.test.ts`
- `tests/fixtures/runArtifact-v0.8-turn-loop.json`
- `tests/fixtures/runArtifact-v0.8-batch.json`
- `tests/fixtures/runArtifact-v0.8-bundle.json`
- `src/cli/dashboard/src/components/compare/CompareModal.extraArtifacts.test.tsx`

**Modify:**
- `src/cli/dashboard/src/tab-routing.ts` — add `'studio'` to `DASHBOARD_TABS`
- `src/cli/dashboard/src/App.tsx` — render `<StudioTab>` for `'studio'`
- `src/cli/dashboard/src/components/layout/TopBar.tsx` — add Studio nav button
- `src/cli/dashboard/src/components/compare/CompareModal.tsx` — add `extraArtifacts?: RunArtifact[]` prop
- `src/cli/server-app.ts` — wire `/api/v1/library/import` route

---

## Task 1: Test fixtures

**Files:**
- Create: `tests/fixtures/runArtifact-v0.8-turn-loop.json`
- Create: `tests/fixtures/runArtifact-v0.8-batch.json`
- Create: `tests/fixtures/runArtifact-v0.8-bundle.json`

These are minimal valid `RunArtifact` JSON files used by parser, view, and server-route tests. Keeping them in `tests/fixtures/` avoids 200-line inline objects in every test.

- [ ] **Step 1: Create the turn-loop fixture**

```bash
mkdir -p tests/fixtures
```

Write `tests/fixtures/runArtifact-v0.8-turn-loop.json`:

```json
{
  "metadata": {
    "runId": "run_studio_fixture_turn_loop",
    "scenario": { "id": "mars-genesis", "name": "Mars Genesis" },
    "mode": "turn-loop",
    "startedAt": "2026-04-26T00:00:00.000Z",
    "completedAt": "2026-04-26T00:01:30.000Z"
  },
  "leader": { "name": "Aria Chen", "archetype": "The Visionary" },
  "cost": { "totalUSD": 0.42 },
  "trajectory": {
    "timeUnit": { "singular": "month", "plural": "months" },
    "timepoints": [
      { "t": 1, "label": "M1", "worldSnapshot": { "metrics": { "morale": 0.85, "population": 100 } } },
      { "t": 2, "label": "M2", "worldSnapshot": { "metrics": { "morale": 0.80, "population": 102 } } },
      { "t": 3, "label": "M3", "worldSnapshot": { "metrics": { "morale": 0.75, "population": 104 } } }
    ]
  },
  "decisions": [
    { "label": "Conserve power" },
    { "label": "Mine ice" },
    { "label": "Expand habitat" }
  ]
}
```

- [ ] **Step 2: Create the batch fixture**

Write `tests/fixtures/runArtifact-v0.8-batch.json`:

```json
{
  "metadata": {
    "runId": "run_studio_fixture_batch",
    "scenario": { "id": "corp-q3", "name": "Corp Q3 forecast" },
    "mode": "batch-trajectory",
    "startedAt": "2026-04-26T00:00:00.000Z",
    "completedAt": "2026-04-26T00:00:45.000Z"
  },
  "leader": { "name": "Marin Kade", "archetype": "Aggressive Sales Optimizer" },
  "cost": { "totalUSD": 0.18 },
  "trajectory": {
    "timeUnit": { "singular": "quarter", "plural": "quarters" },
    "timepoints": [
      { "t": 1, "label": "Q1", "worldSnapshot": { "metrics": { "morale": 0.6, "revenue": 220 } } },
      { "t": 2, "label": "Q2", "worldSnapshot": { "metrics": { "morale": 0.5, "revenue": 240 } } }
    ]
  }
}
```

- [ ] **Step 3: Create the bundle fixture**

Write `tests/fixtures/runArtifact-v0.8-bundle.json` (array of 2 turn-loop artifacts):

```json
[
  {
    "metadata": {
      "runId": "run_studio_fixture_bundle_a",
      "scenario": { "id": "mars-genesis", "name": "Mars Genesis" },
      "mode": "turn-loop",
      "startedAt": "2026-04-26T00:00:00.000Z",
      "completedAt": "2026-04-26T00:01:30.000Z"
    },
    "leader": { "name": "Aria Chen", "archetype": "The Visionary" },
    "cost": { "totalUSD": 0.42 },
    "trajectory": {
      "timeUnit": { "singular": "month", "plural": "months" },
      "timepoints": [
        { "t": 1, "label": "M1", "worldSnapshot": { "metrics": { "morale": 0.85 } } }
      ]
    }
  },
  {
    "metadata": {
      "runId": "run_studio_fixture_bundle_b",
      "scenario": { "id": "mars-genesis", "name": "Mars Genesis" },
      "mode": "turn-loop",
      "startedAt": "2026-04-26T00:00:00.000Z",
      "completedAt": "2026-04-26T00:01:30.000Z"
    },
    "leader": { "name": "Dietrich Voss", "archetype": "The Engineer" },
    "cost": { "totalUSD": 0.38 },
    "trajectory": {
      "timeUnit": { "singular": "month", "plural": "months" },
      "timepoints": [
        { "t": 1, "label": "M1", "worldSnapshot": { "metrics": { "morale": 0.65 } } }
      ]
    }
  }
]
```

- [ ] **Step 4: Verify fixtures parse**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('tests/fixtures/runArtifact-v0.8-turn-loop.json'));JSON.parse(require('fs').readFileSync('tests/fixtures/runArtifact-v0.8-batch.json'));JSON.parse(require('fs').readFileSync('tests/fixtures/runArtifact-v0.8-bundle.json'));console.log('ok')"
```

Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/runArtifact-v0.8-turn-loop.json tests/fixtures/runArtifact-v0.8-batch.json tests/fixtures/runArtifact-v0.8-bundle.json
git commit -m "test(studio): add v0.8 RunArtifact JSON fixtures (turn-loop + batch + bundle)"
```

---

## Task 2: parseStudioInput

**Files:**
- Create: `src/cli/dashboard/src/components/studio/parseStudioInput.ts`
- Create: `src/cli/dashboard/src/components/studio/parseStudioInput.test.ts`

Pure parser: text → `StudioInput` discriminated union. No I/O. Uses `RunArtifactSchema` from `src/engine/schema/artifact.ts`.

- [ ] **Step 1: Write the failing test**

Write `src/cli/dashboard/src/components/studio/parseStudioInput.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseStudioInput } from './parseStudioInput.js';

const fixtureDir = resolve(__dirname, '../../../../../../tests/fixtures');
const turnLoopText = readFileSync(resolve(fixtureDir, 'runArtifact-v0.8-turn-loop.json'), 'utf-8');
const batchText = readFileSync(resolve(fixtureDir, 'runArtifact-v0.8-batch.json'), 'utf-8');
const bundleText = readFileSync(resolve(fixtureDir, 'runArtifact-v0.8-bundle.json'), 'utf-8');

test('parseStudioInput: turn-loop fixture parses as single', () => {
  const out = parseStudioInput(turnLoopText);
  assert.equal(out.kind, 'single');
  if (out.kind === 'single') {
    assert.equal(out.artifact.metadata.runId, 'run_studio_fixture_turn_loop');
    assert.equal(out.artifact.metadata.mode, 'turn-loop');
  }
});

test('parseStudioInput: batch fixture parses as single (mode=batch-trajectory)', () => {
  const out = parseStudioInput(batchText);
  assert.equal(out.kind, 'single');
  if (out.kind === 'single') {
    assert.equal(out.artifact.metadata.mode, 'batch-trajectory');
  }
});

test('parseStudioInput: bundle (array) parses as bundle with 2 artifacts', () => {
  const out = parseStudioInput(bundleText);
  assert.equal(out.kind, 'bundle');
  if (out.kind === 'bundle') {
    assert.equal(out.artifacts.length, 2);
    assert.equal(out.artifacts[0].metadata.runId, 'run_studio_fixture_bundle_a');
  }
});

test('parseStudioInput: bundle ({bundleId, artifacts}) keeps bundleId', () => {
  const wrapped = JSON.stringify({ bundleId: 'bundle_123', artifacts: JSON.parse(bundleText) });
  const out = parseStudioInput(wrapped);
  assert.equal(out.kind, 'bundle');
  if (out.kind === 'bundle') {
    assert.equal(out.bundleId, 'bundle_123');
    assert.equal(out.artifacts.length, 2);
  }
});

test('parseStudioInput: invalid JSON yields error with parse hint', () => {
  const out = parseStudioInput('not json {[');
  assert.equal(out.kind, 'error');
  if (out.kind === 'error') {
    assert.match(out.message, /not valid JSON/i);
  }
});

test('parseStudioInput: object missing metadata yields error', () => {
  const out = parseStudioInput(JSON.stringify({ trajectory: { timepoints: [] } }));
  assert.equal(out.kind, 'error');
});

test('parseStudioInput: legacy v0.7 artifact (leader keys, no actor) yields v0.7 hint', () => {
  // A v0.7 artifact that has the legacy leader: {} shape but is otherwise
  // missing required 0.8 metadata. The parser should detect the v0.7
  // marker first and surface a friendly version-mismatch message.
  const legacy = JSON.stringify({
    metadata: { runId: 'r1' /* missing scenario */ },
    leader: { name: 'Aria', archetype: 'The Visionary' },
  });
  const out = parseStudioInput(legacy);
  assert.equal(out.kind, 'error');
  if (out.kind === 'error') {
    assert.match(out.message, /v0\.7/);
  }
});

test('parseStudioInput: empty bundle array yields error', () => {
  const out = parseStudioInput('[]');
  assert.equal(out.kind, 'error');
});

test('parseStudioInput: 51-element bundle yields error', () => {
  const big = JSON.stringify(Array.from({ length: 51 }, () => JSON.parse(turnLoopText)));
  const out = parseStudioInput(big);
  assert.equal(out.kind, 'error');
  if (out.kind === 'error') {
    assert.match(out.message, /50/);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/dashboard/src/components/studio/parseStudioInput.test.ts
```

Expected: FAIL with "Cannot find module './parseStudioInput.js'"

- [ ] **Step 3: Implement `parseStudioInput`**

Write `src/cli/dashboard/src/components/studio/parseStudioInput.ts`:

```typescript
/**
 * Pure parser for Studio drop-zone input. Text → discriminated union of
 * single artifact, bundle, or error. No I/O, no React. Validation runs
 * via `RunArtifactSchema` from the engine package.
 *
 * @module paracosm/dashboard/studio/parseStudioInput
 */
import { RunArtifactSchema } from '../../../../../engine/schema/artifact.js';
import type { RunArtifact } from '../../../../../engine/schema/index.js';

export type StudioInput =
  | { kind: 'single'; artifact: RunArtifact }
  | { kind: 'bundle'; artifacts: RunArtifact[]; bundleId?: string }
  | { kind: 'error'; message: string; hint?: string };

const MAX_BUNDLE_SIZE = 50;

/**
 * Detect the legacy v0.7 leader-shape on a raw object (pre-Zod). The
 * heuristic looks for any top-level `leader*` field while no `actor*`
 * field is present anywhere — sufficient to catch the rename gap
 * without false-positives on the new schema.
 */
function looksLikeLegacyV07(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const keys = Object.keys(obj as Record<string, unknown>);
  const hasLeaderKey = keys.some((k) => k === 'leader' || k.startsWith('leader'));
  const hasActorKey = keys.some((k) => k === 'actor' || k.startsWith('actor'));
  return hasLeaderKey && !hasActorKey;
}

function legacyError(): StudioInput {
  return {
    kind: 'error',
    message:
      'This artifact was exported from paracosm v0.7. Studio requires v0.8+. ' +
      'Re-run on the latest paracosm to convert leader→actor fields.',
  };
}

function validateOne(raw: unknown): { ok: true; artifact: RunArtifact } | { ok: false; issues: string[] } {
  const parsed = RunArtifactSchema.safeParse(raw);
  if (parsed.success) return { ok: true, artifact: parsed.data as unknown as RunArtifact };
  const issues = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`);
  return { ok: false, issues };
}

export function parseStudioInput(text: string): StudioInput {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return {
      kind: 'error',
      message: 'File is not valid JSON',
      hint: err instanceof Error ? err.message : String(err),
    };
  }

  // Bundle as wrapped object: { bundleId, artifacts: [...] }
  if (
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    Array.isArray((raw as { artifacts?: unknown }).artifacts)
  ) {
    const wrapper = raw as { bundleId?: string; artifacts: unknown[] };
    return parseBundleArray(wrapper.artifacts, wrapper.bundleId);
  }

  // Bundle as bare array
  if (Array.isArray(raw)) {
    return parseBundleArray(raw, undefined);
  }

  // Single artifact
  if (looksLikeLegacyV07(raw)) return legacyError();
  const result = validateOne(raw);
  if (!result.ok) {
    return {
      kind: 'error',
      message: `Not a paracosm RunArtifact: ${result.issues[0] ?? 'invalid shape'}`,
      hint: result.issues.slice(1).join('; ') || undefined,
    };
  }
  return { kind: 'single', artifact: result.artifact };
}

function parseBundleArray(items: unknown[], bundleId: string | undefined): StudioInput {
  if (items.length === 0) {
    return { kind: 'error', message: 'Bundle is empty' };
  }
  if (items.length > MAX_BUNDLE_SIZE) {
    return {
      kind: 'error',
      message: `Bundle exceeds the ${MAX_BUNDLE_SIZE}-artifact cap (got ${items.length})`,
    };
  }
  const artifacts: RunArtifact[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (looksLikeLegacyV07(item)) return legacyError();
    const result = validateOne(item);
    if (!result.ok) {
      return {
        kind: 'error',
        message: `Bundle item ${i}: ${result.issues[0] ?? 'invalid shape'}`,
        hint: result.issues.slice(1).join('; ') || undefined,
      };
    }
    artifacts.push(result.artifact);
  }
  const out: StudioInput = { kind: 'bundle', artifacts };
  if (bundleId) out.bundleId = bundleId;
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/dashboard/src/components/studio/parseStudioInput.test.ts
```

Expected: `pass 9`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/cli/dashboard/src/components/studio/parseStudioInput.ts src/cli/dashboard/src/components/studio/parseStudioInput.test.ts
git commit -m "feat(studio): parseStudioInput — JSON text → single | bundle | error"
```

---

## Task 3: POST /api/v1/library/import handler

**Files:**
- Create: `src/cli/server/library-import-route.ts`
- Create: `tests/cli/server/library-import-route.test.ts`

Server route that accepts a single `RunArtifact` or an array of them, runs `enrichRunRecordFromArtifact`, and inserts via `runHistoryStore.insertRun`. Uses `affected.changes` from the StorageRunResult to detect duplicates rather than getRun-before-insert.

Important: `runHistoryStore.insertRun` returns `Promise<void>`, not the StorageRunResult. To get `alreadyExisted` we must call `getRun` after insert (the duplicate check is then race-safe at row-id granularity since the runId is the primary key — concurrent imports with the same runId both see the row after one wins). Adjusting the spec's claim accordingly.

- [ ] **Step 1: Write the failing test**

Write `tests/cli/server/library-import-route.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { handleLibraryImport } from '../../../src/cli/server/library-import-route.js';
import { createSqliteRunHistoryStore } from '../../../src/cli/server/sqlite-run-history-store.js';
import type { RunHistoryStore } from '../../../src/cli/server/run-history-store.js';
import type { ServerResponse, IncomingMessage } from 'node:http';

const fixtureDir = resolve(__dirname, '../../fixtures');
const turnLoopArtifact = JSON.parse(readFileSync(resolve(fixtureDir, 'runArtifact-v0.8-turn-loop.json'), 'utf-8'));
const bundleArtifacts = JSON.parse(readFileSync(resolve(fixtureDir, 'runArtifact-v0.8-bundle.json'), 'utf-8'));

function fakeRes(): { res: ServerResponse; status: () => number; body: () => string } {
  let status = 0;
  let body = '';
  const res = {
    writeHead(s: number) { status = s; return this; },
    end(c?: string) { if (c !== undefined) body = c; return this; },
  } as unknown as ServerResponse;
  return { res, status: () => status, body: () => body };
}

function fakeStore(): RunHistoryStore {
  return createSqliteRunHistoryStore({
    dbPath: ':memory:',
    databaseOptions: { type: 'memory' },
  });
}

test('handleLibraryImport: single artifact → 201, runId returned', async () => {
  const store = fakeStore();
  const { res, status, body } = fakeRes();
  await handleLibraryImport({} as IncomingMessage, res, { artifact: turnLoopArtifact }, { runHistoryStore: store, sourceMode: 'local_demo' });
  assert.equal(status(), 201);
  const json = JSON.parse(body());
  assert.match(json.runId, /^run_/);
  assert.equal(json.alreadyExisted, false);
  const stored = await store.getRun(json.runId);
  assert.ok(stored);
  assert.equal(stored!.actorName, 'Aria Chen');
});

test('handleLibraryImport: re-import of same artifact → alreadyExisted: true', async () => {
  const store = fakeStore();
  const { res: r1 } = fakeRes();
  await handleLibraryImport({} as IncomingMessage, r1, { artifact: turnLoopArtifact }, { runHistoryStore: store, sourceMode: 'local_demo' });
  const { res: r2, body: b2 } = fakeRes();
  await handleLibraryImport({} as IncomingMessage, r2, { artifact: turnLoopArtifact }, { runHistoryStore: store, sourceMode: 'local_demo' });
  const json = JSON.parse(b2());
  assert.equal(json.alreadyExisted, true);
});

test('handleLibraryImport: malformed body → 400', async () => {
  const store = fakeStore();
  const { res, status, body } = fakeRes();
  await handleLibraryImport({} as IncomingMessage, res, { not: 'a valid body' }, { runHistoryStore: store, sourceMode: 'local_demo' });
  assert.equal(status(), 400);
  const json = JSON.parse(body());
  assert.match(json.error, /artifact|artifacts/i);
});

test('handleLibraryImport: invalid artifact (Zod fails) → 400 with issues', async () => {
  const store = fakeStore();
  const { res, status, body } = fakeRes();
  await handleLibraryImport({} as IncomingMessage, res, { artifact: { metadata: { runId: 'x' } } }, { runHistoryStore: store, sourceMode: 'local_demo' });
  assert.equal(status(), 400);
  const json = JSON.parse(body());
  assert.ok(Array.isArray(json.issues));
});

test('handleLibraryImport: bundle of 2 → 201, both inserted, shared bundleId', async () => {
  const store = fakeStore();
  const { res, status, body } = fakeRes();
  await handleLibraryImport({} as IncomingMessage, res, { artifacts: bundleArtifacts }, { runHistoryStore: store, sourceMode: 'local_demo' });
  assert.equal(status(), 201);
  const json = JSON.parse(body());
  assert.equal(json.runIds.length, 2);
  assert.match(json.bundleId, /^bundle_/);
  for (const runId of json.runIds) {
    const stored = await store.getRun(runId);
    assert.ok(stored);
    assert.equal(stored!.bundleId, json.bundleId);
  }
});

test('handleLibraryImport: bundle of 51 → 400', async () => {
  const store = fakeStore();
  const big = Array.from({ length: 51 }, () => turnLoopArtifact);
  const { res, status } = fakeRes();
  await handleLibraryImport({} as IncomingMessage, res, { artifacts: big }, { runHistoryStore: store, sourceMode: 'local_demo' });
  assert.equal(status(), 400);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --import tsx --test tests/cli/server/library-import-route.test.ts
```

Expected: FAIL with "Cannot find module .../library-import-route.js"

- [ ] **Step 3: Implement the route handler**

Write `src/cli/server/library-import-route.ts`:

```typescript
/**
 * POST /api/v1/library/import — accepts a RunArtifact (single) or array
 * of RunArtifacts (bundle) from a Studio drop and inserts the enriched
 * RunRecord(s) into the active run-history store. Lets users persist
 * artifacts that originated outside this server (Studio JSON drops,
 * shared exports, replay clones).
 *
 * @module paracosm/cli/server/library-import-route
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { RunArtifactSchema } from '../../engine/schema/artifact.js';
import type { RunArtifact } from '../../engine/schema/index.js';
import type { RunHistoryStore } from './run-history-store.js';
import type { RunRecord } from './run-record.js';
import { createRunRecord, hashActorConfig } from './run-record.js';
import { enrichRunRecordFromArtifact } from './enrich-run-record.js';
import type { ParacosmServerMode } from './server-mode.js';

const MAX_BUNDLE_SIZE = 50;

const SingleBodySchema = z.object({ artifact: z.unknown() });
const BundleBodySchema = z.object({ artifacts: z.array(z.unknown()).min(1).max(MAX_BUNDLE_SIZE) });

export interface LibraryImportDeps {
  runHistoryStore: RunHistoryStore;
  sourceMode: ParacosmServerMode;
}

export async function handleLibraryImport(
  _req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  deps: LibraryImportDeps,
): Promise<void> {
  // Detect single vs bundle by which key is present.
  const isBundle = !!(body && typeof body === 'object' && 'artifacts' in (body as object));
  const isSingle = !!(body && typeof body === 'object' && 'artifact' in (body as object));

  if (!isBundle && !isSingle) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Body must contain `artifact` (single) or `artifacts` (bundle)' }));
    return;
  }

  if (isBundle) {
    const parsed = BundleBodySchema.safeParse(body);
    if (!parsed.success) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid bundle', issues: parsed.error.issues.slice(0, 3) }));
      return;
    }
    const artifacts: RunArtifact[] = [];
    for (let i = 0; i < parsed.data.artifacts.length; i += 1) {
      const a = RunArtifactSchema.safeParse(parsed.data.artifacts[i]);
      if (!a.success) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: `Bundle item ${i} is not a valid RunArtifact`,
          issues: a.error.issues.slice(0, 3),
        }));
        return;
      }
      artifacts.push(a.data as unknown as RunArtifact);
    }
    const bundleId = `bundle_${randomUUID()}`;
    const result: { runIds: string[]; alreadyExisted: boolean[] } = { runIds: [], alreadyExisted: [] };
    for (const artifact of artifacts) {
      const inserted = await insertOne(artifact, bundleId, deps);
      result.runIds.push(inserted.runId);
      result.alreadyExisted.push(inserted.alreadyExisted);
    }
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ bundleId, ...result }));
    return;
  }

  // Single
  const parsed = SingleBodySchema.safeParse(body);
  if (!parsed.success) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid artifact body', issues: parsed.error.issues.slice(0, 3) }));
    return;
  }
  const a = RunArtifactSchema.safeParse(parsed.data.artifact);
  if (!a.success) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Not a valid RunArtifact',
      issues: a.error.issues.slice(0, 3),
    }));
    return;
  }
  const inserted = await insertOne(a.data as unknown as RunArtifact, undefined, deps);
  res.writeHead(201, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(inserted));
}

async function insertOne(
  artifact: RunArtifact,
  bundleId: string | undefined,
  deps: LibraryImportDeps,
): Promise<{ runId: string; alreadyExisted: boolean }> {
  // The artifact's metadata.runId is the source of truth — preserves
  // identity across re-imports so duplicate drops collapse to a single
  // Library row.
  const importedRunId = artifact.metadata.runId;

  const existing = await deps.runHistoryStore.getRun(importedRunId);
  if (existing) {
    return { runId: importedRunId, alreadyExisted: true };
  }

  const baseInput: Omit<RunRecord, 'runId' | 'createdAt'> = {
    scenarioId: artifact.metadata.scenario.id,
    scenarioVersion: (artifact.metadata.scenario as { version?: string }).version ?? '1.0.0',
    actorConfigHash: hashActorConfig({
      runId: importedRunId,
      scenario: artifact.metadata.scenario,
    }),
    economicsProfile: 'imported',
    sourceMode: deps.sourceMode,
    createdBy: 'user',
  };
  if (bundleId) baseInput.bundleId = bundleId;

  // Build a record carrying the imported runId rather than a fresh
  // randomUUID — the artifact's identity comes with it.
  const base: RunRecord = {
    ...createRunRecord(baseInput),
    runId: importedRunId,
  };
  const enriched = enrichRunRecordFromArtifact(base, artifact);
  await deps.runHistoryStore.insertRun(enriched);
  return { runId: importedRunId, alreadyExisted: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --import tsx --test tests/cli/server/library-import-route.test.ts
```

Expected: `pass 6`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/cli/server/library-import-route.ts tests/cli/server/library-import-route.test.ts
git commit -m "feat(server): handleLibraryImport — POST /api/v1/library/import for Studio drops"
```

---

## Task 4: Wire `/api/v1/library/import` into server-app.ts

**Files:**
- Modify: `src/cli/server-app.ts`

The route mounts behind the same `paracosmRoutesEnabled` gate as the other `/api/v1/*` routes.

- [ ] **Step 1: Find the v1 route block**

```bash
grep -n "/api/v1/runs\|paracosmRoutesEnabled" src/cli/server-app.ts | head -10
```

Note the line where the v1 route block begins. Below the existing `/api/v1/runs` mount, the import handler attaches with the same gate.

- [ ] **Step 2: Add the import to the imports list**

In `src/cli/server-app.ts`, find the line that imports `handleListBundle` (or any other route module) and add:

```typescript
import { handleLibraryImport } from './server/library-import-route.js';
```

- [ ] **Step 3: Add the route handler**

Find the v1 route block (in the request handler near the existing `/api/v1/runs` route). Add this branch immediately after the existing v1 routes:

```typescript
if (req.url === '/api/v1/library/import' && req.method === 'POST') {
  if (!paracosmRoutesEnabled) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  if (!runHistoryStore) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Run-history store disabled' }));
    return;
  }
  try {
    const body = JSON.parse(await readBody(req, maxRequestBodyBytes));
    await handleLibraryImport(req, res, body, { runHistoryStore, sourceMode: serverMode });
  } catch (err) {
    writeJsonError(res, err);
  }
  return;
}
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm tsc --noEmit
```

Expected: clean (no new errors)

- [ ] **Step 5: Commit**

```bash
git add src/cli/server-app.ts
git commit -m "feat(server): wire POST /api/v1/library/import behind paracosmRoutesEnabled"
```

---

## Task 5: StudioArtifactView (single render)

**Files:**
- Create: `src/cli/dashboard/src/components/studio/StudioArtifactView.tsx`
- Create: `src/cli/dashboard/src/components/studio/StudioArtifactView.test.tsx`

Renders one artifact by branching on `metadata.mode` and delegating to the existing static-mode adapters. Hosts the Promote + Compare buttons but the actual click handlers are wired in Task 10/12 — for now the buttons are passed in via props.

- [ ] **Step 1: Write the failing test**

Write `src/cli/dashboard/src/components/studio/StudioArtifactView.test.tsx`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import * as React from 'react';
import { StudioArtifactView } from './StudioArtifactView.js';
import type { RunArtifact } from '../../../../../engine/schema/index.js';

const fixtureDir = resolve(__dirname, '../../../../../../tests/fixtures');
const turnLoopArtifact = JSON.parse(readFileSync(resolve(fixtureDir, 'runArtifact-v0.8-turn-loop.json'), 'utf-8')) as RunArtifact;
const batchArtifact = JSON.parse(readFileSync(resolve(fixtureDir, 'runArtifact-v0.8-batch.json'), 'utf-8')) as RunArtifact;

test('StudioArtifactView: turn-loop artifact renders the per-turn list', () => {
  const html = renderToString(<StudioArtifactView artifact={turnLoopArtifact} onPromote={() => {}} onCompare={() => {}} />);
  // ReportViewAdapter renders "Turn N" headers for each timepoint.
  assert.match(html, /Turn 1/);
  assert.match(html, /Turn 3/);
  // The artifact's decision label should appear.
  assert.match(html, /Conserve power/);
});

test('StudioArtifactView: batch-trajectory artifact renders the BatchArtifactView path', () => {
  const html = renderToString(<StudioArtifactView artifact={batchArtifact} onPromote={() => {}} onCompare={() => {}} />);
  // BatchArtifactView surfaces the time-unit label ("quarter").
  assert.match(html, /quarter/i);
});

test('StudioArtifactView: header surfaces actor name + scenario name', () => {
  const html = renderToString(<StudioArtifactView artifact={turnLoopArtifact} onPromote={() => {}} onCompare={() => {}} />);
  assert.match(html, /Aria Chen/);
  assert.match(html, /Mars Genesis/);
});

test('StudioArtifactView: inline mode hides Promote and Compare buttons', () => {
  const html = renderToString(<StudioArtifactView artifact={turnLoopArtifact} inline onPromote={() => {}} onCompare={() => {}} />);
  assert.ok(!html.includes('>Promote to Library<'));
  assert.ok(!html.includes('>Compare<'));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/dashboard/src/components/studio/StudioArtifactView.test.tsx
```

Expected: FAIL with "Cannot find module './StudioArtifactView.js'"

- [ ] **Step 3: Implement the component**

Write `src/cli/dashboard/src/components/studio/StudioArtifactView.tsx`:

```typescript
/**
 * Render a single dropped RunArtifact in the Studio tab. Reuses the
 * static-mode adapters that the Library tab uses for stored runs:
 *   - turn-loop  → ReportViewAdapter
 *   - batch-*    → BatchArtifactView
 *
 * @module paracosm/dashboard/studio/StudioArtifactView
 */
import * as React from 'react';
import styles from './StudioTab.module.scss';
import { ReportViewAdapter } from '../reports/ReportViewAdapter.js';
import { BatchArtifactView } from '../reports/BatchArtifactView.js';
import type { MetricSpec } from '../viz/kit/index.js';
import type { RunArtifact } from '../../../../../engine/schema/index.js';

export interface StudioArtifactViewProps {
  artifact: RunArtifact;
  /** When true, omits the Promote + Compare action bar (used inside
   *  the bundle drill-in panel where actions are bundle-level). */
  inline?: boolean;
  onPromote: () => void;
  onCompare: () => void;
  /** Optional disabled signal for Promote (e.g., import in flight). */
  promoteBusy?: boolean;
  /** When set, the actor was already in the Library — rename the
   *  Promote button to "Already in Library" and disable. */
  alreadyExisted?: boolean;
}

export function StudioArtifactView(props: StudioArtifactViewProps): JSX.Element {
  const { artifact, inline, onPromote, onCompare, promoteBusy, alreadyExisted } = props;
  const mode = artifact.metadata.mode;
  const actorName = (artifact as { leader?: { name?: string } }).leader?.name ?? '<unnamed actor>';
  const scenarioName = artifact.metadata.scenario.name ?? artifact.metadata.scenario.id;

  // Same metric-spec derivation as RunDetailDrawer: pull metric ids
  // from the first timepoint, default range [0, 1].
  const metricSpecs: Record<string, MetricSpec> = React.useMemo(() => {
    const out: Record<string, MetricSpec> = {};
    const firstTp = artifact.trajectory?.timepoints?.[0] as { worldSnapshot?: { metrics?: Record<string, number> } } | undefined;
    const sample = firstTp?.worldSnapshot?.metrics ?? {};
    for (const id of Object.keys(sample)) {
      out[id] = { id, label: id, range: [0, 1] };
    }
    return out;
  }, [artifact]);

  return (
    <div className={styles.artifactView}>
      <header className={styles.artifactHead}>
        <div>
          <div className={styles.artifactScenario}>{scenarioName}</div>
          <div className={styles.artifactActor}>{actorName} · {mode}</div>
        </div>
        {!inline && (
          <div className={styles.artifactActions}>
            <button
              type="button"
              className={styles.promoteBtn}
              onClick={onPromote}
              disabled={promoteBusy || alreadyExisted}
            >
              {alreadyExisted ? 'Already in Library' : promoteBusy ? 'Promoting…' : 'Promote to Library'}
            </button>
            <button type="button" className={styles.compareBtn} onClick={onCompare}>
              Compare
            </button>
          </div>
        )}
      </header>
      <div className={styles.artifactBody}>
        {mode === 'turn-loop'
          ? <ReportViewAdapter artifact={artifact} />
          : <BatchArtifactView artifact={artifact} metricSpecs={metricSpecs} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create a minimal scss stub so the import resolves**

Write `src/cli/dashboard/src/components/studio/StudioTab.module.scss`:

```scss
.tab {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem;
  height: 100%;
  overflow: auto;
}

.dropZone {
  border: 2px dashed var(--border, #444);
  border-radius: 8px;
  padding: 3rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
  background: var(--surface-2, rgba(255, 255, 255, 0.02));
}

.dropZoneActive {
  border-color: var(--accent, #4fb1ff);
  background: var(--surface-3, rgba(79, 177, 255, 0.08));
}

.dropZoneError {
  border-color: var(--danger, #e57373);
  background: rgba(229, 115, 115, 0.06);
}

.dropZoneHint {
  color: var(--text-dim, #888);
  font-size: 0.875rem;
  margin-top: 0.5rem;
}

.fileInput {
  display: none;
}

.errorBanner {
  background: rgba(229, 115, 115, 0.1);
  border: 1px solid var(--danger, #e57373);
  border-radius: 4px;
  padding: 0.75rem;
  color: var(--danger, #e57373);
}

.errorHint {
  font-size: 0.875rem;
  color: var(--text-dim, #888);
  margin-top: 0.25rem;
}

.loadedBar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  background: var(--surface-2);
  font-size: 0.875rem;
}

.artifactView {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.artifactHead {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.artifactScenario {
  font-weight: 600;
  font-size: 1.1rem;
}

.artifactActor {
  font-size: 0.875rem;
  color: var(--text-dim, #888);
}

.artifactActions {
  display: flex;
  gap: 0.5rem;
}

.promoteBtn,
.compareBtn {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  cursor: pointer;
}

.promoteBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.artifactBody {
  flex: 1;
  min-height: 0;
}

.bundleGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.bundleCard {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1rem;
  cursor: pointer;
  background: var(--surface-2);
}

.bundleCard:hover {
  border-color: var(--accent, #4fb1ff);
}

.bundleCardTitle {
  font-weight: 600;
}

.bundleCardMeta {
  font-size: 0.85rem;
  color: var(--text-dim);
  margin-top: 0.25rem;
}

.bundleActions {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.bundleDrillBack {
  padding: 0.5rem 1rem;
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  margin-bottom: 1rem;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/dashboard/src/components/studio/StudioArtifactView.test.tsx
```

Expected: `pass 4`, `fail 0`

- [ ] **Step 6: Commit**

```bash
git add src/cli/dashboard/src/components/studio/StudioArtifactView.tsx src/cli/dashboard/src/components/studio/StudioArtifactView.test.tsx src/cli/dashboard/src/components/studio/StudioTab.module.scss
git commit -m "feat(studio): StudioArtifactView delegates to ReportViewAdapter or BatchArtifactView"
```

---

## Task 6: StudioBundleView (grid + drill-in)

**Files:**
- Create: `src/cli/dashboard/src/components/studio/StudioBundleView.tsx`

Renders a grid of artifact cards. Click a card → inline drill-in (`StudioArtifactView` in `inline` mode). Bundle-level Promote + Compare actions.

- [ ] **Step 1: Implement the component**

Write `src/cli/dashboard/src/components/studio/StudioBundleView.tsx`:

```typescript
/**
 * Renders a Studio bundle as a grid of artifact cards. Click a card →
 * inline drill-in showing the StudioArtifactView for that artifact in
 * inline mode (Promote + Compare are bundle-level actions, not
 * per-artifact, so the drill-in suppresses them).
 *
 * @module paracosm/dashboard/studio/StudioBundleView
 */
import * as React from 'react';
import styles from './StudioTab.module.scss';
import { StudioArtifactView } from './StudioArtifactView.js';
import type { RunArtifact } from '../../../../../engine/schema/index.js';

export interface StudioBundleViewProps {
  artifacts: RunArtifact[];
  bundleId?: string;
  onPromote: () => void;
  onCompare: () => void;
  promoteBusy?: boolean;
  alreadyExisted?: boolean;
}

export function StudioBundleView(props: StudioBundleViewProps): JSX.Element {
  const { artifacts, onPromote, onCompare, promoteBusy, alreadyExisted } = props;
  const [drillIdx, setDrillIdx] = React.useState<number | null>(null);

  if (drillIdx !== null && artifacts[drillIdx]) {
    const drilled = artifacts[drillIdx];
    return (
      <div>
        <button
          type="button"
          className={styles.bundleDrillBack}
          onClick={() => setDrillIdx(null)}
        >
          ← Back to bundle
        </button>
        <StudioArtifactView
          artifact={drilled}
          inline
          onPromote={() => {}}
          onCompare={() => {}}
        />
      </div>
    );
  }

  return (
    <div>
      <div className={styles.bundleActions}>
        <button
          type="button"
          className={styles.promoteBtn}
          onClick={onPromote}
          disabled={promoteBusy || alreadyExisted}
        >
          {alreadyExisted ? 'Already in Library' : promoteBusy ? 'Promoting…' : `Promote bundle (${artifacts.length})`}
        </button>
        <button type="button" className={styles.compareBtn} onClick={onCompare}>
          Compare bundle
        </button>
      </div>
      <div className={styles.bundleGrid}>
        {artifacts.map((artifact, i) => {
          const actor = (artifact as { leader?: { name?: string; archetype?: string } }).leader;
          const cost = (artifact as { cost?: { totalUSD?: number } }).cost?.totalUSD;
          const turns = artifact.trajectory?.timepoints?.length ?? 0;
          return (
            <button
              type="button"
              key={artifact.metadata.runId}
              className={styles.bundleCard}
              onClick={() => setDrillIdx(i)}
            >
              <div className={styles.bundleCardTitle}>{actor?.name ?? '<unnamed>'}</div>
              <div className={styles.bundleCardMeta}>
                {actor?.archetype ?? ''} · {turns} turn{turns === 1 ? '' : 's'}
                {typeof cost === 'number' ? ` · $${cost.toFixed(3)}` : ''}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify dashboard typecheck still passes**

```bash
pnpm typecheck:dashboard
```

Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/cli/dashboard/src/components/studio/StudioBundleView.tsx
git commit -m "feat(studio): StudioBundleView grid + drill-in"
```

---

## Task 7: StudioDropZone (drag-drop + click-upload)

**Files:**
- Create: `src/cli/dashboard/src/components/studio/StudioDropZone.tsx`

Drop zone with drag-over state, click-to-upload via hidden `<input type=file>`, file size guard (10 MB), reads as text via `File.text()`, calls `parseStudioInput`, hands result back to parent.

- [ ] **Step 1: Implement the component**

Write `src/cli/dashboard/src/components/studio/StudioDropZone.tsx`:

```typescript
/**
 * Drag-drop + click-to-upload zone for Studio. Reads the dropped file
 * as text, hands the text to the supplied parser, and forwards the
 * StudioInput result via onLoaded. Size-guards at 10 MB before reading
 * to avoid OOMing on a misclicked 1 GB JSON.
 *
 * @module paracosm/dashboard/studio/StudioDropZone
 */
import * as React from 'react';
import styles from './StudioTab.module.scss';
import { parseStudioInput, type StudioInput } from './parseStudioInput.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface StudioDropZoneProps {
  onLoaded: (input: StudioInput, filename: string) => void;
}

export function StudioDropZone({ onLoaded }: StudioDropZoneProps): JSX.Element {
  const [dragActive, setDragActive] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; hint?: string } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = React.useCallback(async (file: File) => {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError({ message: `File is too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`, hint: `Got ${Math.round(file.size / 1024 / 1024)} MB` });
      return;
    }
    const text = await file.text();
    const result = parseStudioInput(text);
    if (result.kind === 'error') {
      setError({ message: result.message, hint: result.hint });
      return;
    }
    onLoaded(result, file.name);
  }, [onLoaded]);

  const onDrop = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  const onDragOver = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const onDragLeave = React.useCallback(() => setDragActive(false), []);

  const onClick = React.useCallback(() => inputRef.current?.click(), []);

  const onFilePicked = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so picking the same file twice triggers onChange again.
    e.target.value = '';
  }, [handleFile]);

  const className = [
    styles.dropZone,
    dragActive ? styles.dropZoneActive : '',
    error ? styles.dropZoneError : '',
  ].filter(Boolean).join(' ');

  return (
    <div>
      <div
        className={className}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <div>Drop a paracosm RunArtifact JSON here, or click to browse</div>
        <div className={styles.dropZoneHint}>Single artifact or bundle (array of artifacts), max 10 MB</div>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className={styles.fileInput}
          onChange={onFilePicked}
        />
      </div>
      {error && (
        <div className={styles.errorBanner} role="alert">
          <div>{error.message}</div>
          {error.hint && <div className={styles.errorHint}>{error.hint}</div>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify dashboard typecheck still passes**

```bash
pnpm typecheck:dashboard
```

Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/cli/dashboard/src/components/studio/StudioDropZone.tsx
git commit -m "feat(studio): StudioDropZone drag-drop + click-upload"
```

---

## Task 8: useStudioPromote hook

**Files:**
- Create: `src/cli/dashboard/src/components/studio/useStudioPromote.ts`

Hook that wraps the Promote API call. Single + bundle in one hook, returns `{ promote, busy, lastResult, error }`.

- [ ] **Step 1: Implement the hook**

Write `src/cli/dashboard/src/components/studio/useStudioPromote.ts`:

```typescript
/**
 * Wraps the POST /api/v1/library/import call. One hook for both single
 * + bundle. Caller passes whichever shape; the hook posts the right
 * body. Returns { promote, busy, lastResult, error }.
 *
 * @module paracosm/dashboard/studio/useStudioPromote
 */
import * as React from 'react';
import type { RunArtifact } from '../../../../../engine/schema/index.js';

export interface PromoteSingleResult {
  kind: 'single';
  runId: string;
  alreadyExisted: boolean;
}

export interface PromoteBundleResult {
  kind: 'bundle';
  bundleId: string;
  runIds: string[];
  alreadyExisted: boolean[];
}

export type PromoteResult = PromoteSingleResult | PromoteBundleResult;

export interface UseStudioPromote {
  promoteSingle: (artifact: RunArtifact) => Promise<PromoteSingleResult | null>;
  promoteBundle: (artifacts: RunArtifact[]) => Promise<PromoteBundleResult | null>;
  busy: boolean;
  lastResult: PromoteResult | null;
  error: string | null;
}

export function useStudioPromote(): UseStudioPromote {
  const [busy, setBusy] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<PromoteResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const promoteSingle = React.useCallback(async (artifact: RunArtifact): Promise<PromoteSingleResult | null> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/library/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifact }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        setError(body.error ?? `Promote failed: HTTP ${res.status}`);
        return null;
      }
      const body = (await res.json()) as { runId: string; alreadyExisted: boolean };
      const result: PromoteSingleResult = { kind: 'single', ...body };
      setLastResult(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const promoteBundle = React.useCallback(async (artifacts: RunArtifact[]): Promise<PromoteBundleResult | null> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/library/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifacts }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        setError(body.error ?? `Promote failed: HTTP ${res.status}`);
        return null;
      }
      const body = (await res.json()) as { bundleId: string; runIds: string[]; alreadyExisted: boolean[] };
      const result: PromoteBundleResult = { kind: 'bundle', ...body };
      setLastResult(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { promoteSingle, promoteBundle, busy, lastResult, error };
}
```

- [ ] **Step 2: Verify dashboard typecheck still passes**

```bash
pnpm typecheck:dashboard
```

Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/cli/dashboard/src/components/studio/useStudioPromote.ts
git commit -m "feat(studio): useStudioPromote hook wraps POST /api/v1/library/import"
```

---

## Task 9: CompareModal — accept extraArtifacts

**Files:**
- Modify: `src/cli/dashboard/src/components/compare/CompareModal.tsx`
- Create: `src/cli/dashboard/src/components/compare/CompareModal.extraArtifacts.test.tsx`

Add `extraArtifacts?: RunArtifact[]` and `bundleId?: string` becomes optional. When `extraArtifacts` is supplied without `bundleId`, the modal renders a Library bundle picker first; when both, render together. The pinned-cell view treats `extraArtifacts` as additional members of the visible set.

For v1, the simplest viable extension: if `extraArtifacts` is the only source, the modal renders just those (no bundle, no aggregate). If `bundleId` is also provided, fetch the bundle and append `extraArtifacts` to its run list. The Library bundle picker is deferred to v1.1 — caller can pre-resolve the bundleId before opening.

- [ ] **Step 1: Write the failing test**

Write `src/cli/dashboard/src/components/compare/CompareModal.extraArtifacts.test.tsx`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import * as React from 'react';
import { CompareModal } from './CompareModal.js';
import type { RunArtifact } from '../../../../../engine/schema/index.js';

const fixtureDir = resolve(__dirname, '../../../../../../tests/fixtures');
const turnLoopArtifact = JSON.parse(readFileSync(resolve(fixtureDir, 'runArtifact-v0.8-turn-loop.json'), 'utf-8')) as RunArtifact;

test('CompareModal: extraArtifacts only (no bundleId) renders without crash + includes uploaded marker', () => {
  const html = renderToString(
    <CompareModal
      bundleId={null}
      extraArtifacts={[turnLoopArtifact]}
      open
      onClose={() => {}}
    />,
  );
  assert.match(html, /Aria Chen/);
  assert.match(html, /uploaded/i);
});

test('CompareModal: existing bundleId-only invocation still works (regression)', () => {
  // Open with a bundleId but no extraArtifacts — modal should render
  // the existing bundle-only flow without throwing.
  const html = renderToString(
    <CompareModal bundleId={'bundle_test'} open onClose={() => {}} />,
  );
  // Loading state (bundle fetch hasn't resolved in SSR) is acceptable.
  assert.ok(typeof html === 'string');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/dashboard/src/components/compare/CompareModal.extraArtifacts.test.tsx
```

Expected: FAIL — `bundleId: null` is not assignable to `string`, or `extraArtifacts` does not exist on type `CompareModalProps`.

- [ ] **Step 3: Modify CompareModal props + render path**

In `src/cli/dashboard/src/components/compare/CompareModal.tsx`, replace the props interface + opening of the function with:

```typescript
import type { RunArtifact } from '../../../../../engine/schema/index.js';

export interface CompareModalProps {
  /**
   * Library bundle to compare. Set to null when comparing only
   * Studio-uploaded artifacts (no Library bundle context yet — v1.1
   * will add a bundle picker inside the modal for that case).
   */
  bundleId: string | null;
  /**
   * Studio-uploaded artifacts rendered alongside the bundle's runs.
   * Marked with an "(uploaded)" badge in the column header so users
   * can tell which came from a JSON drop vs the Library.
   */
  extraArtifacts?: RunArtifact[];
  open: boolean;
  onClose: () => void;
}

export function CompareModal({ bundleId, extraArtifacts, open, onClose }: CompareModalProps): JSX.Element | null {
  const { bundle, loading, error } = useBundle(open && bundleId ? bundleId : null);
  const { aggregate } = useBundleAggregate(open && bundleId ? bundleId : null);
  const pinning = usePinnedRuns();
  const [openRunId, setOpenRunId] = React.useState<string | null>(null);
```

Keep the rest of the component body unchanged for now. Then find the section that renders the bundle aggregate / grid and add an extras-only header card. After the aggregate strip render block (search for `<AggregateStrip`), insert:

```typescript
{extraArtifacts && extraArtifacts.length > 0 && (
  <section className={styles.extras} aria-label="Uploaded artifacts">
    <h3>Uploaded ({extraArtifacts.length})</h3>
    <ul>
      {extraArtifacts.map((a) => {
        const actor = (a as { leader?: { name?: string } }).leader?.name ?? '<unnamed>';
        return (
          <li key={a.metadata.runId}>
            {actor} <span className={styles.extrasBadge}>(uploaded)</span>
          </li>
        );
      })}
    </ul>
  </section>
)}
```

Add the supporting CSS classes to `CompareModal.module.scss`:

```scss
.extras {
  border-top: 1px solid var(--border);
  padding: 1rem;
}

.extrasBadge {
  font-size: 0.75rem;
  color: var(--text-dim);
  margin-left: 0.5rem;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/dashboard/src/components/compare/CompareModal.extraArtifacts.test.tsx
```

Expected: `pass 2`, `fail 0`

- [ ] **Step 5: Update existing CompareModal callers that pass bundleId as required**

```bash
grep -rn "<CompareModal" src/cli/dashboard/src --include='*.tsx'
```

Each call site that passes `bundleId={someString}` already satisfies the new `string | null` signature, so no change is needed for the existing callers — but verify the dashboard typecheck still passes:

```bash
pnpm typecheck:dashboard
```

Expected: clean

- [ ] **Step 6: Commit**

```bash
git add src/cli/dashboard/src/components/compare/CompareModal.tsx src/cli/dashboard/src/components/compare/CompareModal.module.scss src/cli/dashboard/src/components/compare/CompareModal.extraArtifacts.test.tsx
git commit -m "feat(compare): CompareModal accepts extraArtifacts for ad-hoc Studio compare"
```

---

## Task 10: StudioTab root + tab routing wiring

**Files:**
- Create: `src/cli/dashboard/src/components/studio/StudioTab.tsx`
- Modify: `src/cli/dashboard/src/tab-routing.ts`
- Modify: `src/cli/dashboard/src/App.tsx`
- Modify: `src/cli/dashboard/src/components/layout/TopBar.tsx`

This task wires the whole Studio experience together: tab id, route, App switch, top-bar nav button, and the StudioTab component that composes DropZone + ArtifactView/BundleView + Promote + Compare.

- [ ] **Step 1: Add 'studio' to DASHBOARD_TABS**

Edit `src/cli/dashboard/src/tab-routing.ts` to insert `'studio'` between `'library'` and `'log'` in the `DASHBOARD_TABS` literal:

```typescript
export const DASHBOARD_TABS = ['quickstart', 'sim', 'viz', 'settings', 'reports', 'branches', 'chat', 'library', 'studio', 'log', 'about'] as const;
```

- [ ] **Step 2: Implement StudioTab**

Write `src/cli/dashboard/src/components/studio/StudioTab.tsx`:

```typescript
/**
 * Studio tab — drag-drop a RunArtifact JSON, render via the existing
 * static-mode adapters, and expose Promote-to-Library + Compare-against-
 * Library actions.
 *
 * @module paracosm/dashboard/studio/StudioTab
 */
import * as React from 'react';
import styles from './StudioTab.module.scss';
import { StudioDropZone } from './StudioDropZone.js';
import { StudioArtifactView } from './StudioArtifactView.js';
import { StudioBundleView } from './StudioBundleView.js';
import { useStudioPromote, type PromoteResult } from './useStudioPromote.js';
import { CompareModal } from '../compare/CompareModal.js';
import type { StudioInput } from './parseStudioInput.js';
import type { RunArtifact } from '../../../../../engine/schema/index.js';

interface LoadedState {
  input: StudioInput & { kind: 'single' | 'bundle' };
  filename: string;
  promote: PromoteResult | null;
}

export function StudioTab(): JSX.Element {
  const [loaded, setLoaded] = React.useState<LoadedState | null>(null);
  const [compareOpen, setCompareOpen] = React.useState(false);
  const promote = useStudioPromote();

  const onLoaded = React.useCallback((input: StudioInput, filename: string) => {
    if (input.kind === 'error') return; // DropZone already surfaced the error
    setLoaded({ input, filename, promote: null });
  }, []);

  const onPromoteSingle = React.useCallback(async () => {
    if (!loaded || loaded.input.kind !== 'single') return;
    const result = await promote.promoteSingle(loaded.input.artifact);
    if (result) setLoaded({ ...loaded, promote: result });
  }, [loaded, promote]);

  const onPromoteBundle = React.useCallback(async () => {
    if (!loaded || loaded.input.kind !== 'bundle') return;
    const result = await promote.promoteBundle(loaded.input.artifacts);
    if (result) setLoaded({ ...loaded, promote: result });
  }, [loaded, promote]);

  const onCompare = React.useCallback(() => setCompareOpen(true), []);

  const reset = React.useCallback(() => {
    setLoaded(null);
    setCompareOpen(false);
  }, []);

  const extraArtifacts: RunArtifact[] | undefined = (() => {
    if (!loaded) return undefined;
    if (loaded.input.kind === 'single') return [loaded.input.artifact];
    return loaded.input.artifacts;
  })();

  // bundleId for CompareModal: prefer the freshly-Promoted bundleId
  // (so the bundle's full Library context loads). Otherwise null —
  // CompareModal renders the extras-only path.
  const compareBundleId: string | null = (() => {
    if (loaded?.promote?.kind === 'bundle') return loaded.promote.bundleId;
    return null;
  })();

  return (
    <div className={styles.tab}>
      {!loaded && <StudioDropZone onLoaded={onLoaded} />}
      {loaded && (
        <>
          <div className={styles.loadedBar}>
            <span>
              <strong>{loaded.filename}</strong>
              {' · '}
              {loaded.input.kind === 'single' ? 'single artifact' : `bundle of ${loaded.input.artifacts.length}`}
              {loaded.promote && (loaded.promote.kind === 'single'
                ? loaded.promote.alreadyExisted
                  ? ' · already in Library'
                  : ' · added to Library'
                : ` · added to Library (${loaded.promote.runIds.length} runs)`)}
            </span>
            <button type="button" className={styles.bundleDrillBack} onClick={reset}>
              Drop another
            </button>
          </div>
          {promote.error && (
            <div className={styles.errorBanner} role="alert">{promote.error}</div>
          )}
          {loaded.input.kind === 'single' && (
            <StudioArtifactView
              artifact={loaded.input.artifact}
              onPromote={onPromoteSingle}
              onCompare={onCompare}
              promoteBusy={promote.busy}
              alreadyExisted={loaded.promote?.kind === 'single' && loaded.promote.alreadyExisted}
            />
          )}
          {loaded.input.kind === 'bundle' && (
            <StudioBundleView
              artifacts={loaded.input.artifacts}
              bundleId={loaded.input.bundleId}
              onPromote={onPromoteBundle}
              onCompare={onCompare}
              promoteBusy={promote.busy}
              alreadyExisted={loaded.promote?.kind === 'bundle' && loaded.promote.alreadyExisted.every(Boolean)}
            />
          )}
        </>
      )}
      <CompareModal
        bundleId={compareBundleId}
        extraArtifacts={extraArtifacts}
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 3: Wire StudioTab into App.tsx**

In `src/cli/dashboard/src/App.tsx`, add the import near the other tab imports:

```typescript
import { StudioTab } from './components/studio/StudioTab.js';
```

Find the tab-render switch (search for `case 'library'`) and add a case:

```typescript
case 'studio':
  return <StudioTab />;
```

- [ ] **Step 4: Add Studio nav button to TopBar**

In `src/cli/dashboard/src/components/layout/TopBar.tsx`, find the existing tab buttons (search for `'library'`) and add a Studio button using the same pattern as adjacent tabs:

```typescript
<button
  type="button"
  className={[styles.tab, activeTab === 'studio' ? styles.tabActive : ''].filter(Boolean).join(' ')}
  onClick={() => onTabChange('studio')}
>
  Studio
</button>
```

(Place it adjacent to the Library button so the visual order matches `DASHBOARD_TABS`.)

- [ ] **Step 5: Run dashboard typecheck**

```bash
pnpm typecheck:dashboard
```

Expected: clean

- [ ] **Step 6: Run dashboard tests**

```bash
node --import tsx --import ./scripts/test-css-stub.mjs --test 'src/cli/dashboard/src/components/studio/**/*.test.*' 'src/cli/dashboard/src/components/compare/CompareModal.extraArtifacts.test.tsx'
```

Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add src/cli/dashboard/src/components/studio/StudioTab.tsx src/cli/dashboard/src/tab-routing.ts src/cli/dashboard/src/App.tsx src/cli/dashboard/src/components/layout/TopBar.tsx
git commit -m "feat(studio): wire Studio tab into App + TopBar + tab-routing"
```

---

## Task 11: Verify everything

**Files:** none new

Final integration check.

- [ ] **Step 1: Full dashboard typecheck**

```bash
pnpm typecheck:dashboard
```

Expected: clean

- [ ] **Step 2: Full server typecheck**

```bash
pnpm tsc --noEmit
```

Expected: clean

- [ ] **Step 3: Full test suite**

```bash
pnpm test
```

Expected: all green (the pre-existing `skipped: 1` is fine; `fail: 0` is required)

- [ ] **Step 4: Manual smoke (local dev)**

```bash
pnpm build
node dist/cli/run.js dashboard
```

Open `http://localhost:3456/sim?tab=studio`. Drag any `output/v3-*.json` from this repo into the drop zone:
- Single artifact renders the per-turn list (turn-loop) or the batch view
- Promote button → toast / loaded-bar updates with "added to Library"
- Open Library tab — the new card appears
- Compare button → modal opens with the uploaded artifact column visible

- [ ] **Step 5: Final commit (if anything changed during smoke testing)**

If smoke testing surfaced no fixes needed, no commit is needed.

If anything was tweaked, commit:

```bash
git add -u
git commit -m "fix(studio): smoke-test polish"
```

- [ ] **Step 6: Push**

```bash
git push origin master
```

---

## Self-review checklist

- [x] Spec coverage:
  - Goal (drop JSON → render + Promote + Compare): Tasks 1–10
  - Architecture (delegate to ReportViewAdapter / BatchArtifactView): Task 5
  - File structure rows in spec → tasks: parseStudioInput (Task 2), StudioArtifactView (Task 5), StudioBundleView (Task 6), StudioDropZone (Task 7), StudioTab (Task 10), CompareModal extension (Task 9), library-import-route (Task 3), server-app wire (Task 4), App.tsx + TopBar wire (Task 10), tests/fixtures (Task 1)
  - useStudioPromote hook isn't in the spec's file list but is required by the Promote flow — added to plan as Task 8 with rationale
  - ✓ All spec sections covered
- [x] No placeholders — every step has concrete code or commands
- [x] Type consistency:
  - `StudioInput` discriminated union (`single | bundle | error`) used everywhere
  - `RunArtifact` imported from `engine/schema/index.js`
  - `RunRecord` imported from `server/run-record.js`
  - `CompareModalProps.bundleId: string | null` (was `string`); `extraArtifacts?: RunArtifact[]`
  - `useStudioPromote.promoteSingle / promoteBundle` return discriminated `PromoteSingleResult | PromoteBundleResult`
  - `StudioArtifactViewProps`: `artifact, inline?, onPromote, onCompare, promoteBusy?, alreadyExisted?` — used consistently in StudioBundleView's drill-in (Task 6) and StudioTab (Task 10)
  - `StudioBundleViewProps`: `artifacts, bundleId?, onPromote, onCompare, promoteBusy?, alreadyExisted?` — matches StudioTab caller

Note vs spec: the spec said `runHistoryStore.insertRun` returns affected.changes; in fact the public interface returns `Promise<void>`. Plan adjusts to a `getRun-before-insert` duplicate check (race-safe at runId-as-primary-key granularity since the store's INSERT OR IGNORE preserves first-write semantics on concurrent imports of the same runId).
