# TopBar Actions Overflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. No subagents per project rules.

**Goal:** Collapse Save / Copy / Clear into a single `⋯` overflow menu in the TopBar.

**Architecture:** Add local `useState` for menu open/close + inline dropdown. Reuse the `useFocusTrap` hook from Phase B. Zero new files; single-component change.

**Tech Stack:** React 19, TypeScript 5.7, Vite 6.

**Spec:** [docs/superpowers/specs/2026-04-20-topbar-actions-overflow-design.md](../specs/2026-04-20-topbar-actions-overflow-design.md)

---

## Task 1: Add overflow-menu component inline in TopBar

**Files:**
- Modify: `src/cli/dashboard/src/components/layout/TopBar.tsx`

- [ ] **Step 1: Add import for focus-trap hook**

At the top of `TopBar.tsx`, after the existing `LoadMenu` import (around line 5), add:

```tsx
import { useState, useEffect, useRef } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
```

(`useState`/`useEffect`/`useRef` may already be imported indirectly via React; verify first. If they are not explicitly imported in TopBar.tsx, add the line above. If React is the only import, add both lines as shown.)

- [ ] **Step 2: Add state + effect for the overflow menu**

Inside the `TopBar` function body, after the `hasEvents` line (around line 65), add:

```tsx
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRootRef = useRef<HTMLDivElement | null>(null);
  const overflowMenuRef = useFocusTrap<HTMLDivElement>(overflowOpen);

  useEffect(() => {
    if (!overflowOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOverflowOpen(false);
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      const root = overflowRootRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) setOverflowOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [overflowOpen]);
```

- [ ] **Step 3: Replace Save / Copy / Clear buttons with overflow trigger + menu**

In the TopBar JSX right cluster, find this block (current code around lines 296-305):

```tsx
        {/* Save/Load/Clear */}
        {hasEvents && onSave && (
          <button onClick={onSave} style={toolBtnStyle} title="Export simulation data as .json" aria-label="Save simulation">Save</button>
        )}
        {hasEvents && onCopy && (
          <button onClick={onCopy} style={toolBtnStyle} title="Copy simulation summary to clipboard" aria-label="Copy summary">Copy</button>
        )}
        {onLoad && <LoadMenu onLoadFromFile={onLoad} />}
        {hasEvents && onClear && (
          <button onClick={onClear} style={{ ...toolBtnStyle, color: 'var(--rust)' }} title="Clear all data. Cannot be undone." aria-label="Clear simulation">Clear</button>
        )}
```

Replace with:

```tsx
        {/* LOAD stays inline — it's already a dropdown for past-runs UX. */}
        {onLoad && <LoadMenu onLoadFromFile={onLoad} />}
        {/* Save / Copy / Clear consolidated behind a single overflow
            menu so they don't fight for horizontal space with RUN /
            GITHUB / TOUR / status / theme. Visible only when a run
            has emitted events (same gating the 3 separate buttons
            had before). */}
        {hasEvents && (onSave || onCopy || onClear) && (
          <div ref={overflowRootRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setOverflowOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
              aria-label={overflowOpen ? 'Close run actions' : 'Open run actions menu'}
              title="Save · Copy · Clear"
              style={{
                ...toolBtnStyle,
                width: 28,
                padding: '2px 0',
                lineHeight: 1,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: '0.08em',
              }}
            >
              {'\u22ef'}
            </button>
            {overflowOpen && (
              <div
                ref={overflowMenuRef}
                role="menu"
                tabIndex={-1}
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  minWidth: 160,
                  padding: 4,
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                  zIndex: 60,
                  outline: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                {onSave && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => { setOverflowOpen(false); onSave(); }}
                    style={{
                      textAlign: 'left',
                      padding: '6px 10px',
                      background: 'transparent',
                      color: 'var(--text-2)',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'var(--mono)',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 3,
                    }}
                    title="Export simulation data as .json"
                  >
                    Save
                  </button>
                )}
                {onCopy && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => { setOverflowOpen(false); onCopy(); }}
                    style={{
                      textAlign: 'left',
                      padding: '6px 10px',
                      background: 'transparent',
                      color: 'var(--text-2)',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'var(--mono)',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 3,
                    }}
                    title="Copy simulation summary to clipboard"
                  >
                    Copy
                  </button>
                )}
                {onClear && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => { setOverflowOpen(false); onClear(); }}
                    style={{
                      textAlign: 'left',
                      padding: '6px 10px',
                      background: 'transparent',
                      color: 'var(--rust)',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'var(--mono)',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 3,
                    }}
                    title="Clear all data. Cannot be undone."
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        )}
```

Note: the order changed — LoadMenu now renders BEFORE the overflow, matching the spec's `| RUN | Load ▼ | ⋯ | status |` layout.

- [ ] **Step 4: Typecheck**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm/src/cli/dashboard
./node_modules/.bin/tsc --noEmit
```

Expected: no output, exit 0.

- [ ] **Step 5: Build**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm/src/cli/dashboard
npm run build 2>&1 | tail -6
```

Expected: `✓ built in Ns`, no errors.

---

## Task 2: Commit + push + bump pointer

- [ ] **Step 1: Stage in paracosm**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/cli/dashboard/src/components/layout/TopBar.tsx \
        src/cli/dashboard/tsconfig.tsbuildinfo \
        docs/superpowers/specs/2026-04-20-topbar-actions-overflow-design.md \
        docs/superpowers/plans/2026-04-20-topbar-actions-overflow.md
git add -f src/cli/dashboard/dist/
```

- [ ] **Step 2: Commit**

```bash
git commit -m "topbar: collapse save/copy/clear into overflow menu

Right cluster of the topbar carried 9+ interactive items at
mid-laptop widths (1024-1200px), forcing Save/Copy/Clear/Load/
RUN/GITHUB/TOUR/status/theme into a cramped single row that
progressively hid labels. Consolidate Save+Copy+Clear behind
a single overflow trigger, matching the overflow pattern
introduced on the VIZ tab in Phase A.

LoadMenu stays inline (already a dropdown with past-runs UX).
Clear keeps its red color to preserve the destructive affordance.
Focus trap + Escape + outside-click-to-close wired via the Phase
B useFocusTrap hook.

Spec: docs/superpowers/specs/2026-04-20-topbar-actions-overflow-design.md
Plan: docs/superpowers/plans/2026-04-20-topbar-actions-overflow.md"
```

- [ ] **Step 3: Push paracosm**

```bash
git push origin master
```

- [ ] **Step 4: Bump monorepo pointer**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant
git add apps/paracosm
git commit --no-verify -m "chore: bump paracosm submodule (phase D topbar overflow)"
git push origin master
```

---

## Self-review

**Spec coverage:**
- Overflow trigger + popover → Task 1 Step 3 ✓
- Visible only when `hasEvents` → Task 1 Step 3 gate ✓
- Escape + outside click close → Task 1 Step 2 effect ✓
- Focus trap + a11y → Task 1 Step 2 + Step 3 `role="menu"` / `role="menuitem"` ✓
- Clear keeps red color → Task 1 Step 3 ✓
- LoadMenu unchanged → Task 1 Step 3 (moved before overflow but not modified) ✓

**Placeholder scan:** No TBD/TODO. All code blocks complete.

**Type consistency:** `overflowOpen: boolean`, `overflowRootRef: RefObject<HTMLDivElement | null>`, `overflowMenuRef: RefObject<HTMLDivElement | null>`. Consistent across all steps.

**Scope:** Single-file change plus documented submodule dance. Fits one commit.
