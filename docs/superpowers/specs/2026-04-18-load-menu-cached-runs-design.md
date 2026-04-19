---
title: "Paracosm Load Menu + Cached Runs Surfacing"
date: 2026-04-18
status: design, execution-ready
scope: paracosm dashboard (TopBar, SettingsPanel) + paracosm server auto-save hook
---

# Paracosm Load Menu + Cached Runs Surfacing

The server-side "last 10 runs" ring buffer at [session-store.ts](../../../src/cli/session-store.ts) already works. The [SavedSessionsPicker](../../../src/cli/dashboard/src/components/settings/SavedSessionsPicker.tsx) already renders its entries. The gap is twofold: the ring only fills when an admin hits `POST /admin/sessions/save`, so it stays empty on fresh deploys, and the picker only mounts inside SettingsPanel, never from the TopBar `Load` button. Users who exhaust their credits see no cached runs to fall back on.

This spec closes both loops. It adds auto-save on clean completion, and folds cached runs into the TopBar `Load` button as a single dropdown affordance.

## Problem

1. **Ring never fills from organic use.** [server-app.ts:1121-1158](../../../src/cli/server-app.ts#L1121-L1158) only writes to the ring via `POST /admin/sessions/save`, gated by `ADMIN_WRITE=1`. Normal completed runs are discarded after their SSE stream ends.
2. **TopBar `Load` button only loads from local file.** [TopBar.tsx:268-269](../../../src/cli/dashboard/src/components/layout/TopBar.tsx#L268-L269) binds `onLoad` to [useGamePersistence.load](../../../src/cli/dashboard/src/hooks/useGamePersistence.ts) which opens an `<input type="file">` picker. It has no awareness of the server ring.
3. **Cached runs live in the wrong place.** `SavedSessionsPicker` is mounted above the Launch button in [SettingsPanel.tsx:360-369](../../../src/cli/dashboard/src/components/settings/SettingsPanel.tsx#L360-L369), hidden entirely when the list is empty, and invisible from the sim view. If a user is watching a completed run and wants to pick a prior one, there is no path.
4. **Timestamps are relative only.** `formatRelative` in `SavedSessionsPicker` renders `3h ago`. Users browsing a fallback library benefit from explicit dates too.

## Goals

1. Auto-save every cleanly completed run to the server ring. Admin save endpoint stays as-is.
2. Replace the TopBar `Load` button with a dropdown offering two paths: `Load from file` (existing) and `Load from cache` (new card grid of the last N ring entries).
3. Make the cache section discoverable even when empty (hint line), and resilient when the server ring is unavailable (cache section hides, file option remains).
4. Card entries show explicit timestamp alongside relative, leaders, turns, duration, cost.
5. Remove the duplicate `SavedSessionsPicker` mount in SettingsPanel and delete the component file, since the new dropdown is the single canonical entry point.

## Non-Goals

- Changes to the replay SSE endpoint or pacing logic. Playback remains the existing `GET /sessions/:id/replay?speed=N`.
- Changes to the ring size (default 10 unchanged).
- Any user-facing "save this run" control. Saves happen automatically on the server, transparent to the user.
- Cross-scenario cache filtering or search. The last N shown newest-first is sufficient.
- Agentos-workbench changes. Scope is paracosm only.

## Architecture

### Server change: auto-save on completion

File: [src/cli/server-app.ts](../../../src/cli/server-app.ts)

The server already maintains `eventBuffer: string[]` and `eventTimestamps: number[]` that the admin endpoint reads. Add a completion hook inside the broadcast function that fires when an `event: complete` SSE frame passes through.

No replay guard is needed. The replay endpoint at [server-app.ts:1177-1220](../../../src/cli/server-app.ts#L1177-L1220) writes SSE frames directly to the response and never calls `broadcast()` or touches `eventBuffer`. Any `complete` frame seen by the broadcast function is by definition from a live run.

Auto-save conditions (all must hold):

- `sessionStore != null`
- The incoming SSE frame starts with `event: complete\n`
- `currentRunAborted === false`
- `currentRunSaved === false` (prevents double-save within one run)
- `eventBuffer.length >= 1`
- Turn count derived from the buffer is at least `AUTO_SAVE_MIN_TURNS = 3` (count of `event: turn_done` frames, matching how `session-store.deriveMetadata` derives `turnCount`)

When all hold, call `sessionStore.saveSession(events)` with the same `TimestampedEvent[]` shape the admin endpoint assembles, then set `currentRunSaved = true`.

Errors during auto-save log a warning and do not surface to the client. The run completion itself must not fail because of a cache write error.

Tracking flags live next to `eventBuffer`:

- `currentRunAborted: boolean` set `true` when a `sim_aborted` frame is broadcast.
- `currentRunSaved: boolean` set `true` after a successful auto-save.

Both flags reset inside `clearEventBuffer()` at [server-app.ts:385-395](../../../src/cli/server-app.ts#L385-L395), which is the existing run-boundary function (called on `/clear` and on new run setup). This gives a single source of truth for "new run starts here".

### Client change: LoadMenu component

New file: `src/cli/dashboard/src/components/layout/LoadMenu.tsx`

Single exported `LoadMenu` component. Props:

```ts
interface LoadMenuProps {
  /** Called when the user picks "Load from file". */
  onLoadFromFile: () => void;
}
```

Structure:

- Trigger button using the existing `toolBtnStyle` from TopBar. Label: `Load`. `aria-haspopup="menu"`, `aria-expanded` reflects open state.
- Popover (absolutely positioned, anchored under button). Closes on outside click, `Esc`, or after selection.
- Row 1: `Load from file` -> calls `onLoadFromFile()` and closes.
- Row 2: `Load from cache` -> expands inline into a cache section showing the card grid.

Data: `const { sessions, status } = useSessions()`. Status mapping:

- `loading`: show muted "Loading cached runs..." row (cache section only, file row still usable).
- `unavailable`: hide the `Load from cache` row entirely. Only `Load from file` renders.
- `error`: hide the `Load from cache` row entirely.
- `ready` with 0 entries: show `Load from cache` row, but when expanded, show a single hint: `No cached runs yet. Completed runs appear here automatically.`
- `ready` with N entries: card grid of all N, newest first.

Card click: navigate to `/sim?replay=<id>` using the same `resolveSetupRedirectHref(url.toString(), 'sim')` pattern from `SavedSessionsPicker.onReplay`. Closes the popover.

Keyboard: `Tab` moves through rows and cards. `Enter`/`Space` activates. `Esc` closes the popover.

### Card shape

Three lines, vertical stack. Styling uses existing tokens (`--bg-panel`, `--bg-canvas`, `--border`, `--text-1`, `--text-2`, `--text-3`, `--amber`, `--mono`).

```
┌─────────────────────────────────────────────┐
│  Mars First Colony                          │  line 1: scenario name, bold
│  The Visionary vs The Engineer · 16 turns   │  line 2: leaders + turns
│  Apr 18 · 14:32 (2h ago) · 3m 40s · $0.14   │  line 3: mono, muted
└─────────────────────────────────────────────┘
```

Timestamp formatter: `formatExplicit(ts: number): string` new helper colocated with `formatRelative`, returns `MMM D · HH:mm` in the viewer's local timezone. Relative stays in parentheses alongside.

Grid: two columns on widths >= 640px, one column below. Fixed popover width `min(520px, calc(100vw - 32px))`. Scrolls vertically when the list exceeds six rows of cards.

### Wiring in TopBar

Replace the existing `Load` button in [TopBar.tsx:268-269](../../../src/cli/dashboard/src/components/layout/TopBar.tsx#L268-L269) with:

```tsx
{onLoad && <LoadMenu onLoadFromFile={onLoad} />}
```

TopBar keeps its `onLoad` prop and pass-through. The prop name stays (no breaking change to [App.tsx:540](../../../src/cli/dashboard/src/App.tsx#L540)).

### Removed surface

- Delete the `<SavedSessionsPicker onReplay={...}>` block in [SettingsPanel.tsx:360-369](../../../src/cli/dashboard/src/components/settings/SettingsPanel.tsx#L360-L369).
- Delete the import at [SettingsPanel.tsx:7](../../../src/cli/dashboard/src/components/settings/SettingsPanel.tsx#L7).
- Delete the file `src/cli/dashboard/src/components/settings/SavedSessionsPicker.tsx`. No other consumers (verified via grep).
- The `useSessions` hook is retained. Now consumed by `LoadMenu`.

### Unchanged

- `session-store.ts` schema, ring size, `saveSession`/`listSessions`/`getSession` API
- `GET /sessions`, `GET /sessions/:id/replay`, `POST /admin/sessions/save`
- `useReplaySessionId`, `useSSE`, and the `?replay=<id>` query contract
- `useGamePersistence` file load/save behavior

## Testing

Server ([tests/cli/server-app.test.ts](../../../tests/cli/server-app.test.ts)):

- A completed run with >= 3 turns auto-persists. Assert `sessionStore.count()` increments by 1.
- An aborted run does not auto-persist (emit `sim_aborted` before `complete`).
- A run shorter than `AUTO_SAVE_MIN_TURNS` does not auto-persist.
- Auto-save fires at most once per run: emitting `complete` twice in one buffer cycle results in one saved row.
- `clearEventBuffer()` resets `currentRunAborted` and `currentRunSaved` so the next run can save.
- Existing admin save path still works unchanged.
- Errors inside `sessionStore.saveSession` do not throw out of the broadcast function (mock the store to throw, assert broadcast completes).

Client:

Paracosm's dashboard tests run via `node:test` (see [useRetryStats.test.ts](../../../src/cli/dashboard/src/hooks/useRetryStats.test.ts)). React Testing Library is not wired up. The LoadMenu component is therefore tested by extracting pure helpers that drive render decisions:

- `LoadMenu.helpers.ts` [NEW] exports: `formatExplicit(ts: number): string`, `shouldShowCacheRow(status: SessionsStatus): boolean`, `cacheExpandedBody(status: SessionsStatus, sessions: StoredSessionMeta[]): 'loading' | 'empty' | 'cards'`, `buildReplayHref(base: string, id: string): string`.
- `LoadMenu.helpers.test.ts` [NEW] covers each helper: timestamp formatting for a known epoch; cache-row visibility across all four statuses; expanded-body branch across statuses; replay href construction includes `?replay=<id>` and lands on the sim tab.
- Integration of the helpers with React state (popover open/close, focus management) is verified manually in the dashboard after the change. The manual verification steps are listed in the plan's final task.

## Risks

- **Ring growth mid-run.** Auto-save fires on `complete`, so a long-running sim does not repeatedly write. Eviction happens only when a save pushes count past 10. No risk of churn.
- **Replay-of-replay loop.** Not possible: the replay endpoint streams directly to the response and bypasses `broadcast()` and `eventBuffer`, so no auto-save can be triggered by a replay.
- **503 masking.** If the ring ever fails to open (disk full, permissions), the UI hides the cache row rather than showing a broken option. Users still have file load. Server logs the open failure at startup.
- **Pre-existing short runs already in the ring.** Auto-save's min-turn floor applies to new writes only. Existing ring entries from admin saves render normally, regardless of turn count.

## Rollout

One commit, one push. No feature flag. The auto-save path is additive and the client surface is a pure UI replacement. The admin endpoint and existing `?replay=` query contract are unchanged, so nothing else in the dashboard or any external consumer breaks.
