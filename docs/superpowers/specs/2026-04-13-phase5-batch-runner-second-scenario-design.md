# Phase 5: Batch Runner and Second Scenario

**Date:** 2026-04-13
**Status:** Ready for execution
**Scope:** Add programmatic batch runner, create lunar outpost scenario to prove the engine works without editing engine code, overhaul README with logos.
**Depends on:** Phase 4, completed and merged.

---

## 1. Goal

Prove the engine is scenario-agnostic by adding a second settlement scenario (lunar outpost) that runs through the same engine without editing any engine or runtime file. Add a batch runner for reproducible multi-scenario experiments. Overhaul the README to reflect paracosm as a simulation engine, not just a Mars demo.

---

## 2. Batch Runner

### 2.1 Types

```typescript
interface BatchConfig {
  scenarios: ScenarioPackage[];
  leaders: LeaderConfig[];
  turns: number;
  seed: number;
  startYear?: number;
  provider?: LlmProvider;
  models?: Partial<SimulationModelConfig>;
}

interface BatchResult {
  scenarioId: string;
  scenarioVersion: string;
  leader: string;
  seed: number;
  turns: number;
  output: any;
  fingerprint: Record<string, string>;
  duration: number;
}

interface BatchManifest {
  timestamp: string;
  config: Omit<BatchConfig, 'scenarios'> & { scenarioIds: string[] };
  results: BatchResult[];
}
```

### 2.2 API

```typescript
async function runBatch(config: BatchConfig): Promise<BatchManifest>
```

### 2.3 CLI

```bash
npx tsx src/cli/batch.ts --scenarios mars,lunar --turns 3 --seed 950
```

---

## 3. Lunar Outpost Scenario

A close cousin to Mars that stresses the abstraction without requiring a different engine archetype.

- **Setting:** Lunar south pole permanent outpost (Shackleton crater rim)
- **Population noun:** crew members
- **Settlement noun:** outpost
- **Departments:** medical, engineering, mining, life-support, communications
- **Unique fields:** regolith exposure (dust toxicity), solar cycle dependency, Earth visibility windows
- **Progression hook:** regolith dust accumulation (like Mars radiation), muscle atrophy in 1/6g
- **Milestones:** Turn 1: Landing site selection (crater rim vs lava tube), Final: Earth status report
- **Knowledge:** Artemis program, lunar regolith toxicity, ISRU water extraction from permanently shadowed craters

---

## 4. README Overhaul

- AgentOS logo at top (clean, no tagline)
- Frame.dev / Manic Agency attribution
- Paracosm as a simulation engine, not just Mars
- Consumer API examples
- Mars as the flagship scenario
- Lunar as proof of modularity
- Links to agentos.sh, docs.agentos.sh, npm, GitHub

---

## 5. Acceptance Criteria

1. `runBatch()` executes multiple scenarios and produces a manifest.
2. Lunar scenario runs through the engine without editing any engine or runtime file.
3. Lunar has different departments, progression, milestones, and labels than Mars.
4. `npm run dashboard` still launches Mars.
5. All tests pass (existing + new).
6. README reflects paracosm as a reusable engine with multiple scenarios.
