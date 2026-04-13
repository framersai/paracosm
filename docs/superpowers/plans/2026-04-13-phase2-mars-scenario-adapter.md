# Phase 2: Mars Scenario Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all remaining inline Mars logic behind the ScenarioPackage interface so the orchestrator is scenario-agnostic.

**Architecture:** Add new hook signatures to ScenarioHooks, extract Mars fingerprint/politics/reaction logic into `src/engine/mars/` files, then rewire the orchestrator, director, departments, progression, and colonist-reactions to read from `opts.scenario` instead of hardcoded Mars imports. Standalone runners pass `marsScenario` explicitly.

**Tech Stack:** TypeScript, Node built-in test runner (`node:test`), `tsx`

**Spec:** `docs/superpowers/specs/2026-04-13-phase2-mars-scenario-adapter-design.md`

**Test command:** `cd apps/paracosm && node --import tsx --test src/**/*.test.ts src/*.test.ts`

---

## File Structure

### New files

| File | Responsibility |
|------|----------------|
| `src/engine/mars/fingerprint.ts` | Mars fingerprint classification logic |
| `src/engine/mars/fingerprint.test.ts` | Tests |
| `src/engine/mars/politics.ts` | Mars politics delta hook |
| `src/engine/mars/politics.test.ts` | Tests |
| `src/engine/mars/reactions.ts` | Mars colonist reaction context hook |
| `src/engine/mars/reactions.test.ts` | Tests |

### Modified files

| File | Change |
|------|--------|
| `src/engine/types.ts` | Add `getMilestoneCrisis`, `politicsHook` to ScenarioHooks |
| `src/engine/mars/index.ts` | Register new hooks in marsScenario |
| `src/kernel/progression.ts` | Accept optional progressionHook, remove inline Mars radiation/bone code |
| `src/kernel/progression.test.ts` | Update test to pass marsProgressionHook |
| `src/agents/orchestrator.ts` | Read everything from opts.scenario, remove all Mars imports |
| `src/agents/director.ts` | Accept instructions and milestone getter as parameters |
| `src/agents/departments.ts` | buildDepartmentContext calls scenario hook for domain lines |
| `src/agents/colonist-reactions.ts` | Accept reactionContextHook parameter |
| `src/pair-runner.ts` | Pass marsScenario |
| `src/run.ts` | Pass marsScenario |

---

## Task 1: Mars Fingerprint Hook

**Files:**
- Create: `src/engine/mars/fingerprint.ts`
- Test: `src/engine/mars/fingerprint.test.ts`

- [ ] **Step 1: Write the fingerprint test**

```typescript
// src/engine/mars/fingerprint.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { marsFingerprint } from './fingerprint.js';

test('marsFingerprint classifies high-morale colony as antifragile', () => {
  const result = marsFingerprint(
    { colony: { morale: 0.75 }, politics: { earthDependencyPct: 30 }, colonists: [{ health: { alive: true }, core: { marsborn: true } }, { health: { alive: true }, core: { marsborn: false } }] },
    [{ turn: 1, year: 2035, outcome: 'risky_success' }, { turn: 2, year: 2037, outcome: 'risky_success' }],
    { hexaco: { extraversion: 0.9, conscientiousness: 0.3 } },
    { medical: ['tool1', 'tool2', 'tool3'] },
    3,
  );
  assert.equal(result.resilience, 'antifragile');
  assert.equal(result.autonomy, 'autonomous');
  assert.equal(result.governance, 'charismatic');
  assert.equal(result.riskProfile, 'expansionist');
  assert.ok(result.summary.includes('antifragile'));
});

test('marsFingerprint classifies low-morale colony as brittle', () => {
  const result = marsFingerprint(
    { colony: { morale: 0.2 }, politics: { earthDependencyPct: 80 }, colonists: [{ health: { alive: true }, core: { marsborn: false } }] },
    [{ turn: 1, year: 2035, outcome: 'conservative_success' }, { turn: 2, year: 2037, outcome: 'conservative_success' }],
    { hexaco: { extraversion: 0.3, conscientiousness: 0.9 } },
    {},
    3,
  );
  assert.equal(result.resilience, 'brittle');
  assert.equal(result.autonomy, 'Earth-tethered');
  assert.equal(result.governance, 'technocratic');
  assert.equal(result.riskProfile, 'conservative');
  assert.equal(result.identity, 'Earth-diaspora');
});

test('marsFingerprint identity is Martian when Mars-born > 30%', () => {
  const colonists = [
    { health: { alive: true }, core: { marsborn: true } },
    { health: { alive: true }, core: { marsborn: true } },
    { health: { alive: true }, core: { marsborn: false } },
  ];
  const result = marsFingerprint(
    { colony: { morale: 0.5 }, politics: { earthDependencyPct: 50 }, colonists },
    [], { hexaco: { extraversion: 0.5, conscientiousness: 0.5 } }, {}, 3,
  );
  assert.equal(result.identity, 'Martian');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/paracosm && node --import tsx --test src/engine/mars/fingerprint.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write Mars fingerprint function**

```typescript
// src/engine/mars/fingerprint.ts

/**
 * Mars-specific timeline fingerprint classification.
 * Extracted from orchestrator.ts lines 820-843.
 */
export function marsFingerprint(
  finalState: any,
  outcomeLog: any[],
  leader: any,
  toolRegs: Record<string, string[]>,
  maxTurns: number,
): Record<string, string> {
  const riskyWins = outcomeLog.filter((o: any) => o.outcome === 'risky_success').length;
  const riskyLosses = outcomeLog.filter((o: any) => o.outcome === 'risky_failure').length;
  const conservativeWins = outcomeLog.filter((o: any) => o.outcome === 'conservative_success').length;
  const aliveCount = finalState.colonists.filter((c: any) => c.health.alive).length;
  const marsBorn = finalState.colonists.filter((c: any) => c.health.alive && c.core.marsborn).length;
  const totalTools = Object.values(toolRegs).flat().length;

  const resilience = finalState.colony.morale > 0.6 ? 'antifragile' : finalState.colony.morale > 0.35 ? 'resilient' : 'brittle';
  const autonomy = finalState.politics.earthDependencyPct < 40 ? 'autonomous' : finalState.politics.earthDependencyPct < 70 ? 'transitioning' : 'Earth-tethered';
  const governance = leader.hexaco.extraversion > 0.7 ? 'charismatic' : leader.hexaco.conscientiousness > 0.7 ? 'technocratic' : 'communal';
  const riskProfile = riskyWins + riskyLosses > conservativeWins ? 'expansionist' : 'conservative';
  const identity = marsBorn > aliveCount * 0.3 ? 'Martian' : 'Earth-diaspora';
  const innovation = totalTools > maxTurns * 2 ? 'innovative' : totalTools > maxTurns ? 'adaptive' : 'conventional';
  const summary = `${resilience} · ${autonomy} · ${governance} · ${riskProfile} · ${identity} · ${innovation}`;

  return { resilience, autonomy, governance, riskProfile, identity, innovation, summary };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/paracosm && node --import tsx --test src/engine/mars/fingerprint.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd apps/paracosm && git add src/engine/mars/fingerprint.ts src/engine/mars/fingerprint.test.ts && git commit -m "feat: extract Mars fingerprint classification into hook"
```

---

## Task 2: Mars Politics Hook

**Files:**
- Create: `src/engine/mars/politics.ts`
- Test: `src/engine/mars/politics.test.ts`

- [ ] **Step 1: Write the politics hook test**

```typescript
// src/engine/mars/politics.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { marsPoliticsHook } from './politics.js';

test('marsPoliticsHook returns success deltas for political category with success outcome', () => {
  const result = marsPoliticsHook('political', 'risky_success');
  assert.ok(result);
  assert.equal(result!.independencePressure, 0.05);
  assert.equal(result!.earthDependencyPct, -3);
});

test('marsPoliticsHook returns failure deltas for social category with failure outcome', () => {
  const result = marsPoliticsHook('social', 'risky_failure');
  assert.ok(result);
  assert.equal(result!.independencePressure, -0.03);
  assert.equal(result!.earthDependencyPct, 2);
});

test('marsPoliticsHook returns null for non-political categories', () => {
  assert.equal(marsPoliticsHook('environmental', 'risky_success'), null);
  assert.equal(marsPoliticsHook('medical', 'conservative_success'), null);
  assert.equal(marsPoliticsHook('infrastructure', 'risky_failure'), null);
});

test('marsPoliticsHook returns success deltas for conservative_success', () => {
  const result = marsPoliticsHook('political', 'conservative_success');
  assert.ok(result);
  assert.equal(result!.independencePressure, 0.05);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/paracosm && node --import tsx --test src/engine/mars/politics.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write Mars politics hook**

```typescript
// src/engine/mars/politics.ts

/**
 * Mars-specific politics delta hook.
 * Extracted from orchestrator.ts lines 710-716.
 * Returns politics deltas for political/social crises, null for others.
 */

const POLITICS_CATEGORIES = new Set(['political', 'social']);
const SUCCESS_DELTA = { independencePressure: 0.05, earthDependencyPct: -3 };
const FAILURE_DELTA = { independencePressure: -0.03, earthDependencyPct: 2 };

export function marsPoliticsHook(
  category: string,
  outcome: string,
): Record<string, number> | null {
  if (!POLITICS_CATEGORIES.has(category)) return null;
  return outcome.includes('success') ? { ...SUCCESS_DELTA } : { ...FAILURE_DELTA };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/paracosm && node --import tsx --test src/engine/mars/politics.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd apps/paracosm && git add src/engine/mars/politics.ts src/engine/mars/politics.test.ts && git commit -m "feat: extract Mars politics delta into hook"
```

---

## Task 3: Mars Reaction Context Hook

**Files:**
- Create: `src/engine/mars/reactions.ts`
- Test: `src/engine/mars/reactions.test.ts`

- [ ] **Step 1: Write the reaction context test**

```typescript
// src/engine/mars/reactions.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { marsReactionContext } from './reactions.js';

test('marsReactionContext returns Mars-born phrasing for marsborn colonist', () => {
  const c = { core: { marsborn: true } } as any;
  const ctx = { year: 2060 } as any;
  const result = marsReactionContext(c, ctx);
  assert.ok(result.includes('Mars-born'));
  assert.ok(result.includes('never seen Earth'));
});

test('marsReactionContext returns Earth-born phrasing with years on Mars', () => {
  const c = { core: { marsborn: false } } as any;
  const ctx = { year: 2060 } as any;
  const result = marsReactionContext(c, ctx);
  assert.ok(result.includes('Earth-born'));
  assert.ok(result.includes('25 years on Mars'));
});

test('marsReactionContext includes health context for low bone density', () => {
  const c = { core: { marsborn: false }, health: { boneDensityPct: 60, cumulativeRadiationMsv: 200 } } as any;
  const ctx = { year: 2060 } as any;
  const result = marsReactionContext(c, ctx);
  assert.ok(result.includes('bone density loss'));
});

test('marsReactionContext includes health context for high radiation', () => {
  const c = { core: { marsborn: false }, health: { boneDensityPct: 90, cumulativeRadiationMsv: 2000 } } as any;
  const ctx = { year: 2060 } as any;
  const result = marsReactionContext(c, ctx);
  assert.ok(result.includes('radiation exposure'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/paracosm && node --import tsx --test src/engine/mars/reactions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write Mars reaction context hook**

```typescript
// src/engine/mars/reactions.ts

/**
 * Mars-specific colonist reaction context.
 * Extracted from colonist-reactions.ts buildColonistPrompt lines 51, 67-68.
 * Returns location/identity phrasing and domain-specific health context.
 */
export function marsReactionContext(colonist: any, ctx: any): string {
  const lines: string[] = [];

  // Location/identity phrasing
  if (colonist.core.marsborn) {
    lines.push('Mars-born, never seen Earth.');
  } else {
    lines.push(`Earth-born, ${ctx.year - 2035} years on Mars.`);
  }

  // Domain-specific health context
  if (colonist.health?.boneDensityPct < 70) {
    lines.push('Suffering significant bone density loss.');
  }
  if (colonist.health?.cumulativeRadiationMsv > 1500) {
    lines.push('High cumulative radiation exposure.');
  }

  return lines.join(' ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/paracosm && node --import tsx --test src/engine/mars/reactions.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd apps/paracosm && git add src/engine/mars/reactions.ts src/engine/mars/reactions.test.ts && git commit -m "feat: extract Mars colonist reaction context into hook"
```

---

## Task 4: Update ScenarioHooks and marsScenario

**Files:**
- Modify: `src/engine/types.ts:201-208`
- Modify: `src/engine/mars/index.ts`

- [ ] **Step 1: Add new hook signatures to ScenarioHooks**

In `src/engine/types.ts`, replace the ScenarioHooks interface:

```typescript
export interface ScenarioHooks {
  progressionHook?: (ctx: ProgressionHookContext) => void;
  departmentPromptHook?: (ctx: PromptHookContext) => string[];
  directorInstructions?: () => string;
  directorPromptHook?: (ctx: any) => string;
  reactionContextHook?: (colonist: any, ctx: any) => string;
  fingerprintHook?: (finalState: any, outcomeLog: any[], leader: any, toolRegs: Record<string, string[]>, maxTurns: number) => Record<string, string>;
  getMilestoneCrisis?: (turn: number, maxTurns: number) => any | null;
  politicsHook?: (category: string, outcome: string) => Record<string, number> | null;
}
```

- [ ] **Step 2: Register new hooks in marsScenario**

In `src/engine/mars/index.ts`, add imports at the top:

```typescript
import { marsFingerprint } from './fingerprint.js';
import { marsPoliticsHook } from './politics.js';
import { marsReactionContext } from './reactions.js';
import { getMarsMilestoneCrisis } from './milestones.js';
```

Then update the `hooks` block in the `marsScenario` object:

```typescript
  hooks: {
    progressionHook: marsProgressionHook,
    departmentPromptHook: (ctx) => marsDepartmentPromptLines(ctx.department, ctx.state),
    directorInstructions: marsDirectorInstructions,
    fingerprintHook: marsFingerprint,
    politicsHook: marsPoliticsHook,
    reactionContextHook: marsReactionContext,
    getMilestoneCrisis: getMarsMilestoneCrisis,
  },
```

- [ ] **Step 3: Run engine tests**

Run: `cd apps/paracosm && node --import tsx --test src/engine/**/*.test.ts src/engine/*.test.ts`
Expected: All engine tests PASS

- [ ] **Step 4: Commit**

```bash
cd apps/paracosm && git add src/engine/types.ts src/engine/mars/index.ts && git commit -m "feat: register fingerprint, politics, reaction, and milestone hooks in marsScenario"
```

---

## Task 5: Wire Progression Hook into Kernel

**Files:**
- Modify: `src/kernel/progression.ts:128-155`
- Modify: `src/kernel/progression.test.ts`

- [ ] **Step 1: Update progressBetweenTurns signature and remove inline Mars code**

In `src/kernel/progression.ts`, replace the function signature and the "Age all colonists" section (lines 128-155):

Replace:
```typescript
export function progressBetweenTurns(
  state: SimulationState,
  yearDelta: number,
  turnRng: SeededRng,
): { state: SimulationState; events: TurnEvent[] } {
  const events: TurnEvent[] = [];
  const year = state.metadata.currentYear;
  const turn = state.metadata.currentTurn;
  let colonists = state.colonists.map(c => structuredClone(c));
  let colony = structuredClone(state.colony);

  // 1. Age all colonists and accumulate radiation
  for (const c of colonists) {
    if (!c.health.alive) continue;
    c.career.yearsExperience += yearDelta;
    c.health.cumulativeRadiationMsv += MARS_RADIATION_MSV_PER_YEAR * yearDelta;

    // Bone density loss (stabilizes after ~20 years on Mars)
    const lossRate = c.core.marsborn ? 0.003 : 0.005;
    const yearsOnMars = year - (c.core.marsborn ? c.core.birthYear : state.metadata.startYear);
    const decayFactor = Math.max(0.5, 1 - lossRate * Math.min(yearsOnMars, 20));
    c.health.boneDensityPct = Math.max(50, c.health.boneDensityPct * decayFactor);

    // Earth contacts decay
    if (c.social.earthContacts > 0 && turnRng.chance(0.15 * yearDelta)) {
      c.social.earthContacts = Math.max(0, c.social.earthContacts - 1);
    }
  }
```

With:
```typescript
export function progressBetweenTurns(
  state: SimulationState,
  yearDelta: number,
  turnRng: SeededRng,
  progressionHook?: (ctx: { colonists: any[]; yearDelta: number; year: number; turn: number; rng: any }) => void,
): { state: SimulationState; events: TurnEvent[] } {
  const events: TurnEvent[] = [];
  const year = state.metadata.currentYear;
  const turn = state.metadata.currentTurn;
  let colonists = state.colonists.map(c => structuredClone(c));
  let colony = structuredClone(state.colony);

  // 1. Age all colonists (generic: experience, earth contacts)
  for (const c of colonists) {
    if (!c.health.alive) continue;
    c.career.yearsExperience += yearDelta;

    // Earth contacts decay
    if (c.social.earthContacts > 0 && turnRng.chance(0.15 * yearDelta)) {
      c.social.earthContacts = Math.max(0, c.social.earthContacts - 1);
    }
  }

  // 1b. Scenario-specific progression (radiation, bone density, etc.)
  if (progressionHook) {
    progressionHook({ colonists, yearDelta, year, turn, rng: turnRng });
  }
```

Also remove the `MARS_RADIATION_MSV_PER_YEAR` constant at the top of the file (line 5):
```typescript
const MARS_RADIATION_MSV_PER_YEAR = 0.67 * 365; // ~244.55 mSv/year
```

- [ ] **Step 2: Update the progression test to pass marsProgressionHook**

Replace the entire content of `src/kernel/progression.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { SeededRng } from './rng.js';
import { progressBetweenTurns } from './progression.js';
import { marsProgressionHook } from '../engine/mars/progression-hooks.js';

const makeState = (overrides: any = {}) => ({
  metadata: {
    simulationId: 'sim-1', leaderId: 'Commander', seed: 950,
    startYear: 2042, currentYear: 2043, currentTurn: 1,
  },
  colony: {
    population: 1, powerKw: 400, foodMonthsReserve: 18,
    waterLitersPerDay: 800, pressurizedVolumeM3: 3000,
    lifeSupportCapacity: 120, infrastructureModules: 3,
    scienceOutput: 0, morale: 0.85,
  },
  colonists: [{
    core: { id: 'col-1', name: 'Alex Rivera', birthYear: 2020, marsborn: false, department: 'science', role: 'Analyst' },
    hexaco: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5 },
    hexacoHistory: [],
    health: { alive: true, cumulativeRadiationMsv: 0, boneDensityPct: 100, psychScore: 0.8, conditions: [] },
    career: { yearsExperience: 2, specialization: 'Operations', rank: 'junior', achievements: [] },
    social: { earthContacts: 2, childrenIds: [], friendIds: [] },
    narrative: { featured: false, lifeEvents: [] },
  }],
  politics: { earthDependencyPct: 95, governanceStatus: 'earth-governed', independencePressure: 0.05 },
  eventLog: [],
  ...overrides,
});

test('progressBetweenTurns with Mars hook applies radiation and bone density', () => {
  const { state } = progressBetweenTurns(makeState() as any, 1, new SeededRng(950), marsProgressionHook);
  assert.equal(state.colonists[0].health.boneDensityPct, 99.5);
  assert.ok(state.colonists[0].health.cumulativeRadiationMsv > 200);
});

test('progressBetweenTurns without hook does not apply radiation or bone density', () => {
  const { state } = progressBetweenTurns(makeState() as any, 1, new SeededRng(950));
  assert.equal(state.colonists[0].health.boneDensityPct, 100);
  assert.equal(state.colonists[0].health.cumulativeRadiationMsv, 0);
});

test('progressBetweenTurns still ages colonists and progresses careers without hook', () => {
  const { state } = progressBetweenTurns(makeState() as any, 1, new SeededRng(950));
  assert.equal(state.colonists[0].career.yearsExperience, 3); // 2 + 1 yearDelta
});
```

- [ ] **Step 3: Run progression tests**

Run: `cd apps/paracosm && node --import tsx --test src/kernel/progression.test.ts`
Expected: 3 tests PASS

- [ ] **Step 4: Commit**

```bash
cd apps/paracosm && git add src/kernel/progression.ts src/kernel/progression.test.ts && git commit -m "refactor: progressBetweenTurns accepts optional progression hook, remove inline Mars code"
```

---

## Task 6: Wire Director to Accept Instructions and Milestones

**Files:**
- Modify: `src/agents/director.ts`

- [ ] **Step 1: Update CrisisDirector.generateCrisis to accept instructions parameter**

In `src/agents/director.ts`, change the `generateCrisis` method signature from:

```typescript
  async generateCrisis(ctx: DirectorContext, provider: LlmProvider = 'openai', model: string = 'gpt-5.4'): Promise<DirectorCrisis> {
    const prompt = buildDirectorPrompt(ctx);

    try {
      const { generateText } = await import('@framers/agentos');
      const result = await generateText({
        provider,
        model,
        prompt: DIRECTOR_INSTRUCTIONS + '\n\n' + prompt,
      });
```

To:

```typescript
  async generateCrisis(ctx: DirectorContext, provider: LlmProvider = 'openai', model: string = 'gpt-5.4', instructions?: string): Promise<DirectorCrisis> {
    const prompt = buildDirectorPrompt(ctx);
    const systemInstructions = instructions || DIRECTOR_INSTRUCTIONS;

    try {
      const { generateText } = await import('@framers/agentos');
      const result = await generateText({
        provider,
        model,
        prompt: systemInstructions + '\n\n' + prompt,
      });
```

- [ ] **Step 2: Run all tests to confirm no regression**

Run: `cd apps/paracosm && node --import tsx --test src/**/*.test.ts src/*.test.ts`
Expected: All tests PASS (the parameter is optional so nothing breaks)

- [ ] **Step 3: Commit**

```bash
cd apps/paracosm && git add src/agents/director.ts && git commit -m "refactor: CrisisDirector.generateCrisis accepts optional instructions parameter"
```

---

## Task 7: Wire Department Context to Accept Scenario Hook

**Files:**
- Modify: `src/agents/departments.ts`

- [ ] **Step 1: Update buildDepartmentContext to accept an optional prompt hook**

In `src/agents/departments.ts`, change the `buildDepartmentContext` function signature to accept a prompt hook, and replace the switch block with a hook call when provided. Replace the entire function (starting at line 78):

Replace:
```typescript
export function buildDepartmentContext(
  dept: Department,
  state: SimulationState,
  scenario: Scenario,
  researchPacket: CrisisResearchPacket,
  previousTurns?: DepartmentTurnMemory[],
): string {
```

With:
```typescript
export function buildDepartmentContext(
  dept: Department,
  state: SimulationState,
  scenario: Scenario,
  researchPacket: CrisisResearchPacket,
  previousTurns?: DepartmentTurnMemory[],
  departmentPromptHook?: (ctx: { department: string; state: SimulationState; scenario: Scenario; researchPacket: CrisisResearchPacket }) => string[],
): string {
```

Then replace the switch block (lines 131-156) with:

Replace:
```typescript
  switch (dept) {
    case 'medical': {
      const avgRad = alive.reduce((s, c) => s + c.health.cumulativeRadiationMsv, 0) / alive.length;
      const avgBone = alive.reduce((s, c) => s + c.health.boneDensityPct, 0) / alive.length;
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
      const avgPsych = alive.reduce((s, c) => s + c.health.psychScore, 0) / alive.length;
      const depressed = alive.filter(c => c.health.psychScore < 0.5).length;
      lines.push('PSYCH:', `Morale: ${Math.round(state.colony.morale * 100)}% | Avg psych: ${avgPsych.toFixed(2)} | Depressed: ${depressed}/${alive.length} | Mars-born: ${alive.filter(c => c.core.marsborn).length}`);
      lines.push('', 'SOCIAL:', ...featured.slice(0, 4).map(c => `- ${c.core.name}: psych ${c.health.psychScore.toFixed(2)} partner:${c.social.partnerId ? 'y' : 'n'} children:${c.social.childrenIds.length} earthContacts:${c.social.earthContacts}`));
      break;
    }
    case 'governance':
      lines.push('POLITICS:', `Earth dep: ${state.politics.earthDependencyPct}% | Status: ${state.politics.governanceStatus} | Independence pressure: ${(state.politics.independencePressure * 100).toFixed(0)}% | Mars-born: ${alive.filter(c => c.core.marsborn).length}/${alive.length}`);
      break;
  }
```

With:
```typescript
  // Domain-specific department context: from scenario hook or fallback
  if (departmentPromptHook) {
    const hookLines = departmentPromptHook({ department: dept, state, scenario, researchPacket });
    lines.push(...hookLines);
  }
```

- [ ] **Step 2: Run all tests**

Run: `cd apps/paracosm && node --import tsx --test src/**/*.test.ts src/*.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
cd apps/paracosm && git add src/agents/departments.ts && git commit -m "refactor: buildDepartmentContext accepts optional scenario prompt hook"
```

---

## Task 8: Wire Colonist Reactions to Accept Context Hook

**Files:**
- Modify: `src/agents/colonist-reactions.ts`

- [ ] **Step 1: Update generateColonistReactions and buildColonistPrompt**

In `src/agents/colonist-reactions.ts`, update the options type and the `buildColonistPrompt` function.

Change the `generateColonistReactions` signature (line 125-129):

Replace:
```typescript
export async function generateColonistReactions(
  colonists: Colonist[],
  ctx: ReactionContext,
  options: { provider?: string; model?: string; maxConcurrent?: number } = {},
): Promise<ColonistReaction[]> {
```

With:
```typescript
export async function generateColonistReactions(
  colonists: Colonist[],
  ctx: ReactionContext,
  options: { provider?: string; model?: string; maxConcurrent?: number; reactionContextHook?: (colonist: any, ctx: any) => string } = {},
): Promise<ColonistReaction[]> {
```

Then in `buildColonistPrompt` (line 48), add a `reactionContextHook` parameter:

Replace:
```typescript
function buildColonistPrompt(c: Colonist, ctx: ReactionContext): string {
  const age = ctx.year - c.core.birthYear;
  const h = c.hexaco;
  const marsborn = c.core.marsborn ? 'Mars-born, never seen Earth.' : `Earth-born, ${ctx.year - 2035} years on Mars.`;
```

With:
```typescript
function buildColonistPrompt(c: Colonist, ctx: ReactionContext, reactionContextHook?: (colonist: any, ctx: any) => string): string {
  const age = ctx.year - c.core.birthYear;
  const h = c.hexaco;
  const marsborn = reactionContextHook ? reactionContextHook(c, ctx) : (c.core.marsborn ? 'Mars-born, never seen Earth.' : `Earth-born, ${ctx.year - 2035} years on Mars.`);
```

And update the call inside `generateColonistReactions` (around line 145) to pass the hook:

Replace:
```typescript
          const prompt = buildColonistPrompt(c, ctx);
```

With:
```typescript
          const prompt = buildColonistPrompt(c, ctx, options.reactionContextHook);
```

- [ ] **Step 2: Run all tests**

Run: `cd apps/paracosm && node --import tsx --test src/**/*.test.ts src/*.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
cd apps/paracosm && git add src/agents/colonist-reactions.ts && git commit -m "refactor: colonist reactions accept optional scenario context hook"
```

---

## Task 9: Rewire Orchestrator to Use ScenarioPackage

This is the big task. The orchestrator switches from direct Mars imports to reading from `opts.scenario`.

**Files:**
- Modify: `src/agents/orchestrator.ts`

- [ ] **Step 1: Update imports — remove Mars-specific, add scenario**

Replace the import block at the top (lines 1-34):

Replace:
```typescript
import { DEPARTMENT_CONFIGS, buildDepartmentContext, getDepartmentsForTurn } from './departments.js';
import { CrisisDirector, type DirectorCrisis, type DirectorContext } from './director.js';
import { generateColonistReactions } from './colonist-reactions.js';
```

With:
```typescript
import { buildDepartmentContext, getDepartmentsForTurn } from './departments.js';
import { CrisisDirector, type DirectorCrisis, type DirectorContext } from './director.js';
import { generateColonistReactions } from './colonist-reactions.js';
import type { ScenarioPackage } from '../engine/types.js';
```

And replace:
```typescript
import { EffectRegistry } from '../engine/effect-registry.js';
import { MARS_CATEGORY_EFFECTS, MARS_FALLBACK_EFFECT, MARS_POLITICS_CATEGORIES, MARS_POLITICS_SUCCESS_DELTA, MARS_POLITICS_FAILURE_DELTA } from '../engine/mars/effects.js';
```

With:
```typescript
import { EffectRegistry } from '../engine/effect-registry.js';
import { marsScenario } from '../engine/mars/index.js';
```

- [ ] **Step 2: Add scenario to RunOptions and resolve it in runSimulation**

Add `scenario?: ScenarioPackage;` to the `RunOptions` interface (after line 344):

```typescript
export interface RunOptions {
  maxTurns?: number;
  seed?: number;
  startYear?: number;
  liveSearch?: boolean;
  activeDepartments?: Department[];
  provider?: LlmProvider;
  onEvent?: (event: SimEvent) => void;
  customEvents?: Array<{ turn: number; title: string; description: string }>;
  models?: Partial<SimulationModelConfig>;
  initialPopulation?: number;
  startingResources?: StartingResources;
  startingPolitics?: StartingPolitics;
  execution?: Partial<SimulationExecutionConfig>;
  scenario?: ScenarioPackage;
}
```

Then at the top of `runSimulation`, after `const provider = ...` (line 351), add:

```typescript
  const sc = opts.scenario ?? marsScenario;
```

- [ ] **Step 3: Replace session ID prefix**

Replace line 352:
```typescript
  const sid = `mars-v2-${leader.archetype.toLowerCase().replace(/\s+/g, '-')}`;
```

With:
```typescript
  const sid = `${sc.labels.shortName}-v2-${leader.archetype.toLowerCase().replace(/\s+/g, '-')}`;
```

- [ ] **Step 4: Replace console banner**

Replace lines 358-362:
```typescript
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  MARS GENESIS v2`);
  console.log(`  Commander: ${leader.name} — "${leader.archetype}"`);
  console.log(`  Turns: ${maxTurns} | Live search: ${opts.liveSearch ? 'yes' : 'no'}`);
  console.log(`${'═'.repeat(60)}\n`);
```

With:
```typescript
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${sc.labels.name.toUpperCase()} v2`);
  console.log(`  Commander: ${leader.name} — "${leader.archetype}"`);
  console.log(`  Turns: ${maxTurns} | Live search: ${opts.liveSearch ? 'yes' : 'no'}`);
  console.log(`${'═'.repeat(60)}\n`);
```

- [ ] **Step 5: Replace department configs with scenario departments**

Replace the department config lookup (lines 391-396 and 441-448). The promotionDepts and roleNames should come from the scenario:

Replace:
```typescript
  const promotionDepts: Department[] = ['medical', 'engineering', 'agriculture', 'psychology', 'governance'];
  const roleNames: Record<string, string> = {
    medical: 'Chief Medical Officer', engineering: 'Chief Engineer',
    agriculture: 'Head of Agriculture', psychology: 'Colony Psychologist',
    governance: 'Governance Advisor',
  };
```

With:
```typescript
  const promotionDepts: Department[] = sc.departments.map(d => d.id as Department);
  const roleNames: Record<string, string> = Object.fromEntries(sc.departments.map(d => [d.id, d.role]));
```

And replace the DEPARTMENT_CONFIGS lookup (line 441):
```typescript
    const cfg = DEPARTMENT_CONFIGS.find(c => c.department === dept);
    if (!cfg) continue;
```

With:
```typescript
    const cfg = sc.departments.find(c => c.id === dept);
    if (!cfg) continue;
```

And update the agent creation (lines 445-450):
```typescript
    const a = agent({
      provider,
      model: modelConfig.departments || cfg.model,
      instructions: cfg.instructions,
```

With:
```typescript
    const a = agent({
      provider,
      model: modelConfig.departments || cfg.defaultModel,
      instructions: cfg.instructions,
```

- [ ] **Step 6: Replace EffectRegistry initialization with scenario effects**

Replace line 464:
```typescript
  const effectRegistry = new EffectRegistry(MARS_CATEGORY_EFFECTS, MARS_FALLBACK_EFFECT);
```

With:
```typescript
  const effectRegistry = new EffectRegistry(sc.effects[0]?.categoryDefaults ?? {});
```

- [ ] **Step 7: Replace milestone crisis lookup with scenario hook**

Replace lines 474-476:
```typescript
    const milestone = director.getMilestoneCrisis(turn, maxTurns);
    if (milestone) {
      crisis = milestone;
```

With:
```typescript
    const milestone = sc.hooks.getMilestoneCrisis?.(turn, maxTurns);
    if (milestone) {
      crisis = milestone as DirectorCrisis;
```

- [ ] **Step 8: Pass director instructions from scenario**

Replace line 496 (the generateCrisis call):
```typescript
      crisis = await director.generateCrisis(dirCtx, provider, modelConfig.director);
```

With:
```typescript
      const dirInstructions = sc.hooks.directorInstructions?.();
      crisis = await director.generateCrisis(dirCtx, provider, modelConfig.director, dirInstructions);
```

- [ ] **Step 9: Pass department prompt hook to buildDepartmentContext**

Replace line 569:
```typescript
      const ctx = buildDepartmentContext(dept, state, scenario, packet, deptMemory.get(dept));
```

With:
```typescript
      const ctx = buildDepartmentContext(dept, state, scenario, packet, deptMemory.get(dept), sc.hooks.departmentPromptHook);
```

- [ ] **Step 10: Replace politics deltas with scenario hook**

Replace lines 710-716:
```typescript
    // Apply politics deltas for political/governance crises
    if (MARS_POLITICS_CATEGORIES.has(crisis.category)) {
      const polDelta = outcome.includes('success')
        ? MARS_POLITICS_SUCCESS_DELTA
        : MARS_POLITICS_FAILURE_DELTA;
      kernel.applyPoliticsDeltas(polDelta);
    }
```

With:
```typescript
    // Apply politics deltas via scenario hook
    const polDelta = sc.hooks.politicsHook?.(crisis.category, outcome);
    if (polDelta) {
      kernel.applyPoliticsDeltas(polDelta);
    }
```

- [ ] **Step 11: Pass progression hook to advanceTurn**

In the kernel's `advanceTurn` call, we need to pass the progression hook. But `advanceTurn` calls `progressBetweenTurns` internally. We need to update the kernel to accept and pass through the hook. 

Actually, looking at the code more carefully, `kernel.advanceTurn` calls `progressBetweenTurns` on line 140 of `kernel.ts`. We need to thread the hook through. Update `SimulationKernel.advanceTurn` in `src/kernel/kernel.ts`:

Replace:
```typescript
  advanceTurn(nextTurn: number, nextYear: number): SimulationState {
```

With:
```typescript
  advanceTurn(nextTurn: number, nextYear: number, progressionHook?: (ctx: { colonists: any[]; yearDelta: number; year: number; turn: number; rng: any }) => void): SimulationState {
```

And replace the `progressBetweenTurns` call inside (line 140 of kernel.ts):
```typescript
    const { state: progressed, events } = progressBetweenTurns(this.state, yearDelta, turnRng);
```

With:
```typescript
    const { state: progressed, events } = progressBetweenTurns(this.state, yearDelta, turnRng, progressionHook);
```

Then in the orchestrator, update the advanceTurn call (line ~505):
```typescript
    const state = kernel.advanceTurn(turn, year);
```

With:
```typescript
    const state = kernel.advanceTurn(turn, year, sc.hooks.progressionHook);
```

- [ ] **Step 12: Pass reaction context hook to generateColonistReactions**

Replace lines 753-755:
```typescript
      const reactions = await generateColonistReactions(
        kernel.getState().colonists, reactionCtx,
        { provider, model: modelConfig.colonistReactions || 'gpt-4o-mini', maxConcurrent: 25 },
```

With:
```typescript
      const reactions = await generateColonistReactions(
        kernel.getState().colonists, reactionCtx,
        { provider, model: modelConfig.colonistReactions || 'gpt-4o-mini', maxConcurrent: 25, reactionContextHook: sc.hooks.reactionContextHook },
```

- [ ] **Step 13: Replace fingerprint with scenario hook**

Replace lines 820-843:
```typescript
  // Compute timeline fingerprint: classify the colony based on final state
  const riskyWins = outcomeLog.filter(o => o.outcome === 'risky_success').length;
  const riskyLosses = outcomeLog.filter(o => o.outcome === 'risky_failure').length;
  const conservativeWins = outcomeLog.filter(o => o.outcome === 'conservative_success').length;
  const aliveCount = final.colonists.filter(c => c.health.alive).length;
  const marsBorn = final.colonists.filter(c => c.health.alive && c.core.marsborn).length;

  const fingerprint = {
    // Resilience: high morale + survived losses = antifragile; low morale = brittle
    resilience: final.colony.morale > 0.6 ? 'antifragile' : final.colony.morale > 0.35 ? 'resilient' : 'brittle',
    // Autonomy: low earth dependency = autonomous
    autonomy: final.politics.earthDependencyPct < 40 ? 'autonomous' : final.politics.earthDependencyPct < 70 ? 'transitioning' : 'Earth-tethered',
    // Governance style: based on commander personality
    governance: leader.hexaco.extraversion > 0.7 ? 'charismatic' : leader.hexaco.conscientiousness > 0.7 ? 'technocratic' : 'communal',
    // Risk profile: based on actual outcomes
    riskProfile: riskyWins + riskyLosses > conservativeWins ? 'expansionist' : 'conservative',
    // Identity: Mars-born majority = Martian identity
    identity: marsBorn > aliveCount * 0.3 ? 'Martian' : 'Earth-diaspora',
    // Innovation: tools forged as a measure
    innovation: Object.values(toolRegs).flat().length > maxTurns * 2 ? 'innovative' : Object.values(toolRegs).flat().length > maxTurns ? 'adaptive' : 'conventional',
    // Summary line
    summary: '',
  };
  fingerprint.summary = `${fingerprint.resilience} · ${fingerprint.autonomy} · ${fingerprint.governance} · ${fingerprint.riskProfile} · ${fingerprint.identity} · ${fingerprint.innovation}`;
```

With:
```typescript
  // Compute timeline fingerprint via scenario hook
  const fingerprint = sc.hooks.fingerprintHook
    ? sc.hooks.fingerprintHook(final, outcomeLog, leader, toolRegs, maxTurns)
    : { summary: 'no fingerprint hook' };
```

- [ ] **Step 14: Replace output simulation name with scenario ID**

Replace line 845:
```typescript
    simulation: 'mars-genesis-v3', leader: { name: leader.name, archetype: leader.archetype, colony: leader.colony, hexaco: leader.hexaco },
```

With:
```typescript
    simulation: `${sc.id}-v3`, leader: { name: leader.name, archetype: leader.archetype, colony: leader.colony, hexaco: leader.hexaco },
```

- [ ] **Step 15: Run all tests**

Run: `cd apps/paracosm && node --import tsx --test src/**/*.test.ts src/*.test.ts`
Expected: All tests PASS

- [ ] **Step 16: Commit**

```bash
cd apps/paracosm && git add src/agents/orchestrator.ts src/kernel/kernel.ts && git commit -m "refactor: orchestrator reads all domain logic from ScenarioPackage, zero direct Mars imports"
```

---

## Task 10: Update Standalone Runners

**Files:**
- Modify: `src/run.ts`
- Modify: `src/pair-runner.ts`

- [ ] **Step 1: Update run.ts to pass marsScenario**

In `src/run.ts`, add import:

```typescript
import { marsScenario } from './engine/mars/index.js';
```

Then update the `runSimulation` call (line 96):

Replace:
```typescript
runSimulation(leader, DEFAULT_KEY_PERSONNEL, { seed: 950, ...cliOptions }).catch((err) => {
```

With:
```typescript
runSimulation(leader, DEFAULT_KEY_PERSONNEL, { seed: 950, ...cliOptions, scenario: marsScenario }).catch((err) => {
```

- [ ] **Step 2: Update pair-runner.ts to pass marsScenario**

In `src/pair-runner.ts`, add import:

```typescript
import { marsScenario } from './engine/mars/index.js';
```

Then update the `runSimulation` call (line 28-42), adding `scenario: marsScenario` to the options:

Replace:
```typescript
    return runSimulation(leader, simConfig.keyPersonnel ?? DEFAULT_KEY_PERSONNEL, {
      maxTurns: turns,
      seed,
      startYear,
      liveSearch,
      activeDepartments: simConfig.activeDepartments,
      onEvent,
      customEvents,
      provider: simConfig.provider,
      models: simConfig.models,
      initialPopulation: simConfig.initialPopulation,
      startingResources: simConfig.startingResources,
      startingPolitics: simConfig.startingPolitics,
      execution: simConfig.execution,
    }).then(
```

With:
```typescript
    return runSimulation(leader, simConfig.keyPersonnel ?? DEFAULT_KEY_PERSONNEL, {
      maxTurns: turns,
      seed,
      startYear,
      liveSearch,
      activeDepartments: simConfig.activeDepartments,
      onEvent,
      customEvents,
      provider: simConfig.provider,
      models: simConfig.models,
      initialPopulation: simConfig.initialPopulation,
      startingResources: simConfig.startingResources,
      startingPolitics: simConfig.startingPolitics,
      execution: simConfig.execution,
      scenario: marsScenario,
    }).then(
```

- [ ] **Step 3: Run all tests**

Run: `cd apps/paracosm && node --import tsx --test src/**/*.test.ts src/*.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
cd apps/paracosm && git add src/run.ts src/pair-runner.ts && git commit -m "refactor: standalone runners pass marsScenario explicitly"
```

---

## Task 11: Phase 2 Integration Test

**Files:**
- Modify: `src/engine/integration.test.ts`

- [ ] **Step 1: Add Phase 2 integration tests**

Append to `src/engine/integration.test.ts`:

```typescript
import { marsFingerprint } from './mars/fingerprint.js';
import { marsPoliticsHook } from './mars/politics.js';
import { marsReactionContext } from './mars/reactions.js';

test('marsScenario hooks are all registered', () => {
  assert.ok(marsScenario.hooks.progressionHook, 'progressionHook');
  assert.ok(marsScenario.hooks.departmentPromptHook, 'departmentPromptHook');
  assert.ok(marsScenario.hooks.directorInstructions, 'directorInstructions');
  assert.ok(marsScenario.hooks.fingerprintHook, 'fingerprintHook');
  assert.ok(marsScenario.hooks.politicsHook, 'politicsHook');
  assert.ok(marsScenario.hooks.reactionContextHook, 'reactionContextHook');
  assert.ok(marsScenario.hooks.getMilestoneCrisis, 'getMilestoneCrisis');
});

test('marsScenario.hooks.fingerprintHook produces valid fingerprint', () => {
  const fp = marsScenario.hooks.fingerprintHook!(
    { colony: { morale: 0.7 }, politics: { earthDependencyPct: 50 }, colonists: [{ health: { alive: true }, core: { marsborn: false } }] },
    [{ turn: 1, year: 2035, outcome: 'conservative_success' }],
    { hexaco: { extraversion: 0.5, conscientiousness: 0.5 } },
    {}, 3,
  );
  assert.ok(fp.resilience);
  assert.ok(fp.summary);
});

test('marsScenario.hooks.politicsHook returns deltas for political category', () => {
  const delta = marsScenario.hooks.politicsHook!('political', 'risky_success');
  assert.ok(delta);
  assert.ok('independencePressure' in delta!);
});

test('marsScenario.hooks.politicsHook returns null for non-political category', () => {
  const delta = marsScenario.hooks.politicsHook!('environmental', 'risky_success');
  assert.equal(delta, null);
});

test('marsScenario.hooks.reactionContextHook returns Mars-born phrasing', () => {
  const ctx = marsScenario.hooks.reactionContextHook!({ core: { marsborn: true } }, { year: 2060 });
  assert.ok(ctx.includes('Mars-born'));
});

test('marsScenario.hooks.getMilestoneCrisis returns Landfall for turn 1', () => {
  const crisis = marsScenario.hooks.getMilestoneCrisis!(1, 12);
  assert.ok(crisis);
  assert.equal(crisis.title, 'Landfall');
});
```

- [ ] **Step 2: Run full test suite**

Run: `cd apps/paracosm && node --import tsx --test src/**/*.test.ts src/*.test.ts`
Expected: All tests PASS (~92 total)

- [ ] **Step 3: Commit**

```bash
cd apps/paracosm && git add src/engine/integration.test.ts && git commit -m "test: Phase 2 integration tests for all scenario hooks"
```

---

## Summary

| Coupling Point | Before | After |
|---|---|---|
| Director instructions | Hardcoded `DIRECTOR_INSTRUCTIONS` | `sc.hooks.directorInstructions()` |
| Milestone crises | `director.getMilestoneCrisis()` with imported SCENARIOS | `sc.hooks.getMilestoneCrisis()` |
| Department configs | `DEPARTMENT_CONFIGS` import | `sc.departments` |
| Department context switch | Hardcoded medical/engineering/etc blocks | `sc.hooks.departmentPromptHook()` |
| Progression | Inline Mars radiation/bone density | `sc.hooks.progressionHook` via `advanceTurn` |
| Fingerprint | Hardcoded Mars classification | `sc.hooks.fingerprintHook()` |
| Politics deltas | `MARS_POLITICS_CATEGORIES` / `MARS_POLITICS_*_DELTA` | `sc.hooks.politicsHook()` |
| Reaction phrasing | Hardcoded "Mars-born" | `sc.hooks.reactionContextHook()` |
| Effect registry | `MARS_CATEGORY_EFFECTS` import | `sc.effects[0].categoryDefaults` |
| Session ID | `mars-v2-...` | `${sc.labels.shortName}-v2-...` |
| Output name | `mars-genesis-v3` | `${sc.id}-v3` |
