# Scenario Template

Starter files for creating a new Paracosm scenario. Copy this directory, rename it, and fill in your domain.

## Quick Start

```bash
cp -r src/engine/_template src/engine/my-scenario
```

Then edit each file:

1. **index.ts** — Assemble your `ScenarioPackage` from the component files
2. **effects.ts** — Category effects (how crisis outcomes affect your world)
3. **metrics.ts** — World metric definitions (what stats your simulation tracks)
4. **events.ts** — Event type definitions (what kinds of things happen)
5. **progression-hooks.ts** — Between-turn progression (domain-specific health/status changes)
6. **prompts.ts** — Department prompt context and director instructions
7. **milestones.ts** — Fixed narrative anchor crises (turn 1 and final turn)
8. **presets.ts** — Default leaders and key personnel
9. **research-bundle.ts** — DOI-linked citations organized by topic
10. **names.ts** — Name lists for population generation
11. **fingerprint.ts** — Timeline classification logic
12. **politics.ts** — Politics/governance delta hook
13. **reactions.ts** — Colonist/agent reaction context for chat

## Running Your Scenario

```typescript
import { myScenario } from './engine/my-scenario/index.js';
import { runSimulation } from 'paracosm/runtime';

const output = await runSimulation(leader, personnel, {
  scenario: myScenario,
  maxTurns: 8,
  seed: 100,
});
```

## Reference

See `src/engine/mars/` and `src/engine/lunar/` for complete working examples.
