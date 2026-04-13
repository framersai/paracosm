# Phase 4: Engine Package Boundaries

**Date:** 2026-04-13
**Status:** Ready for execution
**Scope:** Restructure paracosm into a publishable package with clean engine/runtime/cli layers, tsc build, typedoc API docs, and proper exports map.
**Depends on:** Phase 3, completed and merged.

---

## 1. Goal

Make `paracosm` a real publishable npm package with:
- Clean layer separation: engine (importable library), runtime (orchestration), cli (server + dashboard + runners)
- `tsc` build to `dist/` with declarations
- `typedoc` API documentation
- Package exports map so consumers can `import { marsScenario } from 'paracosm/mars'`
- Tests colocated with source, excluded from build

---

## 2. Directory Structure After

```
src/
  engine/                    ← THE PACKAGE (importable, no side effects)
    index.ts                 ← barrel: re-exports everything consumers need
    types.ts                 ← ScenarioPackage, WorldState, hooks, type aliases
    effect-registry.ts
    effect-registry.test.ts
    metric-registry.ts
    metric-registry.test.ts
    event-taxonomy.ts
    event-taxonomy.test.ts
    integration.test.ts
    core/                    ← deterministic kernel (moved from kernel/)
      state.ts               ← Colonist, ColonySystems, etc. + generic aliases
      rng.ts
      kernel.ts
      kernel.test.ts
      progression.ts
      progression.test.ts
      colonist-generator.ts
    mars/                    ← Mars scenario package
      index.ts
      index.test.ts
      effects.ts
      events.ts
      fingerprint.ts
      fingerprint.test.ts
      metrics.ts
      milestones.ts
      milestones.test.ts
      names.ts
      names.test.ts
      politics.ts
      politics.test.ts
      presets.ts
      progression-hooks.ts
      progression-hooks.test.ts
      prompts.ts
      prompts.test.ts
      reactions.ts
      reactions.test.ts
      research-bundle.ts
      research-bundle.test.ts

  runtime/                   ← ORCHESTRATION (agents, research)
    index.ts                 ← barrel: export runSimulation, etc.
    orchestrator.ts
    director.ts
    departments.ts
    colonist-reactions.ts
    contracts.ts
    runtime-helpers.ts
    runtime-helpers.test.ts
    research/
      knowledge-base.ts
      research-memory.ts
      research.ts
      scenarios.ts

  cli/                       ← CLI + SERVER (not exported by package)
    serve.ts
    server-app.ts
    server-app.test.ts
    run.ts
    run-a.ts
    run-b.ts
    pair-runner.ts
    sim-config.ts
    sim-config.test.ts
    cli-run-options.ts
    cli-run-options.test.ts
    dashboard/
      index.html
      main.js
      setup.html
      about.html
      dashboard-main.test.ts

dist/                        ← tsc output (gitignored)
docs/api/                    ← typedoc output (gitignored)
```

---

## 3. Package Exports Map

```json
{
  "exports": {
    ".": { "import": "./dist/engine/index.js", "types": "./dist/engine/index.d.ts" },
    "./mars": { "import": "./dist/engine/mars/index.js", "types": "./dist/engine/mars/index.d.ts" },
    "./runtime": { "import": "./dist/runtime/index.js", "types": "./dist/runtime/index.d.ts" },
    "./core": { "import": "./dist/engine/core/state.js", "types": "./dist/engine/core/state.d.ts" }
  },
  "main": "dist/engine/index.js",
  "types": "dist/engine/index.d.ts",
  "files": ["dist/", "README.md", "LICENSE"]
}
```

Consumer usage:
```typescript
import type { ScenarioPackage, Agent, WorldState } from 'paracosm';
import { marsScenario } from 'paracosm/mars';
import { runSimulation } from 'paracosm/runtime';
import { SimulationKernel, SeededRng } from 'paracosm/core';
```

---

## 4. Type Aliases

Add generic type aliases in `engine/core/state.ts` alongside the existing concrete types:

```typescript
// Generic aliases for external consumers
export type Agent = Colonist;
export type AgentCore = ColonistCore;
export type AgentHealth = ColonistHealth;
export type AgentCareer = ColonistCareer;
export type AgentSocial = ColonistSocial;
export type AgentNarrative = ColonistNarrative;
```

The concrete types (`Colonist`, `ColonySystems`, etc.) stay as-is internally. The aliases give the package a scenario-neutral public API.

---

## 5. Build Setup

### tsconfig.build.json
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "noEmit": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/engine/**/*.ts", "src/runtime/**/*.ts"],
  "exclude": ["**/*.test.ts"]
}
```

### typedoc.json
```json
{
  "entryPoints": ["src/engine/index.ts"],
  "out": "docs/api",
  "tsconfig": "tsconfig.build.json",
  "exclude": ["**/*.test.ts"],
  "name": "paracosm",
  "readme": "README.md",
  "excludePrivate": true,
  "excludeInternal": true
}
```

### package.json scripts
```json
{
  "build": "tsc -p tsconfig.build.json",
  "docs": "typedoc",
  "prepublishOnly": "npm run build"
}
```

---

## 6. Import Path Updates

Every `.ts` file that imports from `kernel/` or `agents/` or other files needs its import paths updated to reflect the new directory structure. This is the bulk of the mechanical work.

Key mappings:
- `../kernel/state.js` -> `../engine/core/state.js` (from runtime/)
- `../kernel/kernel.js` -> `../engine/core/kernel.js` (from runtime/)
- `../kernel/rng.js` -> `../engine/core/rng.js` (from runtime/)
- `../kernel/progression.js` -> `../engine/core/progression.js` (from runtime/)
- `../kernel/colonist-generator.js` -> `../engine/core/colonist-generator.js` (from runtime/)
- `./agents/orchestrator.js` -> `../runtime/orchestrator.js` (from cli/)
- `../research/` -> `./research/` (stays within runtime/)
- `../sim-config.js` -> `../cli/sim-config.js` (from runtime/ that needs it)

---

## 7. Testing

Tests stay colocated. The test command updates to:
```bash
node --import tsx --test src/**/*.test.ts
```

No change to how tests run. The glob picks them up from any subdirectory.

---

## 8. Acceptance Criteria

1. `npm run build` produces `dist/` with `.js` + `.d.ts` files for engine and runtime.
2. `npm run docs` produces `docs/api/` with typedoc output.
3. `npm run dashboard` still launches Mars.
4. `npm run test` passes all ~92 tests.
5. Package exports map works: `import { marsScenario } from 'paracosm/mars'` resolves.
6. `npm publish` publishes only `dist/`, `README.md`, `LICENSE`.
7. Generic type aliases (`Agent`, `WorldState`) are exported from the main entry point.
8. No circular dependencies between layers (engine does not import runtime or cli).
