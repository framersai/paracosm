# Scenario Engine Generalization (Revised)

**Date:** 2026-04-13
**Status:** Revised after Codex product review. Ready for implementation plan.
**Scope:** Refactor Mars Genesis from a Mars-specific simulation into a generic closed-state, turn-based settlement simulation engine. Mars is the default preset and first-class product.

## Design Principle

**The engine owns the chassis. The scenario owns the domain.**

Engine archetype for v1: **closed-state, turn-based settlement simulation**. This covers Mars colony, lunar outpost, Antarctic station, orbital habitat, submarine habitat, generation ship. It does NOT cover graph-seeded social prediction (MiroFish), open-world sims, or fundamentally different simulation archetypes.

## Revised ScenarioPackage Interface

```typescript
interface ScenarioPackage {
  id: string;
  version: string;
  engineArchetype: 'closed_turn_based_settlement';

  labels: ScenarioLabels;
  theme: ScenarioTheme;

  /** What knobs the user can configure before the run */
  setup: ScenarioSetupSchema;

  /** World state definition: metrics, capacities, statuses, politics */
  world: ScenarioWorldSchema;

  /** Department/analysis group definitions */
  departments: DepartmentDefinition[];

  /** Derived metrics computed from raw state (not stored, calculated) */
  metrics: MetricDefinition[];

  /** Scenario-specific event kinds and how to render them */
  events: EventDefinition[];

  /** Valid policy effects and how they apply */
  effects: EffectDefinition[];

  /** Dashboard rendering metadata */
  ui: ScenarioUiDefinition;

  /** Domain research citations */
  knowledge: KnowledgeBundle;

  /** Feature policies: what capabilities are enabled */
  policies: ScenarioPolicies;

  /** Product-level presets (leaders, personnel, starting state) */
  presets: ScenarioPreset[];

  /** Lifecycle hooks */
  hooks: ScenarioHooks;
}
```

## WorldState (Replaces ColonySystems + ColonyPolitics)

Not everything is a flat numeric resource. Codex correctly identified that morale, capacity, governance status, and independence pressure are fundamentally different types.

```typescript
interface WorldState {
  /** Numeric gauges: food, power, water, gold, stock_price */
  metrics: Record<string, number>;
  /** Capacity constraints: life_support, housing, infrastructure */
  capacities: Record<string, number>;
  /** Categorical state: governance_status, faction_alignment */
  statuses: Record<string, string | boolean>;
  /** Political/social pressures */
  politics: Record<string, number | string | boolean>;
  /** Environment conditions */
  environment: Record<string, number | string | boolean>;
}
```

Scenarios declare which of these appear in the header, are diffed in reports, and affect crisis escalation.

## Agent Fields (Typed, Not Just Numeric)

```typescript
type AgentFieldValue = number | string | boolean | string[];

interface AgentFieldDefinition {
  id: string;
  label: string;
  unit: string;
  type: 'number' | 'string' | 'boolean' | 'tags';
  initial: AgentFieldValue;
  min?: number;
  max?: number;
  /** Numeric fields only: how this affects mortality */
  mortalityContribution?: { threshold: number; ratePerYear: number };
  /** Whether to show in agent tooltip */
  showInTooltip: boolean;
  /** Whether to include in reaction prompt context */
  includeInReactionContext: boolean;
}
```

Mars uses: radiation (number, mSv), boneDensity (number, %), marsborn (boolean).
Corporate uses: burnout (number, 0-1), tenure (number, years), remoteWorker (boolean).

## ScenarioPolicies

```typescript
interface ScenarioPolicies {
  toolForging: { enabled: boolean; requiredPerDepartment?: boolean };
  liveSearch: { enabled: boolean; mode: 'off' | 'manual' | 'auto' };
  bulletin: { enabled: boolean };
  characterChat: { enabled: boolean };
  sandbox: { timeoutMs: number; memoryMB: number };
}
```

## ScenarioUiDefinition

The dashboard needs scenario-owned render metadata, not just labels and colors.

```typescript
interface ScenarioUiDefinition {
  /** Which metrics appear in the stats header bar */
  headerMetrics: Array<{ id: string; format: 'number' | 'percent' | 'currency' | 'duration' }>;
  /** Which agent fields appear in hover tooltips */
  tooltipFields: string[];
  /** Which sections appear in the report view */
  reportSections: Array<'crisis' | 'departments' | 'decision' | 'outcome' | 'quotes' | 'causality'>;
  /** Department icons (emoji or SVG reference) */
  departmentIcons: Record<string, string>;
  /** Event card rendering rules */
  eventRenderers: Record<string, { icon: string; color: string }>;
  /** Setup form sections to expose */
  setupSections: Array<'leaders' | 'personnel' | 'resources' | 'departments' | 'events' | 'models' | 'advanced'>;
}
```

## Revised Migration Path (Codex-Approved Order)

The original spec moved files too early. Safer order: prove abstractions inside existing files first, then split.

### Phase 0: Stabilize (bug fixes, no structural changes)
1. Fix director model override (models?.director ?? models?.commander) DONE
2. Fix setup contract to include director and colonistReactions models DONE
3. Fix research fallback to use actual crisis category DONE
4. Replace Math.random() with seeded RNG in bulletin DONE
5. Replace Date.now() in simulationId with deterministic ID DONE
6. Fix pair runner tags to use actual archetype DONE
7. Clean up rate limiter on server shutdown DONE
8. Add @types/node to devDependencies DONE
9. Add golden-run compatibility fixtures (save a reference 3-turn output, test against it)

### Phase 1: Internal abstraction seams (no directory moves)
1. Create `ScenarioDefinition` type in a new `src/engine/types.ts`
2. Create metric registry: scenario declares metrics, kernel reads from registry
3. Create effect registry: scenario declares valid effects, orchestrator applies from registry
4. Create event taxonomy: scenario declares event types, dashboard renders from taxonomy
5. Extract Mars prompt fragments into functions that receive scenario context
6. Extract Mars progression additions (radiation, bone density) into hook-shaped functions
7. Extract Mars research bundle into a loadable format
8. Extract Mars crisis milestones into a loadable format
9. Extract Mars name lists into a loadable format

### Phase 2: Mars scenario adapter (move Mars behind interface)
1. Create `src/scenarios/mars/index.ts` exporting `ScenarioPackage`
2. Move crisis milestones to `src/scenarios/mars/milestones.ts`
3. Move research citations to `src/scenarios/mars/knowledge.ts`
4. Move progression hooks to `src/scenarios/mars/progression.ts`
5. Move prompt fragments to `src/scenarios/mars/prompts.ts`
6. Move name lists to `src/scenarios/mars/names.ts`
7. Move Mars presets (leaders, personnel) to `src/scenarios/mars/presets.ts`
8. Move category effects to `src/scenarios/mars/effects.ts`
9. Move fingerprint logic to `src/scenarios/mars/fingerprint.ts`

### Phase 3: Generalize dashboard through UI schema
1. Replace hardcoded stat labels with scenario.ui.headerMetrics
2. Replace hardcoded tooltip fields with scenario.ui.tooltipFields
3. Replace hardcoded department icons with scenario.ui.departmentIcons
4. Replace hardcoded theme colors with scenario.theme CSS variables
5. Replace hardcoded setup form with scenario.ui.setupSections
6. Replace hardcoded presets with scenario.presets
7. Serve scenario definition via `GET /scenario` endpoint

### Phase 4: Engine package boundaries
1. Rename `src/kernel/` to `src/engine/`
2. Generic types: Colonist -> Agent, ColonySystems -> WorldState, ColonyPolitics -> merged into WorldState
3. Kernel uses `scenario.world` schema for resource operations
4. Orchestrator calls `scenario.hooks` at each lifecycle point
5. Department factory reads from `scenario.departments`
6. Research memory ingests `scenario.knowledge`
7. Crisis director reads `scenario.crisisCategories` and `scenario.hooks.directorInstructions`
8. Reaction pipeline calls `scenario.hooks.reactionContext`

### Phase 5: Batch runner and second scenario
1. Create `src/batch/runner.ts` with typed `BatchConfig` and `BatchResult`
2. CLI: `npx tsx src/batch/runner.ts --scenarios mars,lunar --turns 5 --seed 950`
3. Programmatic API: `await runBatch({ scenarios, leaders, turns, seed })`
4. Create `src/scenarios/lunar/` (lunar outpost, closest cousin to Mars)
5. Create `src/scenarios/_template/` with starter files and README

## What Does NOT Change
- SeededRng, HEXACO model, EmergentCapabilityEngine, AgentOS Memory
- SSE streaming protocol, dashboard layout, tooltip system
- Rate limiting, chat endpoint, save/load, leaders.json
- Mars remains the default experience with `npm run dashboard`

## Success Criteria (Revised per Codex)
1. `npm run dashboard` launches Mars with identical branded experience
2. Mars logic loads through scenario package boundary without changing output for a fixed seed
3. Saved artifacts are scenario-agnostic at top level, scenario-specific in namespaced extension
4. A second settlement-style scenario (lunar) runs without editing engine or dashboard code
5. Dashboard renders scenario-owned metrics and tooltip fields, not renamed Mars strings
6. Batch runs persist manifest with scenario ID, version, seed, model config, output schema version
7. Tool forging, research, bulletin, chat controlled by scenario policies

## Bugs Fixed During Review
- 4.1: Director model override now accepts independent override via models?.director
- 4.2: SimulationSetupPayload.models no longer omits director
- 4.3: Research fallback passes actual crisis category, not hardcoded 'infrastructure'
- 4.4: Bulletin likes/replies use seeded RNG; simulationId uses deterministic format
- 4.8: Pair runner tags derived from actual leader archetype
- 4.9: Rate limiter cleanup interval cleared on server close
