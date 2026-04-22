# F10 — Drag-and-drop file load

**Status:** design, awaiting approval
**Date:** 2026-04-22
**Scope:** dashboard-only. Second spec of the JSON-load UX bundle. Depends on [F9](./2026-04-22-f9-json-load-preview-modal-design.md) landing first (the `useLoadPreview.openFromFile(file)` entry point is the integration seam).

---

## Motivation

Saved-run JSON files are the canonical shareable artifact. Dragging one onto the browser window does nothing today — the LOAD button's file picker is the only entry point. Drag-drop is the zero-discovery-cost way to make the workflow feel native. Users dragging `mars-83events.json` out of Finder / Explorer / a download notification expect the browser to accept it.

F10 layers a global drop zone over the dashboard shell. On drag-over: show an overlay. On drop: hand the file to `useLoadPreview.openFromFile()` (same path as the LOAD button after F9), so the preview modal is still the confirm gate. No silent swallow of current state.

---

## Architecture

**One new hook.** `hooks/useDashboardDropZone.ts` — attaches `dragenter`, `dragover`, `dragleave`, `drop` listeners to `window`, not to a component ref. Window-level because mouse events over the full viewport (including over modals and popovers) should still register — otherwise users drop onto, say, the Event Log panel and nothing happens.

**One new component.** `components/layout/DropZoneOverlay.tsx` — a full-viewport overlay (position: fixed, z-index above everything except the focused-modal layer) that renders only when `isDragging === true`. Shows a central card with the copy "Drop `.json` to load". Pointer-events: none so the overlay never intercepts a real click after the drop resolves.

**State machine.**

```
     ┌────────────┐
     │   idle     │◄──────── dragleave (window root)
     └─────┬──────┘      OR  dragend (user cancels)
           │ dragenter (first file)
           ▼
     ┌────────────┐
     │  dragging  │  overlay visible
     └─────┬──────┘
           │ drop
           ▼
      useLoadPreview.openFromFile(firstFile)
           │
           └──► handoff to F9's state machine (parsing → preview → confirm/cancel)
                DropZone returns to idle immediately
```

`idle` → no overlay. `dragging` → overlay visible. There is no intermediate "parsing" state in F10 — as soon as `drop` fires, F10 hands off to F9 and resets itself.

**Drag counter pattern.** `dragleave` fires on every child element transition, not just the window-exit. The hook tracks a `dragCounter` ref that increments on `dragenter` and decrements on `dragleave`; overlay hides only when counter hits 0. Standard React DnD pattern; prevents the overlay from flickering as the cursor crosses child boundaries.

**`dragover.preventDefault`** is required on every `dragover` event, otherwise the browser's default behaviour (open the file as a page navigation) wins. Hook calls `e.preventDefault()` unconditionally in the `dragover` handler.

**File-type filter.** Only `.json` extensions accepted at drop time. When a non-JSON file is dropped, the hook shows a toast `"Only .json simulation files supported."` and does not open the preview. Extension check matches `useGamePersistence.load()`'s `input.accept = '.json'` logic.

**Multi-file drop.** Take the first file (`files[0]`), ignore the rest, show a toast `"Loaded first of 3 files; ignoring the rest."` when more than one is present. Consistent with the single-preview-at-a-time constraint from F9.

---

## Integration with F9

F10 does NOT own any parse logic. It is a thin event adapter that produces a `File` and hands off. Concretely:

```ts
// F10 hook
import { useLoadPreview } from './useLoadPreview';

export function useDashboardDropZone() {
  const { openFromFile } = useLoadPreview();
  // ...state machine, listeners, counter...
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    if (files.length > 1) toast('info', 'Multi-file drop', `Loaded first of ${files.length}...`);
    const file = files[0];
    if (!file.name.toLowerCase().endsWith('.json')) {
      toast('error', 'Unsupported file', 'Only .json simulation files supported.');
      return;
    }
    openFromFile(file);  // F9 takes over
  };
}
```

Everything downstream — parse, migration, metadata extraction, preview modal, confirm dispatch — is F9's job.

---

## Files

**New.**
- `src/cli/dashboard/src/hooks/useDashboardDropZone.ts` (~80 lines)
- `src/cli/dashboard/src/hooks/useDashboardDropZone.test.ts` (~60 lines)
- `src/cli/dashboard/src/components/layout/DropZoneOverlay.tsx` (~35 lines)
- `src/cli/dashboard/src/components/layout/DropZoneOverlay.module.scss` (~60 lines — keyframe fade-in, backdrop blur, center card styling)

**Modified.**
- `src/cli/dashboard/src/App.tsx` — call `useDashboardDropZone()` once at the shell level, mount `<DropZoneOverlay isActive={...} />` near the other full-screen overlays.

No other files touched. F10 is a pure addition layered on the F9 backbone.

---

## UI spec

Overlay visual:

```
╔═══════════════════════════════════════════╗
║                                           ║
║                                           ║
║        ┌─────────────────────────┐        ║
║        │                         │        ║
║        │    ⬇  Drop to load      │        ║
║        │                         │        ║
║        │    .json simulation     │        ║
║        │                         │        ║
║        └─────────────────────────┘        ║
║                                           ║
║                                           ║
╚═══════════════════════════════════════════╝
  (backdrop: rgba(0,0,0,0.5), blur(4px))
```

- Backdrop: half-opacity black with 4px blur over the existing dashboard
- Center card: ~360×160px, dashed border (2px, accent color), rounded 12px, subtle shadow
- Heading: "Drop to load" (large, bold)
- Sub-copy: ".json simulation" (small, muted)
- Arrow glyph above heading (⬇ or an inline SVG matching the rest of the dashboard's iconography)
- Fade-in animation: 120ms ease-out on enter, 100ms on exit
- Pointer-events: none so clicks never intercept

All styling via SCSS module. CSS custom properties for colors (`--accent`, `--bg-deep`) so theme switches work.

---

## Accessibility

- Overlay has `role="status"` + `aria-live="polite"` so screen readers announce when drag is detected ("Drop zone active. Release to load a simulation file.")
- Keyboard users are unaffected — the LOAD button stays the canonical entry point for them; drag-drop is mouse-only by nature
- Overlay is purely visual decoration; no focusable elements inside it
- `prefers-reduced-motion: reduce` disables the fade-in keyframes (instant show/hide)

---

## Edge cases

| Case | Behaviour |
|---|---|
| Drag from external app, cursor leaves window before drop | `dragleave` on `<body>` → counter decrements → overlay hides. Clean idle. |
| Drag starts inside the window (text selection drag) | `dragenter` still fires. `dataTransfer.types` includes `'Files'` only when a file is dragged; check that to gate the overlay. Text selection drags do NOT show the overlay. |
| Drag + drop onto a modal (e.g., F9's preview modal) | Overlay still shows. Drop hands to `openFromFile`; F9's state machine rejects re-entry while already in `preview` state (documented in F9 spec). Toast: `"Cancel the current preview before loading another file."` |
| Drop a folder | `dataTransfer.files[0]` is the folder placeholder; extension check fails (no `.json` suffix); toast fires. |
| Drop with pointer over the TopBar LOAD button | Same path. LOAD button doesn't intercept drops; drop event bubbles to window. |

---

## Rollout sequence

1. Add hook + overlay component + SCSS module
2. Write the hook test (pure state transitions, no DOM — mock `document.addEventListener`)
3. Mount in `App.tsx`
4. Manual smoke:
   - Drag `.json` from Finder → overlay appears
   - Drop → F9's preview modal appears
   - Cancel F9 preview → back to idle
   - Drag non-JSON → overlay appears (no filetype check during drag), drop → toast fires
   - Drag into and out of the window multiple times → counter stays coherent, overlay toggles correctly
   - Try on Safari (reportedly the most DnD-picky) + Chrome + Firefox

---

## Testing

**Unit.**
- Counter increments on dragenter, decrements on dragleave, overlay flag flips at 0 ↔ 1
- `dataTransfer.types.includes('Files')` false → ignore (text drag)
- Drop with `.json` file → `openFromFile` called exactly once
- Drop with non-JSON → `openFromFile` NOT called, toast fired
- Drop with 3 files → `openFromFile` called with files[0], toast fired once
- Drop with 0 files → no-op

**Manual smoke** covered in Rollout.

---

## Acceptance criteria

- Dragging a `.json` file over the dashboard shows the drop overlay
- Dropping the file flows through F9's preview modal
- Cancelling the preview returns to the normal dashboard state with no events lost
- Non-JSON drops produce a toast and no state change
- Multi-file drops take the first file and show an info toast
- Text-selection drags do not show the overlay
- `prefers-reduced-motion` disables fade animations
- Existing dashboard tests still pass; new hook test passes
- SCSS module for overlay styles (standing rule)
- Works in Chrome + Firefox + Safari (manual)

---

## Out of scope

- **Accepting multiple files simultaneously** (comparison view) — tracked under audit F16, not here
- **Drag-reorder of events, drag-to-add-citation, etc.** — unrelated to load flow
- **Drop zones scoped to specific UI areas** (e.g., drop on the scenario editor to import a scenario JSON) — separate component + separate spec if needed; this spec is global-drop only
- **Ghost-image customization** — browser default `dataTransfer.setDragImage` is fine

---

## Risks + notes

- **Window-level listeners leak across unmounts in StrictMode dev.** Hook uses a ref-stable handler + cleanup in useEffect return. Tested pattern.
- **Chrome dev tools drop-to-inspect.** Chrome with DevTools open captures some drops (e.g., drop onto the DevTools panel). Not a real user scenario.
- **File System Access API** is a separate modern pattern (`showOpenFilePicker`) — not adopted here; drag-drop + classic picker cover the common flows.
