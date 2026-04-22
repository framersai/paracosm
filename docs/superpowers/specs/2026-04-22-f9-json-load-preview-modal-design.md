# F9 — Preview modal before JSON file load

**Status:** design, awaiting approval
**Date:** 2026-04-22
**Scope:** dashboard-only; no library / runtime / compiler changes. First spec of the JSON-load UX bundle (F9 → F10 → F11 → F12). Each of the four lands on its own commit; this one is the load-flow backbone the other three plug into.

---

## Motivation

Clicking LOAD opens a native file picker, instantly dispatches the file's events into `useSSE.loadEvents`, switches to the Sim tab, and shows a toast. Three problems for users:

1. **No metadata preview.** User has no idea what they're loading until they see the timeline render. A file named `mars-83events.json` could be any scenario, either leader, any turn count, any date.
2. **No undo.** The load path blows away current events and results. If the wrong file was picked, the last un-saved run is gone. The `sse.loadEvents` call replaces `events` + `results` outright; there is no stack behind it.
3. **No schema-version gate.** `useGamePersistence.save()` writes `schemaVersion: 2` but `load()` never reads it. A pre-0.5.0 file loads through `migrateLegacyEventShape` OK today, but a future 0.6.0 file (F23 time-units rename) would load silently corrupt.

F9 fixes problems 1 + 2. F11 layers the schema-version gate on top. F12 layers the scenario-mismatch check on top. F10 adds drag-and-drop as a parallel entry point into the same preview flow.

---

## Architecture

**New component.** `components/layout/LoadPreviewModal.tsx` — a modal dialog rendered at the App shell level, controlled by a single `previewData: PreviewData | null` state. Renders metadata extracted from the chosen file + two actions: **Load** (dispatches to `sse.loadEvents`) and **Cancel** (closes the modal, no side effects). Escape + click-outside also cancel.

**New hook.** `hooks/useLoadPreview.ts` — owns the preview state machine and the file-read pipeline. Consumers get three callables: `openFromFile(file: File)`, `confirm()`, `cancel()`. Internally: parses JSON, runs legacy-shape migration, computes metadata, stashes the parsed `GameData` + metadata, returns a promise that resolves on confirm/cancel.

**Two-stage load flow.**

```
existing:
  LOAD click → file picker → selected → persistence.load()
                                          → parse + migrate
                                          → return GameData
                                        → sse.loadEvents() + switchTab('sim') + toast

proposed (F9):
  LOAD click → file picker → selected → useLoadPreview.openFromFile(file)
                                          → parse + migrate
                                          → compute metadata
                                          → set previewData (modal opens)
                                        → user clicks Load
                                          → useLoadPreview.confirm()
                                            → sse.loadEvents(stashedData) + switchTab('sim') + toast
                                        OR user clicks Cancel / Escape
                                          → useLoadPreview.cancel()
                                            → clear previewData (no side effects)
```

**`useGamePersistence.load()` refactor.** Split its internals:

- `persistence.pickFile()` → `Promise<File | null>`
  Owns the hidden file input + click + change handler. No parsing.
- `persistence.parseFile(file)` → `Promise<GameData | null>`
  Owns the FileReader + JSON.parse + legacy-shape migration. Returns the same `GameData` shape as today.

The existing public `load()` stays for backward compat within the dashboard (callers that want the old fire-and-forget path). Internally it becomes `pickFile()` + `parseFile()` + returned promise. F9 consumers use the split pair directly so they can inject the preview step between pick and apply.

**Metadata extractor.** `hooks/useLoadPreview.helpers.ts::extractPreviewMetadata(data: GameData, file?: { name: string; size: number }) → PreviewMetadata | null`. Pure function living in a sibling `.helpers.ts` file alongside the hook, matching the dashboard's established pattern ([`LoadMenu.helpers.ts`](../../src/cli/dashboard/src/components/layout/LoadMenu.helpers.ts)). The `.helpers.ts` file is free of React / DOM imports so it runs under `node:test` without a shim. Returns `null` when `data.events` is missing / empty. Computes:

| Field | Source | Example |
|---|---|---|
| `scenarioName` | `data.events[0]?.data?.scenario?.name` \|\| `data.config?.scenario?.shortName` | "Mars Genesis" |
| `schemaVersion` | `data.schemaVersion` \|\| `'legacy (pre-0.5.0)'` | `2` |
| `leaderNames` | `Array.from(new Set(data.events.flatMap(e => e.leader ? [e.leader] : [])))` | `["Aria Chen", "Vik Voss"]` |
| `turnCount` | `max(events.map(e => e.data?.turn ?? 0))` | `6` |
| `eventCount` | `data.events.length` | `83` |
| `startedAt` | `data.startedAt` (ISO string → `toLocaleString`) | "2026-04-21 14:32" |
| `hasVerdict` | `data.verdict !== null && data.verdict !== undefined` | `true` |
| `fileName` | the `File.name` passed in | `"mars-83events.json"` |
| `fileSize` | `File.size` formatted (KB/MB) | `"142 KB"` |

`extractPreviewMetadata` is pure + stable → easy to unit-test via `node:test` without DOM.

**Overwrite warning.** When `sse.events.length > 0 && !replaySessionId` (where `replaySessionId` comes from `useReplaySessionId()` — the URL `?replay=<id>` param), the modal's confirm button label becomes "**Replace current simulation**" (orange) with sub-copy "`This will replace the 24-event run you're viewing.`". When the current state is empty or in replay mode, the button is "**Load**" (green). No second modal; the color + copy shift is the signal.

**Scope clarification — file-load only.** F9 intercepts ONLY the file-picker path (`handleLoad` in App + `onLoadFromFile` in LoadMenu). The LoadMenu cache/replay cards trigger `/sim?replay=<id>` via `window.location.assign` at [`LoadMenu.tsx:120-123`](../../src/cli/dashboard/src/components/layout/LoadMenu.tsx#L120-L123), which is a full page navigation rather than an in-memory dispatch. Adding a preview step to that navigation flow requires different plumbing (preview the session meta, then navigate on confirm) and is out of scope for F9. Tracked as follow-up.

---

## Data shape additions

`useGamePersistence.save()` already writes enough for the preview. F9 does NOT change the saved-file format. One opportunistic addition for richer previews, gated to "when available":

- `GameData.scenario?: { id: string; version: string; shortName: string }`
  Written on save (from the current `scenario` prop), read on load for display + for F12's mismatch check. Older saves without this field: preview falls back to the first-event scenario inference as today. No break.

The write is additive. F11's schema-version gate will bump `schemaVersion: 2 → 3` when `scenario` is required; for F9 alone it's optional.

---

## Files

**New.**
- `src/cli/dashboard/src/components/layout/LoadPreviewModal.tsx` + `LoadPreviewModal.module.scss` (~120 + ~80 lines)
- `src/cli/dashboard/src/hooks/useLoadPreview.ts` (~100 lines — hook only; state transitions + callbacks)
- `src/cli/dashboard/src/hooks/useLoadPreview.helpers.ts` (~80 lines — pure `extractPreviewMetadata` + formatting helpers)
- `src/cli/dashboard/src/hooks/useLoadPreview.helpers.test.ts` (~80 lines; tests extractPreviewMetadata on canonical, legacy, empty fixtures)

**Modified.**
- `src/cli/dashboard/src/hooks/useGamePersistence.ts` — split `load()` internals into `pickFile()` + `parseFile()` + retain a back-compat `load()` that composes them. Also extend `save()` to include the optional `scenario` field in the output JSON.
- `src/cli/dashboard/src/App.tsx` — replace `handleLoad` body with `useLoadPreview.openFromFile()` entry; mount `<LoadPreviewModal />` next to the other modals; plumb the confirm callback into `sse.loadEvents` + `setActiveTab('sim')`.

**NOT modified in F9.**
- `src/cli/dashboard/src/components/layout/LoadMenu.tsx` — cache + replay card handlers stay as today (URL-based navigation). Preview flow for those paths is separate scope.

**Tests.**
- Add `useLoadPreview.helpers.test.ts` covering: metadata extraction from canonical fixture, legacy file fixture, empty file handling, malformed JSON handling.
- No component-level test; the dashboard does not use a test-library (per standing `useRetryStats.test.ts` / `useGameState.test.ts` pattern). Verify modal + wiring via manual smoke.

---

## UI spec

Modal layout, top to bottom:

```
╭────────────────────────────────────────╮
│  Load simulation                   [✕] │
│                                        │
│  mars-83events.json                    │
│  142 KB · saved 2026-04-21 14:32       │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ Scenario    Mars Genesis         │  │
│  │ Leaders     Aria Chen · Vik Voss │  │
│  │ Turns       6                    │  │
│  │ Events      83                   │  │
│  │ Schema      v2                   │  │
│  │ Verdict     yes                  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ⚠  This will replace the 24-event     │
│      run you're viewing.               │
│                                        │
│  [ Cancel ]      [ Replace current sim ]│
╰────────────────────────────────────────╯
```

Styling hooks via SCSS module (per the F4 / no-inline-styles rule). Focus-trapped on open, closes on Escape / backdrop click / Cancel click. The confirm button is the default-focused element so Enter loads immediately.

The warning row (⚠) only renders when `sse.events.length > 0 && !replaySessionId`. In the no-current-state case (or when replay is active) the row is absent and the button text is "Load".

---

## State machine

```
      ┌────────────┐
      │   idle     │◄──────────────┐
      └─────┬──────┘               │
            │ openFromFile(f)      │
            ▼                      │
      ┌────────────┐                │
      │  parsing   │ error → toast ─┤
      └─────┬──────┘                │
            │ parsed OK             │
            ▼                       │
      ┌────────────┐                │
      │  preview   │────── cancel ──┤
      └─────┬──────┘                │
            │ confirm               │
            ▼                       │
      ┌────────────┐                │
      │ dispatching│────── done ────┘
      └────────────┘
```

`idle` means no modal. `parsing` means reader in flight (brief; usually <50ms). `preview` means modal open. `dispatching` means confirm clicked, `sse.loadEvents` in flight (one tick, effectively instant but represents the race-free window before `idle`).

Implementation: single `state` discriminated union in the hook, reducer-like setter for transitions. Tests assert that calling `openFromFile` while `state === 'preview'` is rejected (no concurrent preview).

---

## Error handling

| Failure | Current behaviour | F9 behaviour |
|---|---|---|
| User picks non-JSON file | Toast `"No valid game data"` | Same toast — `parseFile` returns null, never enters `preview` |
| JSON parses but `events[]` is empty | Toast `"No valid game data"` | Same |
| JSON parses but has unknown top-level fields | Silently loaded | Same — tolerant-load preserved. F11 adds the schema-version gate layered on top. |
| FileReader throws (permissions, corrupt file) | Toast caught the throw | Same — `parseFile` catches, returns null, toast surfaces |

F9 does not add new error cases. F11 adds the schema-version-too-new case in its own spec.

---

## Accessibility

- `role="dialog"`, `aria-labelledby` → heading `"Load simulation"`, `aria-describedby` → metadata table caption
- Focus trap via existing `useFocusTrap` hook — Modal owns its own ref per the standing F5 rule
- Escape closes → Cancel path
- Tab order: close (✕), then metadata rows (scroll only, not focusable), then Cancel, then Confirm
- `aria-live="polite"` announcement when metadata is ready (helps screen readers know the dialog is populated before the focus lands on the confirm button)

---

## Rollout sequence

Single commit on master. Order within the commit:

1. Add `LoadPreviewModal.tsx` + `.module.scss` + `useLoadPreview.ts` + test file. Ship the hook + component in isolation first; tests pass before the component is mounted.
2. Split `useGamePersistence.load()` into `pickFile` + `parseFile`; keep back-compat `load()` that calls both.
3. Wire `<LoadPreviewModal>` into `App.tsx` next to the other modals; replace `handleLoad` body with the hook's `openFromFile`.
4. Wire `LoadMenu.tsx` cache + replay card handlers through the hook's `openFromCache` / `openFromReplay`.
5. Extend `save()` to include the optional `scenario` field (opportunistic, no bump of schemaVersion).
6. Unit tests pass; manual smoke: pick a file, preview renders, confirm works, cancel works, Escape works, backdrop click works, warning row renders when state has events, hidden when state is empty.

No breaking changes. Old saved files load with fallback preview (scenario name from events, schema "legacy").

---

## Testing

**Unit (node:test).**
- `extractPreviewMetadata(canonicalFixture)` → matches the expected metadata object
- `extractPreviewMetadata(emptyEventsFixture)` → returns `null`
- `extractPreviewMetadata(legacyPre05Fixture)` → returns fallback metadata with `schemaVersion === 'legacy (pre-0.5.0)'` and a scenarioName derived from events
- State-machine transitions: `openFromFile` from each state yields expected next state

**Manual smoke.**
- Load a current-version file → preview renders, confirm dispatches, timeline renders
- Load a pre-0.5.0 file → preview renders with "legacy" schema badge, confirm dispatches, migration still runs
- Load a non-JSON file → toast fires, no modal
- Load while current sim has events → warning row visible, button copy correct
- Load while replay is active → warning row hidden (per `!sse.isReplay` gate)

---

## Acceptance criteria

- LOAD click opens a file picker; after file selection, the preview modal renders before any state mutation
- Modal shows: scenario name, leader names, turn + event counts, schema version, date, verdict presence, file size, file name
- Confirm dispatches events + switches to Sim tab + fires the existing "Loaded N events" toast
- Cancel / Escape / backdrop click closes the modal without dispatching
- Warning row visible only when current state has events and replay is not active (no `?replay=<id>` URL param)
- LoadMenu's "Load from file" row opens the same preview modal (file-picker flow goes through the hook)
- `useLoadPreview.helpers.test.ts` passes 100%
- Existing 77/77 dashboard tests still pass
- No inline styles; SCSS module used per standing rule
- `npx tsc --noEmit -p tsconfig.json` clean

---

## Out of scope (deferred to later specs)

- **F10 drag-and-drop.** Parallel entry point into `useLoadPreview.openFromFile`; covered separately.
- **F11 schema-version gate.** Layered in `parseFile`; covered separately.
- **F12 scenario-mismatch warning.** Layered in the preview metadata + modal copy; covered separately.
- **Preview of the actual timeline** (mini-scrubber, graph thumbnail). Not in this spec; "show metadata only" is enough to decide.
- **Undo stack** beyond the confirm/cancel modal. Full undo (replace current → undo) is a different feature, out of scope here.

---

## Risks + notes

- **File pickers that return wrong mime type.** Safari on macOS sometimes hands over `application/octet-stream` instead of `application/json`. Current `input.accept = '.json'` filters by extension — keep that, ignore mime.
- **Large files (50 MB+ saves).** FileReader + JSON.parse are synchronous on the main thread. Current load is too. F9 preview doesn't add cost; deferring the spend to after confirm isn't worth it.
- **LoadMenu popover stays as-is in F9.** Cache + replay cards continue to navigate via URL; file-picker row continues to call `onLoadFromFile` which now routes through the hook. The popover auto-closes on its own click-outside logic when the modal opens.
