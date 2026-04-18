---
title: "Paracosm Viz Panel Rethink"
date: 2026-04-18
status: design — execution-ready
scope: paracosm dashboard only (no runtime changes)
---

# Paracosm Viz Panel Rethink

User tested MOOD / FORGE / ECOLOGY in the Viz tab and reported they "don't work" and "aren't informative." Code review confirmed one real bug, one self-defeating design, and one under-differentiated view. This spec replaces all three with informative-first designs that use the data the sim already emits.

## Diagnosis (why the current versions fail)

- **MOOD — Conway's Game of Life seeded from sim state.** Rules kill a cell that doesn't have 2-3 alive neighbors. `sprayPattern` stamps an organic cluster per alive colonist with 65% stochastic fill — most stamped cells don't form stable Conway shapes, so they die on the next generation. Between turns the grid looks empty even when the sim is running.
- **FORGE — particle overlay over MOOD.** `forge.ts:112 refreshDeptCenters` iterates `mood.cells` reading `cell.department`, but [`MoodCell`](../../../src/cli/dashboard/src/components/viz/automaton/modes/mood.ts#L40) has no `department` field. `deptCenters` is always empty, every tick path short-circuits at `if (!origin) continue`, and no particles ever spawn. What users see is the underlying MOOD grid bleeding through.
- **ECOLOGY — static sector grid.** Geometry is deterministic (same scenario → identical grid). Only health shading + population dots + stamps vary between leaders. The visual divergence reads as "the two panels look the same."

## Goals

1. Every panel renders SIM data directly — a user reading the Viz tab can answer "what's happening to this colony right now" without context from other tabs.
2. Two leaders' panels look clearly different from turn 1 as their state diverges.
3. Scenario-agnostic. No Mars-specific assumptions (ecology uses generic `metrics[]`, mood uses `snapshot.cells`, forge uses `forgeAttempts[]`).
4. No runtime changes. All three replacements consume data the runtime already emits.

## Non-Goals

- Changing the runtime's SSE schema.
- Building new telemetry surfaces (that's what sub-project C/F/E already shipped).
- Keeping the current Conway / particle aesthetic. The rethink replaces the visual metaphor, not polishes it.

## Architecture

### MOOD → Colonist Cloud

**One dot per alive colonist.** Position: clustered within a per-department circle; within-circle position hashed by agentId so it's stable. Color: `moodRgb(c.mood)`. Size: slightly larger for featured, smaller for regular. Fade to a ghost outline on death (persists for one turn, then removed).

Visible signal per glance:
- **Pop size** — cloud density
- **Mood distribution** — color composition at a glance (green dominant = hopeful colony, red-orange = anxious)
- **Dept balance** — cluster sizes
- **Recent deaths** — ghost outlines fading out

Implementation sketch: drop Conway entirely. `MoodState` becomes `{ positionsById: Map<agentId, {x, y}>, layoutKey }`. `tickMood` refreshes only when roster changes (deaths, promotions). `drawMood` iterates `snapshot.cells` each frame, draws one hex-shape dot per colonist at its cached position.

### FORGE → Tool Lineage Tree

**Horizontal dendrogram.** Root on the left, branches extending right per turn. Each branch is one forge attempt (approved = solid colored by dept, rejected = dashed gray, reused = curved arc from originator). Re-forges of the same name converge to the same endpoint so the user sees retry chains clearly.

Visible signal per glance:
- **Approval rate** — ratio of solid vs dashed branches
- **Reuse density** — count of arcs pointing back at earlier nodes
- **Per-dept productivity** — branch clusters colored by department
- **Terminal failures** — dashed branches with no solid sibling

Implementation: read `forgeAttempts[]` + `toolReuses[]` from the state already populated by the runtime. `ForgeState` drops its particle pool, becomes `{ nodes: ForgeNode[], arcs: ForgeArc[] }`. Layout = simple left-to-right by turn, vertical stacking by dept.

### ECOLOGY → Metrics Heatmap

**Grid of metric tiles, one per scenario metric.** Tile color = health (green = healthy, amber = stressed, red = critical). Tile size: fixed. Labels: metric id + current value below each tile. Overlay ticks for recent events (radiation spike on the power tile, death wipe on population, etc.).

Visible signal per glance:
- **Which metrics are in the red** — immediate triage
- **Delta from previous turn** — up/down arrow on each tile
- **Event impact** — overlay ticks show "this metric took a hit last turn"
- **Scenario-agnostic** — Mercury / Lunar / Mars / Submarine all render the same way; the metric set comes from `scenario.metrics[]`

Implementation: read `scenario.metrics[]` for the layout, `snapshot.colony[metric.id]` for values. Health threshold logic derived from `metric.format` + metadata already in the scenario JSON.

## Modified modules

```
src/cli/dashboard/src/components/viz/automaton/modes/
  mood.ts          FULL REWRITE — Colonist Cloud, no Conway, no hex grid
  forge.ts         FULL REWRITE — Lineage Tree, no particle pool
  ecology.ts       FULL REWRITE — Metrics Heatmap, scenario-driven
  shared.ts        touch: add ghostRgb() helper for fading dead dots
```

Backward compat: mode IDs stay `mood` / `forge` / `ecology` so the tab selector + persistence both keep working. Only the renderer internals change. Type exports for `MoodState` / `ForgeState` / `EcologyState` are re-defined — external consumers outside the `automaton/` folder that imported these types will need updating; verified via grep that only the `AutomatonBand.tsx` parent consumes them.

## Data flow

```
SSE events → useGameState → state.a.snapshots[] (per-turn snapshots)
                         → state.a.forgeAttempts[], state.a.toolReuses[]
                         → scenario.metrics[]

Viz tab render loop:
  mood   → draw dots from state.a.snapshot.cells
  forge  → draw tree from state.a.forgeAttempts + state.a.toolReuses
  ecology→ draw grid from scenario.metrics + state.a.snapshot.colony
```

Zero new SSE events, zero new runtime plumbing.

## Risks

1. **Colonist cloud layout when the colony is small.** 3 colonists shown as 3 dots in a circle of one dept. Mitigation: when `alive.length < 5`, fallback to a cleaner layout (single row, labeled). Already handled by checking `alive.length` before rendering.
2. **Lineage tree vertical overflow when many forges per turn.** Mitigation: cap visible rows at 8, show "+N more" link.
3. **Metrics heatmap label legibility on mobile.** Mitigation: tile min-size 56px + aspect-maintained text fitting; on narrow viewports, single-column layout.
4. **Animation/motion expectations.** Current designs had ambient motion (Conway pulse, particle drift); new designs are more static. Mitigation: add a subtle per-turn transition animation (dots fade-in on birth, tree nodes grow in on new forge). Keeps the "this is live data" feeling without Conway/particle overhead.

## Testing

- Manual verification against Mars + mission_mercury scenarios.
- Unit tests for each mode's layout calculation (`shared.test.ts` already has setup; add `mood.test.ts`, `forge.test.ts`, `ecology.test.ts` pure-function tests for position/node/tile derivation from canonical snapshots).
- Visual: screenshot test harness exists in the dashboard? (to verify — if not, manual screenshots suffice for this scope.)

## Success Criteria

- On a 6-turn Mars run: MOOD shows distinct dept clusters, FORGE shows ~15 approved nodes + ~3 dashed rejected siblings, ECOLOGY shows morale + food + power tiles in varying health colors. Two leader panels have visibly different content from turn 2 onward.
- On a 3-turn mission_mercury run with only 2 depts: all three panels render without empty states or errors.
- Existing tab-switch + maximize button keeps working.
- No runtime or SSE changes.
