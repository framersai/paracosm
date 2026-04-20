---
title: "Phase C2: RD Field Aliasing Fix"
date: 2026-04-20
status: design — approved
scope: paracosm/src/cli/dashboard (one CSS property)
parent: 2026-04-20-viz-fixes-and-mobile-ux-audit
---

# RD Field Aliasing Fix

Targets the diagonal saw-tooth lines visible in the 2026-04-20 VIZ-tab screenshot. Traced to the WebGL canvas CSS rendering rule. One-line fix.

## Problem

`LivingSwarmGrid` renders a WebGL Gray-Scott reaction-diffusion field. Pipeline:

1. Simulation step runs on a fixed-size framebuffer: `GRID_W = 384, GRID_H = 240` ([LivingSwarmGrid.tsx:156-157](../../../src/cli/dashboard/src/components/viz/grid/LivingSwarmGrid.tsx#L156-L157)).
2. Simulation texture uses `gl.NEAREST` for both MIN and MAG filter ([grayScott.ts:77-78](../../../src/cli/dashboard/src/lib/webgl/grayScott.ts#L77-L78)). This is correct — bilinear interpolation would smear the RD physics.
3. The simulation canvas is then CSS-scaled to container size (usually 800-1200px wide at typical laptop widths) with `imageRendering: 'pixelated'` ([LivingSwarmGrid.tsx:1044](../../../src/cli/dashboard/src/components/viz/grid/LivingSwarmGrid.tsx#L1044)).

At typical scale factors (2.1×, 2.7×, 3.3×…) the display scale is non-integer. `imageRendering: pixelated` tells the browser to use nearest-neighbor sampling at display time — every simulation pixel ends up covering a variable number of display pixels (some 2, some 3). Along the borders where the Gray-Scott wave fronts sit, this variance presents as diagonal saw-tooth bands.

The aliasing is purely a display-time artifact. The simulation itself is correct.

## Fix

Drop `imageRendering: 'pixelated'` from the WebGL canvas style. The browser falls back to default bilinear sampling at display-scale, smoothing the non-integer scale factor into a soft wash. Simulation physics unchanged.

```diff
         <canvas
           ref={webglCanvasRef}
           style={{
             position: 'absolute',
             inset: 0,
             width: '100%',
             height: '100%',
             display: webglFailed ? 'none' : 'block',
-            imageRendering: 'pixelated',
           }}
         />
```

## What remains crisp

The overlay canvas carries all discrete content — glyphs (`arc`/`fillRect`), Conway tiles (`fillRect`), HUD text, dept rings, flare arcs. None of those are affected by WebGL canvas CSS. Conway tiles still render as crisp squares at any scale because they're drawn as canvas 2D primitives, not as raster pixels.

The only visual that changes is the RD biome behind the glyphs. It goes from blocky-with-diagonals to smoothly-blurred.

## Alternatives considered + rejected

- **Display-pass LINEAR shader sampler.** Change the display-pass fragment shader to sample the simulation texture with `gl.LINEAR` while keeping simulation-pass as `NEAREST`. Produces the same visual result. Rejected: adds a second texture-parameter state machine, touches grayScott.ts, more code for no additional outcome.
- **Dynamic simulation resolution.** Make `GRID_W`/`GRID_H` track the canvas size. Pixel-perfect render, no aliasing by construction. Rejected: 2-4× GPU work per frame, major rewrite of the Gray-Scott framebuffer management, ongoing resize cost on window resize, and the visual outcome is imperceptibly different from the cheap fix.

## Testing

Manual smoke: serve the dashboard, run a sim, open VIZ, visually confirm the RD biome reads as a smooth wash behind the glyphs instead of a blocky grid. Sanity-check at 480px, 768px, 1024px, 1440px viewport widths.

No unit test possible — this is a CSS property on a canvas element, not a pure function.

## Out of scope (deferred to C1)

- Splitting the 440-line `useEffect` in LivingSwarmGrid
- Per-layer render module extraction

C1 is the next sub-phase. It's kept separate so the visual verification for C2 isn't coupled to the refactor churn of C1.

## Commit sketch

```
viz(grid): drop imageRendering pixelated on RD canvas

Non-integer CSS scale factor produced diagonal saw-tooth aliasing
visible as mystery zigzag lines across the field. Browser default
bilinear sampling at display time smooths the scale without
touching simulation physics (still NEAREST on the framebuffer).
```
