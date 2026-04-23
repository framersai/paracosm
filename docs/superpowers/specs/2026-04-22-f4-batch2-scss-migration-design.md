# F4 batch 2 — SimView + small-file SCSS migration

**Status:** design, awaiting approval
**Date:** 2026-04-22
**Scope:** continuation of the dashboard's inline-styles → SCSS modules migration (audit F4). Batch 1 landed earlier today: App.tsx, LoadMenu.tsx, VerdictBanner, VerdictModal, ReplayBanner, EventLogPanel.

---

## Motivation

The dashboard still has ~260 inline `style={{...}}` objects across ~10 files. Each inline block:
- Violates the user's standing rule ([memory: `feedback_no_inline_styles.md`](#))
- Can't use `:hover` / `:focus` / media queries cleanly — adding them requires JS state handlers
- Can't be statically analyzed for dead styles or deduped
- Bloats JSX + makes component structure hard to read at a glance

This batch targets the highest-line-count file remaining (SimView, ~549 lines, ~35 inline styles) plus two small low-risk companions (StatsBar ~279 lines, LeaderBar ~139 lines). Bundles F8's RerunPanel extraction since that code lives inside SimView.

Not in this batch: SwarmViz + LivingSwarmGrid (1500+ and 1243 lines — F6 god-viz refactor scope), ChatPanel, ReportView, SettingsPanel, ScenarioEditor (own batches).

---

## Targets

| File | Lines | Inline styles (est) | Risk | Notes |
|---|---|---|---|---|
| `sim/SimView.tsx` | 549 | ~35 | medium | Extract `RerunPanel` to its own file while migrating; bundles audit F8 |
| `layout/StatsBar.tsx` | 279 | ~25 | low | Already refactored in F1; inline styles are leftover from that pass |
| `layout/LeaderBar.tsx` | 139 | est ~20 | low | Instantiated twice in SimView; simple card-style widget |

**Non-goal:** changing any visible behaviour. A before/after manual smoke should show identical pixels.

---

## Pattern (established in batch 1)

For each target file:

1. Create a sibling `.module.scss` if one doesn't exist
2. Identify inline-style blocks in the JSX; group them by role (container, child-N, state variants)
3. Move static values to SCSS class rules
4. For dynamic values (runtime-computed colors / widths / opacity), use CSS custom properties on the parent element + a `var()` reference in the SCSS
5. Replace `style={{...}}` with `className={styles.foo}` (+ `style={{ ['--dyn-color' as string]: value }}` on the small subset that needs a live value)
6. Keep camelCase class names in SCSS; use `@extend` chains for variants
7. No visual regression — spot check against the live dashboard before commit

Reference patterns already landed in batch 1:
- [VerdictModal.module.scss](../../src/cli/dashboard/src/components/layout/VerdictModal.module.scss) — dialog + backdrop + close button + winner color variants
- [VerdictBanner.module.scss](../../src/cli/dashboard/src/components/layout/VerdictBanner.module.scss) — dynamic color via `--win-color` CSS custom property
- [ReplayBanner.module.scss](../../src/cli/dashboard/src/components/layout/ReplayBanner.module.scss) — `@extend` chains for status-message variants
- [LoadPreviewModal.module.scss](../../src/cli/dashboard/src/components/layout/LoadPreviewModal.module.scss) — chip variants + warning row

---

## RerunPanel extraction

SimView has an inline ~70-line "Re-run with seed+1" panel at the bottom of the completed-sim view. Extracting it satisfies audit finding F8 (modular concerns) while also removing the single largest inline-style block in SimView.

- New file: `src/cli/dashboard/src/components/sim/RerunPanel.tsx`
- New file: `src/cli/dashboard/src/components/sim/RerunPanel.module.scss`
- SimView imports + renders `<RerunPanel enabled={state.isComplete && !state.isRunning} ... />`
- Internals of RerunPanel own their own localStorage read + key merging + fetch-to-/setup flow; SimView no longer knows about them

Also extracts the localStorage key strings from magic strings into a sibling `hooks/useLastLaunchConfig.ts` (per audit F22) — scoped tight: one read, one write, used by RerunPanel.

---

## Rollout sequence

Single-file commits so visual regression is traceable per file:

1. SimView.tsx SCSS migration + RerunPanel extraction (one commit)
2. `hooks/useLastLaunchConfig.ts` helper
3. StatsBar.tsx SCSS migration
4. LeaderBar.tsx SCSS migration

After each commit: typecheck + full dashboard test suite + build. After all four: CodeRabbit review + address findings + push.

No TDD red-green applies — migrations preserve behaviour, and behaviour is already covered by the existing 201/201 tests. Visual regression check is manual.

---

## Files

**New.**
- `src/cli/dashboard/src/components/sim/RerunPanel.tsx` (~90 lines; the extracted panel)
- `src/cli/dashboard/src/components/sim/RerunPanel.module.scss` (~80 lines)
- `src/cli/dashboard/src/components/sim/SimView.module.scss` (new SCSS module for SimView chrome)
- `src/cli/dashboard/src/components/layout/StatsBar.module.scss` (new)
- `src/cli/dashboard/src/components/layout/LeaderBar.module.scss` (new)
- `src/cli/dashboard/src/hooks/useLastLaunchConfig.ts` (~40 lines; localStorage helper)
- `src/cli/dashboard/src/hooks/useLastLaunchConfig.test.ts` (~40 lines; tests for shape contract)

**Modified.**
- `src/cli/dashboard/src/components/sim/SimView.tsx` — inline styles → className; extract RerunPanel import
- `src/cli/dashboard/src/components/layout/StatsBar.tsx` — inline styles → className
- `src/cli/dashboard/src/components/layout/LeaderBar.tsx` — inline styles → className

---

## Acceptance criteria

- All three files have zero `style={{...}}` occurrences EXCEPT for runtime-dynamic values delivered via CSS custom properties (same exception as batch 1)
- RerunPanel extraction: SimView no longer contains the panel JSX; SimView renders `<RerunPanel enabled={...} />` once
- `hooks/useLastLaunchConfig.ts` is the single writer + reader of the `paracosm:lastLaunchConfig` key; no other code accesses the raw string
- 201 existing dashboard tests still pass; new `useLastLaunchConfig.test.ts` passes
- Typecheck clean; `npm run build` exit 0
- CodeRabbit review: zero findings by final push
- Manual visual check: SimView / StatsBar / LeaderBar render identically before vs after (spot check: verdict banner, leader cards, metric deltas, empty states, completed-run re-run panel)

---

## Out of scope (defer to F4 batch 3+)

- `components/viz/SwarmViz.tsx` (1500+ lines) — F6 god-viz refactor
- `components/viz/grid/LivingSwarmGrid.tsx` (1243 lines) — F6
- `components/settings/*.tsx` — own batch
- `components/chat/ChatPanel.tsx` — own batch
- `components/reports/ReportView.tsx` — own batch
- `components/layout/RunMenu.tsx` legacy inline styles (F14 added SCSS module for the new history section; the rest of RunMenu stays inline pending a focused pass)

---

## Risks

- **Subtle visual regressions.** CSS precedence between tailwind utility classes, `globals.scss`, and the new module can differ from inline styles. Mitigation: spot-check each migrated component against the live dashboard before commit.
- **Dynamic color loss.** Replacing `style={{ color: entry.flare }}` with a class drops the runtime value. Mitigation: use `--dyn-*` CSS custom property pattern (see `VerdictBanner.module.scss` for the reference).
- **Hover / focus patterns.** Some inline blocks simulate hover via `onMouseEnter` / `onMouseLeave` + state. Migrating to `:hover` in CSS removes the state + event handlers — net simplification, but verify keyboard focus visuals survive.
