# Compare 2+ Runs UI — Design

**Date:** 2026-04-26
**Status:** Spec approved by user, not yet implemented
**Closes:** the disabled `<button disabled aria-label="Compare (coming soon)">Compare</button>` stub on every RunCard ([RunCard.tsx:44](../../../src/cli/dashboard/src/components/library/RunCard.tsx))

---

## Why this matters

Paracosm's value prop, repeated across the hero video and the seven-tabs cookbook section, is *"same world, different actors → different futures."* The Quickstart entry point now produces 3 (and after this spec, up to 50) parallel runs from one prompt — but the dashboard has no way to show those parallel futures alongside each other. Users see three end-cards in the LIBRARY and a disabled Compare button, with no path to the comparison the demo is selling.

This spec closes that gap. It builds the Compare view, ships the engine + server changes that let Quickstart produce arbitrary-N actor bundles, and turns the LIBRARY's three loose cards into a single bundle card that opens directly into Compare.

## Scope of v1

**In scope:**

- Quickstart accepts an actor-count input (1–50, default 3) with a cost-preview gate before submit
- Server tags every run produced by one Quickstart submit with a shared `bundleId` (UUID per submission)
- LIBRARY renders one card per bundle (collapsing the 3-cards-per-submit clutter), with a per-bundle stats strip (actor count, total cost, mean turn time, outcome distribution)
- New Compare view (full-screen modal, opened by clicking a bundle card) with three layered zooms:
  1. Aggregate strip (all N at once)
  2. Small-multiples grid (one cell per run with sparkline + fingerprint chips)
  3. Side-by-side panel (2–3 pinned cells with full timeline + decision-rationale + metric diffs)
- Diff dimensions: `(a)` timeline, `(b)` fingerprint, `(c)` decision rationale, `(d)` metric trajectories
- Partial-failure handling (N requested, M < N completed)
- Long-running bundle progress indicator on the LIBRARY card

**Out of scope (deferred to v2):**

- Cross-bundle ad-hoc compare (multi-select runs from different submissions)
- Risk-flag and specialist-note diffs in the side-by-side panel
- Bundle clustering / fingerprint-similarity grouping
- Compare-export (PDF / shareable link to a Compare view)
- Compare against a forked run from BRANCHES tab

---

## User flows

### Primary: Quickstart submit → Compare

1. User pastes a brief on the Quickstart tab and adjusts the actor-count input (default 3, slider 1–50)
2. UI shows live cost preview: *"~$0.30 × 12 actors + $0.10 compile = ~$3.70. Estimated wall time: ~12 min."*
3. At count > 5, submit button changes to "Run 12 actors (~$3.70)" and requires explicit click-confirm (no second modal — the cost in the button label is sufficient gate, matching how SettingsPanel surfaces caps today)
4. Submit fires → server generates a `bundleId`, persists each of N RunRecords with that id, runs the batch
5. QuickstartProgress now shows N actor cards in the running stage (current code already iterates `phase.leaders.map`)
6. When all artifacts arrive, QuickstartView's `phase = 'results'` block opens — it now offers a primary CTA *"Compare all N actors →"* alongside the existing per-actor Fork buttons
7. Clicking the CTA opens the Compare view modal scoped to that bundle

### Secondary: LIBRARY → Compare

1. LIBRARY tab renders bundle cards (collapsed 3-card-per-submit stacks become one card with "12 actors · Hurricane Cassandra" badge)
2. Clicking a bundle card opens Compare (full-screen modal) for that bundle
3. Individual non-bundle runs (e.g., legacy single-leader runs from before this spec) keep their current per-run cards; clicking those still opens RunDetailDrawer

### Tertiary: drill-down inside Compare

1. Inside Compare, clicking any small-multiples cell pins it
2. 1 pinned: cell expands to show ~30% of the modal (full sparkline + fingerprint + key decision)
3. 2–3 pinned: side-by-side panel takes the full width below aggregate, showing timeline + rationale + metric diffs synchronized by turn
4. Pinning a 4th: LRU evicts the oldest pin (with a brief toast "Unpinned: Mayor Reyes")
5. Clicking a cell's "Open" affordance opens that run's full RunDetailDrawer over the Compare view (existing component reused)

---

## Architecture

### Components added

```
src/cli/dashboard/src/components/compare/
  CompareModal.tsx           — full-screen modal shell (open/close, focus trap, Esc, scroll lock)
  CompareModal.module.scss
  AggregateStrip.tsx         — top strip: trajectory overlay, fingerprint scatter, outcome distribution, cost histogram
  SmallMultiplesGrid.tsx     — responsive grid of cells (4-wide @ 1280, 3-wide @ 1024, 2-wide @ 768)
  CompareCell.tsx            — one mini-card per run: name, archetype, sparkline, fingerprint chips, pin toggle, open affordance
  CompareCell.module.scss
  PinnedDiffPanel.tsx        — 2–3 pinned-runs side-by-side panel below the grid
  diff/
    TimelineDiff.tsx         — turn-by-turn parallel rows aligned by turn number
    FingerprintDiff.tsx      — overlaid trait bars with delta callouts
    DecisionRationaleDiff.tsx — text columns side-by-side, scroll-synced
    MetricTrajectoryDiff.tsx — multi-series sparkline per metric
  hooks/
    useBundleArtifacts.ts    — fetch all N artifacts for one bundleId; lazy-load (only fetches artifact when its cell is rendered or pinned)
    useBundle.ts             — fetch bundle metadata + member RunRecords
    usePinnedRuns.ts         — local state for pinned cells with LRU eviction at 3
```

### Components modified

```
src/cli/dashboard/src/components/library/
  RunCard.tsx                — disabled Compare button removed; bundle members render as a single card via RunGallery
  RunGallery.tsx             — group by bundleId; render BundleCard for grouped, RunCard for solo
  BundleCard.tsx (new)       — bundle equivalent of RunCard with actor count, total cost, mean turn time, outcome distribution
  LibraryTab.tsx             — pass bundleId filter to useRunsList; bundle-aware filter chips (single-actor / bundle, count buckets)

src/cli/dashboard/src/components/quickstart/
  SeedInput.tsx              — adds actor-count slider (1–50) with cost preview; submit button label includes count + cost
  QuickstartView.tsx         — passes count to /api/quickstart/generate-leaders; results phase adds "Compare all N actors" primary CTA
  QuickstartProgress.tsx     — already iterates leaders.map; verify it scales to 50 without DOM thrash (virtualize if >20)
```

### Engine + server changes

```
src/engine/compiler/quickstart-routes.ts
  GenerateLeadersSchema.count: max(6) → max(50)
  Add /api/v1/runs?bundleId=... filter
  Add /api/v1/bundles/:bundleId      → bundle metadata + member runs
  Add /api/v1/bundles/:bundleId/aggregate  → precomputed aggregate stats (server-side rollup so the client doesn't fetch all N artifacts to render the strip)

src/cli/server/run-record.ts
  RunRecord.bundleId?: string                — UUID shared by all runs from one bundle
  RunRecord.summaryTrajectory?: number[]     — 5–10 sampled trajectory points for cell sparkline

src/cli/server/sqlite-run-history-store.ts
  ensureRunsColumns adds:
    ['bundle_id', 'TEXT']                    — groups runs from one Quickstart submit
    ['summary_trajectory', 'TEXT']           — JSON-stringified number[] of 5–10 sampled
                                                trajectory points; sourced from artifact
                                                at insert time so the SmallMultiplesGrid
                                                cell sparkline renders without fetching
                                                the full artifact
  rowToRecord copies row.bundle_id and row.summary_trajectory (parsed back to number[])
  insertRun persists run.bundleId and run.summaryTrajectory
  Add SELECT ... WHERE bundle_id = ? variant
  Add aggregateBundleStats(bundleId) → { count, costTotalUSD, meanDurationMs, outcomeBuckets, fingerprintCentroid }

src/cli/server-app.ts
  /setup handler generates bundleId when leaders.length >= 2 (or always when called via Quickstart flow), passes it to runBatchSimulations
  Each RunRecord persisted with the same bundleId
  /api/quickstart/compile-from-seed accepts an optional `actorCount` field forwarded to /setup
```

### Data flow

```
                 USER
                  │
                  ▼
       ┌─────────────────────┐
       │  QuickstartView     │  count slider, cost preview
       │  + SeedInput        │
       └──────────┬──────────┘
                  │ POST /api/quickstart/compile-from-seed { seedText, actorCount }
                  ▼
       ┌─────────────────────┐
       │  compile-from-seed  │  same as today
       └──────────┬──────────┘
                  │ POST /api/quickstart/generate-leaders { scenarioId, count: N }
                  ▼
       ┌─────────────────────┐
       │  generate-leaders   │  bumped max → 50, returns N LeaderConfigs
       └──────────┬──────────┘
                  │ POST /setup { leaders: [N], quickstart: { scenarioId, bundleId } }
                  ▼
       ┌─────────────────────┐
       │  /setup handler     │  generates bundleId if not provided, persists per-run RunRecord with bundleId
       └──────────┬──────────┘
                  ▼
       ┌─────────────────────┐
       │ runBatchSimulations │  Promise.allSettled over N — already supports any N
       └──────────┬──────────┘
                  │ SSE per leader; onArtifact persists artifact + RunRecord
                  ▼
       ┌─────────────────────┐
       │  sqlite store       │  N rows with shared bundle_id
       └──────────┬──────────┘
                  ▼
       ┌─────────────────────┐
       │  CompareModal       │  fetches /api/v1/bundles/:id (metadata) + /aggregate (rollup)
       │                     │  fetches /api/v1/runs/:id PER CELL ON DEMAND (lazy)
       └─────────────────────┘
```

### Lazy loading + scale

For a 50-actor bundle, naively fetching all 50 RunArtifacts would be 50 × ~500 KB = ~25 MB JSON, loaded synchronously on Compare open. This is unacceptable for first-paint.

Strategy:

- **Server provides aggregate rollup pre-computed.** `/api/v1/bundles/:id/aggregate` returns small (<10 KB): `{ trajectoryPoints: [{turn, runId, metrics}], fingerprintCentroid, outcomeBuckets, costSummary }`. The aggregate strip renders entirely from this — no per-artifact fetches.
- **Cells render from RunRecord summary.** Each RunRecord already has `costUSD`, `durationMs`, `mode`, `leaderName`, `leaderArchetype`. Mini-sparkline data comes from a new `summaryTrajectory: number[]` column added to RunRecord at insert time (5–10 numeric points sampled from the artifact's trajectory.points). Cell renders without fetching the full artifact.
- **Full artifact fetched only when cell is pinned or opened.** `usePinnedRuns` triggers `useRunArtifact(runId)` for each pinned id. PinnedDiffPanel renders progressively as artifacts arrive (skeleton → full diff).

This keeps Compare-modal first-paint under 200 ms regardless of bundle size, and cumulative fetch is bounded by user pinning behavior (≤3 pins → ≤3 full-artifact fetches).

### Aggregate strip rendering

The strip is four small-charts side-by-side, sized to consume the top ~25% of the modal:

1. **Trajectory overlay** — one polyline per run, showing the bundle's primary metric (population, morale, or whichever metric the scenario.labels designates as the headline). All N polylines color-coded by archetype with low opacity so dense overlays still read.
2. **Fingerprint scatter** — 2D projection of fingerprint vectors using PCA on numeric fingerprint fields. One dot per run, hover to see archetype + name. Cluster patterns are immediately visible.
3. **Outcome distribution** — bar chart of outcome class counts (`risky_success`, `risky_failure`, `conservative_success`, `conservative_failure`, `neutral`). Tells "9 out of 12 ended in conservative success" at a glance.
4. **Cost · turn-time histogram** — twin histograms: cost spread + duration spread across the bundle. Reveals outlier expensive runs.

All four are inline SVG (matching the rest of the dashboard's no-chart-library convention used in CommanderTrajectoryCard, MetricSparklines).

### PinnedDiffPanel layout

When 2–3 cells are pinned, the panel takes the full modal width below the small-multiples grid. Two-column case:

```
┌──────────────────┬──────────────────┐
│ Mayor Reyes      │ Director Hale    │
│ archetype + bars │ archetype + bars │
├──────────────────┴──────────────────┤
│ Timeline (T1 - T6, parallel rows)   │
├──────────────────┬──────────────────┤
│ Decision rationale (synced scroll)  │
├──────────────────┴──────────────────┤
│ Metric diffs (overlaid sparklines)  │
└─────────────────────────────────────┘
```

Three-column case: same layout, three columns at the top, full-width strips below.

### Error + edge cases

| Case | Behavior |
|---|---|
| 12 actors requested, 9 succeed | Aggregate + grid render the 9. The 3 failed cells render with a red banner "Failed: <error>" and are non-pinnable. Bundle card in LIBRARY shows "9 of 12 actors completed". |
| Bundle aborted mid-run | Same as partial-failure: render whatever's complete, mark partial. RunRecord captures aborted state. |
| Cost-confirm at high N | The button label encodes the cost ("Run 12 actors · ~$3.70"). No separate modal. Matches SettingsPanel's existing pattern of in-button cost surfacing. |
| Bundle still running when LIBRARY card clicked | Compare opens with whatever artifacts are persisted so far, plus a "running" indicator in the aggregate strip. Subscribes to the bundle's SSE stream for incremental updates. |
| User pins 4th cell | LRU eviction with a 2-second toast: "Unpinned: <oldest>". Pin behavior is forgiving — power users want this. |
| Compare modal opened with N=1 | Not possible: bundles only exist at N≥2. N=1 runs use existing RunDetailDrawer. |
| Two bundles with same scenario but different N (e.g., 3 actors vs 12 actors) | Each is an independent bundle card. Comparing across bundles is v2. |

---

## Visual design

Follows existing dashboard tokens: `var(--bg-card)`, `var(--border)`, `var(--amber)` for active state, `var(--rust)` for risk emphasis, `var(--mono)` for code/data, monospace for numerals.

CompareModal opens at z-index 100, with backdrop blur 16px (matching nav-mobile pattern). Header has bundle title + actor count + total cost + close button. Keyboard: Esc closes the modal; click outside backdrop closes; Tab cycles through pin checkboxes within the focus trap (matching RunDetailDrawer's existing trap). Arrow keys to navigate cells in the grid is deferred to v2.

Small multiples cell:

```
┌─────────────────────┐
│ Mayor Reyes      ☐  │  pin checkbox
│ Cautious Steward    │  archetype subtitle
│ ▂▃▅▇▆▄▃            │  sparkline (primary metric)
│                     │
│ stable / adaptive   │  fingerprint chips
│ / cautious          │
│ ─────────────────── │
│ T6 · $0.21 · 35s    │  outcome + cost + duration footer
└─────────────────────┘
```

Cell width: 240px min, flexible up to 320px depending on count. Below 240px the grid switches from 4-wide to 3-wide to 2-wide.

---

## Testing strategy

Unit tests:

- `useBundleArtifacts.test.ts` — lazy-load semantics: fetches only when subscribed
- `usePinnedRuns.test.ts` — LRU eviction at 3, reordering, eviction toast
- `aggregateRollup.test.ts` (server-side) — fingerprint centroid math, outcome bucketing, partial-failure handling
- `bundleCard-grouping.test.ts` — RunGallery groups by bundleId correctly, solo runs unaffected

Integration tests:

- Quickstart submit at count=12 → 12 RunRecords share a bundleId → LIBRARY shows one bundle card → click → CompareModal opens with all 12 cells
- Pin 3 cells → PinnedDiffPanel renders 3 columns → pin 4th → oldest evicts
- Aggregate strip renders from rollup endpoint without per-artifact fetches (assert network panel)
- Partial failure: mock 3 of 12 to throw → 9 cells render normally + 3 cells render error state

Visual / Playwright tests:

- Open CompareModal at counts 2, 6, 12, 50 → screenshot each at 1280×720 → assert no layout overflow
- Pin one cell, screenshot, pin two, screenshot, pin three, screenshot — verify side-by-side panel grows correctly
- Tab through cells with keyboard → focus ring lands on each pin checkbox in order
- Esc closes modal and restores focus to the bundle card that opened it

End-to-end recorder:

- Extend `record-end-to-end.mjs` to include a Compare-view tour in the tab tour: after LIBRARY hold, click first bundle card → hold Compare modal for 8s → pin two cells → hold pinned panel for 6s → close → continue to drawer

---

## Implementation order

1. **Schema + persistence** — `bundle_id` column, `summaryTrajectory` column, `bundleId` on RunRecord. One migration; idempotent.
2. **Server endpoints** — `/api/v1/bundles/:id`, `/api/v1/bundles/:id/aggregate`, `/api/v1/runs?bundleId=` filter, schema cap raised to 50.
3. **LIBRARY bundle card** — `BundleCard` component, RunGallery grouping logic, useRunsList bundle awareness. Existing single-run cards still work.
4. **CompareModal shell** — modal + focus trap + Esc + close. Renders a placeholder with the bundle metadata to verify routing.
5. **AggregateStrip** — render from `/aggregate` endpoint. Four inline-SVG charts.
6. **SmallMultiplesGrid + CompareCell** — render from RunRecord summaries. Pin checkbox state lifted to `usePinnedRuns`.
7. **PinnedDiffPanel** — 2–3 columns, four diff strips. Lazy-fetch full artifacts only for pinned cells.
8. **Quickstart actor-count** — slider + cost preview + submit-button label. Schema cap bump.
9. **QuickstartView "Compare all N" CTA** — opens CompareModal directly from the results phase.
10. **Recorder tour extension** — capture Compare view in the demo loop.

Each step is independently testable and shippable. Steps 1–3 are pure backend / list-view; the dashboard works without Compare existing yet. Steps 4–7 build the modal incrementally — at each step the modal opens and renders a meaningful subset. Steps 8–10 polish + production-ize the entry point.

---

## Open questions deferred to v2

- Cross-bundle compare: select runs from different bundles. Requires bundle-spanning multi-select UI.
- Compare against a forked run: useful pairing with the BRANCHES tab. Requires a "import from BRANCHES" flow into Compare.
- Export Compare: PDF or shareable link. Useful for benchmarking writeups.
- Cluster bundles by fingerprint similarity: unsupervised grouping over the small-multiples grid.
- Risk-flag and specialist-note diffs in PinnedDiffPanel: skipped from v1 (the four shipped diff dimensions cover the demo's value prop).

---

## Success criteria

- Quickstart can submit a bundle of any N from 1 to 50 with a clear cost preview
- LIBRARY collapses bundle members into one card; legacy single-runs unaffected
- CompareModal opens in under 200 ms for a 12-actor bundle and under 500 ms for a 50-actor bundle
- All four diff dimensions render correctly in the side-by-side panel for any pinned 2–3 runs
- Partial-failure surfaces the failure count without breaking aggregate or grid rendering
- Recorder demo captures the full path: prompt → bundle → Compare → pin → drill-down → close
- CodeRabbit review surfaces no critical issues
- Frame-by-frame Playwright verify of the recorded demo confirms no stale-state rendering, no unmounted tabs, no console errors

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| 50 parallel SSE streams overwhelm dashboard | Medium | pair-runner currently fan-outs every leader event through a single `broadcast` channel without chunking — verified by grep, not assumed. Implementation step 1 includes a 50-actor smoke test against a local server to measure actual SSE throughput. If it overwhelms the dashboard, add a `--max-parallel=N` knob on `runBatchSimulations` (default 8) so the engine throttles in-flight sims and the dashboard sees event waves of bounded size. |
| Aggregate rollup math is expensive at high N | Low | The rollup endpoint precomputes server-side once per bundle; cache result by `bundle.lastModified`. |
| Bundle migration breaks existing runs | Low | New column is additive (`bundle_id` nullable, default NULL). Existing runs stay unbundled and render as solo cards exactly as today. |
| Cost preview math drifts from actual spend | Medium | Use per-actor average from the most recent 100 completed runs of the same scenario as the preview number, instead of a hardcoded $0.30. Server endpoint: `/api/v1/scenarios/:id/cost-estimate`. Falls back to $0.30 when no history exists. |
| Compare modal vs RunDetailDrawer z-index collision | Low | Modal at z-index 100, drawer at z-index 200 (existing). Verified the drawer can stack on top of the modal. |
| User submits 50 actors and abandons mid-compile, wasting LLM spend | Medium | Submit button label encodes cost. Dashboard tab shows running-bundle indicator with "Cancel bundle" affordance. /setup already wires AbortController; route it through to the batch runner. |
