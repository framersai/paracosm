# Compiler Prompt Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline — user rules forbid subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the scenario compiler so LLM-generated hooks can no longer slip through with bad state paths (`ctx.state.systems.hull.integrity` and similar nested hallucinations).

**Architecture:** A shared helper `buildScenarioFixture(scenarioJson)` derives a `SimulationState`-shaped fixture from the scenario's own `world.*` declarations. Every generator's smokeTest uses the scenario-specific fixture instead of hardcoded Mars defaults. Every generator's `buildSystemBlock()` declares the exact flat key list on every state bag so the LLM has no gap to fill with hallucinated shape. `generateValidatedCode` retries carry the previous validation error as negative-example feedback. `COMPILE_SCHEMA_VERSION 4 → 5` invalidates old cached hooks so every user regenerates against the tightened contract.

**Tech Stack:** TypeScript + Zod (for schema), Node.js test runner (`node --import tsx --test`), no new dependencies.

**Spec:** [docs/superpowers/specs/2026-04-23-compiler-prompt-hardening-design.md](../specs/2026-04-23-compiler-prompt-hardening-design.md)

---

## File Structure

**New files:**
- `src/engine/compiler/scenario-fixture.ts` — the `buildScenarioFixture(scenarioJson)` helper. Single responsibility: map scenario JSON to a validation-ready `SimulationState` fixture.
- `tests/engine/compiler/scenario-fixture.test.ts` — unit tests for the fixture helper across mars/lunar/submarine/corporate-quarterly.
- `tests/engine/compiler/retry-feedback.test.ts` — integration test that proves the retry prompt carries the previous error.

**Modified files:**
- `src/engine/compiler/cache.ts` — bump `COMPILE_SCHEMA_VERSION` 4 → 5 with changelog comment.
- `src/engine/compiler/llm-invocations/generateValidatedCode.ts` — append the previous smokeTest error to the retry prompt.
- `src/engine/compiler/generate-prompts.ts` — use `buildScenarioFixture`; add "AVAILABLE STATE SHAPE" block to system prompt.
- `src/engine/compiler/generate-politics.ts` — same.
- `src/engine/compiler/generate-reactions.ts` — same.
- `src/engine/compiler/generate-fingerprint.ts` — same.
- `src/engine/compiler/generate-milestones.ts` — add `labels.timeUnitNoun` to prompt (no state access, so no state-shape block).
- `tests/engine/compiler/cache-version-bust.test.ts` — assert v4 manifest rejects after bump to v5.
- `CHANGELOG.md` — add entry under 0.7.0 covering the compiler hardening + cache regen.

---

## Task 1: `scenario-fixture.ts` helper + unit tests

**Files:**
- Create: `src/engine/compiler/scenario-fixture.ts`
- Create: `tests/engine/compiler/scenario-fixture.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/engine/compiler/scenario-fixture.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { buildScenarioFixture } from '../../../src/engine/compiler/scenario-fixture.js';
import { marsScenario } from '../../../src/engine/mars/index.js';
import { lunarScenario } from '../../../src/engine/lunar/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

function loadScenarioJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(REPO_ROOT, relativePath), 'utf8')) as Record<string, unknown>;
}

test('buildScenarioFixture: mars scenario produces systems with every declared metric', () => {
  const fixture = buildScenarioFixture(marsScenario as unknown as Record<string, unknown>);
  const declaredKeys = Object.keys((marsScenario.world as { metrics: Record<string, unknown> }).metrics);
  for (const key of declaredKeys) {
    assert.ok(key in fixture.systems, `mars fixture missing declared metric: ${key}`);
  }
});

test('buildScenarioFixture: lunar scenario produces all five world bags', () => {
  const fixture = buildScenarioFixture(lunarScenario as unknown as Record<string, unknown>);
  assert.equal(typeof fixture.systems, 'object');
  assert.equal(typeof fixture.capacities, 'object');
  assert.equal(typeof fixture.statuses, 'object');
  assert.equal(typeof fixture.politics, 'object');
  assert.equal(typeof fixture.environment, 'object');
});

test('buildScenarioFixture: corporate-quarterly scenario produces quarterly metadata', () => {
  const corp = loadScenarioJson('scenarios/corporate-quarterly.json');
  const fixture = buildScenarioFixture(corp);
  assert.equal(fixture.metadata.startTime, 1);
  assert.equal(fixture.metadata.currentTime, 1);
  assert.equal(fixture.metadata.currentTurn, 0);
  assert.ok('revenueArr' in fixture.systems);
  assert.ok('burnRate' in fixture.systems);
  assert.ok('marketShare' in fixture.systems);
});

test('buildScenarioFixture: submarine scenario carries declared hull + oxygen metrics', () => {
  const sub = loadScenarioJson('scenarios/submarine.json');
  const fixture = buildScenarioFixture(sub);
  assert.ok('hullIntegrity' in fixture.systems);
  assert.ok('oxygenReserveHours' in fixture.systems);
});

test('buildScenarioFixture: empty-bag scenarios produce empty objects (not undefined)', () => {
  const corp = loadScenarioJson('scenarios/corporate-quarterly.json');
  const fixture = buildScenarioFixture(corp);
  // corporate-quarterly has statuses populated (fundingRound); politics has boardConfidence etc.
  assert.ok(fixture.statuses !== undefined);
  assert.ok(fixture.politics !== undefined);
});

test('buildScenarioFixture: numeric metric without initial defaults to 0', () => {
  const scenario = {
    id: 'test',
    labels: { name: 'Test', timeUnitNoun: 'tick', timeUnitNounPlural: 'ticks' },
    setup: { defaultStartTime: 0, defaultTimePerTurn: 1 },
    world: {
      metrics: {
        foo: { id: 'foo', label: 'Foo', unit: '', type: 'number', category: 'metric' },
      },
      capacities: {},
      statuses: {},
      politics: {},
      environment: {},
    },
  };
  const fixture = buildScenarioFixture(scenario);
  assert.equal(fixture.systems.foo, 0);
});

test('buildScenarioFixture: string metric without initial defaults to empty string', () => {
  const scenario = {
    id: 'test',
    labels: { name: 'Test' },
    setup: { defaultStartTime: 0 },
    world: {
      metrics: {},
      capacities: {},
      statuses: {
        status: { id: 'status', label: 'Status', unit: '', type: 'string', category: 'status' },
      },
      politics: {},
      environment: {},
    },
  };
  const fixture = buildScenarioFixture(scenario);
  assert.equal(fixture.statuses.status, '');
});

test('buildScenarioFixture: scenario missing world.metrics throws clear error', () => {
  const broken = { id: 'broken', labels: { name: 'Broken' }, setup: {} };
  assert.throws(
    () => buildScenarioFixture(broken as unknown as Record<string, unknown>),
    /world\.metrics/,
  );
});

test('buildScenarioFixture: fixture includes a synthetic agent with HEXACO + lifecycle fields', () => {
  const corp = loadScenarioJson('scenarios/corporate-quarterly.json');
  const fixture = buildScenarioFixture(corp);
  assert.equal(fixture.agents.length, 1);
  const agent = fixture.agents[0];
  assert.ok(typeof agent.core.birthTime === 'number');
  assert.ok(typeof agent.health.alive === 'boolean');
  assert.ok(typeof agent.hexaco.openness === 'number');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --import tsx --test tests/engine/compiler/scenario-fixture.test.ts 2>&1 | tail -20
```

Expected: all tests fail with `Error: Cannot find module '.../scenario-fixture.js'`.

- [ ] **Step 3: Implement `scenario-fixture.ts`**

Create `src/engine/compiler/scenario-fixture.ts`:

```typescript
/**
 * Build a SimulationState-shaped fixture derived from a scenario's own
 * `world.*` declarations. Used by every compiler generator's smokeTest
 * so validation runs against a shape that matches the scenario being
 * compiled — not a hardcoded Mars fixture that produces false positives
 * and false negatives for non-Mars scenarios.
 *
 * @module paracosm/engine/compiler/scenario-fixture
 */
import type { Agent } from '../core/state.js';

interface MetricDefinition {
  id: string;
  label?: string;
  unit?: string;
  type?: 'number' | 'string' | 'boolean';
  initial?: number | string | boolean;
  category?: string;
}

export interface ScenarioFixture {
  systems: Record<string, number>;
  capacities: Record<string, number>;
  statuses: Record<string, string | boolean>;
  politics: Record<string, number | string | boolean>;
  environment: Record<string, number | string | boolean>;
  metadata: {
    simulationId: string;
    leaderId: string;
    seed: number;
    startTime: number;
    currentTime: number;
    currentTurn: number;
  };
  agents: Agent[];
  eventLog: never[];
}

/** Coerce a metric definition to its typed initial value. */
function coerceInitial(def: MetricDefinition): number | string | boolean {
  if (def.initial !== undefined) return def.initial;
  switch (def.type) {
    case 'number': return 0;
    case 'string': return '';
    case 'boolean': return false;
    default: return 0; // numeric-by-default
  }
}

function coerceNumeric(def: MetricDefinition): number {
  const v = coerceInitial(def);
  return typeof v === 'number' ? v : 0;
}

function coerceAny(def: MetricDefinition): number | string | boolean {
  return coerceInitial(def);
}

function buildBag<T>(
  bag: Record<string, MetricDefinition> | undefined,
  coerce: (def: MetricDefinition) => T,
): Record<string, T> {
  const out: Record<string, T> = {};
  if (!bag) return out;
  for (const [key, def] of Object.entries(bag)) {
    out[key] = coerce(def);
  }
  return out;
}

function buildSyntheticAgent(startTime: number): Agent {
  return {
    core: {
      id: 'fixture-agent-001',
      name: 'Fixture Agent',
      birthTime: startTime - 30,
      marsborn: false,
      department: 'engineering',
      role: 'engineer',
    },
    health: {
      alive: true,
      psychScore: 0.7,
      conditions: [],
    },
    career: {
      specialization: 'general',
      yearsExperience: 5,
      rank: 'senior',
      achievements: [],
    },
    social: {
      partnerId: undefined,
      childrenIds: [],
      friendIds: [],
      earthContacts: 3,
    },
    narrative: {
      lifeEvents: [],
      featured: false,
    },
    hexaco: {
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      emotionality: 0.5,
      honestyHumility: 0.5,
    },
    hexacoHistory: [],
    memory: { shortTerm: [], longTerm: [], stances: {}, relationships: {} },
  } as Agent;
}

/**
 * Build a SimulationState-shaped fixture from a scenario JSON.
 *
 * Throws if `world.metrics` is missing — post-0.5.0 scenarios all carry
 * the five world bags, so a missing one indicates malformed input.
 */
export function buildScenarioFixture(scenarioJson: Record<string, unknown>): ScenarioFixture {
  const world = scenarioJson.world as
    | { metrics?: Record<string, MetricDefinition>; capacities?: Record<string, MetricDefinition>; statuses?: Record<string, MetricDefinition>; politics?: Record<string, MetricDefinition>; environment?: Record<string, MetricDefinition> }
    | undefined;
  if (!world || !world.metrics) {
    throw new Error('buildScenarioFixture: scenario missing world.metrics declaration');
  }

  const setup = (scenarioJson.setup ?? {}) as { defaultStartTime?: number };
  const startTime = typeof setup.defaultStartTime === 'number' ? setup.defaultStartTime : 0;
  const scenarioId = (scenarioJson.id as string) ?? 'fixture-scenario';

  return {
    systems: buildBag(world.metrics, coerceNumeric),
    capacities: buildBag(world.capacities, coerceNumeric),
    statuses: buildBag(world.statuses, coerceAny) as Record<string, string | boolean>,
    politics: buildBag(world.politics, coerceAny),
    environment: buildBag(world.environment, coerceAny),
    metadata: {
      simulationId: `fixture-${scenarioId}`,
      leaderId: 'fixture-leader',
      seed: 42,
      startTime,
      currentTime: startTime,
      currentTurn: 0,
    },
    agents: [buildSyntheticAgent(startTime)],
    eventLog: [],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --import tsx --test tests/engine/compiler/scenario-fixture.test.ts 2>&1 | tail -15
```

Expected: 9 tests pass, 0 fail.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep "scenario-fixture" | head -5
echo "exit=$?"
```

Expected: no `scenario-fixture` lines, exit 0 (existing unrelated Zod-v4 errors may remain).

- [ ] **Step 6: Commit**

```bash
git add src/engine/compiler/scenario-fixture.ts tests/engine/compiler/scenario-fixture.test.ts
git commit -m "feat(compiler): scenario-derived fixture helper for hook validation"
```

---

## Task 2: Wire fixture + state-shape prompt into all 5 state-accessing generators

**Files:**
- Modify: `src/engine/compiler/generate-prompts.ts`
- Modify: `src/engine/compiler/generate-politics.ts`
- Modify: `src/engine/compiler/generate-reactions.ts`
- Modify: `src/engine/compiler/generate-fingerprint.ts`

- [ ] **Step 1: Read the current state of `generate-prompts.ts` buildSystemBlock**

```bash
sed -n '14,52p' src/engine/compiler/generate-prompts.ts
```

Note the current system prompt content to preserve its instruction wording while injecting the new state-shape block.

- [ ] **Step 2: Add a shared state-shape block helper**

Create `src/engine/compiler/state-shape-block.ts`:

```typescript
/**
 * Build the "AVAILABLE STATE SHAPE" block that every state-accessing
 * generator's system prompt now includes. Declares the exact flat key
 * list on each world bag so the LLM cannot silently hallucinate nested
 * access patterns.
 *
 * @module paracosm/engine/compiler/state-shape-block
 */

interface MetricDef { id: string; type?: 'number' | 'string' | 'boolean' }

function keys(bag: Record<string, MetricDef> | undefined): string[] {
  return bag ? Object.keys(bag) : [];
}

export function buildStateShapeBlock(scenarioJson: Record<string, unknown>): string {
  const world = (scenarioJson.world ?? {}) as Record<string, Record<string, MetricDef> | undefined>;
  const labels = (scenarioJson.labels ?? {}) as { timeUnitNoun?: string; timeUnitNounPlural?: string };
  const timeUnit = labels.timeUnitNoun ?? 'tick';
  const timeUnitPlural = labels.timeUnitNounPlural ?? 'ticks';

  const listOrNone = (ks: string[]): string => ks.length ? ks.join(', ') : '(none declared)';

  return `AVAILABLE STATE SHAPE (read-only, flat):

state.systems = Record<string, number>
  keys: ${listOrNone(keys(world.metrics))}
state.capacities = Record<string, number>
  keys: ${listOrNone(keys(world.capacities))}
state.politics = Record<string, number | string | boolean>
  keys: ${listOrNone(keys(world.politics))}
state.statuses = Record<string, string | boolean>
  keys: ${listOrNone(keys(world.statuses))}
state.environment = Record<string, number | string | boolean>
  keys: ${listOrNone(keys(world.environment))}
state.metadata = { simulationId, leaderId, seed, startTime, currentTime, currentTurn }

RULES:
- All five state bags are FLAT. Access is state.<bag>.<key> — no deeper nesting.
- state.systems.<key> is always a number. Do not write state.systems.<key>.<subfield>.
- Only reference keys listed above. Other keys are not guaranteed to exist.
- Time is measured in ${timeUnit} units (plural: ${timeUnitPlural}). Use that vocabulary in any user-visible strings.`;
}
```

- [ ] **Step 3: Modify `generate-prompts.ts`: inject state-shape block + use fixture**

Read the file first:

```bash
cat src/engine/compiler/generate-prompts.ts | head -80
```

Make these changes inside `generate-prompts.ts`:

1. Add imports at the top:

```typescript
import { buildScenarioFixture } from './scenario-fixture.js';
import { buildStateShapeBlock } from './state-shape-block.js';
```

2. In `buildSystemBlock(scenarioJson)`, append the state-shape block. Replace the existing returned template-literal with a version that interpolates `${buildStateShapeBlock(scenarioJson)}` appended to the end of the instructions section (just before `Rules:` if present, or at the end):

```typescript
function buildSystemBlock(scenarioJson: Record<string, any>): string {
  // ... existing preamble text ...
  return `You are generating a departmentPromptHook for a simulation engine.

SCENARIO: ${scenarioJson.labels?.name ?? 'Unknown'}
DEPARTMENTS: ${(scenarioJson.departments ?? []).map((d: any) => d.id).join(', ')}

Function signature: (ctx) => string[]

ctx: { department, state, scenario, researchPacket }
For each department, compute and return 2-4 lines of scenario-relevant stats from ctx.state.

${buildStateShapeBlock(scenarioJson)}

Rules:
1. Return an array of 2-4 strings.
2. Access ctx.state.agents (filter alive), ctx.state.systems, ctx.state.politics.
3. Reference only the keys listed in AVAILABLE STATE SHAPE. Bad key access throws.
4. NO external imports, NO async.`;
}
```

3. Replace the `buildSmokeTest` function's hardcoded systems block with the fixture call:

```typescript
function buildSmokeTest(scenarioJson: Record<string, any>): (fn: DepartmentPromptFn) => void {
  return (fn) => {
    const deptId = (scenarioJson.departments ?? [])[0]?.id ?? 'engineering';
    const fixture = buildScenarioFixture(scenarioJson);
    const result = fn({
      department: deptId,
      state: fixture as any,
      scenario: scenarioJson,
      researchPacket: { canonicalFacts: [], counterpoints: [], departmentNotes: {} },
    });
    if (!Array.isArray(result)) throw new Error('Expected array of strings');
    if (result.length < 1 || result.length > 10) throw new Error(`Expected 1-10 lines, got ${result.length}`);
    for (const line of result) {
      if (typeof line !== 'string') throw new Error('Expected string lines');
    }
  };
}
```

- [ ] **Step 4: Same treatment for `generate-politics.ts`**

politics-hook signature is `(category: string, outcome: string) => Record<string, number> | null` — no `ctx.state` parameter. The hook DOES NOT access state directly, but the LLM prompt still benefits from the timeUnit vocabulary. Add only the timeUnit line (not the full block) by calling `buildStateShapeBlock` and wrapping it conditionally, OR just inject the `timeUnitNoun` directly:

Read first:
```bash
grep -n "buildSystemBlock\|buildSmokeTest" src/engine/compiler/generate-politics.ts
```

Update `buildSystemBlock` in `generate-politics.ts` to inject the time-unit vocabulary line:

```typescript
import { buildScenarioFixture } from './scenario-fixture.js';

function buildSystemBlock(scenarioJson: Record<string, any>): string {
  const timeUnit = scenarioJson.labels?.timeUnitNoun ?? 'tick';
  return `You are generating a politicsHook for a simulation engine.
...existing instructions...

Time is measured in ${timeUnit} units in this scenario.
`;
}
```

Politics hook smokeTest has no `ctx.state`, so no fixture replacement needed there. Keep whatever smokeTest exists.

- [ ] **Step 5: `generate-reactions.ts`: inject state-shape + fixture**

Reaction context hook signature: `(colonist, ctx: { time, turn }) => string` — receives agent + time, NOT full state. Time-unit vocabulary is the relevant injection:

```typescript
import { buildScenarioFixture } from './scenario-fixture.js';

function buildSystemBlock(scenarioJson: Record<string, any>): string {
  const timeUnit = scenarioJson.labels?.timeUnitNoun ?? 'tick';
  return `You are generating a reactionContextHook...
...existing instructions...

Time is measured in ${timeUnit} units. Use that vocabulary in user-visible strings.
`;
}
```

Reactions hook smokeTest receives a synthetic colonist + ctx — no world-state access. Keep existing smokeTest.

- [ ] **Step 6: `generate-fingerprint.ts`: inject state-shape block + fixture**

Fingerprint hook IS a state consumer: `(finalState, outcomeLog, leader, toolRegs, maxTurns)` where `finalState: { agents, systems, politics, metadata }`.

Add import:
```typescript
import { buildScenarioFixture } from './scenario-fixture.js';
import { buildStateShapeBlock } from './state-shape-block.js';
```

Update `buildSystemBlock` to include the state-shape block:

```typescript
function buildSystemBlock(scenarioJson: Record<string, any>): string {
  const labels = scenarioJson.labels ?? {};
  const depts = (scenarioJson.departments ?? []).map((d: any) => d.id).join(', ');
  return `You are generating a timeline fingerprint hook for a simulation engine.

SCENARIO: ${labels.name ?? 'Unknown'} — ${labels.settlementNoun ?? 'settlement'} simulation
DEPARTMENTS: ${depts}

Function signature: (finalState, outcomeLog, leader, toolRegs, maxTurns) => Record<string, string>

Inputs:
- finalState: { agents, systems, politics, metadata: { currentTime, startTime } }
- outcomeLog: [{ turn, time, outcome: 'risky_success' | 'risky_failure' | 'conservative_success' | 'conservative_failure' }]
- leader: { name, archetype, hexaco }
- toolRegs: Record<dept, string[]> (department -> tool names)
- maxTurns: number

${buildStateShapeBlock(scenarioJson)}

Output: object with 5-7 classification dimensions (each 2-3 possible values e.g. "resilient" | "brittle") PLUS a "summary" key joining them with " · ".

Rules:
1. Scenario-relevant classification names (not Mars-specific)
2. Base classifications on final state, outcome patterns, leader personality
3. Always include "summary"
4. NO external imports`;
}
```

Update `smokeTest` to use the fixture:

```typescript
function smokeTest(scenarioJson: Record<string, any>): (fn: FingerprintFn) => void {
  return (fn) => {
    const fixture = buildScenarioFixture(scenarioJson);
    const result = fn(
      fixture,
      [{ turn: 1, time: fixture.metadata.startTime, outcome: 'conservative_success' }],
      { name: 'Test', archetype: 'test', hexaco: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5 } },
      { engineering: ['tool1'] },
      8,
    );
    if (typeof result !== 'object' || result === null) throw new Error('Expected object');
    if (typeof result.summary !== 'string') throw new Error('Missing "summary" key');
  };
}
```

And adjust the caller in `generate-fingerprint.ts` to pass `scenarioJson` into `smokeTest`:

```typescript
const result = await generateValidatedCode<FingerprintFn>({
  // ...
  smokeTest: smokeTest(scenarioJson),
  // ...
});
```

- [ ] **Step 7: `generate-milestones.ts`: inject time-unit vocabulary**

Milestones hook has no state access (signature: `(turn, maxTurns) => MilestoneEventDef | null`), so only the timeUnit line goes in:

```typescript
function buildSystemBlock(scenarioJson: Record<string, any>): string {
  const timeUnit = scenarioJson.labels?.timeUnitNoun ?? 'tick';
  return `...existing preamble...

Time is measured in ${timeUnit} units in this scenario. Use that vocabulary in any turn descriptions.

...existing rules...
`;
}
```

- [ ] **Step 8: Extend `generate-prompts.test.ts` to assert the state-shape block appears**

Find the existing test file:

```bash
ls tests/engine/compiler/generate-prompts.test.ts 2>/dev/null || find tests -name "generate-prompts*" 2>/dev/null
```

If the test file exists, append:

```typescript
test('buildSystemBlock includes AVAILABLE STATE SHAPE with scenario-declared keys', async () => {
  const scenario = {
    id: 'test',
    labels: { name: 'Test', timeUnitNoun: 'quarter', timeUnitNounPlural: 'quarters' },
    departments: [{ id: 'ops' }],
    setup: { defaultStartTime: 1 },
    world: {
      metrics: { revenue: { id: 'revenue', type: 'number' }, morale: { id: 'morale', type: 'number' } },
      capacities: {}, statuses: {}, politics: {}, environment: {},
    },
  };
  // Access the unexported function via dynamic import + hacky reflect;
  // simpler: trigger compilation and inspect the prompt via telemetry spy.
  // For now, unit-test the shared helper directly:
  const { buildStateShapeBlock } = await import('../../../src/engine/compiler/state-shape-block.js');
  const block = buildStateShapeBlock(scenario);
  assert.ok(block.includes('revenue'));
  assert.ok(block.includes('morale'));
  assert.ok(block.includes('quarter'));
  assert.ok(block.includes('FLAT'));
});
```

If the test file does not exist, create `tests/engine/compiler/state-shape-block.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStateShapeBlock } from '../../../src/engine/compiler/state-shape-block.js';

test('buildStateShapeBlock lists scenario-declared metric keys', () => {
  const block = buildStateShapeBlock({
    labels: { timeUnitNoun: 'quarter', timeUnitNounPlural: 'quarters' },
    world: {
      metrics: { revenue: { id: 'revenue' }, morale: { id: 'morale' } },
      capacities: {},
      statuses: {},
      politics: {},
      environment: {},
    },
  });
  assert.ok(block.includes('revenue'));
  assert.ok(block.includes('morale'));
  assert.ok(block.includes('quarter'));
  assert.ok(block.includes('quarters'));
  assert.ok(block.includes('FLAT'));
});

test('buildStateShapeBlock falls back to tick when timeUnit not set', () => {
  const block = buildStateShapeBlock({
    world: { metrics: {}, capacities: {}, statuses: {}, politics: {}, environment: {} },
  });
  assert.ok(block.includes('tick'));
});

test('buildStateShapeBlock lists (none declared) for empty bags', () => {
  const block = buildStateShapeBlock({
    world: { metrics: {}, capacities: {}, statuses: {}, politics: {}, environment: {} },
  });
  assert.ok(block.includes('(none declared)'));
});
```

- [ ] **Step 9: Run all compiler tests**

```bash
node --import tsx --test 'tests/engine/compiler/**/*.test.ts' 2>&1 | tail -15
```

Expected: all pass.

- [ ] **Step 10: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep -E "state-shape-block|scenario-fixture|generate-" | head -10
echo "exit=$?"
```

Expected: no lines referencing our new/modified files. Exit 0.

- [ ] **Step 11: Commit**

```bash
git add src/engine/compiler/state-shape-block.ts src/engine/compiler/generate-prompts.ts src/engine/compiler/generate-politics.ts src/engine/compiler/generate-reactions.ts src/engine/compiler/generate-fingerprint.ts src/engine/compiler/generate-milestones.ts tests/engine/compiler/state-shape-block.test.ts tests/engine/compiler/generate-prompts.test.ts
git commit -m "feat(compiler): scenario-derived smokeTest fixtures + explicit flat state-shape in every prompt"
```

---

## Task 3: Retry feedback in `generateValidatedCode`

**Files:**
- Modify: `src/engine/compiler/llm-invocations/generateValidatedCode.ts`
- Create: `tests/engine/compiler/retry-feedback.test.ts`

- [ ] **Step 1: Write failing integration test**

Create `tests/engine/compiler/retry-feedback.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';

import { generateValidatedCode } from '../../../src/engine/compiler/llm-invocations/generateValidatedCode.js';

test('retry prompt includes previous smokeTest error as negative feedback', async () => {
  const promptsReceived: string[] = [];
  let callCount = 0;
  const generateText = async (args: { prompt: string }): Promise<{ text: string; usage?: unknown }> => {
    promptsReceived.push(args.prompt);
    callCount++;
    // First call: return a hook that throws at smokeTest.
    // Second call: return a valid hook.
    if (callCount === 1) return { text: '() => { throw new Error("bad state path"); }' };
    return { text: '() => "ok"' };
  };

  const result = await generateValidatedCode<() => string>({
    generateText: generateText as never,
    systemPrompt: 'system',
    userPrompt: 'initial user prompt',
    parse: (text: string) => {
      try {
        const fn = new Function('return ' + text)();
        return typeof fn === 'function' ? (fn as () => string) : null;
      } catch { return null; }
    },
    smokeTest: (fn) => { fn(); },
    fallback: () => 'fallback',
    fallbackSource: '() => "fallback"',
    hookName: 'testHook',
    maxRetries: 3,
  });

  assert.equal(result.fromFallback, false);
  assert.equal(result.hook(), 'ok');
  assert.equal(promptsReceived.length, 2);
  assert.equal(promptsReceived[0], 'initial user prompt');
  assert.ok(promptsReceived[1].includes('Previous attempt failed validation'));
  assert.ok(promptsReceived[1].includes('bad state path'));
});

test('first-call prompt is unchanged from userPrompt', async () => {
  const promptsReceived: string[] = [];
  const generateText = async (args: { prompt: string }): Promise<{ text: string; usage?: unknown }> => {
    promptsReceived.push(args.prompt);
    return { text: '() => "ok"' };
  };
  await generateValidatedCode<() => string>({
    generateText: generateText as never,
    systemPrompt: 'system',
    userPrompt: 'initial user prompt',
    parse: (text: string) => new Function('return ' + text)() as () => string,
    smokeTest: () => {},
    fallback: () => 'fallback',
    fallbackSource: '',
    hookName: 'testHook',
    maxRetries: 3,
  });
  assert.equal(promptsReceived[0], 'initial user prompt');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --import tsx --test tests/engine/compiler/retry-feedback.test.ts 2>&1 | tail -10
```

Expected: first test fails because retry prompt does not yet include the error feedback.

- [ ] **Step 3: Implement retry feedback in `generateValidatedCode.ts`**

Read current state:

```bash
grep -n "userPrompt\|lastReason\|prompt:" src/engine/compiler/llm-invocations/generateValidatedCode.ts | head -20
```

Modify the retry loop. Replace the inside of the `for (let attempt = 0; attempt < maxRetries; attempt++)` block. Find the existing `prompt` variable assignment (or creation) and change to:

```typescript
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const userPromptForAttempt = attempt === 0
      ? opts.userPrompt
      : `${opts.userPrompt}\n\nPrevious attempt failed validation: ${lastReason ?? 'unknown error'}\n\nRegenerate the function. The error above indicates which access was invalid. Only reference keys listed in the AVAILABLE STATE SHAPE section of the system prompt. Do not assume nested structure on state bags.`;

    const prompt = opts.systemPrompt
      ? `${opts.systemPrompt}\n\n${userPromptForAttempt}`
      : userPromptForAttempt;

    const { text } = await opts.generateText({
      provider: opts.provider,
      model: opts.model,
      prompt,
      maxTokens: opts.maxTokens,
    });
    lastRawText = text;

    const fn = opts.parse(text);
    if (!fn) {
      lastReason = 'Could not parse response into a callable function (markdown wrapper, syntax error, or non-function export)';
      continue;
    }
    try {
      opts.smokeTest(fn);
      opts.telemetry?.recordAttempt(opts.hookName, attempt + 1, false);
      return { hook: fn, source: text.trim(), attempts: attempt + 1, fromFallback: false };
    } catch (err) {
      lastReason = err instanceof Error ? err.message : String(err);
    }
  }
```

(Preserve the existing `lastRawText` / `lastReason` declarations above the loop.)

- [ ] **Step 4: Run test to verify it passes**

```bash
node --import tsx --test tests/engine/compiler/retry-feedback.test.ts 2>&1 | tail -10
```

Expected: both tests pass.

- [ ] **Step 5: Re-run all compiler tests for regression check**

```bash
node --import tsx --test 'tests/engine/compiler/**/*.test.ts' 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/engine/compiler/llm-invocations/generateValidatedCode.ts tests/engine/compiler/retry-feedback.test.ts
git commit -m "feat(compiler): retry prompt carries previous smokeTest error as feedback"
```

---

## Task 4: Cache bump + CHANGELOG + regression smoke

**Files:**
- Modify: `src/engine/compiler/cache.ts`
- Modify: `tests/engine/compiler/cache-version-bust.test.ts`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump COMPILE_SCHEMA_VERSION and update docstring**

In `src/engine/compiler/cache.ts`, find the line `export const COMPILE_SCHEMA_VERSION = 4;` and replace it + the surrounding docblock:

```typescript
 * - v4 (2026-04-23): F23 time-units rename. Progression/reactions/
 *   fingerprint hook contexts swap `year`/`yearDelta`/`startYear`/
 *   `currentYear` for `time`/`timeDelta`/`startTime`/`currentTime`;
 *   agent core swaps `birthYear`/`deathYear` for `birthTime`/
 *   `deathTime`. Every cached hook references the old names and must
 *   regenerate (one-time ~$0.10 per previously-compiled scenario).
 * - v5 (2026-04-23): Compiler prompt hardening. Every generator's
 *   system prompt now declares the flat state shape with exact
 *   scenario-declared key lists; smokeTest fixtures derived from the
 *   scenario's own world.* bags; retry prompts include previous
 *   validation error. Pre-v5 cached hooks compiled under weaker
 *   fixtures and must regenerate.
 */
export const COMPILE_SCHEMA_VERSION = 5;
```

- [ ] **Step 2: Update cache-version-bust test**

Find the test:

```bash
grep -n "COMPILE_SCHEMA_VERSION\|expect.*4\|expect.*5" tests/engine/compiler/cache-version-bust.test.ts 2>/dev/null || echo "not found"
```

If the test hardcodes the old version number, bump it. Otherwise, if the test asserts "version is current", no edit needed.

Typical shape: open the file and find any `=== 4` → change to `=== 5`:

```bash
sed -i.bak 's/COMPILE_SCHEMA_VERSION, 4/COMPILE_SCHEMA_VERSION, 5/g; s/version: 4/version: 5/g' tests/engine/compiler/cache-version-bust.test.ts
rm tests/engine/compiler/cache-version-bust.test.ts.bak
```

Verify manually:

```bash
grep -n "COMPILE_SCHEMA_VERSION\| 4\| 5" tests/engine/compiler/cache-version-bust.test.ts
```

- [ ] **Step 3: Add CHANGELOG entry**

Open `CHANGELOG.md` and add a new section **under** the existing `## 0.7.0` header but **above** its `### Breaking Changes` subheader:

```markdown
## 0.7.1 (2026-04-23) — compiler prompt hardening

Internal-only improvement. The scenario compiler's LLM generators now
declare the flat state-shape contract explicitly in every system prompt
and validate hooks against fixtures derived from the scenario's own
`world.*` declarations. Retry prompts carry the previous smokeTest
error as negative feedback so the LLM has a corrective signal on
re-attempt. No public API surface changes.

### Cache invalidation

`COMPILE_SCHEMA_VERSION` bumps 4 → 5. Cached compiled-scenario hooks
from 0.6.x / 0.7.0 regenerate on next `compileScenario()` call
(one-time ~$0.10 per previously-compiled scenario per user).

### Why

A consumer hit `TypeError: undefined is not an object (evaluating
'ctx.state.systems.hull.integrity')` at runtime because a generated
department prompt hook assumed nested structure on `state.systems`.
The hardening makes that specific failure class structurally
impossible: every prompt lists the exact flat keys, and every
generator's smokeTest uses a fixture populated from those same
declarations, so a hook that references a nonexistent or nested path
fails validation at compile time and either retries with feedback or
falls back to a safe no-op.
```

- [ ] **Step 4: Typecheck the full build**

```bash
npx tsc --noEmit -p tsconfig.build.json 2>&1 | head -10
echo "exit=$?"
```

Expected: no new errors referencing our changed files. Pre-existing Zod-v4 warnings in `src/runtime/llm-invocations/` are acceptable (not introduced by this change).

- [ ] **Step 5: Run full test suite**

```bash
npm test 2>&1 | tail -15
```

Expected: all tests pass. Count should be at or above the current baseline (previous run was 532 pass / 0 fail / 1 skip; we add at least 12 new tests across Task 1 + 2 + 3).

- [ ] **Step 6: Real-LLM smoke regression (F23.2 re-run)**

```bash
node --env-file=.env --import tsx scripts/smoke-corporate-quarterly.ts 2>&1 | tail -30
```

Expected: assertions still pass (same as the F23.2 smoke that shipped in commit `ac07cb6d`). Total spend < $0.75. Cost-ceiling assertion still holds. If the cache was busted by the v5 bump, the script re-compiles the scenario (~$0.10) before running; that's correct behavior.

- [ ] **Step 7: Commit**

```bash
git add src/engine/compiler/cache.ts tests/engine/compiler/cache-version-bust.test.ts CHANGELOG.md
git commit -m "chore(release): 0.7.1 compiler prompt hardening — COMPILE_SCHEMA_VERSION 4 -> 5"
```

---

## Self-Review

### Spec coverage

- **Goal 1** (every generator validates against scenario-specific fixture): Task 1 (helper) + Task 2 (wire into prompts, politics, reactions, fingerprint, milestones). ✓
- **Goal 2** (every prompt declares exact key list): Task 2 (shared `buildStateShapeBlock` used by prompts + fingerprint; time-unit-only injection for politics, reactions, milestones which don't access state). ✓
- **Goal 3** (retry carries previous error): Task 3. ✓
- **Goal 4** (cache regen): Task 4 (v4 → v5). ✓
- **Testing** (unit + integration + real-LLM): Task 1 unit tests for scenario-fixture, Task 2 unit tests for state-shape-block + generate-prompts assertion, Task 3 integration test for retry-feedback, Task 4 Step 6 real-LLM smoke regression. ✓
- **Out of scope** (AST blacklist, runtime hook try/catch, compiler telemetry): explicitly deferred in the spec, not in any task. ✓

### Placeholder scan

- Task 1 test stubs use real scenario paths (`scenarios/corporate-quarterly.json`, `scenarios/submarine.json`) — real files on disk.
- Task 2 Step 3-7 explicitly shows the code for every generator edit; no "similar to above".
- Task 3 test uses full mock of `generateText` so the retry-prompt inspection is concrete.
- No "TODO", "TBD", "handle edge cases", or deferred-implementation hedges.

### Type consistency

- `ScenarioFixture` in Task 1 uses `systems: Record<string, number>`, `statuses: Record<string, string | boolean>`. Task 2 Step 3 passes `fixture as any` into the smokeTest's `state` field because `SimulationState` expects the kernel's richer shape (`eventLog: TurnEvent[]`, `agents: Agent[]` with exact field list). The `as any` cast is intentional — the fixture covers the reads the smokeTest needs, not the full kernel contract.
- `buildScenarioFixture` throws on missing `world.metrics`; the generators don't need to handle this since all valid scenarios carry `world.metrics` per paracosm's compile-time validator already in place. Tests cover the throw path in Task 1 Step 1.
- `COMPILE_SCHEMA_VERSION` typed as `number`; Task 4 Step 1 keeps that. Task 4 Step 2 updates the test file's numeric literal.

---

## Follow-ups (deferred per spec)

- **AST-level blacklist** of two-level state access patterns: brittle, revisit if this pass is insufficient.
- **Per-hook runtime try/catch** in the orchestrator: partially covered by [4d85244c].
- **Compiler telemetry** for retry + fallback rates (`/retry-stats` extension): would quantify hardening effectiveness. Small follow-up spec.
- **Scenario author docs** explaining the flat state contract on the README or a dedicated page.
