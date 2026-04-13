# Phase 1: Internal Abstraction Seams — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce scenario engine type system, registries, and hook-shaped extraction functions so Mars-specific logic flows through generic seams without moving any files.

**Architecture:** Create `src/engine/` with types and registries. Create `src/engine/mars/` with Mars-specific data extracted from inline hardcoded values. Wire registries into the orchestrator and kernel so existing behavior is preserved but now flows through the scenario abstraction layer. No existing file paths change. All existing tests continue to pass.

**Tech Stack:** TypeScript, Node built-in test runner (`node:test`), `tsx` for execution.

**Spec:** `docs/superpowers/specs/2026-04-13-scenario-engine-generalization-design.md`

**Test command:** `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/*.test.ts src/engine/**/*.test.ts`

---

## File Structure

### New files (engine types and registries)

| File | Responsibility |
|------|----------------|
| `src/engine/types.ts` | All scenario type definitions: `ScenarioPackage`, `WorldState`, `AgentFieldDefinition`, `MetricDefinition`, `EffectDefinition`, `EventDefinition`, `ScenarioHooks`, `ScenarioPolicies`, `ScenarioUiDefinition`, `DepartmentDefinition`, `KnowledgeBundle`, `ScenarioPreset` |
| `src/engine/types.test.ts` | Type contract tests ensuring Mars scenario satisfies the interface |
| `src/engine/effect-registry.ts` | `EffectRegistry` class: stores scenario-declared effects, applies outcome multipliers, replaces hardcoded `categoryEffects` in orchestrator |
| `src/engine/effect-registry.test.ts` | Tests for effect registry |
| `src/engine/metric-registry.ts` | `MetricRegistry` class: maps scenario metric definitions to WorldState paths, provides formatters and header metadata |
| `src/engine/metric-registry.test.ts` | Tests for metric registry |
| `src/engine/event-taxonomy.ts` | `EventTaxonomy` class: maps event types to render metadata (icon, color, label) |
| `src/engine/event-taxonomy.test.ts` | Tests for event taxonomy |

### New files (Mars scenario data extraction)

| File | Responsibility |
|------|----------------|
| `src/engine/mars/index.ts` | Exports the Mars `ScenarioPackage` object |
| `src/engine/mars/effects.ts` | Mars category effects (extracted from orchestrator.ts:698-707) |
| `src/engine/mars/metrics.ts` | Mars metric definitions (extracted from kernel/state.ts ColonySystems + ColonyPolitics) |
| `src/engine/mars/events.ts` | Mars event type definitions |
| `src/engine/mars/prompts.ts` | Mars prompt fragment builders (extracted from agents/departments.ts:131-155 and agents/director.ts:70-102) |
| `src/engine/mars/progression-hooks.ts` | Mars-specific progression: radiation accumulation, bone density loss (extracted from kernel/progression.ts:140-149) |
| `src/engine/mars/research-bundle.ts` | Mars knowledge bundle (extracted from research/knowledge-base.ts) |
| `src/engine/mars/milestones.ts` | Mars crisis milestones for turn 1 and final turn (extracted from research/scenarios.ts and agents/director.ts:250-288) |
| `src/engine/mars/names.ts` | Mars name lists (extracted from kernel/colonist-generator.ts:15-52) |
| `src/engine/mars/presets.ts` | Mars leader presets and default key personnel (extracted from sim-config.ts:92-98) |

### Modified files

| File | Change |
|------|--------|
| `src/agents/orchestrator.ts` | Replace hardcoded `categoryEffects` with `EffectRegistry` lookup; accept scenario in `RunOptions` |
| `src/agents/departments.ts` | Add scenario-aware overload to `buildDepartmentContext` that calls scenario prompt hooks |
| `src/kernel/progression.ts` | Extract Mars radiation/bone density into a hook and call it, preserving existing behavior |
| `src/kernel/colonist-generator.ts` | Accept name lists as parameter (default to Mars names for backward compat) |

---

## Task 1: Engine Type System

**Files:**
- Create: `src/engine/types.ts`
- Test: `src/engine/types.test.ts`

- [ ] **Step 1: Write the type contract test**

```typescript
// src/engine/types.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { ScenarioPackage, WorldState, AgentFieldDefinition, MetricDefinition, EffectDefinition, EventDefinition, ScenarioPolicies, ScenarioUiDefinition, DepartmentDefinition, ScenarioHooks, ScenarioPreset, KnowledgeBundle } from './types.js';

test('ScenarioPackage type accepts a minimal valid scenario', () => {
  const scenario: ScenarioPackage = {
    id: 'test-scenario',
    version: '0.1.0',
    engineArchetype: 'closed_turn_based_settlement',
    labels: { name: 'Test', shortName: 'test', populationNoun: 'members', settlementNoun: 'base', currency: 'credits' },
    theme: { primaryColor: '#ff0000', accentColor: '#00ff00', cssVariables: {} },
    setup: { defaultTurns: 3, defaultSeed: 100, defaultStartYear: 2050, defaultPopulation: 50, configurableSections: ['leaders'] },
    world: {
      metrics: { morale: { id: 'morale', label: 'Morale', unit: '%', type: 'number', initial: 0.85, min: 0, max: 1, category: 'metric' } },
      capacities: {},
      statuses: {},
      politics: {},
      environment: {},
    },
    departments: [{ id: 'engineering', label: 'Engineering', role: 'Chief Engineer', icon: '🔧', defaultModel: 'gpt-5.4-mini', instructions: 'Analyze infrastructure.' }],
    metrics: [{ id: 'pop', label: 'Population', source: 'metrics.population', format: 'number' }],
    events: [{ id: 'crisis', label: 'Crisis', icon: '⚠️', color: '#ff0000' }],
    effects: [{ id: 'resource_shift', type: 'resource_shift', label: 'Resource Shift', categoryDefaults: {} }],
    ui: {
      headerMetrics: [{ id: 'pop', format: 'number' }],
      tooltipFields: [],
      reportSections: ['crisis', 'departments', 'decision'],
      departmentIcons: {},
      eventRenderers: {},
      setupSections: ['leaders'],
    },
    knowledge: { topics: {}, categoryMapping: {} },
    policies: {
      toolForging: { enabled: true },
      liveSearch: { enabled: false, mode: 'off' },
      bulletin: { enabled: true },
      characterChat: { enabled: false },
      sandbox: { timeoutMs: 10000, memoryMB: 128 },
    },
    presets: [],
    hooks: {},
  };

  assert.equal(scenario.id, 'test-scenario');
  assert.equal(scenario.engineArchetype, 'closed_turn_based_settlement');
  assert.equal(scenario.labels.populationNoun, 'members');
  assert.equal(scenario.world.metrics.morale.initial, 0.85);
  assert.equal(scenario.departments.length, 1);
  assert.equal(scenario.policies.toolForging.enabled, true);
});

test('WorldState accepts typed metric/capacity/status/politics/environment records', () => {
  const state: WorldState = {
    metrics: { population: 100, morale: 0.85, foodMonthsReserve: 18 },
    capacities: { lifeSupportCapacity: 120, pressurizedVolumeM3: 3000 },
    statuses: { governanceStatus: 'earth-governed' },
    politics: { earthDependencyPct: 95, independencePressure: 0.05 },
    environment: { surfaceRadiationMsvDay: 0.67 },
  };

  assert.equal(state.metrics.population, 100);
  assert.equal(state.statuses.governanceStatus, 'earth-governed');
  assert.equal(state.politics.earthDependencyPct, 95);
});

test('AgentFieldDefinition supports number, string, boolean, and tags types', () => {
  const fields: AgentFieldDefinition[] = [
    { id: 'radiation', label: 'Radiation', unit: 'mSv', type: 'number', initial: 0, min: 0, showInTooltip: true, includeInReactionContext: true },
    { id: 'marsborn', label: 'Mars-Born', unit: '', type: 'boolean', initial: false, showInTooltip: true, includeInReactionContext: true },
    { id: 'conditions', label: 'Conditions', unit: '', type: 'tags', initial: [], showInTooltip: false, includeInReactionContext: false },
  ];

  assert.equal(fields[0].type, 'number');
  assert.equal(fields[1].type, 'boolean');
  assert.equal(fields[2].type, 'tags');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/types.test.ts`
Expected: FAIL — module `./types.js` not found

- [ ] **Step 3: Write the type definitions**

```typescript
// src/engine/types.ts

// ---------------------------------------------------------------------------
// Primitive value types
// ---------------------------------------------------------------------------

export type AgentFieldValue = number | string | boolean | string[];

// ---------------------------------------------------------------------------
// Scenario labels and theme
// ---------------------------------------------------------------------------

export interface ScenarioLabels {
  name: string;
  shortName: string;
  populationNoun: string;
  settlementNoun: string;
  currency: string;
}

export interface ScenarioTheme {
  primaryColor: string;
  accentColor: string;
  cssVariables: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Setup schema
// ---------------------------------------------------------------------------

export interface ScenarioSetupSchema {
  defaultTurns: number;
  defaultSeed: number;
  defaultStartYear: number;
  defaultPopulation: number;
  configurableSections: Array<'leaders' | 'personnel' | 'resources' | 'departments' | 'events' | 'models' | 'advanced'>;
}

// ---------------------------------------------------------------------------
// World state schema
// ---------------------------------------------------------------------------

export interface WorldMetricSchema {
  id: string;
  label: string;
  unit: string;
  type: 'number' | 'string' | 'boolean';
  initial: number | string | boolean;
  min?: number;
  max?: number;
  category: 'metric' | 'capacity' | 'status' | 'politic' | 'environment';
}

export interface ScenarioWorldSchema {
  metrics: Record<string, WorldMetricSchema>;
  capacities: Record<string, WorldMetricSchema>;
  statuses: Record<string, WorldMetricSchema>;
  politics: Record<string, WorldMetricSchema>;
  environment: Record<string, WorldMetricSchema>;
}

export interface WorldState {
  metrics: Record<string, number>;
  capacities: Record<string, number>;
  statuses: Record<string, string | boolean>;
  politics: Record<string, number | string | boolean>;
  environment: Record<string, number | string | boolean>;
}

// ---------------------------------------------------------------------------
// Agent field definitions
// ---------------------------------------------------------------------------

export interface AgentFieldDefinition {
  id: string;
  label: string;
  unit: string;
  type: 'number' | 'string' | 'boolean' | 'tags';
  initial: AgentFieldValue;
  min?: number;
  max?: number;
  mortalityContribution?: { threshold: number; ratePerYear: number };
  showInTooltip: boolean;
  includeInReactionContext: boolean;
}

// ---------------------------------------------------------------------------
// Department definitions
// ---------------------------------------------------------------------------

export interface DepartmentDefinition {
  id: string;
  label: string;
  role: string;
  icon: string;
  defaultModel: string;
  instructions: string;
}

// ---------------------------------------------------------------------------
// Metrics, effects, events
// ---------------------------------------------------------------------------

export interface MetricDefinition {
  id: string;
  label: string;
  source: string;
  format: 'number' | 'percent' | 'currency' | 'duration';
}

export interface EffectDefinition {
  id: string;
  type: string;
  label: string;
  categoryDefaults: Record<string, Record<string, number>>;
}

export interface EventDefinition {
  id: string;
  label: string;
  icon: string;
  color: string;
}

// ---------------------------------------------------------------------------
// UI schema
// ---------------------------------------------------------------------------

export interface ScenarioUiDefinition {
  headerMetrics: Array<{ id: string; format: 'number' | 'percent' | 'currency' | 'duration' }>;
  tooltipFields: string[];
  reportSections: Array<'crisis' | 'departments' | 'decision' | 'outcome' | 'quotes' | 'causality'>;
  departmentIcons: Record<string, string>;
  eventRenderers: Record<string, { icon: string; color: string }>;
  setupSections: Array<'leaders' | 'personnel' | 'resources' | 'departments' | 'events' | 'models' | 'advanced'>;
}

// ---------------------------------------------------------------------------
// Knowledge bundle
// ---------------------------------------------------------------------------

export interface KnowledgeCitation {
  claim: string;
  source: string;
  url: string;
  doi?: string;
}

export interface KnowledgeTopic {
  canonicalFacts: KnowledgeCitation[];
  counterpoints: Array<{ claim: string; source: string; url: string }>;
  departmentNotes: Record<string, string>;
}

export interface KnowledgeBundle {
  topics: Record<string, KnowledgeTopic>;
  categoryMapping: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export interface ScenarioPolicies {
  toolForging: { enabled: boolean; requiredPerDepartment?: boolean };
  liveSearch: { enabled: boolean; mode: 'off' | 'manual' | 'auto' };
  bulletin: { enabled: boolean };
  characterChat: { enabled: boolean };
  sandbox: { timeoutMs: number; memoryMB: number };
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export interface ScenarioPreset {
  id: string;
  label: string;
  leaders?: Array<{ name: string; archetype: string; hexaco: Record<string, number>; instructions: string }>;
  personnel?: Array<{ name: string; department: string; role: string; specialization: string; age: number; featured: boolean }>;
  startingState?: Partial<WorldState>;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface ProgressionHookContext {
  colonists: any[];
  yearDelta: number;
  year: number;
  turn: number;
  rng: any;
}

export interface PromptHookContext {
  department: string;
  state: any;
  scenario: any;
  researchPacket: any;
}

export interface ScenarioHooks {
  /** Called during between-turn progression for scenario-specific health/field changes */
  progressionHook?: (ctx: ProgressionHookContext) => void;
  /** Builds department-specific prompt context lines */
  departmentPromptHook?: (ctx: PromptHookContext) => string[];
  /** Builds director system instructions */
  directorInstructions?: () => string;
  /** Builds director context prompt */
  directorPromptHook?: (ctx: any) => string;
  /** Builds reaction prompt context for a colonist */
  reactionContextHook?: (colonist: any, ctx: any) => string;
  /** Computes timeline fingerprint from final state */
  fingerprintHook?: (finalState: any, outcomeLog: any[], leader: any, toolRegs: Record<string, string[]>, maxTurns: number) => Record<string, string>;
}

// ---------------------------------------------------------------------------
// ScenarioPackage (top-level)
// ---------------------------------------------------------------------------

export interface ScenarioPackage {
  id: string;
  version: string;
  engineArchetype: 'closed_turn_based_settlement';

  labels: ScenarioLabels;
  theme: ScenarioTheme;
  setup: ScenarioSetupSchema;
  world: ScenarioWorldSchema;

  departments: DepartmentDefinition[];
  metrics: MetricDefinition[];
  events: EventDefinition[];
  effects: EffectDefinition[];
  ui: ScenarioUiDefinition;
  knowledge: KnowledgeBundle;
  policies: ScenarioPolicies;
  presets: ScenarioPreset[];
  hooks: ScenarioHooks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/types.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd apps/mars-genesis-simulation && git add src/engine/types.ts src/engine/types.test.ts && git commit -m "feat: add scenario engine type system (ScenarioPackage, WorldState, AgentFieldDefinition)"
```

---

## Task 2: Mars Category Effects Extraction

**Files:**
- Create: `src/engine/mars/effects.ts`
- Test: `src/engine/effect-registry.test.ts`
- Create: `src/engine/effect-registry.ts`

- [ ] **Step 1: Write the effect registry test**

```typescript
// src/engine/effect-registry.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { EffectRegistry } from './effect-registry.js';
import { MARS_CATEGORY_EFFECTS } from './mars/effects.js';

test('EffectRegistry returns base deltas for a known category', () => {
  const registry = new EffectRegistry(MARS_CATEGORY_EFFECTS);
  const base = registry.getBaseEffect('environmental');
  assert.ok(base);
  assert.equal(base!.powerKw, 50);
  assert.equal(base!.morale, 0.08);
  assert.equal(base!.foodMonthsReserve, 1);
});

test('EffectRegistry returns fallback for unknown category', () => {
  const registry = new EffectRegistry(MARS_CATEGORY_EFFECTS);
  const base = registry.getBaseEffect('unknown_category');
  assert.ok(base);
  assert.equal(base!.morale, 0.08);
});

test('EffectRegistry.applyOutcome computes risky_success multiplier', () => {
  const registry = new EffectRegistry(MARS_CATEGORY_EFFECTS);
  const deltas = registry.applyOutcome('infrastructure', 'risky_success', {
    personalityBonus: 0,
    noise: 0,
  });
  // infrastructure base: { infrastructureModules: 2, powerKw: 60, pressurizedVolumeM3: 200 }
  // risky_success multiplier: 2.5
  assert.equal(deltas.infrastructureModules, 5);
  assert.equal(deltas.powerKw, 150);
  assert.equal(deltas.pressurizedVolumeM3, 500);
});

test('EffectRegistry.applyOutcome computes risky_failure with negative multiplier', () => {
  const registry = new EffectRegistry(MARS_CATEGORY_EFFECTS);
  const deltas = registry.applyOutcome('resource', 'risky_failure', {
    personalityBonus: 0,
    noise: 0,
  });
  // resource base: { foodMonthsReserve: 4, waterLitersPerDay: 100, morale: 0.05 }
  // risky_failure multiplier: -2.0
  assert.equal(deltas.foodMonthsReserve, -8);
  assert.equal(deltas.waterLitersPerDay, -200);
  assert.equal(deltas.morale, -0.1);
});

test('EffectRegistry.applyOutcome applies personality bonus', () => {
  const registry = new EffectRegistry(MARS_CATEGORY_EFFECTS);
  // psychological base: { morale: 0.15 }
  // conservative_success multiplier: 1.0
  // personalityBonus: 0.1, noise: 0
  const deltas = registry.applyOutcome('psychological', 'conservative_success', {
    personalityBonus: 0.1,
    noise: 0,
  });
  // 0.15 * (1.0 + 0.1 + 0) = 0.15 * 1.1 = 0.165, rounded to 0.17
  assert.equal(deltas.morale, 0.17);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/effect-registry.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Write Mars category effects data**

```typescript
// src/engine/mars/effects.ts

/**
 * Mars-specific category effects. Extracted from orchestrator.ts hardcoded categoryEffects.
 * Maps crisis category -> base colony system deltas (applied with outcome multiplier).
 */
export const MARS_CATEGORY_EFFECTS: Record<string, Record<string, number>> = {
  environmental:  { powerKw: 50, morale: 0.08, foodMonthsReserve: 1 },
  resource:       { foodMonthsReserve: 4, waterLitersPerDay: 100, morale: 0.05 },
  medical:        { morale: 0.10, lifeSupportCapacity: 5 },
  psychological:  { morale: 0.15 },
  political:      { morale: 0.08, infrastructureModules: 1 },
  infrastructure: { infrastructureModules: 2, powerKw: 60, pressurizedVolumeM3: 200 },
  social:         { morale: 0.12 },
  technological:  { powerKw: 50, scienceOutput: 3, morale: 0.05 },
};

/** Default fallback effect when the category is unknown */
export const MARS_FALLBACK_EFFECT: Record<string, number> = { morale: 0.08 };

/** Crisis categories that trigger politics deltas */
export const MARS_POLITICS_CATEGORIES = new Set(['political', 'social']);

export const MARS_POLITICS_SUCCESS_DELTA = { independencePressure: 0.05, earthDependencyPct: -3 };
export const MARS_POLITICS_FAILURE_DELTA = { independencePressure: -0.03, earthDependencyPct: 2 };
```

- [ ] **Step 4: Write the EffectRegistry**

```typescript
// src/engine/effect-registry.ts

type TurnOutcome = 'risky_success' | 'risky_failure' | 'conservative_success' | 'conservative_failure';

const OUTCOME_MULTIPLIERS: Record<TurnOutcome, number> = {
  risky_success: 2.5,
  risky_failure: -2.0,
  conservative_success: 1.0,
  conservative_failure: -1.0,
};

export interface OutcomeModifiers {
  personalityBonus: number;
  noise: number;
}

export class EffectRegistry {
  private effects: Record<string, Record<string, number>>;
  private fallback: Record<string, number>;

  constructor(
    categoryEffects: Record<string, Record<string, number>>,
    fallback: Record<string, number> = { morale: 0.08 },
  ) {
    this.effects = categoryEffects;
    this.fallback = fallback;
  }

  getBaseEffect(category: string): Record<string, number> {
    return this.effects[category] ?? { ...this.fallback };
  }

  applyOutcome(
    category: string,
    outcome: TurnOutcome,
    modifiers: OutcomeModifiers,
  ): Record<string, number> {
    const base = this.getBaseEffect(category);
    const multiplier = OUTCOME_MULTIPLIERS[outcome];
    const deltas: Record<string, number> = {};

    for (const [key, value] of Object.entries(base)) {
      const raw = value * (multiplier + modifiers.personalityBonus + modifiers.noise);
      deltas[key] = Math.round(raw * 100) / 100;
    }

    return deltas;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/effect-registry.test.ts`
Expected: 5 tests PASS

- [ ] **Step 6: Commit**

```bash
cd apps/mars-genesis-simulation && git add src/engine/effect-registry.ts src/engine/effect-registry.test.ts src/engine/mars/effects.ts && git commit -m "feat: add EffectRegistry and extract Mars category effects"
```

---

## Task 3: Wire EffectRegistry into Orchestrator

**Files:**
- Modify: `src/agents/orchestrator.ts:696-734`

- [ ] **Step 1: Import EffectRegistry and Mars effects at the top of orchestrator.ts**

Add these imports after the existing imports at the top of `src/agents/orchestrator.ts`:

```typescript
import { EffectRegistry } from '../engine/effect-registry.js';
import { MARS_CATEGORY_EFFECTS, MARS_FALLBACK_EFFECT, MARS_POLITICS_CATEGORIES, MARS_POLITICS_SUCCESS_DELTA, MARS_POLITICS_FAILURE_DELTA } from '../engine/mars/effects.js';
```

- [ ] **Step 2: Create the EffectRegistry instance in runSimulation**

Inside `runSimulation()`, after the `const director = new CrisisDirector();` line (around line 461), add:

```typescript
  const effectRegistry = new EffectRegistry(MARS_CATEGORY_EFFECTS, MARS_FALLBACK_EFFECT);
```

- [ ] **Step 3: Replace the hardcoded categoryEffects block**

Replace the block at lines 696-734 (starting with `const outcomeEffectRng` through the politics delta application) with:

```typescript
    // Apply outcome-driven colony effects via EffectRegistry
    const outcomeEffectRng = new SeededRng(seed).turnSeed(turn + 2000);
    const personalityBonus = (leader.hexaco.openness - 0.5) * 0.08 + (leader.hexaco.conscientiousness - 0.5) * 0.04;
    const colonyDeltas = effectRegistry.applyOutcome(crisis.category, outcome, {
      personalityBonus,
      noise: outcomeEffectRng.next() * 0.2 - 0.1,
    });
    kernel.applyColonyDeltas(colonyDeltas as any, [{
      turn, year, type: 'system',
      description: `Outcome effect (${outcome}): ${Object.entries(colonyDeltas).map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v}`).join(', ')}`,
    }]);

    // Apply politics deltas for political/governance crises
    if (MARS_POLITICS_CATEGORIES.has(crisis.category)) {
      const polDelta = outcome.includes('success')
        ? MARS_POLITICS_SUCCESS_DELTA
        : MARS_POLITICS_FAILURE_DELTA;
      kernel.applyPoliticsDeltas(polDelta);
    }
```

- [ ] **Step 4: Run existing tests to confirm no regression**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/**/*.test.ts src/*.test.ts`
Expected: All existing tests PASS

- [ ] **Step 5: Commit**

```bash
cd apps/mars-genesis-simulation && git add src/agents/orchestrator.ts && git commit -m "refactor: wire EffectRegistry into orchestrator, replacing hardcoded categoryEffects"
```

---

## Task 4: Metric Registry

**Files:**
- Create: `src/engine/metric-registry.ts`
- Create: `src/engine/mars/metrics.ts`
- Test: `src/engine/metric-registry.test.ts`

- [ ] **Step 1: Write the metric registry test**

```typescript
// src/engine/metric-registry.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { MetricRegistry } from './metric-registry.js';
import { MARS_WORLD_METRICS, MARS_CAPACITY_METRICS, MARS_STATUS_METRICS, MARS_POLITICS_METRICS } from './mars/metrics.js';

test('MetricRegistry returns all declared metrics', () => {
  const registry = new MetricRegistry([
    ...MARS_WORLD_METRICS,
    ...MARS_CAPACITY_METRICS,
    ...MARS_STATUS_METRICS,
    ...MARS_POLITICS_METRICS,
  ]);
  const all = registry.all();
  assert.ok(all.length > 0);
  const ids = all.map(m => m.id);
  assert.ok(ids.includes('population'));
  assert.ok(ids.includes('morale'));
  assert.ok(ids.includes('lifeSupportCapacity'));
  assert.ok(ids.includes('governanceStatus'));
  assert.ok(ids.includes('earthDependencyPct'));
});

test('MetricRegistry.get returns the metric definition by id', () => {
  const registry = new MetricRegistry(MARS_WORLD_METRICS);
  const morale = registry.get('morale');
  assert.ok(morale);
  assert.equal(morale!.label, 'Morale');
  assert.equal(morale!.unit, '%');
  assert.equal(morale!.initial, 0.85);
});

test('MetricRegistry.get returns undefined for unknown id', () => {
  const registry = new MetricRegistry(MARS_WORLD_METRICS);
  assert.equal(registry.get('nonexistent'), undefined);
});

test('MetricRegistry.getHeaderMetrics returns only metrics flagged for header', () => {
  const registry = new MetricRegistry(MARS_WORLD_METRICS);
  const header = registry.getHeaderMetrics();
  assert.ok(header.length > 0);
  for (const m of header) {
    assert.equal(m.showInHeader, true);
  }
});

test('Mars world metrics include all ColonySystems fields', () => {
  const ids = MARS_WORLD_METRICS.map(m => m.id);
  assert.ok(ids.includes('population'));
  assert.ok(ids.includes('powerKw'));
  assert.ok(ids.includes('foodMonthsReserve'));
  assert.ok(ids.includes('waterLitersPerDay'));
  assert.ok(ids.includes('morale'));
  assert.ok(ids.includes('infrastructureModules'));
  assert.ok(ids.includes('scienceOutput'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/metric-registry.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Write Mars metrics data**

```typescript
// src/engine/mars/metrics.ts

export interface ScenarioMetric {
  id: string;
  label: string;
  unit: string;
  type: 'number' | 'string' | 'boolean';
  initial: number | string | boolean;
  min?: number;
  max?: number;
  category: 'metric' | 'capacity' | 'status' | 'politic';
  showInHeader: boolean;
  format: 'number' | 'percent' | 'currency' | 'duration' | 'string';
}

/** Colony systems metrics (from ColonySystems in kernel/state.ts) */
export const MARS_WORLD_METRICS: ScenarioMetric[] = [
  { id: 'population', label: 'Population', unit: '', type: 'number', initial: 100, min: 0, category: 'metric', showInHeader: true, format: 'number' },
  { id: 'powerKw', label: 'Power', unit: 'kW', type: 'number', initial: 400, min: 0, category: 'metric', showInHeader: true, format: 'number' },
  { id: 'foodMonthsReserve', label: 'Food Reserve', unit: 'months', type: 'number', initial: 18, min: 0, category: 'metric', showInHeader: true, format: 'number' },
  { id: 'waterLitersPerDay', label: 'Water', unit: 'L/day', type: 'number', initial: 800, min: 0, category: 'metric', showInHeader: true, format: 'number' },
  { id: 'pressurizedVolumeM3', label: 'Volume', unit: 'm³', type: 'number', initial: 3000, min: 0, category: 'metric', showInHeader: false, format: 'number' },
  { id: 'infrastructureModules', label: 'Modules', unit: '', type: 'number', initial: 3, min: 0, category: 'metric', showInHeader: true, format: 'number' },
  { id: 'scienceOutput', label: 'Science', unit: '', type: 'number', initial: 0, min: 0, category: 'metric', showInHeader: true, format: 'number' },
  { id: 'morale', label: 'Morale', unit: '%', type: 'number', initial: 0.85, min: 0, max: 1, category: 'metric', showInHeader: true, format: 'percent' },
];

/** Capacity metrics (from ColonySystems) */
export const MARS_CAPACITY_METRICS: ScenarioMetric[] = [
  { id: 'lifeSupportCapacity', label: 'Life Support Cap', unit: '', type: 'number', initial: 120, min: 0, category: 'capacity', showInHeader: false, format: 'number' },
];

/** Status metrics (from ColonyPolitics) */
export const MARS_STATUS_METRICS: ScenarioMetric[] = [
  { id: 'governanceStatus', label: 'Governance', unit: '', type: 'string', initial: 'earth-governed', category: 'status', showInHeader: false, format: 'string' },
];

/** Politics metrics (from ColonyPolitics) */
export const MARS_POLITICS_METRICS: ScenarioMetric[] = [
  { id: 'earthDependencyPct', label: 'Earth Dependency', unit: '%', type: 'number', initial: 95, min: 0, max: 100, category: 'politic', showInHeader: false, format: 'percent' },
  { id: 'independencePressure', label: 'Independence Pressure', unit: '%', type: 'number', initial: 0.05, min: 0, max: 1, category: 'politic', showInHeader: false, format: 'percent' },
];
```

- [ ] **Step 4: Write the MetricRegistry**

```typescript
// src/engine/metric-registry.ts
import type { ScenarioMetric } from './mars/metrics.js';

export { type ScenarioMetric } from './mars/metrics.js';

export class MetricRegistry {
  private metrics: Map<string, ScenarioMetric>;

  constructor(definitions: ScenarioMetric[]) {
    this.metrics = new Map(definitions.map(d => [d.id, d]));
  }

  get(id: string): ScenarioMetric | undefined {
    return this.metrics.get(id);
  }

  all(): ScenarioMetric[] {
    return Array.from(this.metrics.values());
  }

  getHeaderMetrics(): ScenarioMetric[] {
    return this.all().filter(m => m.showInHeader);
  }

  getByCategory(category: ScenarioMetric['category']): ScenarioMetric[] {
    return this.all().filter(m => m.category === category);
  }

  getInitialValues(): Record<string, number | string | boolean> {
    const values: Record<string, number | string | boolean> = {};
    for (const m of this.metrics.values()) {
      values[m.id] = m.initial;
    }
    return values;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/metric-registry.test.ts`
Expected: 6 tests PASS

- [ ] **Step 6: Commit**

```bash
cd apps/mars-genesis-simulation && git add src/engine/metric-registry.ts src/engine/metric-registry.test.ts src/engine/mars/metrics.ts && git commit -m "feat: add MetricRegistry and extract Mars metric definitions"
```

---

## Task 5: Event Taxonomy

**Files:**
- Create: `src/engine/event-taxonomy.ts`
- Create: `src/engine/mars/events.ts`
- Test: `src/engine/event-taxonomy.test.ts`

- [ ] **Step 1: Write the event taxonomy test**

```typescript
// src/engine/event-taxonomy.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventTaxonomy } from './event-taxonomy.js';
import { MARS_EVENT_DEFINITIONS } from './mars/events.js';

test('EventTaxonomy returns render metadata for a known event type', () => {
  const taxonomy = new EventTaxonomy(MARS_EVENT_DEFINITIONS);
  const crisis = taxonomy.get('crisis');
  assert.ok(crisis);
  assert.equal(crisis!.label, 'Crisis');
  assert.ok(crisis!.icon);
  assert.ok(crisis!.color);
});

test('EventTaxonomy returns undefined for unknown event type', () => {
  const taxonomy = new EventTaxonomy(MARS_EVENT_DEFINITIONS);
  assert.equal(taxonomy.get('nonexistent'), undefined);
});

test('EventTaxonomy.all returns all defined event types', () => {
  const taxonomy = new EventTaxonomy(MARS_EVENT_DEFINITIONS);
  const all = taxonomy.all();
  const ids = all.map(e => e.id);
  assert.ok(ids.includes('crisis'));
  assert.ok(ids.includes('decision'));
  assert.ok(ids.includes('birth'));
  assert.ok(ids.includes('death'));
  assert.ok(ids.includes('promotion'));
  assert.ok(ids.includes('tool_forge'));
  assert.ok(ids.includes('system'));
  assert.ok(ids.includes('relationship'));
});

test('Mars event definitions match the TurnEvent type values in kernel/state.ts', () => {
  const ids = MARS_EVENT_DEFINITIONS.map(e => e.id);
  // These are the values from TurnEvent['type'] in kernel/state.ts
  for (const expected of ['crisis', 'decision', 'birth', 'death', 'promotion', 'relationship', 'tool_forge', 'system']) {
    assert.ok(ids.includes(expected), `Missing event type: ${expected}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/event-taxonomy.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Write Mars event definitions**

```typescript
// src/engine/mars/events.ts

export interface ScenarioEventDef {
  id: string;
  label: string;
  icon: string;
  color: string;
}

/** Mars event type definitions matching TurnEvent['type'] from kernel/state.ts */
export const MARS_EVENT_DEFINITIONS: ScenarioEventDef[] = [
  { id: 'crisis', label: 'Crisis', icon: '⚠️', color: '#ef4444' },
  { id: 'decision', label: 'Decision', icon: '⚡', color: '#f59e0b' },
  { id: 'birth', label: 'Birth', icon: '👶', color: '#22c55e' },
  { id: 'death', label: 'Death', icon: '💀', color: '#6b7280' },
  { id: 'promotion', label: 'Promotion', icon: '⬆️', color: '#3b82f6' },
  { id: 'relationship', label: 'Relationship', icon: '💕', color: '#ec4899' },
  { id: 'tool_forge', label: 'Tool Forged', icon: '🔧', color: '#8b5cf6' },
  { id: 'system', label: 'System', icon: '⚙️', color: '#64748b' },
];
```

- [ ] **Step 4: Write the EventTaxonomy**

```typescript
// src/engine/event-taxonomy.ts
import type { ScenarioEventDef } from './mars/events.js';

export { type ScenarioEventDef } from './mars/events.js';

export class EventTaxonomy {
  private events: Map<string, ScenarioEventDef>;

  constructor(definitions: ScenarioEventDef[]) {
    this.events = new Map(definitions.map(d => [d.id, d]));
  }

  get(id: string): ScenarioEventDef | undefined {
    return this.events.get(id);
  }

  all(): ScenarioEventDef[] {
    return Array.from(this.events.values());
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/event-taxonomy.test.ts`
Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
cd apps/mars-genesis-simulation && git add src/engine/event-taxonomy.ts src/engine/event-taxonomy.test.ts src/engine/mars/events.ts && git commit -m "feat: add EventTaxonomy and extract Mars event definitions"
```

---

## Task 6: Mars Progression Hooks

**Files:**
- Create: `src/engine/mars/progression-hooks.ts`
- Test: `src/engine/mars/progression-hooks.test.ts`

- [ ] **Step 1: Write the progression hook test**

```typescript
// src/engine/mars/progression-hooks.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { marsProgressionHook } from './progression-hooks.js';

function makeColonist(overrides: Partial<{
  alive: boolean; marsborn: boolean; boneDensityPct: number;
  cumulativeRadiationMsv: number; birthYear: number; earthContacts: number;
}> = {}) {
  return {
    core: { marsborn: overrides.marsborn ?? false, birthYear: overrides.birthYear ?? 2000 },
    health: {
      alive: overrides.alive ?? true,
      boneDensityPct: overrides.boneDensityPct ?? 100,
      cumulativeRadiationMsv: overrides.cumulativeRadiationMsv ?? 0,
    },
    social: { earthContacts: overrides.earthContacts ?? 5 },
    career: { yearsExperience: 0 },
  } as any;
}

test('marsProgressionHook accumulates radiation per yearDelta', () => {
  const c = makeColonist();
  marsProgressionHook({ colonists: [c], yearDelta: 1, year: 2036, turn: 1, rng: { chance: () => false } as any });
  // MARS_RADIATION_MSV_PER_YEAR = 0.67 * 365 = 244.55
  assert.ok(c.health.cumulativeRadiationMsv > 244 && c.health.cumulativeRadiationMsv < 245);
});

test('marsProgressionHook degrades bone density', () => {
  const c = makeColonist({ boneDensityPct: 100, birthYear: 2000 });
  marsProgressionHook({ colonists: [c], yearDelta: 1, year: 2036, turn: 1, rng: { chance: () => false } as any });
  assert.ok(c.health.boneDensityPct < 100);
  assert.ok(c.health.boneDensityPct >= 50); // floor
});

test('marsProgressionHook uses slower bone loss rate for Mars-born', () => {
  const earthBorn = makeColonist({ boneDensityPct: 100, birthYear: 2000, marsborn: false });
  const marsBorn = makeColonist({ boneDensityPct: 100, birthYear: 2020, marsborn: true });
  const rng = { chance: () => false } as any;
  marsProgressionHook({ colonists: [earthBorn], yearDelta: 1, year: 2036, turn: 1, rng });
  marsProgressionHook({ colonists: [marsBorn], yearDelta: 1, year: 2036, turn: 1, rng });
  // Mars-born has slower loss rate (0.003 vs 0.005)
  assert.ok(marsBorn.health.boneDensityPct > earthBorn.health.boneDensityPct);
});

test('marsProgressionHook skips dead colonists', () => {
  const c = makeColonist({ alive: false, cumulativeRadiationMsv: 100 });
  marsProgressionHook({ colonists: [c], yearDelta: 1, year: 2036, turn: 1, rng: { chance: () => false } as any });
  assert.equal(c.health.cumulativeRadiationMsv, 100); // unchanged
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/mars/progression-hooks.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the Mars progression hook**

```typescript
// src/engine/mars/progression-hooks.ts

import type { ProgressionHookContext } from '../types.js';

const MARS_RADIATION_MSV_PER_YEAR = 0.67 * 365; // ~244.55 mSv/year

/**
 * Mars-specific between-turn progression: radiation accumulation and bone density loss.
 * Extracted from kernel/progression.ts lines 140-149.
 * Called as a scenario hook during progressBetweenTurns.
 */
export function marsProgressionHook(ctx: ProgressionHookContext): void {
  const { colonists, yearDelta, year } = ctx;
  const startYear = 2035; // Mars colony founding year

  for (const c of colonists) {
    if (!c.health.alive) continue;

    // Radiation accumulation
    c.health.cumulativeRadiationMsv += MARS_RADIATION_MSV_PER_YEAR * yearDelta;

    // Bone density loss (stabilizes after ~20 years on Mars)
    const lossRate = c.core.marsborn ? 0.003 : 0.005;
    const yearsOnMars = year - (c.core.marsborn ? c.core.birthYear : startYear);
    const decayFactor = Math.max(0.5, 1 - lossRate * Math.min(yearsOnMars, 20));
    c.health.boneDensityPct = Math.max(50, c.health.boneDensityPct * decayFactor);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/mars/progression-hooks.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd apps/mars-genesis-simulation && git add src/engine/mars/progression-hooks.ts src/engine/mars/progression-hooks.test.ts && git commit -m "feat: extract Mars radiation and bone density progression into hook"
```

---

## Task 7: Mars Prompt Fragments

**Files:**
- Create: `src/engine/mars/prompts.ts`
- Test: `src/engine/mars/prompts.test.ts`

- [ ] **Step 1: Write the prompt fragment test**

```typescript
// src/engine/mars/prompts.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { marsDepartmentPromptLines, marsDirectorInstructions } from './prompts.js';

test('marsDepartmentPromptLines returns medical-specific lines for medical dept', () => {
  const state = {
    colonists: [
      { health: { alive: true, cumulativeRadiationMsv: 500, boneDensityPct: 85, psychScore: 0.7 }, core: { marsborn: true }, narrative: { featured: true }, social: { partnerId: null, childrenIds: [], earthContacts: 0 } },
      { health: { alive: true, cumulativeRadiationMsv: 200, boneDensityPct: 90, psychScore: 0.8 }, core: { marsborn: false, birthYear: 2000, name: 'Test' }, narrative: { featured: true }, social: { partnerId: null, childrenIds: [], earthContacts: 3 } },
    ],
    colony: { population: 100, morale: 0.85, foodMonthsReserve: 18, waterLitersPerDay: 800, powerKw: 400, infrastructureModules: 3, lifeSupportCapacity: 120, pressurizedVolumeM3: 3000 },
    politics: { earthDependencyPct: 95, governanceStatus: 'earth-governed', independencePressure: 0.05 },
    metadata: { currentYear: 2040 },
  };

  const lines = marsDepartmentPromptLines('medical', state as any);
  const joined = lines.join('\n');
  assert.ok(joined.includes('radiation'));
  assert.ok(joined.includes('bone'));
  assert.ok(joined.includes('Mars-born'));
});

test('marsDepartmentPromptLines returns infrastructure lines for engineering dept', () => {
  const state = {
    colonists: [],
    colony: { population: 100, morale: 0.85, foodMonthsReserve: 18, waterLitersPerDay: 800, powerKw: 400, infrastructureModules: 3, lifeSupportCapacity: 120, pressurizedVolumeM3: 3000 },
    politics: { earthDependencyPct: 95, governanceStatus: 'earth-governed', independencePressure: 0.05 },
    metadata: { currentYear: 2040 },
  };

  const lines = marsDepartmentPromptLines('engineering', state as any);
  const joined = lines.join('\n');
  assert.ok(joined.includes('Modules'));
  assert.ok(joined.includes('Power'));
  assert.ok(joined.includes('Life support'));
});

test('marsDepartmentPromptLines returns politics lines for governance dept', () => {
  const state = {
    colonists: [{ health: { alive: true }, core: { marsborn: true } }],
    colony: { population: 50, morale: 0.7, foodMonthsReserve: 12, waterLitersPerDay: 600, powerKw: 300, infrastructureModules: 2, lifeSupportCapacity: 80, pressurizedVolumeM3: 2000 },
    politics: { earthDependencyPct: 70, governanceStatus: 'commonwealth', independencePressure: 0.3 },
    metadata: { currentYear: 2050 },
  };

  const lines = marsDepartmentPromptLines('governance', state as any);
  const joined = lines.join('\n');
  assert.ok(joined.includes('Earth dep'));
  assert.ok(joined.includes('commonwealth'));
});

test('marsDirectorInstructions contains Mars-specific crisis categories', () => {
  const instructions = marsDirectorInstructions();
  assert.ok(instructions.includes('Mars colony'));
  assert.ok(instructions.includes('radiation'));
  assert.ok(instructions.includes('environmental'));
  assert.ok(instructions.includes('medical'));
  assert.ok(instructions.includes('governance'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/mars/prompts.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write Mars prompt fragment functions**

```typescript
// src/engine/mars/prompts.ts

import type { SimulationState, Department } from '../../kernel/state.js';

/**
 * Mars-specific department prompt context lines.
 * Extracted from departments.ts buildDepartmentContext switch statement (lines 131-155).
 */
export function marsDepartmentPromptLines(dept: string, state: SimulationState): string[] {
  const alive = state.colonists.filter(c => c.health.alive);
  const featured = alive.filter(c => c.narrative.featured);
  const lines: string[] = [];

  switch (dept) {
    case 'medical': {
      const avgRad = alive.length ? alive.reduce((s, c) => s + c.health.cumulativeRadiationMsv, 0) / alive.length : 0;
      const avgBone = alive.length ? alive.reduce((s, c) => s + c.health.boneDensityPct, 0) / alive.length : 0;
      lines.push('HEALTH:', `Avg radiation: ${avgRad.toFixed(0)} mSv | Avg bone: ${avgBone.toFixed(1)}% | Mars-born: ${alive.filter(c => c.core.marsborn).length}`, '');
      lines.push('FEATURED:', ...featured.slice(0, 6).map(c => `- ${c.core.name} (${state.metadata.currentYear - c.core.birthYear}y): bone ${c.health.boneDensityPct.toFixed(0)}% rad ${c.health.cumulativeRadiationMsv.toFixed(0)}mSv psych ${c.health.psychScore.toFixed(2)}`));
      break;
    }
    case 'engineering':
      lines.push('INFRASTRUCTURE:', `Modules: ${state.colony.infrastructureModules} | Power: ${state.colony.powerKw}kW | Life support: ${state.colony.lifeSupportCapacity}/${state.colony.population} | Volume: ${state.colony.pressurizedVolumeM3}m³ | Water: ${state.colony.waterLitersPerDay}L/day`);
      break;
    case 'agriculture':
      lines.push('FOOD:', `Reserves: ${state.colony.foodMonthsReserve.toFixed(1)}mo | Pop to feed: ${state.colony.population} | Farm modules: ${Math.floor(state.colony.infrastructureModules * 0.3)}`);
      break;
    case 'psychology': {
      const avgPsych = alive.length ? alive.reduce((s, c) => s + c.health.psychScore, 0) / alive.length : 0;
      const depressed = alive.filter(c => c.health.psychScore < 0.5).length;
      lines.push('PSYCH:', `Morale: ${Math.round(state.colony.morale * 100)}% | Avg psych: ${avgPsych.toFixed(2)} | Depressed: ${depressed}/${alive.length} | Mars-born: ${alive.filter(c => c.core.marsborn).length}`);
      lines.push('', 'SOCIAL:', ...featured.slice(0, 4).map(c => `- ${c.core.name}: psych ${c.health.psychScore.toFixed(2)} partner:${c.social.partnerId ? 'y' : 'n'} children:${c.social.childrenIds.length} earthContacts:${c.social.earthContacts}`));
      break;
    }
    case 'governance':
      lines.push('POLITICS:', `Earth dep: ${state.politics.earthDependencyPct}% | Status: ${state.politics.governanceStatus} | Independence pressure: ${(state.politics.independencePressure * 100).toFixed(0)}% | Mars-born: ${alive.filter(c => c.core.marsborn).length}/${alive.length}`);
      break;
  }

  return lines;
}

/**
 * Mars-specific Crisis Director system instructions.
 * Extracted from director.ts DIRECTOR_INSTRUCTIONS constant (lines 70-102).
 */
export function marsDirectorInstructions(): string {
  return `You are the Crisis Director for a Mars colony simulation. You observe colony state and generate crises that test the colony's weaknesses, exploit consequences of prior decisions, and create interesting narrative tension.

RULES:
1. Each crisis has exactly 2-3 options with stable IDs (option_a, option_b, option_c)
2. Exactly one option must be marked isRisky: true (higher upside, higher downside)
3. Crises must reference real Mars science (radiation, gravity, atmosphere, psychology, politics)
4. Never repeat a crisis category from the immediately previous turn
5. Escalate: later crises should reference consequences of earlier decisions
6. Calibrate difficulty to colony state: struggling colonies get survivable crises, thriving colonies get existential ones
7. Include the colony's actual numbers in the crisis description (population, morale, food, etc.)
8. Specify which departments should analyze (2-4 departments per crisis)

CRISIS CATEGORIES:
- environmental: radiation, dust storms, seismic activity, atmospheric events
- resource: water, food, power, oxygen, materials shortage
- medical: disease, injury, bone density, radiation sickness, pandemic
- psychological: morale, isolation, generational tension, grief, burnout
- political: Earth relations, independence, governance disputes, factions
- infrastructure: habitat damage, life support failure, construction
- social: births, education, cultural identity, intergenerational conflict
- technological: equipment failure, communication, AI systems

AVAILABLE DEPARTMENTS (use ONLY these exact names in relevantDepartments):
- medical
- engineering
- agriculture
- psychology
- governance

Do NOT use any other department names. Pick 2-4 from this list.

Return ONLY valid JSON:
{"title":"Crisis Title","crisis":"Full description with specific colony numbers...","options":[{"id":"option_a","label":"Option Label","description":"What this option does","isRisky":false},{"id":"option_b","label":"Risky Option","description":"Higher upside, higher risk","isRisky":true}],"riskyOptionId":"option_b","riskSuccessProbability":0.55,"category":"environmental","researchKeywords":["mars dust storm","habitat pressure"],"relevantDepartments":["engineering","medical"],"turnSummary":"One sentence: why this crisis emerged from prior events"}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/mars/prompts.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd apps/mars-genesis-simulation && git add src/engine/mars/prompts.ts src/engine/mars/prompts.test.ts && git commit -m "feat: extract Mars prompt fragments into hook-shaped functions"
```

---

## Task 8: Mars Research Bundle

**Files:**
- Create: `src/engine/mars/research-bundle.ts`
- Test: `src/engine/mars/research-bundle.test.ts`

- [ ] **Step 1: Write the research bundle test**

```typescript
// src/engine/mars/research-bundle.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { MARS_KNOWLEDGE_BUNDLE } from './research-bundle.js';

test('Mars knowledge bundle contains all expected topics', () => {
  const topics = Object.keys(MARS_KNOWLEDGE_BUNDLE.topics);
  assert.ok(topics.includes('radiation'));
  assert.ok(topics.includes('water'));
  assert.ok(topics.includes('perchlorate'));
  assert.ok(topics.includes('psychology'));
  assert.ok(topics.includes('governance'));
  assert.ok(topics.includes('terraforming'));
  assert.ok(topics.includes('infrastructure'));
});

test('Mars knowledge bundle has category mapping for all 8 crisis categories', () => {
  const categories = Object.keys(MARS_KNOWLEDGE_BUNDLE.categoryMapping);
  for (const cat of ['environmental', 'resource', 'medical', 'psychological', 'political', 'infrastructure', 'social', 'technological']) {
    assert.ok(categories.includes(cat), `Missing category mapping: ${cat}`);
  }
});

test('Each topic has at least one canonical fact with a URL', () => {
  for (const [topicId, topic] of Object.entries(MARS_KNOWLEDGE_BUNDLE.topics)) {
    assert.ok(topic.canonicalFacts.length > 0, `Topic ${topicId} has no facts`);
    for (const fact of topic.canonicalFacts) {
      assert.ok(fact.claim.length > 10, `Fact in ${topicId} has no claim`);
      assert.ok(fact.url.startsWith('http'), `Fact in ${topicId} has no URL`);
    }
  }
});

test('Category mapping points to existing topics', () => {
  const topicIds = new Set(Object.keys(MARS_KNOWLEDGE_BUNDLE.topics));
  for (const [cat, refs] of Object.entries(MARS_KNOWLEDGE_BUNDLE.categoryMapping)) {
    for (const ref of refs) {
      assert.ok(topicIds.has(ref), `Category ${cat} references non-existent topic: ${ref}`);
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/mars/research-bundle.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the Mars research bundle**

```typescript
// src/engine/mars/research-bundle.ts

import type { KnowledgeBundle } from '../types.js';

/**
 * Mars knowledge bundle. Extracted from research/knowledge-base.ts.
 * All DOI-linked citations organized by topic with category mapping.
 */
export const MARS_KNOWLEDGE_BUNDLE: KnowledgeBundle = {
  topics: {
    radiation: {
      canonicalFacts: [
        { claim: 'Mars surface radiation averages 0.67 mSv/day, approximately 20x Earth background', source: 'Hassler et al. 2014, Science', url: 'https://doi.org/10.1126/science.1244797', doi: '10.1126/science.1244797' },
        { claim: 'NASA radiation risk model establishes dose-response for astronaut cancer risk', source: 'Cucinotta et al. 2010', url: 'https://doi.org/10.1667/RR2397.1', doi: '10.1667/RR2397.1' },
        { claim: 'September 2017 solar event measured by Curiosity RAD showed significant dose spike', source: 'Guo et al. 2018, GRL', url: 'https://doi.org/10.1029/2018GL077731', doi: '10.1029/2018GL077731' },
      ],
      counterpoints: [],
      departmentNotes: {
        medical: 'Acute radiation syndrome threshold: 100 mSv causes blood count changes. 1000+ mSv is life-threatening.',
        engineering: 'Reinforced core habitat rated for CME. Expansion modules have minimal shielding.',
      },
    },
    water: {
      canonicalFacts: [
        { claim: 'Mars subsurface ice confirmed at multiple latitudes by MARSIS and SHARAD radar', source: 'Plaut et al. 2007', url: 'https://doi.org/10.1126/science.1139672', doi: '10.1126/science.1139672' },
        { claim: 'MOXIE on Perseverance demonstrated in-situ oxygen extraction from Mars atmosphere', source: 'NASA Mars 2020', url: 'https://mars.nasa.gov/mars2020/spacecraft/instruments/moxie/' },
        { claim: 'Mars atmosphere contains 0.03% water vapor, seasonally variable', source: 'Smith 2004, Icarus', url: 'https://doi.org/10.1016/j.icarus.2003.09.027', doi: '10.1016/j.icarus.2003.09.027' },
      ],
      counterpoints: [
        { claim: 'Deep drilling risks contaminating pristine subsurface aquifers with biological material', source: 'Planetary protection protocols', url: 'https://planetaryprotection.nasa.gov/' },
      ],
      departmentNotes: {
        engineering: 'Deep drilling requires significant power draw. WAVAR system proven on ISS heritage.',
        agriculture: 'Water shortfall directly impacts food production capacity.',
      },
    },
    food: {
      canonicalFacts: [
        { claim: 'Hydroponics can produce 2-5x crop yield per area compared to soil farming', source: 'NASA Advanced Life Support', url: 'https://www.nasa.gov/humans-in-space/eclss/' },
      ],
      counterpoints: [],
      departmentNotes: {
        agriculture: 'Hydroponics eliminates soil contact entirely but requires 30% more power.',
      },
    },
    perchlorate: {
      canonicalFacts: [
        { claim: 'Phoenix lander detected 0.5-1% calcium perchlorate in Mars soil globally', source: 'Hecht et al. 2009, Science', url: 'https://doi.org/10.1126/science.1172339', doi: '10.1126/science.1172339' },
        { claim: 'Perchlorate is a thyroid toxin at chronic exposure above 0.7 ug/kg/day', source: 'EPA reference dose', url: 'https://www.epa.gov/sdwa/perchlorate-drinking-water' },
        { claim: 'Perchlorate-reducing bacteria (Dechloromonas) can bioremediate contaminated soil', source: 'Davila et al. 2013', url: 'https://doi.org/10.1089/ast.2013.0995', doi: '10.1089/ast.2013.0995' },
      ],
      counterpoints: [
        { claim: 'Bioremediation has not been tested in Mars atmospheric conditions', source: 'Cockell 2014', url: 'https://doi.org/10.1089/ast.2013.1129' },
      ],
      departmentNotes: {
        medical: 'Perchlorate exposure pathway: ingestion via contaminated crops. Thyroid disruption risk.',
        agriculture: 'Hydroponics eliminates soil contact. Bioremediation requires 2-year R&D.',
      },
    },
    'life-support': {
      canonicalFacts: [
        { claim: 'NASA ECLSS regenerative life support on ISS supports 6-7 crew on ~11,000 kg system', source: 'NASA ECLSS', url: 'https://www.nasa.gov/humans-in-space/eclss/' },
        { claim: 'Mars habitat sizing for 100+ crew requires modular expandable architecture', source: 'Do et al. 2016, AIAA', url: 'https://doi.org/10.2514/6.2016-5526', doi: '10.2514/6.2016-5526' },
      ],
      counterpoints: [
        { claim: 'Rapid population increase strains life support beyond designed capacity', source: 'Engineering analysis', url: 'https://www.nasa.gov/humans-in-space/eclss/' },
      ],
      departmentNotes: {
        engineering: 'Life support expansion requires 18 months construction.',
      },
    },
    'bone-density': {
      canonicalFacts: [
        { claim: 'ISS bone density studies show significant loss in microgravity', source: 'Sibonga et al. 2019, npj Microgravity', url: 'https://doi.org/10.1038/s41526-019-0075-2', doi: '10.1038/s41526-019-0075-2' },
        { claim: 'Mars gravity is 3.72 m/s2 (38% of Earth)', source: 'NASA Mars Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html' },
        { claim: 'Cardiovascular adaptation in spaceflight includes cardiac chamber enlargement', source: 'Hughson et al. 2018, CMAJ', url: 'https://doi.org/10.1503/cmaj.180343', doi: '10.1503/cmaj.180343' },
      ],
      counterpoints: [],
      departmentNotes: {
        medical: 'Mars-born children show 12% lower bone mineral density. May never tolerate Earth gravity.',
      },
    },
    psychology: {
      canonicalFacts: [
        { claim: 'Mars-500 study observed depression, altered sleep cycles, and social withdrawal in 520-day isolation', source: 'Basner et al. 2014, PNAS', url: 'https://doi.org/10.1073/pnas.1212646110', doi: '10.1073/pnas.1212646110' },
        { claim: 'Antarctic overwinter studies document psychological effects of long-term isolation', source: 'Palinkas & Suedfeld 2008', url: 'https://doi.org/10.1146/annurev.psych.58.110405.085726', doi: '10.1146/annurev.psych.58.110405.085726' },
      ],
      counterpoints: [],
      departmentNotes: {
        psychology: 'Clinical depression rates in isolated populations range from 20-40%.',
      },
    },
    isolation: {
      canonicalFacts: [
        { claim: 'Solar conjunction blocks Earth-Mars communication for approximately 14 days', source: 'NASA Solar Conjunction', url: 'https://mars.nasa.gov/all-about-mars/night-sky/solar-conjunction/' },
        { claim: 'Mars-Earth light delay ranges from 4 to 24 minutes one-way', source: 'NASA', url: 'https://mars.nasa.gov/all-about-mars/night-sky/solar-conjunction/' },
      ],
      counterpoints: [],
      departmentNotes: {
        engineering: 'Colony must handle emergencies autonomously during blackout periods.',
      },
    },
    governance: {
      canonicalFacts: [
        { claim: 'Communication delay makes real-time governance of off-world colonies impractical', source: 'Zubrin 1996, The Case for Mars', url: 'https://en.wikipedia.org/wiki/The_Case_for_Mars' },
      ],
      counterpoints: [],
      departmentNotes: {
        governance: 'No legal framework for extraterrestrial sovereignty exists in current international law.',
      },
    },
    terraforming: {
      canonicalFacts: [
        { claim: 'Jakosky & Edwards (2018) concluded Mars lacks sufficient CO2 for significant atmospheric thickening', source: 'Jakosky & Edwards 2018, Nature Astronomy', url: 'https://doi.org/10.1038/s41550-018-0529-6', doi: '10.1038/s41550-018-0529-6' },
        { claim: 'Zubrin & McKay (1993) argued terraforming is feasible with sufficient energy input', source: 'Zubrin & McKay 1993', url: 'https://doi.org/10.1089/153110703769016389', doi: '10.1089/153110703769016389' },
      ],
      counterpoints: [
        { claim: 'Mars atmospheric pressure is 0.6 kPa vs Earth 101.3 kPa. Gap is enormous.', source: 'NASA Mars Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html' },
      ],
      departmentNotes: {},
    },
    infrastructure: {
      canonicalFacts: [
        { claim: 'Arcadia Planitia contains extensive subsurface ice deposits detected by MARSIS radar', source: 'Mars Express MARSIS', url: 'https://www.esa.int/Science_Exploration/Space_Science/Mars_Express' },
        { claim: 'CRISM spectrometer detected diverse hydrated minerals in Valles Marineris walls', source: 'Murchie et al. 2009, JGR', url: 'https://doi.org/10.1029/2009JE003342', doi: '10.1029/2009JE003342' },
      ],
      counterpoints: [
        { claim: 'Valles Marineris terrain slopes up to 30 degrees increase construction difficulty', source: 'HiRISE terrain analysis', url: 'https://www.uahirise.org/' },
      ],
      departmentNotes: {
        engineering: 'Flat terrain dramatically simplifies construction. Slopes require terracing.',
      },
    },
    communication: {
      canonicalFacts: [
        { claim: 'Solar conjunction blocks Earth-Mars communication for approximately 14 days', source: 'NASA Solar Conjunction', url: 'https://mars.nasa.gov/all-about-mars/night-sky/solar-conjunction/' },
      ],
      counterpoints: [],
      departmentNotes: {},
    },
    population: {
      canonicalFacts: [
        { claim: 'Hohmann transfer window Earth-Mars occurs every 26 months with 6-9 month transit', source: 'NASA Mars missions', url: 'https://science.nasa.gov/planetary-science/programs/mars-exploration/' },
      ],
      counterpoints: [],
      departmentNotes: {
        psychology: 'Rapid population influx creates social integration challenges.',
      },
    },
    'solar-events': {
      canonicalFacts: [
        { claim: 'Mars lost its global magnetic field approximately 4 billion years ago', source: 'Acuna et al. 1999, Science', url: 'https://doi.org/10.1126/science.284.5415.790', doi: '10.1126/science.284.5415.790' },
        { claim: 'September 2017 solar event measured by Curiosity RAD showed significant dose spike', source: 'Guo et al. 2018, GRL', url: 'https://doi.org/10.1029/2018GL077731', doi: '10.1029/2018GL077731' },
      ],
      counterpoints: [],
      departmentNotes: {
        medical: 'Acute exposure of 100-500 mSv over 6 hours during CME events.',
        engineering: 'Core habitat shielded (50+ g/cm2). Expansion modules minimal (5-10 g/cm2).',
      },
    },
    generational: {
      canonicalFacts: [
        { claim: 'Complex adaptive systems exhibit path dependence where early decisions compound', source: 'Arthur 1994', url: 'https://en.wikipedia.org/wiki/Increasing_returns' },
      ],
      counterpoints: [],
      departmentNotes: {},
    },
    independence: {
      canonicalFacts: [
        { claim: 'Communication delay makes real-time governance of off-world colonies impractical', source: 'Zubrin 1996', url: 'https://en.wikipedia.org/wiki/The_Case_for_Mars' },
      ],
      counterpoints: [],
      departmentNotes: {
        governance: 'Self-sufficiency in food and water is a prerequisite for political independence.',
      },
    },
    medical: {
      canonicalFacts: [
        { claim: 'Mars surface radiation averages 0.67 mSv/day', source: 'Hassler et al. 2014', url: 'https://doi.org/10.1126/science.1244797', doi: '10.1126/science.1244797' },
      ],
      counterpoints: [],
      departmentNotes: {
        medical: 'Radiation exposure identical at both candidate sites. Long-term cumulative dose is the primary concern.',
      },
    },
  },
  categoryMapping: {
    environmental: ['radiation', 'solar-events', 'infrastructure'],
    resource: ['water', 'food', 'perchlorate', 'life-support'],
    medical: ['medical', 'radiation', 'bone-density'],
    psychological: ['psychology', 'isolation', 'generational'],
    political: ['governance', 'independence', 'communication'],
    infrastructure: ['infrastructure', 'life-support'],
    social: ['psychology', 'generational', 'population'],
    technological: ['communication', 'infrastructure'],
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/mars/research-bundle.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd apps/mars-genesis-simulation && git add src/engine/mars/research-bundle.ts src/engine/mars/research-bundle.test.ts && git commit -m "feat: extract Mars research knowledge bundle into loadable format"
```

---

## Task 9: Mars Crisis Milestones

**Files:**
- Create: `src/engine/mars/milestones.ts`
- Test: `src/engine/mars/milestones.test.ts`

- [ ] **Step 1: Write the milestones test**

```typescript
// src/engine/mars/milestones.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { getMarsMilestoneCrisis, MARS_MILESTONES } from './milestones.js';

test('MARS_MILESTONES contains turn 1 (Landfall) and turn 12 (Legacy)', () => {
  assert.ok(MARS_MILESTONES.has(1));
  assert.ok(MARS_MILESTONES.has(12));
});

test('Landfall milestone has correct structure', () => {
  const landfall = MARS_MILESTONES.get(1);
  assert.ok(landfall);
  assert.equal(landfall!.title, 'Landfall');
  assert.ok(landfall!.crisis.includes('Mars orbit'));
  assert.ok(landfall!.options.length >= 2);
  assert.ok(landfall!.researchKeywords.length > 0);
});

test('getMarsMilestoneCrisis returns turn 1 crisis', () => {
  const crisis = getMarsMilestoneCrisis(1, 12);
  assert.ok(crisis);
  assert.equal(crisis!.title, 'Landfall');
  assert.equal(crisis!.category, 'infrastructure');
});

test('getMarsMilestoneCrisis returns final turn crisis', () => {
  const crisis = getMarsMilestoneCrisis(12, 12);
  assert.ok(crisis);
  assert.equal(crisis!.title, 'Legacy Assessment');
  assert.equal(crisis!.category, 'political');
});

test('getMarsMilestoneCrisis returns null for non-milestone turns', () => {
  assert.equal(getMarsMilestoneCrisis(5, 12), null);
  assert.equal(getMarsMilestoneCrisis(8, 12), null);
});

test('getMarsMilestoneCrisis adapts final turn to maxTurns', () => {
  const crisis = getMarsMilestoneCrisis(6, 6);
  assert.ok(crisis);
  assert.equal(crisis!.title, 'Legacy Assessment');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/mars/milestones.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the Mars milestones module**

```typescript
// src/engine/mars/milestones.ts

/**
 * Mars crisis milestones: fixed narrative anchors for turn 1 and the final turn.
 * Extracted from agents/director.ts getMilestoneCrisis and research/scenarios.ts.
 */

import type { CrisisOption } from '../../agents/contracts.js';

export interface MilestoneCrisis {
  title: string;
  crisis: string;
  options: CrisisOption[];
  riskyOptionId: string;
  riskSuccessProbability: number;
  category: string;
  researchKeywords: string[];
  relevantDepartments: string[];
  turnSummary: string;
}

const LANDFALL: MilestoneCrisis = {
  title: 'Landfall',
  crisis: `Your colony ship has entered Mars orbit. You must choose a landing site for the first permanent settlement. Two candidates:

OPTION A: Arcadia Planitia — flat basalt plains at 47°N. Stable terrain, minimal landslide risk, access to subsurface ice deposits detected by Mars Express MARSIS radar. Geologically unremarkable.

OPTION B: Valles Marineris rim — edge of the 4,000 km canyon system at 14°S. Exposed geological strata spanning 3.5 billion years. Rich mineral diversity detected by CRISM. Significant terrain hazards: slopes up to 30°, rockfall risk, and 2km elevation changes within the operational zone.

Both sites receive similar solar irradiance. Surface radiation at either site: approximately 0.67 mSv/day per Curiosity RAD measurements.

Research the real science of Mars landing site selection and make your decision.`,
  options: [
    { id: 'option_a', label: 'Arcadia Planitia', description: 'Flat basalt plains, safe, ice access', isRisky: false },
    { id: 'option_b', label: 'Valles Marineris rim', description: 'Canyon rim, mineral rich, hazardous terrain', isRisky: true },
  ],
  riskyOptionId: 'option_b',
  riskSuccessProbability: 0.65,
  category: 'infrastructure',
  researchKeywords: ['Mars landing site selection', 'Arcadia Planitia geology', 'Valles Marineris mineralogy', 'Mars surface radiation Curiosity RAD'],
  relevantDepartments: ['medical', 'engineering'],
  turnSummary: 'Colony ship in orbit. Safe plains or mineral-rich canyon rim: the first decision shapes everything.',
};

const LEGACY_ASSESSMENT: MilestoneCrisis = {
  title: 'Legacy Assessment',
  crisis: `Earth requests a comprehensive status report on your colony:

1. POPULATION: Current count, birth rate, death rate, immigration status
2. INFRASTRUCTURE: Number of modules, total pressurized volume, power generation
3. SELF-SUFFICIENCY: Percentage of needs met without Earth supply ships
4. SCIENCE: Major discoveries, papers published, unique knowledge created
5. CULTURE: What kind of society did you build? What values define your colony?
6. REGRETS: What would you do differently if you could start over?
7. TOOLS BUILT: Review every tool you forged during this simulation. Which were most valuable?
8. LEGACY: What will your colony look like in another 50 years?

Be honest. Your personality shapes your assessment.`,
  options: [
    { id: 'option_a', label: 'Honest assessment', description: 'Report factually, including failures and regrets', isRisky: false },
    { id: 'option_b', label: 'Ambitious projection', description: 'Emphasize achievements, propose bold next-century vision', isRisky: true },
  ],
  riskyOptionId: 'option_b',
  riskSuccessProbability: 0.5,
  category: 'political',
  researchKeywords: ['Mars colony long-term projections'],
  relevantDepartments: ['governance', 'psychology', 'medical', 'engineering'],
  turnSummary: 'Earth demands a full status report. The commander must decide: honest accounting of failures, or bold vision for the next century.',
};

/** Map of turn number -> milestone crisis */
export const MARS_MILESTONES = new Map<number, MilestoneCrisis>([
  [1, LANDFALL],
  [12, LEGACY_ASSESSMENT],
]);

/**
 * Get a milestone crisis for a given turn.
 * Turn 1 is always Landfall. The final turn (maxTurns) is always Legacy Assessment.
 * Returns null for non-milestone turns.
 */
export function getMarsMilestoneCrisis(turn: number, maxTurns: number): MilestoneCrisis | null {
  if (turn === 1) return LANDFALL;
  if (turn === maxTurns) return LEGACY_ASSESSMENT;
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/mars/milestones.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd apps/mars-genesis-simulation && git add src/engine/mars/milestones.ts src/engine/mars/milestones.test.ts && git commit -m "feat: extract Mars crisis milestones into loadable format"
```

---

## Task 10: Mars Name Lists and Presets

**Files:**
- Create: `src/engine/mars/names.ts`
- Create: `src/engine/mars/presets.ts`
- Test: `src/engine/mars/names.test.ts`

- [ ] **Step 1: Write the names and presets test**

```typescript
// src/engine/mars/names.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { MARS_FIRST_NAMES, MARS_LAST_NAMES, MARS_CHILD_NAMES, MARS_DEPARTMENT_DISTRIBUTION, MARS_SPECIALIZATIONS } from './names.js';
import { MARS_DEFAULT_KEY_PERSONNEL, MARS_DEFAULT_LEADERS } from './presets.js';

test('Mars name lists have sufficient entries for population generation', () => {
  assert.ok(MARS_FIRST_NAMES.length >= 50);
  assert.ok(MARS_LAST_NAMES.length >= 50);
  assert.ok(MARS_CHILD_NAMES.length >= 10);
});

test('Mars department distribution covers all departments', () => {
  const depts = new Set(MARS_DEPARTMENT_DISTRIBUTION);
  assert.ok(depts.has('engineering'));
  assert.ok(depts.has('medical'));
  assert.ok(depts.has('agriculture'));
  assert.ok(depts.has('science'));
});

test('Mars specializations covers all departments in distribution', () => {
  const depts = new Set(MARS_DEPARTMENT_DISTRIBUTION);
  for (const dept of depts) {
    assert.ok(MARS_SPECIALIZATIONS[dept], `Missing specializations for ${dept}`);
    assert.ok(MARS_SPECIALIZATIONS[dept].length > 0, `Empty specializations for ${dept}`);
  }
});

test('Mars default key personnel has 5 entries', () => {
  assert.equal(MARS_DEFAULT_KEY_PERSONNEL.length, 5);
  for (const kp of MARS_DEFAULT_KEY_PERSONNEL) {
    assert.ok(kp.name);
    assert.ok(kp.department);
    assert.ok(kp.role);
  }
});

test('Mars default leaders has 2 entries (Aria Chen and Dietrich Voss)', () => {
  assert.equal(MARS_DEFAULT_LEADERS.length, 2);
  assert.equal(MARS_DEFAULT_LEADERS[0].name, 'Aria Chen');
  assert.equal(MARS_DEFAULT_LEADERS[1].name, 'Dietrich Voss');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/mars/names.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Write Mars name lists**

```typescript
// src/engine/mars/names.ts

/**
 * Mars colonist name lists and department distribution.
 * Extracted from kernel/colonist-generator.ts.
 */

export const MARS_FIRST_NAMES = [
  'Aria', 'Dietrich', 'Yuki', 'Marcus', 'Elena', 'Kwame', 'Sofia', 'Jin',
  'Amara', 'Liam', 'Priya', 'Omar', 'Mei', 'Carlos', 'Ingrid', 'Tariq',
  'Nadia', 'Henrik', 'Aisha', 'Pavel', 'Luna', 'Ravi', 'Zara', 'Felix',
  'Anya', 'Diego', 'Kira', 'Hassan', 'Signe', 'Jamal', 'Mila', 'Chen',
  'Fatima', 'Anders', 'Keiko', 'David', 'Olga', 'Kofi', 'Leila', 'Sven',
  'Rosa', 'Idris', 'Hana', 'Bruno', 'Daria', 'Emeka', 'Yara', 'Tomas',
  'Nia', 'Viktor',
];

export const MARS_LAST_NAMES = [
  'Chen', 'Voss', 'Tanaka', 'Webb', 'Kowalski', 'Okafor', 'Petrov', 'Kim',
  'Santos', 'Johansson', 'Patel', 'Al-Rashid', 'Nakamura', 'Fernandez', 'Berg',
  'Ibrahim', 'Volkov', 'Singh', 'Torres', 'Andersen', 'Müller', 'Zhang',
  'Osei', 'Larsson', 'Ahmad', 'Costa', 'Ivanova', 'Park', 'Eriksson', 'Diallo',
  'Sato', 'Rivera', 'Lindqvist', 'Mensah', 'Kato', 'Morales', 'Holm', 'Yusuf',
  'Takahashi', 'Reyes', 'Nkomo', 'Li', 'Herrera', 'Bakker', 'Ito', 'Mendez',
  'Dahl', 'Owusu', 'Yamamoto', 'Cruz',
];

/** Names used for Mars-born children in progression.ts */
export const MARS_CHILD_NAMES = [
  'Nova', 'Kai', 'Sol', 'Tera', 'Eos', 'Zan', 'Lyra', 'Orion',
  'Vega', 'Juno', 'Atlas', 'Iris', 'Clio', 'Pax', 'Io', 'Thea',
];

export type Department = 'medical' | 'engineering' | 'agriculture' | 'science' | 'administration' | 'psychology' | 'governance';

export const MARS_DEPARTMENT_DISTRIBUTION: Department[] = [
  'engineering', 'engineering', 'engineering', 'engineering',
  'medical', 'medical', 'medical',
  'agriculture', 'agriculture', 'agriculture',
  'science', 'science', 'science',
  'administration', 'administration',
  'psychology',
];

export const MARS_SPECIALIZATIONS: Record<string, string[]> = {
  medical: ['General Medicine', 'Radiation Medicine', 'Surgery', 'Psychiatry', 'Emergency Medicine'],
  engineering: ['Structural', 'Life Support', 'Power Systems', 'Communications', 'Robotics'],
  agriculture: ['Hydroponics', 'Soil Science', 'Botany', 'Nutrition', 'Water Systems'],
  science: ['Geology', 'Atmospheric Science', 'Biology', 'Chemistry', 'Astrophysics'],
  administration: ['Operations', 'Logistics', 'HR', 'Communications', 'Planning'],
  psychology: ['Clinical Psychology', 'Social Psychology', 'Occupational Therapy'],
  governance: ['Policy', 'Law', 'Diplomacy'],
};
```

- [ ] **Step 4: Write Mars presets**

```typescript
// src/engine/mars/presets.ts

/**
 * Mars product presets: default leaders and key personnel.
 * Extracted from sim-config.ts DEFAULT_KEY_PERSONNEL and leaders.json.
 */

export interface MarsKeyPersonnel {
  name: string;
  department: string;
  role: string;
  specialization: string;
  age: number;
  featured: boolean;
}

export interface MarsLeaderPreset {
  name: string;
  archetype: string;
  colony: string;
  hexaco: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    emotionality: number;
    honestyHumility: number;
  };
  instructions: string;
}

export const MARS_DEFAULT_KEY_PERSONNEL: MarsKeyPersonnel[] = [
  { name: 'Dr. Yuki Tanaka', department: 'medical', role: 'Chief Medical Officer', specialization: 'Radiation Medicine', age: 38, featured: true },
  { name: 'Erik Lindqvist', department: 'engineering', role: 'Chief Engineer', specialization: 'Structural Engineering', age: 45, featured: true },
  { name: 'Amara Osei', department: 'agriculture', role: 'Head of Agriculture', specialization: 'Hydroponics', age: 34, featured: true },
  { name: 'Dr. Priya Singh', department: 'psychology', role: 'Colony Psychologist', specialization: 'Clinical Psychology', age: 41, featured: true },
  { name: 'Carlos Fernandez', department: 'science', role: 'Chief Scientist', specialization: 'Geology', age: 50, featured: true },
];

export const MARS_DEFAULT_LEADERS: MarsLeaderPreset[] = [
  {
    name: 'Aria Chen',
    archetype: 'The Visionary',
    colony: 'Colony Alpha',
    hexaco: { openness: 0.95, conscientiousness: 0.35, extraversion: 0.85, agreeableness: 0.55, emotionality: 0.30, honestyHumility: 0.65 },
    instructions: 'You are Aria Chen, "The Visionary." You lead by inspiration. You value openness to experience and bold experimentation. You tolerate mess if it leads to breakthroughs. You spin setbacks as learning opportunities. You rally people with charisma. Your HEXACO profile drives your leadership style.',
  },
  {
    name: 'Dietrich Voss',
    archetype: 'The Engineer',
    colony: 'Colony Beta',
    hexaco: { openness: 0.25, conscientiousness: 0.97, extraversion: 0.30, agreeableness: 0.60, emotionality: 0.70, honestyHumility: 0.90 },
    instructions: 'You are Dietrich Voss, "The Engineer." You lead by precision and evidence. You value conscientiousness and proven methods. You reject untested approaches. You share bad news immediately and honestly. You build systems, not visions. Your HEXACO profile drives your leadership style.',
  },
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/mars/names.test.ts`
Expected: 5 tests PASS

- [ ] **Step 6: Commit**

```bash
cd apps/mars-genesis-simulation && git add src/engine/mars/names.ts src/engine/mars/names.test.ts src/engine/mars/presets.ts && git commit -m "feat: extract Mars name lists, specializations, and leader presets"
```

---

## Task 11: Mars ScenarioPackage Assembly

**Files:**
- Create: `src/engine/mars/index.ts`
- Test: `src/engine/mars/index.test.ts`

- [ ] **Step 1: Write the Mars scenario package test**

```typescript
// src/engine/mars/index.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { marsScenario } from './index.js';
import type { ScenarioPackage } from '../types.js';

test('marsScenario satisfies ScenarioPackage interface', () => {
  const scenario: ScenarioPackage = marsScenario;
  assert.equal(scenario.id, 'mars-genesis');
  assert.equal(scenario.engineArchetype, 'closed_turn_based_settlement');
});

test('marsScenario has correct labels', () => {
  assert.equal(marsScenario.labels.name, 'Mars Genesis');
  assert.equal(marsScenario.labels.populationNoun, 'colonists');
  assert.equal(marsScenario.labels.settlementNoun, 'colony');
});

test('marsScenario declares 5 departments', () => {
  assert.equal(marsScenario.departments.length, 5);
  const ids = marsScenario.departments.map(d => d.id);
  assert.ok(ids.includes('medical'));
  assert.ok(ids.includes('engineering'));
  assert.ok(ids.includes('agriculture'));
  assert.ok(ids.includes('psychology'));
  assert.ok(ids.includes('governance'));
});

test('marsScenario has tool forging enabled', () => {
  assert.equal(marsScenario.policies.toolForging.enabled, true);
});

test('marsScenario has at least one preset', () => {
  assert.ok(marsScenario.presets.length >= 1);
  const defaultPreset = marsScenario.presets.find(p => p.id === 'default');
  assert.ok(defaultPreset);
  assert.ok(defaultPreset!.leaders!.length >= 2);
});

test('marsScenario hooks include progressionHook', () => {
  assert.ok(marsScenario.hooks.progressionHook);
  assert.equal(typeof marsScenario.hooks.progressionHook, 'function');
});

test('marsScenario hooks include directorInstructions', () => {
  assert.ok(marsScenario.hooks.directorInstructions);
  const instructions = marsScenario.hooks.directorInstructions!();
  assert.ok(instructions.includes('Mars colony'));
});

test('marsScenario hooks include departmentPromptHook', () => {
  assert.ok(marsScenario.hooks.departmentPromptHook);
  assert.equal(typeof marsScenario.hooks.departmentPromptHook, 'function');
});

test('marsScenario knowledge bundle has topics', () => {
  assert.ok(Object.keys(marsScenario.knowledge.topics).length > 0);
  assert.ok(Object.keys(marsScenario.knowledge.categoryMapping).length > 0);
});

test('marsScenario world schema declares all ColonySystems fields', () => {
  const metricIds = Object.keys(marsScenario.world.metrics);
  assert.ok(metricIds.includes('population'));
  assert.ok(metricIds.includes('morale'));
  assert.ok(metricIds.includes('powerKw'));
  assert.ok(metricIds.includes('foodMonthsReserve'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/mars/index.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the Mars scenario package**

```typescript
// src/engine/mars/index.ts

import type { ScenarioPackage } from '../types.js';
import { MARS_CATEGORY_EFFECTS, MARS_FALLBACK_EFFECT } from './effects.js';
import { MARS_WORLD_METRICS, MARS_CAPACITY_METRICS, MARS_STATUS_METRICS, MARS_POLITICS_METRICS } from './metrics.js';
import { MARS_EVENT_DEFINITIONS } from './events.js';
import { marsProgressionHook } from './progression-hooks.js';
import { marsDepartmentPromptLines, marsDirectorInstructions } from './prompts.js';
import { MARS_KNOWLEDGE_BUNDLE } from './research-bundle.js';
import { MARS_DEFAULT_KEY_PERSONNEL, MARS_DEFAULT_LEADERS } from './presets.js';

/** Build world schema from extracted metric definitions */
function buildWorldSchema() {
  const toSchema = (metrics: typeof MARS_WORLD_METRICS) =>
    Object.fromEntries(metrics.map(m => [m.id, {
      id: m.id, label: m.label, unit: m.unit, type: m.type,
      initial: m.initial, min: m.min, max: m.max, category: m.category,
    }]));

  return {
    metrics: toSchema(MARS_WORLD_METRICS),
    capacities: toSchema(MARS_CAPACITY_METRICS),
    statuses: toSchema(MARS_STATUS_METRICS),
    politics: toSchema(MARS_POLITICS_METRICS),
    environment: {
      surfaceRadiationMsvDay: {
        id: 'surfaceRadiationMsvDay', label: 'Surface Radiation', unit: 'mSv/day',
        type: 'number' as const, initial: 0.67, min: 0, category: 'environment' as const,
      },
    },
  };
}

export const marsScenario: ScenarioPackage = {
  id: 'mars-genesis',
  version: '3.0.0',
  engineArchetype: 'closed_turn_based_settlement',

  labels: {
    name: 'Mars Genesis',
    shortName: 'mars',
    populationNoun: 'colonists',
    settlementNoun: 'colony',
    currency: 'credits',
  },

  theme: {
    primaryColor: '#dc2626',
    accentColor: '#f97316',
    cssVariables: {
      '--bg-primary': '#0a0a0f',
      '--bg-secondary': '#14141f',
      '--text-primary': '#e5e5e5',
      '--accent': '#dc2626',
    },
  },

  setup: {
    defaultTurns: 12,
    defaultSeed: 950,
    defaultStartYear: 2035,
    defaultPopulation: 100,
    configurableSections: ['leaders', 'personnel', 'resources', 'departments', 'events', 'models', 'advanced'],
  },

  world: buildWorldSchema(),

  departments: [
    { id: 'medical', label: 'Medical', role: 'Chief Medical Officer', icon: '🏥', defaultModel: 'gpt-5.4-mini', instructions: 'You are the Chief Medical Officer of a Mars colony. You analyze health impacts: radiation, bone density, disease, injuries, mortality risk, psychological wellbeing.' },
    { id: 'engineering', label: 'Engineering', role: 'Chief Engineer', icon: '⚙️', defaultModel: 'gpt-5.4-mini', instructions: 'You are the Chief Engineer of a Mars colony. You analyze infrastructure: habitat integrity, power, life support capacity, water systems, construction.' },
    { id: 'agriculture', label: 'Agriculture', role: 'Head of Agriculture', icon: '🌱', defaultModel: 'gpt-5.4-mini', instructions: 'You are the Head of Agriculture for a Mars colony. You analyze food security: crop yields, soil remediation, hydroponic capacity, caloric needs, reserves.' },
    { id: 'psychology', label: 'Psychology', role: 'Colony Psychologist', icon: '🧠', defaultModel: 'gpt-5.4-mini', instructions: 'You are the Colony Psychologist. You analyze morale, isolation effects, depression risk, social cohesion, generational tensions.' },
    { id: 'governance', label: 'Governance', role: 'Governance Advisor', icon: '🏛️', defaultModel: 'gpt-5.4-mini', instructions: 'You are the Governance Advisor. You analyze self-sufficiency, Earth dependency, political pressure, independence readiness.' },
  ],

  metrics: [
    { id: 'population', label: 'Population', source: 'metrics.population', format: 'number' },
    { id: 'morale', label: 'Morale', source: 'metrics.morale', format: 'percent' },
    { id: 'foodMonthsReserve', label: 'Food', source: 'metrics.foodMonthsReserve', format: 'number' },
    { id: 'powerKw', label: 'Power', source: 'metrics.powerKw', format: 'number' },
    { id: 'infrastructureModules', label: 'Modules', source: 'metrics.infrastructureModules', format: 'number' },
    { id: 'scienceOutput', label: 'Science', source: 'metrics.scienceOutput', format: 'number' },
  ],

  events: MARS_EVENT_DEFINITIONS,

  effects: [
    { id: 'category_effects', type: 'category_outcome', label: 'Category Outcome Effects', categoryDefaults: MARS_CATEGORY_EFFECTS },
  ],

  ui: {
    headerMetrics: [
      { id: 'population', format: 'number' },
      { id: 'morale', format: 'percent' },
      { id: 'foodMonthsReserve', format: 'number' },
      { id: 'powerKw', format: 'number' },
      { id: 'infrastructureModules', format: 'number' },
      { id: 'scienceOutput', format: 'number' },
    ],
    tooltipFields: ['boneDensityPct', 'cumulativeRadiationMsv', 'psychScore', 'marsborn'],
    reportSections: ['crisis', 'departments', 'decision', 'outcome', 'quotes'],
    departmentIcons: { medical: '🏥', engineering: '⚙️', agriculture: '🌱', psychology: '🧠', governance: '🏛️' },
    eventRenderers: Object.fromEntries(MARS_EVENT_DEFINITIONS.map(e => [e.id, { icon: e.icon, color: e.color }])),
    setupSections: ['leaders', 'personnel', 'resources', 'departments', 'events', 'models', 'advanced'],
  },

  knowledge: MARS_KNOWLEDGE_BUNDLE,

  policies: {
    toolForging: { enabled: true, requiredPerDepartment: true },
    liveSearch: { enabled: false, mode: 'off' },
    bulletin: { enabled: true },
    characterChat: { enabled: true },
    sandbox: { timeoutMs: 10000, memoryMB: 128 },
  },

  presets: [
    {
      id: 'default',
      label: 'Default Mars Genesis',
      leaders: MARS_DEFAULT_LEADERS.map(l => ({
        name: l.name,
        archetype: l.archetype,
        hexaco: l.hexaco as any,
        instructions: l.instructions,
      })),
      personnel: MARS_DEFAULT_KEY_PERSONNEL.map(p => ({
        name: p.name,
        department: p.department,
        role: p.role,
        specialization: p.specialization,
        age: p.age,
        featured: p.featured,
      })),
    },
  ],

  hooks: {
    progressionHook: marsProgressionHook,
    departmentPromptHook: (ctx) => marsDepartmentPromptLines(ctx.department, ctx.state),
    directorInstructions: marsDirectorInstructions,
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/mars/index.test.ts`
Expected: 10 tests PASS

- [ ] **Step 5: Run ALL tests to confirm no regressions**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/**/*.test.ts src/*.test.ts`
Expected: All tests PASS (existing + new)

- [ ] **Step 6: Commit**

```bash
cd apps/mars-genesis-simulation && git add src/engine/mars/index.ts src/engine/mars/index.test.ts && git commit -m "feat: assemble Mars ScenarioPackage from extracted components"
```

---

## Task 12: Final Integration Test

**Files:**
- Create: `src/engine/integration.test.ts`

- [ ] **Step 1: Write integration test verifying the full scenario stack**

```typescript
// src/engine/integration.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { marsScenario } from './mars/index.js';
import { EffectRegistry } from './effect-registry.js';
import { MetricRegistry } from './metric-registry.js';
import { EventTaxonomy } from './event-taxonomy.js';
import { MARS_CATEGORY_EFFECTS, MARS_FALLBACK_EFFECT } from './mars/effects.js';
import { MARS_WORLD_METRICS, MARS_CAPACITY_METRICS } from './mars/metrics.js';
import { MARS_EVENT_DEFINITIONS } from './mars/events.js';
import { getMarsMilestoneCrisis } from './mars/milestones.js';

test('EffectRegistry initialized from marsScenario.effects produces correct output', () => {
  const categoryDefaults = marsScenario.effects[0].categoryDefaults;
  const registry = new EffectRegistry(categoryDefaults, MARS_FALLBACK_EFFECT);
  const deltas = registry.applyOutcome('environmental', 'conservative_success', { personalityBonus: 0, noise: 0 });
  assert.equal(deltas.powerKw, 50);
  assert.equal(deltas.morale, 0.08);
});

test('MetricRegistry initialized from marsScenario.world covers all header metrics', () => {
  const allMetrics = [...MARS_WORLD_METRICS, ...MARS_CAPACITY_METRICS];
  const registry = new MetricRegistry(allMetrics);
  const headerIds = marsScenario.ui.headerMetrics.map(h => h.id);
  for (const id of headerIds) {
    assert.ok(registry.get(id), `Header metric ${id} not in MetricRegistry`);
  }
});

test('EventTaxonomy initialized from marsScenario.events covers all event renderers', () => {
  const taxonomy = new EventTaxonomy(MARS_EVENT_DEFINITIONS);
  for (const eventId of Object.keys(marsScenario.ui.eventRenderers)) {
    assert.ok(taxonomy.get(eventId), `Event renderer ${eventId} not in EventTaxonomy`);
  }
});

test('Mars milestones align with scenario setup defaults', () => {
  const landfall = getMarsMilestoneCrisis(1, marsScenario.setup.defaultTurns);
  assert.ok(landfall);
  assert.equal(landfall!.title, 'Landfall');

  const legacy = getMarsMilestoneCrisis(marsScenario.setup.defaultTurns, marsScenario.setup.defaultTurns);
  assert.ok(legacy);
  assert.equal(legacy!.title, 'Legacy Assessment');
});

test('Mars scenario progression hook modifies colonist radiation', () => {
  const colonist = {
    core: { marsborn: false, birthYear: 2000 },
    health: { alive: true, boneDensityPct: 100, cumulativeRadiationMsv: 0 },
    social: { earthContacts: 5 },
    career: { yearsExperience: 0 },
  };
  marsScenario.hooks.progressionHook!({
    colonists: [colonist as any],
    yearDelta: 1,
    year: 2036,
    turn: 1,
    rng: { chance: () => false } as any,
  });
  assert.ok(colonist.health.cumulativeRadiationMsv > 200);
  assert.ok(colonist.health.boneDensityPct < 100);
});

test('Mars scenario department count matches department configs in existing code', () => {
  // Existing DEPARTMENT_CONFIGS has 5 entries
  assert.equal(marsScenario.departments.length, 5);
});
```

- [ ] **Step 2: Run integration test**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/engine/integration.test.ts`
Expected: 6 tests PASS

- [ ] **Step 3: Run complete test suite**

Run: `cd apps/mars-genesis-simulation && node --import tsx --test src/**/*.test.ts src/*.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
cd apps/mars-genesis-simulation && git add src/engine/integration.test.ts && git commit -m "test: add Phase 1 integration tests for scenario engine abstraction seams"
```

---

## Summary

Phase 1 creates the following abstraction seams:

| Seam | Location | What it proves |
|------|----------|---------------|
| Type system | `src/engine/types.ts` | ScenarioPackage contract is expressible and type-safe |
| Effect registry | `src/engine/effect-registry.ts` | Category effects can flow through a scenario-owned registry |
| Metric registry | `src/engine/metric-registry.ts` | Colony metrics are declarative, not hardcoded |
| Event taxonomy | `src/engine/event-taxonomy.ts` | Event types are scenario-owned render metadata |
| Prompt hooks | `src/engine/mars/prompts.ts` | Department and director prompts are extractable functions |
| Progression hooks | `src/engine/mars/progression-hooks.ts` | Mars-specific health logic is a callable hook |
| Research bundle | `src/engine/mars/research-bundle.ts` | Knowledge is a loadable data structure |
| Milestones | `src/engine/mars/milestones.ts` | Narrative anchors are scenario-owned |
| Names/presets | `src/engine/mars/names.ts`, `presets.ts` | Product defaults are scenario-owned |
| Mars package | `src/engine/mars/index.ts` | All Mars data assembles into a valid ScenarioPackage |

The orchestrator's hardcoded `categoryEffects` is replaced with `EffectRegistry`. All other existing code remains untouched. Phase 2 will move the remaining inline Mars logic behind the scenario adapter interface.
