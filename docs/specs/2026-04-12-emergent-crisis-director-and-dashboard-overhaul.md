# Mars Genesis v4: Emergent Crisis Director + Dashboard Overhaul

**Date:** 2026-04-12
**Status:** Final draft (merged from Claude audit + Codex review)
**Repo:** `apps/mars-genesis-simulation/` (submodule: [framersai/mars-genesis-simulation](https://github.com/framersai/mars-genesis-simulation))
**Parent:** [manicinc/voice-chat-assistant](https://github.com/manicinc/voice-chat-assistant) monorepo
**Runtime:** [AgentOS](https://agentos.sh/en) `@framers/agentos ^0.1.211`
**Reviews:** Claude audit (full source read), Codex review (AUDIT-AND-LIVE-APP-RECOMMENDATIONS-2026-04-12.md)

---

## Purpose

Mars Genesis demonstrates AgentOS emergent capabilities in a single runnable simulation: runtime tool forging, HEXACO personality evolution, and multi-agent coordination. Two AI commanders lead the same colony through crises across 50 years. Their personalities drive different decisions, different tool inventions, and different civilizational outcomes.

**Core claim:** "Different leadership personalities create different civilizations under the same deterministic constraints."

The v3 implementation undermines this claim in several ways: the two timelines don't share a seed, births/deaths are stamped to the wrong turn, governance is advertised but never runs, commander decisions rarely affect kernel state, outcome classification uses fragile text matching, and crises are hardcoded. This spec fixes all correctness issues first, then adds the emergent Crisis Director and dashboard overhaul.

---

## Table of Contents

1. [Current Architecture (v3)](#1-current-architecture-v3)
2. [Combined Audit Findings](#2-combined-audit-findings)
3. [Phase 0: Correctness Fixes](#3-phase-0-correctness-fixes)
4. [Phase 1: Typed Policy Layer](#4-phase-1-typed-policy-layer)
5. [Phase 2: Emergent Crisis Director](#5-phase-2-emergent-crisis-director)
6. [Phase 3: Dashboard Overhaul](#6-phase-3-dashboard-overhaul)
7. [Phase 4: Productize](#7-phase-4-productize)
8. [Research Knowledge Base Refactor](#8-research-knowledge-base-refactor)
9. [Config System](#9-config-system)
10. [Type System Cleanup](#10-type-system-cleanup)
11. [File-by-File Change Map](#11-file-by-file-change-map)
12. [AgentOS APIs Used](#12-agentos-apis-used)
13. [Known Gotchas](#13-known-gotchas)
14. [Open Questions](#14-open-questions)

---

## 1. Current Architecture (v3)

### Turn Pipeline

```
static SCENARIOS[turn] → kernel.advanceTurn() → departments analyze → commander decides → kernel.applyPolicy() → personality drift
```

Both timelines receive the same crisis from `SCENARIOS[]` array. No divergence in crisis content. Only the commander's decision differs.

### File Structure

```
src/
├── kernel/                     # Deterministic engine (no LLM calls)
│   ├── state.ts                # Types: Colonist, HexacoProfile, SimulationState
│   ├── rng.ts                  # SeededRng (Mulberry32)
│   ├── colonist-generator.ts   # 100 colonists from seed with random HEXACO
│   ├── progression.ts          # Aging, births, deaths, careers, personality drift
│   └── kernel.ts               # SimulationKernel class
├── agents/
│   ├── contracts.ts            # DepartmentReport, CommanderDecision, TurnArtifact
│   ├── departments.ts          # DEPARTMENT_CONFIGS, buildDepartmentContext
│   └── orchestrator.ts         # runSimulation(), parseDeptReport, cleanSummary
├── research/
│   ├── scenarios.ts            # 12 hardcoded crises (NOT emergent)
│   └── research.ts             # Per-turn research packets with DOIs
├── dashboard/
│   ├── index.html              # Main dashboard (Mars theme, SSE client)
│   └── about.html              # About page
├── types.ts                    # Shared types (duplicates some kernel types)
├── run-visionary.ts            # Entry: Aria Chen
├── run-engineer.ts             # Entry: Dietrich Voss
└── serve.ts                    # HTTP + SSE server
```

### Design Principle (retained)

**The host runtime owns truth. The agents own interpretation.**

The kernel owns canonical state, time, randomness, and invariants. The agents own research, analysis, disagreement, tool forging, and recommendations.

---

## 2. Combined Audit Findings

Merged from Claude's full source audit and Codex's targeted review. Numbered by priority.

### CRITICAL: Correctness violations that undermine the demo's core claim

**C1. Same-seed violation** (Codex finding #1)
File: `src/agents/orchestrator.ts:249`
```typescript
const seed = Math.abs(leader.hexaco.openness * 1000 | 0);
```
Aria gets seed 950, Dietrich gets seed 250. Different colonist rosters, different RNG streams. The "same colony, different leaders" premise is false. This is the highest-priority fix.

**C2. Turn/year stamping bug** (Codex finding #2)
Files: `src/kernel/kernel.ts:113-129`, `src/kernel/progression.ts:100-186`
`progressBetweenTurns()` runs before metadata is updated. Births/deaths during the 2035-2037 gap get stamped as turn 1, year 2035. The orchestrator counts events by the new turn number and finds zero. Verified in artifact: population rises from 100 to 103 while `births: 0`.

**C3. Outcome classification is text-fragile** (Codex finding #5)
File: `src/kernel/progression.ts:73-94`
```typescript
const isRisky = decisionText.toLowerCase().includes(riskyOption.toLowerCase());
```
Misclassifies "we reject Valles Marineris" as risky. "do not pursue independence" counts as risky. Any rationale quoting the risky option while choosing safe is misclassified.

**C4. Commander decisions don't change kernel state** (Codex finding #4)
Files: `src/agents/orchestrator.ts:203-214`, saved artifacts
`decisionToPolicy()` applies `proposedPatches` which are mostly empty. `featuredColonistUpdates` are in the contract but never applied. Commander choices are narrative-only. The kernel doesn't feel decisions.

**C5. Governance never instantiated** (Codex finding #3, Claude finding #8)
Files: `src/agents/orchestrator.ts:266-324`, `src/agents/departments.ts:134-139`
Only 4 departments promoted (medical, engineering, agriculture, psychology). `getDepartmentsForTurn()` returns `'governance'` for turns 9+ but no governance session exists. Silently skipped. Demo claims 5 departments, runs 4. Science department (Carlos Fernandez) also has no agent.

**C6. Crises are hardcoded, not emergent** (Claude finding)
`src/research/scenarios.ts` contains 12 static scenarios. Every run plays identical crises. Both timelines face the same crises. This contradicts the demo's purpose of showing emergent behavior.

### HIGH: Dashboard bugs that break the viewer experience

**H1. Deaths calculation broken** (Claude finding)
File: `src/dashboard/index.html:414`
Broken formula attempts to derive deaths from population delta. Doesn't account for births. Shows wrong numbers.

**H2. `parseDeptReport()` fragile** (Claude finding, Codex broadened)
File: `src/agents/orchestrator.ts:161`
Greedy regex `\{[\s\S]*"department"[\s\S]*\}` matches across multiple JSON objects. Same fragility exists in commander parsing and promotion parsing.

**H3. `cleanSummary()` insufficient** (Claude finding)
File: `src/agents/orchestrator.ts:148`
Misses markdown headers, bullet points, numbered lists, many LLM preambles. Engineering dept leaks raw JSON.

**H4. Crisis banner shows raw description** (Claude finding)
File: `src/dashboard/index.html:324`
`(dd.crisis || '').slice(0, 120)` cuts mid-sentence. Should show title only.

**H5. Dashboard has structural model problem** (Codex finding #6)
File: `src/dashboard/index.html:321-329`
One global turn/year/crisis header. Last SSE event wins. Breaks when crises diverge. Needs per-column crisis headers.

**H6. SSE error event collision** (Codex finding #8)
Files: `src/serve.ts:123-129`, `src/dashboard/index.html:433-438`
Server broadcasts `error` event, collides with browser's native EventSource error. Handler throws on transport errors because `e.data` is undefined.

### MODERATE: Code quality issues

**M1. Redundant SSE injection** (Claude finding)
File: `src/serve.ts:57-73`
Injects SSE script that listens for event names (`turn`, `status`) that don't match actual broadcasts (`sim`). Dead code.

**M2. Duplicate types** (Claude finding)
`HexacoProfile` in both `kernel/state.ts` and `types.ts`. `LeaderConfig` in both `types.ts` and `orchestrator.ts`.

**M3. Dashboard defaults to 3 turns** (Codex finding #7)
File: `src/serve.ts:19`
`npm run dashboard` runs 3-turn smoke test, not full 12-turn demo.

**M4. No error recovery** (Claude finding)
LLM call failure crashes the entire run. No retry logic.

**M5. `honesty` vs `honestyHumility` naming mismatch** (Claude finding)
AgentOS `agent()` API uses `honesty`. Kernel types use `honestyHumility`. Works but confusing.

---

## 3. Phase 0: Correctness Fixes

**Goal:** Make every claim the demo makes actually true before adding features.

### Fix C1: Shared seed

**File:** `src/agents/orchestrator.ts`

Replace leader-derived seed with explicit shared seed:

```typescript
// OLD:
const seed = Math.abs(leader.hexaco.openness * 1000 | 0);

// NEW:
// Seed is passed in via RunOptions or defaults to 950
const seed = opts.seed ?? 950;
```

Update `RunOptions`:
```typescript
export interface RunOptions {
  maxTurns?: number;
  seed?: number;       // NEW: explicit shared seed
  liveSearch?: boolean;
  onEvent?: (event: SimEvent) => void;
}
```

Update `serve.ts` to pass the same seed to both simulations:
```typescript
const SHARED_SEED = 950;
runSimulation(VISIONARY, KEY_PERSONNEL, { maxTurns, seed: SHARED_SEED, onEvent });
runSimulation(ENGINEER, KEY_PERSONNEL, { maxTurns, seed: SHARED_SEED, onEvent });
```

### Fix C2: Turn/year stamping

**Files:** `src/kernel/kernel.ts`, `src/kernel/progression.ts`

The issue: `advanceTurn()` calls `progressBetweenTurns()` before updating metadata. Events get stamped with the old turn/year.

Fix: update metadata first, then run progression with the new turn/year:

```typescript
// kernel.ts advanceTurn()
advanceTurn(nextTurn: number): SimulationState {
  const scenario = this.getScenario(nextTurn);
  if (!scenario) throw new Error(`No scenario for turn ${nextTurn}`);

  const prevYear = this.state.metadata.currentYear;
  const yearDelta = scenario.year - prevYear;

  // Update metadata FIRST so progression stamps correctly
  this.state.metadata.currentYear = scenario.year;
  this.state.metadata.currentTurn = nextTurn;

  const turnRng = this.rng.turnSeed(nextTurn);
  const { state: progressed, events } = progressBetweenTurns(this.state, yearDelta, turnRng);
  this.state = progressed;
  this.state.colony.population = this.getAliveCount();
  this.updateFeaturedColonists(events);

  return this.getState();
}
```

Also update `progressBetweenTurns()` to use `state.metadata.currentYear` and `state.metadata.currentTurn` (which are now the correct values).

### Fix C3: Structured option IDs

Replace text-based outcome classification with structured option selection.

**New type in `contracts.ts`:**

```typescript
interface CrisisOption {
  id: string;           // stable identifier: 'option_a', 'option_b', etc.
  label: string;        // human-readable: "Arcadia Planitia", "Valles Marineris"
  description: string;
  isRisky: boolean;
}
```

**Director/scenario returns options with IDs.** Commander returns `selectedOptionId` instead of free text.

**Commander decision contract update:**

```typescript
interface CommanderDecision {
  selectedOptionId: string;     // NEW: stable ID
  decision: string;             // narrative explanation
  rationale: string;
  departmentsConsulted: Department[];
  selectedPolicies: string[];
  rejectedPolicies: Array<{ policy: string; reason: string }>;
  expectedTradeoffs: string[];
  watchMetricsNextTurn: string[];
}
```

**Outcome classification update** (`progression.ts`):

```typescript
// OLD:
const isRisky = decisionText.toLowerCase().includes(riskyOption.toLowerCase());

// NEW:
const selectedOption = crisis.options.find(o => o.id === decision.selectedOptionId);
const isRisky = selectedOption?.isRisky ?? false;
```

### Fix C4: Apply featured colonist updates

**File:** `src/agents/orchestrator.ts`

Add `featuredColonistUpdates` application in `decisionToPolicy()`:

```typescript
function applyFeaturedColonistUpdates(kernel: SimulationKernel, reports: DepartmentReport[]): void {
  for (const report of reports) {
    for (const update of report.featuredColonistUpdates) {
      const colonist = kernel.getState().colonists.find(c => c.core.id === update.colonistId);
      if (!colonist || !colonist.health.alive) continue;

      if (update.updates.health) {
        // Apply bounded health changes
        const patches: any = {};
        if (update.updates.health.psychScore !== undefined) {
          patches.psychScore = Math.max(0, Math.min(1, update.updates.health.psychScore));
        }
        if (update.updates.health.conditions) {
          patches.conditions = update.updates.health.conditions;
        }
        // Apply via kernel's existing colonistUpdates mechanism
      }

      if (update.updates.narrative?.event) {
        // Add life event to colonist narrative
      }
    }
  }
}
```

### Fix C5: Governance department

**File:** `src/agents/orchestrator.ts`

Add `governance` to the promotion list:

```typescript
// OLD:
const promotionDepts: Department[] = ['medical', 'engineering', 'agriculture', 'psychology'];

// NEW:
const promotionDepts: Department[] = ['medical', 'engineering', 'agriculture', 'psychology', 'governance'];
```

Add `governance` role name:
```typescript
const roleNames: Record<string, string> = {
  medical: 'Chief Medical Officer',
  engineering: 'Chief Engineer',
  agriculture: 'Head of Agriculture',
  psychology: 'Colony Psychologist',
  governance: 'Governance Advisor',   // NEW
};
```

### Fix M3: Dashboard defaults to 12 turns

**File:** `src/serve.ts`

```typescript
// OLD:
const maxTurns = process.argv[2] ? parseInt(process.argv[2], 10) : 3;

// NEW:
const maxTurns = process.argv[2] ? parseInt(process.argv[2], 10) : 12;
```

Update `package.json` scripts:
```json
"dashboard": "npx tsx src/serve.ts",
"dashboard:smoke": "npx tsx src/serve.ts 3"
```

### Fix H6: SSE error event

**File:** `src/serve.ts`

```typescript
// OLD:
broadcast('error', { leader: 'visionary', error: String(err) });

// NEW:
broadcast('sim_error', { leader: 'visionary', error: String(err) });
```

**File:** `src/dashboard/index.html`

```javascript
// OLD:
es.addEventListener('error', e => { const d = JSON.parse(e.data); ... });

// NEW:
es.addEventListener('sim_error', e => { const d = JSON.parse(e.data); ... });
es.onerror = () => { log('dim', 'SSE connection lost, retrying...'); };
```

---

## 4. Phase 1: Typed Policy Layer

**Goal:** Commander decisions materially change kernel state through a bounded, explainable effect system.

### Canonical Effect Families

```typescript
type PolicyEffectType =
  | 'resource_shift'       // change food, water, power reserves
  | 'capacity_expansion'   // add infrastructure modules, life support
  | 'population_intake'    // accept/reject new colonists
  | 'risk_mitigation'      // reduce specific risk factors
  | 'governance_change'    // shift political status, Earth dependency
  | 'social_investment'    // morale, recreation, cultural programs
  | 'research_bet';        // allocate science output, start R&D projects

interface TypedPolicyEffect {
  type: PolicyEffectType;
  description: string;
  // Bounded numerical effects the kernel can apply deterministically
  colonyDelta?: Partial<Record<keyof ColonySystems, number>>;
  politicsDelta?: Partial<Record<keyof ColonyPolitics, number>>;
  // Colonist-level effects
  colonistEffects?: Array<{
    colonistId: string;
    healthDelta?: Partial<Colonist['health']>;
    narrativeEvent?: string;
  }>;
}
```

### Flow

1. **Departments recommend** typed effects in their reports alongside prose analysis
2. **Commander selects** which effects to apply (by ID) alongside their narrative decision
3. **Kernel applies** bounded deltas from selected effects
4. **Dashboard shows** which effects were applied and their numerical impact

### Department Prompt Update

Department instructions tell agents to return `recommendedEffects` alongside existing fields:

```
Return JSON with these additional fields:
"recommendedEffects": [
  { "type": "resource_shift", "description": "Divert 50kW to drilling", "colonyDelta": { "powerKw": -50, "waterLitersPerDay": 200 } }
]
```

### Commander Prompt Update

Commander receives department effects and selects which to apply:

```
Each department has recommended policy effects. Select which to apply.
Return JSON with: "selectedEffectIds": [0, 2, 5]
```

---

## 5. Phase 2: Emergent Crisis Director

### Identity

The Crisis Director is a high-level AgentOS agent that sits above both simulation timelines. It is a narrative intelligence that crafts emergent crises based on colony state, not a participant in the colony.

### AgentOS Configuration

```typescript
const director = agent({
  provider: 'openai',
  model: 'gpt-5.4',
  instructions: DIRECTOR_INSTRUCTIONS,
  personality: {
    openness: 0.85,
    conscientiousness: 0.90,
    extraversion: 0.40,
    agreeableness: 0.30,
    emotionality: 0.60,
    honesty: 0.95,
  },
  maxSteps: 3,
});
```

### Turn Pipeline (v4)

```
director observes colony state
  → director generates crisis with typed options (unique per timeline)
    → kernel.advanceTurn()
      → departments analyze (with research from knowledge base)
        → commander selects option ID + policy effects
          → kernel applies bounded effects
            → outcome classification via option ID (not text)
              → personality drift
                → director observes outcome (feeds next turn)
```

### Milestone Anchors

- **Turn 1: Landfall** (fixed, shared between timelines)
- **Turn 12: Legacy Assessment** (fixed, shared between timelines)
- **Turns 2-11: Fully emergent**, independent per timeline

### Director Context

```typescript
interface DirectorContext {
  turn: number;
  year: number;
  leaderName: string;
  leaderArchetype: string;
  leaderHexaco: HexacoProfile;
  colony: ColonySystems;
  politics: ColonyPolitics;
  aliveCount: number;
  marsBornCount: number;
  recentDeaths: number;
  recentBirths: number;
  previousCrises: Array<{
    turn: number;
    title: string;
    category: CrisisCategory;
    selectedOptionId: string;
    outcome: TurnOutcome;
  }>;
  previousCategories: CrisisCategory[];
  toolsForged: string[];
  driftSummary: Array<{ name: string; role: string; hexaco: HexacoProfile }>;
}
```

### Director Output

```typescript
interface DirectorCrisis {
  title: string;
  crisis: string;
  options: CrisisOption[];   // typed with stable IDs
  riskyOptionId: string;     // which option ID is risky
  riskSuccessProbability: number;
  category: CrisisCategory;
  researchKeywords: string[];
  relevantDepartments: Department[];
  turnSummary: string;       // "why this crisis emerged"
}

type CrisisCategory =
  | 'environmental' | 'resource' | 'medical' | 'psychological'
  | 'political' | 'infrastructure' | 'social' | 'technological';
```

### Director Instructions

```
You are the Crisis Director for a Mars colony simulation. You observe colony state
and generate crises that test the colony's weaknesses, exploit consequences of
prior decisions, and create interesting divergence.

RULES:
1. Each crisis has 2-3 options with stable IDs (option_a, option_b, option_c)
2. Exactly one option must be marked isRisky: true
3. Crises must reference real Mars science
4. Never repeat a crisis category two turns in a row
5. Escalate: later crises should reference consequences of earlier decisions
6. Calibrate: struggling colonies get survivable crises, thriving ones get existential ones
7. Include 3-5 research keywords
8. Specify which departments should analyze

CRISIS CATEGORIES: environmental, resource, medical, psychological, political,
infrastructure, social, technological
```

### Director Fallback

If the director fails after retries, fall back to a small pool of generic crisis templates:

```typescript
const FALLBACK_CRISES: DirectorCrisis[] = [
  { title: 'System Malfunction', category: 'infrastructure', ... },
  { title: 'Supply Shortage', category: 'resource', ... },
  { title: 'Social Unrest', category: 'psychological', ... },
];
```

---

## 6. Phase 3: Dashboard Overhaul

### Layout Change: Per-Column Crisis Headers

Each timeline gets its own:
- Turn number and year
- Crisis title
- "Why this crisis emerged" (from director's `turnSummary`)
- Active phase indicator ("Director generating..." / "Medical analyzing..." / "Commander deciding...")

Global header shows only:
- Run status (live/complete)
- Shared seed
- Overall comparison metrics

### "Why They Diverged" Rail (Codex recommendation)

After each turn where crises differ, render a compare card:

```
╔══════════════════════════════════════════════╗
║ TURN 4 DIVERGENCE                            ║
║                                              ║
║ Ares Horizon: "Food Riot" (resource)         ║
║   Aria chose: Emergency rationing            ║
║   Outcome: risky_failure                     ║
║                                              ║
║ Meridian Base: "Engineering Burnout" (social) ║
║   Dietrich chose: Mandatory rest rotation     ║
║   Outcome: conservative_success              ║
║                                              ║
║ WHY: Aria's faster expansion depleted food    ║
║ reserves, triggering resource crisis.         ║
║ Dietrich's cautious pace overtaxed a smaller  ║
║ engineering team.                             ║
╚══════════════════════════════════════════════╝
```

### Parser Overhaul

Replace greedy regex in `parseDeptReport()`, `parseCmdDecision()`, and promotion parsing with balanced-brace JSON extraction:

```typescript
function extractJsonBlocks(text: string): string[] {
  const blocks: string[] = [];
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) start = i; depth++; }
    if (text[i] === '}') { depth--; if (depth === 0 && start >= 0) { blocks.push(text.slice(start, i + 1)); start = -1; } }
  }
  return blocks;
}
```

### `cleanSummary()` Rewrite

```typescript
function cleanSummary(raw: string): string {
  let s = raw
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^(Decision|Recommendation|Summary|Analysis|Conclusion|I recommend|My analysis|Based on|After careful|Given the|Looking at|The data|In conclusion|Therefore|Overall|To summarize|As a result|In summary|Considering)\s*:?\s*/gim, '')
    .replace(/^(choose|select|go with|opt for|approve)\s+/i, '')
    .replace(/^Option [A-C][.:,]\s*/i, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (s.startsWith('{') || s.startsWith('[')) return '';

  const sentences = s.match(/[^.!?]+[.!?]/g) || [];
  return sentences.slice(0, 2).join(' ').trim() || s.slice(0, 150);
}
```

### Deaths Calculation Fix

Track cumulative deaths from `turn_start` events instead of deriving from population delta:

```javascript
case 'turn_start':
  if (dd.deaths) {
    state[s].deaths += dd.deaths;
    $(`gv-${s}-deaths`).textContent = state[s].deaths;
    $(`s-${s}-deaths`).textContent = state[s].deaths;
  }
  break;

case 'turn_done':
  if (dd.colony) updateGauges(s, dd.colony);
  // Remove broken deaths formula entirely
  break;
```

### Crisis Banner Fix

```javascript
// Show title only, no raw description
$('crisis').innerHTML = `<b>⚡ Turn ${dd.turn} — ${dd.year}: ${dd.title || 'Crisis'}</b>`;
```

### Remove Redundant SSE Injection

Delete `sseScript` constant and `.replace()` call in `serve.ts`. Serve HTML as-is.

### Tool Cards (Codex recommendation)

Show tools as meaningful capabilities, not implementation exhaust:

```
┌──────────────────────────────────────┐
│ 🔧 Radiation Storm Triage Model      │
│                                      │
│ Estimated acute exposure if 28       │
│ colonists remain in module 7 for     │
│ 6 hours. Predicted 11 severe cases   │
│ if evacuation is delayed.            │
│                                      │
│ ✓ APPROVED  confidence: 0.91         │
└──────────────────────────────────────┘
```

Human-readable title (from `humanizeToolName()`), one-sentence purpose (from tool description), what result it produced (from forge output), confidence badge.

### Featured Colonist Module (Codex recommendation)

One featured colonist per turn per timeline:

```
┌──────────────────────────────────────┐
│ 👤 Dr. Yuki Tanaka                   │
│    Chief Medical Officer             │
│                                      │
│ "We can't keep ignoring the bone     │
│  density data. These children won't  │
│  survive Earth gravity."             │
│                                      │
│ HEXACO drift: O +0.04, C -0.02      │
│ Life event: Led emergency radiation  │
│ triage during solar particle event   │
└──────────────────────────────────────┘
```

### Turn Separators

Clear "TURN X COMPLETE" divider between turns in each column.

### Loading States

- "Crisis Director generating..." during director phase
- "Medical analyzing..." per department
- "Commander deciding..." during commander phase

### Stats as Change, Not Just State (Codex recommendation)

Show delta since last turn with attribution:

```
POP: 107 (+3 births, -1 death)
MORALE: 72% (-8% from crisis, +3% from policy)
FOOD: 14.2mo (-2.1 consumed, +1.5 produced)
```

---

## 7. Phase 4: Productize

### Setup Page with Presets (Codex recommendation)

Not just a form builder. Demo launcher with presets:

- "Risk-taker vs Operator" (default Aria/Dietrich)
- "Balanced Founders" (moderate HEXACO profiles)
- "Overcrowded Landing" (start with 200 colonists)
- "Earth Funding Collapse" (custom event at turn 3)
- "Isolation Stress Test" (high emotionality leaders)

### Replay Mode (Codex recommendation)

- Scrub turn by turn
- Collapse/expand departments
- Compare single turn across both sides
- Show causal chain: crisis, advice, choice, effect, outcome

### Shareable Run Artifacts (Codex recommendation)

After a run, generate a share page:
- Seed + config
- Final comparison
- Best tool forged
- Biggest divergence turn
- Downloadable JSON artifact

### Intro Overlay (Codex recommendation)

"How to read this" panel for first 15 seconds:
1. Same colony setup, two different commanders.
2. Departments analyze, commanders decide, colony state changes.
3. Forged tools are new models invented during the run.

---

## 8. Research Knowledge Base Refactor

Turn-indexed research packets become topic-indexed:

```typescript
type ResearchTopic =
  | 'radiation' | 'water' | 'food' | 'perchlorate' | 'life-support'
  | 'bone-density' | 'psychology' | 'isolation' | 'governance'
  | 'terraforming' | 'infrastructure' | 'communication' | 'population'
  | 'solar-events' | 'generational' | 'independence' | 'medical';

const KNOWLEDGE_BASE: Record<ResearchTopic, CrisisResearchPacket> = { ... };
```

Director's crisis `category` and `researchKeywords` map to relevant topics. All existing DOI citations preserved, reorganized by topic.

### Existing Citations (to be reorganized)

| Topic | Key Citations |
|-------|--------------|
| Radiation | Hassler et al. 2014 (Science), Cucinotta et al. 2010, Guo et al. 2018 (GRL), Acuna et al. 1999 |
| Water/Ice | Plaut et al. 2007, Smith 2004 (Icarus), MOXIE/Mars 2020 |
| Soil/Perchlorate | Hecht et al. 2009 (Science), Davila et al. 2013, Cockell 2014 |
| Life Support | NASA ECLSS, Do et al. 2016 (AIAA) |
| Bone Density | Sibonga et al. 2019 (npj Microgravity), Hughson et al. 2018 (CMAJ) |
| Psychology | Basner et al. 2014 (PNAS), Palinkas & Suedfeld 2008 |
| Geology | Mars Express MARSIS, Murchie et al. 2009 (JGR), HiRISE |
| Terraforming | Jakosky & Edwards 2018 (Nature Astronomy), Zubrin & McKay 1993 |
| Governance | Zubrin 1996 (The Case for Mars) |

---

## 9. Config System

### YAML Loader in `serve.ts`

```typescript
import { parse as parseYaml } from 'yaml';

interface SimConfig {
  leaders: LeaderConfig[];
  timeline: { turns: number; startYear: number; schedule: number[] };
  seed: number;
  customEvents?: Array<{ turn: number; title: string; description: string }>;
  models?: { commander: string; departments: string; judge: string; director: string };
  keyPersonnel?: KeyPersonnel[];
}

function loadConfig(): SimConfig | null {
  const configPath = resolve(__dirname, '..', 'config.yaml');
  if (!existsSync(configPath)) return null;
  return parseYaml(readFileSync(configPath, 'utf-8')) as SimConfig;
}
```

Custom events are passed to the director as additional context. Dashboard tags user-injected events with a "USER EVENT" badge.

New dependency: `yaml: ^2.7.0`

---

## 10. Type System Cleanup

### Single Source of Truth

`src/kernel/state.ts` owns:
- `HexacoProfile`, `Department`, `Colonist` (all sub-interfaces)
- `ColonySystems`, `ColonyPolitics`, `SimulationState`, `TurnEvent`, `TurnOutcome`

`src/types.ts` becomes re-export barrel + output types:
- Imports from `kernel/state.ts`
- `LeaderConfig` (single definition)
- `ColonySnapshot`, `TurnResult`, `SimulationLog` (output format)

`src/agents/contracts.ts` adds:
- `DirectorCrisis`, `DirectorContext`, `CrisisOption`, `CrisisCategory`
- `ColonistQuote`
- `TypedPolicyEffect`, `PolicyEffectType`

Remove:
- `HexacoProfile` duplicate from `types.ts`
- `LeaderConfig` duplicate from `orchestrator.ts`
- `Scenario` type (replaced by `DirectorCrisis`)
- `SCENARIOS` array (replaced by director)

---

## 11. File-by-File Change Map

| File | Action | Phase | Changes |
|------|--------|-------|---------|
| `src/agents/orchestrator.ts` | **MAJOR REFACTOR** | 0-2 | Fix seed (C1), structured options (C3), apply colonist updates (C4), promote governance (C5), new turn pipeline with director, parser rewrites, retry logic |
| `src/kernel/kernel.ts` | **FIX** | 0 | Fix turn/year stamping (C2), update `advanceTurn()` to set metadata before progression |
| `src/kernel/progression.ts` | **FIX** | 0 | Remove `classifyOutcome()` text matching, replace with ID-based classification |
| `src/agents/director.ts` | **NEW** | 2 | Game Director agent, `generateCrisis()`, `buildDirectorContext()`, milestone crises, fallback crises, colonist quote generation |
| `src/agents/contracts.ts` | **ADD** | 0-2 | `CrisisOption`, `DirectorCrisis`, `DirectorContext`, `CrisisCategory`, `ColonistQuote`, `TypedPolicyEffect`, `PolicyEffectType` |
| `src/agents/departments.ts` | **MODERATE** | 1-2 | Accept `DirectorCrisis` instead of `Scenario`, return `recommendedEffects`, update `getDepartmentsForTurn()` to use director's `relevantDepartments` |
| `src/research/knowledge-base.ts` | **NEW** (replaces scenarios.ts + research.ts) | 2 | Topic-indexed research, `getResearchForTopics()` |
| `src/research/topics.ts` | **NEW** | 2 | `ResearchTopic`, category-to-topic mapping |
| `src/research/scenarios.ts` | **DELETE** | 2 | Replaced by director + milestones |
| `src/research/research.ts` | **DELETE** | 2 | Merged into knowledge-base.ts |
| `src/types.ts` | **REFACTOR** | 0 | Remove duplicates, re-export from state.ts, remove `Scenario` |
| `src/dashboard/index.html` | **MAJOR** | 0,3 | Per-column headers, deaths fix, crisis fix, parser fixes, divergence rail, colonist module, turn separators, loading states, tool cards, stats-as-change |
| `src/dashboard/about.html` | **UNCHANGED** | - | |
| `src/serve.ts` | **MODERATE** | 0,2 | Remove SSE injection, fix error event name, fix default turns, add YAML loader, pass shared seed |
| `src/run-visionary.ts` | **MINOR** | 0 | Pass explicit seed in opts |
| `src/run-engineer.ts` | **MINOR** | 0 | Pass explicit seed in opts |
| `package.json` | **MINOR** | 2 | Add `yaml` dependency, fix default dashboard script |
| `config.example.yaml` | **UPDATE** | 2 | Add director model, uncomment customEvents |

---

## 12. AgentOS APIs Used

### Existing (unchanged)

| API | Used By |
|-----|---------|
| `agent()` | Commander agents, department agents |
| `generateText()` | EmergentJudge LLM calls |
| `EmergentCapabilityEngine` | Tool forge pipeline |
| `EmergentJudge` | Tool safety/correctness review |
| `EmergentToolRegistry` | Tiered tool storage |
| `ForgeToolMetaTool` | Department agents forge tools |
| `ComposableToolBuilder` | Tool composition pipelines |
| `SandboxedToolForge` | Isolated V8 execution |

### New

| API | Used By |
|-----|---------|
| `agent()` | Crisis Director agent (demonstrates `agent()` for meta-level narrative intelligence) |

---

## 13. Known Gotchas

1. **OpenAI gpt-5.4-mini sends `implementation.mode: "code"` instead of `"sandbox"`**. Wrapper normalizes. Keep.
2. **OpenAI sends nested JSON as strings.** Wrapper parses. Keep.
3. **EmergentJudge rejects tools missing input validation.** Permissive schemas workaround. Keep.
4. **`EmergentJudgeConfig` uses `promotionModel` not `promotionJudgeModel`.** Different from `EmergentConfig`. Already handled.
5. **Personality field is `honesty` not `honestyHumility` in agent() API.** Already handled in orchestrator.ts:260.
6. **ForgeToolMetaTool context IDs don't match session IDs.** Wrapper patches. Keep.
7. **Director JSON parsing needs same robust extraction as departments.** Use `extractJsonBlocks()`.
8. **SSE `error` event collides with browser native.** Fixed: use `sim_error`.

---

## 14. Open Questions

1. **Director model.** `gpt-5.4` (same as commander) or cheaper? Quality vs. cost.
2. **Director session persistence.** Stateful (conversation history across turns, better coherence) vs. stateless (full context each turn, cheaper)? Recommendation: stateful for demo quality.
3. **Difficulty curve.** Explicit instructions ("harder by turn 8") vs. emergent from colony state? Recommendation: emergent, calibrated by colony health metrics.
4. **Science department.** Add agent for Carlos Fernandez, or keep as non-agent key personnel? Recommendation: add as agent for turns where scientific analysis is relevant.
5. **Year schedule.** Fixed (current accelerating gaps) or director-controlled? Recommendation: keep fixed for now, director controls crisis content not timeline.
6. **Divergence rail implementation.** Client-side diff (compare events from both streams) or server-side (orchestrator computes diff after both turns complete)? Recommendation: server-side, emit as dedicated SSE event after both timelines finish a turn.

---

## Appendix A: Implementation Order Summary

| Phase | Focus | Prerequisite |
|-------|-------|-------------|
| **Phase 0** | Correctness: shared seed, turn stamping, structured options, governance, apply colonist updates, default 12 turns, SSE error fix | None |
| **Phase 1** | Typed policy effects: effect families, department recommendations, commander selection, kernel application | Phase 0 |
| **Phase 2** | Emergent director: director agent, knowledge base refactor, milestone anchors, config loader, colonist quotes | Phase 1 |
| **Phase 3** | Dashboard: per-column headers, divergence rail, parser fixes, tool cards, colonist module, loading states, stats-as-change | Phase 2 |
| **Phase 4** | Productize: setup page + presets, replay mode, share/export, intro overlay | Phase 3 |

## Appendix B: Dashboard Color Palette (unchanged)

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-deep` | `#0a0806` | Page background |
| `--bg-panel` | `#12100d` | Panel backgrounds |
| `--bg-card` | `#1a1714` | Card backgrounds |
| `--rust` | `#c45a2c` | Crisis, critical risk |
| `--amber` / `--vis` | `#d4a04a` | Visionary timeline |
| `--teal` / `--eng` | `#3d8b8b` | Engineer timeline |
| `--green` | `#5a8b3d` | Success, conservative outcomes |
