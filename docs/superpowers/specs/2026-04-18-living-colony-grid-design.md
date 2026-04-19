---
title: "Living Colony Grid — Unified Cellular Automata Viz"
date: 2026-04-18
status: design — awaiting user review
scope: paracosm dashboard only (no runtime changes)
replaces: docs/superpowers/specs/2026-04-18-viz-rethink-design.md
---

# Living Colony Grid — Unified Cellular Automata Viz

## Problem

The current Viz tab renders three tab-exclusive modes — MOOD (dot cloud), FORGE (turn×dept scatter), ECOLOGY (rectangular metric tiles with sparklines). They read as "product-card widgets," not as a simulation. Screenshots show the ECOLOGY mode in particular as a grid of rectangular metric cards — blocky, static, dashboard-style, not alive.

The prior rethink spec (`2026-04-18-viz-rethink-design.md`) optimized for "informative" at the cost of "alive." This spec reverses that trade: the Viz tab should feel like a living cellular simulation — organic, emergent, continuously breathing — while preserving every piece of drilldown fidelity the current modes offer.

## Solution Overview

Replace the three exclusive modes with **one unified living-colony grid per leader**. The grid is a multi-layered cellular simulation:

1. **Reaction-diffusion base** (WebGL2 Gray-Scott shader) — organic Turing-pattern field that encodes colony vitality vs stress. Never stops breathing between turns.
2. **Colonist seeds** (Canvas2D) — each alive colonist injects mood-coded chemistry into the field at a stable hashed position within their dept cluster.
3. **Event flares** (Canvas2D) — births / deaths / forges / reuses / crises fire propagating chemistry waves.
4. **Colonist glyphs** (Canvas2D) — thin outlined markers layered on top as hover/click targets.
5. **HUD overlay** (Canvas2D text) — cockpit-style corner readouts replace the old metric cards.

The three old modes become **composable layer presets** (Living / Mood / Forge / Ecology / Divergence), not exclusive views. Muscle memory preserved, but the underlying viz is always the same living grid.

## Goals

1. **Alive at a glance** — the grid visibly evolves between turns, not just on turn-tick. Two leaders' grids diverge into organically distinct patterns by turn 2.
2. **Full fidelity preserved** — every hover, click, popover, drilldown, keyboard shortcut, and cluster-mode option from the current viz has a home in the new grid.
3. **Scenario-agnostic** — works for Mars, mission_mercury, submarine, any scenario. Uses existing `TurnSnapshot` + `forgeAttempts[]` + `reuseCalls[]` data; no runtime changes.
4. **Zero new dependencies** — WebGL2 + Canvas2D native APIs only.
5. **30fps sustained** — both leaders on screen, all layers on, 2019-era integrated GPU.
6. **Graceful degradation** — WebGL2 missing → Canvas2D fallback. `prefers-reduced-motion` → static snapshot.

## Non-Goals

- Runtime / SSE schema changes.
- New telemetry surfaces.
- Keeping the metric-card visual metaphor. The rethink replaces the metaphor, not polishes it.
- External visualization libraries (d3, regl, three.js, etc.).

---

## Architecture

### Render Pipeline (per leader)

```
┌─────────────────────────────────────────────────────────┐
│ WebGL2 canvas (back) — Gray-Scott RD shader             │
│   2 ping-pong framebuffers, 512×320 logical             │
│   30Hz continuous, pauses when off-screen / tab hidden  │
│   ~1.1ms GPU per leader per frame                       │
└─────────────────────────────────────────────────────────┘
                          ↑
┌─────────────────────────────────────────────────────────┐
│ Canvas2D canvas (front) — overlays + interactivity      │
│   Seeds, glyphs, flares, lines, HUD, hit-testing        │
│   Redrawn only when state changes                       │
│   ~1.4ms CPU per leader per frame                       │
└─────────────────────────────────────────────────────────┘
```

Two stacks side by side, one per leader. Shared 30Hz tick clock. Independent chemistry.

### Layer Stack (bottom → top)

| # | Layer | Renderer | Driven by |
|---|---|---|---|
| 1 | `FIELD` | WebGL2 | Global F, k from colony-health + colony-stress metrics |
| 2 | `SEEDS` | Canvas2D | Per-colonist chemistry injection (mood → U or V) |
| 3 | `FLARES` | Canvas2D | Event queue (births, deaths, forges, reuses, crises) |
| 4 | `GLYPHS` | Canvas2D | Colonist outline markers for hit-testing |
| 5 | `LINES` | Canvas2D | Partner + child connection arcs |
| 6 | `HUD` | Canvas2D | Cockpit-style metric readouts (morale, pop, food, births, deaths) |

Each layer is independently toggleable via a chip bar at the top edge. Layer state is shared across both leaders so panels stay comparable.

---

## Sim → Chemistry Mapping

### Gray-Scott Equations

```
∂U/∂t = Du·∇²U − UV² + F(1−U)    ← vitality
∂V/∂t = Dv·∇²V + UV² − (F+k)V    ← stress
```

Constants: `Du = 1.0`, `Dv = 0.5`. Pattern regime controlled by `(F, k)`.

### Global Parameter Mapping

Computed per leader, per tick, from current `TurnSnapshot`:

```typescript
const healthNorm = clamp(
  snapshot.morale
  * clamp(snapshot.foodReserve / 18, 0, 1)
  * (snapshot.population / initialPopulation),
  0, 1
);

const stressNorm = clamp(
  snapshot.deaths / 5
  + crisisIntensity        // from eventCategories
  + anxiousFraction,       // from cells.filter(c => c.mood === 'anxious').length / alive
  0, 1
);

const F = lerp(0.018, 0.055, healthNorm);   // bloom regime when healthy
const k = lerp(0.045, 0.070, stressNorm);   // kill regime when stressed
```

Sweet spots (visible in the regime chart):
- `(F=0.018, k=0.045)` → wobbling / collapsing worms — dying colony
- `(F=0.055, k=0.062)` → stable coral-like spots — thriving colony

Intermediate states smoothly interpolate between the two visual regimes.

### Local Injections (per colonist, per tick)

```typescript
const moodContrib = {
  positive:  +0.9, hopeful: +0.6, neutral:  0.0,
  anxious:   −0.5, negative: −0.8, defiant: −0.6, resigned: −0.7,
}[c.mood];

const sizeMult = c.featured ? 1.8 : 1.0;
const strength = 0.12 * sizeMult * c.psychScore;

if (moodContrib > 0) {
  U_buffer[gx, gy] += strength * moodContrib;   // bloom
} else {
  V_buffer[gx, gy] += strength * Math.abs(moodContrib);   // decay
}
```

Applied with a 3×3 Gaussian brush so each seed emits a smooth halo, not a single pixel. Dead colonists continue emitting V for 60 frames post-death as an ash smear.

### Event → Flare Table

| Sim event | Injection | Decay | Visual |
|---|---|---|---|
| `birth` | `U += 0.9` radial 8px at parent-dept center | 30 frames | Bright green bloom spreading outward |
| `death` | `V += 0.7` radial 6px at colonist position | 60 frames | Grey ashen wave |
| `forge_attempt` approved | `U += 0.5` at dept center + amber tint | 20 frames | Amber ripple + spark |
| `forge_attempt` rejected | `V += 0.4` at dept center | 15 frames | Brief red splash |
| `reuse` | Traveling amber arc origin → calling dept; `U += 0.3` at endpoint | 25 frames | Comet arc, lands as bloom |
| `crisis` (category-gated) | Global `F -= 0.012`, `k += 0.008` for 90 frames + red radial ring | 90 frames | Shockwave + pattern destabilization |
| `turn_done` | 5× RD fast-forward over ~500ms, then resume 1× | — | Visible fast-forward shimmer |

All waves are additive and composite cleanly. Flare queue capped at 30 active flares; oldest expire first.

### Colonist Position Mapping

Repurposes the existing `ClusterMode` toggle (`families | departments | mood | age`) to control colonist seed positions within the grid:

| Mode | Layout |
|---|---|
| `departments` (default) | Circular ring of dept clusters; within-cluster position hashed by agentId |
| `families` | Partnered pods as tight triplets/quads; solo colonists in outer ring |
| `mood` | Horizontal band: positive left, negative right, neutral middle |
| `age` | Vertical gradient: young up, old down |

Position is a pure function `(agentId, clusterMode, canvasW, canvasH) → {x, y}` — deterministic and stable across re-renders. Changes animate smoothly (200ms ease).

### Cross-Leader Divergence

Both leaders run identical RD code on their own inputs. Divergence emerges organically as the two leaders' decisions push `(F, k)` in different directions. By turn 2, panels look visibly distinct.

The existing "show divergence" toggle becomes a **Divergence preset** that adds a third diff strip between the panels visualizing `|U_a − U_b|` as a heat gradient — bright pixels mark where the two chemistries disagree most.

### Tick Cadence

- **RD simulation tick:** 30Hz continuous, pauses on `visibilitychange: hidden`, `IntersectionObserver: off-screen`, or `prefers-reduced-motion: reduce`.
- **Colonist injection:** every RD tick, using cached positions + current snapshot.
- **Event flare seeding:** on SSE event arrival, not synced to RD tick.
- **Turn transition:** when a new `turn_done` lands, fast-forward RD 5× over ~500ms so the pattern visibly adapts to the new state, then resume 1×.

Between turns the grid never freezes — chemistry keeps reacting to injected seeds and settling toward equilibrium. That's what makes it feel alive.

---

## Interactions & Fidelity

### Layer Toggle Panel

```
[FIELD]  [SEEDS]  [FLARES]  [GLYPHS]  [LINES]  [HUD]   |   [DIVERGENCE]   |   ⤢  ×
   ●        ●        ●         ●        ○        ●            ○
```

Each chip is an inclusive toggle (●=on, ○=off). Default state shown above: `FIELD`, `SEEDS`, `FLARES`, `GLYPHS`, `HUD` default on; `LINES` defaults off (partner/child arcs can crowd the grid at high population, so opt-in); `DIVERGENCE` defaults off. Shared across both leaders: toggling on leader A also toggles leader B so panels stay comparable.

### Presets (muscle-memory bridge)

| Preset | FIELD | SEEDS | FLARES | GLYPHS | LINES | HUD | Event filter |
|---|---|---|---|---|---|---|---|
| `Living` (default) | ● | ● | ● | ● | ● | ● | all |
| `Mood` | ● | ● | ● | ● | ● | compact | birth/death only |
| `Forge` | dim | outline | ● | ○ | ○ | ● | forge/reuse only |
| `Ecology` | ● | ○ | ● | ○ | ○ | ● | crisis only |
| `Divergence` | diff grid | ● | ○ | ● | ○ | ● | — |

Reachable via `P` to cycle, or by clicking the preset chip.

### Hover (priority cascade)

Hit-test in this order, first match wins:

1. **Colonist glyph** (within 8px) → `{name} · {dept} · {mood}` + mood sparkline
2. **Event flare** (within current flare radius) → `T{turn} · {eventType} · {source}`
3. **Forge arc** (within 4px of curve) → forge name, origin dept, calling dept, outcome, confidence
4. **Empty field** → `vitality {U} · stress {V} · near {nearest-colonist-name}'s halo`

The 4th case is new fidelity: hovering over a pattern tells you *why* it looks that way.

### Click (popovers, not modals)

| Target | Popover content |
|---|---|
| Colonist glyph | Full drilldown — name, dept, role, rank, age, mood, HEXACO radar, partner, children, last 3 memory quotes, psychScore trajectory, click-to-chat button. Floating, arrow points to glyph. Dismiss: click-outside / Esc. |
| Event flare | Pinned event card — what happened, which colonist, turn, fallout metrics delta. Stays until × dismissed. |
| Forge arc/node | Forge lineage card — name, all turns forged, all reuses, confidence history, click-to-jump-to-turn. |
| Empty field | (no-op on click). Right-click / long-press pins a reading crosshair that tracks U/V across turns. |

Viewport-aware placement (auto-flip near edges). Only one colonist popover open at a time.

### Keyboard

| Key | Action |
|---|---|
| `←` / `→` | Step turn |
| `Space` | Play / pause |
| `A` | Collapse band |
| `1`–`6` | Toggle layers FIELD / SEEDS / FLARES / GLYPHS / LINES / HUD |
| `P` | Cycle preset |
| `D` | Toggle divergence diff grid |
| `F` | Toggle family connection lines |
| `R` | Reset chemistry (reseed from current snapshot) |
| `M` | Cycle colonist position mode (depts / families / mood / age) |
| `Esc` | Close open popover / unpin focus |
| `Shift`+`wheel` | Adjust RD simulation speed (0.25× – 4×) |

Help overlay (`?`) lists the legend.

### Scrub Behavior

Per-turn RD snapshots cached in a ring buffer (last 30 turns, ~4MB total, optional downscale to 256×160 → ~30MB cap). Scrubbing to turn N restores that snapshot's `{U, V}` buffers and resumes live evolution from there. Smooth 200ms crossfade. No "reset + re-simulate" jank.

Scrubbing past the latest snapshot stays at latest + shows `waiting…` overlay.

### Accessibility

- **Reduced-motion** — static render: one RD tick, frozen. Event flares render as non-animated symbols (`✦` birth, `✗` death). Layer toggles + hover + click still work.
- **Screen reader** — canvas `aria-label` auto-updates on turn change: `"Living colony grid, turn 3, morale 42%, 14 alive, 2 deaths this turn, pattern stability: degrading."`
- **Keyboard-only** — `Tab` walks glyphs in hashed order; arrow keys navigate within dept; `Enter` = click-to-popover.
- **High contrast** (`prefers-contrast: more`) — swap RD color ramp to `text-2 → text-4` monochrome; thicker glyph outlines.
- **Color-blind** — alt viridis ramp toggleable in Settings + shape encoding for events.

### Focus Mode

`Ctrl+Click` / long-press on a colonist pins the camera: RD continues globally, canvas softly zooms 1.3× centered on that colonist, other glyphs dim to 30%. `Esc` unpins.

### Inter-Leader Sync

- Turn scrub: both sides scrub together (existing)
- Layer toggles + preset: both sides mirror
- Hover / click / popovers: independent
- Divergence overlay: renders diff strip between/below the two leaders

### What Gets Removed

- `ClusterToggleRow` tabs → compressed into `M` key + layer chip bar selector
- `Legend` → replaced by first-hover `?` tooltip auto-dismissing after 5s
- `DrilldownPanel` (slide-out) → content moves into click popover; the component is deleted
- Tile grid (`Tile`, `FamilyPod`, `DeptBand`, `GhostLayer`, `ColonyPanel`, `FamilyTree`) — deleted entirely. The living grid *is* the viz.
- `automaton/` folder (AutomatonBand, AutomatonCanvas, modes/*, useAutomatonState, shared) — deleted.

---

## Module Layout

### Added

```
src/cli/dashboard/src/
├── lib/webgl/
│   ├── grayScott.ts
│   ├── gridRenderer.ts
│   ├── events.ts
│   └── shaders/
│       ├── grayScott.frag.glsl.ts
│       ├── grayScott.vert.glsl.ts
│       └── display.frag.glsl.ts
│
└── components/viz/grid/
    ├── LivingColonyGrid.tsx
    ├── useGridState.ts
    ├── gridPositions.ts
    ├── simToChemistry.ts
    ├── SeedLayer.ts
    ├── GlyphLayer.ts
    ├── FlareLayer.ts
    ├── LinesLayer.ts
    ├── HudLayer.ts
    ├── DivergenceLayer.ts
    ├── HoverPopover.tsx
    ├── ClickPopover.tsx
    ├── LayerChipBar.tsx
    ├── PresetCycler.tsx
    └── useGridKeyboard.ts

Tests:
    simToChemistry.test.ts
    gridPositions.test.ts
    grayScott.test.ts
    flareQueue.test.ts
    LivingColonyGrid.test.tsx
    HoverPopover.test.tsx
    ClickPopover.test.tsx
```

### Modified

```
components/viz/ColonyViz.tsx     — replaces <ColonyPanel/> per side with <LivingColonyGrid/>
                                   owns shared layer + preset state lifted from panels
components/viz/viz-types.ts      — adds LayerKey, PresetKey, GridPosition types
                                   (existing CellSnapshot, TurnSnapshot unchanged)
```

### Kept (no changes)

```
components/viz/useVizSnapshots.ts    — input contract unchanged
components/viz/TurnBanner.tsx        — still renders above the grid
components/viz/VizControls.tsx       — timeline scrubber still used
components/viz/HexacoRadar.tsx       — now rendered inside ClickPopover
components/viz/MoodChart.tsx         — now rendered inside ClickPopover
components/viz/humanize-outcome.ts
```

### Deleted (after Phase 5)

```
components/viz/ColonyPanel.tsx
components/viz/Tile.tsx
components/viz/FamilyPod.tsx
components/viz/FamilyTree.tsx
components/viz/DeptBand.tsx
components/viz/GhostLayer.tsx
components/viz/ClusterToggleRow.tsx
components/viz/Legend.tsx
components/viz/DrilldownPanel.tsx
components/viz/viz-layout.ts (+.test.ts)
components/viz/automaton/ (AutomatonBand, AutomatonCanvas, useAutomatonState,
                           shared.ts, shared.test.ts, modes/mood.ts, forge.ts,
                           ecology.ts)
```

---

## Migration — 5 Sub-Phases

Each phase is independently mergeable.

**Phase 1 — Foundation (flag-gated).** Ship `lib/webgl/*` + `components/viz/grid/*` behind `VITE_NEW_GRID=1`. `ColonyViz.tsx` branches between old and new. Old viz remains the prod default. Mergeable when RD renders a Mars scenario without errors. *~1200 LOC added.*

**Phase 2 — Parity (flag-gated).** Implement hover / click / popovers / keyboard / scrub / divergence / layer chips / presets. Flag still gates. Mergeable when the flagged dashboard shows every current tooltip + drilldown working in the grid. *~600 LOC added.*

**Phase 3 — A11y + fallbacks (flag-gated).** Reduced-motion static render, WebGL2-missing → Canvas2D fallback (seeds + glyphs + flares, no RD field), screen reader labels, keyboard tab-walk, high-contrast + color-blind modes. Flag still gates. *~300 LOC added.*

**Phase 4 — Flip.** `VITE_NEW_GRID=1` becomes default. Old viz remains accessible via `VITE_NEW_GRID=0` for 7 days as bail-out. Monitor prod for GPU crashes + frame-rate regressions. *~10 LOC changed.*

**Phase 5 — Cleanup.** After 7 days green, delete flag + all files listed above. *~2800 LOC removed.*

Net impact after Phase 5: **`−700 LOC` net, unified living-grid viz, zero new dependencies.**

---

## Performance Budget

Target: **30fps sustained, both leaders visible, 2019-era integrated GPU.**

| Work (per frame) | Cost |
|---|---|
| RD ping-pong, 2 diffusion steps per frame, 1 leader (512×320) | ~1.6ms GPU |
| Display shader (colorize U/V), 1 leader | ~0.3ms GPU |
| Canvas2D overlays, 1 leader (~50 draws) | ~1.2ms CPU |
| Hover hit-test + popover re-layout (amortized) | ~0.2ms CPU |
| **Two leaders × everything above** | **~3.8ms GPU, ~2.8ms CPU** |

Two RD steps per rendered frame keeps chemistry evolution visible at 30Hz render rate (60 effective chemistry updates/sec). Comfortable inside the 33ms frame budget. Headroom for thermal throttle + popover re-render spikes.

**Pause triggers:** `visibilitychange: hidden`, off-screen `IntersectionObserver`, `prefers-reduced-motion: reduce`.

**Auto-degradation ladder** (via `slowFrameStreak > 3` detector, pattern inherited from current `AutomatonCanvas`):

1. 30fps → 20fps (keep everything)
2. Still slow → drop RD resolution 512×320 → 384×240
3. Still slow → disable flare particles, keep symbols
4. Still slow → static snapshot (one RD tick, frozen)

---

## Testing

**Pure unit tests** — no React, no canvas, deterministic:

```
simToChemistry.test.ts     Snapshot → F, k values; event → flare queue;
                           injection deltas at expected cells.
gridPositions.test.ts      Same (agentId, mode, w, h) → same position;
                           each cluster mode's invariants hold.
grayScott.test.ts          CPU-simulated RD tick matches shader output
                           within ε on a canonical 32×32 seed.
flareQueue.test.ts         Decay, additive compositing, capacity cap.
```

**Component tests** (vitest + jsdom + mocked canvas):

```
LivingColonyGrid.test.tsx  Mount, snapshot updates, hover/click, layer
                           toggles, cleanup on unmount.
HoverPopover.test.tsx      Viewport-edge flip, Esc dismiss, keyboard nav.
ClickPopover.test.tsx      HEXACO radar, memory quotes, chat button wiring.
```

**Visual regression** (optional Playwright):
- 6-turn Mars scenario → screenshots at T1 / T3 / T6
- 3-turn mission_mercury scenario → screenshots at T1 / T3
- Reduced-motion preset → screenshot

**Manual acceptance**:
- Full Mars scenario live, scrub timeline, every layer toggle, every keyboard shortcut
- mission_mercury 3-turn scenario
- Force WebGL2 disabled (`chrome://flags` → ANGLE) → verify Canvas2D fallback
- Emulate reduced-motion → verify static render
- VoiceOver on macOS → tab-walks glyphs + reads live turn updates

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| GPU driver crash on older Intel Iris / Android | WebGL2 detection at mount → Canvas2D fallback path. Log fallback activations to a telemetry counter to learn real-world coverage. |
| Position-hash collisions pile colonists at cluster center | Golden-ratio angular offset per collision (mulberry32 already handles this well — verify collision rate <1% at 200 agents during `gridPositions.test.ts`). |
| Flare queue unbounded during long runs | Cap at 30 active flares, expire oldest; recorded flares persist in per-turn cache so scrubbing still shows them. |
| Per-turn RD buffer cache memory (4MB × 30 turns = 120MB) | Cap at 30 turns, evict oldest. Downscale cached buffers to 256×160 → 30MB if needed. |
| User actually liked the metric cards | `Ecology` preset preserves HUD + crisis flares — closest substitute. `?` tooltip legend explains where the cards went. |
| Color-blind users misread RD field | Alt viridis ramp + event shape encoding + high-contrast monochrome mode (see Accessibility). |
| Performance variance between short (6 turns) and long (30+ turns) runs | Buffer cap + downscale + slow-frame degradation ladder all kick in before user-visible. |
| Physics look uniform across scenarios (Mars, Mercury, etc. all feel same) | Scenario-specific crisis categories drive distinct flare colors; departments color-map seeds; `ClusterMode` = `departments` gives each scenario its own cluster geometry. |

---

## Dependencies

**Zero new npm packages.** WebGL2 + Canvas2D are native browser APIs. GLSL inlined as TypeScript string constants (no loader). Current deps remain: `react@19`, `react-dom@19`, `tailwindcss@4`, `vite@6`, `typescript@5.7`.

---

## Success Criteria

The redesign is done when **all** of these hold:

1. A 6-turn Mars scenario renders: two leaders' grids are visibly distinct from T2 onward — different bloom patterns, flare densities, decay regions. Someone who can't read English still perceives which colony is thriving.
2. Every tooltip / popover / drilldown from the current viz has an equivalent in the new grid (every row of the Fidelity table in this spec is checked off).
3. 30fps sustained on a 2019 MacBook Pro integrated GPU with both leaders visible and all layers on.
4. `prefers-reduced-motion` produces a readable static snapshot with no animation.
5. WebGL2-disabled browser renders seeds + glyphs + flares on Canvas2D without errors.
6. VoiceOver reads colony status updates on turn change.
7. Keyboard-only user can navigate to any colonist via Tab and open their popover via Enter.
8. No regression in the existing SIM / REPORTS / CHAT tabs.
9. Bundle size delta: `+30KB gzipped` max (no new deps, just project code).
10. After Phase 5 cleanup: `−700 LOC` net in `components/viz/`.

---

## Open Questions

None blocking implementation. The following are minor and can be settled during Phase 1:

- Exact RD grid resolution (512×320 vs 384×240) may shift after profiling on a real target GPU.
- Per-turn cached buffer downscale threshold (30 vs 20 turns) may shift based on observed memory.
- Whether the `Divergence` preset gets its own chip or lives as a toggle behind `D` — current design does both; may collapse to one.
