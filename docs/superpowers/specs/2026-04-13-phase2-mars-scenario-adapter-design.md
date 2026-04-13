# Phase 2: Mars Scenario Adapter Design

**Date:** 2026-04-13
**Status:** Ready for implementation plan
**Scope:** Move remaining inline Mars logic behind the `ScenarioPackage` interface. After this phase, the orchestrator is scenario-agnostic: it receives a scenario and runs it. Mars becomes a consumer.
**Depends on:** Phase 1 (internal abstraction seams), completed and merged.

---

## 1. Goal

Make `runSimulation()` scenario-agnostic. Every Mars-specific behavior in the orchestrator, director, departments, progression, colonist reactions, and fingerprinting reads from `ScenarioPackage` hooks and data instead of hardcoded Mars constants.

After this phase, a developer can pass a different `ScenarioPackage` to `runSimulation()` and get a working simulation with different domain logic, without editing any engine file.

---

## 2. Constraints

- No file moves or renames. Files stay where they are.
- No kernel type renames (`Colonist`, `ColonySystems`, `ColonyPolitics` stay). That is Phase 4.
- No dashboard changes. That is Phase 3.
- `npm run dashboard` launches Mars identically. Behavioral parity for fixed seed.
- All 72 existing tests continue to pass.
- Standalone runners (`run.ts`, `run-a.ts`, `run-b.ts`) continue to work by passing `marsScenario`.

---

## 3. Coupling Points

Seven Mars-specific coupling points remain in the engine after Phase 1.

### 3.1 `runSimulation()` has no scenario parameter

`RunOptions` does not accept a `ScenarioPackage`. The orchestrator imports Mars data directly.

**Fix:** Add `scenario?: ScenarioPackage` to `RunOptions`. Default to `marsScenario` import for backward compat. All internal reads switch from direct Mars imports to `opts.scenario`.

### 3.2 Director instructions are hardcoded

`CrisisDirector` has a `DIRECTOR_INSTRUCTIONS` constant with Mars-specific crisis categories, department names, and science references. `getMilestoneCrisis()` imports `SCENARIOS` directly for turn 1 and final turn.

**Fix:**
- `generateCrisis()` accepts an `instructions` string parameter. The orchestrator passes `scenario.hooks.directorInstructions()`.
- `getMilestoneCrisis()` is replaced by a call to a milestone getter function passed in from the scenario. Add `getMilestoneCrisis?: (turn: number, maxTurns: number) => DirectorCrisis | null` to `ScenarioHooks`. Mars provides `getMarsMilestoneCrisis` from Phase 1.

### 3.3 Department configs and context are Mars-hardcoded

`DEPARTMENT_CONFIGS` in `departments.ts` contains Mars-specific role instructions (radiation, bone density, hydroponics, etc.). `buildDepartmentContext()` has a switch block with Mars-specific stat lines per department.

**Fix:**
- The orchestrator reads department configs from `scenario.departments` instead of importing `DEPARTMENT_CONFIGS`.
- `buildDepartmentContext()` calls `scenario.hooks.departmentPromptHook()` for the domain-specific lines instead of the hardcoded switch. The common context (turn header, research, colony summary, HEXACO profile, memory block) stays in the generic function. Only the department-specific stat block comes from the hook.

### 3.4 Progression applies Mars radiation and bone density unconditionally

`progressBetweenTurns()` in `kernel/progression.ts` applies Mars radiation accumulation and bone density loss to every colonist every turn. This is Mars-specific biology that should not apply to a corporate sim or lunar outpost with different environmental hazards.

**Fix:** `progressBetweenTurns()` accepts an optional `progressionHook?: (ctx: ProgressionHookContext) => void` parameter. Default is a no-op. The orchestrator passes `scenario.hooks.progressionHook`. The inline Mars radiation/bone code in `progressBetweenTurns()` is removed; the identical logic already exists in `src/engine/mars/progression-hooks.ts` from Phase 1.

### 3.5 Fingerprinting is Mars-specific

The fingerprint block in the orchestrator (lines 820-843) computes `resilience`, `autonomy`, `governance`, `riskProfile`, `identity`, and `innovation` using Mars-specific concepts (`earthDependencyPct`, `marsBorn`, Mars-born identity thresholds).

**Fix:** Move to `scenario.hooks.fingerprintHook()`. Create `src/engine/mars/fingerprint.ts` with the extracted Mars fingerprint logic. The orchestrator calls the hook and falls back to a minimal generic fingerprint if the hook is absent.

### 3.6 Politics deltas are Mars-specific

The orchestrator applies independence pressure and Earth dependency deltas for political/social crises. This is Mars colony politics, not generic simulation behavior.

**Fix:** Add `politicsHook?: (category: string, outcome: string) => Record<string, number> | null` to `ScenarioHooks`. Mars provides the existing logic. The orchestrator calls the hook; if it returns null or is absent, no politics deltas are applied.

### 3.7 Colonist reaction prompts are Mars-specific

`buildColonistPrompt()` in `colonist-reactions.ts` hardcodes "Mars-born, never seen Earth" and "years on Mars" phrasing, plus radiation/bone-density health context.

**Fix:** `generateColonistReactions()` accepts a `reactionContextHook` parameter. When present, it calls `scenario.hooks.reactionContextHook(colonist, ctx)` to get the location/identity/health phrasing. When absent, falls back to a generic phrasing. Mars provides the Mars-born/radiation/bone-density context.

---

## 4. New Types and Hook Additions

### 4.1 ScenarioHooks additions

```typescript
interface ScenarioHooks {
  // Existing from Phase 1:
  progressionHook?: (ctx: ProgressionHookContext) => void;
  departmentPromptHook?: (ctx: PromptHookContext) => string[];
  directorInstructions?: () => string;
  
  // New in Phase 2:
  getMilestoneCrisis?: (turn: number, maxTurns: number) => DirectorCrisis | null;
  fingerprintHook?: (finalState: any, outcomeLog: any[], leader: any, toolRegs: Record<string, string[]>, maxTurns: number) => Record<string, string>;
  politicsHook?: (category: string, outcome: string) => Record<string, number> | null;
  reactionContextHook?: (colonist: any, ctx: any) => string;
}
```

### 4.2 RunOptions addition

```typescript
interface RunOptions {
  // ... existing fields ...
  scenario?: ScenarioPackage;
}
```

---

## 5. New Files

| File | Purpose |
|------|---------|
| `src/engine/mars/fingerprint.ts` | Mars fingerprint logic extracted from orchestrator |
| `src/engine/mars/fingerprint.test.ts` | Tests for Mars fingerprint |
| `src/engine/mars/politics.ts` | Mars politics delta hook |
| `src/engine/mars/politics.test.ts` | Tests for Mars politics hook |
| `src/engine/mars/reactions.ts` | Mars colonist reaction context hook |
| `src/engine/mars/reactions.test.ts` | Tests for Mars reaction hook |

---

## 6. Modified Files

| File | Change |
|------|--------|
| `src/engine/types.ts` | Add new hook signatures to `ScenarioHooks` |
| `src/engine/mars/index.ts` | Register new hooks in `marsScenario` |
| `src/agents/orchestrator.ts` | Read all Mars data from `opts.scenario` instead of direct imports |
| `src/agents/director.ts` | Accept `instructions` and milestone getter as parameters |
| `src/agents/departments.ts` | `buildDepartmentContext` calls scenario hook for domain lines |
| `src/agents/colonist-reactions.ts` | Accept reaction context hook parameter |
| `src/kernel/progression.ts` | Accept optional progression hook, remove inline Mars code |
| `src/run.ts` | Pass `marsScenario` in options |
| `src/serve.ts` | Pass `marsScenario` in options |
| `src/pair-runner.ts` | Pass `marsScenario` in options |

---

## 7. Data Flow After Phase 2

```
marsScenario (ScenarioPackage)
  ├── hooks.directorInstructions() → CrisisDirector.generateCrisis()
  ├── hooks.getMilestoneCrisis() → orchestrator turn loop
  ├── hooks.progressionHook() → progressBetweenTurns()
  ├── hooks.departmentPromptHook() → buildDepartmentContext()
  ├── hooks.fingerprintHook() → orchestrator post-loop
  ├── hooks.politicsHook() → orchestrator outcome block
  ├── hooks.reactionContextHook() → buildColonistPrompt()
  ├── departments[] → orchestrator agent creation
  ├── effects[].categoryDefaults → EffectRegistry (already wired in Phase 1)
  └── policies → orchestrator feature flags
```

---

## 8. Testing Strategy

### 8.1 New tests (~20)

- Mars fingerprint hook: produces expected classification for known inputs
- Mars politics hook: returns correct deltas for political/social categories, null for others
- Mars reaction context hook: produces Mars-born phrasing, radiation/bone-density lines
- `progressBetweenTurns` with no-op hook: no radiation/bone changes
- `progressBetweenTurns` with Mars hook: radiation and bone changes match Phase 1 behavior
- `buildDepartmentContext` calls scenario hook and includes returned lines
- `CrisisDirector.generateCrisis` uses provided instructions string
- Integration: `marsScenario` flows through full orchestrator setup without error

### 8.2 Existing tests

All 72 existing tests pass unchanged. The progression test in `kernel/progression.test.ts` will need updating since the inline Mars code is removed: it should pass `marsProgressionHook` to get the same behavior.

---

## 9. Backward Compatibility

- `runSimulation()` defaults `opts.scenario` to `marsScenario`. Callers that don't pass a scenario get Mars.
- `progressBetweenTurns()` defaults the hook to a no-op. Direct callers without a scenario get no domain-specific progression (this is correct: the engine should not assume Mars).
- Standalone runners (`run.ts`, `run-a.ts`, `run-b.ts`) are updated to pass `marsScenario` explicitly.
- `serve.ts` and `pair-runner.ts` pass `marsScenario` explicitly.
- `npm run dashboard` behavior is identical.

---

## 10. What Does NOT Change

- No file moves or renames
- No kernel type renames
- No dashboard changes
- SeededRng, HEXACO model, EmergentCapabilityEngine, AgentOS Memory untouched
- SSE streaming protocol, save/load, leaders.json untouched
- Mars remains the default experience

---

## 11. Acceptance Criteria

1. `runSimulation()` accepts a `ScenarioPackage` parameter.
2. Orchestrator has zero direct imports from `src/engine/mars/` (all flow through `opts.scenario`).
3. `CrisisDirector` has zero hardcoded Mars instructions or milestone data.
4. `progressBetweenTurns()` applies no Mars-specific health changes unless a hook provides them.
5. `buildDepartmentContext()` has no Mars-specific switch cases; domain lines come from scenario hook.
6. Fingerprint logic is scenario-owned, not hardcoded in orchestrator.
7. Politics deltas are scenario-owned, not hardcoded in orchestrator.
8. Colonist reaction phrasing is scenario-owned, not hardcoded in `colonist-reactions.ts`.
9. All ~92 tests pass (72 existing + ~20 new).
10. `npm run dashboard` launches Mars with identical behavior.
