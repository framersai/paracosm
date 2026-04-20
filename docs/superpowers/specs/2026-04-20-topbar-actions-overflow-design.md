---
title: "Phase D: TopBar Actions Overflow"
date: 2026-04-20
status: design — approved
scope: paracosm/src/cli/dashboard/src/components/layout/TopBar.tsx
parent: 2026-04-20-viz-fixes-and-mobile-ux-audit
---

# TopBar Actions Overflow

The TopBar right cluster crowds 9+ interactive elements at mid-laptop widths. Save / Copy / Clear are secondary post-run actions that don't need permanent real estate. Move them behind a single `⋯` menu; keep RUN / LOAD / GITHUB / TOUR / status / theme visible.

## Current right-cluster inventory

Rendered from [TopBar.tsx:203-329](../../../src/cli/dashboard/src/components/layout/TopBar.tsx#L203-L329) in this order:

1. GITHUB star link (always)
2. TOUR button (always, label hidden <1200px)
3. RUN / LAUNCHING chip (only when idle / launching)
4. **Save button** (only when `hasEvents`)
5. **Copy button** (only when `hasEvents`)
6. LoadMenu dropdown (always)
7. **Clear button** (only when `hasEvents`)
8. `|` divider
9. Status pill
10. Theme toggle

## Fix

Save / Copy / Clear become menu items inside a single `⋯` overflow popover. The popover:

- Trigger: a 24×24 button showing `⋯`, positioned where Save currently sits (right of RUN).
- Visible only when `hasEvents` is true (same gating as the 3 individual buttons today).
- Open state: local `useState` in `TopBar.tsx`; close on outside click + on `Escape`.
- Menu items: Save, Copy, Clear (Clear keeps its red text to preserve the existing destructive-action affordance).
- Menu layout: vertical stack of labeled rows, same visual style as the existing LoadMenu dropdown so the two overflow-style menus read as consistent.
- Positioned absolutely, dropped down from the trigger.

## What stays

- RUN button keeps its primary slot (gradient pill).
- LoadMenu stays as-is. It's already a dropdown; doesn't need wrapping.
- GITHUB, TOUR, status, theme — unchanged.
- The `|` divider stays between RUN-cluster and status.

## Keyboard + a11y

- Menu trigger has `aria-haspopup="menu"` + `aria-expanded` reflecting open state.
- Menu items are `<button>` elements inside a `role="menu"` container.
- Escape closes + returns focus to the trigger.
- Tab cycles through menu items while open (the `useFocusTrap` hook from Phase B works here).

## Alternatives considered + rejected

- **Merge into LoadMenu** as "Save / Load / Copy / Clear" under one dropdown. Rejected: LoadMenu's concern is restoring past runs (semantically different from Save-current-run or Clear). Overloading it muddies the LoadMenu name.
- **Hide Save/Copy/Clear on narrow viewports only.** Rejected: current code already progressive-hides some topbar items; adding more hide-rules just pushes "which button is where" mystery onto the user.
- **Kebab menu with icon-only items.** Rejected: text labels fit a vertical dropdown easily; icon-only adds cognitive load for destructive actions (Clear).

## Testing

- Typecheck clean.
- Manual smoke: load a run (so `hasEvents` becomes true), open the `⋯`, click each of Save/Copy/Clear, verify they fire their existing handlers.
- Keyboard: Tab into the trigger, Space to open, arrow/Tab through items, Enter to activate, Escape to close.

No unit tests; this is pure wiring.

## Out of scope

- No changes to the left cluster (logo / PARACOSM / scenario name).
- No changes to the center cluster (turn meta, progress).
- LoadMenu internal behavior untouched.
- No changes to the action handlers themselves (onSave / onCopy / onClear signatures unchanged).
