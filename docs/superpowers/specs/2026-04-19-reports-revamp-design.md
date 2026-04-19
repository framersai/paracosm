---
title: "Paracosm Reports Revamp: Hero, Run Strip, Sparklines, Divergence Weight, Side-Nav"
date: 2026-04-19
status: design, execution-ready
scope: paracosm dashboard only (no server, SSE, or data-model changes)
---

# Paracosm Reports Revamp

The reports tab currently dumps every feature of a run as a vertical wall of text: meta-pills describing the report, a verdict card, a cost strip, per-turn event blocks, a forged-toolbox list, a references list. All the information is present. The problem is comprehension: a user cannot answer "what happened in this run?" in under a minute without reading the whole thing.

This spec replaces the current opening with a hero scoreboard, adds a compact run strip, overlays per-metric sparklines across all turns, gives divergent turns visual weight, and installs a sticky side-nav. Nothing existing is deleted. The verbose per-turn body and the toolbox + references sections remain.

## Problem

Observed from a real 6-turn run on production:

1. **First-fold is metadata, not substance.** [ReportView.tsx:245-332](../../../src/cli/dashboard/src/components/reports/ReportView.tsx#L245-L332) renders two boxes titled "Scenario Focus" and "This Run Produced", which list section names ("Crisis", "Forged toolbox", ...) without showing any run content. Users scroll past this to find the verdict.
2. **Final stats are buried inside the verdict card.** The A-vs-B comparison (population, morale, food, power, modules, science, tools forged) lives inside `VerdictPanel` at [VerdictCard](../../../src/cli/dashboard/src/components/sim/VerdictCard.tsx). It is a primary comparison and belongs at the top, not embedded in a dismissible verdict banner.
3. **Run shape is invisible.** The 6-turn arc (outcomes over time, when divergence started) can only be seen by reading 6 turn cards in sequence. No visual summary.
4. **Metric trajectories exist in data, not in UI.** Each turn emits a colony state snapshot (population, morale, food, power, modules, science). The UI shows only the final snapshot. Users cannot see when population collapsed, where morale crossed zero, or which metric actually drove the verdict.
5. **Divergent turns look identical to shared turns.** [ReportView.tsx:416-436](../../../src/cli/dashboard/src/components/reports/ReportView.tsx#L416-L436) uses the same card shell for every turn and labels divergence only with a small text pill in the header. Users do not scan-find divergent turns.
6. **Long reports offer no navigation.** A 6-turn run with toolbox + references can exceed 30 screen heights. No way to jump between sections without manual scrolling.

## Goals

1. Replace the opening meta-pill strip with a hero scoreboard showing winner, one-sentence divergence, and the existing final-stats comparison rendered as a clean A-vs-B strip.
2. Add a compact **run strip** (horizontal 1-row timeline) below the hero: per-turn outcome badges for A and B, click to scroll to that turn.
3. Add six per-metric **sparklines** (population, morale, food, power, modules, science) overlaying A vs B across all turns.
4. Give **divergent turns** a left-border accent and tinted background; leave shared turns muted.
5. Install a **sticky side-nav** (right rail on desktop, horizontal anchor strip on mobile) with jump links to: Summary (Hero), Verdict, Strip, Sparklines, Trajectory, each Turn, Toolbox, References.
6. Keep every existing feature: verdict modal, per-turn event bodies, agent voices, forged toolbox, references, cost breakdown, commander trajectory cards, scenario-focus metadata.

## Non-Goals

- No changes to SSE event shapes, orchestrator emission, or `useGameState` derivation logic. All new surfaces read from existing in-memory state.
- No new dependencies. Sparklines reuse the inline-SVG pattern from [CommanderTrajectoryCard.tsx](../../../src/cli/dashboard/src/components/reports/CommanderTrajectoryCard.tsx).
- No changes to the verdict modal (`VerdictPanel`), cost modal (`CostBreakdownModal`), or the shared `ToolboxSection` / `ReferencesSection` components. They keep their current APIs.
- Agent-voices re-clustering (the brainstorm's secondary option F), toolbox matrix layout (option G), and hover-card citations (option H) are explicitly deferred to a follow-up spec.
- No export format changes. The existing "EXPORT MD" button keeps its current behavior.

## Architecture

### File structure

New components, all under `src/cli/dashboard/src/components/reports/`:

- `HeroScoreboard.tsx`: winner badge + one-sentence divergence + A-vs-B stats grid.
- `RunStrip.tsx`: horizontal turn strip with per-side outcome badges.
- `MetricSparklines.tsx`: six SVG sparklines overlaying A vs B.
- `ReportSideNav.tsx`: right-rail on desktop, horizontal strip on mobile. Pure anchors.
- `reports-shared.ts`: shared helpers (outcome to color, metric to series, classify turn as divergent).
- `reports-shared.test.ts`: pure-logic coverage for the helpers above. Component-level React rendering stays verified manually (no RTL in the dashboard, same constraint as the earlier LoadMenu spec).

Modified:

- `ReportView.tsx`: top of the render tree rewired. Hero replaces the meta-pill section. Run strip + sparklines mount below the hero. Side-nav wraps the whole report content. Divergent-turn styling moves inline into the existing per-turn loop via a helper from `reports-shared.ts`. Hook order and existing test surfaces unchanged.

### Component contracts

**`HeroScoreboard`**

```ts
interface HeroScoreboardProps {
  leaderAName: string;
  leaderBName: string;
  verdict: Record<string, unknown> | null | undefined;
  finalStats: {
    a: { population?: number; morale?: number; food?: number; power?: number; modules?: number; science?: number; toolsForged?: number };
    b: { population?: number; morale?: number; food?: number; power?: number; modules?: number; science?: number; toolsForged?: number };
  };
  onViewFullVerdict?: () => void;
}
```

Renders: amber top band with winner name + one-line headline pulled from `verdict.headline || verdict.summary`. Below: seven stat rows (one per metric) showing A value, a thin horizontal bar visualizing the relative split (0..1 normalized within each metric), and B value. Bar fill color matches the winning side. "View full verdict" link at the footer anchor-scrolls to the existing inline `VerdictPanel`, which stays rendered below in its current position; `onViewFullVerdict` is the scroll handler (default: `document.getElementById('verdict')?.scrollIntoView({ behavior: 'smooth' })`).

**`RunStrip`**

```ts
interface RunStripProps {
  turns: Array<{
    turn: number;
    year?: number;
    diverged: boolean;
    a: { icon?: string; outcome?: string; title?: string };
    b: { icon?: string; outcome?: string; title?: string };
  }>;
  onJumpToTurn: (turn: number) => void;
}
```

Renders: one row of N cells (N = turn count). Each cell is a button containing the turn number + year + event icon + two stacked outcome badges (A top, B bottom). Outcome colors: `SAFE_WIN` green, `RISKY_WIN` amber, `SAFE_LOSS` muted rust, `RISKY_LOSS` rust, unknown text-3. Divergent cells get a thicker outline. Click jumps via `onJumpToTurn(n)` which scrolls `#turn-<n>` into view.

**`MetricSparklines`**

```ts
interface MetricSparklinesProps {
  metrics: Array<{
    id: 'population' | 'morale' | 'food' | 'power' | 'modules' | 'science';
    label: string;
    unit?: string;
    a: Array<{ turn: number; value: number }>;
    b: Array<{ turn: number; value: number }>;
  }>;
  sideAColor: string;
  sideBColor: string;
}
```

Renders: 3-column grid (2 on narrow widths) of six compact cards. Each card: metric label + unit top-left, final values A/B top-right, SVG sparkline spanning the card width (60px tall). Two overlaid polylines: A in `sideAColor`, B in `sideBColor`. Horizontal dashed mid-line at metric midpoint for reference. Same SVG + inline-style approach as `CommanderTrajectoryCard`.

**`ReportSideNav`**

```ts
interface ReportSideNavProps {
  items: Array<{ id: string; label: string; turnCount?: number }>;
  /** Currently-visible section id, fed by IntersectionObserver in the parent. */
  activeId?: string;
}
```

Renders: right-fixed rail on widths ≥ 1024px, horizontal sticky strip on narrower widths. Each item is an anchor `<a href={'#' + id}>`. Active item highlighted in amber. Anchor targets are the IDs set on each section in `ReportView`.

**`reports-shared.ts`**

Exports pure functions:

- `outcomeColor(outcome: string | undefined): string` maps outcome strings to CSS variables.
- `classifyTurn(aFirstTitle: string | undefined, bFirstTitle: string | undefined): 'shared' | 'divergent'`.
- `collectMetricSeries(state: GameState): MetricSparklinesProps['metrics']` extracts per-turn colony state snapshots from the SSE event stream for both sides.
- `collectRunStripData(turns: Array<[number, { a: TurnData; b: TurnData }]>): RunStripProps['turns']`.

All helpers are unit-testable with `node:test` and have no React or DOM dependencies.

### Data flow

Same SSE → `useGameState` → `ReportView` path as today. The new helpers derive additional views from the same `state` object:

- Final stats grid: reads `state.a` and `state.b` tail values (already computed for the current verdict panel).
- Sparklines: walks the per-turn colony state snapshots the orchestrator already emits (the `colony` field on each turn's event blocks).
- Run strip: reads each turn's first event's outcome string per side.

No new hooks, no new fetches, no new SSE events.

### Section anchors

In `ReportView`:

- `<section id="hero">` wraps `HeroScoreboard`.
- `<section id="verdict">` wraps the existing inline `VerdictPanel` (unchanged render, new anchor id).
- `<section id="strip">` wraps `RunStrip`.
- `<section id="sparklines">` wraps `MetricSparklines`.
- `<section id="trajectory">` wraps the existing commander trajectory cards.
- `<section id={'turn-' + n}>` per turn in the existing map.
- `<section id="toolbox">` wraps the existing `ToolboxSection`.
- `<section id="references">` wraps the existing `ReferencesSection`.

### Divergent turn styling

Inline in the existing per-turn loop at [ReportView.tsx:416](../../../src/cli/dashboard/src/components/reports/ReportView.tsx#L416). When `diverged === true`:

- `border-left: 3px solid var(--rust)` (was 1px solid var(--border))
- `background: color-mix(in srgb, var(--bg-panel) 90%, var(--rust) 10%)` (was var(--bg-panel))
- The existing uppercase `DIVERGENT` pill keeps its current color.

Shared turns keep their current style unchanged.

### Meta-pill section fate

Not deleted; demoted. The existing "Scenario Focus" and "This Run Produced" cards move to a single collapsible `<details>` block at the very bottom of the report labeled "What's in this report?". Users who want the metadata still have it; it stops dominating the first fold.

## Layout mockup (desktop, ≥ 1024px)

```
┌─────────────────────────────────────────────────────────────────────┐
│ [SideNav]  HERO SCOREBOARD                                          │
│            Winner: Aria Chen                                        │
│            "Aria took risky water; Dietrich played safe on radiation
│             and lost the population battle."                        │
│                                                                     │
│            Population  |===========|====|    A:3   B:4              │
│            Morale      |===|=======|       A:14%  B:9%              │
│            Food        |==========|=======| A:114  B:82             │
│            ...                                                      │
│                                                                     │
│            [View full verdict]                                      │
├─────────────────────────────────────────────────────────────────────┤
│ [SideNav]  VERDICT (existing VerdictPanel, unchanged content)       │
├─────────────────────────────────────────────────────────────────────┤
│ [SideNav]  RUN STRIP                                                │
│            [T1 Y35] [T2 Y43] [T3 Y51] [T4 Y59] [T5 Y67] [T6 Y75]    │
│             A SAFE   A SAFE   A SAFE   A SAFE   A SAFE   A SAFE    │
│             B SAFE   B SAFE   B SAFE   B SAFE   B SAFE   B SAFE    │
│             shared  ╳diverg  ╳diverg  ╳diverg  ╳diverg   shared    │
├─────────────────────────────────────────────────────────────────────┤
│ [SideNav]  METRIC SPARKLINES                                        │
│            ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│            │Population│ │  Morale  │ │   Food   │                  │
│            │ ~~~~~~   │ │ ~~~~~~~~ │ │ ~~~~~~   │                  │
│            │ ~~~~~    │ │ ~~~      │ │ ~~~~     │                  │
│            └──────────┘ └──────────┘ └──────────┘                  │
│            ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│            │  Power   │ │ Modules  │ │ Science  │                  │
│            ...                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ [SideNav]  TRAJECTORY (existing CommanderTrajectoryCard, unchanged) │
├─────────────────────────────────────────────────────────────────────┤
│ [SideNav]  TURN 1 Y2035 · SHARED                                    │
│            (existing turn card, unchanged content)                  │
├─────────────────────────────────────────────────────────────────────┤
│ [SideNav]  TURN 2 Y2043 · DIVERGENT       <- rust left border       │
│            (existing turn card, tinted bg)                          │
├─────────────────────────────────────────────────────────────────────┤
│ ... remaining turns ...                                             │
├─────────────────────────────────────────────────────────────────────┤
│ [SideNav]  FORGED TOOLBOX (existing ToolboxSection, unchanged)      │
├─────────────────────────────────────────────────────────────────────┤
│ [SideNav]  REFERENCES (existing ReferencesSection, unchanged)       │
├─────────────────────────────────────────────────────────────────────┤
│            ▸ What's in this report? (demoted meta-pill section)     │
└─────────────────────────────────────────────────────────────────────┘
```

`[SideNav]` is a fixed-position right rail on desktop, showing current-section highlight via IntersectionObserver. On widths under 1024px it collapses to a horizontal strip between the hero and the run strip.

## Testing

Pure-logic tests (`node:test`):

- `reports-shared.test.ts`: `outcomeColor` branches for every known outcome string; `classifyTurn` returns 'shared' when titles match, 'divergent' when they differ or one side is missing; `collectMetricSeries` extracts six metrics per side from a synthetic event stream; `collectRunStripData` builds the right cell list.

Component render smoke-tests are out of scope (no RTL in the repo, same as previous spec). Manual verification steps are listed in the implementation plan.

## Risks

- **Empty runs.** If `state` has no events yet the report shows the existing empty-state early return (kept, now above all new hooks per the fix in commit b2defee). Hero/strip/sparklines never mount in that branch.
- **Missing metrics.** Scenarios emitting fewer than six metrics: `MetricSparklines` renders only the ones present. Cards for missing metrics are omitted, not shown blank.
- **Tall viewports vs side-nav.** On desktop widths under 1280px the side-nav rail is 140px wide and the content column shrinks. Below 1024px the nav becomes a sticky horizontal strip so the content gets full width back.
- **Divergent-styling contrast.** `color-mix` is widely supported (Safari 16.2+, Chrome 111+). Fallback for older engines: skip the tint, keep only the `border-left`. Graceful.
- **Scrolling behavior.** The existing tail-to-bottom auto-scroll in the report must not conflict with anchor jumps. When the user clicks a side-nav anchor, set `pinnedRef.current = false` so the autoscroll releases.

## Rollout

One branch, one commit per sub-unit (hero, strip, sparklines, side-nav, divergent styling, wiring), one PR. The verdict modal, cost modal, toolbox, references, trajectory cards, and turn event bodies are unchanged; behavior equivalence is verifiable by spot-checking any existing run. No feature flag: the revamp is additive at the top (hero + strip + sparklines + side-nav) and strictly visual elsewhere (divergent turn weight, demoted meta-pill section).
