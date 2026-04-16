# Multi-Event Turns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Event Director generates 1-3 events per turn. Each event goes through the full department/commander pipeline sequentially. Agent reactions happen once at the end of the turn.

**Architecture:** The director prompt changes to request a JSON array of events. The orchestrator wraps the existing department-through-outcome section in an inner event loop. A new `event_start` SSE event type marks the beginning of each event within a turn. Dashboard components updated to show event indices.

**Tech Stack:** TypeScript, AgentOS generateText, React 19, Canvas2D, SSE

---

## File Map

### Modified files
| File | Change |
|------|--------|
| `src/engine/types.ts` | Add `maxEventsPerTurn` to `ScenarioSetupSchema` |
| `src/runtime/director.ts` | New `generateEventBatch()`, updated prompt, batch JSON parser |
| `src/runtime/orchestrator.ts` | Inner event loop, cumulative state, batch reactions, `event_start` SSE |
| `src/engine/mars/scenario.json` | Add `maxEventsPerTurn: 3` |
| `src/engine/lunar/scenario.json` | Add `maxEventsPerTurn: 2` |
| `src/cli/dashboard/src/hooks/useGameState.ts` | Process `event_start`, add `currentEvents` to SideState |
| `src/cli/dashboard/src/components/sim/CrisisHeader.tsx` | Show event index "Event 1/3" |
| `src/cli/dashboard/src/components/sim/EventCard.tsx` | Event separator card for `event_start` |
| `src/cli/dashboard/src/components/sim/Timeline.tsx` | Sub-events per turn |
| `src/cli/dashboard/src/App.tsx` | Toast per `event_start` with deduplication |

---

## Task 0: Add maxEventsPerTurn to types and scenario configs

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/mars/scenario.json`
- Modify: `src/engine/lunar/scenario.json`

- [ ] **Step 1: Add maxEventsPerTurn to ScenarioSetupSchema**

In `src/engine/types.ts`, find:

```typescript
export interface ScenarioSetupSchema {
  defaultTurns: number;
  defaultSeed: number;
  defaultStartYear: number;
  defaultYearsPerTurn?: number;
  defaultPopulation: number;
  /** Which setup form sections to expose in the dashboard */
  configurableSections: Array<'leaders' | 'personnel' | 'resources' | 'departments' | 'events' | 'models' | 'advanced'>;
}
```

Replace with:

```typescript
export interface ScenarioSetupSchema {
  defaultTurns: number;
  defaultSeed: number;
  defaultStartYear: number;
  defaultYearsPerTurn?: number;
  defaultPopulation: number;
  /** Maximum events the Event Director can generate per turn. Default: 3 */
  maxEventsPerTurn?: number;
  /** Which setup form sections to expose in the dashboard */
  configurableSections: Array<'leaders' | 'personnel' | 'resources' | 'departments' | 'events' | 'models' | 'advanced'>;
}
```

- [ ] **Step 2: Add maxEventsPerTurn to Mars scenario**

In `src/engine/mars/scenario.json`, find the setup block:

```json
  "setup": {
    "defaultTurns": 12,
```

Add after `defaultTurns`:

```json
    "maxEventsPerTurn": 3,
```

- [ ] **Step 3: Add maxEventsPerTurn to Lunar scenario**

In `src/engine/lunar/scenario.json`, find the setup block and add:

```json
    "maxEventsPerTurn": 2,
```

- [ ] **Step 4: Commit**

```bash
git add src/engine/types.ts src/engine/mars/scenario.json src/engine/lunar/scenario.json
git commit -m "feat: add maxEventsPerTurn to ScenarioSetupSchema and scenario configs"
```

---

## Task 1: Event Director batch generation

**Files:**
- Modify: `src/runtime/director.ts`

- [ ] **Step 1: Add DirectorEventBatch type**

After the `DirectorEvent` interface (line ~36), add:

```typescript
/** Batch of events generated for a single turn. */
export interface DirectorEventBatch {
  events: DirectorEvent[];
  pacing: 'calm' | 'normal' | 'intense';
  reasoning: string;
}
```

- [ ] **Step 2: Update the director prompt for batch generation**

Replace `DEFAULT_DIRECTOR_INSTRUCTIONS` with:

```typescript
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

Return ONLY valid JSON:
{"events":[{"title":"...","description":"...","options":[{"id":"option_a","label":"...","description":"...","isRisky":false},{"id":"option_b","label":"...","description":"...","isRisky":true}],"riskyOptionId":"option_b","riskSuccessProbability":0.55,"category":"environmental","researchKeywords":["keyword"],"relevantDepartments":["dept_id"],"turnSummary":"One sentence"}],"pacing":"normal","reasoning":"Why this many events"}`;
```

- [ ] **Step 3: Update buildDirectorPrompt to include maxEvents**

At the top of the `buildDirectorPrompt` function, add a `maxEvents` parameter:

```typescript
function buildDirectorPrompt(ctx: DirectorContext, maxEvents: number = 3): string {
```

At the end of the prompt string (before the final backtick), change:

```typescript
Generate an event that tests this settlement based on its current state, past decisions, and tool intelligence. The event should feel like a consequence of what happened before. Return JSON only.`;
```

To:

```typescript
Generate 1 to ${maxEvents} events for this turn. Each event should feel like a consequence of what happened before. If the world is stable, 1 event is fine. If pressure is mounting, generate more. Return JSON with an "events" array.`;
```

- [ ] **Step 4: Add parseBatchResponse function**

After the existing `parseDirectorResponse` function, add:

```typescript
function parseBatchResponse(text: string): DirectorEventBatch | null {
  // Try to extract JSON
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) start = i; depth++; }
    if (text[i] === '}') { depth--; if (depth === 0 && start >= 0) {
      try {
        const raw = JSON.parse(text.slice(start, i + 1));

        // Batch format: { events: [...], pacing, reasoning }
        if (Array.isArray(raw.events) && raw.events.length > 0) {
          const events: DirectorEvent[] = raw.events.map((e: any) => ({
            title: e.title || 'Untitled Event',
            description: e.description || e.crisis || '',
            options: (e.options || []).map((o: any, idx: number) => ({
              id: o.id || `option_${String.fromCharCode(97 + idx)}`,
              label: o.label || `Option ${String.fromCharCode(65 + idx)}`,
              description: o.description || '',
              isRisky: o.isRisky === true,
            })),
            riskyOptionId: e.riskyOptionId || e.options?.find((o: any) => o.isRisky)?.id || 'option_b',
            riskSuccessProbability: typeof e.riskSuccessProbability === 'number' ? e.riskSuccessProbability : 0.5,
            category: e.category || 'infrastructure',
            researchKeywords: e.researchKeywords || [],
            relevantDepartments: e.relevantDepartments || ['medical', 'engineering'],
            turnSummary: e.turnSummary || '',
          }));
          return {
            events,
            pacing: raw.pacing || 'normal',
            reasoning: raw.reasoning || '',
          };
        }

        // Single event format (backward compat): { title, description, ... }
        if (raw.title && (raw.description || raw.crisis)) {
          const single = parseDirectorResponse(text.slice(start, i + 1));
          if (single) return { events: [single], pacing: 'normal', reasoning: 'single event' };
        }
      } catch { /* try next block */ }
      start = -1;
    }}
  }
  return null;
}
```

- [ ] **Step 5: Add generateEventBatch method to EventDirector**

In the `EventDirector` class, add after the existing `generateEvent` method:

```typescript
  /**
   * Generate 1 to maxEvents events for a turn.
   * Falls back to single-event generation if batch parsing fails.
   */
  async generateEventBatch(
    ctx: DirectorContext,
    maxEvents: number = 3,
    provider: LlmProvider = 'openai',
    model: string = 'gpt-5.4',
    instructions?: string,
  ): Promise<DirectorEventBatch> {
    const prompt = buildDirectorPrompt(ctx, maxEvents);
    const systemInstructions = (instructions || DEFAULT_DIRECTOR_INSTRUCTIONS)
      .replace('{MAX_EVENTS}', String(maxEvents));

    try {
      const { generateText } = await import('@framers/agentos');
      const result = await generateText({ provider, model, prompt: systemInstructions + '\n\n' + prompt });

      const batch = parseBatchResponse(result.text);
      if (batch && batch.events.length > 0) {
        // Enforce max
        batch.events = batch.events.slice(0, maxEvents);
        console.log(`  [director] Generated ${batch.events.length} events (${batch.pacing}) for ${ctx.leaderName}: ${batch.events.map(e => `"${e.title}"`).join(', ')}`);
        return batch;
      }

      // Try single-event fallback parse
      const single = parseDirectorResponse(result.text);
      if (single) {
        console.log(`  [director] Generated 1 event (single format) for ${ctx.leaderName}: "${single.title}"`);
        return { events: [single], pacing: 'normal', reasoning: 'parsed as single event' };
      }

      console.log(`  [director] Failed to parse batch for ${ctx.leaderName}, using fallback`);
    } catch (err) {
      console.log(`  [director] Batch error for ${ctx.leaderName}: ${err}`);
    }

    const fallback = FALLBACK_EVENTS[ctx.turn % FALLBACK_EVENTS.length];
    console.log(`  [director] Using fallback: "${fallback.title}"`);
    return { events: [{ ...fallback }], pacing: 'normal', reasoning: 'fallback' };
  }
```

- [ ] **Step 6: Commit**

```bash
git add src/runtime/director.ts
git commit -m "feat: Event Director batch generation (1-N events per turn)"
```

---

## Task 2: Orchestrator inner event loop

**Files:**
- Modify: `src/runtime/orchestrator.ts`

This is the largest change. The section from event generation through outcome/effects (currently ~lines 490-870) needs to be restructured so the department-analysis-through-outcome part loops over multiple events.

- [ ] **Step 1: Add event_start to SimEvent type**

Change the SimEvent type:

```typescript
export type SimEvent = {
  type: 'turn_start' | 'event_start' | 'dept_start' | 'dept_done' | 'forge_attempt' | 'commander_deciding' | 'commander_decided' | 'outcome' | 'drift' | 'agent_reactions' | 'bulletin' | 'turn_done' | 'promotion' | 'colony_snapshot';
  leader: string;
  turn?: number;
  year?: number;
  data?: Record<string, unknown>;
};
```

- [ ] **Step 2: Import DirectorEventBatch**

At the top of orchestrator.ts, update the director import:

```typescript
import { EventDirector, type DirectorEvent, type DirectorContext, type DirectorEventBatch } from './director.js';
```

- [ ] **Step 3: Restructure the turn loop**

Replace the section from the milestone/director event generation through the `emit('turn_done')` call. The new structure:

```typescript
    // ── Event generation ──────────────────────────────────────────────
    const maxEvents = sc.setup.maxEventsPerTurn ?? 3;

    let turnEvents: DirectorEvent[];
    let batchPacing: string = 'normal';

    const getMilestone = sc.hooks.getMilestoneEvent;
    const milestone = getMilestone?.(turn, maxTurns);
    if (milestone) {
      // Milestone turns always have exactly 1 event
      turnEvents = [{ ...milestone, description: (milestone as any).description || (milestone as any).crisis || '' } as DirectorEvent];
    } else {
      // Build director context
      const preState = kernel.getState();
      const alive = preState.agents.filter(c => c.health.alive);
      const dirCtx: DirectorContext = {
        turn, year,
        leaderName: leader.name, leaderArchetype: leader.archetype, leaderHexaco: leader.hexaco,
        state: preState.colony as unknown as Record<string, number>,
        politics: preState.politics as unknown as Record<string, number | string | boolean>,
        colony: preState.colony as unknown as Record<string, number>,
        aliveCount: alive.length,
        nativeBornCount: alive.filter(c => c.core.marsborn).length,
        marsBornCount: alive.filter(c => c.core.marsborn).length,
        recentDeaths: preState.eventLog.filter(e => e.turn === turn - 1 && e.type === 'death').length,
        recentBirths: preState.eventLog.filter(e => e.turn === turn - 1 && e.type === 'birth').length,
        previousEvents: eventHistory,
        previousCrises: eventHistory,
        toolsForged: Object.values(toolRegs).flat(),
        driftSummary: preState.agents.filter(c => c.promotion && c.health.alive).slice(0, 4)
          .map(c => ({ name: c.core.name, role: c.core.role, openness: c.hexaco.openness, conscientiousness: c.hexaco.conscientiousness })),
        recentToolOutputs: lastTurnToolOutputs,
        agentMoodSummary: lastTurnMoodSummary,
      };
      emit('turn_start', { turn, year, title: 'Director generating...', crisis: '', births: 0, deaths: 0, colony: preState.colony });
      const dirInstructions = sc.hooks.directorInstructions?.();
      const batch = await director.generateEventBatch(dirCtx, maxEvents, provider, modelConfig.director, dirInstructions);
      turnEvents = batch.events;
      batchPacing = batch.pacing;
    }

    // ── Kernel advance (once per turn, before events) ─────────────────
    const state = kernel.advanceTurn(turn, year, sc.hooks.progressionHook);
    const births = state.eventLog.filter(e => e.turn === turn && e.type === 'birth').length;
    const deaths = state.eventLog.filter(e => e.turn === turn && e.type === 'death').length;
    console.log(`  Kernel: +${births} births, -${deaths} deaths → pop ${state.colony.population}`);

    emit('turn_start', { turn, year, title: turnEvents[0]?.title || '', crisis: turnEvents[0]?.description?.slice(0, 200) || '', category: turnEvents[0]?.category || '', births, deaths, colony: state.colony, emergent: !milestone, turnSummary: turnEvents[0]?.turnSummary || '', totalEvents: turnEvents.length, pacing: batchPacing });

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`  Turn ${turn}/${maxTurns} — Year ${year}: ${turnEvents.length} event(s) [${milestone ? 'MILESTONE' : 'EMERGENT'}]`);
    console.log(`${'─'.repeat(50)}`);

    // ── Inner event loop ──────────────────────────────────────────────
    let reactions: import('./agent-reactions.js').AgentReaction[] = [];
    const turnEventTitles: string[] = [];

    for (let ei = 0; ei < turnEvents.length; ei++) {
      let event = turnEvents[ei];
      event = applyCustomEventToCrisis(event, opts.customEvents ?? [], turn);

      console.log(`  Event ${ei + 1}/${turnEvents.length}: ${event.title} (${event.category})`);
      emit('event_start', { turn, year, eventIndex: ei, totalEvents: turnEvents.length, title: event.title, description: event.description?.slice(0, 200), category: event.category, emergent: !milestone, turnSummary: event.turnSummary, pacing: batchPacing });

      turnEventTitles.push(event.title);

      // Research
      let packet: import('./contracts.js').CrisisResearchPacket;
      if (milestone) {
        packet = getResearchFromBundle(sc.knowledge, event.category, event.researchKeywords);
        if (packet.canonicalFacts.length === 0) packet = getResearchPacket(turn);
      } else {
        const memPacket = await recallResearch(event.title + ' ' + event.description.slice(0, 100), event.researchKeywords, event.category);
        if (memPacket.canonicalFacts.length >= 2) {
          packet = memPacket;
          console.log(`  [research] Memory recall: ${packet.canonicalFacts.length} citations`);
        } else if (opts.liveSearch && event.researchKeywords.length) {
          try {
            const query = event.researchKeywords.slice(0, 3).join(' ') + ' ' + sc.labels.settlementNoun + ' science';
            console.log(`  [research] Live search: "${query}"`);
            const searchResult = await webSearchTool.execute({ query }, { gmiId: sid, personaId: sid, userContext: {} } as any);
            const results = (searchResult as any)?.output?.results || [];
            packet = {
              canonicalFacts: results.slice(0, 5).map((r: any) => ({ claim: r.snippet || r.title || '', source: r.title || 'web search', url: r.url || '' })),
              counterpoints: [], departmentNotes: {},
            };
            console.log(`  [research] ${packet.canonicalFacts.length} live results`);
          } catch (err) {
            console.log(`  [research] Live search failed: ${err}`);
            packet = getResearchFromBundle(sc.knowledge, event.category, event.researchKeywords);
          }
        } else {
          packet = getResearchFromBundle(sc.knowledge, event.category, event.researchKeywords);
        }
      }

      // Departments
      const validDepts: Department[] = sc.departments.map(d => d.id as Department);
      const rawDepts = milestone ? getDepartmentsForTurn(turn) : event.relevantDepartments;
      const depts = rawDepts.filter(d => validDepts.includes(d) && activeDepartments.has(d));
      if (!depts.length) depts.push(validDepts[0] || 'medical', validDepts[1] || 'engineering');
      console.log(`  Departments: ${depts.join(', ')}`);

      const scenario = {
        turn, year, title: event.title, crisis: event.description,
        researchKeywords: event.researchKeywords, snapshotHints: {} as any,
        riskyOption: event.options.find(o => o.isRisky)?.label || '',
        riskSuccessProbability: event.riskSuccessProbability,
        options: event.options,
      };

      // Run departments in parallel
      const deptPromises = depts.map(async (dept) => {
        const sess = deptSess.get(dept);
        if (!sess) return emptyReport(dept);
        const ctx = buildDepartmentContext(dept, kernel.getState(), scenario, packet, deptMemory.get(dept), sc.hooks.departmentPromptHook);
        console.log(`  [${dept}] Analyzing...`);
        emit('dept_start', { turn, year, department: dept, eventIndex: ei });
        try {
          const r = await sess.send(ctx);
          trackUsage(r);
          const report = parseDeptReport(r.text, dept);
          console.log(`  [${dept}] Done: ${report.citations.length} citations, ${report.risks.length} risks, ${report.forgedToolsUsed.length} tools`);
          const validTools = report.forgedToolsUsed
            .filter(t => t && (t.name || t.description))
            .map(t => {
              const rawOutput = t.output ? (typeof t.output === 'string' ? t.output : JSON.stringify(t.output)) : null;
              let inputFields: string[] = [];
              let outputFields: string[] = [];
              if (rawOutput) {
                try {
                  const parsed = JSON.parse(rawOutput);
                  if (parsed && typeof parsed === 'object') {
                    const keys = Object.keys(parsed);
                    const inKey = keys.find(k => ['inputs', 'input', 'parameters', 'params'].includes(k));
                    if (inKey && parsed[inKey] && typeof parsed[inKey] === 'object') {
                      inputFields = Object.keys(parsed[inKey]);
                      outputFields = keys.filter(k => k !== inKey);
                    } else { outputFields = keys; }
                  }
                } catch {}
              }
              return {
                name: t.name || t.description || 'tool', mode: t.mode || 'sandbox',
                confidence: t.confidence ?? 0.85,
                description: t.description || humanizeToolName(t.name || ''),
                output: rawOutput?.slice(0, 400) || null,
                inputFields: inputFields.slice(0, 8), outputFields: outputFields.slice(0, 8),
                department: dept, crisis: event.title,
              };
            });
          emit('dept_done', {
            turn, year, department: dept, summary: report.summary, eventIndex: ei,
            citations: report.citations.length,
            citationList: report.citations.slice(0, 5).map(c => ({ text: c.text, url: c.url, doi: c.doi })),
            risks: report.risks, forgedTools: validTools,
            recommendedActions: report.recommendedActions?.slice(0, 2),
          });
          if (report.forgedToolsUsed.length) {
            const names = report.forgedToolsUsed.map(t => t?.name || t?.description || 'unnamed').filter(Boolean);
            if (names.length) toolRegs[dept] = [...(toolRegs[dept] || []), ...names];
          }
          return report;
        } catch (err) {
          console.log(`  [${dept}] ERROR: ${err}`);
          return emptyReport(dept);
        }
      });
      const reports = await Promise.all(deptPromises);

      // Tool outputs for next turn's director
      lastTurnToolOutputs = [
        ...lastTurnToolOutputs,
        ...reports.flatMap(r =>
          (r.forgedToolsUsed || []).filter(t => t?.output).map(t => ({
            name: t.name || 'unnamed', department: r.department,
            output: typeof t.output === 'string' ? t.output.slice(0, 200) : JSON.stringify(t.output).slice(0, 200),
          }))
        ),
      ];

      // Department memory
      for (const r of reports) {
        const mem = {
          turn, year, crisis: event.title,
          summary: r.summary,
          recommendedActions: r.recommendedActions?.slice(0, 3) || [],
          outcome: '',
          toolsForged: (r.forgedToolsUsed || []).map(t => t?.name || '').filter(Boolean),
        };
        const existing = deptMemory.get(r.department) || [];
        existing.push(mem);
        deptMemory.set(r.department, existing);
      }

      // Commander decision
      const summaries = reports.map(r => `## ${r.department.toUpperCase()} (conf: ${r.confidence})\n${r.summary}\nRisks: ${r.risks.map(x => `[${x.severity}] ${x.description}`).join('; ') || 'none'}\nRecs: ${r.recommendedActions.join('; ') || 'none'}`).join('\n\n');
      const optionText = event.options.length
        ? '\n\nOPTIONS:\n' + event.options.map(o => `- ${o.id}: ${o.label} — ${o.description}${o.isRisky ? ' [RISKY]' : ''}`).join('\n') + '\n\nYou MUST include "selectedOptionId" in your JSON response.'
        : '';
      const effectsList = reports.flatMap(r => (r.recommendedEffects || []).map(e =>
        `  - ${e.id} (${e.type}): ${e.description}${e.colonyDelta ? ' | Delta: ' + JSON.stringify(e.colonyDelta) : ''}`
      ));
      const effectsText = effectsList.length
        ? '\n\nAVAILABLE POLICY EFFECTS (include "selectedEffectIds" array in your JSON to apply):\n' + effectsList.join('\n')
        : '';
      const eventLabel = turnEvents.length > 1 ? ` (Event ${ei + 1}/${turnEvents.length})` : '';
      const cmdPrompt = `TURN ${turn}${eventLabel} — ${year}: ${event.title}\n\n${event.description}\n\nDEPARTMENT REPORTS:\n${summaries}\n\nColony: Pop ${kernel.getState().colony.population} | Morale ${Math.round(kernel.getState().colony.morale * 100)}% | Food ${kernel.getState().colony.foodMonthsReserve.toFixed(1)}mo${optionText}${effectsText}\n\nDecide. Return JSON.`;

      console.log(`  [commander] Deciding on "${event.title}"...`);
      emit('commander_deciding', { turn, year, eventIndex: ei });
      const cmdR = await cmdSess.send(cmdPrompt);
      trackUsage(cmdR);
      const decision = parseCmdDecision(cmdR.text, depts);
      console.log(`  [commander] ${decision.decision.slice(0, 120)}...`);
      emit('commander_decided', { turn, year, decision: decision.decision, rationale: decision.rationale, selectedPolicies: decision.selectedPolicies, eventIndex: ei });

      kernel.applyPolicy(decisionToPolicy(decision, reports, turn, year));

      // Agent updates from departments
      const agentUpdates = reports.flatMap(r =>
        (r.featuredAgentUpdates || []).filter(u => u && u.agentId && u.updates).map(u => ({
          agentId: u.agentId, health: u.updates?.health, career: u.updates?.career, narrativeEvent: u.updates?.narrative?.event,
        }))
      );
      if (agentUpdates.length) kernel.applyAgentUpdates(agentUpdates);

      // Outcome
      const outcomeRng = new SeededRng(seed).turnSeed(turn * 100 + ei);
      let resolvedOptionId = decision.selectedOptionId;
      if (!resolvedOptionId && event.options.length) {
        const decLower = (decision.decision || '').toLowerCase();
        for (const opt of event.options) {
          if (decLower.includes(opt.id) || decLower.includes(opt.label.toLowerCase())) {
            resolvedOptionId = opt.id; break;
          }
        }
      }
      const outcome = resolvedOptionId
        ? classifyOutcomeById(resolvedOptionId, event.options, event.riskSuccessProbability, kernel.getState().colony, outcomeRng)
        : classifyOutcome(decision.decision, scenario.riskyOption, event.riskSuccessProbability, kernel.getState().colony, outcomeRng);

      // Effects
      const outcomeEffectRng = new SeededRng(seed).turnSeed(turn * 100 + ei + 50);
      const personalityBonus = (leader.hexaco.openness - 0.5) * 0.08 + (leader.hexaco.conscientiousness - 0.5) * 0.04;
      const colonyDeltas = effectRegistry.applyOutcome(event.category, outcome, {
        personalityBonus, noise: outcomeEffectRng.next() * 0.2 - 0.1,
      });
      kernel.applyColonyDeltas(colonyDeltas as any, [{
        turn, year, type: 'system',
        description: `Outcome effect (${outcome}): ${Object.entries(colonyDeltas).map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v}`).join(', ')}`,
      }]);

      const polDelta = sc.hooks.politicsHook?.(event.category, outcome);
      if (polDelta) kernel.applyPoliticsDeltas(polDelta);

      outcomeLog.push({ turn, year, outcome });

      // Event history (for next turn's director context)
      eventHistory.push({
        turn, title: event.title, category: event.category,
        selectedOptionId: resolvedOptionId, decision: decision.decision.slice(0, 200), outcome,
      });

      console.log(`  [outcome] ${outcome} (${event.category}) effects: ${JSON.stringify(colonyDeltas)}`);
      emit('outcome', { turn, year, outcome, category: event.category, emergent: !milestone, colonyDeltas, eventIndex: ei });

    } // end inner event loop

    // ── Post-event: drift, reactions, memory ──────────────────────────

    // Drift
    const drifted = kernel.getState().agents.filter(c => c.promotion && c.health.alive);
    const driftData: Record<string, { name: string; hexaco: any }> = {};
    for (const p of drifted.slice(0, 5)) {
      const h = p.hexaco;
      driftData[p.core.id] = { name: p.core.name, hexaco: { O: +h.openness.toFixed(2), C: +h.conscientiousness.toFixed(2), E: +h.extraversion.toFixed(2), A: +h.agreeableness.toFixed(2) } };
    }
    emit('drift', { turn, year, agents: driftData });

    // Agent reactions (once per turn, reacting to ALL events)
    const reactionCtx = {
      crisisTitle: turnEventTitles.join(' / '),
      crisisCategory: turnEvents.map(e => e.category).join(', '),
      outcome: outcomeLog[outcomeLog.length - 1]?.outcome || 'conservative_success' as any,
      decision: turnEventTitles.join('. '),
      year, turn, colonyMorale: kernel.getState().colony.morale,
      colonyPopulation: kernel.getState().colony.population,
    };
```

The rest of the turn loop (agent reactions, memory, bulletin, turn_done, colony_snapshot) stays the same, using the `reactionCtx` above. The only difference is `crisisTitle` now contains all event titles joined with ` / `.

- [ ] **Step 4: Commit**

```bash
git add src/runtime/orchestrator.ts
git commit -m "feat: orchestrator inner event loop for multi-event turns"
```

---

## Task 3: Dashboard - process event_start SSE events

**Files:**
- Modify: `src/cli/dashboard/src/hooks/useGameState.ts`

- [ ] **Step 1: Add EventInfo and currentEvents to types**

Add after `AgentSnapshot`:

```typescript
export interface EventInfo {
  eventIndex: number;
  totalEvents: number;
  title: string;
  category: string;
}
```

Add to `SideState`:

```typescript
  currentEvents: EventInfo[];
```

Add to `emptySide()`:

```typescript
  currentEvents: [],
```

- [ ] **Step 2: Process event_start in the switch**

Add a case before `turn_start`:

```typescript
        case 'event_start': {
          const info: EventInfo = {
            eventIndex: Number(dd.eventIndex ?? 0),
            totalEvents: Number(dd.totalEvents ?? 1),
            title: String(dd.title || ''),
            category: String(dd.category || ''),
          };
          s.currentEvents.push(info);
          s.crisis = {
            turn: dd.turn as number,
            year: dd.year as number,
            title: `${info.eventIndex + 1}/${info.totalEvents}: ${info.title}`,
            description: dd.description as string || '',
            category: info.category,
            emergent: dd.emergent as boolean || false,
            turnSummary: dd.turnSummary as string || '',
          };
          s.events.push(processed);
          break;
        }
```

In the existing `turn_start` case, add a reset:

```typescript
        case 'turn_start':
          s.currentEvents = [];  // reset for new turn
          // ... rest of existing turn_start handling
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/dashboard/src/hooks/useGameState.ts
git commit -m "feat: process event_start SSE, track currentEvents per side"
```

---

## Task 4: CrisisHeader shows event index

**Files:**
- Modify: `src/cli/dashboard/src/components/sim/CrisisHeader.tsx`

- [ ] **Step 1: Update CrisisHeader display**

The `crisis.title` is now set to `"1/3: Dust Storm"` by the `event_start` handler. No code change needed in CrisisHeader itself since it already renders `crisis.title`. The formatting comes from useGameState.

Verify by reading the file and confirming it uses `crisis.title` directly. If correct, skip this task.

- [ ] **Step 2: Commit (if changes made)**

---

## Task 5: EventCard separator for event_start

**Files:**
- Modify: `src/cli/dashboard/src/components/sim/EventCard.tsx`

- [ ] **Step 1: Add event_start case**

In the switch statement, add after `turn_start`:

```typescript
    case 'event_start': {
      const idx = Number(dd.eventIndex ?? 0);
      const total = Number(dd.totalEvents ?? 1);
      const title = String(dd.title || '');
      const category = String(dd.category || '');
      if (total <= 1) return null; // don't show separator for single-event turns
      return (
        <div style={{
          padding: '6px 12px', fontSize: '11px',
          borderTop: idx > 0 ? '2px solid var(--border)' : undefined,
          marginTop: idx > 0 ? '6px' : undefined,
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ fontWeight: 800, color: 'var(--rust)', fontFamily: 'var(--mono)', fontSize: '10px' }}>
            EVENT {idx + 1}/{total}
          </span>
          <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{title}</span>
          {category && (
            <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '2px', background: 'var(--bg-deep)', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
              {category}
            </span>
          )}
        </div>
      );
    }
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/dashboard/src/components/sim/EventCard.tsx
git commit -m "feat: event separator cards for multi-event turns"
```

---

## Task 6: Timeline sub-events

**Files:**
- Modify: `src/cli/dashboard/src/components/sim/Timeline.tsx`

- [ ] **Step 1: Extract event_start data for sub-events**

In `extractTurns`, after the existing `turn_start` and `outcome` processing, add event_start tracking:

```typescript
    if (evt.type === 'event_start') {
      const turnNum = evt.data.turn as number;
      const t = turns.find(t => t.turn === turnNum);
      if (t) {
        if (!t.subEvents) t.subEvents = [];
        t.subEvents.push({
          index: Number(evt.data.eventIndex ?? 0),
          title: String(evt.data.title || ''),
          category: String(evt.data.category || ''),
        });
      }
    }
```

Add to `TurnEntry`:

```typescript
  subEvents?: Array<{ index: number; title: string; category: string }>;
```

- [ ] **Step 2: Render sub-events in timeline cards**

After the existing decision block in SideTimeline, add:

```typescript
            {t.subEvents && t.subEvents.length > 1 && (
              <div style={{ fontSize: '9px', color: 'var(--text-3)', marginTop: '2px', lineHeight: 1.3 }}>
                {t.subEvents.map((se, i) => (
                  <div key={i} style={{ display: 'flex', gap: '4px' }}>
                    <span style={{ color: 'var(--rust)', fontFamily: 'var(--mono)', fontWeight: 700, flexShrink: 0 }}>{se.index + 1}.</span>
                    <span>{se.title}</span>
                  </div>
                ))}
              </div>
            )}
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/dashboard/src/components/sim/Timeline.tsx
git commit -m "feat: timeline shows sub-events for multi-event turns"
```

---

## Task 7: Toast per event_start

**Files:**
- Modify: `src/cli/dashboard/src/App.tsx`

- [ ] **Step 1: Update crisis toast to handle event_start**

In the event toast useEffect, change the `turn_start` toast to `event_start`:

```typescript
        if (evt.type === 'event_start' && evt.data?.title) {
          const dedupeKey = `event-${evt.data.turn}-${evt.data.eventIndex}`;
          if (crisisToastSeen.current.has(dedupeKey)) continue;
          crisisToastSeen.current.add(dedupeKey);

          const title = String(evt.data.title);
          const crisis = evt.data.description ? String(evt.data.description) : '';
          const turn = evt.data.turn ? `T${String(evt.data.turn)}` : '';
          const year = evt.data.year ? String(evt.data.year) : '';
          const total = Number(evt.data.totalEvents ?? 1);
          const idx = Number(evt.data.eventIndex ?? 0);
          const eventLabel = total > 1 ? ` [${idx + 1}/${total}]` : '';
          const category = evt.data.category ? String(evt.data.category).toUpperCase() : '';
          const header = [turn, year, title + eventLabel].filter(Boolean).join(' ');
          const body = [category, crisis.length > 250 ? crisis.slice(0, 250) + '...' : crisis].filter(Boolean).join('\n');
          toast('info', header, body, 15000);
        }
```

Keep the existing `turn_start` toast but only fire it if it has a real title and there are no `event_start` events (backward compat for old single-event data):

```typescript
        if (evt.type === 'turn_start' && evt.data?.title && evt.data.title !== 'Director generating...' && !evt.data.totalEvents) {
          // Legacy single-event toast (no event_start events in this sim)
          // ... existing code ...
        }
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/dashboard/src/App.tsx
git commit -m "feat: toast notifications per event in multi-event turns"
```

---

## Task 8: Build verification

- [ ] **Step 1: Backend build**

```bash
cd apps/paracosm && npx tsc -p tsconfig.build.json --noEmit
```

Expected: no errors.

- [ ] **Step 2: Dashboard build**

```bash
cd src/cli/dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Vite production build**

```bash
npx vite build
```

Expected: successful build.

- [ ] **Step 4: Final commit and push**

```bash
git add -A
git commit -m "feat: multi-event turns (1-3 events per turn, sequential pipeline)"
git push origin master
```
