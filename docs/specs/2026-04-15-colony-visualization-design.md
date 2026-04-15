# Colony Visualization — Cellular Automata Growth View

**Date:** 2026-04-15
**Status:** Planned (Enterprise)

## Concept

A new VISUALIZATION tab in the dashboard showing both colonies as living cellular automata grids. Each colonist is a cell. Cell properties (color, size, glow, connections) are driven by simulation data. Watch colony growth patterns diverge in real time as turns progress.

## Visual Design

### Cell Representation

Each cell is a colonist. Properties mapped to visual attributes:

| Data | Visual | Example |
|------|--------|---------|
| Department | Cell color | Medical: teal, Engineering: amber, Agriculture: green, Psychology: purple, Governance: rust |
| Mood (psychScore) | Cell brightness/glow | High psych: bright glow. Low psych: dim, desaturated |
| Health (alive) | Cell presence | Dead colonists fade out with a brief particle effect |
| Marsborn | Cell shape | Earth-born: circle. Mars-born: hexagon |
| Relationships (partnerId) | Connection lines | Thin amber line between partnered colonists |
| Children | Proximity | Parent cells positioned near child cells |
| Role/rank | Cell size | Junior: small. Senior: medium. Chief/Lead: large |
| Featured | Pulse | Colonists with speaking reactions pulse on their turn |

### Grid Layout

Two canvases side by side, one per colony. Matching the dashboard's split-view pattern.

```
┌──────────────────────┐  ┌──────────────────────┐
│    Ares Horizon       │  │    Meridian Base       │
│    (The Visionary)    │  │    (The Engineer)      │
│                       │  │                       │
│   ○ ○ ⬡ ○            │  │   ○ ○ ○ ○             │
│  ○ ⬡ ○ ○ ○           │  │  ○ ○ ○ ○ ○            │
│   ○ ○ ○ ⬡ ○          │  │   ○ ○ ○ ○ ○           │
│  ○ ○ ○ ○ ○ ○         │  │  ○ ○ ○ ○ ○ ○          │
│   ○ ○ ⬡ ○ ○          │  │   ○ ○ ○ ○ ○           │
│                       │  │                       │
│  Pop: 113  Morale: 68%│  │  Pop: 98   Morale: 72%│
└──────────────────────┘  └──────────────────────┘
```

### Aesthetic

Matches the Paracosm dark theme:
- Background: `--bg-deep` (#0a0806)
- Cell base: department color at 60% opacity
- Glow: radial gradient from cell center, intensity = psychScore
- Death: cell shrinks + fades over 0.5s with ember particle burst
- Birth: cell appears with expanding ring animation
- Connections: 1px lines at 20% opacity, amber for partners, teal for parent-child
- Department clusters: cells organically cluster by department using force-directed positioning

### Metric Overlays

Sparkline charts overlaid at the bottom of each canvas:
- Population trajectory (line)
- Morale trajectory (line)
- Food reserves (area)
- Compact: 40px tall, full canvas width, 30% opacity background

### Playback Controls

- Play/pause button
- Turn scrubber (slider from Turn 1 to Turn N)
- Speed control (1x, 2x, 4x)
- Step forward/backward one turn

When scrubbing, the grid animates to reflect the colony state at that turn: cells appear/disappear for births/deaths, colors shift for mood changes, connections form/break.

## Technical Architecture

### Renderer

WebGL via a lightweight library (regl or raw WebGL2). Canvas fallback for devices without WebGL. Target: 60fps with 200 cells per side.

Each cell is an instanced quad with:
- Position (force-directed layout, updated per frame)
- Color (department + mood modulation)
- Size (role-based)
- Glow intensity (psychScore)
- Shape flag (circle vs hexagon via shader)
- Opacity (1.0 alive, fade to 0 on death)

### Data Flow

```
SimulationState (per turn)
  → agents[] (position, health, social, career, narrative)
  → CellState[] (x, y, color, size, glow, shape, connections)
  → GPU instanced draw
```

The visualization reads from the same `GameState` that the SIM tab uses. No additional data fetching.

### Force-Directed Layout

Colonists self-organize using a simple force simulation:
- Repulsion between all cells (prevent overlap)
- Attraction toward department cluster centers
- Attraction between partnered/family cells
- Mild random jitter for organic feel

Update at 30fps. Use Verlet integration for stable, efficient simulation.

### Turn Transitions

When advancing a turn:
1. New population: add cells with birth animation
2. Deaths: remove cells with death animation
3. Mood shifts: interpolate cell glow over 0.5s
4. Relationship changes: fade connections in/out
5. Department transfers: cell drifts toward new cluster

### File Structure

```
src/cli/dashboard/src/components/viz/
  ColonyViz.tsx          main component, manages two canvases
  CellRenderer.ts        WebGL instanced cell drawing
  ForceLayout.ts         force-directed positioning
  VizControls.tsx        playback controls (play, scrub, speed)
  MetricOverlay.tsx      sparkline overlays
  viz-shaders.ts         vertex/fragment shaders for cells
```

## Dependencies

- WebGL2 (native browser)
- No external libraries needed for the core renderer
- Optional: `regl` if raw WebGL is too verbose

## Estimated Scope

3-5 days of focused implementation:
- Day 1: WebGL cell renderer + instanced drawing
- Day 2: Force-directed layout + department clustering
- Day 3: Turn transitions (birth/death/mood animations)
- Day 4: Playback controls + metric overlays
- Day 5: Polish, responsive sizing, dark/light theme support
