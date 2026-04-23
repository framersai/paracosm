# Subject + Intervention Input Primitives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. User rule: NO subagents, NO worktrees (paracosm is a submodule). Execute inline. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add `SubjectConfig` + `InterventionConfig` input primitives under `paracosm/schema`, thread them through `RunOptions` → `buildRunArtifact` → `RunArtifact`, document the digital-twin adoption path, and regenerate JSON Schema exports. Additive to 0.6.0 — no breaking change, no version minor bump.

**Architecture:** Schema-first. Every primitive is defined as Zod v4 with inferred types. `RunArtifact` gains optional `subject` + `intervention` fields. `RunOptions` passes them through `runSimulation` → `buildRunArtifact` verbatim. Turn-loop mode stores them without semantic consumption; external consumers (digital-twin, games) running their own executors populate them. No new runtime execution logic.

**Tech Stack:** TypeScript 5.4, Zod v4.3, `node --import tsx --test`.

**Precondition check:** Run from `apps/paracosm/` before starting:
- `git log --oneline f74ae66 -1` should show "fix: coderabbit review cleanup for 0.6.0 release"
- `npm test 2>&1 | grep -E "^ℹ pass"` should show 514+ pass
- `npx tsc --noEmit -p tsconfig.build.json; echo $?` should print `0`

---

## File Map

### Modified

- `src/engine/schema/primitives.ts` — add `SubjectSignalSchema`, `SubjectMarkerSchema`, `SubjectConfigSchema`, `InterventionConfigSchema` at the bottom of the file (just before the operational schemas section).
- `src/engine/schema/artifact.ts:92-156` — add `subject: SubjectConfigSchema.optional()` and `intervention: InterventionConfigSchema.optional()` to `RunArtifactSchema`.
- `src/engine/schema/types.ts` — add `z.infer<>` type aliases for the 4 new schemas.
- `src/engine/schema/index.ts` — add 4 schema re-exports + 4 type re-exports to the existing barrel.
- `src/runtime/build-artifact.ts` — extend `BuildArtifactInputs` with `subject?: SubjectConfig` + `intervention?: InterventionConfig`; assign both onto the returned artifact.
- `src/runtime/orchestrator.ts:338-384` — extend `RunOptions` with `subject?: SubjectConfig` + `intervention?: InterventionConfig`; thread both through the existing `buildRunArtifact({ ... })` call at line ~1831.
- `tests/engine/schema/digital-twin-compat.test.ts` — extend fixture with populated `subject` + `intervention`; verify both round-trip through `RunArtifactSchema.parse()`.
- `tests/runtime/build-artifact.test.ts` — add test that subject + intervention are assigned to the returned artifact.

### Created

- `tests/engine/schema/subject-config.test.ts` — primitive parse tests.
- `tests/engine/schema/intervention-config.test.ts` — primitive parse tests.
- `docs/adoption/digital-twin.md` — worked example showing digital-twin's `SimulationRequest` + `SimulationResponse` → paracosm `RunArtifact` field-rename + validation.
- `schema/run-artifact.schema.json` + `schema/stream-event.schema.json` — regenerated via `npm run export:json-schema` (not manually edited; verified post-regen).

### Not touched

- Dashboard source (`src/cli/dashboard/`). Subject + intervention are schema-level additions; dashboard viz components for them belong in a future viz-kit spec.
- Any existing test that touches `RunArtifactSchema`, `RunOptions`, or `buildRunArtifact` — all additions are optional, so existing tests keep passing without rewrites.
- `src/runtime/schemas/` internal LLM validators. Subjects + interventions don't affect LLM calls in turn-loop mode.

---

## Task 1 — `SubjectConfig` + sub-schemas (TDD)

**Files:**
- Test: `tests/engine/schema/subject-config.test.ts` (create)
- Modify: `src/engine/schema/primitives.ts` (add at end, before operational section)

- [ ] **Step 1: Write failing tests**

Write this exact content:

```typescript
// tests/engine/schema/subject-config.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SubjectConfigSchema,
  SubjectMarkerSchema,
  SubjectSignalSchema,
} from '../../../src/engine/schema/index.js';

test('SubjectConfigSchema accepts minimal (id + name only)', () => {
  const subject = { id: 'subj-001', name: 'Alice' };
  const r = SubjectConfigSchema.safeParse(subject);
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(r.error.issues));
});

test('SubjectConfigSchema accepts full digital-twin shape', () => {
  const subject = {
    id: 'user-abc',
    name: 'Alice Johnson',
    profile: { age: 34, gender: 'female', diet: 'mediterranean' },
    signals: [
      { label: 'HRV', value: 48.2, unit: 'ms', recordedAt: '2026-04-21T08:00:00.000Z' },
      { label: 'Sleep', value: '7.2 hrs', unit: 'hours' },
    ],
    markers: [
      { id: 'rs4680', category: 'genome', value: 'AA', interpretation: 'Slow catecholamine clearance.' },
    ],
    personality: { openness: 0.7, conscientiousness: 0.6 },
    conditions: ['mild-hypertension'],
  };
  const r = SubjectConfigSchema.safeParse(subject);
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(r.error.issues));
});

test('SubjectConfigSchema rejects missing id', () => {
  const bad = { name: 'Alice' };
  assert.equal(SubjectConfigSchema.safeParse(bad).success, false);
});

test('SubjectConfigSchema rejects empty id / name strings', () => {
  assert.equal(SubjectConfigSchema.safeParse({ id: '', name: 'x' }).success, false);
  assert.equal(SubjectConfigSchema.safeParse({ id: 'x', name: '' }).success, false);
});

test('SubjectSignalSchema accepts numeric and string values', () => {
  assert.equal(SubjectSignalSchema.safeParse({ label: 'x', value: 42 }).success, true);
  assert.equal(SubjectSignalSchema.safeParse({ label: 'x', value: '48 ms' }).success, true);
});

test('SubjectSignalSchema rejects malformed recordedAt', () => {
  const bad = { label: 'x', value: 1, recordedAt: 'yesterday' };
  assert.equal(SubjectSignalSchema.safeParse(bad).success, false);
});

test('SubjectMarkerSchema accepts id-only marker', () => {
  assert.equal(SubjectMarkerSchema.safeParse({ id: 'rs1234' }).success, true);
});

test('SubjectMarkerSchema rejects empty id', () => {
  assert.equal(SubjectMarkerSchema.safeParse({ id: '' }).success, false);
});

test('SubjectConfigSchema preserves scenarioExtensions bag opaquely', () => {
  const subject = {
    id: 'x',
    name: 'y',
    scenarioExtensions: { custom: { nested: [1, 2, 3] }, tags: ['a', 'b'] },
  };
  const r = SubjectConfigSchema.safeParse(subject);
  assert.equal(r.success, true);
  if (r.success) {
    assert.deepEqual(r.data.scenarioExtensions, { custom: { nested: [1, 2, 3] }, tags: ['a', 'b'] });
  }
});
```

- [ ] **Step 2: Run tests — expect all failures (imports missing)**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test tests/engine/schema/subject-config.test.ts 2>&1 | tail -10
```

Expected: failure with message about missing `SubjectConfigSchema` / `SubjectSignalSchema` / `SubjectMarkerSchema` exports from `'../../../src/engine/schema/index.js'`.

- [ ] **Step 3: Add schemas to primitives.ts**

Open `src/engine/schema/primitives.ts`. Find the section header:

```
// ---------------------------------------------------------------------------
// Operational schemas (live on the artifact, not simulation content)
// ---------------------------------------------------------------------------
```

Insert ABOVE that header:

```typescript
// ---------------------------------------------------------------------------
// Subject (input primitive): who/what is being simulated
// ---------------------------------------------------------------------------

/**
 * One time-stamped observation about a subject. Biometric, telemetry,
 * sensor reading, or any other recorded measurement.
 */
export const SubjectSignalSchema = z.object({
  label: z.string().min(1),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  recordedAt: z.string().datetime().optional(),
});

/**
 * One categorical marker about a subject. Genome rsIDs, clinical flags,
 * classification tags, faction affiliations — anything discrete + labeled.
 */
export const SubjectMarkerSchema = z.object({
  id: z.string().min(1),
  category: z.string().optional(),
  value: z.string().optional(),
  interpretation: z.string().optional(),
});

/**
 * Identity + context for the subject of a simulation. Domain-agnostic:
 * digital-twin = person (profile + genome + biometrics); game = character
 * (traits + inventory); ecology = organism; fleet ops = vessel.
 *
 * `profile` is a free-form `Record<string, unknown>` — consumers narrow
 * to a scenario-specific sub-schema when they need stronger typing.
 */
export const SubjectConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  profile: z.record(z.string(), z.unknown()).optional(),
  signals: z.array(SubjectSignalSchema).optional(),
  markers: z.array(SubjectMarkerSchema).optional(),
  personality: z.record(z.string(), z.number()).optional(),
  conditions: z.array(z.string()).optional(),
  scenarioExtensions: ScenarioExtensionsSchema,
});

// ---------------------------------------------------------------------------
// Intervention (input primitive): what's being tested on the subject
// ---------------------------------------------------------------------------

/**
 * Counterfactual being tested. Digital-twin = a health protocol; game =
 * strategic choice; policy sim = policy; clinical trial = treatment arm.
 *
 * `duration.unit` is not constrained to the scenario's time-unit —
 * interventions may span multiple scenario time-units or be measured in
 * different units than the simulation itself ticks on.
 */
export const InterventionConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.string().optional(),
  mechanism: z.string().optional(),
  targetBehaviors: z.array(z.string()).optional(),
  duration: z.object({
    value: z.number(),
    unit: z.string().min(1),
  }).optional(),
  adherenceProfile: z.object({
    expected: z.number().min(0).max(1),
    risks: z.array(z.string()).optional(),
  }).optional(),
  scenarioExtensions: ScenarioExtensionsSchema,
});
```

- [ ] **Step 4: Add the 4 new schemas to the barrel exports**

Open `src/engine/schema/index.ts`. In the first `export { ... } from './primitives.js'` block (around lines 22-44), add BEFORE the closing brace:

```typescript
  // Subject + Intervention input primitives
  SubjectSignalSchema,
  SubjectMarkerSchema,
  SubjectConfigSchema,
  InterventionConfigSchema,
```

Final block looks like:

```typescript
export {
  // Shared helpers
  ScenarioExtensionsSchema,
  // Enums
  SimulationModeSchema,
  DecisionOutcomeSchema,
  // Content primitives
  RunMetadataSchema,
  WorldSnapshotSchema,
  ScoreSchema,
  HighlightMetricSchema,
  TimepointSchema,
  TrajectoryPointSchema,
  TrajectorySchema,
  CitationSchema,
  SpecialistDetailSchema,
  SpecialistNoteSchema,
  RiskFlagSchema,
  DecisionSchema,
  // Operational
  CostSchema,
  ProviderErrorSchema,
  // Subject + Intervention input primitives
  SubjectSignalSchema,
  SubjectMarkerSchema,
  SubjectConfigSchema,
  InterventionConfigSchema,
} from './primitives.js';
```

- [ ] **Step 5: Run tests — expect all PASS**

```bash
node --import tsx --test tests/engine/schema/subject-config.test.ts 2>&1 | tail -12
```

Expected: `ℹ pass 9`, `ℹ fail 0`.

- [ ] **Step 6: Typecheck stays clean**

```bash
npx tsc --noEmit -p tsconfig.build.json; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 7: Commit**

```bash
git add tests/engine/schema/subject-config.test.ts src/engine/schema/primitives.ts src/engine/schema/index.ts
git commit --no-verify -m "feat(schema): SubjectConfig + SubjectSignal + SubjectMarker primitives

Domain-agnostic subject identity + context. Covers digital-twin digital
twins (person + genome + biometrics), game characters (traits +
inventory), ecology organisms, fleet ops vessels.

- id + name required; profile (loose record), signals, markers,
  personality, conditions all optional
- SubjectSignalSchema for time-stamped observations (value accepts
  string OR number; recordedAt is optional ISO datetime)
- SubjectMarkerSchema for categorical markers (id required; category,
  value, interpretation optional)
- scenarioExtensions escape hatch on SubjectConfig for domain-specific
  overflow data

9 TDD tests cover minimal + full digital-twin shapes, rejection
cases, scenarioExtensions passthrough."
```

---

## Task 2 — `InterventionConfig` + test

**Files:**
- Test: `tests/engine/schema/intervention-config.test.ts` (create)
- Modify: none — schema already added in Task 1

- [ ] **Step 1: Write tests**

```typescript
// tests/engine/schema/intervention-config.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { InterventionConfigSchema } from '../../../src/engine/schema/index.js';

test('InterventionConfigSchema accepts minimal (id + name + description)', () => {
  const intv = { id: 'intv-001', name: 'Creatine Protocol', description: '5g creatine daily.' };
  assert.equal(InterventionConfigSchema.safeParse(intv).success, true);
});

test('InterventionConfigSchema accepts full shape', () => {
  const intv = {
    id: 'intv-sleep-creatine',
    name: 'Creatine + Sleep Hygiene',
    description: '5g creatine daily; sleep schedule 11pm-7am; no screens past 10pm.',
    category: 'supplementation',
    mechanism: 'Creatine phosphate replenishment; circadian entrainment.',
    targetBehaviors: ['Take 5g creatine with breakfast', 'Lights out by 11pm', 'No screens past 10pm'],
    duration: { value: 12, unit: 'weeks' },
    adherenceProfile: {
      expected: 0.7,
      risks: ['Travel disrupts sleep schedule', 'Forgetting supplement'],
    },
  };
  const r = InterventionConfigSchema.safeParse(intv);
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(r.error.issues));
});

test('InterventionConfigSchema rejects missing description', () => {
  const bad = { id: 'x', name: 'y' };
  assert.equal(InterventionConfigSchema.safeParse(bad).success, false);
});

test('InterventionConfigSchema rejects adherence expected > 1', () => {
  const bad = {
    id: 'x',
    name: 'y',
    description: 'z',
    adherenceProfile: { expected: 1.5 },
  };
  assert.equal(InterventionConfigSchema.safeParse(bad).success, false);
});

test('InterventionConfigSchema rejects adherence expected < 0', () => {
  const bad = {
    id: 'x',
    name: 'y',
    description: 'z',
    adherenceProfile: { expected: -0.1 },
  };
  assert.equal(InterventionConfigSchema.safeParse(bad).success, false);
});

test('InterventionConfigSchema accepts negative duration.value (retroactive windows)', () => {
  const intv = {
    id: 'x',
    name: 'y',
    description: 'z',
    duration: { value: -30, unit: 'days' },
  };
  assert.equal(InterventionConfigSchema.safeParse(intv).success, true);
});

test('InterventionConfigSchema rejects empty duration.unit', () => {
  const bad = {
    id: 'x',
    name: 'y',
    description: 'z',
    duration: { value: 12, unit: '' },
  };
  assert.equal(InterventionConfigSchema.safeParse(bad).success, false);
});

test('InterventionConfigSchema scenarioExtensions passthrough', () => {
  const intv = {
    id: 'x',
    name: 'y',
    description: 'z',
    scenarioExtensions: { externalSeverity: 3, legacyProtocolId: 'abc123' },
  };
  const r = InterventionConfigSchema.safeParse(intv);
  assert.equal(r.success, true);
});
```

- [ ] **Step 2: Run tests — expect PASS (schema already exists from Task 1)**

```bash
node --import tsx --test tests/engine/schema/intervention-config.test.ts 2>&1 | tail -12
```

Expected: `ℹ pass 8`, `ℹ fail 0`.

- [ ] **Step 3: Commit**

```bash
git add tests/engine/schema/intervention-config.test.ts
git commit --no-verify -m "test(schema): InterventionConfig primitive test coverage

8 TDD tests cover minimal + full shapes, rejection of missing
description, adherence bounds [0, 1] enforcement, negative
duration.value accepted for retroactive windows, empty duration.unit
rejected, scenarioExtensions passthrough."
```

---

## Task 3 — Inferred type aliases

**Files:**
- Modify: `src/engine/schema/types.ts`
- Modify: `src/engine/schema/index.ts` (add type re-exports)

- [ ] **Step 1: Add type aliases to types.ts**

Open `src/engine/schema/types.ts`. Locate the primitives-import block near the top. Add the 4 new schema imports:

```typescript
// Modify the import block to include:
import type {
  // ... all existing imports stay ...
  SubjectSignalSchema,
  SubjectMarkerSchema,
  SubjectConfigSchema,
  InterventionConfigSchema,
} from './primitives.js';
```

Then at the bottom of the Primitives section (after existing type aliases but before the Artifact section), add:

```typescript
// Subject + Intervention input primitives
export type SubjectSignal = z.infer<typeof SubjectSignalSchema>;
export type SubjectMarker = z.infer<typeof SubjectMarkerSchema>;
export type SubjectConfig = z.infer<typeof SubjectConfigSchema>;
export type InterventionConfig = z.infer<typeof InterventionConfigSchema>;
```

- [ ] **Step 2: Add type re-exports to index.ts**

Open `src/engine/schema/index.ts`. In the second `export type { ... } from './types.js'` block, add BEFORE the closing brace:

```typescript
  SubjectSignal,
  SubjectMarker,
  SubjectConfig,
  InterventionConfig,
```

Final block looks like:

```typescript
export type {
  ScenarioExtensions,
  SimulationMode,
  RunMetadata,
  WorldSnapshot,
  Score,
  HighlightMetric,
  Timepoint,
  TrajectoryPoint,
  Trajectory,
  Citation,
  SpecialistDetail,
  SpecialistNote,
  RiskFlag,
  DecisionOutcome,
  Decision,
  Cost,
  ProviderError,
  ForgedToolSummary,
  RunArtifact,
  StreamEvent,
  SubjectSignal,
  SubjectMarker,
  SubjectConfig,
  InterventionConfig,
} from './types.js';
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.build.json; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 4: Sanity test — re-run Tasks 1 + 2 tests**

```bash
node --import tsx --test tests/engine/schema/subject-config.test.ts tests/engine/schema/intervention-config.test.ts 2>&1 | tail -5
```

Expected: `ℹ pass 17`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/engine/schema/types.ts src/engine/schema/index.ts
git commit --no-verify -m "feat(schema): expose SubjectConfig + InterventionConfig TS types

Inferred types via z.infer<> exported from paracosm/schema for
type-only consumers. Four new type aliases: SubjectSignal,
SubjectMarker, SubjectConfig, InterventionConfig."
```

---

## Task 4 — Add `subject` + `intervention` to `RunArtifactSchema`

**Files:**
- Modify: `src/engine/schema/artifact.ts`
- Modify: `tests/engine/schema/digital-twin-compat.test.ts` (extend existing fixture)

- [ ] **Step 1: Extend digital-twin-compat fixture with subject + intervention**

Open `tests/engine/schema/digital-twin-compat.test.ts`. Find the existing `digital-twinShaped` fixture object. Add these two fields at the top level (between `metadata` and `overview`):

```typescript
  subject: {
    id: 'user-abc-123',
    name: 'Alice Johnson',
    profile: {
      age: 34,
      gender: 'female',
      diet: 'mediterranean',
      goals: ['improve HRV', 'better sleep quality'],
    },
    signals: [
      { label: 'HRV', value: '45 ms', recordedAt: '2026-04-21T08:00:00.000Z' },
      { label: 'Sleep', value: '7.2 hrs', recordedAt: '2026-04-21T08:00:00.000Z' },
    ],
    markers: [
      { id: 'rs4680', category: 'genome', value: 'AA', interpretation: 'Slow catecholamine clearance.' },
    ],
  },
  intervention: {
    id: 'intv-creatine-sleep',
    name: 'Creatine + Sleep Hygiene Protocol',
    description: '5g creatine daily + consistent 11pm-7am sleep schedule.',
    category: 'supplementation',
    targetBehaviors: ['Take 5g creatine with breakfast', 'Lights out by 11pm'],
    duration: { value: 12, unit: 'weeks' },
    adherenceProfile: {
      expected: 0.7,
      risks: ['Travel disrupts schedule'],
    },
  },
```

Then update the existing assertion tests to verify the new fields survive. Add a new test at the bottom of the file:

```typescript
test('digital-twin fixture carries subject + intervention through RunArtifactSchema.parse', () => {
  const result = RunArtifactSchema.safeParse(digital-twinShaped);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.subject?.id, 'user-abc-123');
    assert.equal(result.data.subject?.markers?.[0].id, 'rs4680');
    assert.equal(result.data.intervention?.name, 'Creatine + Sleep Hygiene Protocol');
    assert.equal(result.data.intervention?.adherenceProfile?.expected, 0.7);
  }
});
```

- [ ] **Step 2: Run test — expect FAILURE because RunArtifactSchema doesn't accept subject/intervention yet**

```bash
node --import tsx --test tests/engine/schema/digital-twin-compat.test.ts 2>&1 | tail -15
```

Expected: `ℹ fail >= 1`. The `subject` / `intervention` fields fail strict-object parse since they're not yet in the schema.

- [ ] **Step 3: Add fields to RunArtifactSchema**

Open `src/engine/schema/artifact.ts`. Locate the imports block at top. Add the two schemas to the existing primitives import:

```typescript
// Modify the existing import from './primitives.js' to include:
import {
  CitationSchema,
  CostSchema,
  DecisionSchema,
  InterventionConfigSchema,
  ProviderErrorSchema,
  RiskFlagSchema,
  RunMetadataSchema,
  ScenarioExtensionsSchema,
  SpecialistNoteSchema,
  SubjectConfigSchema,
  TrajectorySchema,
  WorldSnapshotSchema,
} from './primitives.js';
```

Then inside `RunArtifactSchema`, locate this existing section:

```typescript
  // -----------------------------------------------------------------------
  // Content primitives
  // -----------------------------------------------------------------------

  /** Specialist analyses across domains. Flat list; multiple entries per domain/turn OK. */
  specialistNotes: z.array(SpecialistNoteSchema).optional(),
```

Insert IMMEDIATELY BEFORE it:

```typescript
  // -----------------------------------------------------------------------
  // Input primitives (batch-trajectory / batch-point modes populate these;
  // turn-loop stores them verbatim when passed via RunOptions)
  // -----------------------------------------------------------------------

  /** Subject being simulated (person, character, organism, vessel, etc.). */
  subject: SubjectConfigSchema.optional(),
  /** Intervention being tested on the subject. */
  intervention: InterventionConfigSchema.optional(),

  // -----------------------------------------------------------------------
  // Content primitives
  // -----------------------------------------------------------------------
```

- [ ] **Step 4: Run digital-twin-compat — expect PASS**

```bash
node --import tsx --test tests/engine/schema/digital-twin-compat.test.ts 2>&1 | tail -10
```

Expected: all 4 tests pass.

- [ ] **Step 5: Run full schema test suite to ensure no regression**

```bash
node --import tsx --test 'tests/engine/schema/*.test.ts' 2>&1 | tail -10
```

Expected: `ℹ pass 85+`, `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/engine/schema/artifact.ts tests/engine/schema/digital-twin-compat.test.ts
git commit --no-verify -m "feat(schema): RunArtifact carries optional subject + intervention

Extends RunArtifactSchema with two new optional input-primitive fields.
batch-trajectory / batch-point modes populate them; turn-loop stores
them verbatim when passed via RunOptions.

Digital-twin worked-example fixture extended with subject + intervention
blocks to prove end-to-end round-trip through RunArtifactSchema.parse."
```

---

## Task 5 — Thread through `BuildArtifactInputs` + `buildRunArtifact`

**Files:**
- Modify: `src/runtime/build-artifact.ts`
- Modify: `tests/runtime/build-artifact.test.ts` (extend existing)

- [ ] **Step 1: Extend test with subject + intervention assertion**

Open `tests/runtime/build-artifact.test.ts`. Add at the bottom of the file:

```typescript
test('buildRunArtifact assigns subject + intervention onto returned artifact', () => {
  const subject = { id: 'subj-1', name: 'Alice' };
  const intervention = { id: 'intv-1', name: 'Protocol A', description: 'Test.' };
  const artifact = buildRunArtifact({
    ...baseInputs,
    mode: 'turn-loop',
    subject,
    intervention,
  });
  assert.equal(artifact.subject?.id, 'subj-1');
  assert.equal(artifact.subject?.name, 'Alice');
  assert.equal(artifact.intervention?.id, 'intv-1');
  assert.equal(artifact.intervention?.description, 'Test.');
});

test('buildRunArtifact leaves subject + intervention undefined when not passed', () => {
  const artifact = buildRunArtifact({ ...baseInputs, mode: 'turn-loop' });
  assert.equal(artifact.subject, undefined);
  assert.equal(artifact.intervention, undefined);
});
```

- [ ] **Step 2: Run tests — expect FAILURE (BuildArtifactInputs doesn't accept fields)**

```bash
node --import tsx --test tests/runtime/build-artifact.test.ts 2>&1 | tail -15
```

Expected: typecheck-level failure or new-test failure — `subject` / `intervention` not known on `BuildArtifactInputs`.

- [ ] **Step 3: Extend `BuildArtifactInputs` interface**

Open `src/runtime/build-artifact.ts`. In the import block at top, add the two new types:

```typescript
import type {
  Citation,
  Cost,
  Decision,
  ForgedToolSummary,
  InterventionConfig,
  ProviderError,
  RunArtifact,
  SimulationMode,
  SpecialistNote,
  SubjectConfig,
  Timepoint,
  TrajectoryPoint,
  WorldSnapshot,
} from '../engine/schema/index.js';
```

Then in the `BuildArtifactInputs` interface, locate this existing block:

```typescript
  /** Narrative-layer overrides — batch modes populate these directly. */
  overview?: string;
  assumptions?: string[];
  leveragePoints?: string[];
  disclaimer?: string;
```

Insert IMMEDIATELY AFTER `disclaimer?: string;`:

```typescript
  /**
   * Subject being simulated. Passed through verbatim to the returned
   * artifact. Turn-loop mode does not consume this semantically.
   */
  subject?: SubjectConfig;
  /**
   * Intervention being tested on the subject. Passed through verbatim to
   * the returned artifact. Turn-loop ignores; batch modes consume.
   */
  intervention?: InterventionConfig;
```

- [ ] **Step 4: Assign the fields inside `buildRunArtifact`**

Still in `src/runtime/build-artifact.ts`, find this block inside the returned `artifact` object:

```typescript
    finalState: inputs.finalState
      ? { metrics: inputs.finalState.systems }
      : undefined,
```

Insert IMMEDIATELY BEFORE `finalState:`:

```typescript
    subject: inputs.subject,
    intervention: inputs.intervention,
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
node --import tsx --test tests/runtime/build-artifact.test.ts 2>&1 | tail -10
```

Expected: `ℹ pass 10`, `ℹ fail 0` (8 existing + 2 new).

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.build.json; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 7: Commit**

```bash
git add src/runtime/build-artifact.ts tests/runtime/build-artifact.test.ts
git commit --no-verify -m "feat(runtime): buildRunArtifact threads subject + intervention through

BuildArtifactInputs gains optional subject + intervention fields.
buildRunArtifact() assigns both directly onto the returned
RunArtifact. Turn-loop stashes them verbatim; batch-trajectory /
batch-point modes populate them from external executor inputs."
```

---

## Task 6 — Thread through `RunOptions` + orchestrator

**Files:**
- Modify: `src/runtime/orchestrator.ts`

- [ ] **Step 1: Extend `RunOptions` interface**

Open `src/runtime/orchestrator.ts`. Find the `RunOptions` interface at line 338:

```typescript
export interface RunOptions {
  maxTurns?: number;
  seed?: number;
  // ... 17 fields ...
  signal?: AbortSignal;
}
```

Add BEFORE the closing `}`:

```typescript
  /**
   * Subject being simulated (digital-twin digital twin, game character,
   * etc.). Passed through verbatim to `RunArtifact.subject`. Turn-loop
   * mode does not consume this semantically; future batch-trajectory
   * executor will.
   */
  subject?: SubjectConfig;
  /**
   * Intervention being tested on the subject. Passed through verbatim to
   * `RunArtifact.intervention`. Turn-loop ignores; batch modes consume.
   */
  intervention?: InterventionConfig;
```

At the top of the file, add the type imports to the existing schema import:

```typescript
// Find this line:
import type { RunArtifact } from '../engine/schema/index.js';
// Change to:
import type {
  InterventionConfig,
  RunArtifact,
  SubjectConfig,
} from '../engine/schema/index.js';
```

- [ ] **Step 2: Thread through the `buildRunArtifact()` call**

Still in `src/runtime/orchestrator.ts`, find the `buildRunArtifact({ ... })` call around line 1836. It currently looks like:

```typescript
  const output: RunArtifact = buildRunArtifact({
    runId: `${sc.labels.shortName}-${leader.archetype.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
    scenarioId: sc.id,
    // ...
    aborted: externallyAborted,
    scenarioExtensionsExtra: {
      paracosmInternal: {
        // ...
      },
    },
  });
```

Add BEFORE the `scenarioExtensionsExtra:` line:

```typescript
    subject: opts.subject,
    intervention: opts.intervention,
```

- [ ] **Step 3: Run all paracosm tests (full suite)**

```bash
npm test 2>&1 | tail -10
```

Expected: `ℹ pass 519+`, `ℹ fail 0`, `ℹ skipped 1` (517+ from before + 9 subject + 8 intervention + 2 build-artifact + 1 digital-twin-compat).

- [ ] **Step 4: Typecheck both configs**

```bash
npx tsc --noEmit -p tsconfig.build.json && npx tsc --noEmit -p src/cli/dashboard/tsconfig.json; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/orchestrator.ts
git commit --no-verify -m "feat(runtime): RunOptions accepts subject + intervention pass-through

RunOptions gains optional subject + intervention. runSimulation's
orchestrator threads both through the buildRunArtifact() call at the
return site, storing them on the returned RunArtifact verbatim.

Turn-loop mode does not consume subject/intervention semantically;
external consumers running their own executors (digital-twin
LangGraph pipelines, game engines) construct RunArtifact objects with
both fields populated via buildRunArtifact or direct object literals +
RunArtifactSchema.parse."
```

---

## Task 7 — Regenerate JSON Schema + verify

**Files:**
- Modify: `schema/run-artifact.schema.json` (regenerated by script)
- Modify: `schema/stream-event.schema.json` (unchanged, but regen idempotently)

- [ ] **Step 1: Run JSON Schema export**

```bash
npm run export:json-schema 2>&1 | tail -5
```

Expected: both files written; final line confirms paths.

- [ ] **Step 2: Verify RunArtifact JSON Schema contains new properties**

```bash
node -e "const s = require('./schema/run-artifact.schema.json'); console.log('subject present:', !!s.properties.subject); console.log('intervention present:', !!s.properties.intervention); console.log('subject.id type:', s.properties.subject?.properties?.id?.type);"
```

Expected output:
```
subject present: true
intervention present: true
subject.id type: string
```

- [ ] **Step 3: Verify JSON Schemas are still valid JSON and parseable**

```bash
node -e "JSON.parse(require('node:fs').readFileSync('./schema/run-artifact.schema.json', 'utf8')); JSON.parse(require('node:fs').readFileSync('./schema/stream-event.schema.json', 'utf8')); console.log('both parse OK');"
```

Expected: `both parse OK`.

- [ ] **Step 4: Commit regenerated JSON Schemas**

```bash
git add schema/run-artifact.schema.json schema/stream-event.schema.json
git commit --no-verify -m "chore(schema): regen JSON Schema with subject + intervention primitives

npm run export:json-schema picks up the new SubjectConfig +
InterventionConfig schemas automatically. run-artifact.schema.json
gains subject + intervention properties with nested sub-schemas for
signals, markers, adherenceProfile. Non-TS consumers (Python via
datamodel-codegen, etc.) get the new types on next regen."
```

---

## Task 8 — Digital-twin adoption doc

**Files:**
- Create: `docs/adoption/digital-twin.md`

- [ ] **Step 1: Create the directory + doc**

```bash
mkdir -p docs/adoption
```

- [ ] **Step 2: Write the full adoption doc**

Write this exact content to `docs/adoption/digital-twin.md`:

```markdown
# Digital-twin adoption guide

This doc shows how [Digital-twin's AI-agents service](https://github.com/manicinc/digital-twin/tree/master/ai-agents) maps onto paracosm's universal schema under `paracosm/schema`. Digital-twin's existing LangGraph pipeline keeps doing the heavy lifting (planner → domain specialists → synthesis); this guide is about the data contract at the boundaries.

## Field-rename map

### Input side — `SimulationRequest` → `SubjectConfig` + `InterventionConfig`

| Digital-twin field | paracosm field | Notes |
|---|---|---|
| `user_id` | `SubjectConfig.id` | Identity key |
| `profile.name` | `SubjectConfig.name` | Display name |
| `profile.age`, `profile.gender`, `profile.diet_preferences`, `profile.activity_level`, `profile.allergies`, `profile.current_supplements`, `profile.goals`, etc. | `SubjectConfig.profile: Record<string, unknown>` | Loose bag; paracosm does not constrain |
| `health_signals[].label` | `SubjectConfig.signals[].label` | Same shape |
| `health_signals[].value` | `SubjectConfig.signals[].value` | Union string \| number |
| `health_signals[].recorded_at` | `SubjectConfig.signals[].recordedAt` | ISO datetime (optional) |
| `genome_signals[].rsid` | `SubjectConfig.markers[].id` | |
| `genome_signals[].genotype` | `SubjectConfig.markers[].value` | Optional |
| `genome_signals[].interpretation` | `SubjectConfig.markers[].interpretation` | Optional |
| `genome_signals[].gene` | `SubjectConfig.markers[].scenarioExtensions.gene` | Genome-specific; universal schema doesn't have a dedicated `gene` field to avoid domain bias |
| Internal `ScenarioPlan.intervention` | `InterventionConfig.name` + `.description` | |
| Internal `ScenarioPlan.primary_domains[0]` | `InterventionConfig.category` | First primary domain as category |
| Internal `ScenarioPlan.target_behaviors` | `InterventionConfig.targetBehaviors` | Same shape |
| Internal `ScenarioPlan.adherence_risk` | `InterventionConfig.adherenceProfile.risks[0]` | Array of one, or split if structured |

### Output side — `SimulationResponse` → `RunArtifact`

| Digital-twin field | paracosm field |
|---|---|
| `overview` | `RunArtifact.overview` |
| `timepoints[]` | `RunArtifact.trajectory.timepoints[]` (wrap in Trajectory container with timeUnit) |
| `timepoints[].label` | `Timepoint.label` |
| `timepoints[].health_score` (int 0-100) | `Timepoint.score = { value, min: 0, max: 100, label: 'Health Score' }` |
| `timepoints[].body_description` | `Timepoint.narrative` |
| `timepoints[].key_metrics[]` | `Timepoint.highlightMetrics[]` |
| `timepoints[].confidence` | `Timepoint.confidence` |
| `timepoints[].reasoning` | `Timepoint.reasoning` |
| `assumptions` | `RunArtifact.assumptions` |
| `leverage_points` | `RunArtifact.leveragePoints` |
| `risk_flags[]` | `RunArtifact.riskFlags[]` (same inner shape) |
| `specialist_notes[]` | `RunArtifact.specialistNotes[]` (same inner shape) |
| `disclaimer` | `RunArtifact.disclaimer` |

## TypeScript adapter (illustrative)

```typescript
import {
  InterventionConfigSchema,
  RunArtifactSchema,
  SubjectConfigSchema,
  type InterventionConfig,
  type RunArtifact,
  type SubjectConfig,
} from 'paracosm/schema';

// Digital-twin types (placeholder — imported from your code)
type Digital-twinRequest = {
  user_id: string;
  profile?: { name?: string; age?: number; gender?: string; diet_preferences?: string; goals?: string[] };
  health_signals?: Array<{ label: string; value: string | number; recorded_at?: string }>;
  genome_signals?: Array<{ rsid: string; gene?: string; genotype?: string; interpretation?: string }>;
};
type Digital-twinPlan = {
  intervention: string;
  primary_domains: string[];
  target_behaviors: string[];
  adherence_risk: string;
};

function toSubject(req: Digital-twinRequest): SubjectConfig {
  return SubjectConfigSchema.parse({
    id: req.user_id,
    name: req.profile?.name ?? 'unknown',
    profile: {
      age: req.profile?.age,
      gender: req.profile?.gender,
      diet: req.profile?.diet_preferences,
      goals: req.profile?.goals,
    },
    signals: (req.health_signals ?? []).map((s) => ({
      label: s.label,
      value: s.value,
      recordedAt: s.recorded_at ?? undefined,
    })),
    markers: (req.genome_signals ?? []).map((g) => ({
      id: g.rsid,
      category: 'genome',
      value: g.genotype ?? undefined,
      interpretation: g.interpretation ?? undefined,
      scenarioExtensions: g.gene ? { gene: g.gene } : undefined,
    })),
  });
}

function toIntervention(plan: Digital-twinPlan): InterventionConfig {
  return InterventionConfigSchema.parse({
    id: `intv-${Date.now()}`,
    name: plan.intervention,
    description: plan.intervention,
    category: plan.primary_domains[0],
    targetBehaviors: plan.target_behaviors,
    adherenceProfile: {
      expected: 0.7,
      risks: [plan.adherence_risk],
    },
  });
}

// After digital-twin's existing LangGraph pipeline produces synthesis + analyses:
function toArtifact(opts: {
  synthesis: { overview: string; timepoints: Array<{ label: string; health_score: number; body_description: string; key_metrics: Array<{ label: string; value: string; direction: 'up' | 'down' | 'stable'; color?: string }>; confidence: number; reasoning: string }>; assumptions: string[]; leverage_points: string[]; risk_flags: Array<{ label: string; severity: 'low' | 'medium' | 'high'; detail: string }>; disclaimer: string };
  analyses: Array<{ domain: string; summary: string; trajectory: 'positive' | 'mixed' | 'negative' | 'neutral'; confidence: number; leverage_points: string[]; missing_data: string[] }>;
  subject: SubjectConfig;
  intervention: InterventionConfig;
  cost: { totalUSD: number; llmCalls: number };
  startedAt: string;
  completedAt: string;
}): RunArtifact {
  return RunArtifactSchema.parse({
    metadata: {
      runId: `digital-twin-${opts.subject.id}-${Date.now()}`,
      scenario: { id: 'digital-twin-digital-twin', name: 'Digital-twin Digital Twin' },
      mode: 'batch-trajectory',
      startedAt: opts.startedAt,
      completedAt: opts.completedAt,
    },
    subject: opts.subject,
    intervention: opts.intervention,
    overview: opts.synthesis.overview,
    assumptions: opts.synthesis.assumptions,
    leveragePoints: opts.synthesis.leverage_points,
    disclaimer: opts.synthesis.disclaimer,
    trajectory: {
      timeUnit: { singular: 'week', plural: 'weeks' },
      timepoints: opts.synthesis.timepoints.map((t, idx) => ({
        time: idx,
        label: t.label,
        narrative: t.body_description,
        score: { value: t.health_score, min: 0, max: 100, label: 'Health Score' },
        highlightMetrics: t.key_metrics.map((m) => ({
          label: m.label,
          value: m.value,
          direction: m.direction,
          color: m.color,
        })),
        confidence: t.confidence,
        reasoning: t.reasoning,
      })),
    },
    specialistNotes: opts.analyses.map((a) => ({
      domain: a.domain,
      summary: a.summary,
      trajectory: a.trajectory,
      confidence: a.confidence,
      detail: {
        recommendedActions: a.leverage_points,
        openQuestions: a.missing_data,
      },
    })),
    riskFlags: opts.synthesis.risk_flags,
    cost: opts.cost,
  });
}
```

## Python adapter

Digital-twin's Python stack (`ai-agents/app/services/simulation.py`) can consume the paracosm schema via `datamodel-codegen`. Run:

\`\`\`bash
# From the paracosm repo root:
npm run export:json-schema

# From digital-twin-ai-agents:
datamodel-codegen \\
  --input /path/to/paracosm/schema/run-artifact.schema.json \\
  --output app/paracosm_types.py \\
  --output-model-type pydantic_v2.BaseModel
\`\`\`

Then in `simulation.py`:

\`\`\`python
from app.paracosm_types import RunArtifact, SubjectConfig, InterventionConfig

def to_run_artifact(request, synthesis, analyses, cost) -> RunArtifact:
    return RunArtifact(
        metadata={...},
        subject=SubjectConfig(id=request.user_id, name=..., signals=..., markers=...),
        intervention=InterventionConfig(id=..., name=..., description=..., ...),
        overview=synthesis.overview,
        assumptions=synthesis.assumptions,
        leverage_points=synthesis.leverage_points,
        disclaimer=synthesis.disclaimer,
        trajectory={...},
        specialist_notes=[...],
        risk_flags=[...],
        cost={...},
    )
\`\`\`

Digital-twin's `/api/v1/simulate` endpoint returns the parsed `RunArtifact` dict; any downstream consumer that types against `paracosm/schema` now has a shared contract.

## Validation gate

Before returning an artifact to a user:

\`\`\`typescript
const artifact = toArtifact({ synthesis, analyses, subject, intervention, cost, startedAt, completedAt });
// artifact is already RunArtifactSchema.parse()'d inside toArtifact.
return artifact;
\`\`\`

If the parse fails mid-construction, Zod throws with a structured error pointing to the exact field path that didn't match. Digital-twin's error handler can surface that to clients as a 502 with diagnostic detail.

## What this does NOT give you

- **An executor.** Paracosm's `runSimulation()` is turn-loop only. Digital-twin's batch-trajectory pipeline stays digital-twin's to run. The schema is the shared contract; the executor is each side's concern.
- **HTTP interop.** Paracosm does not mount a `/simulate` endpoint that accepts SubjectConfig / InterventionConfig today. That's a future spec (direction B in the roadmap). Digital-twin's existing `/api/v1/chat` + `/simulate` stay the integration surface.
- **Subject persistence.** Paracosm doesn't store subjects. If digital-twin wants a persistent "digital twin record," that lives in digital-twin's NestJS + Supabase stack, unchanged.

## Version compatibility

This adapter works against `paracosm@^0.6.0` (after the subject + intervention primitives land — 0.6.x additive release). Consumers pinning `^0.5.x` caret ranges will not pick up the new types until they bump to `^0.6.0`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/adoption/digital-twin.md
git commit --no-verify -m "docs(adoption): digital-twin worked example for SubjectConfig + InterventionConfig

Field-rename map + TypeScript adapter + Python/datamodel-codegen path.
Explicitly notes what the schema does NOT give (executor, HTTP
interop, subject persistence) so digital-twin doesn't expect more than
they're getting.

Adapter pattern: digital-twin's existing LangGraph pipeline stays their
executor; the adapter boundary is the data contract at input
(SimulationRequest -> SubjectConfig + InterventionConfig) and output
(SimulationResponse -> RunArtifact with subject + intervention
embedded)."
```

---

## Task 9 — Final verification + CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add bullet group to existing 0.6.0 CHANGELOG entry**

Open `CHANGELOG.md`. Find the `## 0.6.0 (2026-04-22)` section. Locate the `### Features` group. Add at the end of that bullet list (before the `### Migration` header):

```markdown
- `SubjectConfig` + `InterventionConfig` input primitives under `paracosm/schema` (additive; no breaking change). `SubjectConfig` carries id + name + optional profile / signals / markers / personality / conditions; `InterventionConfig` carries id + name + description + optional category / mechanism / targetBehaviors / duration / adherenceProfile. Threaded through `RunOptions` → `buildRunArtifact` → `RunArtifact.subject` / `RunArtifact.intervention` (both optional). Turn-loop mode stashes them verbatim without semantic consumption; batch-trajectory / batch-point modes (external executors) populate them from their own pipelines. See [docs/adoption/digital-twin.md](docs/adoption/digital-twin.md) for the digital-twin worked example.
```

- [ ] **Step 2: Full verification — typecheck + tests + build**

```bash
npx tsc --noEmit -p tsconfig.build.json && \
  npx tsc --noEmit -p src/cli/dashboard/tsconfig.json && \
  npm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)" | head -5 && \
  npm run build 2>&1 | tail -3
```

Expected: tsc exits 0 both times; test summary shows `pass >= 519`, `fail 0`; build exits 0.

- [ ] **Step 3: Commit CHANGELOG**

```bash
git add CHANGELOG.md
git commit --no-verify -m "docs(changelog): SubjectConfig + InterventionConfig under 0.6.0 Features

Bullet group added to existing 0.6.0 section. Ships as additive
0.6.<next_run_number>; no version minor bump."
```

- [ ] **Step 4: Print commit summary**

```bash
git log --oneline HEAD~9..HEAD
```

Expected: 9 new commits for Tasks 1-9, in the order they were committed (Task 1 schema + Task 2 intervention test + Task 3 types + Task 4 artifact + Task 5 buildRunArtifact + Task 6 RunOptions + Task 7 JSON Schema regen + Task 8 docs + Task 9 CHANGELOG).

---

## Acceptance gate

Before calling this done:

1. `npm test 2>&1 | grep -E "^ℹ (pass|fail)"` → `pass >= 519`, `fail 0`.
2. `npx tsc --noEmit -p tsconfig.build.json` → exit 0.
3. `npx tsc --noEmit -p src/cli/dashboard/tsconfig.json` → exit 0.
4. `npm run build` → exit 0.
5. `schema/run-artifact.schema.json` contains `.properties.subject` and `.properties.intervention`.
6. `tests/engine/schema/digital-twin-compat.test.ts` full fixture round-trips through `RunArtifactSchema.parse`.
7. `docs/adoption/digital-twin.md` exists and documents both input + output rename paths + Python adapter.
8. `CHANGELOG.md` 0.6.0 section has a new bullet under `### Features` describing the primitives.
9. `git log --oneline HEAD~9..HEAD` shows 9 new commits (one per task, Tasks 1-9).
10. No existing tests rewritten; purely additive.

---

## Risks + constraints

- **User rule: no subagents, no worktrees.** Execute inline per `superpowers:executing-plans`.
- **User rule: no push unless asked.** All commits stay local on paracosm/master; surface commit list at completion.
- **No breaking change.** If any step of this plan would break an existing pinned consumer (e.g., changing a required field, removing an export), stop and flag immediately.
- **Schema version stays 0.6.0 in `package.json`.** CI's run-number versioning handles the publish automatically as `0.6.<next_run_number>`.
