# Constellation View Design

**Status:** Approved (2026-04-28)
**Author:** session brainstorm
**Scope:** Single sub-project. Library + Studio integration deferred to follow-up specs.

## Goal

Render N≥3 actors during a live Sim as nodes on a radial layout, with edges weighted by inter-actor HEXACO similarity, instead of forcing the user into the Side-by-side layout that hard-caps at 2. Quickstart bundles already support 1–50 actors at the API level; the Sim tab today silently drops everything past `state.actorIds[1]`. Constellation closes that gap.

This is the visual companion to Quickstart's parallel-N-actor runs: one node per actor, a click drills into that actor's full report, edge color signals which personalities are pulling toward each other.

## Non-goals

- Library bundle integration (RunDetailDrawer "View as Constellation"). Separate v1.1 spec.
- Studio integration (rendering a dropped JSON bundle as constellation). Separate v1.2 spec.
- Edge-metric toggles (trajectory similarity, decision agreement). v2.
- Turn-by-turn animation of how the constellation evolves over time. v2.
- Pin/unpin nodes, export PNG/SVG, drag-rearrange. v2.

## Architecture

A new layout mode inside the existing Sim tab. The header gets a tiny `Side-by-side | Constellation` toggle; the body switches between the existing `StatsBar + 2× ActorBar` render and the new `ConstellationView`. No new tabs, no new server routes, no new SSE shape.

**Data flow:** `ConstellationView` consumes the same `GameState` the rest of Sim already reads. Re-renders on every SSE batch — same cadence as today. No artifact import, no Library fetch, no Studio.

**Default layout per actor count:**
- N≤2: Side-by-side stays default. Toggle still works (lets a power user view a 2-actor run as a constellation if they want), but the user has to opt in.
- N≥3: Constellation becomes the default. Side-by-side option is disabled with a tooltip ("Side-by-side caps at 2 actors").

**Why a single layout toggle, not an auto-switch:** explicit toggle is one click; auto-switching surprises users who already have a mental model of side-by-side from a 2-actor run. The N≥3 default is informational ("the side-by-side layout literally won't fit"), not magical.

## Components

| File | Responsibility |
|---|---|
| `src/cli/dashboard/src/components/sim/computeHexacoDistances.ts` | Pure helper. Input: `Array<{ name: string; hexaco: HexacoProfile }>`. Output: `{ pairs: Array<{ a: string; b: string; distance: number; normalized: number }> }`. Euclidean over six axes; normalized = `distance / maxDistance` so caller maps `[0,1]` to opacity. |
| `src/cli/dashboard/src/components/sim/computeHexacoDistances.test.ts` | Unit tests: 0/1 actors → empty pairs, identical pair → distance 0, max-distance pair → normalized 1, missing hexaco → defaults to 0.5 across axes. |
| `src/cli/dashboard/src/components/sim/ConstellationView.tsx` | SVG renderer. Reads `state.actorIds`, builds positions on a circle (radius scales with N), draws edges + nodes + labels. Click on a node calls `onActorClick(name)`. ~200 LOC. |
| `src/cli/dashboard/src/components/sim/ConstellationView.test.tsx` | Render tests: 3, 5, 50 actors → asserts node count, edge count = N×(N-1)/2, click handler fires. SSR via `react-dom/server`. |
| `src/cli/dashboard/src/components/sim/ConstellationView.module.scss` | Constellation-specific styles (node hover, edge gradient stops, label rotation). |
| `src/cli/dashboard/src/components/sim/SimLayoutToggle.tsx` | The two-state toggle group. Disables Side-by-side when `actorCount > 2` with a `title` tooltip explaining why. |
| `src/cli/dashboard/src/components/sim/ActorDrillInModal.tsx` | Modal with `<ActorBar>` header + vertical timeline of `state.actors[name].events` + decisions list. Reuses CompareModal's focus-trap + Esc-to-close pattern. |
| `src/cli/dashboard/src/components/sim/ActorDrillInModal.test.tsx` | Renders modal for a 3-actor state with `actorName='Aria'`, asserts only Aria's events appear, asserts Esc invokes onClose. |
| `src/cli/dashboard/src/components/sim/SimView.tsx` | **Modify.** Add layout state, render layout toggle, switch body between existing layout and Constellation. |

~600 LOC total. Zero new dependencies.

## Layout math

Actors arranged on a circle of radius `r = max(120, 60 + 12 × N)` pixels (clamped at 460 for N=50). Each actor i is placed at angle `θ_i = (i / N) × 2π - π/2` so actor 0 sits at 12 o'clock and the rest fan clockwise. Container is a square SVG sized to `2r + 2 × labelMargin` where `labelMargin = 80`.

Node radius = 18px. Hovering a node lifts radius to 22px and surfaces a tooltip with `actor.name`, `actor.archetype`, and `actor.unit`.

Edges drawn between every pair (full graph). Edge `(i,j)` opacity = `1 - normalizedDistance(i,j)` clamped to `[0.06, 0.95]` so identical-personality pairs are bright and maximally-divergent pairs fade out without disappearing entirely. Stroke width = 1.5px throughout.

## Edge metric: HEXACO Euclidean distance

```ts
distance(a, b) = sqrt(
  (a.openness - b.openness)² +
  (a.conscientiousness - b.conscientiousness)² +
  (a.extraversion - b.extraversion)² +
  (a.agreeableness - b.agreeableness)² +
  (a.emotionality - b.emotionality)² +
  (a.honestyHumility - b.honestyHumility)²
)
```

Max possible distance with HEXACO axes in `[0,1]` is `sqrt(6) ≈ 2.449`. We normalize against the **observed** max in the visible set (not the theoretical max) so the contrast stays visible even when all actors cluster (e.g., a Quickstart that happens to spawn six near-twins).

Missing `hexaco` field defaults each axis to `0.5` to avoid distorting the layout when one actor lacks a profile (legacy data, mid-stream sim where HEXACO hasn't broadcast yet).

## Drill-in

Click any node → opens `ActorDrillInModal`. The modal:

1. Renders a focused per-actor view: the existing `<ActorBar>` (header chip + HEXACO bars + spark histories) on top, followed by a vertical list of the actor's events from `state.actors[name].events`
2. Provides Esc-to-close + click-backdrop-to-close
3. Returns focus to the clicked node on close (a11y pattern from `CompareModal`)

**Why not reuse `ReportView` wholesale:** `ReportView` reads `state.actorIds[0]` and `state.actorIds[1]` directly (verified at `src/cli/dashboard/src/components/reports/ReportView.tsx:177-275`), so passing it a single-actor filtered state would render an empty B-column. The modal needs a focused single-actor presentation instead.

**Modal contents:**

- `<ActorBar>` reused as-is (top-of-modal header). Already takes `leader`, `popHistory`, `moraleHistory`, `actorIndex`, `verdictPlacement` — all available on the `ActorSideState`.
- Events list: maps `state.actors[name].events` (a `ProcessedEvent[]`) into a vertical timeline of turn cards. Group events by `event.turn` for a per-turn fold; within each group, render lightly (event type + title + summary).
- Decisions section: filters `state.actors[name].events` to entries with `type === 'decision_made'` and renders title + outcome. Note: `state.actors[name].decisions` on `ActorSideState` is a **count** (number), not an array — decisions live in the events stream.

This is ~120 LOC of glue code with no new visual primitives.

## SimView integration

`SimView.tsx` adds:

1. `const [layout, setLayout] = useState<'side-by-side' | 'constellation'>(() => state.actorIds.length >= 3 ? 'constellation' : 'side-by-side')`
2. Effect: when `actorIds.length` crosses the threshold mid-run (rare — actors arrive over the first 1-2 seconds of a sim), the default flips to constellation. Manual selection sticks via a separate `userOverride` ref.
3. `<SimLayoutToggle layout={layout} onChange={setLayout} actorCount={state.actorIds.length} />` rendered in the header
4. Body: `{layout === 'constellation' ? <ConstellationView state={state} onActorClick={openDrill} /> : <existing layout>}`
5. `const [drillInActor, setDrillInActor] = useState<string | null>(null)` + `<ActorDrillInModal actorName={drillInActor} state={state} verdict={verdict} reportSections={...} onClose={() => setDrillInActor(null)} />`

The existing `<StatsBar actors={state.actorIds.slice(0, 2).map(...)}>` line stays inside the Side-by-side branch — Constellation owns its own header presentation, no shared StatsBar required. Future work: a "Constellation Stats" strip showing aggregate cost / turn / decision-count across all N. Out of v1 scope.

## Testing strategy

| Test | Target |
|---|---|
| `computeHexacoDistances.test.ts` | 0 actors, 1 actor, 2 identical, 2 max-distance, missing hexaco fallback, normalization correctness |
| `ConstellationView.test.tsx` | Renders N=3 → 3 nodes + 3 edges; N=5 → 5 nodes + 10 edges; N=50 → 50 nodes + 1225 edges (perf sanity); click invokes `onActorClick` with the right name |
| `ActorDrillInModal.test.tsx` | When `actorName='Aria'` is set, only Aria's events render; Esc invokes `onClose`; backdrop click invokes `onClose` |
| `SimLayoutToggle.test.tsx` | At `actorCount=2`, both options enabled; at `actorCount=3`, Side-by-side disabled with tooltip |

All component tests use `react-dom/server` `renderToString` (existing pattern in the codebase, no DOM shim needed).

## Performance

50 nodes × 1225 edges renders as ~1300 SVG elements per frame. React reconciliation is the bottleneck, not browser rendering. Mitigations:

- `useMemo` the position table and the distances map (recomputed only when `actorIds` length changes — actors don't drift positions mid-run)
- Stable `key` on each `<circle>` and `<line>` so React only diffs the small set of nodes whose state changed
- No CSS transitions on edges (a 50-actor sim broadcasting at 1 Hz would otherwise burn GPU)

Worst-case measured budget: 16ms per render at 50 actors on a 2024 MacBook (target < 1 frame at 60fps). Spec-validated, not measured. If real measurement exceeds 16ms in v1, the fallback is to throttle Constellation re-renders to 2 Hz independent of SSE cadence.

## Errors / edge cases

- N=0 (run not started yet): show empty-state placeholder ("Constellation will appear when actors are launched"). No crash.
- N=1: render the single node centered, no edges. Tooltip on the node still works.
- Missing `hexaco` on one or more actors: distances default to 0.5-vs-0.5 axes; the affected pairs render at 0 distance (full opacity). This is a legible signal that the actor lacks personality data, rather than a layout bug.
- Actor count grows mid-run: the layout reflows automatically (positions recalc on `actorIds.length` change). The grow-from-zero-to-three transition happens in the first 1–2 seconds of a sim and isn't user-visible during that window.

## Open questions

None blocking. Two minor follow-ups noted for after v1:

- Edge-metric toggle (HEXACO vs trajectory cosine vs decision agreement). Useful for "show me which actors decided alike, not which had similar personalities".
- Library RunDetailDrawer "View as Constellation" affordance, so a stored bundle's members render in this layout without re-running.
