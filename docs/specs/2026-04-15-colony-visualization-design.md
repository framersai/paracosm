# Colony Visualization — Cellular Automata Growth View

**Date:** 2026-04-15
**Status:** Planned (Enterprise)

## Concept

A new VIZ tab in the dashboard showing both colonies as living cellular automata grids. Each colonist is a cell. Cell properties (color, size, glow, connections) are driven by simulation data. Watch colony growth patterns diverge in real time as turns progress.

## Visual Design

### Cell Representation

Each cell is a colonist. Properties mapped to visual attributes:

| Data | Visual | Example |
|------|--------|---------|
| Department | Cell color | Medical: `#4ecdc4`, Engineering: `#e8b44a`, Agriculture: `#6aad48`, Psychology: `#9b6b9e`, Governance: `#e06530` |
| Mood (psychScore) | Cell brightness/glow | High psych (>0.7): bright glow. Low psych (<0.4): dim, desaturated |
| Health (alive) | Cell presence | Dead colonists shrink + fade over 0.5s with ember particle burst |
| Marsborn | Cell shape | Earth-born: circle. Mars-born: hexagon |
| Relationships (partnerId) | Connection lines | Thin amber line at 20% opacity between partnered colonists |
| Children | Proximity | Parent cells positioned near child cells via family attraction force |
| Role/rank | Cell size | Junior: 8px. Senior: 10px. Lead: 12px. Chief: 14px |
| Featured | Pulse | Colonists with speaking reactions pulse on their turn |

### Layout

Two canvases side by side, one per colony. Matching the dashboard's split-view pattern.

Each canvas has:
- Colony name and leader archetype in the header
- Department-clustered cells in the main area
- Population and morale stats at the bottom
- Sparkline metric overlays (40px tall, 30% opacity background)

Department cluster centers are fixed positions within the canvas. Cells within each cluster use Verlet force simulation for organic internal movement:
- Repulsion between all cells (prevent overlap)
- Attraction toward the cell's department cluster center
- Family/partner attraction pulls cells toward cluster boundaries
- Mild random jitter for organic feel

Cluster center positions adapt to canvas aspect ratio. Cluster radius scales with department population count.

### Aesthetic

Matches the Paracosm dark theme:
- Background: `var(--bg-deep)` (`#0a0806`)
- Cell base: department color at 60% opacity
- Glow: radial gradient from cell center, intensity = psychScore (Canvas2D) or GPU glow (WebGL layer)
- Death animation: cell shrinks + fades over 0.5s with ember particle burst on WebGL layer
- Birth animation: expanding ring from cell center, 0.3s
- Connections: 1px lines, amber (`#e8b44a`) at 20% opacity for partners, teal (`#4ecdc4`) at 15% for parent-child
- Focused cell: bright outline ring + pulsing glow, all other cells dim to 30% opacity

### Metric Overlays

Sparkline charts overlaid at the bottom of each canvas:
- Population trajectory (line, `var(--text-2)`)
- Morale trajectory (line, `var(--amber)`)
- Food reserves (filled area, `var(--green)` at 20% opacity)
- Height: 40px. Full canvas width. Semi-transparent background.

### Playback Controls

Docked at the bottom of the VIZ tab, spanning the full width below both canvases:
- Step backward (one turn)
- Play/pause toggle
- Step forward (one turn)
- Turn scrubber slider (Turn 1 to Turn N)
- Turn/year label (`T5/12 · 2060`)
- Speed control toggle: 1x, 2x, 4x

When scrubbing, the grid interpolates between snapshots: cells lerp position, glow, and opacity. Births/deaths trigger their animations at the boundary between snapshots.

### Cell Interaction

**Hover**: floating tooltip appears near the cursor with:
- Name, age, department, role
- Mood label + psychScore
- Partner name (if any)
- Mars-born status

**Click**: focuses the cell.
- Focused cell gets a bright outline ring with pulsing glow animation
- All other cells dim to 30% opacity
- Partner/family connection lines highlight at full opacity
- A detail panel (180px wide) slides in from the right edge of the canvas:
  - Name, age, department, role, mars-born, psychScore
  - Mood sparkline across turns (small bar chart)
  - Recent memory quotes (from `agent.memory.shortTerm`)
- Click elsewhere or press Escape to dismiss focus

## Technical Architecture

### Renderer: Canvas2D + WebGL Glow Layer

Two canvas elements stacked per colony:
1. **Back canvas (WebGL2)**: glow effects and particle systems only. Falls back to Canvas2D radial gradients when WebGL is unavailable.
2. **Front canvas (Canvas2D)**: cell shapes (circles via `arc()`, hexagons via `Path2D`), connection lines, metric overlays, tooltips.

Both canvases share the same dimensions and are positioned absolutely within a container div. The WebGL canvas renders glow halos behind cells. The Canvas2D canvas renders the cells themselves, connections, and UI overlays on top.

Target: 60fps with 200 cells per side (400 total across both colonies).

### Data Flow

```
SSE events (live stream)
  → useGameState (existing hook, processes events into GameState)
  → useVizSnapshots (new hook, extracts per-turn TurnSnapshot[])
  → ColonyViz component
    → ForceLayout (updates cell positions each frame)
    → CellRenderer (draws to Canvas2D)
    → GlowRenderer (draws to WebGL canvas)
    → MetricOverlay (sparklines on Canvas2D)
    → VizControls (playback UI, manages current turn index)
```

No additional API calls. The viz reads from the same SSE event stream the SIM tab uses.

### Turn Snapshots

A new `useVizSnapshots` hook processes `GameState` into an array of `TurnSnapshot[]`:

```typescript
interface CellSnapshot {
  agentId: string;
  name: string;
  department: string;
  role: string;
  rank: 'junior' | 'senior' | 'lead' | 'chief';
  alive: boolean;
  marsborn: boolean;
  psychScore: number;
  partnerId?: string;
  childrenIds: string[];
  featured: boolean;
  mood: string;
  shortTermMemory: string[];  // last 2-3 memory quotes
}

interface TurnSnapshot {
  turn: number;
  year: number;
  cells: CellSnapshot[];
  population: number;
  morale: number;
  foodReserve: number;
  deaths: number;  // deaths this turn
  births: number;  // births this turn
}
```

As SSE events stream in, the hook appends new snapshots when `turn_start` events arrive with colony data. Cell-level data comes from `agent_reactions` events, which already contain per-agent `agentId`, `name`, `department`, `role`, `marsborn`, `psychScore`, `mood`, `hexaco`, `boneDensity`, and `radiation`. The orchestrator also needs a small addition: emit `partnerId`, `childrenIds`, `rank`, `featured`, and `shortTermMemory` (last 2 quotes) in each agent reaction payload so the viz can render connections and the detail panel. This is a ~10-line change in `agent-reactions.ts` where the `AgentReaction` interface is defined.

Scrubbing sets `currentTurnIndex`. Playback increments it on a timer. Interpolation lerps between `snapshots[t]` and `snapshots[t+1]` for smooth transitions.

Memory cost: ~12 turns x 200 agents x ~200 bytes = ~480KB. Trivial.

### Force-Directed Layout

`ForceLayout.ts` implements Verlet integration for cell positioning:

- **Department cluster centers**: fixed positions computed from canvas dimensions, arranged in a stable pattern (e.g., 2x3 grid for 5-6 departments).
- **Per-cell forces** (computed each frame at 30fps):
  - Attraction toward department cluster center (strength: 0.02)
  - Repulsion from nearby cells (strength: 0.5, radius: cell size x 3)
  - Partner attraction (strength: 0.01, pulls toward partner's position)
  - Family attraction (strength: 0.005, pulls toward children/parents)
  - Velocity damping (0.95 per frame)
  - Random jitter (magnitude: 0.1px per frame)

Layout positions are stored per-cell and persist across frames. When the turn changes, cells that change department drift toward their new cluster center naturally through the attraction force.

### WebGL Glow Layer

When WebGL2 is available, the back canvas renders:
- **Cell glows**: per-cell radial gradient quads, alpha = `psychScore * 0.4`. Color = department color. Drawn as instanced quads with a simple fragment shader.
- **Death particles**: on cell death, spawn 8-12 small particles that drift outward and fade over 0.5s. Color = cell department color, desaturated.
- **Birth rings**: on cell birth, an expanding circle that fades from full opacity to zero over 0.3s.

When WebGL is unavailable, the Canvas2D front canvas draws radial gradients behind each cell as a fallback. No particle effects in fallback mode.

### File Structure

```
src/cli/dashboard/src/components/viz/
  ColonyViz.tsx          main component, manages two colony containers
  ColonyCanvas.tsx       single colony: stacked Canvas2D + WebGL canvases
  CellRenderer.ts        Canvas2D cell drawing (shapes, connections, tooltips)
  GlowRenderer.ts        WebGL2 glow/particle layer (with Canvas2D fallback)
  ForceLayout.ts         Verlet integration force simulation
  VizControls.tsx        playback controls (play, scrub, speed)
  MetricOverlay.ts       sparkline overlay drawing on Canvas2D
  CellTooltip.tsx        hover tooltip React component (positioned via portal)
  CellDetail.tsx         click-to-focus detail panel (slide-in from right)
  useVizSnapshots.ts     hook: SSE events → TurnSnapshot[]
  viz-types.ts           CellSnapshot, TurnSnapshot, ForceNode interfaces
```

### Dashboard Integration

Add `'viz'` to the `DASHBOARD_TABS` array in `tab-routing.ts` (between `'sim'` and `'reports'`).

Add the VIZ tab rendering branch in `App.tsx`:
```tsx
{activeTab === 'viz' && <ColonyViz state={gameState} />}
```

`TabBar` component picks up the new tab automatically from the `DASHBOARD_TABS` constant.

## Audit-Driven Fixes (bundled with this work)

During the codebase audit, these issues were identified. They should be fixed as part of this implementation since they touch the same data flow:

1. **Replace duplicate JSON extractors**: `orchestrator.ts:extractJsonBlocks()` and `agent-reactions.ts` brace matcher should use the centralized `extractJson()` from `packages/agentos/src/core/validation/extractJson.ts`.

2. **Fix hardcoded department list**: `orchestrator.ts:582` hardcodes `['medical', 'engineering', 'agriculture', 'psychology', 'governance']`. Should use `sc.departments.map(d => d.id)` so custom scenarios work.

3. **Fix no-op getMilestoneEvent**: `orchestrator.ts:495` has `const getMilestone = sc.hooks.getMilestoneEvent ?? sc.hooks.getMilestoneEvent` (assigns to itself). Remove the `??` fallback or replace with an actual alternative.

4. **Add logging to silent catch blocks**: Multiple empty `catch {}` blocks in the orchestrator suppress forge errors and JSON parse failures. Add `console.warn` so failures are visible in the server log.

## Dependencies

- WebGL2 (native browser, no library)
- No external packages needed
- Canvas2D as fallback for all WebGL features

## Scope

The file structure produces 10 new files plus modifications to 2 existing files (`tab-routing.ts`, `App.tsx`). The 4 audit fixes touch `orchestrator.ts` and `agent-reactions.ts`.
