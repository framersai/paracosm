# F14 — Client-side local history ring

**Status:** design, awaiting approval
**Date:** 2026-04-22
**Scope:** dashboard-only. Independent of F9's `useLoadPreview` — history-card restores dispatch events directly via `sse.loadEvents` and gate destructive overwrites with a native `confirm()` dialog, matching the `handleClear` pattern in App.tsx.

---

## Motivation

`useGamePersistence.cacheEvents` writes one `<scenario>-game-data` key in localStorage. `restoreFromCache` reads that same key. A user who runs three sims in a session keeps only the third — the first two are gone the moment the third starts caching.

Server-side session ring (`/sessions`) holds N completed runs (currently 10) but only applies when the dashboard talks to a server that has session storage wired. The local-dev + static-host paths don't benefit.

F14 replaces the single localStorage slot with a **ring of N entries** (default 5) keyed by timestamp. Cache-write pushes a new entry, evicting the oldest when full. Restore returns the most recent entry. LoadMenu grows a "Local history" section that lists the ring entries alongside the existing server-side cache section, so users can click back to an earlier run in the same browser without re-running it.

---

## Data model

```ts
interface LocalHistoryEntry {
  /** Stable identifier for the entry (timestamp ms). Used as the
   *  localStorage key suffix and for delete/click operations. */
  id: number;
  /** ISO timestamp the run was cached. Displayed as "5m ago" etc. */
  createdAt: string;
  /** Events as they landed on the SSE stream at cache-write time. */
  events: SimEvent[];
  /** Full results[] from the SSE run (usually 2 entries for an A/B run). */
  results: unknown[];
  /** End-of-sim verdict when present. */
  verdict?: Record<string, unknown> | null;
  /** Scenario short-name the run belonged to, so the ring can be
   *  filtered per-scenario in the UI. */
  scenarioShortName: string;
  /** Summary shape derived from events; cached at write time to avoid
   *  re-scanning for every LoadMenu render. */
  summary: {
    leaderNames: string[];
    turnCount: number;
    eventCount: number;
    /** Total cost USD when the `_cost` payload is present on events. */
    totalCostUSD?: number;
  };
}
```

**Storage layout.** One JSON-encoded array under a single key `paracosm-local-history-v1`, ordered newest-first. Shared across scenarios (the `scenarioShortName` field lets the UI filter). Cap: default 5 entries; trimmed on push. Size guard: if the total blob exceeds 4 MB, oldest entries drop until under the cap.

**Migration from pre-F14.** On first mount after upgrade:
1. Read the legacy `<scenario>-game-data` key
2. If present + not empty → synthesize a `LocalHistoryEntry` + prepend to the ring
3. Delete the legacy key (one-time migration, idempotent on subsequent mounts since the key is gone)

---

## Architecture

### Pure helpers — `hooks/useLocalHistory.helpers.ts`

- `readHistory(storage: StorageLike) → LocalHistoryEntry[]` — parses the ring, returns `[]` on missing / malformed JSON
- `writeHistory(storage: StorageLike, entries: LocalHistoryEntry[]) → void` — serializes + writes
- `pushHistoryEntry(entries: LocalHistoryEntry[], newEntry: LocalHistoryEntry, maxSize: number) → LocalHistoryEntry[]` — prepends + trims + returns new array (pure)
- `deleteHistoryEntry(entries: LocalHistoryEntry[], id: number) → LocalHistoryEntry[]` — filters out by id
- `summarizeEvents(events: SimEvent[], results: unknown[]) → LocalHistoryEntry['summary']` — computes leader names, turn count, event count, total cost from events (pure)
- `migrateLegacySlot(raw: unknown, scenarioShortName: string) → LocalHistoryEntry | null` — converts an old single-slot payload into a ring entry

`StorageLike` is a minimal interface (`getItem`, `setItem`, `removeItem`) so tests pass a plain `Map`-backed shim without a DOM.

### Hook — `hooks/useLocalHistory.ts`

Thin React wrapper. Exposes:

```ts
interface UseLocalHistoryApi {
  entries: LocalHistoryEntry[];        // snapshot, updated on writes
  push(entry: Omit<LocalHistoryEntry, 'id' | 'createdAt' | 'summary'>): void;
  remove(id: number): void;
  clear(): void;
  /**
   * Restore a specific entry back to the SSE state — takes the
   * consumer's loadEvents callback. Separate from `push` / `remove`
   * so the hook stays storage-focused.
   */
  restore(entry: LocalHistoryEntry, loadEvents: LoadEventsFn): void;
}
```

Internal state is a `React.useState<LocalHistoryEntry[]>` initialized from `readHistory`; mutations call `writeHistory` + `setState` so a single render serves fresh data. `useEffect` listens for `storage` events so concurrent tabs see each other's pushes (optional but cheap).

### useGamePersistence refactor

- `cacheEvents` now delegates to `useLocalHistory.push` instead of writing to the single slot.
- `restoreFromCache` reads `entries[0]` (newest) — behaviour-preserving for the auto-restore-on-mount flow.
- The legacy `<scenario>-game-data` key is deleted after the first successful migration push.

### LoadMenu integration

New third section under the existing "Load from file" + "Load from cache" rows:

```
┌──────────────────────────────┐
│ Load from file ▸             │
│ Load from cache (4 saved)  ▼ │
│   ... server-side cards ...  │
│ Local history (3 recent)   ▼ │
│   ┌──────────────────┐       │
│   │ Run title · 2h ago│       │
│   │ Aria vs Vik · 6t  │       │
│   │ $0.12             │ [✕]   │
│   └──────────────────┘       │
│   [clear local history]      │
└──────────────────────────────┘
```

Each card click → call `restore(entry, sse.loadEvents)` which dispatches the cached events directly via `sse.loadEvents(events, results, verdict)` + switches to Sim tab + fires an info toast. No preview modal: the user explicitly picked a named entry with visible summary metadata already in the card, so a second confirmation would add friction. File loads still go through the preview modal because files carry less metadata up-front + come from uncertain sources.

**Overwrite guardrail.** When the current SSE state has events (i.e. a live or recent run), clicking a history card fires a native `confirm()` dialog: "Replace current simulation with this history entry?". Native confirm is the established pattern for this kind of low-frequency destructive action (matches `handleClear` in App.tsx).

---

## Files

**New.**
- `src/cli/dashboard/src/hooks/useLocalHistory.helpers.ts` (~140 lines; pure ring ops + summarizer)
- `src/cli/dashboard/src/hooks/useLocalHistory.helpers.test.ts` (~120 lines; ring push/delete/cap, summarize, migrate legacy)
- `src/cli/dashboard/src/hooks/useLocalHistory.ts` (~80 lines; React wrapper)

**Modified.**
- `src/cli/dashboard/src/hooks/useGamePersistence.ts` — `cacheEvents` delegates to the ring hook; `restoreFromCache` reads `entries[0]`; legacy-slot migration runs once per mount.
- `src/cli/dashboard/src/components/layout/LoadMenu.tsx` — new third section rendering ring entries; delete-per-card + clear-all controls; native `confirm()` on destructive restore.
- `src/cli/dashboard/src/components/layout/LoadMenu.module.scss` — history section variant (reuses most card styles).
- `src/cli/dashboard/src/App.tsx` — instantiate `useLocalHistory`; thread into LoadMenu as a prop; wire restore callback.

---


## Rollout sequence

1. RED: ring helper tests (push / delete / cap enforcement, summarize, migrate legacy)
2. GREEN: helpers
3. `useLocalHistory` hook + migration flow
4. Wire `useGamePersistence.cacheEvents` → ring push
5. LoadMenu "Local history" section + handlers + native-confirm on destructive restore
6. Manual smoke: run three sims in one session, verify LoadMenu shows three history cards, click one → confirm dialog → events restored
7. CodeRabbit review

---

## Testing

**Unit: ring operations**
- `pushHistoryEntry` with empty ring → single entry
- `pushHistoryEntry` with max=3 full ring → oldest evicted
- `pushHistoryEntry` preserves order (newest-first)
- `deleteHistoryEntry` removes by id, preserves others
- `deleteHistoryEntry` with missing id is a no-op

**Unit: summarize**
- Events with `_cost.totalCostUSD` → summary cost populated
- Events without cost → summary cost undefined
- Leader-name dedup + turn-max tracking same as F9's `extractPreviewMetadata`

**Unit: migrateLegacySlot**
- Valid legacy payload → ring entry with `createdAt` from payload's `startedAt`, id from timestamp
- Malformed legacy payload → null
- Empty events → null

**Unit: readHistory / writeHistory**
- Read on empty storage → `[]`
- Read after write → same array
- Read on malformed JSON → `[]`
- Write after trimming maintains cap

**Manual smoke**
- Clear all localStorage → dashboard renders no history section entries
- Run one sim → ring has 1 entry, LoadMenu shows 1 card
- Run five more sims → ring has 5 entries (oldest evicted), LoadMenu shows 5 cards
- Click oldest card → (if live state has events) native confirm dialog → events restored
- Delete middle card → ring shows 4, card disappears from menu
- Clear all → ring empty, section disappears or shows empty state

---

## Acceptance criteria

- Ring holds up to 5 entries newest-first; older entries evicted on push
- Migration from legacy single-slot runs transparently on first mount post-upgrade
- Restore-on-mount behavior unchanged (still loads the newest entry)
- LoadMenu's "Local history" section renders ring entries with summary metadata + delete controls
- Card click → native confirm (only when live state has events) → entry restored via sse.loadEvents
- Clear-all empties the ring
- 135 existing dashboard tests still pass; new helper tests pass
- CodeRabbit review surfaces zero findings
- No inline styles; SCSS module reused / extended

---

## Out of scope (deferred)

- **Comparison view** across history entries (F16-adjacent) — F14 only adds the data layer + navigator. Side-by-side diff is its own feature.
- **Cross-device sync.** Ring is browser-local; no cloud sync. Server-side sessions already cover that axis for hosted deployments.
- **Scenario filter toggle.** All-scenarios-at-once is the default render; adding a per-scenario filter is polish.
- **Unlimited ring.** Cap is 5 by default; user-configurable cap is a later polish (exposed via a settings toggle).

---

## Risks + notes

- **localStorage 5 MB cap.** With 5 entries of ~500 KB each, a busy ring can push against browser quotas. The 4 MB blob-size guard protects against this by evicting before we hit the hard limit.
- **Serialization cost.** Writing a 2 MB ring JSON on every turn is wasteful. Mitigation: only push on `completed` / `aborted` events, not mid-run. Matches the current cacheEvents trigger timing.
- **Concurrent tab writes.** Two tabs pushing to the ring simultaneously can clobber each other. Mitigation: storage-event listener + re-read before push. Best-effort; full atomicity would need a lock we don't have.
- **Scenario switch.** Current mount-time restore reads `<scenario>-game-data` (scenario-scoped). Ring is cross-scenario; restoring the newest entry could hand a different scenario's events to the current dashboard. Mitigation: filter ring by `scenarioShortName` in restore-on-mount. Cross-scenario entries still visible in LoadMenu's history section (clearly labeled).
