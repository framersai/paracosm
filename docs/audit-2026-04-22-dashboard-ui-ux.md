# Dashboard UI/UX Audit — 2026-04-22

**Scope.** React + Vite dashboard in `src/cli/dashboard/src/`. 25,816 lines across ~80 component/hook files. Entry points: `App.tsx` (shell), `main.tsx`, SSE pipeline (`useSSE`), state projection (`useGameState`), persistence (`useGamePersistence`).

**Purpose.** Surface every UI/UX issue worth fixing before P2 (multi-agent/arena). Each finding is independently addressable; the user picks which to turn into specs. This is NOT a single spec; it's the decomposition artifact from which specs get written.

**Audit method.** Code-read only. No live dashboard session. Claims grounded in concrete file:line references.

---

## Summary by severity

| Severity | Count | Themes |
|---|---|---|
| P0 (blocks P2 arena / generic scenarios) | 4 | Hardcoded A/B, 2-column SideColumn layout, LeaderBar/StatsBar N-leader gap, generic time units |
| P1 (code quality at scale) | 5 | Inline styles, App.tsx monolith, SimView inline panels, SwarmViz+LivingSwarmGrid size, event log inline |
| P2 (user-facing UX) | 8 | JSON load preview, drag-drop, schema-version check, scenario-mismatch detection, URL-param load, multi-run local history, run comparison view, export formats |
| P3 (polish) | 6 | Event log filters, accessibility audits, mobile columns, inline re-run panel, scope-only commit convention, toast dedup state machine |

**23 distinct findings** (F23 added 2026-04-22 during F1 execution). Each has a proposed fix + rough effort. Nothing in this document has been committed against — it's a menu.

---

## P0 — Blocks P2 arena

### F1. Hardcoded two-leader boundary (`gameState.a` / `gameState.b`)

**Where.** [`hooks/useGameState.ts:1-500`](../src/cli/dashboard/src/hooks/useGameState.ts), consumed at:
- [`App.tsx:452-486`](../src/cli/dashboard/src/App.tsx#L452-L486) — `handleCopySummary` reads `gameState.a.systems.population` etc.
- [`components/sim/SimView.tsx:170,222-243,463-464`](../src/cli/dashboard/src/components/sim/SimView.tsx) — `state.a`, `state.b`, `SideColumn side="a"`, `SideColumn side="b"`
- `components/layout/StatsBar.tsx` — `systemsA`, `systemsB`, `prevSystemsA`, `prevSystemsB`, `deathsA`, `deathsB`, `toolsA`, `toolsB`, `citationsA`, `citationsB`
- `components/layout/LeaderBar.tsx` — single-leader, instantiated twice
- `components/sim/DivergenceRail.tsx`, `CrisisHeader.tsx`, Timeline, VerdictCard, EventCard — all thread `side: 'a' | 'b'`

**Problem.** Every downstream consumer hardcodes exactly two sides. P2's `runArena({ leaders: LeaderConfig[] })` produces N leaders; the dashboard cannot render them without a refactor through every component.

**Proposed fix.** Replace the discriminated `a`/`b` model with a `leaders: Record<leaderId, LeaderSideState>` map. Primary rendering components accept a `leaderIds: string[]` prop and iterate. Color palette derives from a `leaderIndex → color` map (not the fixed `var(--vis)` / `var(--eng)` tokens). Legacy `a`/`b` alias at the `useGameState` boundary so saved files + existing tests still work; internals iterate the map.

**Effort.** Large. Touches ~12 components + `useGameState` reducer. TDD-friendly per component; break into a sub-plan.

**Dependency.** Before P2 arena implementation starts. P2 spec should assume this refactor has landed.

---

### F2. `SideColumn` layout is 2-column CSS flex

**Where.** [`components/sim/SimView.tsx:462-465`](../src/cli/dashboard/src/components/sim/SimView.tsx#L462-L465):
```tsx
<div className="sim-columns" style={{ display: 'flex', flex: 1, ... }}>
  <SideColumn side="a" sideState={state.a} state={state} />
  <SideColumn side="b" sideState={state.b} state={state} />
</div>
```

**Problem.** 3+ leaders don't fit a side-by-side layout even at desktop widths. Each SideColumn needs its own scroll gutter, event stream, and crisis header — at N=5 the UI needs horizontal scroll, carousel, or grid layout.

**Proposed fix.** Three distinct layout modes based on `leaders.length`:
- N=1: full-width single column (useful for non-arena runs too)
- N=2: current side-by-side
- N≥3: horizontal scroll container with sticky leader badges, OR responsive grid (2×2, 3×2, etc.)

Pick via a `layoutMode: 'solo' | 'pair' | 'grid'` computed prop.

**Effort.** Medium. Mostly CSS; component boundaries largely stay intact if F1 lands first.

---

### F3. LeaderBar + StatsBar are hard-coupled to the 2-leader shape

**Where.** `components/layout/StatsBar.tsx` takes 10+ `*A` / `*B` props; `LeaderBar.tsx` is instantiated twice in SimView.

**Problem.** Same shape issue as F1+F2 but at the top-of-view horizontal strip. On an arena run, the user needs a collapsed per-leader strip that can fit N≥3 leaders without horizontal overflow.

**Proposed fix.** `StatsBar` accepts a `leaders: LeaderSideState[]` array and iterates. Fixed narrow columns (~180px) with horizontal overflow-scroll at 3+ leaders, each column showing the same metric + delta pattern. `LeaderBar` replaced by `LeaderRibbon` rendering N cards with automatic sizing down-scale at 4+ leaders.

**Effort.** Medium. Isolated to two components + their consumers.

---

## P1 — Code quality

### F4. Inline styles pervasive (violates user's standing rule: "No inline styles — SCSS modules only")

**Where.** Everywhere. Sampling:
- [`App.tsx:746-1168`](../src/cli/dashboard/src/App.tsx) — ~80 inline `style={{...}}` objects (verdict banner, modal, log tab, replay banners)
- [`SimView.tsx:45-560`](../src/cli/dashboard/src/components/sim/SimView.tsx) — ~35 inline `style={{...}}` objects (all empty states, progress bar, re-run panel)
- [`LoadMenu.tsx:35-287`](../src/cli/dashboard/src/components/layout/LoadMenu.tsx) — every single style is inline (`triggerStyle`, `popoverStyle`, `rowStyle`, `cardStyle` + per-element)

**Problem.** User's memory: `feedback_no_inline_styles.md` — "SCSS modules only, never style={{}}". The entire dashboard codebase violates this. Beyond the convention, inline styles:
- Can't be themed cleanly (hover, focus, media queries need JS state instead of `:hover`)
- Can't be statically analyzed for dead styles
- Can't be cached by the CSS loader
- Bloat JSX and make the component's structure hard to read

**Proposed fix.** Migrate one component at a time to SCSS modules. Priority order (most style per file):
1. `App.tsx` → `App.module.scss` (verdict banner, modal, log, replay banners)
2. `SimView.tsx` → `SimView.module.scss`
3. `LoadMenu.tsx` → `LoadMenu.module.scss`
4. Continue down by line count

Each migration: extract inline objects to SCSS rules, keep the CSS-custom-property tokens (`var(--bg-deep)` etc.) intact, replace `style={{...}}` with `className={styles.foo}`.

**Effort.** Very large, but bite-sized per file. Each component is 1-3 hours of careful replacement + visual spot-check. ~15-20 component migrations total.

**Risk.** Visual regressions if any CSS property was relying on precedence over stylesheet. Each migration needs a before/after manual visual check.

---

### F5. `App.tsx` is a 1238-line monolith

**Where.** [`App.tsx`](../src/cli/dashboard/src/App.tsx).

**Problem.** The shell has absorbed banner rendering, modal rendering, log-tab rendering, verdict-banner rendering, +10 useEffects for toast plumbing. New contributors can't find what's where. Changes to one concern risk touching unrelated code.

**Proposed fix.** Extract:
- `components/layout/VerdictBanner.tsx` (~120 lines currently inline at [`App.tsx:851-966`](../src/cli/dashboard/src/App.tsx#L851-L966))
- `components/layout/VerdictModal.tsx` (~45 lines at [1124-1169](../src/cli/dashboard/src/App.tsx#L1124-L1169))
- `components/layout/ReplayBanner.tsx` + `ReplayNotFoundBanner.tsx` (~95 lines at [753-844](../src/cli/dashboard/src/App.tsx#L753-L844))
- `components/log/EventLogPanel.tsx` (~140 lines at [988-1098](../src/cli/dashboard/src/App.tsx#L988-L1098))
- `hooks/useForgeToasts.ts` — the forge-toast plumbing (3 useEffects + 2 useCallbacks, ~90 lines at [197-296](../src/cli/dashboard/src/App.tsx#L197-L296))
- `hooks/useTerminalToast.ts` — end-of-sim toast logic (~40 lines at [559-593](../src/cli/dashboard/src/App.tsx#L559-L593))
- `hooks/useSimSavedToast.ts` — sim_saved outcome toasts (~30 lines at [632-659](../src/cli/dashboard/src/App.tsx#L632-L659))
- `hooks/useLaunchState.ts` — launching state + safety timeout (~60 lines at [489-676](../src/cli/dashboard/src/App.tsx#L489-L676))

Post-extract: `App.tsx` shrinks to ~400 lines of pure shell + provider wiring.

**Effort.** Medium. Each extraction is mechanical; test locally by launching a sim + verifying toasts fire correctly.

---

### F6. `SwarmViz.tsx` (1502) + `LivingSwarmGrid.tsx` (1243) — the god-viz problem

**Where.** [`components/viz/SwarmViz.tsx`](../src/cli/dashboard/src/components/viz/SwarmViz.tsx) + [`components/viz/grid/LivingSwarmGrid.tsx`](../src/cli/dashboard/src/components/viz/grid/LivingSwarmGrid.tsx).

**Problem.** These files are too large to hold in a reasoning context at once. I haven't read them end-to-end in this audit, but at 1500+ lines each they're almost certainly doing too much — canvas rendering, state management, interaction handling, animation driving, data shaping, prop plumbing. Not audited here; flagged for a follow-up focused read.

**Proposed fix.** Dedicated audit pass. Likely breakouts: canvas layer (pure render), interaction layer (pointer/hover), state projection (derive-from-events), animation driver.

**Effort.** Audit = 2 hours. Refactor = unknown until read. Flag for later, not part of this initial decomposition.

---

### F7. Event Log tab rendered inline in App.tsx

**Where.** [`App.tsx:988-1098`](../src/cli/dashboard/src/App.tsx#L988-L1098).

**Problem.** ~140 lines of JSX + logic inline in the tab-content switch. Mixed concerns (filter parsing from URL hash, filter application, color table, rendering). Hard to test in isolation.

**Proposed fix.** Extract `components/log/EventLogPanel.tsx`. Takes `events: SimEvent[]` + optional `filter: string` as props. Internal: filter logic, color table constant, pin-to-bottom behaviour (move `logScrollRef` + `logPinnedRef` inside). Add a `<EventLogToolbar>` with free-text search + per-type checkbox filters (covers F15).

**Effort.** Small-medium. ~1 hour extraction + optional enhancement.

---

### F8. SimView has a ~70-line inline "Re-run with seed+1" panel

**Where.** [`SimView.tsx:489-558`](../src/cli/dashboard/src/components/sim/SimView.tsx#L489-L558).

**Problem.** The panel does 3 concerns inline: localStorage read, key merging, fetch to /setup. It's a standalone feature that happens to render at the bottom of SimView. Tests would need to mount the entire SimView.

**Proposed fix.** Extract `components/sim/RerunPanel.tsx`. Takes `enabled: boolean` (true on `state.isComplete && !state.isRunning`). Owns its own launch-config + key plumbing. SimView just renders `<RerunPanel enabled={...} />`.

**Effort.** Small. Mechanical extraction.

---

## P2 — User-facing UX

### F9. No preview before JSON file load

**Where.** [`useGamePersistence.ts:40-70`](../src/cli/dashboard/src/hooks/useGamePersistence.ts#L40-L70). Called from [`App.tsx:317-326`](../src/cli/dashboard/src/App.tsx#L317-L326).

**Flow today.** User clicks LOAD → native file picker → selects file → picker closes → events instantly populated → tab switches to Sim. Three problems:
1. User sees no metadata (scenario name, leader names, turn count, date) before committing to loading
2. If it's the wrong file, you've blown away whatever was in the current state (no undo)
3. Schema-version mismatches silently proceed

**Proposed fix.** Two-stage load:
1. User selects file → parse + extract metadata (schema version, scenario id, leader names, turn count, date)
2. Show a confirmation modal: "Load `mars-83events.json` (0.5.0) — Reyes vs Okafor, 8 turns, 2026-04-21? [Load] [Cancel]"
3. If current state has unsaved events, warn before overwrite ("This will replace the current simulation data.")

Same flow applies to cache/replay (LoadMenu card click).

**Effort.** Small-medium. ~2 hours including the modal UI.

---

### F10. No drag-and-drop file load

**Where.** Load flow uses `<input type="file">` click-trigger.

**Problem.** Dragging a saved-run JSON onto the dashboard window does nothing. Common modern pattern, zero discovery cost.

**Proposed fix.** Wrap `<main>` (or whole App) with a drop-zone. On `dragover`: show an overlay "Drop `.json` to load". On `drop`: run the preview flow from F9. Low-risk: existing file-picker path stays as fallback.

**Effort.** Small. ~1 hour.

---

### F11. Saved-file `schemaVersion` field is written but not read

**Where.** [`useGamePersistence.ts:30`](../src/cli/dashboard/src/hooks/useGamePersistence.ts#L30) writes `schemaVersion: 2`. [Line 40-70 `load()`](../src/cli/dashboard/src/hooks/useGamePersistence.ts#L40-L70) never checks it.

**Problem.** Breaking changes to saved-file format will silently corrupt loads. The 0.5.0 rename already needed a migration helper (`migrateLegacyEventShape`); future schema changes will too, and the lack of a version gate means they'd fail ambiguously.

**Proposed fix.** On load, read `data.schemaVersion`. Route to a matching migration chain:
- `undefined` → pre-0.5 → existing `migrateLegacyEventShape`
- `2` → current → no-op
- `> 2` → show an error "This file was saved by a newer paracosm (schema v3). Upgrade to the latest version and retry."

**Effort.** Small. ~30 min.

---

### F12. No scenario-mismatch detection on load

**Where.** Load flow in `useGamePersistence.load()` + `handleLoad` in App.

**Problem.** Load a Mars saved run into a Submarine-scenario dashboard tab — the labels, population noun, viz colors all reflect Submarine while the data is Mars. Silent misrender.

**Proposed fix.** Save files should record the scenario id + version they were run under (add to `GameData` interface). On load:
- Extract `scenario: { id, version, labels.shortName }` from the saved file
- Compare to current `useScenarioContext()` value
- If mismatch: warn in the preview modal ("This file was saved under Mars Genesis; your current scenario is Submarine. Load anyway?"). Link to "switch scenario before loading".

**Effort.** Small. ~1 hour including the scenario swap action.

---

### F13. No URL-param load (`?load=<url>`)

**Where.** URL params supported today: `?replay=<session-id>`, `?tab=<tab>`, `#log=<tool>`, `#chat=<colonist>`.

**Problem.** Users can't share a link that loads a specific JSON run. Useful for:
- Blog post embeds ("Click here to replay the Mars 0.5 run I wrote about")
- CI artifact sharing (paracosm on CI generates a run, upload to S3, share link)
- Reproducible comparison across machines

**Proposed fix.** Parse `?load=<url>` on mount (same place as `?replay=`). Validate URL scheme (https only). Fetch with CORS. Run preview flow (F9) + the load path. Show a loading state while fetching.

**Effort.** Medium. ~2 hours including CORS error handling + the loading UX.

**Security.** Load only `https://` URLs; consider warning on non-same-origin loads ("Loading from external host `example.com` — continue?").

---

### F14. Client-side local history is 1 run deep

**Where.** [`useGamePersistence.ts:72-98`](../src/cli/dashboard/src/hooks/useGamePersistence.ts#L72-L98). `cacheEvents` writes `game-data` key; `restoreFromCache` reads it. One slot per scenario.

**Problem.** A user running multiple sims in a session loses everything but the most recent. Server-side `/sessions` holds 10 but that's scoped to one server (private demo doesn't benefit if hosted locally without server persistence).

**Proposed fix.** Replace single `game-data` key with a ring of N (default 5) entries keyed by timestamp. LoadMenu's "Load from cache" section renders both server-side sessions AND client-side local cache, clearly labelled. User can clear individually or all at once.

**Effort.** Small-medium. ~2 hours including the LoadMenu integration.

---

### F15. Event log tab has minimal filters

**Where.** [`App.tsx:988-1098`](../src/cli/dashboard/src/App.tsx#L988-L1098) event log rendering.

**Problem.** Only filter today is URL hash `#log=<tool-name>` (substring match on forge tool names). No free-text search, no per-event-type filtering, no time range. Users with a ~1000-event stream can't find "that one commander decision about food" without scrolling.

**Proposed fix.** Add a toolbar row above the log:
- Text input: substring match against `e.type`, `e.leader`, `e.data.title`, `e.data.summary`, `e.data.department`
- Event-type checkbox cluster (all on by default; toggle per type)
- Leader dropdown filter (all / leader name)
- Turn range slider (if max turn > 3)

Persist filter state in URL params so the link is shareable.

**Effort.** Medium. ~3 hours including UX polish.

---

### F16. No run-comparison view

**Where.** No component exists today. Compare two saved runs manually by opening each in separate tabs.

**Problem.** A natural question post-run is "how does this 0.5.0 result differ from my 0.4.0 baseline?" Today this requires eyeballing two dashboards side by side.

**Proposed fix.** New tab "Compare" (or a mode within Reports). Pick two saved runs (from LoadMenu-style cards); render side-by-side:
- Fingerprint delta (resilient vs fragile, etc)
- Key metric deltas (population, morale, deaths, tools, citations)
- Verdict comparison if both have one
- Divergence timeline aligned on turn number

**Effort.** Large. Depends on F14 (local history) being decent first. ~6-10 hours.

**Priority.** Nice-to-have for 0.5.x; probably P2+ arena natural fit (compare N arena leaders).

---

### F17. Export formats limited to the Save → JSON path

**Where.** `useGamePersistence.save()` writes JSON. No other export exists.

**Problem.** Analysts wanting to visualize paracosm runs in other tools (Jupyter, Observable, spreadsheets) need a flat/tabular export. The current JSON is nested + event-based, inconvenient for charting.

**Proposed fix.** Add:
- CSV export: one row per turn per leader, metric columns
- Events CSV: one row per event, flattened
- Markdown summary: the output of `handleCopySummary` saved as .md
Settings or Reports tab menu option.

**Effort.** Small-medium per format. ~1 hour each.

**Priority.** User-driven; ship on first request. Not worth pre-emptive.

---

## P3 — Polish

### F18. Accessibility audit needed

**Where.** Spot-checked, not exhaustively audited.

**Good today.**
- `role="main"`, `role="region"`, `role="dialog"`, `role="status"`, `role="log"` present on key surfaces
- `aria-modal`, `aria-label`, `aria-live`, `aria-expanded` used in places
- `useFocusTrap` on verdict modal
- Escape closes modals
- `ShortcutsOverlay` exposes keyboard shortcuts

**Gaps (spot-checked).**
- Verdict banner uses inline `<div>` with onClick for the headline; no `role="button"`, no Enter/Space keyboard handler. The verdict modal opens only on click, not keyboard
- Some color-only state signals (green/red for approved/rejected forges) have no non-color cue
- Empty-state buttons in SimView use inline `<button>` with no aria-label where the visible text is short + unclear ("More")
- Replay-mode banner uses `role="status"` but has interactive content (EXIT REPLAY button) — should be `role="region"` with live text inside

**Proposed fix.** Dedicated accessibility audit pass with axe-core or WAVE. Fix P0 violations; document P1/P2 as follow-ups.

**Effort.** Audit = 2 hours. Fixes = variable; expect 1-2 days of cleanup.

---

### F19. Mobile responsiveness

**Where.** Viewport media queries rare in the codebase. `useMediaQuery` hook exists but is only used by the grid viz.

**Problem.** Side-by-side sim columns, multiple rows of stat cards, the verdict banner's flex row — all degrade on narrow screens. The topbar + replay banner already use `width: 'min(520px, calc(100vw - 32px))'` patterns in places but not consistently.

**Proposed fix.** Mobile breakpoint pass. At ≤ 768px:
- Sim columns stack vertically with a tab toggle between leaders
- Verdict banner collapses into a 2-row card
- Topbar drops optional action labels to icons
- LoadMenu popover becomes a full-screen modal

**Effort.** Large. ~1 day of pattern work + testing.

---

### F20. Toast state-machine is ad-hoc

**Where.** [`App.tsx:229-296, 342-376, 559-659`](../src/cli/dashboard/src/App.tsx). Multiple useEffects each with their own sessionStorage fingerprint for dedup. Forge toasts have a 3-layer gate (sessionStorage + watermark + in-memory set).

**Problem.** Each toast source grew its own gate logic ad-hoc. Adding a new toast class means copy-paste the dedup pattern. Some edge cases likely slip through.

**Proposed fix.** A `useToastStream(events, { kind, onKey, onToast, gatingMode: 'live' | 'all' })` hook that each toast source calls once. Centralizes watermark + dedup + sessionStorage in one place.

**Effort.** Medium. ~3 hours refactor + retest each toast source.

---

### F21. Guided Tour integrations + scope-only commits

**Where.** `components/tour/GuidedTour.tsx` + demo data. The tour works but adds complexity (`tourActive` effective-events swap, auto-start gate, StrictMode dev-mode handling at [`App.tsx:394-426`](../src/cli/dashboard/src/App.tsx#L394-L426)).

**Problem.** Tour state leaks into many places (forge toasts gate on `tourActive`, terminal toast gates on `tourActive`, etc). Adding a new toast source has to remember the tour gate.

**Proposed fix.** Bundle the tour gate into the `useToastStream` hook (F20) so individual sources don't need to know. Pure cleanup, no UX change.

**Effort.** Small. Roll into F20.

---

### F22. "Re-run with seed+1" panel's localStorage key protocol is fragile

**Where.** [`SimView.tsx:506-524`](../src/cli/dashboard/src/components/sim/SimView.tsx#L506-L524).

**Problem.** Panel reads `paracosm:lastLaunchConfig` (written by SettingsPanel.launch) and `paracosm:keyOverrides`. Two implicit contracts shared by `localStorage` keys — breakable by any code path that writes different shapes.

**Proposed fix.** Centralize localStorage-keyed protocols in `hooks/useLastLaunchConfig.ts` and `hooks/useKeyOverrides.ts`. All writers + readers go through these hooks. Key strings + shapes defined once.

**Effort.** Small. Roll into F8's RerunPanel extraction.

---

### F23. Time is hardcoded to years (engine-wide generic-ification)

**Added:** 2026-04-22 during F1 execution. Surfaces as a user question: "we can't just simulate time in years but minutes, seconds, any time unit."

**Where.** Cross-cutting. The `year` concept is baked into:
- [`engine/types.ts:ScenarioSetupSchema`](../src/engine/types.ts) — `defaultStartYear`, `defaultYearsPerTurn`
- [`engine/core/state.ts:SimulationMetadata`](../src/engine/core/state.ts) — `startYear`, `currentYear`
- [`engine/core/kernel.ts:advanceTurn`](../src/engine/core/kernel.ts) — `(nextTurn, nextYear, ...)`, `yearDelta` progressionHook context
- Orchestrator — `buildYearSchedule`, `yearDelta` on every SSE event
- Compiler prompts — hardcoded "over 48 years" phrasing
- SimEvent shape — `e.year` on every event payload
- Mars + Lunar scenarios — `defaultStartYear: 2035`, `defaultYearsPerTurn: 8`
- Dashboard display — "Year 2043", "T3/6 Year 2043" literals
- Saved-file format — `year` fields in events + results

**Problem.** A submarine habitat sim might want hour-level ticks. A corporate quarterly-strategy sim wants quarters. An AgentOS Arena benchmark might want real-time seconds. Today the engine forces year semantics on all of them — scenarios with non-year time use `year` as a synonym for "tick index" which reads wrong in every user-facing string.

**Proposed fix.** New scenario field `setup.timeUnit: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year'`. Rename:
- `SimulationMetadata.startYear` → `startTime` (number)
- `SimulationMetadata.currentYear` → `currentTime` (number)
- `ScenarioSetupSchema.defaultStartYear` → `defaultStartTime`
- `ScenarioSetupSchema.defaultYearsPerTurn` → `defaultTimePerTurn`
- `kernel.advanceTurn(nextTurn, nextYear, ...)` → `kernel.advanceTurn(nextTurn, nextTime, ...)`
- `yearDelta` in progression context → `timeDelta`
- `e.year` on SSE events → `e.time`
- Dashboard `state.year` / `CrisisInfo.year` / `TurnEventInfo.year` → `state.time` / `TurnEventInfo.time`

Scenario labels add:
- `labels.timeUnitNoun: 'year'` (singular for display, e.g. "Year 2043", "Day 42", "Minute 308")
- `labels.timeUnitNounPlural: 'years'`

Dashboard display formats via `${time} ${labels.timeUnitNoun}` or derived helper.

Saved-file migration (in dashboard's `migrateLegacyEventShape`): alias `data.year` → `data.time` when reading pre-time-rename files. Same pattern as 0.5.0's colony→systems migration.

**Effort.** Large — comparable to P1's colony→unit/systems rename. Roughly 20-30 files across engine + runtime + compiler + scenarios + dashboard + saved-file migration. Dedicated spec + plan cycle.

**Severity.** P0 — blocks any non-year scenario from rendering correctly. Does NOT block P2 arena itself (arena can inherit year defaults), but any arena vertical that wants real-time latency simulation (e.g. AgentBench Arena) is blocked.

**Ordering.** Ship as 0.6.0 breaking change on par with 0.5.0. Lands between F1 (arena state shape) and F4 (inline styles). Gets its own spec at `docs/superpowers/specs/2026-04-XX-f23-generic-time-units-design.md`.

---

## Cross-cutting observations

### Loose event shape vs runtime discriminated union

The runtime's `SimEventPayloadMap` in [`src/runtime/orchestrator.ts:96-200`](../src/runtime/orchestrator.ts) gives per-type payload narrowing. The dashboard's `SimEvent` type in [`useSSE.ts:35-41`](../src/cli/dashboard/src/hooks/useSSE.ts#L35-L41) drops this: `data: Record<string, unknown>`. Every consumer has to cast.

**Potential fix.** Import `SimEventPayloadMap` from `paracosm/runtime` and use it as the `data` narrowing source. Dashboard code becomes type-safe without additional casts. Blocked today by the submodule build shape (dashboard builds separately from the library).

Flagged as a background note; not in the P3 count since it's not a UX issue.

### Scope-only-commit convention

Not UI/UX, but related: 160+ commits in 0.4.x history use `<scope>:` prefix instead of `<type>(<scope>):`. The P1.5 changelog generator lumps these into "Other". A ~5-line addition to `README.md` or a new `CONTRIBUTING.md` calling out the conventional prefixes would get future entries classified correctly. Flagged here because it surfaces in the CHANGELOG UX.

---

## What to tackle first

**Recommended order** (each is independently shippable):

1. **F1 + F2 + F3** (arena-readiness) — must land before P2. Combined sub-plan. ~1-2 days.
2. **F4** (inline styles → SCSS modules) — biggest code-quality lift. Ship incrementally, one file per commit. ~5-10 days total but any single migration is 1-3 hours.
3. **F5** (App.tsx extractions) — sets the stage for F4 since extracted components are easier to migrate than monolithic App. ~1 day.
4. **F9 + F10 + F11 + F12** (JSON-load UX bundle) — addresses the user's original question about "any type of generated data json". ~1 day combined.
5. **F14 + F15** (local history + event-log filters) — visible UX wins. ~1 day combined.
6. **F13** (URL-param load) — after F9 lands (shares the preview flow). ~2 hours.
7. **F17** (export formats) — ship on first request, not pre-emptively.
8. **F16** (run comparison) — depends on F14. P2+ arena natural fit.
9. **F18, F19, F20, F21, F22** — polish after the above.

Every finding in this audit is independently addressable. None depend on the audit itself being executed as a single plan.

---

## Out of scope for this audit

- `SwarmViz.tsx` (1502 lines) + `LivingSwarmGrid.tsx` (1243 lines) internals — flagged as F6, needs a dedicated pass
- `ChatPanel.tsx` (492 lines) — not audited
- `ReportView.tsx` (831 lines) — not audited
- `SettingsPanel.tsx` (662 lines) + `ScenarioEditor.tsx` (425 lines) — not audited
- Viz sub-layers (canvas, GoL, flares, glyphs) — flagged under F6
- Theme system (`theme/`) — not audited
- Test coverage gaps — not audited (29 test files exist across the dashboard)
- Performance / render-cost — not audited
- Build pipeline (`vite.config.ts`, `tsconfig.json`) — not audited

Follow-up audits welcome; each of the above is a half-day to full-day pass.
