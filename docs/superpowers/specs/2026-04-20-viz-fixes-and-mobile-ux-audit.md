---
title: "Paracosm Dashboard — Viz Fixes + UI/UX + Mobile Audit"
date: 2026-04-20
status: audit — awaiting scope approval before implementation
scope: paracosm/src/cli/dashboard (no runtime changes)
---

# Paracosm Dashboard Audit (2026-04-20)

Audit of the live-running `apps/paracosm/src/cli/dashboard` React SPA, grounded in source read end-to-end. Focus: the "weird geometric animations" on the VIZ tab, UI/UX coherence across tabs, and mobile responsiveness.

The root cause pattern across all symptoms: **layered overlays added iteratively to patch individual complaints, never re-drawn as one system.** The code comments literally narrate past user complaints ("weird diamond animations", "diamond-ish boxes that make no sense", "hovering makes no sense no tooltips") and spot-fix each. The cumulative overlay stack is now the problem.

---

## 1. Critical Bugs Visible In Screenshot

All line references are `apps/paracosm/src/cli/dashboard/src/components/viz/...`.

### 1.1 Leader name rendered twice, overlapping

[`grid/HudLayer.ts:66-67`](../../../src/cli/dashboard/src/components/viz/grid/HudLayer.ts#L66-L67) draws the leader name at canvas coords `(10, 10)` via `ctx.fillText(nameText, 10, 10)`.

[`grid/FeaturedSpotlight.tsx:62-76`](../../../src/cli/dashboard/src/components/viz/grid/FeaturedSpotlight.tsx#L62-L76) renders featured-colonist cards absolutely positioned at `top: 36, left: 8, right: 8` with `zIndex: 7`.

These collide vertically. When a new featured colonist appears for 6 seconds, the card drops directly below the HUD leader-name line, pushing the screenshot's "DR. VOSS DIETRICH" appearance (HUD says "DIETRICH VOSS", card says "Dr. Yuki Tanaka" — the bottom of the HUD overlaps the top of the card, reading as one jumbled header).

**Fix:** FeaturedSpotlight must start at `top: 60+` (below the HUD's 2-line block), OR the HUD must suppress its text when a spotlight is active for the same side.

### 1.2 "Conway tiles + RD biome are ambient" legend is a UX smell

[`grid/LivingSwarmGrid.tsx:1069-1089`](../../../src/cli/dashboard/src/components/viz/grid/LivingSwarmGrid.tsx#L1069-L1089) renders a permanent caption at bottom-right explaining what the two ambient layers are. The comment in the code says users called the UI broken because hovering the Conway tiles returned no tooltip.

A legend that apologises for the visualization is UI debt. Either:
- **Remove Conway** entirely and have glyphs carry the foreground signal alone, or
- **Make Conway meaningful** (e.g. density maps a metric the user cares about) so no legend is needed.

Per the 2026-04-18 viz-rethink spec, Conway was already flagged for replacement in the AutomatonBand modes. The LivingSwarmGrid instance of it is the one actually shipped.

### 1.3 Conway pattern reads as accidentally-shaped

[`grid/GameOfLifeLayer.ts:151-185`](../../../src/cli/dashboard/src/components/viz/grid/GameOfLifeLayer.ts#L151-L185) `seedFromColonists` plants 3-5 cell Conway starter patterns at each alive colonist's grid position, then runs 5 warmup ticks to stabilize. With 3-4 alive colonists clustered by the layout function, the stable pattern is a small glyph-shaped cluster (the screenshot's "heart" is just the 3-colonist cluster's starter patterns decaying into a period-2 block + neighbors).

This is deterministic and intentional in code, but it fails the design intent: the pattern reads as "someone drew a heart" rather than "Conway cells evolved from colony state". The user is right to flag it.

**Fix options:** (a) drop Conway entirely and use the glyphs alone as foreground, (b) make Conway density map a real colony metric (unrest, mood contagion), or (c) expand the cell grid to 96×48+ so 3 colonists produce visible distinct oscillators instead of one blob.

### 1.4 UI strip count: 11 pre-canvas rows

The VIZ tab stacks in order ([`SwarmViz.tsx:929-1121`](../../../src/cli/dashboard/src/components/viz/SwarmViz.tsx#L929-L1121)):

1. `TurnBanner` — current turn + year
2. Mode pills row (`GridModePills` + palette cycler + STATS + Export menu + Settings cog + ? Help) — 6 controls
3. Mode hint line (`gridModeHint`)
4. `ColonistSearch`
5. `TurnProgress`
6. `EventChronicle`
7. `TimelineSparkline`
8. `diffLine` ("A vs B: +1 pop, 11% morale, -4.0mo food")
9. Canvas area header — per-panel `GridMetricsStrip` (8+ fields)
10. Canvas itself with HUD corners + FeaturedSpotlight cards + roster/focus buttons + legend
11. Popover drilldown

On a 900px-tall laptop with 20% chrome, the canvas is under 400px tall. That is the "weird" feeling: the viewer never sees the visualization, only the controls around it.

**Fix:** Collapse to 3 strips max: `{turn + mode pills + overflow menu}` / `{chronicle with inline filter}` / `{playhead timeline}`. Move palette / export / settings behind a single `⋯` menu.

### 1.5 Orange diagonal zigzag artifacts

Screenshot shows saw-tooth diagonals crossing both panels. Source candidates, ranked:

1. **Dept rings** ([`DeptRingsLayer.ts:60-71`](../../../src/cli/dashboard/src/components/viz/grid/DeptRingsLayer.ts#L60-L71)) — dashed arcs (`setLineDash([2, 4])`) around dept centroids. Default ON (`deptRings: true`). With 3-4 alive colonists, ring radius = distance-from-centroid which can be large; dashed arcs at that radius tile together into what reads as diagonals.
2. **Crosshair tracer** ([`LivingSwarmGrid.tsx:773-817`](../../../src/cli/dashboard/src/components/viz/grid/LivingSwarmGrid.tsx#L773-L817)) — dashed horizontal/vertical lines + tracer to nearest colonist. Fires only while cursor is on the canvas.
3. **RD field aliasing** — WebGL field renders at fixed `GRID_W=384, GRID_H=240` then CSS-scales via `imageRendering: 'pixelated'`. At non-integer scale factors, Gray-Scott wave fronts alias into diagonal saw-tooth.

**Fix:** Disable dept rings by default (mirror `lines` and `ghostTrail`, which were already flipped off for the same "reads as accidental" reason). Render RD field at canvas native resolution (drop the fixed 384×240) or at 2×/3× integer scale.

---

## 2. Other VIZ-Tab Issues (Not In Screenshot)

### 2.1 `ColonyViz.tsx` ghost in IDE

The open file reference `apps/paracosm/src/cli/dashboard/src/components/viz/ColonyViz.tsx` does not exist. The component was renamed to `SwarmViz.tsx` per the design note in [`LivingSwarmGrid.tsx:159-167`](../../../src/cli/dashboard/src/components/viz/grid/LivingSwarmGrid.tsx#L159-L167). Stale IDE state, not a bug in the code, but worth noting because ripgrep for `ColonyViz` still hits design docs and the 2026-04-16 audit.

### 2.2 Duplicate mode systems

[`viz/SwarmViz.tsx`](../../../src/cli/dashboard/src/components/viz/SwarmViz.tsx) ships two visualization systems and toggles between them via `VITE_NEW_GRID`:

- **New (default):** `LivingSwarmGrid` with `GridMode` = `living | mood | forge | ecology | divergence`.
- **Old (fallback):** `SwarmPanel` with `ClusterMode` = `families | departments | mood | age` **plus** an inner `AutomatonBand` with its own `AutomatonMode` = `mood | forge | ecology`.

Keybindings `1`-`5` map to one set in new mode, `1`-`3` map to a different set in old mode. localStorage keys diverge. The 2026-04-18 viz-rethink spec addressed AutomatonBand modes but those only render in the legacy path.

**Recommendation:** Delete the legacy path (`SwarmPanel`, `AutomatonBand`, `AutomatonCanvas`, `automaton/modes/*`) once `VITE_NEW_GRID=1` is hardcoded. That removes ~1500 lines and one full keybinding system.

### 2.3 Effects chain is one block

[`LivingSwarmGrid.tsx:422-861`](../../../src/cli/dashboard/src/components/viz/grid/LivingSwarmGrid.tsx#L422-L861) is a single 440-line `useEffect` that owns: turn-pulse decay, HEXACO chemistry resolve, injection computation, flare filtering, WebGL tick, overlay clear, GoL seed+cache, GoL draw, seeds draw, dept rings draw, ghost trail draw, lines draw, flares draw, glyphs draw, mode-specific overlays, HUD draw, hover ring, crosshair, sympathetic ring.

The TDZ comments (`// The ghost-trail block below consumes cs + hexToRgba...`) prove this function is fragile under minification. Any new contributor adding a layer has a high chance of introducing a new TDZ.

**Recommendation:** Split into pure-function draw modules per layer, called from a thin orchestrator.

### 2.4 Settings in localStorage, no reset UI

[`GridSettingsDrawer.tsx:32-49`](../../../src/cli/dashboard/src/components/viz/grid/GridSettingsDrawer.tsx#L32-L49) ships 9 toggles: animSpeed, deptRings, deptLabels, lines, dust, crosshair, ghostTrail, alerts, sound. Default is version-gated so defaults can be rolled out. There is no "reset to defaults" button visible in the drawer.

---

## 3. Cross-Tab UI/UX Issues

### 3.1 TopBar overload

[`layout/TopBar.tsx`](../../../src/cli/dashboard/src/components/layout/TopBar.tsx) carries: logo + PARACOSM wordmark + AGENTOS tag + scenario name + turn meta + progress bar + GITHUB CTA + HOW IT WORKS + RUN + Save + Copy + Load + Clear + status pill + theme toggle. [`tokens.css:462-500`](../../../src/cli/dashboard/src/theme/tokens.css#L462-L500) hides items progressively (AGENTOS at 1440px, scenario at 1440px, tour-label at 1200px, progress at 1200px, meta at 480px, github label at 480px).

This is "hide until it fits" rather than "design for the viewport". The 1200-1440px band still overflows on macbook 13" windows that aren't fullscreen.

**Fix:** Consolidate save/load/copy/clear into a single LoadMenu-style overflow popover; reserve topbar for logo, scenario pill, RUN, status, theme.

### 3.2 Tab icons vs labels threshold

[`TabBar.tsx:43`](../../../src/cli/dashboard/src/components/layout/TabBar.tsx#L43) switches to icons at `MOBILE_BREAKPOINT = 640px`. Between 640 and the full-text width (~720px with 7 tabs × 100px), label-only tabs also horizontal-scroll. `@media (max-width: 768px)` in tokens.css sets `.tab-bar { flex-wrap: wrap }` which wraps tabs onto a second row in the 640-768 band, compete with the wider tabs.

**Fix:** Icons-only at `<900px` (above `narrow` viz breakpoint), labels only at `>=900px`. Always one row.

### 3.3 Reports tab layout

[`reports/ReportView.tsx:44-48`](../../../src/cli/dashboard/src/components/reports/ReportView.tsx#L44-L48) has a side-nav + content. `@media (max-width: 1023.98px) .reports-layout { flex-direction: column }` stacks the nav above content, but the nav is a list of 12+ section links at phone width. That's a wall of secondary nav before the user sees any report content.

**Fix:** Collapse reports side-nav to a "Jump to…" select at `<1024px` and a sticky-horizontal pill strip at `<768px`.

### 3.4 Chat tab stays mounted

[`App.tsx:836-839`](../../../src/cli/dashboard/src/App.tsx#L836-L839) keeps `ChatPanel` mounted across tab switches (so per-agent threads survive). Good pattern, but the hidden div still executes its hooks and SSE subscriptions. For the demo Opus 4.7 showcase, this is fine; worth noting for future perf.

### 3.5 Settings panel feels disconnected

(Not read in this audit but visible from code map.) Settings lives at `SettingsPanel.tsx`, separate from `GridSettingsDrawer`, separate from `ScenarioEditor`. Three settings surfaces with no shared header/back pattern. Worth unifying.

---

## 4. Mobile Responsiveness Audit

### 4.1 Breakpoint inventory (from [`tokens.css`](../../../src/cli/dashboard/src/theme/tokens.css))

- `max-width: 1440px` — drop AGENTOS tag + scenario name
- `max-width: 1200px` — drop tour label + per-turn progress
- `max-width: 1023.98px` — Reports nav stacks above content
- `max-width: 768px` — main mobile block: sim columns stack, leaders stack, chat stack, about/settings/reports padding drops to 16px, timeline stack, stats bar scrolls horizontally, tab-bar wraps
- `max-width: 640px` — TabBar switches to icons (set in `TabBar.tsx`, not tokens)
- `max-width: 480px` — phone block: stats-bar labels collapse to 1-char short form, github label hides, leader-traits/sparklines hide

### 4.2 Actual problems at each breakpoint

**Tablet (768-1023px):** Reports side-nav already stacks (OK). Viz tab still shows both leader panels side-by-side — too narrow for either to show glyphs legibly. `useMediaQuery(NARROW_QUERY)` in `LivingSwarmGrid` probably handles this; grep confirms it flips to `flex-direction: column` at `<900px`. Acceptable.

**Mobile (480-768px):** Viz tab stacks the two panels, each with 11 overlay strips. Scrolling to see the second panel is painful. No summary mode.

**Phone (<480px):** The two leader panels become ~350px wide. Conway tiles read as dots. RD biome is invisible at that scale. FeaturedSpotlight cards (`left: 8, right: 8`) consume half the panel height. The viz tab is effectively unusable on phones.

**Fix:** At phone width, auto-collapse to single-leader view with a side toggle (A / B pills). Replace FeaturedSpotlight cards with a single-row ticker. Auto-hide the mode pills strip (just show the active mode name with a dropdown to change).

### 4.3 Touch interactions

No touch handlers on any canvas. All interactions assume mouse hover → tooltip. On touch devices:
- Hovering a glyph to see a tooltip = tap+hold pattern, not wired.
- Crosshair only appears on `mousemove`, never on touch.
- ClickPopover fires on tap, which is the only interaction that works on mobile.

**Fix:** Wire `onTouchStart` → show tooltip, second tap = open popover. OR just skip hover entirely on touch devices and require a tap to show detail.

### 4.4 Focus traps and modal backdrops

`verdictModalOpen` handler ([`App.tsx:121-126`](../../../src/cli/dashboard/src/App.tsx#L121-L126)) listens for Escape but doesn't trap focus inside the modal. Same pattern across `CostBreakdownModal`, `RosterDrawer`, `GridSettingsDrawer`. Keyboard users can tab out of the modal behind its overlay.

**Fix:** Add focus-trap pattern (store focused element on open, restore on close, and trap tab within modal bounds).

---

## 5. Animation Inventory

Running simultaneously on the VIZ tab by default:

| Source | Animation | Default | Runs When |
|---|---|---|---|
| `tokens.css` `scanline-overlay` | Amber gradient bar scanning top→bottom over 8s | on | always |
| `tokens.css` `logoGlow` | Logo opacity + scale pulse 4s | on | always |
| `LivingSwarmGrid` RD field | Gray-Scott WebGL tick, 2 steps/frame | on | canvas visible |
| `GameOfLifeLayer` | Static per turn, re-seeded on turn change | on | canvas visible |
| `DeptRingsLayer` | Static dashed circles | on | canvas visible |
| `LinesLayer` | Partner arcs, child arrows | **OFF** (default) | lines setting on |
| `GhostTrailLayer` | Previous-turn movement arrows | **OFF** (default) | ghostTrail setting on |
| `FlareLayer` | Birth/death/forge/crisis flares, ~1-2s decay | on | events fire |
| `FeaturedSpotlight` | Slide-in card, 380ms | on | new featured cells |
| `GlyphLayer` | **Removed** pulse on featured (comment confirms) | — | — |
| Morale border | 200ms border-color + box-shadow transition | on | morale crosses thresholds |
| Chronicle hover | 400ms border-color pulse | on | chronicle pill hover |
| Turn pulse | RD tint pulse, ~600ms decay | on | turn change |

**Observation:** 4-5 concurrent animations by default. `scanline` + `logoGlow` are global chrome; the viz itself adds 6+. That's a lot of motion for a dense-information dashboard. `prefers-reduced-motion` correctly disables most of it.

**Fix:** Respect reduced motion more aggressively (currently only the automaton band collapses). Consider an "ambient motion" master toggle.

---

## 6. Proposed Scope

I propose splitting this into **Phase A (ship now)** and **Phase B (next pass)**. Phase A is the work you showed me in the screenshot — user-visible, iterable in one session. Phase B is the larger structural cleanup.

### Phase A — Immediate fixes (this session)

1. **Fix FeaturedSpotlight overlap with HUD leader name** — move card region to `top: 60`, or suppress HUD text when spotlight is active.
2. **Remove "Conway tiles + RD biome are ambient" legend** — delete the caption. If UI needs to apologize, fix the UI.
3. **Default `deptRings: false`** — matches the pattern already set for `lines` and `ghostTrail` (things users reported as "weird" are now opt-in).
4. **Collapse VIZ tab control strips from 11 to 3** — merge palette/STATS/Export/Settings into a single `⋯` overflow; keep mode pills + help + search + chronicle + playhead.
5. **Increase Conway grid density** from 32×16 to 64×32 cells so small colonies produce recognizable oscillators instead of amorphous blobs (or drop Conway entirely — pick one, I recommend drop).
6. **Tab-bar single-row** — icons at `<900px`, labels at `>=900px`, no wrap.
7. **Phone-width VIZ: single-panel mode** — at `<480px` auto-show only the focused side with an A/B pill toggle above the canvas. Reduces overlay competition.

### Phase B — Structural cleanup (next session)

1. **Delete legacy VIZ path** — remove `SwarmPanel`, `AutomatonBand`, `AutomatonCanvas`, `automaton/modes/*`. Hardcode `VITE_NEW_GRID=1`.
2. **Split `LivingSwarmGrid` effect** into per-layer draw modules (addresses TDZ fragility).
3. **Settings unification** — one settings entry, nested categories for dashboard / viz / scenario / theme.
4. **Touch interactions** — tap-for-tooltip, long-press for popover.
5. **Focus traps on all modals**.
6. **Reports side-nav** — collapse to select at `<1024px`, sticky pill strip at `<768px`.

### Non-goals

- No runtime / SSE changes.
- No Mars-specific hardcoding.
- No new telemetry surfaces.
- No new features that aren't fixing visible problems.

---

## 7. Open Questions for User

1. **Drop Conway entirely** (recommended) or keep but make meaningful? I lean drop — the 2026-04-18 viz-rethink spec already argued for this on the AutomatonBand side; LivingSwarmGrid inherited the same failure mode.
2. **Phase A only or Phase A + B?** Phase A is ~3-4 hours of focused work; Phase B is another full session.
3. **VITE_NEW_GRID fallback** — is anyone still using the legacy path? If no, Phase B.1 is safe.
4. **Mobile priority** — iPad/tablet first or phone first? The dashboard density reads best at 1200px+; phone-width is fundamentally constrained for a cockpit viz.

---

## 8. What I'm Going To Do

Awaiting your approval on scope above. Once approved:

- **Phase A:** 7 focused edits with verification each step (viz loads, no TDZ in minified prod bundle, responsive at 480/768/900/1200/1440).
- **Phase B:** Separate session, separate spec, separate PR.

No code changes until you say yes to scope.
