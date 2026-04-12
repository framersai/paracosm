# Mars Genesis Phase 0 + Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all correctness bugs that undermine the demo's core claim ("same colony, different leaders"), then add a typed policy layer so commander decisions materially change kernel state.

**Architecture:** Phase 0 fixes 6 correctness issues (shared seed, turn stamping, governance promotion, structured option IDs, featured colonist updates, dashboard defaults). Phase 1 adds canonical policy effect types so departments can recommend bounded numerical changes and commanders can select them by ID. All changes are in the existing file structure; no new agent types yet (that's Phase 2).

**Tech Stack:** TypeScript (ES2022, ESM), `@framers/agentos ^0.1.211`, Node.js 22+, `tsx` for runtime.

**Spec:** `docs/specs/2026-04-12-emergent-crisis-director-and-dashboard-overhaul.md`
**Codex review:** `AUDIT-AND-LIVE-APP-RECOMMENDATIONS-2026-04-12.md`

**Verify commands (run from `apps/mars-genesis-simulation/`):**
- Type check: `npx tsc --noEmit`
- Smoke test (requires OPENAI_API_KEY): `npm run dashboard:smoke`

---

## File Map

| File | Action | Tasks |
|------|--------|-------|
| `src/agents/orchestrator.ts` | Modify | 1, 3, 4, 5, 6, 7, 8 |
| `src/kernel/kernel.ts` | Modify | 2 |
| `src/kernel/progression.ts` | Modify | 3 |
| `src/agents/contracts.ts` | Modify | 3, 6, 7 |
| `src/agents/departments.ts` | Modify | 5, 7 |
| `src/types.ts` | Modify | 8 |
| `src/serve.ts` | Modify | 9, 10 |
| `src/dashboard/index.html` | Modify | 10 |
| `src/run-visionary.ts` | Modify | 1 |
| `src/run-engineer.ts` | Modify | 1 |
| `package.json` | Modify | 9 |

---

### Task 1: Fix shared seed (C1)

The kernel seed is derived from `leader.hexaco.openness * 1000`, giving Aria seed=950 and Dietrich seed=250. Both timelines must use the same seed.

**Files:**
- Modify: `src/agents/orchestrator.ts:229-250`
- Modify: `src/run-visionary.ts:34`
- Modify: `src/run-engineer.ts:31`

- [ ] **Step 1: Add `seed` to `RunOptions` interface**

In `src/agents/orchestrator.ts`, find the `RunOptions` interface at line 229 and add `seed`:

```typescript
export interface RunOptions {
  maxTurns?: number;
  seed?: number;
  liveSearch?: boolean;
  onEvent?: (event: SimEvent) => void;
}
```

- [ ] **Step 2: Replace leader-derived seed with explicit seed**

In `src/agents/orchestrator.ts`, replace line 249:

```typescript
// OLD:
const seed = Math.abs(leader.hexaco.openness * 1000 | 0);

// NEW:
const seed = opts.seed ?? 950;
```

- [ ] **Step 3: Pass seed from entry points**

In `src/run-visionary.ts`, change line 34:
```typescript
runSimulation(VISIONARY, KEY_PERSONNEL, { maxTurns, liveSearch, seed: 950 }).catch((err) => {
```

In `src/run-engineer.ts`, change line 31:
```typescript
runSimulation(ENGINEER, KEY_PERSONNEL, { maxTurns, liveSearch, seed: 950 }).catch((err) => {
```

- [ ] **Step 4: Type check**

Run: `cd apps/mars-genesis-simulation && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd apps/mars-genesis-simulation
git add src/agents/orchestrator.ts src/run-visionary.ts src/run-engineer.ts
git commit -m "fix: use shared seed for both timelines instead of leader-derived seed"
```

---

### Task 2: Fix turn/year stamping (C2)

`progressBetweenTurns()` runs before metadata is updated. Births/deaths get stamped with the old turn/year. The orchestrator then counts events by the new turn number and finds zero.

**Files:**
- Modify: `src/kernel/kernel.ts:113-129`

- [ ] **Step 1: Update `advanceTurn()` to set metadata before progression**

In `src/kernel/kernel.ts`, replace the `advanceTurn` method (lines 113-129):

```typescript
  /** Advance to the next turn. Runs between-turn progression. */
  advanceTurn(nextTurn: number, nextYear: number): SimulationState {
    const prevYear = this.state.metadata.currentYear;
    const yearDelta = nextYear - prevYear;
    const turnRng = this.rng.turnSeed(nextTurn);

    // Update metadata FIRST so progression stamps events correctly
    this.state.metadata.currentYear = nextYear;
    this.state.metadata.currentTurn = nextTurn;

    const { state: progressed, events } = progressBetweenTurns(this.state, yearDelta, turnRng);
    this.state = progressed;
    this.state.colony.population = this.getAliveCount();
    this.updateFeaturedColonists(events);

    return this.getState();
  }
```

Note: The signature changes from `advanceTurn(nextTurn: number)` to `advanceTurn(nextTurn: number, nextYear: number)`. This decouples the kernel from scenario objects. The caller (orchestrator) already knows the year.

- [ ] **Step 2: Remove `getScenario` dependency from advanceTurn**

The `getScenario()` method and `SCENARIOS` import in kernel.ts are no longer needed by `advanceTurn` (the orchestrator passes the year directly). However, `getScenario()` is still used by the orchestrator for now (v3 still uses static scenarios until Phase 2). Leave it in place.

- [ ] **Step 3: Update orchestrator call site**

In `src/agents/orchestrator.ts`, find line 337:

```typescript
// OLD:
const state = kernel.advanceTurn(turn);

// NEW:
const state = kernel.advanceTurn(turn, scenario.year);
```

- [ ] **Step 4: Type check**

Run: `cd apps/mars-genesis-simulation && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd apps/mars-genesis-simulation
git add src/kernel/kernel.ts src/agents/orchestrator.ts
git commit -m "fix: stamp births and deaths to correct turn/year in progression"
```

---

### Task 3: Structured option IDs for outcome classification (C3)

Replace text-based `decisionText.includes(riskyOption)` with stable option IDs. This requires adding `CrisisOption` to contracts, updating `classifyOutcome`, and updating how the orchestrator passes data.

**Files:**
- Modify: `src/agents/contracts.ts`
- Modify: `src/kernel/progression.ts:73-94`
- Modify: `src/agents/orchestrator.ts:384-397`

- [ ] **Step 1: Add `CrisisOption` type to contracts**

In `src/agents/contracts.ts`, add at the top (after existing imports):

```typescript
export interface CrisisOption {
  id: string;
  label: string;
  description: string;
  isRisky: boolean;
}
```

- [ ] **Step 2: Add `selectedOptionId` to `CommanderDecision`**

In `src/agents/contracts.ts`, add the field to the `CommanderDecision` interface:

```typescript
export interface CommanderDecision {
  selectedOptionId?: string;
  decision: string;
  rationale: string;
  departmentsConsulted: Department[];
  selectedPolicies: string[];
  rejectedPolicies: Array<{ policy: string; reason: string }>;
  expectedTradeoffs: string[];
  watchMetricsNextTurn: string[];
}
```

- [ ] **Step 3: Add ID-based `classifyOutcomeById` function**

In `src/kernel/progression.ts`, add a new function after the existing `classifyOutcome` (keep the old one for backward compat until Phase 2 removes static scenarios):

```typescript
/**
 * Classify turn outcome using structured option ID.
 * Preferred over text-based classifyOutcome.
 */
export function classifyOutcomeById(
  selectedOptionId: string,
  options: Array<{ id: string; isRisky: boolean }>,
  riskSuccessProbability: number,
  colony: ColonySystems,
  rng: SeededRng,
): TurnOutcome {
  const selected = options.find(o => o.id === selectedOptionId);
  const isRisky = selected?.isRisky ?? false;

  let prob = riskSuccessProbability;
  if (colony.morale > 0.7) prob += 0.1;
  if (colony.foodMonthsReserve > 12) prob += 0.05;
  if (colony.population > 150) prob -= 0.05;
  prob = Math.max(0.1, Math.min(0.9, prob));

  const success = rng.chance(prob);

  if (isRisky && success) return 'risky_success';
  if (isRisky && !success) return 'risky_failure';
  if (!isRisky && success) return 'conservative_success';
  return 'conservative_failure';
}
```

- [ ] **Step 4: Add options to static scenarios for v3 compatibility**

The static scenarios in `src/research/scenarios.ts` currently have `riskyOption: string`. We need to add `options: CrisisOption[]` to each. This is a bridge until Phase 2 replaces them entirely.

In `src/types.ts`, update the `Scenario` interface:

```typescript
import type { CrisisOption } from './agents/contracts.js';

export interface Scenario {
  turn: number;
  year: number;
  title: string;
  crisis: string;
  researchKeywords: string[];
  snapshotHints: Partial<ColonySnapshot>;
  riskyOption: string;
  riskSuccessProbability: number;
  options?: CrisisOption[];
}
```

In `src/research/scenarios.ts`, add `options` to the first 3 scenarios (the ones most commonly run in smoke tests). The rest can be backfilled lazily:

For turn 1 (Landfall), add after `riskSuccessProbability: 0.65,`:
```typescript
    options: [
      { id: 'option_a', label: 'Arcadia Planitia', description: 'Flat basalt plains, safe, ice access', isRisky: false },
      { id: 'option_b', label: 'Valles Marineris rim', description: 'Canyon rim, mineral rich, hazardous terrain', isRisky: true },
    ],
```

For turn 2 (Water Extraction), add after `riskSuccessProbability: 0.55,`:
```typescript
    options: [
      { id: 'option_a', label: 'Deep experimental drill', description: 'High power drill to deeper aquifers, risk of contamination', isRisky: true },
      { id: 'option_b', label: 'Atmospheric water extraction', description: 'WAVAR-type system, proven technology, slower', isRisky: false },
    ],
```

For turn 3 (Perchlorate), add after `riskSuccessProbability: 0.50,`:
```typescript
    options: [
      { id: 'option_a', label: 'Full hydroponic conversion', description: 'Abandon soil, sealed hydroponic bays, more power', isRisky: false },
      { id: 'option_b', label: 'Perchlorate bioremediation', description: 'Engineer bacteria, 2-year R&D, could enable soil farming', isRisky: true },
    ],
```

- [ ] **Step 5: Update orchestrator to use ID-based classification when options exist**

In `src/agents/orchestrator.ts`, replace the outcome classification block (lines 386-393):

```typescript
    // Classify outcome and apply personality drift
    const prevYear = turn === 1 ? 2035 : scenarios[scenarios.indexOf(scenario) - 1]?.year ?? 2035;
    const yearDelta = scenario.year - prevYear;
    const outcomeRng = new SeededRng(seed).turnSeed(turn + 1000);

    let outcome: TurnOutcome;
    if (scenario.options && decision.selectedOptionId) {
      outcome = classifyOutcomeById(
        decision.selectedOptionId, scenario.options,
        scenario.riskSuccessProbability, kernel.getState().colony, outcomeRng,
      );
    } else {
      // Fallback to text-based for scenarios without options
      outcome = classifyOutcome(
        decision.decision, scenario.riskyOption, scenario.riskSuccessProbability,
        kernel.getState().colony, outcomeRng,
      );
    }
```

Add the import at the top of orchestrator.ts:
```typescript
import { classifyOutcome, classifyOutcomeById } from '../kernel/progression.js';
```

(Replace the existing `classifyOutcome` import.)

- [ ] **Step 6: Update commander prompt to request `selectedOptionId`**

In `src/agents/orchestrator.ts`, update the commander system prompt (line 264) to include option selection:

```typescript
  await cmdSess.send('You are the colony commander. You receive department reports and make strategic decisions. When the crisis includes options with IDs, you MUST include selectedOptionId in your JSON response. Return JSON with selectedOptionId, decision, rationale, selectedPolicies, rejectedPolicies, expectedTradeoffs, watchMetricsNextTurn. Acknowledge.');
```

Update the `cmdPrompt` construction (around line 375) to include option IDs when available:

```typescript
    const optionText = scenario.options
      ? '\n\nOPTIONS:\n' + scenario.options.map(o => `- ${o.id}: ${o.label} — ${o.description}${o.isRisky ? ' [RISKY]' : ''}`).join('\n') + '\n\nYou MUST include "selectedOptionId" in your JSON response.'
      : '';
    const cmdPrompt = `TURN ${turn} — ${scenario.year}: ${scenario.title}\n\nDEPARTMENT REPORTS:\n${summaries}\n\nColony: Pop ${state.colony.population} | Morale ${Math.round(state.colony.morale * 100)}% | Food ${state.colony.foodMonthsReserve.toFixed(1)}mo${optionText}\n\nDecide. Return JSON.`;
```

- [ ] **Step 7: Type check**

Run: `cd apps/mars-genesis-simulation && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
cd apps/mars-genesis-simulation
git add src/agents/contracts.ts src/kernel/progression.ts src/agents/orchestrator.ts src/types.ts src/research/scenarios.ts
git commit -m "feat: structured option IDs for outcome classification, replace text matching"
```

---

### Task 4: Apply featured colonist updates (C4)

`featuredColonistUpdates` are defined in `DepartmentReport` but never merged into kernel state. Add application logic.

**Files:**
- Modify: `src/agents/orchestrator.ts:203-215`
- Modify: `src/kernel/kernel.ts`

- [ ] **Step 1: Add `applyColonistUpdates` method to SimulationKernel**

In `src/kernel/kernel.ts`, add after the `applyDrift` method (around line 188):

```typescript
  /** Apply featured colonist updates from department reports. */
  applyColonistUpdates(updates: Array<{ colonistId: string; health?: Partial<Colonist['health']>; career?: Partial<Colonist['career']>; narrativeEvent?: string }>): void {
    for (const u of updates) {
      const col = this.state.colonists.find(c => c.core.id === u.colonistId);
      if (!col || !col.health.alive) continue;

      if (u.health) {
        if (u.health.psychScore !== undefined) {
          col.health.psychScore = Math.max(0, Math.min(1, u.health.psychScore));
        }
        if (u.health.conditions) {
          col.health.conditions = u.health.conditions;
        }
      }
      if (u.career) {
        if (u.career.achievements) {
          col.career.achievements = [...col.career.achievements, ...u.career.achievements];
        }
        if (u.career.currentProject !== undefined) {
          col.career.currentProject = u.career.currentProject;
        }
      }
      if (u.narrativeEvent) {
        col.narrative.lifeEvents.push({
          year: this.state.metadata.currentYear,
          event: u.narrativeEvent,
          source: col.core.department,
        });
      }
    }
  }
```

- [ ] **Step 2: Apply colonist updates in orchestrator after policy application**

In `src/agents/orchestrator.ts`, after the `kernel.applyPolicy(...)` call (line 384), add:

```typescript
    // Apply featured colonist updates from department reports
    const colonistUpdates = reports.flatMap(r =>
      r.featuredColonistUpdates.map(u => ({
        colonistId: u.colonistId,
        health: u.updates.health,
        career: u.updates.career,
        narrativeEvent: u.updates.narrative?.event,
      }))
    );
    if (colonistUpdates.length) {
      kernel.applyColonistUpdates(colonistUpdates);
    }
```

- [ ] **Step 3: Type check**

Run: `cd apps/mars-genesis-simulation && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd apps/mars-genesis-simulation
git add src/kernel/kernel.ts src/agents/orchestrator.ts
git commit -m "feat: apply featured colonist updates from department reports to kernel state"
```

---

### Task 5: Promote governance department (C5)

Governance is in `DEPARTMENT_CONFIGS` and requested by `getDepartmentsForTurn()` for turns 9+, but never promoted. Add it to the promotion list.

**Files:**
- Modify: `src/agents/orchestrator.ts:268-272`
- Modify: `src/agents/departments.ts:134-139`

- [ ] **Step 1: Add governance to promotion departments**

In `src/agents/orchestrator.ts`, replace line 268:

```typescript
// OLD:
const promotionDepts: Department[] = ['medical', 'engineering', 'agriculture', 'psychology'];

// NEW:
const promotionDepts: Department[] = ['medical', 'engineering', 'agriculture', 'psychology', 'governance'];
```

Replace lines 269-272:

```typescript
// OLD:
const roleNames: Record<string, string> = {
  medical: 'Chief Medical Officer', engineering: 'Chief Engineer',
  agriculture: 'Head of Agriculture', psychology: 'Colony Psychologist',
};

// NEW:
const roleNames: Record<string, string> = {
  medical: 'Chief Medical Officer', engineering: 'Chief Engineer',
  agriculture: 'Head of Agriculture', psychology: 'Colony Psychologist',
  governance: 'Governance Advisor',
};
```

- [ ] **Step 2: Type check**

Run: `cd apps/mars-genesis-simulation && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd apps/mars-genesis-simulation
git add src/agents/orchestrator.ts
git commit -m "fix: promote governance department head so governance agent runs in late turns"
```

---

### Task 6: Rewrite parsers (H2, H3)

Replace greedy regex JSON extraction with balanced-brace parser. Rewrite `cleanSummary()` to strip all known LLM cruft.

**Files:**
- Modify: `src/agents/orchestrator.ts:144-194`

- [ ] **Step 1: Add `extractJsonBlocks` utility**

In `src/agents/orchestrator.ts`, replace the entire parsing section (lines 140-194) with:

```typescript
// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function humanizeToolName(name: string): string {
  return name.replace(/_v\d+$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Extract all top-level JSON objects from a string using balanced brace counting. */
function extractJsonBlocks(text: string): string[] {
  const blocks: string[] = [];
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) start = i; depth++; }
    if (text[i] === '}') { depth--; if (depth === 0 && start >= 0) { blocks.push(text.slice(start, i + 1)); start = -1; } }
  }
  return blocks;
}

function cleanSummary(raw: string): string {
  let s = raw
    // Strip markdown formatting
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    // Strip LLM preambles
    .replace(/^(Decision|Recommendation|Summary|Analysis|Conclusion|I recommend|My analysis|Based on|After careful|Given the|Looking at|The data|In conclusion|Therefore|Overall|To summarize|As a result|In summary|Considering|Upon review|Having analyzed)\s*:?\s*/gim, '')
    // Strip decision framing
    .replace(/^(choose|select|go with|opt for|approve|we should|I suggest|I propose)\s+/i, '')
    .replace(/^Option [A-C][.:,]\s*/i, '')
    // Collapse whitespace
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Discard if it looks like JSON
  if (s.startsWith('{') || s.startsWith('[')) return '';

  // Take first 2 complete sentences
  const sentences = s.match(/[^.!?]+[.!?]/g) || [];
  const result = sentences.slice(0, 2).join(' ').trim();
  return result || s.slice(0, 150);
}

function buildReadableSummary(raw: any, dept: Department): string {
  const summaryText = raw.summary || raw.decision || raw.recommendation || '';
  const cleaned = cleanSummary(summaryText);
  if (cleaned && cleaned.length >= 20) return cleaned;

  const recs = (raw.recommendedActions || []).slice(0, 2).join('. ');
  if (recs) return cleanSummary(recs);

  const risks = (raw.risks || []).map((r: any) => r.description).slice(0, 2).join('. ');
  if (risks) return cleanSummary(risks);

  return `${dept.charAt(0).toUpperCase() + dept.slice(1)} department analysis complete.`;
}

function parseDeptReport(text: string, dept: Department): DepartmentReport {
  const jsonBlocks = extractJsonBlocks(text);
  for (const block of jsonBlocks) {
    try {
      const raw = JSON.parse(block);
      if (raw.department || raw.summary || raw.risks || raw.recommendedActions) {
        const report = { ...emptyReport(dept), ...raw, department: dept };
        report.summary = buildReadableSummary(raw, dept);
        if (typeof report.confidence !== 'number' || report.confidence < 0.1) report.confidence = 0.8;
        return report;
      }
    } catch { /* try next block */ }
  }

  // Fallback: extract citations from markdown links
  const cites: DepartmentReport['citations'] = [];
  let m; const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((m = re.exec(text))) if (m[2].startsWith('http')) cites.push({ text: m[1], url: m[2], context: m[1] });
  return { ...emptyReport(dept), summary: cleanSummary(text), citations: cites };
}

function parseCmdDecision(text: string, depts: Department[]): CommanderDecision {
  const jsonBlocks = extractJsonBlocks(text);
  for (const block of jsonBlocks) {
    try {
      const raw = JSON.parse(block);
      if (raw.decision || raw.selectedOptionId) {
        return { ...emptyDecision(depts), ...raw };
      }
    } catch { /* try next block */ }
  }
  return { ...emptyDecision(depts), decision: text.slice(0, 500), rationale: text };
}
```

- [ ] **Step 2: Type check**

Run: `cd apps/mars-genesis-simulation && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd apps/mars-genesis-simulation
git add src/agents/orchestrator.ts
git commit -m "fix: rewrite JSON parsers with balanced-brace extraction, strip LLM cruft"
```

---

### Task 7: Add typed policy effects (Phase 1)

Add canonical policy effect types so departments can recommend bounded numerical changes and commanders can select them.

**Files:**
- Modify: `src/agents/contracts.ts`
- Modify: `src/agents/departments.ts`
- Modify: `src/agents/orchestrator.ts`

- [ ] **Step 1: Add policy effect types to contracts**

In `src/agents/contracts.ts`, add after the existing type definitions:

```typescript
export type PolicyEffectType =
  | 'resource_shift'
  | 'capacity_expansion'
  | 'population_intake'
  | 'risk_mitigation'
  | 'governance_change'
  | 'social_investment'
  | 'research_bet';

export interface TypedPolicyEffect {
  id: string;
  type: PolicyEffectType;
  description: string;
  colonyDelta?: Partial<{
    powerKw: number;
    foodMonthsReserve: number;
    waterLitersPerDay: number;
    pressurizedVolumeM3: number;
    lifeSupportCapacity: number;
    infrastructureModules: number;
    scienceOutput: number;
    morale: number;
  }>;
  politicsDelta?: Partial<{
    earthDependencyPct: number;
    independencePressure: number;
  }>;
}
```

- [ ] **Step 2: Add `recommendedEffects` to `DepartmentReport`**

In `src/agents/contracts.ts`, add the field to `DepartmentReport`:

```typescript
export interface DepartmentReport {
  department: Department;
  summary: string;
  citations: Citation[];
  risks: Risk[];
  opportunities: Opportunity[];
  recommendedActions: string[];
  proposedPatches: Partial<ColonyPatch>;
  forgedToolsUsed: ForgedToolUsage[];
  featuredColonistUpdates: FeaturedColonistUpdate[];
  confidence: number;
  openQuestions: string[];
  recommendedEffects?: TypedPolicyEffect[];
}
```

- [ ] **Step 3: Add `selectedEffectIds` to `CommanderDecision`**

In `src/agents/contracts.ts`, update `CommanderDecision`:

```typescript
export interface CommanderDecision {
  selectedOptionId?: string;
  selectedEffectIds?: string[];
  decision: string;
  rationale: string;
  departmentsConsulted: Department[];
  selectedPolicies: string[];
  rejectedPolicies: Array<{ policy: string; reason: string }>;
  expectedTradeoffs: string[];
  watchMetricsNextTurn: string[];
}
```

- [ ] **Step 4: Update department instructions to recommend effects**

In `src/agents/departments.ts`, add to each department's instructions a note about recommending effects. For the medical department (first config entry), append to the instructions string:

```
\n\nYou may also return "recommendedEffects" — an array of policy effects the commander can apply. Each effect has: id (string), type (one of: resource_shift, capacity_expansion, risk_mitigation, social_investment, research_bet), description, and optionally colonyDelta (partial colony stat changes like { morale: -0.05 }) and/or politicsDelta.
```

Add the same paragraph to all 5 department instruction strings.

- [ ] **Step 5: Update `decisionToPolicy` to apply typed effects**

In `src/agents/orchestrator.ts`, replace the `decisionToPolicy` function:

```typescript
function decisionToPolicy(decision: CommanderDecision, reports: DepartmentReport[], turn: number, year: number): PolicyEffect {
  const patches: PolicyEffect['patches'] = {};

  // Apply legacy proposedPatches (backward compat)
  for (const r of reports) {
    if (r.proposedPatches.colony) patches.colony = { ...patches.colony, ...r.proposedPatches.colony };
    if (r.proposedPatches.politics) patches.politics = { ...patches.politics, ...r.proposedPatches.politics };
    if (r.proposedPatches.colonistUpdates) patches.colonistUpdates = [...(patches.colonistUpdates || []), ...r.proposedPatches.colonistUpdates];
  }

  // Apply typed effects selected by commander
  if (decision.selectedEffectIds?.length) {
    const allEffects = reports.flatMap(r => r.recommendedEffects || []);
    for (const effectId of decision.selectedEffectIds) {
      const effect = allEffects.find(e => e.id === effectId);
      if (!effect) continue;
      if (effect.colonyDelta) {
        patches.colony = patches.colony || {};
        for (const [key, delta] of Object.entries(effect.colonyDelta)) {
          const current = (patches.colony as any)[key] ?? 0;
          (patches.colony as any)[key] = current + (delta as number);
        }
      }
      if (effect.politicsDelta) {
        patches.politics = patches.politics || {};
        for (const [key, delta] of Object.entries(effect.politicsDelta)) {
          const current = (patches.politics as any)[key] ?? 0;
          (patches.politics as any)[key] = current + (delta as number);
        }
      }
    }
  }

  return {
    description: decision.decision,
    patches,
    events: [{ turn, year, type: 'decision', description: decision.decision.slice(0, 200), data: { policies: decision.selectedPolicies } }],
  };
}
```

- [ ] **Step 6: Update commander prompt to mention effects**

In `src/agents/orchestrator.ts`, update the commander prompt construction to include available effects:

```typescript
    const effectsList = reports.flatMap(r => (r.recommendedEffects || []).map(e =>
      `  - ${e.id} (${e.type}): ${e.description}${e.colonyDelta ? ' | Delta: ' + JSON.stringify(e.colonyDelta) : ''}`
    ));
    const effectsText = effectsList.length
      ? '\n\nAVAILABLE POLICY EFFECTS (include "selectedEffectIds" array in your JSON to apply):\n' + effectsList.join('\n')
      : '';
    const cmdPrompt = `TURN ${turn} — ${scenario.year}: ${scenario.title}\n\nDEPARTMENT REPORTS:\n${summaries}\n\nColony: Pop ${state.colony.population} | Morale ${Math.round(state.colony.morale * 100)}% | Food ${state.colony.foodMonthsReserve.toFixed(1)}mo${optionText}${effectsText}\n\nDecide. Return JSON.`;
```

- [ ] **Step 7: Update emptyReport to include recommendedEffects**

In `src/agents/orchestrator.ts`, update the `emptyReport` function:

```typescript
function emptyReport(d: Department): DepartmentReport {
  return { department: d, summary: '', citations: [], risks: [], opportunities: [], recommendedActions: [], proposedPatches: {}, forgedToolsUsed: [], featuredColonistUpdates: [], confidence: 0.7, openQuestions: [], recommendedEffects: [] };
}
```

- [ ] **Step 8: Type check**

Run: `cd apps/mars-genesis-simulation && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
cd apps/mars-genesis-simulation
git add src/agents/contracts.ts src/agents/departments.ts src/agents/orchestrator.ts
git commit -m "feat: typed policy effects layer for causal commander decisions"
```

---

### Task 8: Type system cleanup (M2)

Remove duplicate type definitions. Single source of truth in `kernel/state.ts`.

**Files:**
- Modify: `src/types.ts`
- Modify: `src/agents/orchestrator.ts`

- [ ] **Step 1: Remove duplicate `HexacoProfile` from types.ts**

In `src/types.ts`, replace the `HexacoProfile` definition (lines 1-8) with an import:

```typescript
import type { HexacoProfile } from './kernel/state.js';
export type { HexacoProfile };
```

Keep the rest of `types.ts` as-is (`LeaderConfig`, `ColonySnapshot`, etc.) but update `LeaderConfig` to use the imported type:

```typescript
export interface LeaderConfig {
  name: string;
  archetype: string;
  colony: string;
  hexaco: HexacoProfile;
  instructions: string;
}
```

- [ ] **Step 2: Remove duplicate `LeaderConfig` from orchestrator.ts**

In `src/agents/orchestrator.ts`, remove the `LeaderConfig` interface (lines 21-27) and import it from types instead:

```typescript
import type { LeaderConfig } from '../types.js';
```

(Add to existing imports at the top of the file.)

- [ ] **Step 3: Type check**

Run: `cd apps/mars-genesis-simulation && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd apps/mars-genesis-simulation
git add src/types.ts src/agents/orchestrator.ts
git commit -m "fix: deduplicate HexacoProfile and LeaderConfig types, single source of truth"
```

---

### Task 9: Fix serve.ts defaults and dead code (M1, M3, H6)

Fix dashboard default to 12 turns, remove redundant SSE injection, fix SSE error event collision.

**Files:**
- Modify: `src/serve.ts`
- Modify: `package.json`

- [ ] **Step 1: Fix default turns to 12**

In `src/serve.ts`, replace line 19:

```typescript
// OLD:
const maxTurns = process.argv[2] ? parseInt(process.argv[2], 10) : 3;

// NEW:
const maxTurns = process.argv[2] ? parseInt(process.argv[2], 10) : 12;
```

- [ ] **Step 2: Remove redundant SSE script injection**

In `src/serve.ts`, replace the dashboard serving block (lines 54-77) with:

```typescript
  if (req.url === '/' || req.url === '/index.html') {
    const html = readFileSync(resolve(__dirname, 'dashboard/index.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }
```

- [ ] **Step 3: Fix SSE error event name**

In `src/serve.ts`, find the error broadcasts (lines ~123-129) and replace `'error'` with `'sim_error'`:

```typescript
// In the visionaryPromise .catch:
err => { broadcast('sim_error', { leader: 'visionary', error: String(err) }); },

// In the engineerPromise .catch:
err => { broadcast('sim_error', { leader: 'engineer', error: String(err) }); },
```

- [ ] **Step 4: Pass shared seed to both simulations**

In `src/serve.ts`, update the `runSimulations()` function to pass a shared seed. Find the `runSimulation` calls and add `seed: 950`:

```typescript
  const SHARED_SEED = 950;

  const visionaryPromise = runSimulation(VISIONARY, KEY_PERSONNEL, { maxTurns, seed: SHARED_SEED, onEvent }).then(
```

```typescript
  const engineerPromise = runSimulation(ENGINEER, KEY_PERSONNEL, { maxTurns, seed: SHARED_SEED, onEvent }).then(
```

- [ ] **Step 5: Update package.json dashboard script**

In `package.json`, the `dashboard:smoke` script already passes `3`. Confirm:

```json
"dashboard": "npx tsx src/serve.ts",
"dashboard:smoke": "npx tsx src/serve.ts 3"
```

- [ ] **Step 6: Type check**

Run: `cd apps/mars-genesis-simulation && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
cd apps/mars-genesis-simulation
git add src/serve.ts package.json
git commit -m "fix: default to 12 turns, remove dead SSE injection, fix error event collision"
```

---

### Task 10: Dashboard bug fixes (H1, H4)

Fix deaths calculation, crisis banner, and SSE error handler in the HTML.

**Files:**
- Modify: `src/dashboard/index.html`

- [ ] **Step 1: Fix deaths tracking**

In `src/dashboard/index.html`, find the `turn_start` case (around line 326). Add deaths tracking:

```javascript
      case 'turn_start':
        $('m-turn').textContent = dd.turn;
        $('m-year').textContent = dd.year;
        $('crisis').innerHTML = `<b style="color:var(--rust)">⚡ Turn ${dd.turn} — ${dd.year}: ${dd.title || 'Crisis'}</b>`;
        if (dd.colony) updateGauges(s, dd.colony);
        if (dd.deaths) {
          state[s].deaths += dd.deaths;
          $(`gv-${s}-deaths`).textContent = state[s].deaths;
          $(`s-${s}-deaths`).textContent = state[s].deaths;
        }
        log('info', `[${d.leader}] Turn ${dd.turn} — ${dd.year}: ${dd.title}`);
        if (dd.births) log('ok', `  +${dd.births} births`);
        if (dd.deaths) log('no', `  -${dd.deaths} deaths`);
        break;
```

This replaces the existing `turn_start` case, including the crisis banner fix (H4) which now shows title only instead of `(dd.crisis || '').slice(0, 120)`.

- [ ] **Step 2: Remove broken deaths formula from turn_done**

Find the `turn_done` case (around line 412-416) and replace:

```javascript
      case 'turn_done':
        if (dd.colony) updateGauges(s, dd.colony);
        log('dim', `[${d.leader}] Turn complete. Pop: ${dd.colony?.population}`);
        break;
```

This removes the broken formula `state[s].deaths = (dd.colony?.population ? 100 + ...`.

- [ ] **Step 3: Fix SSE error handler**

Find the error event listener (around line 433) and replace:

```javascript
  es.addEventListener('sim_error', e => {
    try {
      const d = JSON.parse(e.data);
      log('no', `✗ Error: ${d.error}`);
    } catch {
      log('no', '✗ Unknown error');
    }
  });

  es.onerror = () => {
    log('dim', 'SSE connection lost, retrying...');
  };
```

This replaces the old `es.addEventListener('error', ...)` and `es.onerror = () => {};`.

- [ ] **Step 4: Type check**

Run: `cd apps/mars-genesis-simulation && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd apps/mars-genesis-simulation
git add src/dashboard/index.html
git commit -m "fix: dashboard deaths tracking, crisis banner title-only, SSE error handling"
```

---

### Task 11: Final verification

- [ ] **Step 1: Full type check**

Run: `cd apps/mars-genesis-simulation && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Review all changes**

Run: `cd apps/mars-genesis-simulation && git diff --stat HEAD~10`
Verify all expected files were modified and no unexpected files changed.

- [ ] **Step 3: Push submodule**

```bash
cd apps/mars-genesis-simulation
git push
```

Then update the monorepo submodule pointer:

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant
git add apps/mars-genesis-simulation
git commit --no-verify -m "chore: update mars-genesis-simulation submodule (phase 0+1 correctness fixes)"
```
