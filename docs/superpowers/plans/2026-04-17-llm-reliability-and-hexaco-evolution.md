# Paracosm LLM Reliability + HEXACO Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, since paracosm is a submodule and user rules forbid worktrees + subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every hand-rolled `generateText → JSON.parse → regex salvage` site in paracosm with schema-validated wrappers (one-shot `generateValidatedObject` for director/reactions/verdict; session-aware `sendAndValidate` for commander/departments/promotions). Add commander HEXACO drift tracking, full-trait outcome-pull drift, trajectory-aware prompting, and reaction-cue translation.

**Architecture:** Two validation wrappers over AgentOS (`generateObject` + session `.send()`) with Zod schemas per call site. HEXACO drift helpers in `engine/core/progression.ts`. Cue helpers in new `runtime/hexaco-cues/` module. All schemas centralized in `runtime/schemas/`. No AgentOS changes required.

**Tech Stack:** TypeScript, Zod, `@framers/agentos` (generateObject, agent/session, SystemContentBlock caching), `node:test` for unit tests.

**Working directory:** ALWAYS `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm` before running any command. The monorepo root has Next.js apps that interfere with paracosm builds. All test commands below assume paracosm is the cwd.

**Design spec:** [docs/superpowers/specs/2026-04-17-llm-reliability-and-hexaco-evolution-design.md](../specs/2026-04-17-llm-reliability-and-hexaco-evolution-design.md)

**Commit convention:** no AI references, no Co-Authored-By lines, plain imperative-tense messages (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`).

---

## File Structure

### New files

```
apps/paracosm/src/runtime/schemas/
  index.ts                              barrel export
  director.ts                           DirectorEventBatchSchema + inferred types
  department.ts                         DepartmentReportSchema + supporting schemas
  commander.ts                          CommanderDecisionSchema + PromotionsSchema
  reactions.ts                          ReactionBatchSchema (wrapped object)
  verdict.ts                            VerdictSchema
  director.test.ts                      per-schema round-trip tests
  department.test.ts
  commander.test.ts
  reactions.test.ts
  verdict.test.ts

apps/paracosm/src/runtime/llm-invocations/
  generateValidatedObject.ts            one-shot wrapper
  sendAndValidate.ts                    session-aware wrapper
  generateValidatedObject.test.ts
  sendAndValidate.test.ts

apps/paracosm/src/runtime/hexaco-cues/
  trajectory.ts                         buildTrajectoryCue(history, current)
  translation.ts                        buildReactionCues(hexaco)
  trajectory.test.ts
  translation.test.ts

apps/paracosm/src/engine/core/progression.test.ts   full-trait + commander drift tests
```

### Modified files

- `src/runtime/director.ts` — migrate to `generateValidatedObject`, delete parse helpers, add CoT prompt
- `src/runtime/agent-reactions.ts` — migrate to `generateValidatedObject`, add reaction-cue block
- `src/cli/pair-runner.ts` — migrate verdict to `generateValidatedObject`, delete strip logic, add CoT prompt
- `src/runtime/orchestrator.ts` — migrate commander + dept calls to `sendAndValidate`; wire commander drift tracking (`commanderHexacoLive` + `commanderHexacoHistory`); thread trajectory cue into commander/director/dept prompt builds; rewrite commander `<thinking>` block into JSON `reasoning` field; export new leader output shape
- `src/runtime/commander-setup.ts` — migrate promotions to `sendAndValidate`
- `src/runtime/departments.ts` — delete `DEPARTMENT_CONFIGS` dead code; add trajectory cue for dept head in `buildDepartmentContext`
- `src/runtime/parsers.ts` — delete `parseDeptReport` and `parseCmdDecision`; keep `cleanSummary`, `humanizeToolName`, `decisionToPolicy`, `emptyReport`, `emptyDecision`
- `src/engine/core/progression.ts` — expand outcome-pull table for all six traits; add exported `driftCommanderHexaco` helper

---

## Task 1: Add zod dependency and create schemas directory

**Files:**
- Modify: `apps/paracosm/package.json`
- Create: `apps/paracosm/src/runtime/schemas/index.ts`

- [ ] **Step 1: Add zod to paracosm package.json dependencies**

Zod is currently a transitive dependency via `@framers/agentos` but not a direct dep. Pin a compatible version:

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npm install zod@^3.23.0 --save
```

Expected: `package.json` now has `"zod": "^3.23.0"` under `dependencies` and `package-lock.json` is updated.

- [ ] **Step 2: Verify zod import resolves from paracosm source**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node -e "console.log(require('zod').z.string().safeParse('hi'))"
```

Expected output contains `{ success: true, data: 'hi' }`.

- [ ] **Step 3: Create schemas barrel file**

Create `apps/paracosm/src/runtime/schemas/index.ts`:

```ts
/**
 * Barrel exports for all Zod schemas covering paracosm's structured LLM
 * outputs. One schema per call site, each pair-tested in its own *.test.ts.
 *
 * Schemas are the single source of truth for shape and constraints. The
 * inferred types (`z.infer<typeof X>`) are preferred over the legacy
 * interfaces in contracts.ts for new code; legacy interfaces stay for
 * backward compat until every consumer migrates.
 *
 * @module paracosm/runtime/schemas
 */

export * from './director.js';
export * from './department.js';
export * from './commander.js';
export * from './reactions.js';
export * from './verdict.js';
```

- [ ] **Step 4: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add package.json package-lock.json src/runtime/schemas/index.ts
git commit -m "chore: add zod dependency and schemas barrel"
```

---

## Task 2: DirectorEventBatchSchema with round-trip tests

**Files:**
- Create: `apps/paracosm/src/runtime/schemas/director.ts`
- Create: `apps/paracosm/src/runtime/schemas/director.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/paracosm/src/runtime/schemas/director.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DirectorEventSchema,
  DirectorEventBatchSchema,
  DirectorOptionSchema,
} from './director.js';

const validOption = {
  id: 'option_a',
  label: 'Safe path',
  description: 'Stable but slow',
  isRisky: false,
};
const riskyOption = { ...validOption, id: 'option_b', isRisky: true };
const validEvent = {
  title: 'Hull breach',
  description: 'Aft pressure hull cracked at seam 7.',
  options: [validOption, riskyOption],
  riskyOptionId: 'option_b',
  riskSuccessProbability: 0.55,
  category: 'infrastructure',
  researchKeywords: ['hull integrity'],
  relevantDepartments: ['engineering'],
  turnSummary: 'Engineering crisis',
};
const validBatch = { events: [validEvent], pacing: 'normal', reasoning: 'ramp' };

test('DirectorOptionSchema accepts valid option', () => {
  assert.equal(DirectorOptionSchema.safeParse(validOption).success, true);
});

test('DirectorOptionSchema rejects non-option_x id', () => {
  const bad = { ...validOption, id: 'option_z' };
  assert.equal(DirectorOptionSchema.safeParse(bad).success, false);
});

test('DirectorEventSchema accepts valid event', () => {
  assert.equal(DirectorEventSchema.safeParse(validEvent).success, true);
});

test('DirectorEventSchema rejects riskyOptionId pointing to non-risky option', () => {
  const bad = { ...validEvent, riskyOptionId: 'option_a' };
  const result = DirectorEventSchema.safeParse(bad);
  assert.equal(result.success, false);
  assert.ok(
    !result.success && result.error.issues.some(i => i.message.includes('riskyOptionId')),
    'expected riskyOptionId refine error',
  );
});

test('DirectorEventSchema rejects riskSuccessProbability out of [0,1]', () => {
  const bad = { ...validEvent, riskSuccessProbability: 1.5 };
  assert.equal(DirectorEventSchema.safeParse(bad).success, false);
});

test('DirectorEventSchema defaults researchKeywords to empty array', () => {
  const { researchKeywords: _, ...noKeywords } = validEvent;
  const result = DirectorEventSchema.safeParse(noKeywords);
  assert.equal(result.success, true);
  assert.deepEqual(result.success && result.data.researchKeywords, []);
});

test('DirectorEventBatchSchema accepts valid batch', () => {
  assert.equal(DirectorEventBatchSchema.safeParse(validBatch).success, true);
});

test('DirectorEventBatchSchema rejects empty events array', () => {
  const bad = { ...validBatch, events: [] };
  assert.equal(DirectorEventBatchSchema.safeParse(bad).success, false);
});

test('DirectorEventBatchSchema rejects more than 3 events', () => {
  const bad = { ...validBatch, events: [validEvent, validEvent, validEvent, validEvent] };
  assert.equal(DirectorEventBatchSchema.safeParse(bad).success, false);
});

test('DirectorEventBatchSchema rejects out-of-domain pacing', () => {
  const bad = { ...validBatch, pacing: 'frantic' };
  assert.equal(DirectorEventBatchSchema.safeParse(bad).success, false);
});

test('DirectorEventBatchSchema defaults reasoning to empty string', () => {
  const { reasoning: _, ...noReasoning } = validBatch;
  const result = DirectorEventBatchSchema.safeParse(noReasoning);
  assert.equal(result.success, true);
  assert.equal(result.success && result.data.reasoning, '');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/runtime/schemas/director.test.ts
```

Expected: fails with "Cannot find module './director.js'" or similar.

- [ ] **Step 3: Implement the schema**

Create `apps/paracosm/src/runtime/schemas/director.ts`:

```ts
/**
 * Zod schemas for the Event Director's batch output.
 *
 * Replaces the hand-rolled regex parser in the old director.ts. The
 * `.refine()` on DirectorEventSchema enforces the risky-option invariant
 * that the old parser silently accepted when the LLM pointed riskyOptionId
 * at a non-risky option.
 *
 * @module paracosm/runtime/schemas/director
 */
import { z } from 'zod';

/** A single choice presented to the commander. */
export const DirectorOptionSchema = z.object({
  id: z.string().regex(/^option_[a-c]$/, 'id must be option_a/b/c'),
  label: z.string().min(1),
  description: z.string().min(1),
  isRisky: z.boolean(),
});

/** One event generated by the director for a turn. */
export const DirectorEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  options: z.array(DirectorOptionSchema).min(2).max(3),
  riskyOptionId: z.string(),
  riskSuccessProbability: z.number().min(0).max(1),
  category: z.string().min(1),
  researchKeywords: z.array(z.string()).default([]),
  relevantDepartments: z.array(z.string()).min(1),
  turnSummary: z.string().min(1),
}).refine(
  evt => evt.options.some(o => o.id === evt.riskyOptionId && o.isRisky),
  { message: 'riskyOptionId must reference an option where isRisky=true' },
);

/** Full batch response — 1 to 3 events plus pacing + reasoning. */
export const DirectorEventBatchSchema = z.object({
  events: z.array(DirectorEventSchema).min(1).max(3),
  pacing: z.enum(['calm', 'normal', 'intense']),
  reasoning: z.string().default(''),
});

export type DirectorOptionZ = z.infer<typeof DirectorOptionSchema>;
export type DirectorEventZ = z.infer<typeof DirectorEventSchema>;
export type DirectorEventBatchZ = z.infer<typeof DirectorEventBatchSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/runtime/schemas/director.test.ts
```

Expected: all 11 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/runtime/schemas/director.ts src/runtime/schemas/director.test.ts
git commit -m "feat(schemas): add DirectorEventBatchSchema with risky-option refine"
```

---

## Task 3: DepartmentReportSchema with round-trip tests

**Files:**
- Create: `apps/paracosm/src/runtime/schemas/department.ts`
- Create: `apps/paracosm/src/runtime/schemas/department.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/paracosm/src/runtime/schemas/department.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DepartmentReportSchema,
  RiskSchema,
  OpportunitySchema,
  ForgedToolUsageSchema,
  RecommendedEffectSchema,
} from './department.js';

const validReport = {
  department: 'medical',
  summary: 'Radiation exposure is trending up; 3 near-threshold cases.',
  citations: [{ text: 'NASA HRP', url: 'https://example.com/hrp', context: 'dose study' }],
  risks: [{ severity: 'high', description: 'two crew near annual limit' }],
  opportunities: [],
  recommendedActions: ['Increase shielding on crew quarters'],
  proposedPatches: {},
  forgedToolsUsed: [],
  featuredAgentUpdates: [],
  confidence: 0.85,
  openQuestions: [],
  recommendedEffects: [],
};

test('DepartmentReportSchema accepts valid report', () => {
  assert.equal(DepartmentReportSchema.safeParse(validReport).success, true);
});

test('RiskSchema rejects out-of-domain severity', () => {
  assert.equal(RiskSchema.safeParse({ severity: 'catastrophic', description: 'x' }).success, false);
});

test('RiskSchema accepts all four severities', () => {
  for (const sev of ['low', 'medium', 'high', 'critical']) {
    assert.equal(RiskSchema.safeParse({ severity: sev, description: 'x' }).success, true);
  }
});

test('OpportunitySchema rejects out-of-domain impact', () => {
  assert.equal(OpportunitySchema.safeParse({ impact: 'massive', description: 'x' }).success, false);
});

test('ForgedToolUsageSchema rejects out-of-domain mode', () => {
  const bad = { name: 't', mode: 'script', description: 'x', output: {}, confidence: 0.5 };
  assert.equal(ForgedToolUsageSchema.safeParse(bad).success, false);
});

test('RecommendedEffectSchema rejects out-of-domain type', () => {
  const bad = { id: 'e1', type: 'magic', description: 'x' };
  assert.equal(RecommendedEffectSchema.safeParse(bad).success, false);
});

test('DepartmentReportSchema fills defaults when arrays omitted', () => {
  const minimal = {
    department: 'medical',
    summary: 'x',
    confidence: 0.7,
  };
  const result = DepartmentReportSchema.safeParse(minimal);
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.citations, []);
    assert.deepEqual(result.data.risks, []);
    assert.deepEqual(result.data.recommendedActions, []);
    assert.deepEqual(result.data.proposedPatches, {});
  }
});

test('DepartmentReportSchema rejects confidence out of [0,1]', () => {
  const bad = { ...validReport, confidence: 1.5 };
  assert.equal(DepartmentReportSchema.safeParse(bad).success, false);
});

test('DepartmentReportSchema rejects empty department string', () => {
  const bad = { ...validReport, department: '' };
  assert.equal(DepartmentReportSchema.safeParse(bad).success, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/runtime/schemas/department.test.ts
```

Expected: fails with module-not-found.

- [ ] **Step 3: Implement the schema**

Create `apps/paracosm/src/runtime/schemas/department.ts`:

```ts
/**
 * Zod schemas for department agent reports.
 *
 * The shape matches [contracts.ts `DepartmentReport`](../contracts.ts) so
 * downstream consumers (orchestrator, kernel, dashboard) can keep their
 * current typings. The schema adds structural defaults — the old
 * `emptyReport()` skeleton disappears once every caller migrates.
 *
 * @module paracosm/runtime/schemas/department
 */
import { z } from 'zod';

export const CitationSchema = z.object({
  text: z.string().min(1),
  url: z.string().min(1),
  doi: z.string().optional(),
  context: z.string().default(''),
});

export const RiskSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().min(1),
});

export const OpportunitySchema = z.object({
  impact: z.enum(['low', 'medium', 'high']),
  description: z.string().min(1),
});

export const ForgedToolUsageSchema = z.object({
  name: z.string().min(1),
  mode: z.enum(['compose', 'sandbox']),
  description: z.string().default(''),
  output: z.unknown(),  // tool output is inherently free-form; validation ends at the type tag
  confidence: z.number().min(0).max(1).default(0.7),
});

export const FeaturedAgentUpdateSchema = z.object({
  agentId: z.string().min(1),
  updates: z.object({
    health: z.record(z.unknown()).optional(),
    career: z.record(z.unknown()).optional(),
    narrative: z.object({ event: z.string() }).optional(),
  }),
});

/**
 * Typed effect the commander can select from dept recommendations.
 * Mirrors `TypedPolicyEffect` in contracts.ts.
 */
export const RecommendedEffectSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'resource_shift', 'capacity_expansion', 'population_intake',
    'risk_mitigation', 'governance_change', 'social_investment', 'research_bet',
  ]),
  description: z.string().default(''),
  colonyDelta: z.record(z.number()).optional(),
  politicsDelta: z.record(z.number()).optional(),
});

export const DepartmentReportSchema = z.object({
  department: z.string().min(1),
  summary: z.string().min(1),
  citations: z.array(CitationSchema).default([]),
  risks: z.array(RiskSchema).default([]),
  opportunities: z.array(OpportunitySchema).default([]),
  recommendedActions: z.array(z.string()).default([]),
  proposedPatches: z.record(z.unknown()).default({}),
  forgedToolsUsed: z.array(ForgedToolUsageSchema).default([]),
  featuredAgentUpdates: z.array(FeaturedAgentUpdateSchema).default([]),
  confidence: z.number().min(0).max(1).default(0.7),
  openQuestions: z.array(z.string()).default([]),
  recommendedEffects: z.array(RecommendedEffectSchema).default([]),
});

export type DepartmentReportZ = z.infer<typeof DepartmentReportSchema>;
export type RiskZ = z.infer<typeof RiskSchema>;
export type OpportunityZ = z.infer<typeof OpportunitySchema>;
export type RecommendedEffectZ = z.infer<typeof RecommendedEffectSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/runtime/schemas/department.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/runtime/schemas/department.ts src/runtime/schemas/department.test.ts
git commit -m "feat(schemas): add DepartmentReportSchema with nested risk/effect schemas"
```

---

## Task 4: CommanderDecisionSchema + PromotionsSchema with tests

**Files:**
- Create: `apps/paracosm/src/runtime/schemas/commander.ts`
- Create: `apps/paracosm/src/runtime/schemas/commander.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/paracosm/src/runtime/schemas/commander.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { CommanderDecisionSchema, PromotionsSchema } from './commander.js';

const validDecision = {
  selectedOptionId: 'option_b',
  decision: 'Deploy the experimental shield array',
  rationale: 'Engineering is confident; benefits outweigh risk.',
  reasoning: '1. My high openness favors the bold call.\n2. Eng confidence at 0.85.',
  departmentsConsulted: ['engineering', 'medical'],
  selectedPolicies: ['emergency_shield_deploy'],
  rejectedPolicies: [{ policy: 'wait_for_resupply', reason: 'too slow' }],
  expectedTradeoffs: ['short-term morale dip'],
  watchMetricsNextTurn: ['hull integrity', 'power draw'],
};

const validPromotions = {
  promotions: [
    { agentId: 'col-1', department: 'medical', role: 'Chief Medical Officer', reason: 'Top specialization score' },
  ],
};

test('CommanderDecisionSchema accepts valid decision', () => {
  assert.equal(CommanderDecisionSchema.safeParse(validDecision).success, true);
});

test('CommanderDecisionSchema defaults reasoning to empty string', () => {
  const { reasoning: _, ...noReasoning } = validDecision;
  const result = CommanderDecisionSchema.safeParse(noReasoning);
  assert.equal(result.success, true);
  assert.equal(result.success && result.data.reasoning, '');
});

test('CommanderDecisionSchema requires decision string', () => {
  const { decision: _, ...noDecision } = validDecision;
  assert.equal(CommanderDecisionSchema.safeParse(noDecision).success, false);
});

test('CommanderDecisionSchema defaults departmentsConsulted to empty array', () => {
  const { departmentsConsulted: _, ...noDepts } = validDecision;
  const result = CommanderDecisionSchema.safeParse(noDepts);
  assert.equal(result.success, true);
  assert.deepEqual(result.success && result.data.departmentsConsulted, []);
});

test('CommanderDecisionSchema accepts selectedEffectIds optional', () => {
  const withEffects = { ...validDecision, selectedEffectIds: ['effect_1'] };
  assert.equal(CommanderDecisionSchema.safeParse(withEffects).success, true);
});

test('PromotionsSchema accepts valid promotions', () => {
  assert.equal(PromotionsSchema.safeParse(validPromotions).success, true);
});

test('PromotionsSchema defaults to empty promotions array', () => {
  const result = PromotionsSchema.safeParse({});
  assert.equal(result.success, true);
  assert.deepEqual(result.success && result.data.promotions, []);
});

test('PromotionsSchema rejects promotion missing agentId', () => {
  const bad = { promotions: [{ department: 'medical', role: 'CMO', reason: 'x' }] };
  assert.equal(PromotionsSchema.safeParse(bad).success, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/runtime/schemas/commander.test.ts
```

Expected: fails with module-not-found.

- [ ] **Step 3: Implement the schemas**

Create `apps/paracosm/src/runtime/schemas/commander.ts`:

```ts
/**
 * Zod schemas for commander-session outputs.
 *
 * Shape matches [contracts.ts `CommanderDecision`](../contracts.ts) plus
 * one new field: `reasoning` (preserves CoT that was previously stripped
 * and thrown away). The schema is the target for sendAndValidate over
 * the commander session so its conversation memory survives validation
 * retries.
 *
 * @module paracosm/runtime/schemas/commander
 */
import { z } from 'zod';

export const CommanderDecisionSchema = z.object({
  selectedOptionId: z.string().optional(),
  selectedEffectIds: z.array(z.string()).optional(),
  decision: z.string().min(1),
  rationale: z.string().default(''),
  /**
   * Full stepwise reasoning. Replaces the old `<thinking>...</thinking>` tag
   * that was stripped before JSON parse and discarded. Populated BEFORE
   * the model commits to selectedOptionId so the field captures actual
   * deliberation, not post-hoc justification. Dashboard renders this
   * behind a "show full analysis" expand; rationale is the default view.
   */
  reasoning: z.string().default(''),
  departmentsConsulted: z.array(z.string()).default([]),
  selectedPolicies: z.array(z.string()).default([]),
  rejectedPolicies: z.array(
    z.object({ policy: z.string().min(1), reason: z.string().default('') })
  ).default([]),
  expectedTradeoffs: z.array(z.string()).default([]),
  watchMetricsNextTurn: z.array(z.string()).default([]),
});

export const PromotionEntrySchema = z.object({
  agentId: z.string().min(1),
  department: z.string().min(1),
  role: z.string().min(1),
  reason: z.string().default(''),
});

export const PromotionsSchema = z.object({
  promotions: z.array(PromotionEntrySchema).default([]),
});

export type CommanderDecisionZ = z.infer<typeof CommanderDecisionSchema>;
export type PromotionsZ = z.infer<typeof PromotionsSchema>;
export type PromotionEntryZ = z.infer<typeof PromotionEntrySchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/runtime/schemas/commander.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/runtime/schemas/commander.ts src/runtime/schemas/commander.test.ts
git commit -m "feat(schemas): add CommanderDecisionSchema with reasoning field + PromotionsSchema"
```

---

## Task 5: ReactionBatchSchema with tests

**Files:**
- Create: `apps/paracosm/src/runtime/schemas/reactions.ts`
- Create: `apps/paracosm/src/runtime/schemas/reactions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/paracosm/src/runtime/schemas/reactions.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { ReactionEntrySchema, ReactionBatchSchema } from './reactions.js';

const validEntry = {
  agentId: 'col-1',
  quote: 'This is happening fast. I keep telling myself to breathe.',
  mood: 'anxious',
  intensity: 0.7,
};
const validBatch = { reactions: [validEntry, { ...validEntry, agentId: 'col-2' }] };

test('ReactionEntrySchema accepts valid entry', () => {
  assert.equal(ReactionEntrySchema.safeParse(validEntry).success, true);
});

test('ReactionEntrySchema rejects out-of-domain mood', () => {
  const bad = { ...validEntry, mood: 'triumphant' };
  assert.equal(ReactionEntrySchema.safeParse(bad).success, false);
});

test('ReactionEntrySchema rejects intensity > 1', () => {
  const bad = { ...validEntry, intensity: 1.5 };
  assert.equal(ReactionEntrySchema.safeParse(bad).success, false);
});

test('ReactionEntrySchema rejects intensity < 0', () => {
  const bad = { ...validEntry, intensity: -0.1 };
  assert.equal(ReactionEntrySchema.safeParse(bad).success, false);
});

test('ReactionEntrySchema accepts all 7 moods', () => {
  for (const mood of ['positive', 'negative', 'neutral', 'anxious', 'defiant', 'hopeful', 'resigned']) {
    assert.equal(ReactionEntrySchema.safeParse({ ...validEntry, mood }).success, true);
  }
});

test('ReactionBatchSchema accepts valid wrapped batch', () => {
  assert.equal(ReactionBatchSchema.safeParse(validBatch).success, true);
});

test('ReactionBatchSchema rejects root-level array', () => {
  // JSON-mode providers reject arrays as root; we force object wrap
  assert.equal(ReactionBatchSchema.safeParse([validEntry]).success, false);
});

test('ReactionBatchSchema defaults reactions to empty array', () => {
  const result = ReactionBatchSchema.safeParse({});
  assert.equal(result.success, true);
  assert.deepEqual(result.success && result.data.reactions, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/runtime/schemas/reactions.test.ts
```

Expected: fails with module-not-found.

- [ ] **Step 3: Implement the schema**

Create `apps/paracosm/src/runtime/schemas/reactions.ts`:

```ts
/**
 * Zod schema for batched agent reactions.
 *
 * WHY WRAPPED IN AN OBJECT: OpenAI's `response_format: json_object` native
 * JSON mode rejects a root-level JSON array. The old reactions prompt
 * asked for `[{...}, ...]` directly, which worked with plain generateText
 * but breaks under generateObject's json_object hint. Wrapping in
 * { "reactions": [...] } satisfies the root-object constraint without
 * changing the downstream consumer (which already destructured `.reactions`
 * from the parsed result in some code paths).
 *
 * @module paracosm/runtime/schemas/reactions
 */
import { z } from 'zod';

export const MOOD_DOMAIN = [
  'positive', 'negative', 'neutral', 'anxious', 'defiant', 'hopeful', 'resigned',
] as const;

export const ReactionEntrySchema = z.object({
  agentId: z.string().min(1),
  quote: z.string().min(1),
  mood: z.enum(MOOD_DOMAIN),
  intensity: z.number().min(0).max(1),
});

export const ReactionBatchSchema = z.object({
  reactions: z.array(ReactionEntrySchema).default([]),
});

export type ReactionEntryZ = z.infer<typeof ReactionEntrySchema>;
export type ReactionBatchZ = z.infer<typeof ReactionBatchSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/runtime/schemas/reactions.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/runtime/schemas/reactions.ts src/runtime/schemas/reactions.test.ts
git commit -m "feat(schemas): add ReactionBatchSchema (wrapped for json_object mode)"
```

---

## Task 6: VerdictSchema with tests

**Files:**
- Create: `apps/paracosm/src/runtime/schemas/verdict.ts`
- Create: `apps/paracosm/src/runtime/schemas/verdict.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/paracosm/src/runtime/schemas/verdict.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { VerdictSchema, VerdictScoresSchema } from './verdict.js';

const validScores = {
  a: { survival: 8, prosperity: 7, morale: 6, innovation: 9 },
  b: { survival: 7, prosperity: 6, morale: 8, innovation: 5 },
};
const validVerdict = {
  winner: 'A',
  winnerName: 'Captain Reyes',
  headline: 'Bold shield deploy paid off',
  summary: 'Reyes traded short-term morale for hull integrity; it compounded.',
  keyDivergence: 'Turn 3 shield deploy vs resupply wait',
  scores: validScores,
  reasoning: '1. Population trajectory: A +5, B +2.\n2. Morale: A dipped then recovered.',
};

test('VerdictScoresSchema accepts valid scores', () => {
  assert.equal(VerdictScoresSchema.safeParse(validScores).success, true);
});

test('VerdictScoresSchema rejects score out of [0,10]', () => {
  const bad = { a: { ...validScores.a, survival: 11 }, b: validScores.b };
  assert.equal(VerdictScoresSchema.safeParse(bad).success, false);
});

test('VerdictSchema accepts valid verdict', () => {
  assert.equal(VerdictSchema.safeParse(validVerdict).success, true);
});

test('VerdictSchema accepts tie', () => {
  const tied = { ...validVerdict, winner: 'tie', winnerName: 'Tie' };
  assert.equal(VerdictSchema.safeParse(tied).success, true);
});

test('VerdictSchema rejects winner out of domain', () => {
  const bad = { ...validVerdict, winner: 'C' };
  assert.equal(VerdictSchema.safeParse(bad).success, false);
});

test('VerdictSchema defaults reasoning to empty string', () => {
  const { reasoning: _, ...noReasoning } = validVerdict;
  const result = VerdictSchema.safeParse(noReasoning);
  assert.equal(result.success, true);
  assert.equal(result.success && result.data.reasoning, '');
});

test('VerdictSchema requires headline', () => {
  const { headline: _, ...noHeadline } = validVerdict;
  assert.equal(VerdictSchema.safeParse(noHeadline).success, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/runtime/schemas/verdict.test.ts
```

Expected: fails with module-not-found.

- [ ] **Step 3: Implement the schema**

Create `apps/paracosm/src/runtime/schemas/verdict.ts`:

```ts
/**
 * Zod schema for the pair-runner verdict call.
 *
 * Replaces the existing `<thinking>...</thinking><verdict>{...}</verdict>`
 * transport. Reasoning (previously thrown away after the strip) now lives
 * in the `reasoning` field. The schema enforces 0-10 score bounds per
 * axis — the old parser silently accepted any number.
 *
 * @module paracosm/runtime/schemas/verdict
 */
import { z } from 'zod';

const ScoreAxesSchema = z.object({
  survival: z.number().min(0).max(10),
  prosperity: z.number().min(0).max(10),
  morale: z.number().min(0).max(10),
  innovation: z.number().min(0).max(10),
});

export const VerdictScoresSchema = z.object({
  a: ScoreAxesSchema,
  b: ScoreAxesSchema,
});

export const VerdictSchema = z.object({
  winner: z.enum(['A', 'B', 'tie']),
  winnerName: z.string().min(1),
  headline: z.string().min(1).max(80),
  summary: z.string().min(1),
  keyDivergence: z.string().min(1),
  scores: VerdictScoresSchema,
  reasoning: z.string().default(''),
});

export type VerdictZ = z.infer<typeof VerdictSchema>;
export type VerdictScoresZ = z.infer<typeof VerdictScoresSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/runtime/schemas/verdict.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/runtime/schemas/verdict.ts src/runtime/schemas/verdict.test.ts
git commit -m "feat(schemas): add VerdictSchema with reasoning field and score bounds"
```

---

## Task 7: generateValidatedObject wrapper (one-shot)

**Files:**
- Create: `apps/paracosm/src/runtime/llm-invocations/generateValidatedObject.ts`
- Create: `apps/paracosm/src/runtime/llm-invocations/generateValidatedObject.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/paracosm/src/runtime/llm-invocations/generateValidatedObject.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { generateValidatedObject } from './generateValidatedObject.js';

const TestSchema = z.object({ value: z.string() });

test('generateValidatedObject returns validated object on success', async () => {
  const mockGenerateObject = async () => ({
    object: { value: 'ok' },
    text: '{"value":"ok"}',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    finishReason: 'stop',
    provider: 'mock',
    model: 'mock-model',
  });
  const result = await generateValidatedObject({
    provider: 'mock',
    model: 'mock-model',
    schema: TestSchema,
    prompt: 'test',
    _generateObjectImpl: mockGenerateObject as any,
  });
  assert.equal(result.object.value, 'ok');
  assert.equal(result.fromFallback, false);
});

test('generateValidatedObject returns fallback on ObjectGenerationError', async () => {
  const { ObjectGenerationError } = await import('@framers/agentos');
  const mockGenerateObject = async () => {
    throw new ObjectGenerationError('bad', 'raw text', undefined as any);
  };
  let errorSeen = false;
  const result = await generateValidatedObject({
    provider: 'mock',
    model: 'mock-model',
    schema: TestSchema,
    prompt: 'test',
    fallback: { value: 'default' },
    onProviderError: () => { errorSeen = true; },
    _generateObjectImpl: mockGenerateObject as any,
  });
  assert.equal(result.object.value, 'default');
  assert.equal(result.fromFallback, true);
  assert.equal(errorSeen, true);
});

test('generateValidatedObject re-throws when no fallback', async () => {
  const { ObjectGenerationError } = await import('@framers/agentos');
  const mockGenerateObject = async () => {
    throw new ObjectGenerationError('bad', 'raw text', undefined as any);
  };
  await assert.rejects(
    () => generateValidatedObject({
      provider: 'mock',
      model: 'mock-model',
      schema: TestSchema,
      prompt: 'test',
      _generateObjectImpl: mockGenerateObject as any,
    }),
    /bad/,
  );
});

test('generateValidatedObject calls onUsage on success', async () => {
  const mockGenerateObject = async () => ({
    object: { value: 'ok' },
    text: '{}',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, costUSD: 0.001 },
    finishReason: 'stop',
    provider: 'mock',
    model: 'mock-model',
  });
  let usageSeen: any = null;
  await generateValidatedObject({
    provider: 'mock',
    model: 'mock-model',
    schema: TestSchema,
    prompt: 'test',
    onUsage: (r) => { usageSeen = r.usage; },
    _generateObjectImpl: mockGenerateObject as any,
  });
  assert.equal(usageSeen.totalTokens, 15);
  assert.equal(usageSeen.costUSD, 0.001);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/runtime/llm-invocations/generateValidatedObject.test.ts
```

Expected: module-not-found error.

- [ ] **Step 3: Implement the wrapper**

Create `apps/paracosm/src/runtime/llm-invocations/generateValidatedObject.ts`:

```ts
/**
 * One-shot schema-validated LLM call, wrapping AgentOS's generateObject
 * with paracosm's run-level observability (cost tracking, provider error
 * classification) and a caller-provided fallback on validation failure.
 *
 * Use this for LLM calls that DO NOT need conversation memory: director,
 * reactions, verdict. Session-based call sites (commander, departments)
 * use sendAndValidate instead.
 *
 * @module paracosm/runtime/llm-invocations/generateValidatedObject
 */
import {
  generateObject as agentosGenerateObject,
  ObjectGenerationError,
} from '@framers/agentos';
import type { ZodType, z } from 'zod';

export interface ValidatedObjectOptions<T extends ZodType> {
  provider: string;
  model: string;
  schema: T;
  schemaName?: string;
  schemaDescription?: string;
  /** Cached system block (goes through systemBlocks with cacheBreakpoint:true). */
  systemCacheable?: string;
  /** Non-cached system content appended after the cached block. */
  systemTail?: string;
  prompt: string;
  maxRetries?: number;
  onUsage?: (r: { usage?: { totalTokens?: number; promptTokens?: number; completionTokens?: number; costUSD?: number } }) => void;
  onProviderError?: (err: unknown) => void;
  fallback?: z.infer<T>;
  /**
   * Dependency-injection hook for tests. Production callers omit this
   * and let the default AgentOS import take effect.
   *
   * @internal
   */
  _generateObjectImpl?: typeof agentosGenerateObject;
}

export interface ValidatedObjectResult<T> {
  object: T;
  fromFallback: boolean;
  rawText: string;
  usage?: { totalTokens?: number; promptTokens?: number; completionTokens?: number; costUSD?: number };
}

/**
 * Call AgentOS generateObject with paracosm's cost-tracking and fallback
 * conventions. On `ObjectGenerationError`, fires onProviderError and
 * either returns the caller's fallback (marked fromFallback:true) or
 * re-throws if no fallback was supplied.
 */
export async function generateValidatedObject<T extends ZodType>(
  opts: ValidatedObjectOptions<T>,
): Promise<ValidatedObjectResult<z.infer<T>>> {
  const impl = opts._generateObjectImpl ?? agentosGenerateObject;

  const systemBlocks: Array<{ text: string; cacheBreakpoint?: boolean }> = [];
  if (opts.systemCacheable) systemBlocks.push({ text: opts.systemCacheable, cacheBreakpoint: true });
  if (opts.systemTail) systemBlocks.push({ text: opts.systemTail });

  try {
    const result = await impl({
      provider: opts.provider,
      model: opts.model,
      schema: opts.schema,
      schemaName: opts.schemaName,
      schemaDescription: opts.schemaDescription,
      system: systemBlocks.length ? systemBlocks : undefined,
      prompt: opts.prompt,
      maxRetries: opts.maxRetries,
    });
    opts.onUsage?.({ usage: result.usage });
    return {
      object: result.object,
      fromFallback: false,
      rawText: result.text,
      usage: result.usage,
    };
  } catch (err) {
    opts.onProviderError?.(err);
    if (err instanceof ObjectGenerationError && opts.fallback !== undefined) {
      return {
        object: opts.fallback,
        fromFallback: true,
        rawText: err.rawText,
      };
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/runtime/llm-invocations/generateValidatedObject.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/runtime/llm-invocations/generateValidatedObject.ts src/runtime/llm-invocations/generateValidatedObject.test.ts
git commit -m "feat(llm): add generateValidatedObject one-shot wrapper"
```

---

## Task 8: sendAndValidate wrapper (session-aware)

**Files:**
- Create: `apps/paracosm/src/runtime/llm-invocations/sendAndValidate.ts`
- Create: `apps/paracosm/src/runtime/llm-invocations/sendAndValidate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/paracosm/src/runtime/llm-invocations/sendAndValidate.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { sendAndValidate } from './sendAndValidate.js';

const TestSchema = z.object({ value: z.string() });

function makeMockSession(responses: string[]) {
  const history: string[] = [];
  let idx = 0;
  return {
    history,
    send: async (prompt: string) => {
      history.push(prompt);
      const text = responses[idx] ?? responses[responses.length - 1];
      idx++;
      return { text, usage: { totalTokens: 10 } };
    },
  };
}

test('sendAndValidate returns validated object on first try', async () => {
  const session = makeMockSession(['{"value":"ok"}']);
  const result = await sendAndValidate({
    session,
    prompt: 'please return JSON',
    schema: TestSchema,
  });
  assert.equal(result.object.value, 'ok');
  assert.equal(result.fromFallback, false);
  assert.equal(session.history.length, 1);
});

test('sendAndValidate retries on parse failure', async () => {
  const session = makeMockSession([
    'not json at all',
    '{"value":"fixed"}',
  ]);
  const result = await sendAndValidate({
    session,
    prompt: 'please return JSON',
    schema: TestSchema,
  });
  assert.equal(result.object.value, 'fixed');
  assert.equal(result.fromFallback, false);
  assert.equal(session.history.length, 2);
  assert.match(session.history[1], /did not match|not valid JSON/i);
});

test('sendAndValidate retries on schema validation failure', async () => {
  const session = makeMockSession([
    '{"wrong":"shape"}',
    '{"value":"right"}',
  ]);
  const result = await sendAndValidate({
    session,
    prompt: 'please return JSON',
    schema: TestSchema,
  });
  assert.equal(result.object.value, 'right');
  assert.equal(session.history.length, 2);
  assert.match(session.history[1], /Validation errors/);
});

test('sendAndValidate preserves session history across retries', async () => {
  const session = makeMockSession([
    'garbage',
    '{"value":"ok"}',
  ]);
  await sendAndValidate({
    session,
    prompt: 'original prompt',
    schema: TestSchema,
  });
  assert.equal(session.history[0], 'original prompt');
  assert.match(session.history[1], /previous|validation|json/i);
});

test('sendAndValidate returns fallback after exhausted retries', async () => {
  const session = makeMockSession(['garbage', 'garbage', 'garbage']);
  let errorSeen = false;
  const result = await sendAndValidate({
    session,
    prompt: 'please return JSON',
    schema: TestSchema,
    maxRetries: 2,
    fallback: { value: 'default' },
    onProviderError: () => { errorSeen = true; },
  });
  assert.equal(result.object.value, 'default');
  assert.equal(result.fromFallback, true);
  assert.equal(errorSeen, true);
  assert.equal(session.history.length, 3);  // initial + 2 retries
});

test('sendAndValidate throws after exhausted retries when no fallback', async () => {
  const session = makeMockSession(['garbage', 'garbage', 'garbage']);
  await assert.rejects(
    () => sendAndValidate({
      session,
      prompt: 'please return JSON',
      schema: TestSchema,
      maxRetries: 2,
    }),
    /Validation failed/,
  );
});

test('sendAndValidate fires onUsage for every attempt', async () => {
  const session = makeMockSession(['garbage', '{"value":"ok"}']);
  const usages: any[] = [];
  await sendAndValidate({
    session,
    prompt: 'test',
    schema: TestSchema,
    onUsage: (r) => usages.push(r.usage),
  });
  assert.equal(usages.length, 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/runtime/llm-invocations/sendAndValidate.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement the wrapper**

Create `apps/paracosm/src/runtime/llm-invocations/sendAndValidate.ts`:

```ts
/**
 * Session-aware schema-validated wrapper over an AgentOS session's
 * `.send()` call. Adds a retry-with-Zod-feedback loop while preserving
 * the session's accumulating conversation history.
 *
 * Why not use AgentOS generateObject for commander / department reports?
 * Those agents rely on session memory — the commander remembers prior
 * events, its own rationale, and the promotion decisions it made at
 * turn 0; dept heads remember their prior analyses and forged tools.
 * generateObject is one-shot and would discard that memory. This wrapper
 * keeps session.send() as the transport and layers Zod validation on top.
 *
 * The retry message is sent as a new user turn in the SAME session, so
 * the model's own prior malformed output is already in its immediate
 * context when it receives the corrective message. That is what makes
 * the retry self-correcting rather than blind.
 *
 * @module paracosm/runtime/llm-invocations/sendAndValidate
 */
import { extractJson, ObjectGenerationError } from '@framers/agentos';
import type { ZodType, ZodError, z } from 'zod';

export interface SessionLike {
  send: (prompt: string) => Promise<{ text: string; usage?: any }>;
}

export interface SendAndValidateOptions<T extends ZodType> {
  session: SessionLike;
  prompt: string;
  schema: T;
  maxRetries?: number;
  onUsage?: (r: { usage?: any }) => void;
  onProviderError?: (err: unknown) => void;
  fallback?: z.infer<T>;
}

export interface SendAndValidateResult<T> {
  object: T;
  fromFallback: boolean;
  rawText: string;
}

const MAX_ZOD_ERRORS_IN_FEEDBACK = 5;
const MAX_FEEDBACK_BAD_RESPONSE_CHARS = 500;

function summarizeZodErrors(err: ZodError | undefined): string {
  if (!err) return '(unknown validation error)';
  const issues = err.issues.slice(0, MAX_ZOD_ERRORS_IN_FEEDBACK);
  const lines = issues.map(i => `- ${i.path.join('.') || '<root>'}: ${i.message}`);
  if (err.issues.length > MAX_ZOD_ERRORS_IN_FEEDBACK) {
    lines.push(`(${err.issues.length - MAX_ZOD_ERRORS_IN_FEEDBACK} more issues omitted)`);
  }
  return lines.join('\n');
}

function truncate(text: string): string {
  return text.length <= MAX_FEEDBACK_BAD_RESPONSE_CHARS
    ? text
    : `${text.slice(0, MAX_FEEDBACK_BAD_RESPONSE_CHARS)}... (truncated)`;
}

function buildRetryPrompt(err: ZodError | undefined, parseError?: string): string {
  if (parseError) {
    return `Your previous response was not valid JSON (${parseError}). Return ONLY a valid JSON object matching the schema. No markdown, no code fences, no explanation.`;
  }
  return `Your previous JSON did not match the required schema. Validation errors:\n${summarizeZodErrors(err)}\n\nReturn ONLY the corrected JSON object. No markdown, no code fences, no explanation.`;
}

export async function sendAndValidate<T extends ZodType>(
  opts: SendAndValidateOptions<T>,
): Promise<SendAndValidateResult<z.infer<T>>> {
  const maxRetries = opts.maxRetries ?? 2;
  let lastError: ZodError | undefined;
  let lastText = '';
  let lastParseError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const prompt = attempt === 0
      ? opts.prompt
      : buildRetryPrompt(lastError, lastParseError);

    const r = await opts.session.send(prompt);
    opts.onUsage?.({ usage: r.usage });
    lastText = r.text;
    lastParseError = undefined;

    let parsed: unknown;
    try {
      parsed = extractJson(r.text);
    } catch (parseErr) {
      lastParseError = (parseErr as Error).message;
      continue;
    }

    const validation = opts.schema.safeParse(parsed);
    if (validation.success) {
      return { object: validation.data, fromFallback: false, rawText: r.text };
    }
    lastError = validation.error;
  }

  const err = new ObjectGenerationError(
    `Validation failed after ${maxRetries + 1} attempts`,
    lastText,
    lastError,
  );
  opts.onProviderError?.(err);
  if (opts.fallback !== undefined) {
    return { object: opts.fallback, fromFallback: true, rawText: lastText };
  }
  throw err;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/runtime/llm-invocations/sendAndValidate.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/runtime/llm-invocations/sendAndValidate.ts src/runtime/llm-invocations/sendAndValidate.test.ts
git commit -m "feat(llm): add sendAndValidate session-aware wrapper with retry feedback loop"
```

---

## Task 9: hexaco-cues trajectory + translation helpers

**Files:**
- Create: `apps/paracosm/src/runtime/hexaco-cues/trajectory.ts`
- Create: `apps/paracosm/src/runtime/hexaco-cues/translation.ts`
- Create: `apps/paracosm/src/runtime/hexaco-cues/trajectory.test.ts`
- Create: `apps/paracosm/src/runtime/hexaco-cues/translation.test.ts`

- [ ] **Step 1: Write the failing tests for trajectory**

Create `apps/paracosm/src/runtime/hexaco-cues/trajectory.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrajectoryCue } from './trajectory.js';
import type { HexacoProfile, HexacoSnapshot } from '../../engine/core/state.js';

const baseline: HexacoProfile = {
  openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
  agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5,
};

test('buildTrajectoryCue returns empty string when history has no baseline', () => {
  assert.equal(buildTrajectoryCue([], baseline), '');
});

test('buildTrajectoryCue returns empty string when drift below threshold', () => {
  const history: HexacoSnapshot[] = [{ turn: 0, year: 2040, hexaco: baseline }];
  const current = { ...baseline, openness: 0.52 };  // +0.02 < 0.05 threshold
  assert.equal(buildTrajectoryCue(history, current), '');
});

test('buildTrajectoryCue fires "measurably" when drift >= 0.05 and < 0.15', () => {
  const history: HexacoSnapshot[] = [{ turn: 0, year: 2040, hexaco: baseline }];
  const current = { ...baseline, openness: 0.58 };  // +0.08
  const cue = buildTrajectoryCue(history, current);
  assert.match(cue, /measurably/);
  assert.match(cue, /toward higher openness/);
  assert.doesNotMatch(cue, /substantially/);
});

test('buildTrajectoryCue fires "substantially" when drift >= 0.15', () => {
  const history: HexacoSnapshot[] = [{ turn: 0, year: 2040, hexaco: baseline }];
  const current = { ...baseline, openness: 0.70 };  // +0.20
  const cue = buildTrajectoryCue(history, current);
  assert.match(cue, /substantially/);
  assert.match(cue, /toward higher openness/);
});

test('buildTrajectoryCue fires "away from" on negative drift', () => {
  const history: HexacoSnapshot[] = [{ turn: 0, year: 2040, hexaco: baseline }];
  const current = { ...baseline, conscientiousness: 0.35 };  // -0.15
  const cue = buildTrajectoryCue(history, current);
  assert.match(cue, /away from higher conscientiousness/);
});

test('buildTrajectoryCue joins multiple drifted traits with "and"', () => {
  const history: HexacoSnapshot[] = [{ turn: 0, year: 2040, hexaco: baseline }];
  const current = { ...baseline, openness: 0.70, conscientiousness: 0.35 };
  const cue = buildTrajectoryCue(history, current);
  assert.match(cue, /openness/);
  assert.match(cue, /conscientiousness/);
  assert.match(cue, / and /);
});

test('buildTrajectoryCue renames honestyHumility to honesty-humility', () => {
  const history: HexacoSnapshot[] = [{ turn: 0, year: 2040, hexaco: baseline }];
  const current = { ...baseline, honestyHumility: 0.70 };
  const cue = buildTrajectoryCue(history, current);
  assert.match(cue, /honesty-humility/);
  assert.doesNotMatch(cue, /honestyHumility/);
});
```

- [ ] **Step 2: Write the failing tests for translation**

Create `apps/paracosm/src/runtime/hexaco-cues/translation.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReactionCues } from './translation.js';
import type { HexacoProfile } from '../../engine/core/state.js';

const neutral: HexacoProfile = {
  openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
  agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5,
};

test('buildReactionCues returns empty string for all-neutral HEXACO', () => {
  assert.equal(buildReactionCues(neutral), '');
});

test('buildReactionCues fires high-pole cue above 0.7', () => {
  const cue = buildReactionCues({ ...neutral, emotionality: 0.85 });
  assert.match(cue, /you feel events/);
});

test('buildReactionCues fires low-pole cue below 0.3', () => {
  const cue = buildReactionCues({ ...neutral, emotionality: 0.2 });
  assert.match(cue, /stay flat/);
});

test('buildReactionCues does not fire cue between thresholds', () => {
  const cue = buildReactionCues({ ...neutral, emotionality: 0.5 });
  assert.doesNotMatch(cue, /feel events/);
  assert.doesNotMatch(cue, /stay flat/);
});

test('buildReactionCues caps output at 3 cues', () => {
  const allHigh: HexacoProfile = {
    openness: 0.9, conscientiousness: 0.9, extraversion: 0.9,
    agreeableness: 0.9, emotionality: 0.9, honestyHumility: 0.9,
  };
  const cue = buildReactionCues(allHigh);
  const cueCount = cue.split(';').length;
  assert.ok(cueCount <= 3, `expected <= 3 cues, got ${cueCount}: ${cue}`);
});

test('buildReactionCues covers each of the six axes at both poles', () => {
  // Each axis hitting high pole should produce SOMETHING (non-empty)
  for (const trait of ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'emotionality', 'honestyHumility'] as const) {
    const high = { ...neutral, [trait]: 0.85 };
    const low = { ...neutral, [trait]: 0.15 };
    assert.notEqual(buildReactionCues(high), '', `${trait} high should fire`);
    assert.notEqual(buildReactionCues(low), '', `${trait} low should fire`);
  }
});
```

- [ ] **Step 3: Run trajectory tests to verify they fail**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/runtime/hexaco-cues/trajectory.test.ts src/runtime/hexaco-cues/translation.test.ts
```

Expected: module-not-found errors.

- [ ] **Step 4: Implement trajectory.ts**

Create `apps/paracosm/src/runtime/hexaco-cues/trajectory.ts`:

```ts
/**
 * HEXACO trajectory cue — converts a `hexacoHistory` array + current
 * profile into a concise prose line the LLM can read as "how I've
 * evolved since I took command."
 *
 * Thresholds match the kernel's drift rate cap from progression.ts
 * (±0.05/turn): 0.05 is the minimum meaningful drift, 0.15 is three
 * full-cap turns' worth and qualifies as "substantially."
 *
 * @module paracosm/runtime/hexaco-cues/trajectory
 */
import { HEXACO_TRAITS, type HexacoProfile, type HexacoSnapshot } from '../../engine/core/state.js';

const MIN_DRIFT = 0.05;         // floor: one full-cap turn of pull
const SUBSTANTIAL_DRIFT = 0.15; // three turns' worth

/**
 * Build a prose cue describing personality drift since the first
 * snapshot in `history`. Returns an empty string when drift is too
 * small to be meaningful, or when history has no baseline.
 */
export function buildTrajectoryCue(
  history: HexacoSnapshot[],
  current: HexacoProfile,
): string {
  if (history.length < 1) return '';
  const baseline = history[0].hexaco;

  const lines: string[] = [];
  for (const trait of HEXACO_TRAITS) {
    const delta = current[trait] - baseline[trait];
    if (Math.abs(delta) < MIN_DRIFT) continue;
    const direction = delta > 0 ? 'toward' : 'away from';
    const displayTrait = trait === 'honestyHumility' ? 'honesty-humility' : trait;
    const magnitude = Math.abs(delta) >= SUBSTANTIAL_DRIFT ? 'substantially' : 'measurably';
    lines.push(`${magnitude} ${direction} higher ${displayTrait}`);
  }

  if (!lines.length) return '';
  return `Since you took command, your personality has drifted ${lines.join(' and ')}. Notice how recent decisions have shaped your judgment.`;
}
```

- [ ] **Step 5: Implement translation.ts**

Create `apps/paracosm/src/runtime/hexaco-cues/translation.ts`:

```ts
/**
 * Reaction cue translation — turns raw HEXACO numbers into 1-3 short
 * behavioral cue strings the reacting agent's LLM prompt can use directly.
 *
 * Thresholds 0.7 / 0.3 match the poles used in commander and dept-head
 * prompts so all trait-driven voice is uniform across the system.
 *
 * Output is capped at 3 cues (selection: first-hit across trait order)
 * to keep per-agent batch blocks small. Reactions batch at 10 agents/call
 * so every 10 extra tokens per agent compounds.
 *
 * @module paracosm/runtime/hexaco-cues/translation
 */
import type { HexacoProfile } from '../../engine/core/state.js';

const MAX_CUES = 3;

/**
 * Turn a HEXACO profile into a concise cue string like
 * "Your inner voice: you feel events in your body before words; you look for
 * what this moment makes possible." Empty string when no trait is
 * polarized past the thresholds.
 */
export function buildReactionCues(h: HexacoProfile): string {
  const cues: string[] = [];

  if (h.emotionality > 0.7) cues.push('you feel events in your body before words');
  if (h.emotionality < 0.3) cues.push('you stay flat when others panic');

  if (h.openness > 0.7) cues.push('you look for what this moment makes possible');
  if (h.openness < 0.3) cues.push('you stick to what has worked');

  if (h.honestyHumility > 0.7) cues.push('you say what you really think');
  if (h.honestyHumility < 0.3) cues.push('you speak strategically, not confessionally');

  if (h.conscientiousness > 0.7) cues.push('you want a plan before you move');
  if (h.conscientiousness < 0.3) cues.push('you move first and adjust mid-stride');

  if (h.extraversion > 0.7) cues.push('you say it out loud rather than sit with it');
  if (h.extraversion < 0.3) cues.push('you process inward and speak only after');

  if (h.agreeableness > 0.7) cues.push('you want to hold the group together through this');
  if (h.agreeableness < 0.3) cues.push('you don\'t owe anyone smoothness right now');

  if (cues.length === 0) return '';
  return `Your inner voice: ${cues.slice(0, MAX_CUES).join('; ')}.`;
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/runtime/hexaco-cues/trajectory.test.ts src/runtime/hexaco-cues/translation.test.ts
```

Expected: all 13 tests pass (7 trajectory + 6 translation).

- [ ] **Step 7: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/runtime/hexaco-cues/
git commit -m "feat(hexaco): add trajectory and translation cue helpers"
```

---

## Task 10: Full-trait drift + driftCommanderHexaco helper

**Files:**
- Modify: `apps/paracosm/src/engine/core/progression.ts`
- Create: `apps/paracosm/src/engine/core/progression.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/paracosm/src/engine/core/progression.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { driftCommanderHexaco, applyPersonalityDrift } from './progression.js';
import { HEXACO_TRAITS, type HexacoProfile, type HexacoSnapshot } from './state.js';

const baseline = (): HexacoProfile => ({
  openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
  agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5,
});

test('driftCommanderHexaco pushes initial snapshot on first call', () => {
  const hex = baseline();
  const history: HexacoSnapshot[] = [];
  driftCommanderHexaco(hex, null, 1, 1, 2041, history);
  assert.equal(history.length, 1);
  assert.equal(history[0].turn, 1);
});

test('driftCommanderHexaco does not drift when outcome is null', () => {
  const hex = baseline();
  const history: HexacoSnapshot[] = [];
  driftCommanderHexaco(hex, null, 1, 1, 2041, history);
  for (const trait of HEXACO_TRAITS) {
    assert.equal(hex[trait], 0.5);
  }
});

test('driftCommanderHexaco drifts openness up on risky_success', () => {
  const hex = baseline();
  const history: HexacoSnapshot[] = [];
  driftCommanderHexaco(hex, 'risky_success', 1, 1, 2041, history);
  assert.ok(hex.openness > 0.5, `expected openness > 0.5, got ${hex.openness}`);
});

test('driftCommanderHexaco drifts openness DOWN on risky_failure', () => {
  const hex = baseline();
  const history: HexacoSnapshot[] = [];
  driftCommanderHexaco(hex, 'risky_failure', 1, 1, 2041, history);
  assert.ok(hex.openness < 0.5, `expected openness < 0.5, got ${hex.openness}`);
});

test('driftCommanderHexaco drifts extraversion on risky_success (new trait)', () => {
  const hex = baseline();
  const history: HexacoSnapshot[] = [];
  driftCommanderHexaco(hex, 'risky_success', 1, 1, 2041, history);
  assert.ok(hex.extraversion > 0.5);
});

test('driftCommanderHexaco drifts emotionality on risky_failure (new trait)', () => {
  const hex = baseline();
  const history: HexacoSnapshot[] = [];
  driftCommanderHexaco(hex, 'risky_failure', 1, 1, 2041, history);
  assert.ok(hex.emotionality > 0.5);
});

test('driftCommanderHexaco respects ±0.05/turn rate cap', () => {
  const hex = baseline();
  const history: HexacoSnapshot[] = [];
  driftCommanderHexaco(hex, 'risky_success', 1, 1, 2041, history);
  // No single trait should have drifted more than 0.05 in one turn
  for (const trait of HEXACO_TRAITS) {
    assert.ok(Math.abs(hex[trait] - 0.5) <= 0.05, `${trait} drifted too far: ${hex[trait]}`);
  }
});

test('driftCommanderHexaco respects [0.05, 0.95] bounds', () => {
  const hex: HexacoProfile = { ...baseline(), openness: 0.94 };
  const history: HexacoSnapshot[] = [];
  for (let i = 0; i < 10; i++) {
    driftCommanderHexaco(hex, 'risky_success', 1, i, 2041 + i, history);
  }
  assert.ok(hex.openness <= 0.95, `openness exceeded upper bound: ${hex.openness}`);
});

test('driftCommanderHexaco appends snapshot each call', () => {
  const hex = baseline();
  const history: HexacoSnapshot[] = [];
  driftCommanderHexaco(hex, 'risky_success', 1, 1, 2041, history);
  driftCommanderHexaco(hex, 'conservative_success', 1, 2, 2042, history);
  driftCommanderHexaco(hex, 'risky_failure', 1, 3, 2043, history);
  assert.equal(history.length, 3);
  assert.equal(history[0].turn, 1);
  assert.equal(history[2].turn, 3);
});

test('applyPersonalityDrift still drifts openness + conscientiousness', () => {
  const agent = {
    core: { id: 'c1', name: 'X', birthYear: 2010, department: 'medical', role: 'CMO', marsborn: false },
    health: { alive: true, psychScore: 0.8, conditions: [] },
    career: { specialization: 'general', yearsExperience: 5, rank: 'senior' as const, achievements: [] },
    social: { childrenIds: [], friendIds: [], earthContacts: 0 },
    narrative: { featured: false, lifeEvents: [] },
    hexaco: baseline(),
    promotion: { department: 'medical', role: 'CMO', turnPromoted: 0, promotedBy: 'X' } as any,
    hexacoHistory: [] as HexacoSnapshot[],
    memory: { shortTerm: [], longTerm: [], stances: {}, relationships: {} },
  };
  applyPersonalityDrift([agent as any], baseline(), 'risky_success', 1, 1, 2041);
  assert.ok(agent.hexaco.openness > 0.5);
});

test('applyPersonalityDrift drifts NEW traits (E, A, Em, HH)', () => {
  const agent = {
    core: { id: 'c1', name: 'X', birthYear: 2010, department: 'medical', role: 'CMO', marsborn: false },
    health: { alive: true, psychScore: 0.8, conditions: [] },
    career: { specialization: 'general', yearsExperience: 5, rank: 'senior' as const, achievements: [] },
    social: { childrenIds: [], friendIds: [], earthContacts: 0 },
    narrative: { featured: false, lifeEvents: [] },
    hexaco: baseline(),
    promotion: { department: 'medical', role: 'CMO', turnPromoted: 0, promotedBy: 'X' } as any,
    hexacoHistory: [] as HexacoSnapshot[],
    memory: { shortTerm: [], longTerm: [], stances: {}, relationships: {} },
  };
  applyPersonalityDrift([agent as any], baseline(), 'risky_failure', 1, 1, 2041);
  // risky_failure: emotionality +0.03 (activates under threat)
  assert.ok(agent.hexaco.emotionality > 0.5, `expected emotionality drift on risky_failure; got ${agent.hexaco.emotionality}`);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/engine/core/progression.test.ts
```

Expected: fails with "driftCommanderHexaco is not a function" (and the new-trait test currently fails too).

- [ ] **Step 3: Expand outcome-pull table and add driftCommanderHexaco in progression.ts**

Modify `apps/paracosm/src/engine/core/progression.ts`. Find the block at lines 46-56 (inside `applyPersonalityDrift`, after the role-pull block):

Replace this block:

```ts
      // Outcome pull: success/failure reinforces or punishes traits
      if (turnOutcome) {
        if (trait === 'openness') {
          if (turnOutcome === 'risky_success') pull += 0.03;
          if (turnOutcome === 'risky_failure') pull -= 0.04;
          if (turnOutcome === 'conservative_failure') pull += 0.02;
        }
        if (trait === 'conscientiousness') {
          if (turnOutcome === 'risky_failure') pull += 0.03;
          if (turnOutcome === 'conservative_success') pull += 0.02;
        }
      }
```

With:

```ts
      // Outcome pull: success/failure reinforces or punishes traits.
      // Each entry is small (<= 0.03) so combined drift across sources
      // stays under the ±0.05 per-turn rate cap applied below.
      if (turnOutcome) {
        pull += outcomePullForTrait(trait, turnOutcome);
      }
```

Then ABOVE `applyPersonalityDrift` (before its definition), add the shared helper:

```ts
/**
 * Per-trait outcome-pull magnitudes covering all six HEXACO axes.
 *
 * Values are small (≤ 0.03) so combined with leader-pull (0.02) and
 * role-pull (0.01) the per-turn rate cap (±0.05) is still reachable but
 * not routinely exceeded. Each entry is anchored in trait-activation
 * research so the drift reads as plausible personality evolution rather
 * than arbitrary numerical churn.
 *
 * Citations:
 *   Openness ↔ exploration success — Silvia & Sanders 2010
 *   Conscientiousness ↔ discipline under failure — Roberts et al. 2006
 *   Extraversion reward sensitivity — Smillie et al. 2012
 *   Agreeableness ↔ cooperation under abundance — Graziano et al. 2007
 *   Emotionality activation under threat — Lee & Ashton 2004
 *   Honesty-Humility ↔ strategic behavior — Hilbig & Zettler 2009
 */
function outcomePullForTrait(trait: keyof HexacoProfile, outcome: TurnOutcome): number {
  switch (trait) {
    case 'openness':
      if (outcome === 'risky_success') return 0.03;
      if (outcome === 'risky_failure') return -0.04;
      if (outcome === 'conservative_failure') return 0.02;
      return 0;
    case 'conscientiousness':
      if (outcome === 'risky_failure') return 0.03;
      if (outcome === 'conservative_success') return 0.02;
      return 0;
    case 'extraversion':
      // bold call paid off reinforces assertive command presence
      if (outcome === 'risky_success') return 0.02;
      // public embarrassment after bold call
      if (outcome === 'risky_failure') return -0.02;
      return 0;
    case 'agreeableness':
      // team coordination worked
      if (outcome === 'conservative_success') return 0.02;
      // interpersonal friction after loss
      if (outcome === 'risky_failure') return -0.02;
      return 0;
    case 'emotionality':
      // crisis heightens anxiety/empathy (Lee & Ashton 2004 Table 1)
      if (outcome === 'risky_failure') return 0.03;
      if (outcome === 'conservative_failure') return 0.02;
      return 0;
    case 'honestyHumility':
      // survivors-write-history: bold wins erode transparent attribution
      if (outcome === 'risky_success') return -0.02;
      // measured honesty rewarded
      if (outcome === 'conservative_success') return 0.02;
      return 0;
    default:
      return 0;
  }
}
```

At the bottom of the file (after `progressBetweenTurns`), add the commander drift helper:

```ts
/**
 * Apply outcome-pull drift to the commander's HEXACO profile.
 *
 * Unlike {@link applyPersonalityDrift} which runs on promoted agents,
 * the commander has no leader to pull them (they ARE the leader) and no
 * department role to activate. Only outcome-pull applies. Same rate cap
 * (±0.05/turn) and bounds [0.05, 0.95] so commander drift and agent
 * drift stay in the same numerical regime.
 *
 * Mutates `leaderHexaco` and `history` in place. Push `{ turn: 0, year,
 * hexaco: {...initial} }` onto `history` BEFORE the first call so
 * downstream consumers of `history[0]` see the starting baseline, not
 * the first drifted state.
 */
export function driftCommanderHexaco(
  leaderHexaco: HexacoProfile,
  outcome: TurnOutcome | null,
  yearDelta: number,
  turn: number,
  year: number,
  history: HexacoSnapshot[],
): void {
  for (const trait of HEXACO_TRAITS) {
    let pull = 0;
    if (outcome) pull += outcomePullForTrait(trait, outcome);
    const delta = Math.max(-0.05, Math.min(0.05, pull)) * yearDelta;
    leaderHexaco[trait] = Math.max(0.05, Math.min(0.95, leaderHexaco[trait] + delta));
  }
  history.push({ turn, year, hexaco: { ...leaderHexaco } });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/engine/core/progression.test.ts
```

Expected: all 11 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/engine/core/progression.ts src/engine/core/progression.test.ts
git commit -m "feat(progression): full-trait outcome-pull drift and commander drift helper"
```

---

## Task 11: Migrate director to generateValidatedObject

**Files:**
- Modify: `apps/paracosm/src/runtime/director.ts`

- [ ] **Step 1: Rewrite the director system instructions to use JSON-only + reasoning**

In `apps/paracosm/src/runtime/director.ts`, find `DEFAULT_DIRECTOR_INSTRUCTIONS` (line 93) and REPLACE the block starting with "Return ONLY valid JSON:" through the end of the template string. Keep the rule list above unchanged. The new tail:

```ts
const DEFAULT_DIRECTOR_INSTRUCTIONS = `You are the Event Director for a simulation. You observe simulation state and generate events that test the settlement's weaknesses, exploit consequences of prior decisions, and create narrative tension.

You generate 1 to {MAX_EVENTS} events per turn. Decide how many based on:
- World stability: low morale + low resources + recent failures = more events
- Narrative pacing: vary the rhythm, don't always generate the maximum
- Prior turn intensity: if the last turn had many events, consider fewer this turn
- Turn position: early turns can have fewer events for ramp-up

RULES:
1. Each event has exactly 2-3 options with stable IDs (option_a, option_b, option_c)
2. Exactly one option per event must be marked isRisky: true
3. Events must reference domain-appropriate knowledge
4. No two events in the same batch should share a category
5. Never repeat a category from the immediately previous turn
6. Escalate: later events should reference consequences of earlier decisions
7. Include actual state numbers in event descriptions
8. Specify which departments should analyze each event (2-4 per event)

OPTION POLARIZATION (CRITICAL — drives leader divergence):
The whole point of the simulation is to surface how different personalities
produce different civilizations from identical starting conditions. Boring
options that mostly come out the same defeat that purpose. Make the safe
option and the risky option DRAMATICALLY DIFFERENT in:
  - Magnitude of effect (safe = small/incremental; risky = transformative or catastrophic)
  - Scope of change (safe = preserve status quo; risky = restructure something fundamental)
  - Time horizon (safe = address immediate symptom; risky = bet on a long arc)
  - Required commitment (safe = reversible; risky = burns bridges)

If the description of option_a could plausibly be swapped with option_b
without changing much, the options are too similar — rewrite them so
they reflect genuinely opposed philosophies.

The risky option should be neither obviously stupid nor obviously correct.
Aim for ~40-65% success probability so high-openness leaders genuinely
gamble while high-conscientiousness leaders genuinely have a defensible
case for the safe path.

REASONING — populate the "reasoning" field of the response before the events array with a numbered list:
  (1) What stress signal in the current state pattern is most important?
  (2) What consequences of the last turn's outcome still matter now?
  (3) Which categories are still available given the no-repeat rule?
The events array must reference back to these points. Decide on the pacing (calm/normal/intense) AFTER this reasoning, not before.`;
```

Note: `{MAX_EVENTS}` token substitution is preserved — the `generateEventBatch` method still replaces it before passing the instructions to the schema wrapper.

- [ ] **Step 2: Replace the generateText call with generateValidatedObject**

Still in `apps/paracosm/src/runtime/director.ts`, find `EventDirector.generateEventBatch` (around line 355). Replace the body of the `try` block (the `generateText` call + parseBatchResponse + parseDirectorResponse fallback) with a `generateValidatedObject` call.

Add imports at the top of the file (near the existing `import { SCENARIOS }`):

```ts
import { generateValidatedObject } from './llm-invocations/generateValidatedObject.js';
import { DirectorEventBatchSchema, type DirectorEventBatchZ } from './schemas/director.js';
```

The file currently does dynamic import of generateText inside the method. Remove that pattern. Replace the entire `generateEventBatch` body up to (but not including) the fallback block:

Find and replace:

```ts
    try {
      const { generateText } = await import('@framers/agentos');
      // Prompt caching: the director instructions (~1500-2000 tokens) are
      // identical across all 6 turn calls in a run. Marking the system
      // block as a cache breakpoint lets Anthropic serve turns 2-6 from
      // its prefix cache at 0.1x cost. The per-turn context goes in the
      // user prompt and is NOT cached. Providers without cache support
      // (e.g. older OpenAI SDKs) ignore the breakpoint silently; for
      // OpenAI, prompt caching is automatic for prompts >=1024 tokens
      // and the block structure helps the hash align.
      const result = await generateText({
        provider,
        model,
        system: [{ text: systemInstructions, cacheBreakpoint: true }],
        prompt,
      });
      onUsage?.(result);

      const batch = parseBatchResponse(result.text);
      if (batch && batch.events.length > 0) {
        batch.events = batch.events.slice(0, maxEvents);
        console.log(`  [director] Generated ${batch.events.length} events (${batch.pacing}) for ${ctx.leaderName}: ${batch.events.map(e => `"${e.title}"`).join(', ')}`);
        return batch;
      }

      const single = parseDirectorResponse(result.text);
      if (single) {
        console.log(`  [director] Generated 1 event (single format) for ${ctx.leaderName}: "${single.title}"`);
        return { events: [single], pacing: 'normal', reasoning: 'parsed as single event' };
      }

      console.log(`  [director] Failed to parse batch for ${ctx.leaderName}, using fallback`);
    } catch (err) {
      console.log(`  [director] Batch error for ${ctx.leaderName}: ${err}`);
      // Surface the raw error so the orchestrator can classify it. We
      // still fall through to the canned fallback so a single transient
      // error does not break the turn, but a terminal quota/auth error
      // will flip the run-scoped abort flag and subsequent turns will
      // short-circuit.
      onProviderError?.(err);
    }
```

With:

```ts
    try {
      // Prompt caching: the director instructions (~1500-2000 tokens) are
      // identical across all 6 turn calls in a run. systemCacheable goes
      // through cacheBreakpoint: true so Anthropic serves turns 2-6 from
      // its prefix cache at 0.1x cost. OpenAI auto-caches prompts >=1024
      // tokens.
      const { object, fromFallback } = await generateValidatedObject({
        provider,
        model,
        schema: DirectorEventBatchSchema,
        schemaName: 'DirectorEventBatch',
        systemCacheable: systemInstructions,
        prompt,
        onUsage,
        onProviderError,
        fallback: undefined,  // fall through to canned fallback below
      });
      const batch: DirectorEventBatchZ = {
        ...object,
        events: object.events.slice(0, maxEvents),
      };
      if (fromFallback) {
        console.log(`  [director] Schema fallback for ${ctx.leaderName}, using canned`);
      } else {
        console.log(`  [director] Generated ${batch.events.length} events (${batch.pacing}) for ${ctx.leaderName}: ${batch.events.map(e => `"${e.title}"`).join(', ')}`);
        return batch;
      }
    } catch (err) {
      console.log(`  [director] Validated batch error for ${ctx.leaderName}: ${err}`);
      // Already-classified error from generateValidatedObject fired
      // onProviderError; fall through to canned fallback so the turn
      // still runs, but a terminal quota/auth error has already
      // tripped the abort flag in the orchestrator.
    }
```

- [ ] **Step 3: Delete the dead parsers**

Still in `apps/paracosm/src/runtime/director.ts`, DELETE the functions `parseDirectorResponse` (lines ~202-234) and `parseBatchResponse` (lines ~237-274). They are no longer called.

Also delete the `generateEvent` method (lines ~317-343) which was a single-event variant using `parseDirectorResponse`. Any caller needing a single event can use `generateEventBatch` with `maxEvents=1`.

Delete the deprecated `generateCrisis` alias at the bottom (lines ~424-426).

- [ ] **Step 4: Run director-adjacent tests**

There is no dedicated director.test.ts yet. The schema coverage in Task 2 indirectly protects the data contract. Run a broader sanity check to ensure nothing else in the runtime imports the deleted functions:

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
grep -rn "parseBatchResponse\|parseDirectorResponse\|generateCrisis\|EventDirector.*generateEvent[^B]" src/
```

Expected: no matches. If any show up, update the caller to use `generateEventBatch`.

- [ ] **Step 5: Type-check**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npx tsc --noEmit -p tsconfig.json
```

Expected: no new type errors in director.ts or its imports.

- [ ] **Step 6: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/runtime/director.ts
git commit -m "refactor(director): migrate to generateValidatedObject with DirectorEventBatchSchema"
```

---

## Task 12: Migrate reactions to generateValidatedObject

**Files:**
- Modify: `apps/paracosm/src/runtime/agent-reactions.ts`

- [ ] **Step 1: Update the system prompt to expect wrapped output**

Open `apps/paracosm/src/runtime/agent-reactions.ts`. Find `buildBatchSystemPrompt`. Replace the OUTPUT FORMAT section (the `[\n  {"agentId":...} ... \n]` block) with:

```ts
OUTPUT FORMAT — you will receive a numbered list of agents. Return ONLY a JSON object matching this shape:
{
  "reactions": [
    {"agentId":"<id>","quote":"1-2 sentences in first person","mood":"positive|negative|neutral|anxious|defiant|hopeful|resigned","intensity":0.0-1.0},
    ...
  ]
}

One entry per agent, in the same order, matching each agentId EXACTLY as given. No prose, no markdown fences, no explanation before or after.
```

- [ ] **Step 2: Add imports**

At the top of `apps/paracosm/src/runtime/agent-reactions.ts`, near the existing `import { generateText, extractJson } from '@framers/agentos';`, add:

```ts
import { generateValidatedObject } from './llm-invocations/generateValidatedObject.js';
import { ReactionBatchSchema } from './schemas/reactions.js';
import { buildReactionCues } from './hexaco-cues/translation.js';
```

Remove the now-unused `extractJson` import and the `generateText` import if they are no longer referenced after this task's edits (grep to verify).

- [ ] **Step 3: Replace the generateText + JSON.parse call with generateValidatedObject**

Find the function that sends the batched reaction prompt. Look for `generateText(` with a prompt that includes `buildBatchSystemPrompt`. Replace:

```ts
      const result = await generateText({
        provider,
        model,
        system: [{ text: systemPrompt, cacheBreakpoint: true }],
        prompt: userPrompt,
      });
      onUsage?.(result);

      // ... followed by manual JSON.parse + array cast ...
```

With:

```ts
      const { object, fromFallback } = await generateValidatedObject({
        provider,
        model,
        schema: ReactionBatchSchema,
        schemaName: 'ReactionBatch',
        systemCacheable: systemPrompt,
        prompt: userPrompt,
        onUsage,
        onProviderError,
        fallback: { reactions: [] },
      });
      if (fromFallback) {
        console.log(`  [reactions] schema fallback, returning empty batch`);
      }
      const reactionsFromBatch = object.reactions;
```

Then downstream code that previously read the parsed array now reads `reactionsFromBatch`.

- [ ] **Step 4: Thread reaction cues into the per-agent block**

Find `buildBatchAgentBlock`. Currently it renders raw HEXACO numbers. Add the cue line. Near the end of the function's block assembly (before the `return` statement), append the cue line. Find the existing line that stringifies HEXACO like:

```ts
  const hex = `O:${h.openness.toFixed(2)} C:${h.conscientiousness.toFixed(2)} E:${h.extraversion.toFixed(2)} A:${h.agreeableness.toFixed(2)} Em:${h.emotionality.toFixed(2)} HH:${h.honestyHumility.toFixed(2)}`;
```

Replace with:

```ts
  const hex = `O:${h.openness.toFixed(2)} C:${h.conscientiousness.toFixed(2)} E:${h.extraversion.toFixed(2)} A:${h.agreeableness.toFixed(2)} Em:${h.emotionality.toFixed(2)} HH:${h.honestyHumility.toFixed(2)}`;
  const cues = buildReactionCues(h);
```

And wherever the block template includes `${hex}`, insert the cue on the next line:

```ts
  return `Agent ${c.core.id} — ${c.core.name}, ${c.core.role}, age ${age}. ${bornLine}
HEXACO: ${hex}${cues ? `\n${cues}` : ''}
Health: psych ${c.health.psychScore.toFixed(2)}, conditions: ${conditions}
${memoryLine}`;
```

(The exact template varies; add `${cues ? '\n' + cues : ''}` after the HEXACO line in whatever form the template takes. Read the current implementation to find the right spot.)

- [ ] **Step 5: Type-check and grep**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npx tsc --noEmit -p tsconfig.json
grep -n "extractJson\|generateText" src/runtime/agent-reactions.ts
```

Expected: clean tsc; only the still-needed imports remain (if any). Delete unused imports.

- [ ] **Step 6: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/runtime/agent-reactions.ts
git commit -m "refactor(reactions): migrate to generateValidatedObject with cue translation"
```

---

## Task 13: Migrate verdict to generateValidatedObject

**Files:**
- Modify: `apps/paracosm/src/cli/pair-runner.ts`

- [ ] **Step 1: Rewrite the verdict prompt to use schema reasoning field**

Open `apps/paracosm/src/cli/pair-runner.ts`. Find the `generateText` call at line ~140 and its multi-line prompt (ends at line ~177). Replace the entire `try` block that does verdict generation with the schema-wrapped version.

Find:

```ts
      const { text: verdictText } = await generateText({
        provider: simConfig.provider || 'openai',
        model: verdictModel,
        prompt: `You are judging a colony simulation. ... <thinking> ... </thinking>
<verdict>
{...}
</verdict>`,
      });

      // Parse verdict. Model may emit a <thinking>...</thinking> block
      // before the JSON; strip that first so the greedy {..} match doesn't
      // swallow any literal braces inside the reasoning prose.
      try {
        const stripped = verdictText.replace(/<thinking>[\s\S]*?<\/thinking>/, '');
        const jsonMatch = stripped.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const verdict = JSON.parse(jsonMatch[0]);
          broadcast('verdict', { ... });
          console.log(...);
        }
      } catch (parseErr) { ... }
```

Replace with:

```ts
      const { object: verdict, fromFallback } = await generateValidatedObject({
        provider: simConfig.provider || 'openai',
        model: verdictModel,
        schema: VerdictSchema,
        schemaName: 'Verdict',
        prompt: `You are judging a colony simulation. Two AI commanders with opposing HEXACO personality profiles led identical colonies through ${turns} turns from the same starting conditions and deterministic seed. Your job is to write a verdict that explains WHY the runs diverged the way they did, not just WHO won.

${formatLeader('LEADER A', a, colA)}

${formatLeader('LEADER B', b, colB)}

TRADEOFFS TO WEIGH
Tool forging is a cost / capability tradeoff: every forged tool spent a judge LLM call and ate analyst attention; failed forges hurt morale and produced no reusable capability; successful tools let later decisions reason about concrete numbers. A leader who built few tools and reused them many times has a disciplined, cost-efficient signature. A leader who forged many novel tools has an exploratory signature with broader capability surface. Both are valid strategies and your scoring should reflect that trade, not punish either extreme.

Mortality is a cause-specific signal, not a number. The "Mortality" line above names HOW each colonist died. A leader who lost 5 to starvation made different resource-allocation decisions than a leader who lost 5 to radiation cancer; a leader with despair deaths presided over a colony in psychological freefall. Reference the specific causes when they shape the story.

REASONING — populate the "reasoning" field of your JSON response with a numbered list covering:
  (1) Population trajectory — how did each colony's population evolve, and which tradeoffs produced that shape?
  (2) Morale + psychological state — which leader's colony held together emotionally, and what does that say about HEXACO + decision style?
  (3) Resource efficiency — food, power, infrastructure — which side ran leaner, which hit crises?
  (4) Innovation signature — tools forged vs reused, breadth vs depth. What does each leader's toolbox say about their cognition?
  (5) Mortality story — which causes dominated each side, and what does THAT say about the leader's priorities?
  (6) The single most impactful divergence — resource decision, crisis response, tool strategy, or emergent behavior. Name it precisely.
  (7) Weighing the tradeoffs, who won and why.

Then fill out winner, winnerName, headline (max 80 chars), summary (2-3 sentences), keyDivergence, and scores (each axis 0-10).`,
        fallback: undefined,
      });

      if (fromFallback) {
        console.log('  Verdict schema fallback; skipping broadcast');
      } else {
        broadcast('verdict', {
          ...verdict,
          leaderA: { name: a.leader.name, archetype: a.leader.archetype, colony: a.leader.colony },
          leaderB: { name: b.leader.name, archetype: b.leader.archetype, colony: b.leader.colony },
          finalStats: {
            a: { population: colA?.population, morale: colA?.morale, food: colA?.foodMonthsReserve, power: colA?.powerKw, modules: colA?.infrastructureModules, science: colA?.scienceOutput, tools: a.result.totalToolsForged },
            b: { population: colB?.population, morale: colB?.morale, food: colB?.foodMonthsReserve, power: colB?.powerKw, modules: colB?.infrastructureModules, science: colB?.scienceOutput, tools: b.result.totalToolsForged },
          },
        });
        console.log(`\n  VERDICT: ${verdict.headline}`);
        console.log(`  Winner: ${verdict.winnerName} (${verdict.winner})`);
        console.log(`  ${verdict.summary}\n`);
      }
```

- [ ] **Step 2: Add imports**

Near the top of `apps/paracosm/src/cli/pair-runner.ts`, add:

```ts
import { generateValidatedObject } from '../runtime/llm-invocations/generateValidatedObject.js';
import { VerdictSchema } from '../runtime/schemas/verdict.js';
```

Remove the dynamic `const { generateText } = await import('@framers/agentos');` line (no longer needed) and any now-unused imports.

- [ ] **Step 3: Type-check**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npx tsc --noEmit -p tsconfig.json
```

Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/cli/pair-runner.ts
git commit -m "refactor(verdict): migrate to generateValidatedObject with reasoning schema field"
```

---

## Task 14: Migrate department reports to sendAndValidate

**Files:**
- Modify: `apps/paracosm/src/runtime/orchestrator.ts`
- Modify: `apps/paracosm/src/runtime/parsers.ts` (delete parseDeptReport)

- [ ] **Step 1: Add imports in orchestrator**

Near the top of `apps/paracosm/src/runtime/orchestrator.ts`, add:

```ts
import { sendAndValidate } from './llm-invocations/sendAndValidate.js';
import { DepartmentReportSchema } from './schemas/department.js';
```

And at the bottom of the existing imports from parsers, remove `parseDeptReport`:

```ts
// BEFORE:
import { humanizeToolName, parseDeptReport, parseCmdDecision, emptyReport, emptyDecision, decisionToPolicy } from './parsers.js';

// AFTER:
import { humanizeToolName, emptyReport, emptyDecision, decisionToPolicy } from './parsers.js';
```

(Note: `parseCmdDecision` is removed in Task 15, but keep the import here for now until then — or do both migrations together. This plan does dept first so the intermediate state is that the parsers import still references parseCmdDecision.)

Correction — to avoid an intermediate broken state, change the parsers import in this task to ONLY the three helpers that survive, and accept that Task 15 will also touch the commander call (the commander code path's use of `parseCmdDecision` also lives in this file, untouched until Task 15):

```ts
import { humanizeToolName, parseCmdDecision, emptyReport, emptyDecision, decisionToPolicy } from './parsers.js';
```

(Keep parseCmdDecision in the import until Task 15 removes it.)

- [ ] **Step 2: Replace the dept session.send + parseDeptReport with sendAndValidate**

Find the dept report path. Around [orchestrator.ts:742](../../../src/runtime/orchestrator.ts#L742):

```ts
          const r = await sess.send(ctx);
          ...
          const parsed = parseDeptReport(r.text, dept);
```

Replace with:

```ts
          const { object: parsed, fromFallback } = await sendAndValidate({
            session: sess,
            prompt: ctx,
            schema: DepartmentReportSchema,
            onUsage: (usage) => trackUsage(usage, 'departments'),
            onProviderError: (err) => reportProviderError(err, `dept:${dept}:turn${turn}:event${ei + 1}`),
            fallback: { ...emptyReport(dept), summary: `${dept} report unavailable this turn.` } as any,
          });
          if (fromFallback) {
            console.log(`    [${dept}] schema fallback; using empty report skeleton`);
          }
```

The cast `as any` is because the schema-inferred type uses generic strings for enums/records while the legacy `DepartmentReport` has stricter nominal types. A later cleanup task can align the two; for now the cast bridges them.

Also delete the `trackUsage(r, 'departments')` call that used to follow the `sess.send(ctx)` — `sendAndValidate` fires it through the `onUsage` callback now.

- [ ] **Step 3: Remove parseDeptReport from parsers.ts**

Open `apps/paracosm/src/runtime/parsers.ts`. Delete the `parseDeptReport` function (lines ~88-106) and its JSDoc.

Also delete `buildReadableSummary` if it is only used by `parseDeptReport` (grep to verify). If it's used elsewhere (e.g., by `parseCmdDecision`), keep it until Task 15.

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
grep -rn "parseDeptReport\|buildReadableSummary" src/ | grep -v parsers.ts | grep -v parsers.test.ts
```

If `buildReadableSummary` is only used by `parseDeptReport` (now deleted), remove it too.

- [ ] **Step 4: Type-check**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npx tsc --noEmit -p tsconfig.json
```

Expected: clean, except possibly for cast-related warnings noted above. No new errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/runtime/orchestrator.ts src/runtime/parsers.ts
git commit -m "refactor(departments): migrate dept reports to sendAndValidate"
```

---

## Task 15: Migrate commander decision to sendAndValidate + add reasoning CoT

**Files:**
- Modify: `apps/paracosm/src/runtime/orchestrator.ts`
- Modify: `apps/paracosm/src/runtime/parsers.ts` (delete parseCmdDecision)

- [ ] **Step 1: Rewrite the commander prompt CoT block to use JSON reasoning**

In `apps/paracosm/src/runtime/orchestrator.ts` around lines 1028-1038, find the existing `<thinking>` block inside `cmdPrompt`:

```ts
Reason step by step BEFORE writing the JSON. Do not skip the thinking block.

<thinking>
1. What does my personality profile push me toward on this call? Name the specific trait poles at play.
2. Do the department reports converge or conflict? If they conflict, which voice do I trust given my profile?
3. Which forged-tool outputs in the toolbox above directly inform this decision? Cite the numeric output if available.
4. What is the risk I accept vs the risk I refuse? My rationale must name the specific trade.
5. Final choice + one-line justification.
</thinking>

Then return the JSON decision. Rationale should cite specific tool outputs when they support the call.`;
```

Replace with:

```ts
REASONING — populate the "reasoning" field of your JSON response BEFORE committing to selectedOptionId. Numbered list, one point per line:
  (1) What does my personality profile push me toward on this call? Name the specific trait poles at play.
  (2) Do the department reports converge or conflict? If they conflict, which voice do I trust given my profile?
  (3) Which forged-tool outputs in the toolbox above directly inform this decision? Cite the numeric output if available.
  (4) What risk am I accepting vs refusing? My rationale must name the specific trade.
  (5) Final choice + one-line justification.

Then set selectedOptionId, decision, and rationale. The rationale compresses the reasoning into a single paragraph for default UI display; the "reasoning" field stores the full working.`;
```

- [ ] **Step 2: Replace cmdSess.send + parseCmdDecision with sendAndValidate**

Find the commander send (around [orchestrator.ts:1050](../../../src/runtime/orchestrator.ts#L1050)):

```ts
      const cmdR = await cmdSess.send(cmdPrompt);
      trackUsage(cmdR, 'commander');
      const decision = parseCmdDecision(cmdR.text, depts);
```

Replace with:

```ts
      const { object: decision, fromFallback: decisionFallback } = await sendAndValidate({
        session: cmdSess,
        prompt: cmdPrompt,
        schema: CommanderDecisionSchema,
        onUsage: (usage) => trackUsage(usage, 'commander'),
        onProviderError: (err) => reportProviderError(err, `commander:turn${turn}:event${ei + 1}`),
        fallback: { ...emptyDecision(depts), decision: 'Commander decision unavailable; defer to department consensus.' } as any,
      });
      if (decisionFallback) {
        console.log(`  [commander] schema fallback for turn ${turn} event ${ei + 1}`);
      }
```

Add the commander schema import at the top of orchestrator.ts:

```ts
import { CommanderDecisionSchema } from './schemas/commander.js';
```

- [ ] **Step 3: Delete parseCmdDecision from parsers.ts**

Open `apps/paracosm/src/runtime/parsers.ts`. Delete the `parseCmdDecision` function (lines ~113-166) and its JSDoc. Also delete the `cleanSummary` function IF it is no longer used anywhere (grep to verify — it's used by parseDeptReport's fallback which is also deleted). If truly unused:

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
grep -rn "cleanSummary" src/ | grep -v parsers.ts
```

If no matches, delete `cleanSummary` too. The file now contains only `humanizeToolName`, `emptyReport`, `emptyDecision`, `decisionToPolicy`.

- [ ] **Step 4: Update the parsers import in orchestrator.ts**

```ts
// Final form:
import { humanizeToolName, emptyReport, emptyDecision, decisionToPolicy } from './parsers.js';
```

- [ ] **Step 5: Type-check**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npx tsc --noEmit -p tsconfig.json
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/runtime/orchestrator.ts src/runtime/parsers.ts
git commit -m "refactor(commander): migrate to sendAndValidate with JSON reasoning field"
```

---

## Task 16: Migrate promotions to sendAndValidate

**Files:**
- Modify: `apps/paracosm/src/runtime/commander-setup.ts`

- [ ] **Step 1: Replace the sendToCommander + JSON.parse block with sendAndValidate**

In `apps/paracosm/src/runtime/commander-setup.ts`, find `runDepartmentPromotions` around lines 126-156. Replace the block:

```ts
  const promoResult = await sendToCommander(buildPromotionPrompt(candidateSummaries));
  trackUsage(promoResult, 'commander');

  const promoMatch = promoResult.text.match(/\{[\s\S]*"promotions"[\s\S]*\}/);
  if (promoMatch) {
    try {
      const pd = JSON.parse(promoMatch[0]);
      for (const p of pd.promotions || []) {
        try {
          kernel.promoteAgent(p.agentId, p.department, p.role, leader.name);
          console.log(`  ✦ ${p.agentId} → ${p.role}: ${p.reason?.slice(0, 80)}`);
          emit('promotion', { agentId: p.agentId, department: p.department, role: p.role, reason: p.reason?.slice(0, 120) });
        } catch (err) { console.log(`  ✦ Promotion failed: ${err}`); }
      }
    } catch (e) { console.warn('  [promotion] Failed to parse promotion JSON:', e); }
  }
```

With:

```ts
  const { object: promoDecision, fromFallback } = await sendAndValidate({
    session: { send: sendToCommander },
    prompt: buildPromotionPrompt(candidateSummaries),
    schema: PromotionsSchema,
    onUsage: (r) => trackUsage({ usage: r.usage }, 'commander'),
    fallback: { promotions: [] },
  });
  if (fromFallback) {
    console.log('  [promotion] schema fallback; no commander-driven promotions this run (fallback pass will fill)');
  }
  for (const p of promoDecision.promotions) {
    try {
      kernel.promoteAgent(p.agentId, p.department, p.role, leader.name);
      console.log(`  ✦ ${p.agentId} → ${p.role}: ${p.reason?.slice(0, 80)}`);
      emit('promotion', { agentId: p.agentId, department: p.department, role: p.role, reason: p.reason?.slice(0, 120) });
    } catch (err) { console.log(`  ✦ Promotion failed: ${err}`); }
  }
```

- [ ] **Step 2: Add imports**

Near the top of `commander-setup.ts`:

```ts
import { sendAndValidate } from './llm-invocations/sendAndValidate.js';
import { PromotionsSchema } from './schemas/commander.js';
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npx tsc --noEmit -p tsconfig.json
```

Expected: no new errors. The `{ send: sendToCommander }` object literal matches the `SessionLike` shape (it has a `.send` method that returns `{ text, usage? }`).

- [ ] **Step 4: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/runtime/commander-setup.ts
git commit -m "refactor(promotions): migrate to sendAndValidate with PromotionsSchema"
```

---

## Task 17: Commander drift tracking in orchestrator

**Files:**
- Modify: `apps/paracosm/src/runtime/orchestrator.ts`

- [ ] **Step 1: Add clone-at-start commander HEXACO variables**

In `apps/paracosm/src/runtime/orchestrator.ts`, find the block where the commander agent is created (around lines 256-261). Just BEFORE the `const commander = agent({ ... })` line, add:

```ts
  // Commander HEXACO evolves per-turn via driftCommanderHexaco (Task 10).
  // Clone the caller's leader.hexaco so we never mutate the caller's
  // LeaderConfig — pair-runner reuses configs across runs and chat-agents
  // hold references to the baseline.
  const commanderHexacoLive: HexacoProfile = { ...leader.hexaco };
  const commanderHexacoHistory: HexacoSnapshot[] = [
    { turn: 0, year: startYear, hexaco: { ...leader.hexaco } },
  ];
```

Add imports at the top of the file:

```ts
import type { HexacoProfile, HexacoSnapshot } from '../engine/core/state.js';
import { driftCommanderHexaco } from '../engine/core/progression.js';
```

- [ ] **Step 2: Migrate leader.hexaco read sites to commanderHexacoLive**

Find each of these lines and update the reads:

Line ~259 (inside `agent({ personality: {...} })`): KEEP as `leader.hexaco` — this is the agent's baseline personality for AgentOS's built-in descriptors. Changing it mid-run would confuse AgentOS's personality handling.

Line ~270 (`buildCommanderBootstrap(buildPersonalityCue(leader.hexaco))`): KEEP as `leader.hexaco` — bootstrap runs at turn 0 before any drift.

Line ~573 (director ctx `leaderHexaco: leader.hexaco`): change to `leaderHexaco: commanderHexacoLive`.

Line ~1080-1083 (personality bonus): change `leader.hexaco.openness` → `commanderHexacoLive.openness`, same for conscientiousness in all three references.

Line ~1159 (kernel.applyDrift): change `kernel.applyDrift(leader.hexaco, ...)` to `kernel.applyDrift(commanderHexacoLive, ...)`.

- [ ] **Step 3: Add driftCommanderHexaco call after kernel.applyDrift**

Still at line ~1159, BELOW the existing `kernel.applyDrift(...)` call, add:

```ts
    // Commander drift mirrors the agent drift above but on the commander's
    // own profile; outcome-pull only (no leader-pull, no role-pull).
    driftCommanderHexaco(
      commanderHexacoLive,
      lastOutcome,
      Math.max(1, year - prevYear),
      turn,
      year,
      commanderHexacoHistory,
    );
```

- [ ] **Step 4: Export drifted commander HEXACO in the run output**

Find the `output` object at line ~1371 in `apps/paracosm/src/runtime/orchestrator.ts`:

```ts
  const output = {
    simulation: `${sc.id}-v3`,
    leader: { name: leader.name, archetype: leader.archetype, colony: leader.colony, hexaco: leader.hexaco },
    ...
  };
```

Replace the `leader:` line with:

```ts
    leader: {
      name: leader.name,
      archetype: leader.archetype,
      colony: leader.colony,
      /** Drifted current profile — matches the Agent type convention */
      hexaco: commanderHexacoLive,
      /** Original config the caller passed in */
      hexacoBaseline: { ...leader.hexaco },
      /** Per-turn snapshots of commander HEXACO evolution */
      hexacoHistory: commanderHexacoHistory,
    },
```

- [ ] **Step 5: Type-check**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npx tsc --noEmit -p tsconfig.json
```

Expected: no new errors. If there's a type error about `output.leader` shape, it likely indicates an existing return-type annotation that needs updating; broaden the annotation or add the new fields there too.

- [ ] **Step 6: Add regression test for no-mutation**

Create `apps/paracosm/src/runtime/orchestrator-leader-mutation.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Regression test: runSimulation must NOT mutate the caller's
 * LeaderConfig.hexaco. The drift lives in orchestrator-local state, not
 * in the input object.
 *
 * The assertion is structural: after any runSimulation import path,
 * deep-copy the input leader, pass one reference in, compare post-call.
 * We do not actually call runSimulation here (it requires API keys);
 * the test asserts the *shape* of the expected contract by inspecting
 * the orchestrator source for "leader.hexaco[trait] =" patterns.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const orchestratorSrc = readFileSync(
  path.join(__dirname, 'orchestrator.ts'),
  'utf-8',
);

test('orchestrator never assigns to leader.hexaco[<anything>]', () => {
  // Match leader.hexaco.X = ... or leader.hexaco[X] = ...
  const mutationPatterns = [
    /leader\.hexaco\.\w+\s*=(?!=)/g,    // leader.hexaco.openness = ...
    /leader\.hexaco\[\w+\]\s*=(?!=)/g, // leader.hexaco[trait] = ...
  ];
  for (const pattern of mutationPatterns) {
    const matches = orchestratorSrc.match(pattern);
    assert.equal(
      matches,
      null,
      `orchestrator.ts contains mutation of leader.hexaco: ${matches?.join(', ')}`,
    );
  }
});

test('orchestrator clones leader.hexaco into commanderHexacoLive', () => {
  assert.match(
    orchestratorSrc,
    /commanderHexacoLive[^=]*=\s*\{\s*\.\.\.\s*leader\.hexaco\s*\}/,
    'orchestrator.ts should contain `commanderHexacoLive: ... = { ...leader.hexaco }`',
  );
});
```

- [ ] **Step 7: Run mutation regression test**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test src/runtime/orchestrator-leader-mutation.test.ts
```

Expected: both tests pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/runtime/orchestrator.ts src/runtime/orchestrator-leader-mutation.test.ts
git commit -m "feat(orchestrator): track commander HEXACO drift and preserve caller config"
```

---

## Task 18: Thread trajectory cue into commander, director, and dept prompts

**Files:**
- Modify: `apps/paracosm/src/runtime/orchestrator.ts`
- Modify: `apps/paracosm/src/runtime/director.ts`
- Modify: `apps/paracosm/src/runtime/departments.ts`

- [ ] **Step 1: Add trajectory cue to commander per-turn prompt**

In `apps/paracosm/src/runtime/orchestrator.ts`, find where `cmdPrompt` is assembled (around lines 990-1038). Near the top of the cmdPrompt template literal (after the event description block, before department reports), inject the trajectory cue.

Import at the top of the file:

```ts
import { buildTrajectoryCue } from './hexaco-cues/trajectory.js';
```

Inside the loop where `cmdPrompt` is built, BEFORE the template literal assembly, compute the cue:

```ts
      const trajectoryCue = buildTrajectoryCue(commanderHexacoHistory, commanderHexacoLive);
```

Then include it in the cmdPrompt string, for example after the event description and before DEPARTMENT REPORTS:

```ts
      const cmdPrompt = `EVENT ${ei + 1}/${turnEvents.length} — TURN ${turn}, YEAR ${year}:

${event.title}

${event.description}
${trajectoryCue ? `\n${trajectoryCue}\n` : ''}
DEPARTMENT REPORTS:
${summaries}
...`;
```

- [ ] **Step 2: Add trajectory cue to director context**

Update `apps/paracosm/src/runtime/director.ts`. In `buildDirectorPrompt` (around line 135), after the HEXACO commander personality block at lines 183-188, inject the cue.

Add import:

```ts
import { buildTrajectoryCue } from './hexaco-cues/trajectory.js';
```

Add a new field to `DirectorContext` (around line 49):

```ts
/** Commander's personality history for trajectory cue generation. */
leaderHexacoHistory?: HexacoSnapshot[];
```

(Import `HexacoSnapshot`: `import type { HexacoSnapshot, ... } from '../engine/core/state.js';`)

In `buildDirectorPrompt`, after the COMMANDER PERSONALITY block (lines 184-188), add:

```ts
  const trajectoryCue = ctx.leaderHexacoHistory
    ? buildTrajectoryCue(ctx.leaderHexacoHistory, ctx.leaderHexaco)
    : '';
```

Insert it into the returned template right after the HEXACO block:

```ts
  return `GENERATE EVENT FOR TURN ${ctx.turn}, YEAR ${ctx.year}
...
COMMANDER PERSONALITY (HEXACO):
O: ${ctx.leaderHexaco.openness.toFixed(2)} C: ${ctx.leaderHexaco.conscientiousness.toFixed(2)} E: ${ctx.leaderHexaco.extraversion.toFixed(2)}
A: ${ctx.leaderHexaco.agreeableness.toFixed(2)} Em: ${ctx.leaderHexaco.emotionality.toFixed(2)} HH: ${ctx.leaderHexaco.honestyHumility.toFixed(2)}
${trajectoryCue ? `\n${trajectoryCue}\n` : ''}
Use this profile to colour (not determine) the next event. ...
...`;
```

- [ ] **Step 3: Pass leaderHexacoHistory from orchestrator to director**

Back in `apps/paracosm/src/runtime/orchestrator.ts`, find where the DirectorContext is built for `generateEventBatch` (around line 573). Add `leaderHexacoHistory: commanderHexacoHistory` to the context:

```ts
const directorCtx: DirectorContext = {
  turn, year,
  leaderName: leader.name, leaderArchetype: leader.archetype,
  leaderHexaco: commanderHexacoLive,
  leaderHexacoHistory: commanderHexacoHistory,
  // ... rest unchanged ...
};
```

- [ ] **Step 4: Add trajectory cue to dept head context**

In `apps/paracosm/src/runtime/departments.ts`, `buildDepartmentContext` (around line 78). After the conditional cues block at lines 147-154 (the section that renders `Your personality profile (evolves over time...)`), add the dept head's own trajectory cue.

Add import:

```ts
import { buildTrajectoryCue } from './hexaco-cues/trajectory.js';
```

In `buildDepartmentContext`, find the `hexacoBlock` push of the profile line:

```ts
    hexacoBlock.push(
      '',
      'YOUR PERSONALITY PROFILE (evolves over time based on leadership and experience):',
      `Openness: ${h.openness.toFixed(2)} | Conscientiousness: ${h.conscientiousness.toFixed(2)} | Extraversion: ${h.extraversion.toFixed(2)}`,
      `Agreeableness: ${h.agreeableness.toFixed(2)} | Emotionality: ${h.emotionality.toFixed(2)} | Honesty-Humility: ${h.honestyHumility.toFixed(2)}`,
      ...cues,
      '',
    );
```

Right before the `...cues,` line, insert a trajectory cue line using the dept head's own `hexacoHistory`:

```ts
    const trajectory = buildTrajectoryCue(leader.hexacoHistory, leader.hexaco);
    if (trajectory) hexacoBlock.push(trajectory);
```

Place this after the `Honesty-Humility` line but before the `...cues,` spread:

```ts
    hexacoBlock.push(
      '',
      'YOUR PERSONALITY PROFILE (evolves over time based on leadership and experience):',
      `Openness: ${h.openness.toFixed(2)} | Conscientiousness: ${h.conscientiousness.toFixed(2)} | Extraversion: ${h.extraversion.toFixed(2)}`,
      `Agreeableness: ${h.agreeableness.toFixed(2)} | Emotionality: ${h.emotionality.toFixed(2)} | Honesty-Humility: ${h.honestyHumility.toFixed(2)}`,
    );
    const trajectory = buildTrajectoryCue(leader.hexacoHistory, leader.hexaco);
    if (trajectory) hexacoBlock.push(trajectory);
    hexacoBlock.push(...cues, '');
```

- [ ] **Step 5: Type-check**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npx tsc --noEmit -p tsconfig.json
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/runtime/orchestrator.ts src/runtime/director.ts src/runtime/departments.ts
git commit -m "feat(hexaco): thread trajectory cue into commander director and dept prompts"
```

---

## Task 19: Delete DEPARTMENT_CONFIGS dead code

**Files:**
- Modify: `apps/paracosm/src/runtime/departments.ts`

- [ ] **Step 1: Verify DEPARTMENT_CONFIGS is unused**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
grep -rn "DEPARTMENT_CONFIGS\|DepartmentConfig" src/ | grep -v "departments.ts"
```

Expected: no matches outside departments.ts. The comment at [orchestrator.ts:357-361](../../../src/runtime/orchestrator.ts#L357) confirms it is dead (orchestrator reads `cfg.instructions` from scenario JSON, not from this constant).

- [ ] **Step 2: Delete the constant and its interface**

In `apps/paracosm/src/runtime/departments.ts`, delete:
- The `DepartmentConfig` interface (around lines 5-10)
- The `DEPARTMENT_CONFIGS` array (around lines 12-65)

Keep:
- `DepartmentTurnMemory` interface
- `buildDepartmentContext` function (with trajectory cue added in Task 18)
- `getDepartmentsForTurn` function

- [ ] **Step 3: Type-check**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npx tsc --noEmit -p tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/runtime/departments.ts
git commit -m "chore(departments): delete dead DEPARTMENT_CONFIGS constant"
```

---

## Task 20: Full-test run and smoke verification

**Files:** (no new files)

- [ ] **Step 1: Run all added tests**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
node --import tsx --test \
  src/runtime/schemas/director.test.ts \
  src/runtime/schemas/department.test.ts \
  src/runtime/schemas/commander.test.ts \
  src/runtime/schemas/reactions.test.ts \
  src/runtime/schemas/verdict.test.ts \
  src/runtime/llm-invocations/generateValidatedObject.test.ts \
  src/runtime/llm-invocations/sendAndValidate.test.ts \
  src/runtime/hexaco-cues/trajectory.test.ts \
  src/runtime/hexaco-cues/translation.test.ts \
  src/engine/core/progression.test.ts \
  src/runtime/orchestrator-leader-mutation.test.ts \
  src/runtime/emergent-setup.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Full-project type check**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npx tsc --noEmit -p tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Sweep for leftover salvage patterns**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
grep -rn "extractJson\|JSON\.parse" src/runtime/ src/cli/pair-runner.ts src/cli/server-app.ts 2>/dev/null | grep -v ".test.ts" | grep -v "wrapForgeTool" | grep -v "emergent-setup.ts"
```

Expected: zero or very few matches. The spec success criterion is "Zero `extractJson` or manual `JSON.parse` calls remain in paracosm runtime code (excluding forge args normalization in `wrapForgeTool`, which is not an LLM-output parse)." Any remaining matches outside the allowlist need investigation.

- [ ] **Step 4: Sweep for dead parsers and DEPARTMENT_CONFIGS**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
grep -rn "parseBatchResponse\|parseDirectorResponse\|parseDeptReport\|parseCmdDecision\|buildReadableSummary\|DEPARTMENT_CONFIGS" src/
```

Expected: zero matches (all references removed).

- [ ] **Step 5: Run the smoke simulation (optional — requires API keys)**

If OpenAI or Anthropic API keys are set in `apps/paracosm/.env`:

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npm run smoke
```

Expected: completes 3 turns without a stack trace. Console should show director-generated events, dept reports (with trajectory cue appearing from turn 3 if drift accumulates), commander decisions, reactions, and a verdict.

If no keys are available, skip this step; schema/wrapper tests cover the regression risk.

- [ ] **Step 6: Final commit**

No code changes expected; this step just creates a commit marker if there were any cleanup follow-ups above:

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git status
```

If `git status` shows clean, nothing to commit. Otherwise stage and commit the cleanup.

- [ ] **Step 7: Push paracosm submodule**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git push origin master
```

Expected: all commits from Tasks 1-20 pushed to the paracosm submodule's master branch.

- [ ] **Step 8: Update monorepo submodule pointer**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant
git add apps/paracosm
git commit --no-verify -m "chore: update paracosm submodule (LLM reliability + HEXACO evolution)"
git push origin master
```

Expected: monorepo commit + push succeeds. `--no-verify` per user convention (secretlint blocks on tracked .env; paracosm changes are not a secret leak).

---

## Implementation Notes

**Ordering**: tasks 1-10 are largely independent within paracosm (schemas + helpers). Tasks 11-19 depend on 1-10 being complete because they use the new schemas and helpers. Task 20 is verification.

**No rollback plan needed**: each task is a commit; if one breaks the build, revert the commit and re-approach. Git history is the rollback.

**User rules respected**:
- No subagents, no worktrees (paracosm is a submodule; both rules from CLAUDE.md)
- Only targeted tests, no full suite runs except in Task 20
- No AI/Claude/etc. in commit messages
- `master` branch, not `main`
- No `--amend`, no `--force-push`
- Push only when asked (Tasks 20.7-20.8 are explicit user-triggered steps at plan end)

**Spec coverage check**: Every goal (§Goals in spec) maps to at least one task:
- Goal 1 (Zod-validated structured calls) → Tasks 2-8, 11-16
- Goal 2 (commander drifts and is visible) → Tasks 10, 17
- Goal 3 (all-six-trait drift with citations) → Task 10
- Goal 4 (trajectory cue at every HEXACO-aware site) → Task 18
- Goal 5 (explicit reasoning before JSON body) → Tasks 11, 13, 15
- Goal 6 (delete DEPARTMENT_CONFIGS) → Task 19
