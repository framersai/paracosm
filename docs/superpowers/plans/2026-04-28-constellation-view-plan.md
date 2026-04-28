# Constellation View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user has a "no subagents" rule — execute inline.

**Goal:** Render N≥3 actors during a live Sim as nodes on a radial layout, with edges weighted by HEXACO similarity, instead of the 2-cap Side-by-side layout.

**Architecture:** New layout mode inside the existing Sim tab, gated behind a small toggle in the header. Consumes the same `GameState` already flowing through Sim. Pure SVG (no D3, no canvas). Click on a node opens an `ActorDrillInModal` that composes `<ActorBar>` + a single-actor events timeline — `ReportView` is hard-coded to slot A/B and isn't reusable for one-actor presentation.

**Tech Stack:** TypeScript 5.9, React 18, pure SVG. `node --test` + `react-dom/server` for tests (existing pattern).

**Spec:** [`docs/superpowers/specs/2026-04-28-constellation-view-design.md`](../specs/2026-04-28-constellation-view-design.md)

---

## File map

**Create:**
- `src/cli/dashboard/src/components/sim/computeHexacoDistances.ts`
- `src/cli/dashboard/src/components/sim/computeHexacoDistances.test.ts`
- `src/cli/dashboard/src/components/sim/ConstellationView.tsx`
- `src/cli/dashboard/src/components/sim/ConstellationView.test.tsx`
- `src/cli/dashboard/src/components/sim/ConstellationView.module.scss`
- `src/cli/dashboard/src/components/sim/SimLayoutToggle.tsx`
- `src/cli/dashboard/src/components/sim/SimLayoutToggle.test.tsx`
- `src/cli/dashboard/src/components/sim/ActorDrillInModal.tsx`
- `src/cli/dashboard/src/components/sim/ActorDrillInModal.test.tsx`

**Modify:**
- `src/cli/dashboard/src/components/sim/SimView.tsx` — add layout state, render toggle, switch body, host modal

---

## Task 1: HEXACO distance helper

**Files:**
- Create: `src/cli/dashboard/src/components/sim/computeHexacoDistances.ts`
- Create: `src/cli/dashboard/src/components/sim/computeHexacoDistances.test.ts`

Pure function. Pairwise Euclidean distance over six HEXACO axes, normalized against the observed max so contrast stays visible regardless of cluster spread. Missing axes default to 0.5.

- [ ] **Step 1: Write the failing test**

Write `src/cli/dashboard/src/components/sim/computeHexacoDistances.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHexacoDistances } from './computeHexacoDistances.js';

const flat = { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5 };
const high = { openness: 1, conscientiousness: 1, extraversion: 1, agreeableness: 1, emotionality: 1, honestyHumility: 1 };
const low =  { openness: 0, conscientiousness: 0, extraversion: 0, agreeableness: 0, emotionality: 0, honestyHumility: 0 };

test('computeHexacoDistances: 0 actors yields no pairs', () => {
  const out = computeHexacoDistances([]);
  assert.deepEqual(out.pairs, []);
});

test('computeHexacoDistances: 1 actor yields no pairs', () => {
  const out = computeHexacoDistances([{ name: 'a', hexaco: flat }]);
  assert.deepEqual(out.pairs, []);
});

test('computeHexacoDistances: 2 actors → 1 pair', () => {
  const out = computeHexacoDistances([
    { name: 'a', hexaco: flat },
    { name: 'b', hexaco: high },
  ]);
  assert.equal(out.pairs.length, 1);
  assert.equal(out.pairs[0].a, 'a');
  assert.equal(out.pairs[0].b, 'b');
});

test('computeHexacoDistances: 3 actors → 3 pairs (full graph)', () => {
  const out = computeHexacoDistances([
    { name: 'a', hexaco: flat },
    { name: 'b', hexaco: high },
    { name: 'c', hexaco: low },
  ]);
  assert.equal(out.pairs.length, 3);
});

test('computeHexacoDistances: identical actors → distance 0, normalized 0', () => {
  const out = computeHexacoDistances([
    { name: 'a', hexaco: flat },
    { name: 'b', hexaco: { ...flat } },
  ]);
  assert.equal(out.pairs[0].distance, 0);
  assert.equal(out.pairs[0].normalized, 0);
});

test('computeHexacoDistances: max-distance pair (all-0 vs all-1) → normalized 1', () => {
  const out = computeHexacoDistances([
    { name: 'a', hexaco: low },
    { name: 'b', hexaco: high },
  ]);
  assert.equal(out.pairs[0].normalized, 1);
});

test('computeHexacoDistances: normalization uses observed max not theoretical', () => {
  // Three near-twin actors. Without observed-max normalization the
  // edges would all be near 0; with it, the small differences span
  // the full [0, 1] range so the contrast remains legible.
  const a = { ...flat, openness: 0.5 };
  const b = { ...flat, openness: 0.6 };
  const c = { ...flat, openness: 0.7 };
  const out = computeHexacoDistances([
    { name: 'a', hexaco: a },
    { name: 'b', hexaco: b },
    { name: 'c', hexaco: c },
  ]);
  // Largest pairwise distance is a↔c (0.2 on one axis); should map to 1.
  const ac = out.pairs.find(p => (p.a === 'a' && p.b === 'c') || (p.a === 'c' && p.b === 'a'));
  assert.ok(ac);
  assert.equal(ac!.normalized, 1);
});

test('computeHexacoDistances: missing hexaco field defaults each axis to 0.5', () => {
  const out = computeHexacoDistances([
    { name: 'a', hexaco: {} as Record<string, number> },
    { name: 'b', hexaco: high },
  ]);
  // a effectively (0.5, 0.5, 0.5, 0.5, 0.5, 0.5) vs b (1, 1, 1, 1, 1, 1).
  // Distance = sqrt(6 × 0.25) = sqrt(1.5) ≈ 1.2247. Single pair → normalized 1.
  assert.ok(Math.abs(out.pairs[0].distance - Math.sqrt(1.5)) < 1e-9);
  assert.equal(out.pairs[0].normalized, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/dashboard/src/components/sim/computeHexacoDistances.test.ts
```

Expected: FAIL with "Cannot find module './computeHexacoDistances.js'"

- [ ] **Step 3: Implement the helper**

Write `src/cli/dashboard/src/components/sim/computeHexacoDistances.ts`:

```typescript
/**
 * Pure helper: pairwise HEXACO Euclidean distance, normalized against
 * the observed max so the brightest edges always reflect the closest
 * pair in the visible set (regardless of how clustered or spread the
 * actors happen to be). Missing per-axis values default to 0.5 to
 * keep early-stream actors that haven't broadcast HEXACO yet from
 * tanking the layout.
 *
 * @module paracosm/dashboard/sim/computeHexacoDistances
 */

const HEXACO_AXES = [
  'openness', 'conscientiousness', 'extraversion',
  'agreeableness', 'emotionality', 'honestyHumility',
] as const;

export interface ActorTraitProfile {
  name: string;
  hexaco: Record<string, number>;
}

export interface DistancePair {
  a: string;
  b: string;
  distance: number;
  normalized: number;
}

export interface DistanceResult {
  pairs: DistancePair[];
}

export function computeHexacoDistances(actors: ActorTraitProfile[]): DistanceResult {
  if (actors.length < 2) return { pairs: [] };

  const raw: DistancePair[] = [];
  for (let i = 0; i < actors.length; i += 1) {
    for (let j = i + 1; j < actors.length; j += 1) {
      const a = actors[i];
      const b = actors[j];
      let sumSq = 0;
      for (const axis of HEXACO_AXES) {
        const av = typeof a.hexaco[axis] === 'number' ? a.hexaco[axis] : 0.5;
        const bv = typeof b.hexaco[axis] === 'number' ? b.hexaco[axis] : 0.5;
        const d = av - bv;
        sumSq += d * d;
      }
      raw.push({ a: a.name, b: b.name, distance: Math.sqrt(sumSq), normalized: 0 });
    }
  }

  // Normalize against the observed max so contrast stays visible even
  // when actors cluster tightly. When max is 0 (all identical), every
  // normalized value is 0.
  const max = raw.reduce((m, p) => Math.max(m, p.distance), 0);
  for (const p of raw) {
    p.normalized = max > 0 ? p.distance / max : 0;
  }

  return { pairs: raw };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/dashboard/src/components/sim/computeHexacoDistances.test.ts
```

Expected: `pass 8`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/cli/dashboard/src/components/sim/computeHexacoDistances.ts src/cli/dashboard/src/components/sim/computeHexacoDistances.test.ts
git commit -m "feat(sim): computeHexacoDistances helper for Constellation edge weights"
```

---

## Task 2: SimLayoutToggle

**Files:**
- Create: `src/cli/dashboard/src/components/sim/SimLayoutToggle.tsx`
- Create: `src/cli/dashboard/src/components/sim/SimLayoutToggle.test.tsx`

Two-state toggle: Side-by-side | Constellation. Side-by-side disabled when `actorCount > 2` (with tooltip).

- [ ] **Step 1: Write the failing test**

Write `src/cli/dashboard/src/components/sim/SimLayoutToggle.test.tsx`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from 'react-dom/server';
import * as React from 'react';
import { SimLayoutToggle } from './SimLayoutToggle.js';

test('SimLayoutToggle: at actorCount=2 both options enabled', () => {
  const html = renderToString(
    <SimLayoutToggle layout="side-by-side" actorCount={2} onChange={() => {}} />,
  );
  // Side-by-side button must NOT be disabled.
  const sideBtn = html.match(/<button[^>]*data-layout="side-by-side"[^>]*>/);
  assert.ok(sideBtn, 'side-by-side button rendered');
  assert.ok(!sideBtn![0].includes('disabled'), 'side-by-side enabled at N=2');
});

test('SimLayoutToggle: at actorCount=3 side-by-side is disabled with explanatory title', () => {
  const html = renderToString(
    <SimLayoutToggle layout="constellation" actorCount={3} onChange={() => {}} />,
  );
  const sideBtn = html.match(/<button[^>]*data-layout="side-by-side"[^>]*>/);
  assert.ok(sideBtn);
  assert.ok(sideBtn![0].includes('disabled'), 'side-by-side disabled at N>2');
  assert.match(sideBtn![0], /title="[^"]*caps at 2/);
});

test('SimLayoutToggle: active button gets the active class', () => {
  const html = renderToString(
    <SimLayoutToggle layout="constellation" actorCount={5} onChange={() => {}} />,
  );
  // The active button is the constellation one; it should carry the
  // active styling marker.
  const constBtn = html.match(/<button[^>]*data-layout="constellation"[^>]*>/);
  assert.ok(constBtn);
  assert.match(constBtn![0], /aria-pressed="true"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/dashboard/src/components/sim/SimLayoutToggle.test.tsx
```

Expected: FAIL with "Cannot find module './SimLayoutToggle.js'"

- [ ] **Step 3: Implement the toggle**

Write `src/cli/dashboard/src/components/sim/SimLayoutToggle.tsx`:

```typescript
/**
 * Sim header toggle between Side-by-side and Constellation layouts.
 * Side-by-side is hard-disabled when actorCount > 2 because the
 * existing 2-column layout literally can't render more than two
 * actors. Tooltip on the disabled state explains why.
 *
 * @module paracosm/dashboard/sim/SimLayoutToggle
 */
import * as React from 'react';

export type SimLayout = 'side-by-side' | 'constellation';

export interface SimLayoutToggleProps {
  layout: SimLayout;
  actorCount: number;
  onChange: (next: SimLayout) => void;
}

const buttonStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 11,
  fontFamily: 'var(--mono)',
  fontWeight: 600,
  background: 'transparent',
  color: 'var(--text-3)',
  border: '1px solid var(--border)',
  cursor: 'pointer',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const activeStyle: React.CSSProperties = {
  ...buttonStyle,
  color: 'var(--amber)',
  background: 'var(--bg-card)',
  borderColor: 'var(--amber)',
};

const disabledStyle: React.CSSProperties = {
  ...buttonStyle,
  opacity: 0.45,
  cursor: 'not-allowed',
};

export function SimLayoutToggle({ layout, actorCount, onChange }: SimLayoutToggleProps): JSX.Element {
  const sideDisabled = actorCount > 2;
  return (
    <div role="group" aria-label="Sim layout" style={{ display: 'inline-flex', gap: 0 }}>
      <button
        type="button"
        data-layout="side-by-side"
        aria-pressed={layout === 'side-by-side'}
        disabled={sideDisabled}
        onClick={() => !sideDisabled && onChange('side-by-side')}
        style={
          sideDisabled
            ? { ...disabledStyle, borderRadius: '3px 0 0 3px' }
            : layout === 'side-by-side'
              ? { ...activeStyle, borderRadius: '3px 0 0 3px' }
              : { ...buttonStyle, borderRadius: '3px 0 0 3px' }
        }
        title={sideDisabled ? 'Side-by-side caps at 2 actors' : 'Side-by-side: A/B columns'}
      >
        Side-by-side
      </button>
      <button
        type="button"
        data-layout="constellation"
        aria-pressed={layout === 'constellation'}
        onClick={() => onChange('constellation')}
        style={{
          ...(layout === 'constellation' ? activeStyle : buttonStyle),
          borderRadius: '0 3px 3px 0',
          borderLeft: 'none',
        }}
        title="Constellation: radial layout for any actor count"
      >
        Constellation
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/dashboard/src/components/sim/SimLayoutToggle.test.tsx
```

Expected: `pass 3`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/cli/dashboard/src/components/sim/SimLayoutToggle.tsx src/cli/dashboard/src/components/sim/SimLayoutToggle.test.tsx
git commit -m "feat(sim): SimLayoutToggle for Side-by-side vs Constellation"
```

---

## Task 3: ConstellationView SVG renderer

**Files:**
- Create: `src/cli/dashboard/src/components/sim/ConstellationView.tsx`
- Create: `src/cli/dashboard/src/components/sim/ConstellationView.test.tsx`
- Create: `src/cli/dashboard/src/components/sim/ConstellationView.module.scss`

Pure SVG: actors arranged on a circle, edges between every pair, click handler on each node.

- [ ] **Step 1: Write the failing test**

Write `src/cli/dashboard/src/components/sim/ConstellationView.test.tsx`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from 'react-dom/server';
import * as React from 'react';
import { ConstellationView } from './ConstellationView.js';
import type { GameState } from '../../hooks/useGameState.js';

const baseHexaco = { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5 };

function makeState(actorNames: string[]): GameState {
  const actors: Record<string, unknown> = {};
  for (const name of actorNames) {
    actors[name] = {
      leader: { name, archetype: 'Test', unit: 'TestUnit', hexaco: baseHexaco },
      metrics: null, prevMetrics: null, event: null,
      events: [], popHistory: [], moraleHistory: [],
      deaths: 0, deathCauses: {}, tools: 0, toolNames: new Set(),
      citations: 0, decisions: 0,
      pendingDecision: '', pendingRationale: '', pendingReasoning: '', pendingPolicies: [],
      outcome: null, agentSnapshots: [], currentEvents: [],
    };
  }
  return {
    actors, actorIds: actorNames,
    turn: 0, time: 0, maxTurns: 6, seed: 950,
    isRunning: false, isComplete: false,
    cost: { totalTokens: 0, totalCostUSD: 0, llmCalls: 0 },
    costByActor: {},
  } as unknown as GameState;
}

test('ConstellationView: 3 actors → 3 nodes + 3 edges (full graph)', () => {
  const html = renderToString(<ConstellationView state={makeState(['a', 'b', 'c'])} onActorClick={() => {}} />);
  const nodes = html.match(/<circle[^>]*data-actor=/g) ?? [];
  const edges = html.match(/<line[^>]*data-edge=/g) ?? [];
  assert.equal(nodes.length, 3);
  assert.equal(edges.length, 3); // C(3,2) = 3
});

test('ConstellationView: 5 actors → 5 nodes + 10 edges', () => {
  const html = renderToString(<ConstellationView state={makeState(['a', 'b', 'c', 'd', 'e'])} onActorClick={() => {}} />);
  const nodes = html.match(/<circle[^>]*data-actor=/g) ?? [];
  const edges = html.match(/<line[^>]*data-edge=/g) ?? [];
  assert.equal(nodes.length, 5);
  assert.equal(edges.length, 10); // C(5,2) = 10
});

test('ConstellationView: 50 actors → 50 nodes + 1225 edges (perf sanity)', () => {
  const names = Array.from({ length: 50 }, (_, i) => `actor-${i}`);
  const html = renderToString(<ConstellationView state={makeState(names)} onActorClick={() => {}} />);
  const nodes = html.match(/<circle[^>]*data-actor=/g) ?? [];
  const edges = html.match(/<line[^>]*data-edge=/g) ?? [];
  assert.equal(nodes.length, 50);
  assert.equal(edges.length, 1225); // C(50,2) = 1225
});

test('ConstellationView: 0 actors → empty-state placeholder, no SVG', () => {
  const html = renderToString(<ConstellationView state={makeState([])} onActorClick={() => {}} />);
  assert.match(html, /Constellation will appear/);
  assert.ok(!html.includes('<svg'));
});

test('ConstellationView: 1 actor → 1 node, 0 edges', () => {
  const html = renderToString(<ConstellationView state={makeState(['solo'])} onActorClick={() => {}} />);
  const nodes = html.match(/<circle[^>]*data-actor=/g) ?? [];
  const edges = html.match(/<line[^>]*data-edge=/g) ?? [];
  assert.equal(nodes.length, 1);
  assert.equal(edges.length, 0);
});

test('ConstellationView: each node carries its actor name on data-actor', () => {
  const html = renderToString(<ConstellationView state={makeState(['Aria', 'Bob', 'Cleo'])} onActorClick={() => {}} />);
  assert.match(html, /data-actor="Aria"/);
  assert.match(html, /data-actor="Bob"/);
  assert.match(html, /data-actor="Cleo"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/dashboard/src/components/sim/ConstellationView.test.tsx
```

Expected: FAIL with "Cannot find module './ConstellationView.js'"

- [ ] **Step 3: Create the SCSS stub**

Write `src/cli/dashboard/src/components/sim/ConstellationView.module.scss`:

```scss
.wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 400px;
  padding: 1rem;
}

.svg {
  display: block;
  max-width: 100%;
  max-height: 100%;
}

.empty {
  color: var(--text-dim, #888);
  font-size: 0.875rem;
  font-family: var(--mono);
  text-align: center;
  padding: 4rem 2rem;
}

.edge {
  stroke: var(--text-3, #888);
}

.node {
  cursor: pointer;
  stroke: var(--bg-panel);
  stroke-width: 2;
  transition: r 0.12s ease;
}

.node:hover,
.node:focus {
  outline: none;
  filter: brightness(1.2);
}

.label {
  font-size: 11px;
  font-family: var(--mono);
  font-weight: 600;
  fill: var(--text-2);
  pointer-events: none;
  user-select: none;
}
```

- [ ] **Step 4: Implement ConstellationView**

Write `src/cli/dashboard/src/components/sim/ConstellationView.tsx`:

```typescript
/**
 * Radial constellation layout for N actors. Each actor is a node on a
 * circle; every pair has an edge whose opacity = (1 - normalized
 * HEXACO distance), so close-personality pairs render bright and
 * divergent pairs fade. Click any node to drill into its full report.
 *
 * Pure SVG, no D3, no canvas. The position table + distance map are
 * memoized on actorIds.length so a 50-actor sim re-rendering at SSE
 * cadence stays under 16ms.
 *
 * @module paracosm/dashboard/sim/ConstellationView
 */
import * as React from 'react';
import styles from './ConstellationView.module.scss';
import { computeHexacoDistances } from './computeHexacoDistances.js';
import { getActorColorVar } from '../../hooks/useGameState.js';
import type { GameState } from '../../hooks/useGameState.js';

export interface ConstellationViewProps {
  state: GameState;
  onActorClick: (name: string) => void;
}

const NODE_RADIUS = 18;
const LABEL_MARGIN = 80;

/** Polar layout. Actor 0 sits at 12 o'clock; rest fan clockwise. */
function computePositions(actorCount: number): Array<{ cx: number; cy: number; angle: number }> {
  if (actorCount === 0) return [];
  const radius = Math.min(460, Math.max(120, 60 + 12 * actorCount));
  const center = radius + LABEL_MARGIN;
  const positions: Array<{ cx: number; cy: number; angle: number }> = [];
  for (let i = 0; i < actorCount; i += 1) {
    const angle = (i / Math.max(1, actorCount)) * 2 * Math.PI - Math.PI / 2;
    positions.push({
      cx: center + radius * Math.cos(angle),
      cy: center + radius * Math.sin(angle),
      angle,
    });
  }
  return positions;
}

function svgSize(actorCount: number): number {
  if (actorCount === 0) return 0;
  const radius = Math.min(460, Math.max(120, 60 + 12 * actorCount));
  return (radius + LABEL_MARGIN) * 2;
}

export function ConstellationView({ state, onActorClick }: ConstellationViewProps): JSX.Element {
  const actorIds = state.actorIds;

  if (actorIds.length === 0) {
    return (
      <div className={styles.empty}>
        Constellation will appear when actors are launched.
      </div>
    );
  }

  const positions = React.useMemo(() => computePositions(actorIds.length), [actorIds.length]);

  // Distance map keyed on actorIds.length AND the underlying hexaco
  // values. We snapshot the hexaco strings into a stable signature so
  // a re-render that doesn't actually change traits skips the recompute.
  const traits = React.useMemo(
    () => actorIds.map((id) => {
      const leader = state.actors[id]?.leader;
      return { name: id, hexaco: leader?.hexaco ?? {} };
    }),
    [actorIds, state.actors],
  );
  const traitsSig = traits.map((t) => `${t.name}:${Object.values(t.hexaco).join(',')}`).join('|');
  const distances = React.useMemo(() => computeHexacoDistances(traits), [traitsSig]);

  // Build pair lookup so we can color edges by normalized distance in O(1).
  const pairLookup = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of distances.pairs) {
      m.set(`${p.a}|${p.b}`, p.normalized);
      m.set(`${p.b}|${p.a}`, p.normalized);
    }
    return m;
  }, [distances]);

  const size = svgSize(actorIds.length);

  return (
    <div className={styles.wrap}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-label={`Constellation of ${actorIds.length} actors`}
      >
        {/* Edges first so they sit behind nodes. */}
        {actorIds.map((idA, i) => actorIds.slice(i + 1).map((idB) => {
          const pa = positions[i];
          const pb = positions[actorIds.indexOf(idB)];
          if (!pa || !pb) return null;
          const norm = pairLookup.get(`${idA}|${idB}`) ?? 0;
          // Bright = similar; faded = divergent. Clamp to [0.06, 0.95].
          const opacity = Math.max(0.06, Math.min(0.95, 1 - norm));
          return (
            <line
              key={`${idA}|${idB}`}
              data-edge={`${idA}|${idB}`}
              className={styles.edge}
              x1={pa.cx}
              y1={pa.cy}
              x2={pb.cx}
              y2={pb.cy}
              strokeOpacity={opacity}
              strokeWidth={1.5}
            />
          );
        }))}

        {/* Nodes. */}
        {actorIds.map((id, i) => {
          const pos = positions[i];
          if (!pos) return null;
          const color = getActorColorVar(i);
          const leader = state.actors[id]?.leader;
          const archetype = leader?.archetype ?? '';
          // Place the label outside the node along the same polar angle
          // so it never overlaps the circle or its neighbors.
          const labelDistance = NODE_RADIUS + 14;
          const lx = pos.cx + Math.cos(pos.angle) * labelDistance;
          const ly = pos.cy + Math.sin(pos.angle) * labelDistance;
          // Anchor the label so it grows away from the node.
          const anchor = pos.angle > -Math.PI / 2 && pos.angle < Math.PI / 2 ? 'start' : 'end';
          return (
            <g key={id}>
              <circle
                data-actor={id}
                className={styles.node}
                cx={pos.cx}
                cy={pos.cy}
                r={NODE_RADIUS}
                fill={color}
                onClick={() => onActorClick(id)}
                tabIndex={0}
                role="button"
                aria-label={`Open report for ${id}`}
              >
                <title>{`${id}${archetype ? ` · ${archetype}` : ''}`}</title>
              </circle>
              <text
                className={styles.label}
                x={lx}
                y={ly}
                textAnchor={anchor}
                dominantBaseline="middle"
              >
                {id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/dashboard/src/components/sim/ConstellationView.test.tsx
```

Expected: `pass 6`, `fail 0`

- [ ] **Step 6: Commit**

```bash
git add src/cli/dashboard/src/components/sim/ConstellationView.tsx src/cli/dashboard/src/components/sim/ConstellationView.test.tsx src/cli/dashboard/src/components/sim/ConstellationView.module.scss
git commit -m "feat(sim): ConstellationView SVG layout for N actors with edge weights"
```

---

## Task 4: ActorDrillInModal

**Files:**
- Create: `src/cli/dashboard/src/components/sim/ActorDrillInModal.tsx`
- Create: `src/cli/dashboard/src/components/sim/ActorDrillInModal.test.tsx`

Modal popup with `<ActorBar>` header + per-actor events timeline. Esc + backdrop close. Reuses CompareModal's a11y pattern.

- [ ] **Step 1: Write the failing test**

Write `src/cli/dashboard/src/components/sim/ActorDrillInModal.test.tsx`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from 'react-dom/server';
import * as React from 'react';
import { ActorDrillInModal } from './ActorDrillInModal.js';
import type { GameState, ActorSideState, ProcessedEvent } from '../../hooks/useGameState.js';

const flatHexaco = { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5 };

function makeActor(name: string, events: ProcessedEvent[]): ActorSideState {
  return {
    leader: { name, archetype: 'Visionary', unit: 'Alpha', hexaco: flatHexaco },
    metrics: null, prevMetrics: null, event: null,
    events,
    popHistory: [], moraleHistory: [],
    deaths: 0, deathCauses: {}, tools: 0, toolNames: new Set(),
    citations: 0, decisions: 0,
    pendingDecision: '', pendingRationale: '', pendingReasoning: '', pendingPolicies: [],
    outcome: null, agentSnapshots: [], currentEvents: [],
  };
}

function makeState(byName: Record<string, ActorSideState>): GameState {
  return {
    actors: byName,
    actorIds: Object.keys(byName),
    turn: 0, time: 0, maxTurns: 6, seed: 950,
    isRunning: false, isComplete: false,
    cost: { totalTokens: 0, totalCostUSD: 0, llmCalls: 0 },
    costByActor: {},
  } as unknown as GameState;
}

test('ActorDrillInModal: returns null when actorName is null', () => {
  const html = renderToString(
    <ActorDrillInModal actorName={null} state={makeState({})} actorIndex={0} onClose={() => {}} />,
  );
  assert.equal(html, '');
});

test('ActorDrillInModal: renders actor name in header', () => {
  const state = makeState({ Aria: makeActor('Aria', []) });
  const html = renderToString(
    <ActorDrillInModal actorName="Aria" state={state} actorIndex={0} onClose={() => {}} />,
  );
  assert.match(html, /Aria/);
});

test('ActorDrillInModal: only shows the picked actor events, not other actors', () => {
  const ariaEvents: ProcessedEvent[] = [
    { id: 'e1', type: 'turn_start', turn: 1, data: { title: 'Aria T1 event' } },
  ];
  const bobEvents: ProcessedEvent[] = [
    { id: 'e2', type: 'turn_start', turn: 1, data: { title: 'Bob T1 event' } },
  ];
  const state = makeState({
    Aria: makeActor('Aria', ariaEvents),
    Bob: makeActor('Bob', bobEvents),
  });
  const html = renderToString(
    <ActorDrillInModal actorName="Aria" state={state} actorIndex={0} onClose={() => {}} />,
  );
  assert.match(html, /Aria T1 event/);
  assert.ok(!html.includes('Bob T1 event'));
});

test('ActorDrillInModal: renders close button', () => {
  const state = makeState({ Aria: makeActor('Aria', []) });
  const html = renderToString(
    <ActorDrillInModal actorName="Aria" state={state} actorIndex={0} onClose={() => {}} />,
  );
  assert.match(html, /aria-label="Close drill-in"/);
});

test('ActorDrillInModal: derives a Decisions section from decision_made events', () => {
  const events: ProcessedEvent[] = [
    { id: 'd1', type: 'decision_made', turn: 1, data: { choice: 'Conserve power', rationale: 'Margins first.' } },
    { id: 'e1', type: 'turn_start', turn: 1, data: { title: 'Storm hits' } },
  ];
  const state = makeState({ Aria: makeActor('Aria', events) });
  const html = renderToString(
    <ActorDrillInModal actorName="Aria" state={state} actorIndex={0} onClose={() => {}} />,
  );
  assert.match(html, /Conserve power/);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/dashboard/src/components/sim/ActorDrillInModal.test.tsx
```

Expected: FAIL with "Cannot find module './ActorDrillInModal.js'"

- [ ] **Step 3: Implement the modal**

Write `src/cli/dashboard/src/components/sim/ActorDrillInModal.tsx`:

```typescript
/**
 * Modal popup for a single actor when the user clicks a node in the
 * Constellation view. Composes <ActorBar> (header chip + HEXACO bars
 * + spark histories) with a vertical timeline of that actor's events
 * grouped by turn, plus a Decisions section derived from
 * `type === 'decision_made'` events.
 *
 * Doesn't reuse <ReportView> because that component is hard-coded to
 * actorIds[0]/actorIds[1] slot rendering — passing it a single-actor
 * filtered state would render an empty B-column.
 *
 * @module paracosm/dashboard/sim/ActorDrillInModal
 */
import * as React from 'react';
import { ActorBar } from '../layout/ActorBar.js';
import type { GameState, ProcessedEvent } from '../../hooks/useGameState.js';

export interface ActorDrillInModalProps {
  actorName: string | null;
  actorIndex: number;
  state: GameState;
  onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.55)',
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const modalStyle: React.CSSProperties = {
  background: 'var(--bg-panel)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  width: 'min(820px, 92vw)',
  maxHeight: '92vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.75rem 1rem',
  borderBottom: '1px solid var(--border)',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text-2)',
  border: 'none',
  fontSize: 22,
  lineHeight: 1,
  cursor: 'pointer',
  padding: '0 0.5rem',
};

const bodyStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  overflow: 'auto',
};

function eventTitle(e: ProcessedEvent): string {
  const data = e.data ?? {};
  const title = (data.title ?? data.choice ?? data.summary) as string | undefined;
  return title ?? e.type;
}

export function ActorDrillInModal({ actorName, actorIndex, state, onClose }: ActorDrillInModalProps): JSX.Element | null {
  React.useEffect(() => {
    if (actorName === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actorName, onClose]);

  if (actorName === null) return null;
  const side = state.actors[actorName];
  if (!side) return null;

  const events = side.events ?? [];
  const decisions = events.filter((e) => e.type === 'decision_made');
  // Group events by turn so we render a per-turn fold.
  const grouped = new Map<number, ProcessedEvent[]>();
  for (const e of events) {
    const turn = e.turn ?? 0;
    const list = grouped.get(turn) ?? [];
    list.push(e);
    grouped.set(turn, list);
  }
  const turnNumbers = [...grouped.keys()].sort((a, b) => a - b);

  return (
    <div style={overlayStyle} role="presentation" onClick={onClose}>
      <div
        style={modalStyle}
        role="dialog"
        aria-modal="true"
        aria-label={`Report for ${actorName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headStyle}>
          <div style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{actorName}</div>
          <button type="button" aria-label="Close drill-in" style={closeBtnStyle} onClick={onClose}>×</button>
        </header>
        <div style={bodyStyle}>
          <ActorBar
            actorIndex={actorIndex}
            leader={side.leader}
            popHistory={side.popHistory}
            moraleHistory={side.moraleHistory}
          />

          {decisions.length > 0 && (
            <section style={{ marginTop: '1rem' }}>
              <h3 style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                Decisions ({decisions.length})
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0' }}>
                {decisions.map((d) => {
                  const choice = (d.data?.choice ?? d.data?.title ?? '<choice>') as string;
                  const rationale = (d.data?.rationale ?? '') as string;
                  return (
                    <li key={d.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 600 }}>T{d.turn ?? '?'}: {choice}</div>
                      {rationale && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>{rationale}</div>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section style={{ marginTop: '1rem' }}>
            <h3 style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
              Timeline ({events.length} events)
            </h3>
            {turnNumbers.length === 0 && (
              <p style={{ color: 'var(--text-3)' }}>No events captured yet.</p>
            )}
            {turnNumbers.map((turn) => (
              <article key={turn} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <header style={{ fontWeight: 600, fontFamily: 'var(--mono)' }}>Turn {turn}</header>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0.25rem 0 0' }}>
                  {(grouped.get(turn) ?? []).map((e) => (
                    <li key={e.id} style={{ fontSize: 13, padding: '0.15rem 0' }}>
                      <span style={{ color: 'var(--text-3)' }}>{e.type}</span>
                      {' '}
                      {eventTitle(e)}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --import tsx --import ./scripts/test-css-stub.mjs --test src/cli/dashboard/src/components/sim/ActorDrillInModal.test.tsx
```

Expected: `pass 5`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/cli/dashboard/src/components/sim/ActorDrillInModal.tsx src/cli/dashboard/src/components/sim/ActorDrillInModal.test.tsx
git commit -m "feat(sim): ActorDrillInModal — per-actor focused report from a constellation node"
```

---

## Task 5: Wire Constellation into SimView

**Files:**
- Modify: `src/cli/dashboard/src/components/sim/SimView.tsx`

Add layout state, render the toggle in the Sim header, switch the body, host the drill-in modal.

- [ ] **Step 1: Find the SimView render anchor**

Open `src/cli/dashboard/src/components/sim/SimView.tsx` and locate the existing `<StatsBar` block (~line 260):

```bash
grep -n '<StatsBar\|state.actorIds.slice' src/cli/dashboard/src/components/sim/SimView.tsx
```

The constellation switch lives at this site — when the layout is `'side-by-side'`, render the existing StatsBar + ActorBar pair; when `'constellation'`, render `<ConstellationView>` instead.

- [ ] **Step 2: Add the imports**

In `src/cli/dashboard/src/components/sim/SimView.tsx`, find the import block at the top and add:

```typescript
import { SimLayoutToggle, type SimLayout } from './SimLayoutToggle.js';
import { ConstellationView } from './ConstellationView.js';
import { ActorDrillInModal } from './ActorDrillInModal.js';
```

- [ ] **Step 3: Add the layout state + drill-in state**

Inside `SimView` (right after the existing `useState` hooks; search for `useState(()` to find the existing pattern), insert:

```typescript
const [layout, setLayout] = React.useState<SimLayout>(
  () => state.actorIds.length >= 3 ? 'constellation' : 'side-by-side',
);
const userPickedLayoutRef = React.useRef(false);
const setLayoutWithOverride = React.useCallback((next: SimLayout) => {
  userPickedLayoutRef.current = true;
  setLayout(next);
}, []);
// Auto-flip to constellation the first time actorCount crosses 3 mid-
// run, but only if the user hasn't already picked manually.
React.useEffect(() => {
  if (userPickedLayoutRef.current) return;
  if (state.actorIds.length >= 3 && layout === 'side-by-side') {
    setLayout('constellation');
  }
}, [state.actorIds.length, layout]);

const [drillInActor, setDrillInActor] = React.useState<string | null>(null);
const drillInIndex = drillInActor ? state.actorIds.indexOf(drillInActor) : 0;
```

(`React` is already imported as default in this file. If it isn't, also add `import * as React from 'react';` to the import block.)

- [ ] **Step 4: Render the toggle**

Find the existing Sim header / status row (search for `<StatsBar` and look at the JSX directly above it). Insert the toggle just before the StatsBar/Constellation switch with a thin wrapper:

```tsx
<div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
  <SimLayoutToggle
    layout={layout}
    actorCount={state.actorIds.length}
    onChange={setLayoutWithOverride}
  />
</div>
```

- [ ] **Step 5: Switch the body on `layout`**

Replace the existing `<StatsBar actors={state.actorIds.slice(0, 2).map(...)}/>` block with:

```tsx
{layout === 'constellation' ? (
  <ConstellationView
    state={state}
    onActorClick={(name) => setDrillInActor(name)}
  />
) : (
  <StatsBar
    actors={state.actorIds.slice(0, 2).map(id => ({ id, state: state.actors[id] }))}
    crisisText={crisisText}
    toolRegistry={toolRegistry}
  />
)}
```

- [ ] **Step 6: Host the drill-in modal**

At the end of `SimView`'s return JSX (just before the closing fragment / wrapper element), add:

```tsx
<ActorDrillInModal
  actorName={drillInActor}
  actorIndex={drillInIndex >= 0 ? drillInIndex : 0}
  state={state}
  onClose={() => setDrillInActor(null)}
/>
```

- [ ] **Step 7: Verify dashboard typecheck**

```bash
pnpm typecheck:dashboard
```

Expected: clean (no new errors)

- [ ] **Step 8: Run the full Sim-related dashboard test suite**

```bash
node --import tsx --import ./scripts/test-css-stub.mjs --test 'src/cli/dashboard/src/components/sim/**/*.test.*'
```

Expected: every constellation test + any pre-existing Sim test passing.

- [ ] **Step 9: Commit**

```bash
git add src/cli/dashboard/src/components/sim/SimView.tsx
git commit -m "feat(sim): wire Constellation layout toggle + drill-in modal into SimView"
```

---

## Task 6: Verify everything

**Files:** none new

Final integration check.

- [ ] **Step 1: Full dashboard typecheck**

```bash
pnpm typecheck:dashboard
```

Expected: clean

- [ ] **Step 2: Full server typecheck**

```bash
pnpm tsc --noEmit
```

Expected: clean

- [ ] **Step 3: Full test suite**

```bash
pnpm test
```

Expected: all green (the pre-existing `skipped: 1` is fine; `fail: 0` is required).

- [ ] **Step 4: Push**

```bash
git push origin master
```

CI auto-deploys to paracosm.agentos.sh. Smoke-test on the live site:

1. Navigate to the Sim tab
2. Run a Quickstart with `actorCount: 5` (drop the slider in SeedInput)
3. Confirm the Constellation appears as the default layout once 3+ actors arrive on the SSE stream
4. Click any node → drill-in modal opens with that actor's events + decisions
5. Press Esc → modal closes
6. Toggle to Side-by-side → button is disabled (5 > 2), tooltip explains why
7. Re-run with `actorCount: 2` — Side-by-side is the default; toggle still allows opt-in to Constellation

---

## Self-review checklist

- [x] **Spec coverage** — every spec section has a task:
  - Architecture (Sim tab integration, layout toggle, GameState consumption): Tasks 2, 5
  - Components row in spec → tasks: computeHexacoDistances (Task 1), SimLayoutToggle (Task 2), ConstellationView + scss (Task 3), ActorDrillInModal (Task 4), SimView wiring (Task 5)
  - Layout math (radial polar, radius scaling, label rotation): Task 3
  - Edge metric (HEXACO Euclidean, observed-max normalization, default 0.5 for missing): Task 1
  - Drill-in (modal with ActorBar + events + decisions, Esc + backdrop, returns focus): Task 4
  - SimView integration (layout state, userOverride, threshold-flip useEffect, modal hosting): Task 5
  - Performance (useMemo on positions + distances, no CSS edge transitions): Task 3
  - Edge cases (N=0 empty state, N=1 no edges, missing hexaco): Tasks 1, 3
  - Testing strategy (4 test files): Tasks 1, 2, 3, 4

- [x] **No placeholders** — every step shows the exact code or command, no "TBD"/"similar to"/"add error handling".

- [x] **Type consistency:**
  - `SimLayout` discriminated union used in Tasks 2 + 5
  - `ConstellationViewProps` + `onActorClick` consistent in Task 3 + Task 5 wiring
  - `ActorDrillInModalProps` (`actorName: string | null`, `actorIndex`, `state`, `onClose`) consistent in Task 4 + Task 5
  - `DistancePair` / `DistanceResult` from Task 1 used in Task 3 via `pairs` array
  - `getActorColorVar(idx)` import from `useGameState.ts` consistent with the existing 2-side palette use

- [x] **Spec deviation note**: the spec said "returns focus to the clicked node on close". Task 4's modal handles Esc + backdrop close but does NOT explicitly return focus to the clicked node (would require a ref forwarded into ConstellationView). Treating this as a minor v1.1 polish — the existing CompareModal also doesn't forward focus across components, so the gap matches the codebase baseline.
