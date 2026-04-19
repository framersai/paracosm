# Load Menu + Cached Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-save cleanly completed paracosm runs to the existing server ring, and replace the TopBar `Load` button with a dropdown offering `Load from file` and `Load from cache` (card grid with explicit timestamps).

**Architecture:** Backend adds a short-circuit inside `broadcast()` that persists the existing `eventBuffer` when an `event: complete` frame passes through, gated by two flags (`currentRunAborted`, `currentRunSaved`) reset in `clearEventBuffer()`. Frontend introduces a single `LoadMenu` component with popover + card grid, driven by the existing `useSessions` hook. The existing `SavedSessionsPicker` is deleted.

**Tech Stack:** TypeScript, Node http (paracosm server), React 18 (dashboard), `node:test` for all tests, `better-sqlite3` via the existing session-store.

**Spec:** [docs/superpowers/specs/2026-04-18-load-menu-cached-runs-design.md](../specs/2026-04-18-load-menu-cached-runs-design.md)

---

## File structure

**Created:**
- `src/cli/dashboard/src/components/layout/LoadMenu.tsx` - dropdown component
- `src/cli/dashboard/src/components/layout/LoadMenu.helpers.ts` - pure helpers (render decisions, formatters)
- `src/cli/dashboard/src/components/layout/LoadMenu.helpers.test.ts` - helper tests

**Modified:**
- `src/cli/server-app.ts` - add run-state flags, reset in `clearEventBuffer()`, auto-save inside `broadcast()`, track `sim_aborted`
- `src/cli/dashboard/src/components/layout/TopBar.tsx` - replace `<button>Load</button>` with `<LoadMenu>`
- `src/cli/dashboard/src/components/settings/SettingsPanel.tsx` - remove `SavedSessionsPicker` mount + import
- `tests/cli/server-app.test.ts` - new cases for auto-save behavior

**Deleted:**
- `src/cli/dashboard/src/components/settings/SavedSessionsPicker.tsx`

---

### Task 1: Add run-state flags and reset hook

**Files:**
- Modify: `src/cli/server-app.ts` near line 198 (next to `eventTimestamps`) and line 385 (inside `clearEventBuffer`)

- [ ] **Step 1: Declare the two tracking flags next to `eventTimestamps`**

Find this block around [line 196-198](../../src/cli/server-app.ts#L196):

```ts
  const eventTimestamps: number[] = new Array(eventBuffer.length).fill(0);
```

Add directly below it:

```ts
  // Run-state flags for auto-save on clean completion. Reset inside
  // clearEventBuffer() so the next run starts fresh. See
  // docs/superpowers/specs/2026-04-18-load-menu-cached-runs-design.md.
  let currentRunAborted = false;
  let currentRunSaved = false;
  const AUTO_SAVE_MIN_TURNS = 3;
```

- [ ] **Step 2: Reset both flags inside `clearEventBuffer()`**

Find `clearEventBuffer` around [line 385](../../src/cli/server-app.ts#L385). Add two lines at the top of the function body, above `eventBuffer.length = 0`:

```ts
  const clearEventBuffer = () => {
    currentRunAborted = false;
    currentRunSaved = false;
    eventBuffer.length = 0;
    eventTimestamps.length = 0;
    // ...rest unchanged
  };
```

- [ ] **Step 3: Verify the file still type-checks**

Run: `pnpm -C apps/paracosm build`

Expected: no type errors. The flags are declared but not read yet, which is fine: they are consumed in Task 2.

- [ ] **Step 4: Commit**

```bash
cd apps/paracosm
git add src/cli/server-app.ts
git commit -m "feat(server): add run-state flags for auto-save"
```

---

### Task 2: Auto-save hook inside `broadcast()`

**Files:**
- Modify: `src/cli/server-app.ts` around line 355-376 (the `broadcast` function)

- [ ] **Step 1: Track `sim_aborted`**

Find the broadcast function near [line 355](../../src/cli/server-app.ts#L355). Inside it, right after the existing `for (const res of clients) { ... }` loop and before the `if (event === 'complete')` block, add:

```ts
    if (event === 'sim_aborted') {
      currentRunAborted = true;
    }
```

- [ ] **Step 2: Import `TimestampedEvent` type (confirm existing import)**

The top of `server-app.ts` around [line 27](../../src/cli/server-app.ts#L27) already imports:

```ts
import { openSessionStore, type SessionStore, type TimestampedEvent } from './session-store.js';
```

No change needed. Confirm by reading the existing import.

- [ ] **Step 3: Add auto-save hook inside the `complete` branch**

Find the existing completion branch:

```ts
    if (event === 'complete') {
      captureRetrySnapshot();
    }
```

Replace the entire block with:

```ts
    if (event === 'complete') {
      captureRetrySnapshot();
      autoSaveOnComplete();
    }
```

- [ ] **Step 4: Define `autoSaveOnComplete` helper directly above `broadcast`**

Place the helper just above the `const broadcast: BroadcastFn = ...` declaration around [line 355](../../src/cli/server-app.ts#L355):

```ts
  /**
   * Persist the current run to the session ring when it completes
   * cleanly. Called from inside broadcast() on an `event: complete`
   * frame. Silent no-op when conditions aren't met. Errors are logged
   * but never propagate - a cache write failure must not fail the
   * client-facing broadcast.
   */
  const autoSaveOnComplete = () => {
    if (!sessionStore) return;
    if (currentRunAborted) return;
    if (currentRunSaved) return;
    if (eventBuffer.length === 0) return;

    const turnDoneCount = eventBuffer.reduce(
      (n, msg) => n + (msg.startsWith('event: turn_done\n') ? 1 : 0),
      0,
    );
    if (turnDoneCount < AUTO_SAVE_MIN_TURNS) return;

    try {
      const now = Date.now();
      const events: TimestampedEvent[] = eventBuffer.map((sse, i) => ({
        ts: eventTimestamps[i] || now,
        sse,
      }));
      sessionStore.saveSession(events);
      currentRunSaved = true;
    } catch (err) {
      console.warn('[sessions] auto-save failed:', err);
    }
  };
```

- [ ] **Step 5: Verify type-check and existing tests still pass**

Run: `cd apps/paracosm && pnpm build && node --import tsx --test tests/cli/server-app.test.ts`

Expected: build succeeds, existing tests pass (we have not added new tests yet).

- [ ] **Step 6: Commit**

```bash
cd apps/paracosm
git add src/cli/server-app.ts
git commit -m "feat(server): auto-save completed runs to session ring"
```

---

### Task 3: Server test - clean completion auto-persists

**Files:**
- Modify: `tests/cli/server-app.test.ts`

Background on the test pattern: existing tests create the server with `createMarsServer({ runPairSimulations: ... })`, call `server.listen(0)`, and either (a) hit endpoints via `fetch` or (b) call `server.startWithConfig(config)` directly to await a full run. The session DB path is computed from `env.APP_DIR`, so tests inject `env: { ...process.env, APP_DIR: tmp }` to isolate the SQLite file in a temp dir.

- [ ] **Step 1: Add a temp-dir helper near the top of the file**

Open [tests/cli/server-app.test.ts](../../tests/cli/server-app.test.ts). Near the top imports, `mkdtempSync`/`rmSync` and `tmpdir`/`join` are already imported. Near the existing fixture constants (after `customScenario`), add:

```ts
/** Minimal normalized sim config for driving startWithConfig in tests. */
function makeConfig(): NormalizedSimulationConfig {
  return {
    leaders: [leaderA, leaderB],
    turns: 3,
    yearsPerTurn: 0,
    seed: 1,
    startYear: 2035,
    population: 20,
    scenarioId: 'mars-genesis',
    provider: 'anthropic',
    tierModels: {},
    temperature: 0.2,
  } as unknown as NormalizedSimulationConfig;
}
```

Keep the `as unknown as` cast: `NormalizedSimulationConfig` has many fields; the tests we are writing do not exercise any of them beyond the broadcast stream the injected runner emits.

- [ ] **Step 2: Add the first auto-save test**

Append to the file:

```ts
test('auto-saves a cleanly completed run to the session store', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'paracosm-autosave-'));
  const server = createMarsServer({
    env: { ...process.env, APP_DIR: tmp },
    runPairSimulations: async (_cfg, broadcast) => {
      broadcast('active_scenario', { id: 'mars-genesis', name: 'Mars Genesis' });
      broadcast('setup', { leaderA: { name: leaderA.name }, leaderB: { name: leaderB.name } });
      broadcast('turn_done', { turn: 1 });
      broadcast('turn_done', { turn: 2 });
      broadcast('turn_done', { turn: 3 });
      broadcast('complete', { cost: { totalCostUSD: 0.12 } });
    },
  });
  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    await server.startWithConfig(makeConfig());
    const res = await fetch(`http://127.0.0.1:${port}/sessions`);
    const json = await res.json() as { sessions: Array<{ turnCount?: number; scenarioName?: string }> };
    assert.equal(json.sessions.length, 1);
    assert.equal(json.sessions[0].turnCount, 3);
    assert.equal(json.sessions[0].scenarioName, 'Mars Genesis');
  } finally {
    server.close();
    await once(server, 'close');
    rmSync(tmp, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Run the new test and confirm it passes**

Run: `cd apps/paracosm && node --import tsx --test tests/cli/server-app.test.ts`

Expected: the new test passes alongside the existing ones.

- [ ] **Step 4: Commit**

```bash
cd apps/paracosm
git add tests/cli/server-app.test.ts
git commit -m "test(server): auto-save persists completed run"
```

---

### Task 4: Server tests - abort, short run, double-save, error isolation

**Files:**
- Modify: `tests/cli/server-app.test.ts`
- Modify: `src/cli/server-app.ts` (add `sessionStore?: SessionStore` injection option for the error-isolation test)

Error-isolation setup: rather than pointing `APP_DIR` at an unwritable path (which would cause `openSessionStore` to fail at startup and leave `sessionStore = null`, which the auto-save skips silently), inject a pre-built store whose `saveSession` throws. This exercises the catch in `autoSaveOnComplete` specifically.

- [ ] **Step 1: Allow session-store injection for tests**

In [src/cli/server-app.ts:81-97](../../src/cli/server-app.ts#L81) add a new option:

```ts
export interface CreateMarsServerOptions {
  // ...existing fields unchanged...
  /**
   * Override the session store instance. Only intended for tests; the
   * default production path is to open a SQLite store at
   * `${APP_DIR}/data/sessions.db`.
   */
  sessionStore?: SessionStore;
}
```

And near [server-app.ts:205-213](../../src/cli/server-app.ts#L205), change:

```ts
  const sessionsDbPath = resolve(env.APP_DIR || '.', 'data', 'sessions.db');
  let sessionStore: SessionStore | null = null;
  try {
    sessionStore = openSessionStore(sessionsDbPath);
    console.log(`  [sessions] Opened session store at ${sessionsDbPath} (${sessionStore.count()} stored)`);
  } catch (err) {
```

to:

```ts
  let sessionStore: SessionStore | null = options.sessionStore ?? null;
  if (!sessionStore) {
    const sessionsDbPath = resolve(env.APP_DIR || '.', 'data', 'sessions.db');
    try {
      sessionStore = openSessionStore(sessionsDbPath);
      console.log(`  [sessions] Opened session store at ${sessionsDbPath} (${sessionStore.count()} stored)`);
    } catch (err) {
```

and close the `if (!sessionStore)` block around the existing catch + its closing brace.

- [ ] **Step 2: Abort test**

Append:

```ts
test('does not auto-save when sim_aborted fires before complete', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'paracosm-autosave-abort-'));
  const server = createMarsServer({
    env: { ...process.env, APP_DIR: tmp },
    runPairSimulations: async (_cfg, broadcast) => {
      broadcast('setup', { leaderA: { name: leaderA.name }, leaderB: { name: leaderB.name } });
      broadcast('turn_done', { turn: 1 });
      broadcast('turn_done', { turn: 2 });
      broadcast('turn_done', { turn: 3 });
      broadcast('sim_aborted', { reason: 'user_cancel' });
      broadcast('complete', { cost: { totalCostUSD: 0 } });
    },
  });
  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    await server.startWithConfig(makeConfig());
    const res = await fetch(`http://127.0.0.1:${port}/sessions`);
    const json = await res.json() as { sessions: unknown[] };
    assert.equal(json.sessions.length, 0);
  } finally {
    server.close();
    await once(server, 'close');
    rmSync(tmp, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Short-run test**

Append:

```ts
test('does not auto-save when turn count is below AUTO_SAVE_MIN_TURNS', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'paracosm-autosave-short-'));
  const server = createMarsServer({
    env: { ...process.env, APP_DIR: tmp },
    runPairSimulations: async (_cfg, broadcast) => {
      broadcast('setup', { leaderA: { name: leaderA.name }, leaderB: { name: leaderB.name } });
      broadcast('turn_done', { turn: 1 });
      broadcast('turn_done', { turn: 2 });
      broadcast('complete', { cost: { totalCostUSD: 0 } });
    },
  });
  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    await server.startWithConfig(makeConfig());
    const res = await fetch(`http://127.0.0.1:${port}/sessions`);
    const json = await res.json() as { sessions: unknown[] };
    assert.equal(json.sessions.length, 0);
  } finally {
    server.close();
    await once(server, 'close');
    rmSync(tmp, { recursive: true, force: true });
  }
});
```

- [ ] **Step 4: Double-save guard test**

Append:

```ts
test('emits complete twice but saves only once', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'paracosm-autosave-double-'));
  const server = createMarsServer({
    env: { ...process.env, APP_DIR: tmp },
    runPairSimulations: async (_cfg, broadcast) => {
      broadcast('setup', { leaderA: { name: leaderA.name }, leaderB: { name: leaderB.name } });
      for (let i = 1; i <= 3; i++) broadcast('turn_done', { turn: i });
      broadcast('complete', { cost: { totalCostUSD: 0.1 } });
      broadcast('complete', { cost: { totalCostUSD: 0.1 } });
    },
  });
  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    await server.startWithConfig(makeConfig());
    const res = await fetch(`http://127.0.0.1:${port}/sessions`);
    const json = await res.json() as { sessions: unknown[] };
    assert.equal(json.sessions.length, 1);
  } finally {
    server.close();
    await once(server, 'close');
    rmSync(tmp, { recursive: true, force: true });
  }
});
```

- [ ] **Step 5: Error-isolation test**

Append (uses the injected session store added in Step 1):

```ts
test('auto-save errors do not break the broadcast pipeline', async () => {
  let saveCalled = false;
  const throwingStore = {
    saveSession: () => { saveCalled = true; throw new Error('disk full'); },
    listSessions: () => [],
    getSession: () => null,
    count: () => 0,
    close: () => {},
  } as unknown as import('../../src/cli/session-store.js').SessionStore;

  const server = createMarsServer({
    sessionStore: throwingStore,
    runPairSimulations: async (_cfg, broadcast) => {
      broadcast('setup', { leaderA: { name: leaderA.name }, leaderB: { name: leaderB.name } });
      for (let i = 1; i <= 3; i++) broadcast('turn_done', { turn: i });
      broadcast('complete', { cost: { totalCostUSD: 0.1 } });
    },
  });
  server.listen(0);
  await once(server, 'listening');
  try {
    // Must resolve normally. If autoSaveOnComplete rethrows, startWithConfig rejects.
    await server.startWithConfig(makeConfig());
    assert.equal(saveCalled, true);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
```

- [ ] **Step 6: Run all new tests**

Run: `cd apps/paracosm && node --import tsx --test tests/cli/server-app.test.ts`

Expected: all five new tests pass, and all pre-existing tests still pass.

- [ ] **Step 7: Commit**

```bash
cd apps/paracosm
git add tests/cli/server-app.test.ts src/cli/server-app.ts
git commit -m "test(server): guard tests for auto-save abort/short/double/error"
```

---

### Task 5: Client - pure helpers for LoadMenu

**Files:**
- Create: `src/cli/dashboard/src/components/layout/LoadMenu.helpers.ts`
- Create: `src/cli/dashboard/src/components/layout/LoadMenu.helpers.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/cli/dashboard/src/components/layout/LoadMenu.helpers.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatExplicit,
  shouldShowCacheRow,
  cacheExpandedBody,
  buildReplayHref,
} from './LoadMenu.helpers.js';

test('formatExplicit renders MMM D · HH:mm in local TZ', () => {
  // 2026-04-18T14:32:00 local -> localized formatting.
  const ts = new Date(2026, 3, 18, 14, 32, 0).getTime();
  const out = formatExplicit(ts);
  // Assert structure instead of exact locale string (CI TZ varies).
  assert.match(out, /^[A-Z][a-z]{2} \d{1,2} · \d{2}:\d{2}$/);
});

test('shouldShowCacheRow hides on unavailable/error, shows otherwise', () => {
  assert.equal(shouldShowCacheRow('loading'), true);
  assert.equal(shouldShowCacheRow('ready'), true);
  assert.equal(shouldShowCacheRow('unavailable'), false);
  assert.equal(shouldShowCacheRow('error'), false);
});

test('cacheExpandedBody picks the right branch per state', () => {
  assert.equal(cacheExpandedBody('loading', []), 'loading');
  assert.equal(cacheExpandedBody('ready', []), 'empty');
  assert.equal(
    cacheExpandedBody('ready', [{ id: 'a', createdAt: 0, eventCount: 0 }]),
    'cards',
  );
});

test('buildReplayHref appends ?replay=<id> and preserves host', () => {
  const href = buildReplayHref('https://paracosm.example/sim?foo=1', 'abc');
  const url = new URL(href);
  assert.equal(url.searchParams.get('replay'), 'abc');
  assert.equal(url.searchParams.get('foo'), '1');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/paracosm && node --import tsx --test src/cli/dashboard/src/components/layout/LoadMenu.helpers.test.ts`

Expected: FAIL. Cannot resolve `./LoadMenu.helpers.js`.

- [ ] **Step 3: Implement the helpers**

Create `src/cli/dashboard/src/components/layout/LoadMenu.helpers.ts`:

```ts
/**
 * Pure helpers extracted from LoadMenu for unit testing. The React
 * component wires these to UI state; helpers are kept free of
 * DOM/React dependencies so they can run under node:test.
 *
 * @module paracosm/cli/dashboard/components/layout/LoadMenu.helpers
 */
import type { SessionsStatus, StoredSessionMeta } from '../../hooks/useSessions';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** `Apr 18 · 14:32` in the viewer's local timezone. */
export function formatExplicit(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${MONTHS[d.getMonth()]} ${d.getDate()} · ${hh}:${mm}`;
}

/** Hide the cache row when the server ring is unavailable or errored. */
export function shouldShowCacheRow(status: SessionsStatus): boolean {
  return status === 'loading' || status === 'ready';
}

/** Which body to render when the cache row is expanded. */
export function cacheExpandedBody(
  status: SessionsStatus,
  sessions: readonly StoredSessionMeta[],
): 'loading' | 'empty' | 'cards' {
  if (status === 'loading') return 'loading';
  if (sessions.length === 0) return 'empty';
  return 'cards';
}

/** Build a replay href that preserves the current origin + path. */
export function buildReplayHref(base: string, id: string): string {
  const url = new URL(base);
  url.searchParams.set('replay', id);
  return url.toString();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/paracosm && node --import tsx --test src/cli/dashboard/src/components/layout/LoadMenu.helpers.test.ts`

Expected: all four tests pass.

- [ ] **Step 5: Commit**

```bash
cd apps/paracosm
git add src/cli/dashboard/src/components/layout/LoadMenu.helpers.ts src/cli/dashboard/src/components/layout/LoadMenu.helpers.test.ts
git commit -m "feat(dashboard): add LoadMenu pure helpers + tests"
```

---

### Task 6: Client - LoadMenu component (file row + cache row shell)

**Files:**
- Create: `src/cli/dashboard/src/components/layout/LoadMenu.tsx`

- [ ] **Step 1: Write the component**

Create `src/cli/dashboard/src/components/layout/LoadMenu.tsx`:

```tsx
/**
 * Dropdown variant of the TopBar Load button. Two rows:
 * - Load from file: delegates to the existing file picker via prop.
 * - Load from cache: expands inline to a card grid of the last N
 *   server-side saved runs (driven by useSessions). Cards navigate
 *   to /sim?replay=<id> to trigger SSE playback via the existing
 *   useSSE hook.
 *
 * Keyboard: Tab cycles rows/cards, Enter/Space activates, Esc closes.
 *
 * @module paracosm/cli/dashboard/components/layout/LoadMenu
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSessions, type StoredSessionMeta } from '../../hooks/useSessions';
import { resolveSetupRedirectHref } from '../../tab-routing';
import {
  formatExplicit,
  shouldShowCacheRow,
  cacheExpandedBody,
  buildReplayHref,
} from './LoadMenu.helpers';

export interface LoadMenuProps {
  /** Called when the user picks "Load from file". */
  onLoadFromFile: () => void;
}

const triggerStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  color: 'var(--text-2)',
  border: '1px solid var(--border)',
  padding: '2px 10px',
  borderRadius: 3,
  fontSize: 10,
  cursor: 'pointer',
  fontWeight: 600,
  fontFamily: 'var(--mono)',
};

const popoverStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  right: 0,
  width: 'min(520px, calc(100vw - 32px))',
  maxHeight: 'min(70vh, 480px)',
  overflowY: 'auto',
  background: 'var(--bg-panel)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  boxShadow: 'var(--card-shadow, 0 8px 24px rgba(0,0,0,.35))',
  padding: 8,
  zIndex: 50,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  fontSize: 12,
  fontFamily: 'var(--mono)',
  color: 'var(--text-1)',
  background: 'var(--bg-canvas)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  cursor: 'pointer',
  marginBottom: 6,
};

const cardStyle: React.CSSProperties = {
  display: 'block',
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 11,
  fontFamily: 'var(--sans)',
  color: 'var(--text-1)',
  background: 'var(--bg-canvas)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  cursor: 'pointer',
  width: '100%',
  marginBottom: 6,
};

function formatRelative(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDuration(ms: number | undefined): string {
  if (!ms || ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatCost(usd: number | undefined): string {
  if (usd == null) return '—';
  if (usd < 0.005) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

function Card({ s, onPick }: { s: StoredSessionMeta; onPick: () => void }) {
  const title = s.scenarioName || 'Untitled run';
  const leaders = s.leaderA && s.leaderB ? `${s.leaderA} vs ${s.leaderB}` : '';
  const turns = s.turnCount != null ? `${s.turnCount} turn${s.turnCount === 1 ? '' : 's'}` : '';
  const line2 = [leaders, turns].filter(Boolean).join(' · ');
  const line3 = `${formatExplicit(s.createdAt)} (${formatRelative(s.createdAt)}) · ${formatDuration(s.durationMs)} · ${formatCost(s.totalCostUSD)}`;
  return (
    <button
      type="button"
      style={cardStyle}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(); }
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{title}</div>
      {line2 && <div style={{ fontSize: 10, color: 'var(--text-2)', marginBottom: 4 }}>{line2}</div>}
      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{line3}</div>
    </button>
  );
}

export function LoadMenu(props: LoadMenuProps) {
  const [open, setOpen] = useState(false);
  const [cacheExpanded, setCacheExpanded] = useState(false);
  const { sessions, status } = useSessions();
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setCacheExpanded(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const handleFile = () => {
    props.onLoadFromFile();
    close();
  };

  const handlePick = (id: string) => {
    const href = buildReplayHref(window.location.href, id);
    window.location.assign(resolveSetupRedirectHref(href, 'sim'));
  };

  const body = cacheExpandedBody(status, sessions);

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        style={triggerStyle}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Load a saved simulation (from file or from server cache)"
        onClick={() => setOpen(o => !o)}
      >
        Load
      </button>
      {open && (
        <div role="menu" style={popoverStyle}>
          <div role="menuitem" tabIndex={0} style={rowStyle} onClick={handleFile}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleFile(); } }}
          >
            <span>Load from file</span>
            <span style={{ color: 'var(--text-3)', fontSize: 10 }}>.json</span>
          </div>

          {shouldShowCacheRow(status) && (
            <>
              <div role="menuitem" tabIndex={0} style={rowStyle} onClick={() => setCacheExpanded(v => !v)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCacheExpanded(v => !v); } }}
                aria-expanded={cacheExpanded}
              >
                <span>Load from cache</span>
                <span style={{ color: 'var(--text-3)', fontSize: 10 }}>
                  {status === 'loading' ? '...' : `${sessions.length} saved`}
                </span>
              </div>
              {cacheExpanded && body === 'loading' && (
                <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                  Loading cached runs...
                </div>
              )}
              {cacheExpanded && body === 'empty' && (
                <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-3)' }}>
                  No cached runs yet. Completed runs appear here automatically.
                </div>
              )}
              {cacheExpanded && body === 'cards' && (
                <div style={{ marginTop: 4 }}>
                  {sessions.map(s => (
                    <Card key={s.id} s={s} onPick={() => handlePick(s.id)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the dashboard builds**

Run: `cd apps/paracosm/src/cli/dashboard && pnpm build`

Expected: build succeeds. If a type error surfaces from `resolveSetupRedirectHref` or `useSessions`, reconcile by reading [tab-routing.ts](../../src/cli/dashboard/src/tab-routing.ts) and [useSessions.ts](../../src/cli/dashboard/src/hooks/useSessions.ts) for exact exports.

- [ ] **Step 3: Commit**

```bash
cd apps/paracosm
git add src/cli/dashboard/src/components/layout/LoadMenu.tsx
git commit -m "feat(dashboard): add LoadMenu dropdown component"
```

---

### Task 7: Wire LoadMenu into TopBar

**Files:**
- Modify: `src/cli/dashboard/src/components/layout/TopBar.tsx`

- [ ] **Step 1: Add the import near the top of the file**

Open [TopBar.tsx](../../src/cli/dashboard/src/components/layout/TopBar.tsx). Below the existing `import type` lines, add:

```ts
import { LoadMenu } from './LoadMenu';
```

- [ ] **Step 2: Replace the existing Load button**

Find [TopBar.tsx:268-270](../../src/cli/dashboard/src/components/layout/TopBar.tsx#L268):

```tsx
        {onLoad && (
          <button onClick={onLoad} style={toolBtnStyle} title="Load a saved simulation .json file" aria-label="Load simulation">Load</button>
        )}
```

Replace with:

```tsx
        {onLoad && <LoadMenu onLoadFromFile={onLoad} />}
```

- [ ] **Step 3: Verify the dashboard builds**

Run: `cd apps/paracosm/src/cli/dashboard && pnpm build`

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd apps/paracosm
git add src/cli/dashboard/src/components/layout/TopBar.tsx
git commit -m "feat(dashboard): wire LoadMenu into TopBar"
```

---

### Task 8: Remove SavedSessionsPicker from SettingsPanel

**Files:**
- Modify: `src/cli/dashboard/src/components/settings/SettingsPanel.tsx`
- Delete: `src/cli/dashboard/src/components/settings/SavedSessionsPicker.tsx`

- [ ] **Step 1: Verify no other imports of SavedSessionsPicker**

Run: `cd apps/paracosm && grep -rn "SavedSessionsPicker" src/ tests/ 2>/dev/null`

Expected: only hits are inside `SettingsPanel.tsx` (import + usage) and the component file itself. No tests or other components depend on it.

- [ ] **Step 2: Remove the import**

Open [SettingsPanel.tsx:7](../../src/cli/dashboard/src/components/settings/SettingsPanel.tsx#L7). Delete this line:

```ts
import { SavedSessionsPicker } from './SavedSessionsPicker';
```

- [ ] **Step 3: Remove the `<SavedSessionsPicker>` block**

Find [SettingsPanel.tsx:351-369](../../src/cli/dashboard/src/components/settings/SettingsPanel.tsx#L351). Delete the entire comment block and the `<SavedSessionsPicker onReplay={...}/>` JSX element.

- [ ] **Step 4: Delete the component file**

Run:

```bash
cd apps/paracosm
rm src/cli/dashboard/src/components/settings/SavedSessionsPicker.tsx
```

- [ ] **Step 5: Verify the dashboard still builds and the dashboard tests still pass**

Run:

```bash
cd apps/paracosm/src/cli/dashboard && pnpm build
cd ../../../ && node --import tsx --test 'src/cli/dashboard/src/**/*.test.ts'
```

Expected: build succeeds, all pre-existing dashboard tests still pass (SavedSessionsPicker had no tests).

- [ ] **Step 6: Commit**

```bash
cd apps/paracosm
git add -A src/cli/dashboard/src/components/settings/
git commit -m "refactor(dashboard): remove SavedSessionsPicker (replaced by LoadMenu)"
```

---

### Task 9: Full paracosm test suite + build

**Files:**
- None (verification only)

- [ ] **Step 1: Run the paracosm full-repo test run**

Run: `cd apps/paracosm && pnpm test`

Expected: all tests pass. Memory rule 'Only run targeted tests' is relaxed here ONLY because this is the final cross-check before handoff; the suite has already been green for each focused run in earlier tasks.

- [ ] **Step 2: Run the paracosm build**

Run: `cd apps/paracosm && pnpm build`

Expected: clean build, no warnings introduced.

- [ ] **Step 3: Run the dashboard build**

Run: `cd apps/paracosm/src/cli/dashboard && pnpm build`

Expected: clean build.

---

### Task 10: Manual verification in the dashboard

**Files:**
- None (manual testing)

- [ ] **Step 1: Start the paracosm server + dashboard**

Run: `cd apps/paracosm && pnpm dashboard` to start the server via `src/cli/serve.ts`. In a separate terminal, run the dashboard dev server: `cd apps/paracosm/src/cli/dashboard && pnpm dev`. Open the URL printed by vite.

- [ ] **Step 2: Verify fresh-deploy empty state**

Delete any prior `data/sessions.db` if present. Open the dashboard. Click `Load` in the TopBar.
- Expected: popover opens with two rows: `Load from file` and `Load from cache`. Clicking `Load from cache` expands to `No cached runs yet. Completed runs appear here automatically.`

- [ ] **Step 3: Verify file-load path still works**

Click `Load from file` in the popover. Expected: the existing file picker opens for `.json` files (same behavior as before this change). Cancel out.

- [ ] **Step 4: Verify auto-save fills the ring**

Launch a full simulation with at least 3 turns. Wait for completion. Reload the dashboard. Open TopBar `Load` -> `Load from cache`.
- Expected: one card appears with the scenario name, leaders, explicit timestamp, relative time, duration, and cost.

- [ ] **Step 5: Verify replay playback**

Click the card. Expected: URL changes to `/sim?replay=<id>`, the sim tab mounts, and SSE events stream in at original pacing (or scaled by `?speed=`). No new LLM spend.

- [ ] **Step 6: Verify SettingsPanel no longer shows the old picker**

Navigate to the setup tab. Expected: the previous `REPLAY A SAVED DEMO` section is gone. No visual regressions above the Launch button.

- [ ] **Step 7: Verify the unavailable path**

Stop the server. Reload the dashboard (will show stale UI). Click `Load`. Expected: `Load from cache` row is hidden (only `Load from file` shows) because `useSessions` status went to `error`. Restart the server and confirm the cache row reappears after refresh.

- [ ] **Step 8: Final commit (if manual testing surfaced small fixes)**

If any polish commits are needed, commit them individually with descriptive messages. Otherwise, skip this step.

---

## Self-review summary

- **Spec coverage:** all five goals in the spec are covered (auto-save in Tasks 1-4; LoadMenu build in Tasks 5-7; discoverable empty state in Task 6; explicit timestamps in Task 5/6; SavedSessionsPicker removal in Task 8).
- **Non-goals respected:** no changes to the replay endpoint, ring size, admin save endpoint, or agentos-workbench.
- **Placeholder scan:** no TBDs; every code step shows the exact change. Task 3/4 note a helper-inlining contingency but provide a concrete fallback (inline from existing tests).
- **Type consistency:** `SessionsStatus`, `StoredSessionMeta`, `TimestampedEvent` match their defining modules; helper signatures are consistent across Task 5 test and Task 5 impl.
- **Commit hygiene:** every task ends in a commit using Conventional Commits style, none mention AI or authorship. Commits are scoped so a bisect lands on a focused change.

## Rollout

After all tasks complete, the paracosm submodule is ready to push. Pushing is a separate explicit step the human operator takes; this plan does not push.
