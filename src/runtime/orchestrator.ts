import { writeRunOutput } from './output-writer.js';
import type { ITool } from '@framers/agentos';
import {
  webSearchTool,
  createEmergentEngine,
  createCallForgedTool,
  wrapForgeTool,
  type CapturedForge,
} from './emergent-setup.js';
import {
  humanizeToolName,
  emptyReport,
  emptyDecision,
  decisionToPolicy,
} from './parsers.js';
import { sendAndValidate } from './llm-invocations/sendAndValidate.js';
import { DepartmentReportSchema } from './schemas/department.js';
import { CommanderDecisionSchema } from './schemas/commander.js';
import { createCostTracker } from './cost-tracker.js';
import {
  buildPersonalityCue,
  buildCommanderBootstrap,
  runDepartmentPromotions,
} from './commander-setup.js';
import { buildAvailableToolsBlock, buildForgedToolbox, type ForgedLedger } from './tool-ledger.js';
import { buildCitationCatalog } from './citations-catalog.js';
import type { Department, HexacoProfile, HexacoSnapshot, TurnOutcome } from '../engine/core/state.js';
import { SeededRng } from '../engine/core/rng.js';
import { classifyOutcome, classifyOutcomeById, driftCommanderHexaco } from '../engine/core/progression.js';
import { buildTrajectoryCue } from './hexaco-cues/trajectory.js';
import type { DepartmentReport, CommanderDecision, TurnArtifact } from './contracts.js';
import { SimulationKernel, type PolicyEffect } from '../engine/core/kernel.js';
import type { KeyPersonnel } from '../engine/core/agent-generator.js';
import { getResearchPacket } from './research/research.js';
import { getResearchFromBundle } from './research/scenario-research.js';
import { initResearchMemory, recallResearch, closeResearchMemory } from './research/research-memory.js';
import { buildDepartmentContext, getDepartmentsForTurn } from './departments.js';
import { EventDirector, type DirectorEvent, type DirectorContext, type DirectorEventBatch } from './director.js';
import { runReactionStep } from './reaction-step.js';
import type { ScenarioPackage } from '../engine/types.js';
import type { LlmProvider, SimulationModelConfig } from '../engine/types.js';
import {
  DEFAULT_EXECUTION,
  resolveSimulationModels,
  type SimulationExecutionConfig,
  type StartingPolitics,
  type StartingResources,
} from '../cli/sim-config.js';
import { applyCustomEventToCrisis, buildYearSchedule } from './runtime-helpers.js';
import { classifyProviderError, shouldAbortRun, type ClassifiedProviderError } from './provider-errors.js';
import { EffectRegistry } from '../engine/effect-registry.js';
import { marsScenario } from '../engine/mars/index.js';
import type { LeaderConfig } from '../engine/types.js';
export type { LeaderConfig };



// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export type SimEvent = {
  type:
    | 'turn_start' | 'event_start' | 'dept_start' | 'dept_done' | 'forge_attempt'
    | 'commander_deciding' | 'commander_decided' | 'outcome' | 'drift'
    | 'agent_reactions' | 'bulletin' | 'turn_done' | 'promotion'
    | 'colony_snapshot' | 'provider_error' | 'validation_fallback' | 'sim_aborted';
  leader: string;
  turn?: number;
  year?: number;
  data?: Record<string, unknown>;
};

export interface RunOptions {
  maxTurns?: number;
  seed?: number;
  startYear?: number;
  yearsPerTurn?: number;
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
  /**
   * Cancellation signal. When `.aborted` flips to true, the turn loop
   * short-circuits at the next turn boundary, emits a `sim_aborted`
   * event, and returns the partial result accumulated so far.
   *
   * Server wires this to an AbortController that fires after a grace
   * period of zero connected SSE clients, so a user who closes the tab
   * or navigates away stops billing for new LLM calls while preserving
   * the partial results they already accumulated in the event buffer.
   */
  signal?: AbortSignal;
}

export async function runSimulation(leader: LeaderConfig, keyPersonnel: KeyPersonnel[], opts: RunOptions = {}) {
  const { agent } = await import('@framers/agentos');
  const sc = opts.scenario ?? marsScenario;
  const maxTurns = opts.maxTurns ?? 12;
  const startYear = opts.startYear ?? 2035;
  const provider = opts.provider ?? 'openai';
  const sid = `${sc.labels.shortName}-v2-${leader.archetype.toLowerCase().replace(/\s+/g, '-')}`;
  const modelConfig = resolveSimulationModels(provider, opts.models);
  // Cost tracking: accumulate token usage and estimated cost across all LLM calls
  // Cost tracker: per-site buckets + cache-aware fallback estimation.
  // Lives in cost-tracker.ts so the math has one home and the turn loop
  // reads as dispatch. trackUsage(result, site) is called at every LLM
  // call site with a site tag; buildCostPayload() is called before each
  // SSE emit so the dashboard breakdown modal sees live data.
  const costTracker = createCostTracker(modelConfig);
  const trackUsage = costTracker.trackUsage;

  const emit = (type: SimEvent['type'], data?: Record<string, unknown>) => {
    opts.onEvent?.({
      type,
      leader: leader.name,
      data: {
        ...data,
        _cost: costTracker.buildCostPayload(),
      },
    });
  };

  /**
   * Run-scoped provider-error abort state. When a terminal error (quota
   * exhaustion, invalid API key) is detected on ANY LLM call, the
   * classifier fires `provider_error` over SSE once, sets this flag, and
   * every subsequent LLM call site short-circuits immediately instead of
   * thrashing against the same dead provider for another 5 turns.
   *
   * Reported via `output.providerError` on the returned result so
   * programmatic consumers (not just the dashboard) can detect a failed
   * run without parsing SSE.
   */
  let providerErrorState: ClassifiedProviderError | null = null;
  /** True once we've emitted the SSE so we don't spam duplicate banners. */
  let providerErrorEmitted = false;

  /**
   * Report a caught error from an LLM call site. Classifies it, and if it
   * is a terminal auth/quota failure, emits the `provider_error` SSE
   * (once) and sets the abort flag so subsequent turns skip LLM work.
   *
   * @param err The caught exception.
   * @param site Short label for where the error happened (used in logs,
   *        e.g. 'director', 'dept:medical', 'commander', 'reactions').
   * @returns The classified error so the caller can react (e.g. log
   *        differently for non-terminal errors).
   */
  const reportProviderError = (err: unknown, site: string): ClassifiedProviderError => {
    const classified = classifyProviderError(err);
    if (shouldAbortRun(classified.kind) && !providerErrorEmitted) {
      providerErrorState = classified;
      providerErrorEmitted = true;
      console.error(`  [${site}] PROVIDER ERROR (${classified.kind}): ${classified.message}`);
      emit('provider_error', {
        kind: classified.kind,
        provider: classified.provider,
        message: classified.message,
        actionUrl: classified.actionUrl,
        site,
      });
    }
    return classified;
  };

  /**
   * Emit a `validation_fallback` SSE event when a schema-validated LLM
   * call exhausts retries and falls back to an empty skeleton. Separate
   * from `provider_error` so the dashboard can distinguish model
   * misbehavior on schema (soft degradation, one call) from quota / auth
   * failures (terminal, aborts the run).
   */
  const reportValidationFallback = (site: string, details: { rawText: string; schemaName?: string; err: unknown }) => {
    console.warn(`  [${site}] SCHEMA FALLBACK on ${details.schemaName ?? '<unknown>'}: ${(details.err as any)?.message ?? details.err}`);
    emit('validation_fallback', {
      site,
      schemaName: details.schemaName,
      rawTextPreview: details.rawText.slice(0, 300),
    });
  };

  /** True when the run should stop launching new LLM work. */
  const isAborted = () => providerErrorState !== null;

  /**
   * Combined abort check: either an external signal flipped (client
   * disconnected past the grace period so the server's watchdog fired)
   * or a terminal provider error stopped the run. Used to gate every
   * expensive LLM call inside a turn so at most one in-flight call
   * completes after a tab close before the rest of the turn short-
   * circuits. Without these gates the turn's remaining depts +
   * commander + reactions would all fire even after the watchdog
   * aborted, burning tokens on nobody.
   */
  const shouldStop = () => opts.signal?.aborted || isAborted();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${sc.labels.name.toUpperCase()} v2`);
  console.log(`  Commander: ${leader.name} — "${leader.archetype}"`);
  console.log(`  Turns: ${maxTurns} | Live search: ${opts.liveSearch ? 'yes' : 'no'}`);
  console.log(`${'═'.repeat(60)}\n`);

  // Initialize research memory from scenario knowledge bundle
  await initResearchMemory(sc.knowledge);

  const seed = opts.seed ?? 950;
  const kernel = new SimulationKernel(seed, leader.name, keyPersonnel, {
    startYear,
    initialPopulation: opts.initialPopulation,
    // StartingResources / StartingPolitics are subsets of the kernel's
    // Partial<WorldSystems / WorldPolitics> shape. The kernel's types
    // carry index signatures for scenario-defined fields; the starter
    // configs only declare the universal fields, so the cast is safe.
    startingResources: opts.startingResources as Partial<import('../engine/core/state.js').WorldSystems> | undefined,
    startingPolitics: opts.startingPolitics as Partial<import('../engine/core/state.js').WorldPolitics> | undefined,
  });

  const toolMap = new Map<string, ITool>();
  toolMap.set('web_search', webSearchTool);
  // Shared map of approved forged-tool executables. Populated by the
  // engine's onToolForged callback; read by the call_forged_tool
  // meta-tool so depts can execute prior-turn forges on new inputs
  // without paying for another judge review.
  const forgedExecutables = new Map<string, ITool>();
  const { engine, forgeTool } = createEmergentEngine(
    toolMap,
    provider,
    modelConfig.judge,
    opts.execution,
    // Forward judge-call usage into the run-wide cost tracker. Without this,
    // every forge review (often 30-50% of total API spend) was invisible to
    // the `cost` field returned from runSimulation(). Tagged 'judge' so
    // the StatsBar breakdown can show exactly how much review cost.
    (result) => trackUsage(result, 'judge'),
    // Pipe judge-call errors into the provider-error classifier so a 401
    // or 429-with-insufficient-quota from the judge fires the same abort
    // path as failures from any other LLM call site.
    (err) => reportProviderError(err, 'judge'),
    forgedExecutables,
  );
  const callForgedTool = createCallForgedTool(forgedExecutables);
  const toolRegs: Record<string, string[]> = {};

  /**
   * Per-simulation forged-tool ledger. Tracks first-forge metadata + a
   * full reuse history so the UI can show WHEN a tool was used, BY WHICH
   * dept, on WHICH event, and WHAT OUTPUT it produced — not just a flat
   * "reused 3x" count.
   *
   * Two distinct signals:
   *   forgeCalls   the judge ran a fresh forge (succeeded or failed)
   *   uses         the LLM cited an existing tool in its dept report
   *                without re-forging (self-reported via forgedToolsUsed)
   *
   * Both surface in the UI; only the latter is "real" reuse, but tracking
   * both makes failure / re-forge attempts auditable.
   */
  const forgedLedger: ForgedLedger = new Map();

  // Commander HEXACO evolves per-turn via driftCommanderHexaco. Clone
  // the caller's leader.hexaco so we never mutate the caller's config —
  // pair-runner reuses configs across runs and chat-agents hold
  // references to the baseline profile. Every downstream read of the
  // commander's current personality goes through commanderHexacoLive.
  const commanderHexacoLive: HexacoProfile = { ...leader.hexaco };
  const commanderHexacoHistory: HexacoSnapshot[] = [
    { turn: 0, year: startYear, hexaco: { ...leader.hexaco } },
  ];

  // Commander does NOT use systemBlocks caching because AgentOS's
  // `systemBlocks` path replaces the assembled system prompt entirely,
  // dropping the HEXACO-derived personality descriptors that are the
  // commander's entire voice. Commander runs only ~12 calls per head-to-
  // head run, so savings from caching here (~$0.03) are not worth
  // losing the trait-driven behavioral cues that make leaders diverge.
  const commander = agent({
    provider, model: modelConfig.commander,
    instructions: leader.instructions,
    personality: { openness: leader.hexaco.openness, conscientiousness: leader.hexaco.conscientiousness, extraversion: leader.hexaco.extraversion, agreeableness: leader.hexaco.agreeableness, emotionality: leader.hexaco.emotionality, honesty: leader.hexaco.honestyHumility },
    maxSteps: opts.execution?.commanderMaxSteps ?? DEFAULT_EXECUTION.commanderMaxSteps,
  });
  const cmdSess = commander.session(`${sid}-cmd`);

  // Bootstrap the commander with a HEXACO-derived personality cue. This
  // is the FIRST LLM call in the run, so if the user's key is invalid
  // or credits are exhausted, the classifier fires here before we burn
  // compute on a run that has no hope of producing valid output.
  try {
    trackUsage(
      await cmdSess.send(buildCommanderBootstrap(buildPersonalityCue(leader.hexaco))),
      'commander',
    );
  } catch (err) {
    reportProviderError(err, 'commander-bootstrap');
    // If this is a terminal provider error, isAborted() is now true; the
    // turn loop skips LLM work but continues so the end-of-run cleanup
    // path runs and the user gets a proper `complete` SSE event.
  }

  // Turn 0: commander promotes department heads from the kernel's
  // candidate roster. Any dept the commander skips gets its top
  // candidate promoted via fallback so turn 1 starts with a full cabinet.
  // Abort gate: promotions fire one commander LLM call per department
  // (up to 5) before Turn 1 even begins. If the user clicked Run and
  // immediately closed the tab, skipping this saves those calls
  // entirely; the fallback path inside runDepartmentPromotions also
  // needs to be skipped because the whole run is being torn down.
  if (!shouldStop()) {
    await runDepartmentPromotions({
      kernel,
      scenario: sc,
      leader,
      startYear,
      sendToCommander: (prompt) => cmdSess.send(prompt),
      trackUsage,
      emit,
    });
  }

  // Captured forge events keyed by department. Each `wrapForgeTool` push
  // here on every successful or failed forge; we drain the dept's bucket
  // around each `dept_done` emit to attribute forges to the right event.
  // This is the source of truth — the LLM's self-reported `forgedToolsUsed`
  // is supplementary because it frequently omits tools it actually forged.
  const deptForgeBuckets = new Map<Department, CapturedForge[]>();
  // Track current event/turn for forge_attempt SSE emission so each
  // real-time forge can be attributed to the surrounding event.
  let currentEmitContext: { turn: number; year: number; eventIndex: number } = { turn: 0, year: startYear, eventIndex: 0 };
  const captureForge = (dept: Department) => (record: CapturedForge) => {
    const bucket = deptForgeBuckets.get(dept) ?? [];
    bucket.push(record);
    deptForgeBuckets.set(dept, bucket);
    // Real-time SSE so the dashboard can render an animated card the
    // moment a forge happens, instead of waiting for the dept_done summary.
    const inputProps = (record.inputSchema && typeof record.inputSchema === 'object' && (record.inputSchema as any).properties)
      ? Object.keys((record.inputSchema as any).properties)
      : [];
    const outputProps = (record.outputSchema && typeof record.outputSchema === 'object' && (record.outputSchema as any).properties)
      ? Object.keys((record.outputSchema as any).properties)
      : [];
    emit('forge_attempt', {
      turn: currentEmitContext.turn,
      year: currentEmitContext.year,
      eventIndex: currentEmitContext.eventIndex,
      department: dept,
      name: record.name,
      description: record.description,
      mode: record.mode,
      approved: record.approved,
      confidence: record.confidence,
      inputFields: inputProps.slice(0, 8),
      outputFields: outputProps.slice(0, 8),
      errorReason: record.errorReason,
      timestamp: record.timestamp,
    });
  };

  // Create department agent sessions from promoted agents
  const deptAgents = new Map<Department, any>();
  const deptSess = new Map<Department, any>();
  const promoted = kernel.getState().agents.filter(c => c.promotion);
  for (const p of promoted) {
    const dept = p.promotion!.department;
    const cfg = sc.departments.find(c => c.id === dept);
    if (!cfg) continue;
    const wrapped = wrapForgeTool(forgeTool, `${sid}-${dept}`, sid, dept, captureForge(dept));
    // call_forged_tool lets this dept execute any tool another dept
    // (or this one) forged in a prior turn. Reuse costs ~zero vs a
    // fresh forge, so including it in the tools array on turn 1 is
    // safe — the forgedExecutables map is empty until something is
    // approved, at which point the meta-tool starts dispatching.
    const tools: ITool[] = opts.liveSearch
      ? [webSearchTool, wrapped, callForgedTool]
      : [wrapped, callForgedTool];
    // Universal forge_tool prompt injected for EVERY scenario (Mars,
    // Lunar, custom compiled, etc.). Previously only the hardcoded
    // DEPARTMENT_CONFIGS in departments.ts told the LLM about forging,
    // and that file was dead code — the orchestrator always reads
    // cfg.instructions from the scenario JSON, which doesn't mention
    // forge_tool. Result: no tools were ever forged unless the scenario
    // author thought to add the instruction themselves.
    const forgeGuidance = `

EMERGENT TOOLING — forge + reuse economy:

You have TWO meta-tools for computational analysis:

1. call_forged_tool(name, args): invoke a tool ALREADY in the ALREADY-FORGED TOOLS context block. No judge review. Costs nothing. Returns fresh output for new inputs. This is the FIRST thing to reach for when the toolbox has a tool whose scope covers your current question.

2. forge_tool(...): build a NEW tool from scratch. Judge-reviewed for safety and correctness before it executes. Adds to the toolbox. Use only when no existing tool covers the analysis, or when a fresh angle would add real insight.

Before every analysis, READ the ALREADY-FORGED TOOLS block carefully. Ask:
  (a) Does an existing tool compute what I need? → call_forged_tool it.
  (b) Does an existing tool almost compute it with different inputs? → call_forged_tool it, accept approximate fit.
  (c) Does NO existing tool apply, or would a novel composition produce genuine new insight? → forge_tool.

Forge when quantitative reasoning is needed and the toolbox has no applicable tool for it. Reuse when the toolbox already covers the question. Your personality profile above shapes how aggressive you are on either side of that line.

The implementation of forged tools runs in a sandboxed V8 isolate (10s timeout, 128MB memory, no network unless allowlisted). An LLM judge reviews your tool for safety AND CORRECTNESS before it executes.

HARD RULES — if you violate any of these, a local validator rejects the forge BEFORE the judge sees it and you waste the attempt:

1. inputSchema.properties MUST have at least two named fields, each with a JSON Schema "type". {"type":"object","additionalProperties":true} with NO properties is an automatic reject. Always list the fields your code reads.
2. outputSchema.properties MUST have at least one named field with a type. Empty output schemas are rejected.
3. additionalProperties on both schemas SHOULD be false so the declared shape is authoritative.
4. testCases MUST have at least 2 entries. Each testCase.input must be a non-empty object whose keys match your declared inputSchema fields. Tests with input:{} are rejected.
5. Every testCase.expectedOutput must name at least one field from your outputSchema — empty expectedOutput defeats the judge's correctness check.

Match the full worked example below exactly; do not emit placeholder/schema-skeleton forms.

ROBUSTNESS RULES (the judge enforces these — failed forges hurt the colony):
1. Validate every numeric input. If a field is missing/null/undefined or NaN, default it to a safe value or return a conservative result. Never let the function throw or return NaN/Infinity.
2. Wrap the body in a try/catch and return a defined object on error: { "score": 0, "warnings": ["missing input X"] }.
3. Use Number.isFinite() before using any input in arithmetic. Avoid division — multiply by reciprocals or guard with (denominator || 1).
4. ARRAYS: never call .includes(), .map(), .filter(), .some(), .find(), .length, etc. on an input without first checking Array.isArray(x). Default missing arrays to []: const arr = Array.isArray(input.items) ? input.items : []. A single "Cannot read properties of undefined (reading 'includes')" TypeError fails the whole tool and costs the colony morale + power.
5. STRINGS: same rule — guard with typeof x === 'string' before .includes()/.split()/.toLowerCase(). Default to '' when missing.
6. Provide AT LEAST 3 testCases:
   - one happy path with realistic numbers
   - one with a missing/zero input (must NOT throw)
   - one with a boundary value (population=0, capacity=1, etc.)
7. Bound your output to a defined range (e.g., score 0..100, multiplier 0.1..10) so downstream code stays predictable.

GOOD FORGE EXAMPLE (follow this shape, adapt the domain). Every declared property is in "required". No optional output fields — the judge treats optional fields as schema-mismatch bait, so KEEP EVERY FIELD REQUIRED and always return every one from execute().
{
  "name": "radiation_dose_risk_score",
  "description": "Scores cumulative Mars radiation exposure risk on 0..100.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "cumulative_dose_msv": { "type": "number", "description": "mSv lifetime" },
      "age_years": { "type": "number" },
      "shielding_factor": { "type": "number", "description": "0..1 reduction" }
    },
    "required": ["cumulative_dose_msv", "age_years", "shielding_factor"],
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "risk_score": { "type": "number", "description": "0..100, higher is worse" },
      "tier": { "type": "string", "enum": ["low", "medium", "high", "critical"] }
    },
    "required": ["risk_score", "tier"],
    "additionalProperties": false
  },
  "implementation": {
    "mode": "sandbox",
    "code": "function execute(input){try{const d=Number.isFinite(+input.cumulative_dose_msv)?+input.cumulative_dose_msv:0;const a=Number.isFinite(+input.age_years)?+input.age_years:30;const s=Number.isFinite(+input.shielding_factor)?Math.max(0,Math.min(1,+input.shielding_factor)):0;const eff=d*(1-s);let score=Math.max(0,Math.min(100,eff/30*(1+Math.max(0,(60-a))/100)));const tier=score>=80?'critical':score>=50?'high':score>=20?'medium':'low';return{risk_score:Math.round(score),tier};}catch(e){return{risk_score:0,tier:'low'};}}",
    "allowlist": []
  },
  "testCases": [
    { "input": { "cumulative_dose_msv": 1200, "age_years": 42, "shielding_factor": 0.3 }, "expectedOutput": { "tier": "high" } },
    { "input": { "cumulative_dose_msv": 0, "age_years": 30, "shielding_factor": 0 }, "expectedOutput": { "risk_score": 0, "tier": "low" } },
    { "input": { "cumulative_dose_msv": 4000, "age_years": 65, "shielding_factor": 0 }, "expectedOutput": { "tier": "critical" } }
  ]
}
Every field declared in properties AND required AND returned by execute(). additionalProperties:false on both schemas. Three real test cases each with real inputs matching declared fields and a field-level assertion in expectedOutput. Match this density exactly or the judge will reject.

IF YOUR FORGE IS REJECTED: the tool result will tell you the exact shape failure ("inputSchema has no declared properties", "outputSchema has no declared properties", "testCases use empty input", etc.). Immediately call forge_tool AGAIN with those specific fixes. Do not skip. Do not move to a different tool. Fix the named fields and resubmit — you get two retries before the department moves on.

REPORT FORMAT:
Respond with valid JSON ONLY (no markdown, no prose outside the JSON):
{
  "department": "${dept}",
  "summary": "...",
  "citations": [{"text": "...", "url": "...", "context": "..."}],
  "risks": [{"severity": "low|medium|high|critical", "description": "..."}],
  "opportunities": [{"impact": "low|medium|high", "description": "..."}],
  "recommendedActions": ["..."],
  "forgedToolsUsed": [{"name": "tool_name", "mode": "sandbox", "description": "what it does", "output": {...}, "confidence": 0.9}],
  "recommendedEffects": [{"id": "effect_1", "type": "resource_shift|capacity_expansion|risk_mitigation|social_investment|research_bet", "description": "...", "colonyDelta": {"morale": 0.05}}],
  "confidence": 0.85,
  "openQuestions": [],
  "featuredAgentUpdates": [],
  "proposedPatches": {}
}`;
    // Prompt caching: the combined role instructions + forge guidance
    // (~1500-2500 tokens) are identical across every session.send() call
    // for this department across all turns/events in one run. Moving it
    // to a cacheable systemBlock means the second event's dept call and
    // every subsequent one hit the provider's prefix cache at 0.1x
    // billed rate on Anthropic. Combined across 5 depts x ~12 calls,
    // this is the single largest savings in the sim pipeline.
    const deptSystemPrompt = cfg.instructions + forgeGuidance;
    const a = agent({
      provider,
      model: modelConfig.departments || cfg.defaultModel,
      systemBlocks: [{ text: deptSystemPrompt, cacheBreakpoint: true }],
      tools,
      maxSteps: opts.execution?.departmentMaxSteps ?? DEFAULT_EXECUTION.departmentMaxSteps,
    });
    deptAgents.set(dept, a);
    deptSess.set(dept, a.session(`${sid}-${dept}`));
  }
  console.log(`  Promoted ${promoted.length} department heads. Agents created.\n`);

  const artifacts: TurnArtifact[] = [];
  const yearSchedule = buildYearSchedule(startYear, maxTurns, opts.yearsPerTurn);
  const outcomeLog: Array<{ turn: number; year: number; outcome: TurnOutcome }> = [];
  const eventHistory: DirectorContext['previousEvents'] = [];
  let lastTurnToolOutputs: Array<{ name: string; department: string; output: string }> = [];
  let lastTurnMoodSummary: string | undefined;
  // Run-wide accumulators surfaced in the final runSimulation() result so
  // programmatic consumers see the same data the dashboard sees via SSE.
  const allDepartmentReports: Array<{ turn: number; year: number; eventIndex: number; eventTitle: string; report: DepartmentReport }> = [];
  const allCommanderDecisions: Array<{ turn: number; year: number; eventIndex: number; eventTitle: string; decision: CommanderDecision; outcome: TurnOutcome }> = [];
  const allForges: Array<CapturedForge & { turn: number; year: number; eventIndex: number }> = [];
  const allAgentReactions: Array<{ turn: number; year: number; reactions: import('./agent-reactions.js').AgentReaction[] }> = [];
  const allDirectorEvents: Array<{ turn: number; year: number; eventIndex: number; event: DirectorEvent; pacing: string }> = [];
  // Per-turn slots that fill during the inner event loop and then get
  // merged into TurnArtifact at the end of the turn.
  let turnDeptReports: DepartmentReport[] = [];
  let turnDecisions: CommanderDecision[] = [];
  let turnPolicyEffects: string[] = [];
  const director = new EventDirector();
  const effectRegistry = new EffectRegistry(sc.effects[0]?.categoryDefaults ?? {});
  // Department memory: stores previous turn summaries per department for session continuity
  const deptMemory = new Map<Department, import('./departments.js').DepartmentTurnMemory[]>();
  const activeDepartments = new Set<Department>(opts.activeDepartments ?? sc.departments.map(d => d.id));

  // Track whether the run was cancelled by an external AbortSignal so
  // the final result object can carry an `aborted: true` flag and the
  // dashboard can label the run "Unfinished" instead of "Complete".
  // Distinct from provider-error abort (which is also terminal but has
  // its own classified reason). External abort is typically "user
  // navigated away and the server pulled the plug after the grace
  // period" — not a failure of the sim, just an intentional cancel.
  let externallyAborted = false;

  for (let turn = 1; turn <= maxTurns; turn++) {
    const year = yearSchedule[turn - 1] ?? (yearSchedule[yearSchedule.length - 1] + (turn - yearSchedule.length) * 5);

    // ── External-abort gate ─────────────────────────────────────────
    // Fired when opts.signal flips (client disconnected and grace
    // period expired). Emits a single sim_aborted event and bails out
    // of the turn loop — we do NOT continue emitting degraded turn_done
    // stubs, because an external cancel is a clean stop, not a
    // provider-errored skip. Partial results already in the event
    // buffer stay intact so the user sees what was reached.
    if (opts.signal?.aborted && !externallyAborted) {
      externallyAborted = true;
      emit('sim_aborted', {
        turn, year,
        reason: 'client_disconnected',
        completedTurns: turn - 1,
        colony: kernel.getState().colony,
        toolsForged: Object.values(toolRegs).flat().length,
      });
      break;
    }

    // ── Abort gate ───────────────────────────────────────────────────
    // If a terminal provider error was hit on a previous turn (or on the
    // commander bootstrap), every LLM call in this turn would throw the
    // same way and be silently caught downstream. Skip the turn entirely
    // and emit a minimal `turn_done` event with the error attached so the
    // dashboard playhead advances to the abort point instead of looking
    // stuck. This replaces ~5 turns of thrashing + empty reports with one
    // crisp banner + graceful exit.
    if (isAborted()) {
      // Capture the provider error to a local const so TS narrowing holds
      // inside the object literal below (closure-assigned lets lose their
      // narrow through control-flow re-analysis).
      const pe = providerErrorState as ClassifiedProviderError | null;
      emit('turn_done', {
        turn, year,
        colony: kernel.getState().colony,
        toolsForged: Object.values(toolRegs).flat().length,
        aborted: true,
        providerError: pe
          ? { kind: pe.kind, provider: pe.provider, message: pe.message }
          : undefined,
      });
      continue;
    }

    try {

    // ── Event generation ──────────────────────────────────────────────
    const maxEvents = sc.setup.maxEventsPerTurn ?? 2;
    let turnEvents: DirectorEvent[];
    let batchPacing = 'normal';

    const getMilestone = sc.hooks.getMilestoneEvent;
    const milestone = getMilestone?.(turn, maxTurns);
    if (milestone) {
      turnEvents = [{ ...milestone, description: (milestone as any).description || (milestone as any).crisis || '' } as DirectorEvent];
    } else {
      const preState = kernel.getState();
      const alive = preState.agents.filter(c => c.health.alive);
      const dirCtx: DirectorContext = {
        turn, year,
        leaderName: leader.name, leaderArchetype: leader.archetype, leaderHexaco: commanderHexacoLive,
        leaderHexacoHistory: commanderHexacoHistory,
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
        // Ground director's researchKeywords / category in real bundle entries so
        // recallResearch/getResearchFromBundle can surface citations downstream.
        knowledgeTopics: Object.keys(sc.knowledge?.topics ?? {}),
        knowledgeCategories: Object.keys(sc.knowledge?.categoryMapping ?? {}),
      };
      emit('turn_start', { turn, year, title: 'Director generating...', crisis: '', births: 0, deaths: 0, colony: preState.colony });
      // Abort gate: if the client already left during the gap between
      // the kernel advance and the director call, skip the director's
      // flagship LLM call. The inner event loop then has nothing to
      // iterate and the outer turn loop's top-of-turn signal check
      // catches the abort on the next iteration and emits sim_aborted.
      if (shouldStop()) {
        turnEvents = [];
      } else {
      const dirInstructions = sc.hooks.directorInstructions?.();
      const batch = await director.generateEventBatch(
        dirCtx,
        maxEvents,
        provider,
        modelConfig.director,
        dirInstructions,
        // Fold director spend into the run-wide cost tracker. One flagship
        // call per turn that was previously unaccounted. Tagged 'director'
        // so the breakdown surfaces it separately from dept calls.
        (result) => trackUsage(result, 'director'),
        // Classify director-call errors so quota exhaustion fires the
        // abort banner instead of silently running six turns of canned
        // fallback events.
        (err) => reportProviderError(err, 'director'),
      );
      turnEvents = batch.events;
      batchPacing = batch.pacing;
      }
    }

    // ── Kernel advance (once per turn, before events) ─────────────────
    const state = kernel.advanceTurn(turn, year, sc.hooks.progressionHook);
    const births = state.eventLog.filter(e => e.turn === turn && e.type === 'birth').length;
    const deaths = state.eventLog.filter(e => e.turn === turn && e.type === 'death').length;
    console.log(`  Kernel: +${births} births, -${deaths} deaths → pop ${state.colony.population}`);

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`  Turn ${turn}/${maxTurns} — Year ${year}: ${turnEvents.length} event(s) [${milestone ? 'MILESTONE' : 'EMERGENT'}]`);
    console.log(`${'─'.repeat(50)}`);

    emit('turn_start', { turn, year, title: turnEvents[0]?.title || '', crisis: turnEvents[0]?.description?.slice(0, 200) || '', category: turnEvents[0]?.category || '', births, deaths, colony: state.colony, emergent: !milestone, turnSummary: turnEvents[0]?.turnSummary || '', totalEvents: turnEvents.length, pacing: batchPacing });

    // ── Inner event loop ──────────────────────────────────────────────
    let reactions: import('./agent-reactions.js').AgentReaction[] = [];
    const turnEventTitles: string[] = [];
    lastTurnToolOutputs = [];
    let lastOutcome: import('../engine/core/state.js').TurnOutcome = 'conservative_success';
    let lastEventCategory = '';
    // Reset per-turn slots so the artifacts.push() below captures only this
    // turn's reports / decisions / policies.
    turnDeptReports = [];
    turnDecisions = [];
    turnPolicyEffects = [];

    for (let ei = 0; ei < turnEvents.length; ei++) {
      try {
      let event = applyCustomEventToCrisis(turnEvents[ei], opts.customEvents ?? [], turn);

      // Update context so any forge_attempt SSE emitted during this event
      // (from inside parallel dept calls) is attributed to the right slot.
      currentEmitContext = { turn, year, eventIndex: ei };

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
            const searchResult = await webSearchTool.execute({ query }, { gmiId: sid, personaId: sid, userContext: {} } as any);
            const results = (searchResult as any)?.output?.results || [];
            packet = { canonicalFacts: results.slice(0, 5).map((r: any) => ({ claim: r.snippet || r.title || '', source: r.title || 'web search', url: r.url || '' })), counterpoints: [], departmentNotes: {} };
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

      // Snapshot per-dept bucket lengths BEFORE this event's parallel
      // dept calls run, so the eventForges tally below can slice only
      // the forges added during this event. Without this, the tally
      // accumulated cumulative forges every event (a turn-1 failed
      // forge would be counted again on turns 2, 3, 4, 5 — inflating
      // the morale + power penalty incorrectly each turn).
      const eventBucketStarts = new Map<Department, number>();
      for (const dept of depts) {
        eventBucketStarts.set(dept, deptForgeBuckets.get(dept)?.length ?? 0);
      }

      const scenario = {
        turn, year, title: event.title, crisis: event.description,
        researchKeywords: event.researchKeywords, snapshotHints: {} as any,
        riskyOption: event.options.find(o => o.isRisky)?.label || '',
        riskSuccessProbability: event.riskSuccessProbability,
        options: event.options,
      };

      // Build a shared "previously forged tools" block for this turn so
      // every department in this event sees the same inventory. First
      // iteration listed just name + description, which wasn't enough —
      // the LLM kept re-forging because the system prompt says "Run it
      // to produce a number you reference in your summary" and there
      // was no other way to surface a number than to re-run forge_tool.
      // Now we also include the last approved output so the LLM can
      // cite both the name and the value without re-forging.
      const availableToolsBlock = buildAvailableToolsBlock(forgedLedger);

      const deptPromises = depts.map(async (dept) => {
        const sess = deptSess.get(dept);
        if (!sess) return emptyReport(dept);
        const baseCtx = buildDepartmentContext(dept, kernel.getState(), scenario, packet, deptMemory.get(dept), sc.hooks.departmentPromptHook);
        // Turn-1 bootstrap forge floor. Without a tool forged on turn 1
        // there is nothing for later turns to reuse, and high-discipline
        // dept heads on both sides converged on "existing knowledge is
        // enough, skip forging" — killing the reuse economy before it
        // started. Forcing one forge on turn 1 seeds the toolbox so the
        // personality asymmetry (Visionary reuses more, Engineer
        // rebuilds more) can actually play out in turns 2-6.
        const bootstrapDirective = turn === 1
          ? '\n\nTURN 1 IS A BOOTSTRAP TURN. You MUST call forge_tool at least once this turn to contribute a reusable computational tool to the shared toolbox. Later turns will reuse what you forge here. Pick a quantifiable aspect of THIS event (e.g. a risk score, a capacity calculator, a resource allocator) and forge a tool that computes it. Do not skip the forge — the colony depends on building a toolbox the whole run can draw from.\n'
          : '';
        const ctx = baseCtx + bootstrapDirective + availableToolsBlock;
        emit('dept_start', { turn, year, department: dept, eventIndex: ei });
        // Snapshot the dept's forge bucket index BEFORE the LLM call so we
        // can attribute new forges to this specific dept_done. The LLM
        // self-reports `forgedToolsUsed` in JSON but frequently omits tools
        // it actually forged — captured forges below are authoritative.
        const forgeBucketStart = deptForgeBuckets.get(dept)?.length ?? 0;
        try {
          const { object: parsedDeptReport, fromFallback: deptFallback } = await sendAndValidate({
            session: sess,
            prompt: ctx,
            schema: DepartmentReportSchema,
            schemaName: 'DepartmentReport',
            onUsage: (usage) => trackUsage(usage as any, 'departments'),
            onProviderError: (err) => reportProviderError(err, `dept:${dept}:turn${turn}:event${ei + 1}`),
            onValidationFallback: (details) => reportValidationFallback(`dept:${dept}:turn${turn}:event${ei + 1}`, details),
            fallback: { ...emptyReport(dept), summary: `${dept} report unavailable this turn.` } as any,
          });
          if (deptFallback) {
            console.log(`    [${dept}] schema fallback; using empty report skeleton`);
          }
          // Cast schema-inferred result back to the legacy DepartmentReport
          // nominal type so downstream code (reports consumer, cost tracker,
          // citation plumbing) sees the same shape it always has.
          const report = parsedDeptReport as unknown as DepartmentReport;
          // Citation provenance guarantee: when the LLM omits citations but the
          // research packet carried real sources, attribute them to the report.
          // This keeps the citation flow auditable end-to-end (seed → memory →
          // department prompt → report → UI), even when the LLM forgets to
          // copy them into its JSON output.
          if (report.citations.length === 0 && packet.canonicalFacts.length > 0) {
            report.citations = packet.canonicalFacts.slice(0, 5).map(f => ({
              text: f.claim,
              url: f.url,
              context: f.source,
              ...(f.doi ? { doi: f.doi } : {}),
            }));
          }
          // Drain the forges captured during THIS dept's send() — the
          // ground-truth list of what actually got forged this event.
          const bucket = deptForgeBuckets.get(dept) ?? [];
          const captured = bucket.slice(forgeBucketStart);

          // Build a map keyed by tool name. Captured entries (real forge
          // events) take priority; LLM-reported entries (from JSON) fill
          // in narrative output when the captured record lacks it.
          const toolByName = new Map<string, {
            name: string; description: string; mode: string;
            confidence: number; output: unknown;
            inputSchema: unknown; outputSchema: unknown;
            approved: boolean; errorReason?: string;
          }>();

          for (const c of captured) {
            toolByName.set(c.name, {
              name: c.name,
              description: c.description,
              mode: c.mode,
              confidence: c.confidence,
              output: c.output,
              inputSchema: c.inputSchema,
              outputSchema: c.outputSchema,
              approved: c.approved,
              errorReason: c.errorReason,
            });
          }

          // Supplementary: anything the LLM reported that we somehow
          // didn't capture (rare, but covers edge cases like an LLM that
          // pre-existing-tool reuse without re-invoking forge_tool).
          for (const t of report.forgedToolsUsed || []) {
            if (!t || (!t.name && !t.description)) continue;
            const name = String(t.name || t.description || 'tool');
            if (toolByName.has(name)) {
              // Backfill output from LLM JSON if we have nothing better
              const existing = toolByName.get(name)!;
              if (!existing.output && t.output) existing.output = t.output;
              continue;
            }
            // LLM cited an existing tool without re-forging. Use the
            // tool's prior judge confidence from the ledger (set on its
            // first successful forge) rather than fabricating an 0.85
            // default. The LLM's t.confidence here is its OWN estimate
            // of the result, not the judge's verdict on the tool.
            const ledgerForName = forgedLedger.get(name);
            const existingHistory = ledgerForName?.history || [];
            const lastApproved = [...existingHistory].reverse().find(h => !h.rejected);
            const ledgerConfidence = lastApproved?.confidence;
            toolByName.set(name, {
              name,
              description: String(t.description || humanizeToolName(name)),
              mode: String(t.mode || 'sandbox'),
              confidence: ledgerConfidence ?? (typeof t.confidence === 'number' ? t.confidence : 0.85),
              output: t.output ?? null,
              inputSchema: undefined,
              outputSchema: undefined,
              approved: true,
            });
          }

          const validTools = [...toolByName.values()].map(t => {
            const rawOutput = t.output != null
              ? (typeof t.output === 'string' ? t.output : JSON.stringify(t.output))
              : null;
            // Derive a flat field list from the actual schema if we have
            // one, falling back to keys parsed from the output payload.
            let inputFields: string[] = [], outputFields: string[] = [];
            const inProps = (t.inputSchema && typeof t.inputSchema === 'object' && (t.inputSchema as any).properties) || null;
            const outProps = (t.outputSchema && typeof t.outputSchema === 'object' && (t.outputSchema as any).properties) || null;
            if (inProps) inputFields = Object.keys(inProps as Record<string, unknown>);
            if (outProps) outputFields = Object.keys(outProps as Record<string, unknown>);
            if ((inputFields.length === 0 || outputFields.length === 0) && rawOutput) {
              try {
                const p = JSON.parse(rawOutput);
                if (p && typeof p === 'object') {
                  const keys = Object.keys(p);
                  const inKey = keys.find(k => ['inputs','input','parameters','params'].includes(k));
                  if (inKey && p[inKey] && typeof p[inKey] === 'object') {
                    if (inputFields.length === 0) inputFields = Object.keys(p[inKey]);
                    if (outputFields.length === 0) outputFields = keys.filter(k => k !== inKey);
                  } else if (outputFields.length === 0) {
                    outputFields = keys;
                  }
                }
              } catch {}
            }

            // First-forge tracking: a tool is "new" only on the turn it was
            // first seen in this simulation. All subsequent appearances are
            // reuses of the same forged capability.
            const seen = forgedLedger.get(t.name);
            const isNew = !seen;
            // Determine if THIS appearance was a fresh forge attempt by
            // checking only the slice of forges captured during the
            // current LLM call (everything past forgeBucketStart). The
            // earlier check scanned the whole bucket which would flag a
            // turn-5 citation of a turn-1 forge as a re-forge.
            const captureMatched = captured.some(c => c.name === t.name);
            if (!seen) {
              // Prefer schema from the captured forge call args. Fall back
              // to the EmergentToolRegistry lookup (also our schema source).
              let inputSchema: unknown | undefined = t.inputSchema;
              let outputSchema: unknown | undefined = t.outputSchema;
              if (!inputSchema || !outputSchema) {
                try {
                  const registered = (engine as any).registry?.get?.(t.name);
                  if (registered) {
                    if (!inputSchema) inputSchema = registered.inputSchema;
                    if (!outputSchema) outputSchema = registered.outputSchema;
                  }
                } catch { /* best-effort */ }
              }
              forgedLedger.set(t.name, {
                firstForgedTurn: turn,
                firstForgedDepartment: dept,
                firstForgedEventIndex: ei,
                firstForgedEventTitle: event.title,
                inputSchema,
                outputSchema,
                history: [],
              });
            }
            const ledgerEntry = forgedLedger.get(t.name)!;
            // Append this invocation to the tool's reuse history. The first
            // append for a brand-new tool counts as the original forge; all
            // subsequent appends are reuses (whether the LLM cited it or
            // re-forged it). Skipped if a captured forge for this name
            // already wrote a history entry above (avoids double-counting
            // when the captured forge AND the LLM JSON both mention it).
            const alreadyLoggedThisEvent = ledgerEntry.history.some(h =>
              h.turn === turn && h.eventIndex === ei && h.department === dept,
            );
            if (!alreadyLoggedThisEvent) {
              ledgerEntry.history.push({
                turn, year, eventIndex: ei, eventTitle: event.title,
                department: dept,
                output: rawOutput?.slice(0, 400) || null,
                isReforge: captureMatched,
                rejected: !t.approved,
                confidence: t.confidence,
              });
            }
            const reuseCount = Math.max(0, ledgerEntry.history.length - 1);
            return {
              name: t.name,
              mode: t.mode,
              confidence: t.confidence,
              description: t.description,
              output: rawOutput?.slice(0, 400) || null,
              inputFields: inputFields.slice(0, 8),
              outputFields: outputFields.slice(0, 8),
              department: dept,
              crisis: event.title,
              approved: t.approved,
              errorReason: t.errorReason,
              // Provenance fields used by the UI to highlight emergent
              // first-forge events vs subsequent reuses.
              isNew,
              firstForgedTurn: ledgerEntry.firstForgedTurn,
              firstForgedDepartment: ledgerEntry.firstForgedDepartment,
              firstForgedEventIndex: ledgerEntry.firstForgedEventIndex,
              firstForgedEventTitle: ledgerEntry.firstForgedEventTitle,
              inputSchema: ledgerEntry.inputSchema,
              outputSchema: ledgerEntry.outputSchema,
              /** Authoritative reuse count derived from history length. */
              reuseCount,
              /** Full per-invocation history so the UI can show when, where, and what each use produced. */
              history: ledgerEntry.history,
            };
          });
          emit('dept_done', { turn, year, department: dept, summary: report.summary, eventIndex: ei, citations: report.citations.length, citationList: report.citations.slice(0, 5).map(c => ({ text: c.text, url: c.url, doi: c.doi })), risks: report.risks, forgedTools: validTools, recommendedActions: report.recommendedActions?.slice(0, 2) });
          if (validTools.length) {
            const names = validTools.map(t => t.name).filter(Boolean);
            if (names.length) toolRegs[dept] = [...(toolRegs[dept] || []), ...names];
          }
          return report;
        } catch (err) {
          // Classify before returning the empty report. A single dept
          // failure on a transient error is fine, but if this is auth or
          // quota, the first classification flips the run-scoped abort
          // flag and the outer turn loop will skip the rest of the run.
          reportProviderError(err, `dept:${dept}`);
          console.log(`  [${dept}] ERROR: ${err}`);
          return emptyReport(dept);
        }
      });
      // Abort gate: checking before Promise.all lets us bail out
      // without firing N parallel dept LLM calls (5 flagship calls
      // per event, each with tool-forge judge passes on top). This
      // is the single largest cost on an abandoned turn.
      if (shouldStop()) {
        console.log(`  [abort] Skipping dept analysis for turn ${turn} event ${ei + 1} (${opts.signal?.aborted ? 'signal' : 'provider error'}).`);
        break;
      }
      const reports = await Promise.all(deptPromises);

      // Accumulate per-turn + run-wide so the final result includes the
      // full department report payloads (programmatic API parity with SSE).
      turnDeptReports.push(...reports);
      for (const r of reports) {
        allDepartmentReports.push({ turn, year, eventIndex: ei, eventTitle: event.title, report: r });
      }
      // Pull THIS event's captured forges into the run-wide ledger.
      // Use the per-dept eventBucketStarts snapshot instead of scanning
      // the whole bucket and de-duping with .find() (was O(n²) and prone
      // to missed matches when timestamps tied at sub-ms resolution).
      for (const dept of depts) {
        const bucket = deptForgeBuckets.get(dept) ?? [];
        const start = eventBucketStarts.get(dept) ?? 0;
        for (const forge of bucket.slice(start)) {
          allForges.push({ ...forge, turn, year, eventIndex: ei });
        }
      }

      // Accumulate tool outputs across events
      lastTurnToolOutputs.push(...reports.flatMap(r => (r.forgedToolsUsed || []).filter(t => t?.output).map(t => ({ name: t.name || 'unnamed', department: r.department, output: typeof t.output === 'string' ? t.output.slice(0, 200) : JSON.stringify(t.output).slice(0, 200) }))));

      // Department memory
      for (const r of reports) {
        const mem = { turn, year, crisis: event.title, summary: r.summary, recommendedActions: r.recommendedActions?.slice(0, 3) || [], outcome: '', toolsForged: (r.forgedToolsUsed || []).map(t => t?.name || '').filter(Boolean) };
        const existing = deptMemory.get(r.department) || [];
        existing.push(mem);
        deptMemory.set(r.department, existing);
      }

      // Commander
      // Defensive: LLM occasionally returns risks/recommendedActions as
      // a string or an object instead of an array. Previously the
      // commander prompt builder crashed with "r.risks.map is not a
      // function" and the entire event was aborted.
      const summaries = reports.map(r => {
        const risks = Array.isArray(r.risks) ? r.risks : [];
        const recs = Array.isArray(r.recommendedActions) ? r.recommendedActions : [];
        const risksLine = risks.map(x => `[${x?.severity ?? '?'}] ${x?.description ?? ''}`).join('; ') || 'none';
        const recsLine = recs.join('; ') || 'none';
        return `## ${r.department.toUpperCase()} (conf: ${r.confidence})\n${r.summary}\nRisks: ${risksLine}\nRecs: ${recsLine}`;
      }).join('\n\n');
      const optionText = event.options.length ? '\n\nOPTIONS:\n' + event.options.map(o => `- ${o.id}: ${o.label} — ${o.description}${o.isRisky ? ' [RISKY]' : ''}`).join('\n') + '\n\nYou MUST include "selectedOptionId" in your JSON response.' : '';
      const effectsList = reports.flatMap(r => (r.recommendedEffects || []).map(e => `  - ${e.id} (${e.type}): ${e.description}${e.colonyDelta ? ' | Delta: ' + JSON.stringify(e.colonyDelta) : ''}`));
      const effectsText = effectsList.length ? '\n\nAVAILABLE POLICY EFFECTS:\n' + effectsList.join('\n') : '';
      // Expose the current forged toolbox to the commander so their
      // rationale can cite specific tool outputs (e.g. "per Medical's
      // radiation_dose_calculator returning 3.4 mSv"). Without this,
      // commanders acknowledge tools in prose but never reference
      // specific outputs, which reads as generic risk framing rather
      // than evidence-driven decision-making.
      const commanderToolboxBlock = availableToolsBlock;
      const eventLabel = turnEvents.length > 1 ? ` (Event ${ei + 1}/${turnEvents.length})` : '';
      // Commander decision with a lightweight chain-of-thought scaffold.
      // The model is instructed to reason through four axes (trait alignment,
      // department consensus vs override, risk tolerance, forged-tool
      // evidence) inside <thinking> tags, then emit the decision JSON. On
      // the nano / haiku class where commander runs in demo mode the CoT
      // preamble adds ~300 tokens of reasoning per call but visibly sharpens
      // rationale quality (rationales started citing specific tool outputs
      // and trade tradeoffs instead of generic risk-averse hedging).
      const trajectoryCue = buildTrajectoryCue(commanderHexacoHistory, commanderHexacoLive);
      const cmdPrompt =
`TURN ${turn}${eventLabel} — ${year}: ${event.title}

${event.description}
${trajectoryCue ? `\n${trajectoryCue}\n` : ''}
DEPARTMENT REPORTS:
${summaries}
${commanderToolboxBlock}
Colony: Pop ${kernel.getState().colony.population} | Morale ${Math.round(kernel.getState().colony.morale * 100)}% | Food ${kernel.getState().colony.foodMonthsReserve.toFixed(1)}mo${optionText}${effectsText}

REASONING — populate the "reasoning" field of your JSON response BEFORE committing to selectedOptionId. Numbered list, one point per line:
  (1) What does my personality profile push me toward on this call? Name the specific trait poles at play.
  (2) Do the department reports converge or conflict? If they conflict, which voice do I trust given my profile?
  (3) Which forged-tool outputs in the toolbox above directly inform this decision? Cite the numeric output if available.
  (4) What risk am I accepting vs refusing? My rationale must name the specific trade.
  (5) Final choice + one-line justification.

Then set selectedOptionId, decision, and rationale. The rationale compresses the reasoning into a single paragraph for default UI display; the "reasoning" field stores the full working.`;

      // Abort gate: skip the commander LLM call if the client left
      // between dept analysis and commander decision. Breaking the
      // event loop here also skips the remaining per-event outcome
      // and drift emits; the turn finishes with partial reports and
      // the next turn sees the abort flag and emits sim_aborted.
      if (shouldStop()) {
        console.log(`  [abort] Skipping commander decision for turn ${turn} event ${ei + 1}.`);
        break;
      }
      emit('commander_deciding', { turn, year, eventIndex: ei });
      const { object: decisionParsed, fromFallback: decisionFallback } = await sendAndValidate({
        session: cmdSess,
        prompt: cmdPrompt,
        schema: CommanderDecisionSchema,
        schemaName: 'CommanderDecision',
        onUsage: (usage) => trackUsage(usage as any, 'commander'),
        onProviderError: (err) => reportProviderError(err, `commander:turn${turn}:event${ei + 1}`),
        onValidationFallback: (details) => reportValidationFallback(`commander:turn${turn}:event${ei + 1}`, details),
        fallback: { ...emptyDecision(depts), decision: 'Commander decision unavailable; defer to department consensus.' } as any,
      });
      if (decisionFallback) {
        console.log(`  [commander] schema fallback for turn ${turn} event ${ei + 1}`);
      }
      const decision = decisionParsed as unknown as CommanderDecision;
      console.log(`  [commander] ${decision.decision.slice(0, 120)}...`);
      emit('commander_decided', {
        turn, year,
        decision: decision.decision,
        rationale: decision.rationale,
        /** Full stepwise CoT preserved from the schema's reasoning field.
         *  Dashboard renders this behind a "Show full analysis" expand;
         *  rationale is the default compressed view. */
        reasoning: (decision as unknown as { reasoning?: string }).reasoning ?? '',
        selectedPolicies: decision.selectedPolicies,
        eventIndex: ei,
      });

      kernel.applyPolicy(decisionToPolicy(decision, reports, turn, year));
      const agentUpdates = reports.flatMap(r => (r.featuredAgentUpdates || []).filter(u => u && u.agentId && u.updates).map(u => ({ agentId: u.agentId, health: u.updates?.health, career: u.updates?.career, narrativeEvent: u.updates?.narrative?.event })));
      if (agentUpdates.length) kernel.applyAgentUpdates(agentUpdates);

      // Outcome
      const outcomeRng = new SeededRng(seed).turnSeed(turn * 100 + ei);
      let resolvedOptionId = decision.selectedOptionId;
      if (!resolvedOptionId && event.options.length) { const decLower = (decision.decision || '').toLowerCase(); for (const opt of event.options) { if (decLower.includes(opt.id) || decLower.includes(opt.label.toLowerCase())) { resolvedOptionId = opt.id; break; } } }
      const outcome = resolvedOptionId
        ? classifyOutcomeById(resolvedOptionId, event.options, event.riskSuccessProbability, kernel.getState().colony, outcomeRng)
        : classifyOutcome(decision.decision, scenario.riskyOption, event.riskSuccessProbability, kernel.getState().colony, outcomeRng);

      const outcomeEffectRng = new SeededRng(seed).turnSeed(turn * 100 + ei + 50);
      // Personality bonus shapes outcome magnitude. Two extreme leaders
      // (e.g. Visionary openness=0.95 vs Engineer openness=0.25) should
      // produce visibly different colony trajectories. Prior coefficients
      // (0.08/0.04) yielded ~3-5% effect spread which got lost in noise;
      // bumped to 0.20/0.12 plus an alignment term so picking a risky
      // option with high openness or a safe option with high conscientiousness
      // is rewarded extra. Values are still bounded by the effect registry's
      // delta caps, so this widens divergence without breaking the kernel.
      const isRiskyChoice = resolvedOptionId === event.riskyOptionId;
      const personalityBonus =
        (commanderHexacoLive.openness - 0.5) * 0.20 +
        (commanderHexacoLive.conscientiousness - 0.5) * 0.12 +
        // Alignment kicker: choosing in line with personality boosts effect
        (isRiskyChoice ? (commanderHexacoLive.openness - 0.5) : (commanderHexacoLive.conscientiousness - 0.5)) * 0.10;

      // Tool intelligence factor — tally what departments forged THIS
      // event (using the bucket snapshots taken before the dept calls)
      // and feed into the effect registry so emergent tools materially
      // affect outcomes. Reuses are nearly free; failed forges cost
      // morale + power. Run-wide cumulative count gives a small
      // log-scaled innovation bonus with diminishing returns.
      const eventForges = (() => {
        let newCount = 0, reuseCount = 0, failCount = 0;
        const newNamesThisEvent = new Set<string>();
        for (const dept of depts) {
          const bucket = deptForgeBuckets.get(dept) ?? [];
          const start = eventBucketStarts.get(dept) ?? 0;
          // Forges added DURING this event only — slice past start.
          const newForges = bucket.slice(start);
          for (const f of newForges) {
            if (!f.approved) { failCount++; continue; }
            // First-time forges: name not seen before (firstForgedTurn === turn
            // AND we haven't already counted it elsewhere this event).
            const ledgerEntry = forgedLedger.get(f.name);
            const isFirstUse = ledgerEntry?.firstForgedTurn === turn && !newNamesThisEvent.has(f.name);
            if (isFirstUse) {
              newCount++;
              newNamesThisEvent.add(f.name);
            } else {
              reuseCount++;
            }
          }
        }
        return {
          newToolsThisEvent: newCount,
          reuseCountThisEvent: reuseCount,
          forgeFailures: failCount,
          totalToolsForRun: forgedLedger.size,
        };
      })();

      const colonyDeltas = effectRegistry.applyOutcome(event.category, outcome, {
        personalityBonus,
        noise: outcomeEffectRng.next() * 0.2 - 0.1,
        toolModifiers: eventForges,
      });
      kernel.applyColonyDeltas(colonyDeltas as any, [{ turn, year, type: 'system', description: `Outcome effect (${outcome}): ${Object.entries(colonyDeltas).map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v}`).join(', ')}` }]);

      const polDelta = sc.hooks.politicsHook?.(event.category, outcome);
      if (polDelta) kernel.applyPoliticsDeltas(polDelta);

      outcomeLog.push({ turn, year, outcome });
      eventHistory.push({ turn, title: event.title, category: event.category, selectedOptionId: resolvedOptionId, decision: decision.decision.slice(0, 200), outcome });
      // Accumulate full decision + outcome + event for the API result so
      // programmatic consumers don't have to scrape SSE event buffers.
      turnDecisions.push(decision);
      if (decision.selectedPolicies?.length) {
        turnPolicyEffects.push(...decision.selectedPolicies.map(p => typeof p === 'string' ? p : JSON.stringify(p)));
      }
      allCommanderDecisions.push({ turn, year, eventIndex: ei, eventTitle: event.title, decision, outcome });
      allDirectorEvents.push({ turn, year, eventIndex: ei, event, pacing: batchPacing });
      lastOutcome = outcome;
      lastEventCategory = event.category;

      console.log(`  [outcome] ${outcome} (${event.category}) effects: ${JSON.stringify(colonyDeltas)}`);
      emit('outcome', { turn, year, outcome, category: event.category, emergent: !milestone, colonyDeltas, eventIndex: ei });
      } catch (err) {
        // Classify event-loop errors. If the commander call threw a
        // quota/auth error, this is where it lands. `reportProviderError`
        // flips the run abort flag and the next turn iteration short-
        // circuits via the isAborted() gate at the top of the loop.
        reportProviderError(err, `event-loop:turn${turn}:event${ei + 1}`);
        console.error(`  [event ${ei + 1}/${turnEvents.length}] Failed: ${err}`);
        // Continue to next event; don't kill the turn on transient errors
      }
    } // end inner event loop

    // ── Post-events: drift, reactions, memory, artifacts ──────────────
    const prevYear = turn === 1 ? startYear : yearSchedule[turn - 2] ?? startYear;
    const yearDelta = Math.max(1, year - prevYear);
    kernel.applyDrift(commanderHexacoLive, lastOutcome, yearDelta);
    // Commander drifts alongside their agents. Outcome-pull only (no
    // leader-pull since commander IS the leader; no role-pull since
    // they have no department). Mutates commanderHexacoLive in place
    // and appends this turn's snapshot to commanderHexacoHistory.
    driftCommanderHexaco(commanderHexacoLive, lastOutcome, yearDelta, turn, year, commanderHexacoHistory);

    const drifted = kernel.getState().agents.filter(c => c.promotion && c.health.alive);
    const driftData: Record<string, { name: string; hexaco: any }> = {};
    for (const p of drifted.slice(0, 5)) { const h = p.hexaco; driftData[p.core.id] = { name: p.core.name, hexaco: { O: +h.openness.toFixed(2), C: +h.conscientiousness.toFixed(2), E: +h.extraversion.toFixed(2), A: +h.agreeableness.toFixed(2) } }; }
    emit('drift', { turn, year, agents: driftData });

    // Agent reactions (once per turn, reacting to ALL events). Runs the
    // full roster on turn 1; turn 2+ uses progressive reactions to pick
    // only agents materially affected by this turn's events (featured +
    // promoted heads + dept-relevant, capped at 30). See reaction-step.ts.
    // Abort gate: reactions are batched but still fire many LLM calls
    // (up to ~30 per turn on turn 1). Skip them entirely if the run
    // was aborted between dept analysis and this step.
    if (shouldStop()) {
      console.log(`  [abort] Skipping reactions for turn ${turn}.`);
      continue;
    }
    const reactionResult = await runReactionStep({
      kernel,
      scenario: sc,
      turn, year, seed,
      turnEvents,
      turnEventTitles,
      lastEventCategory,
      lastOutcome,
      provider,
      modelConfig,
      execution: opts.execution,
      trackUsage,
      reportProviderError,
      emit,
    });
    reactions = reactionResult.reactions;
    if (reactionResult.moodSummary) lastTurnMoodSummary = reactionResult.moodSummary;

    // Accumulate reactions for the run-wide log (also surfaced via SSE).
    if (reactions.length) {
      allAgentReactions.push({ turn, year, reactions });
    }

    const after = kernel.getState();
    // Bundle this turn's full data into the artifact (was empty placeholders
    // before — meant the runSimulation() return value silently dropped
    // every department report and commander decision the SSE stream had).
    const mergedDecision = turnDecisions.length === 1
      ? turnDecisions[0]
      : turnDecisions.reduce(
          (acc, d) => ({
            ...acc,
            decision: [acc.decision, d.decision].filter(Boolean).join(' | '),
            rationale: [acc.rationale, d.rationale].filter(Boolean).join(' | '),
            selectedPolicies: [...(acc.selectedPolicies || []), ...(d.selectedPolicies || [])],
            rejectedPolicies: [...(acc.rejectedPolicies || []), ...(d.rejectedPolicies || [])],
            expectedTradeoffs: [...(acc.expectedTradeoffs || []), ...(d.expectedTradeoffs || [])],
            watchMetricsNextTurn: [...(acc.watchMetricsNextTurn || []), ...(d.watchMetricsNextTurn || [])],
          }),
          emptyDecision(sc.departments.map(d => d.id as Department)),
        );
    artifacts.push({
      turn, year, crisis: turnEventTitles.join(' / '),
      departmentReports: turnDeptReports.slice(),
      commanderDecision: mergedDecision,
      policyEffectsApplied: turnPolicyEffects.slice(),
      stateSnapshotAfter: {
        population: after.colony.population, morale: after.colony.morale,
        foodMonthsReserve: after.colony.foodMonthsReserve, infrastructureModules: after.colony.infrastructureModules,
        scienceOutput: after.colony.scienceOutput, births, deaths,
      },
    });
    console.log(`  State: Pop ${after.colony.population} | Morale ${Math.round(after.colony.morale * 100)}% | Food ${after.colony.foodMonthsReserve.toFixed(1)}mo`);
    // Death cause breakdown for this turn: maps attributed causes from
    // the kernel (natural causes, radiation cancer, starvation, despair,
    // fatal fracture, accident: X) to counts so the dashboard can
    // render "3 lost: 2 radiation cancer, 1 accident" instead of a
    // faceless total. Accident sub-types collapse to 'accident' for
    // the roll-up; the detailed descriptor stays in the individual
    // event for anyone reading the raw log.
    const deathsThisTurn = after.eventLog.filter(e => e.turn === turn && e.type === 'death');
    const deathCauses: Record<string, number> = {};
    for (const d of deathsThisTurn) {
      const raw = (d as unknown as { cause?: string }).cause ?? 'unknown';
      const key = raw.startsWith('accident:') ? 'accident' : raw;
      deathCauses[key] = (deathCauses[key] ?? 0) + 1;
    }
    emit('turn_done', {
      turn, year,
      colony: after.colony,
      toolsForged: Object.values(toolRegs).flat().length,
      totalEvents: turnEvents.length,
      deathCauses: Object.keys(deathCauses).length > 0 ? deathCauses : undefined,
    });

    // Emit full agent roster for colony visualization.
    //
    // Generation depth: 0 = earth-born ancestor, N = N levels of native-born descent.
    // Mars-born agents get gen >= 1. Computed by walking parent chain when possible,
    // otherwise inferred from age (younger native-borns = deeper generation).
    const agentById = new Map(after.agents.map(a => [a.core.id, a]));
    const generationCache = new Map<string, number>();
    const computeGeneration = (id: string, depth = 0): number => {
      if (depth > 10) return depth; // safety guard
      const cached = generationCache.get(id);
      if (cached !== undefined) return cached;
      const agent = agentById.get(id);
      if (!agent) return 0;
      if (!agent.core.marsborn) {
        generationCache.set(id, 0);
        return 0;
      }
      // Find parents by scanning who lists this agent as a child
      const parents = after.agents.filter(p => p.social.childrenIds.includes(id));
      if (parents.length === 0) {
        generationCache.set(id, 1);
        return 1;
      }
      const parentGen = Math.max(...parents.map(p => computeGeneration(p.core.id, depth + 1)));
      const gen = parentGen + 1;
      generationCache.set(id, gen);
      return gen;
    };

    const snapshotAgents = after.agents.map(a => ({
      agentId: a.core.id,
      name: a.core.name,
      department: a.core.department,
      role: a.core.role,
      rank: a.career.rank,
      alive: a.health.alive,
      marsborn: a.core.marsborn,
      psychScore: a.health.psychScore,
      age: Math.max(0, year - a.core.birthYear),
      generation: computeGeneration(a.core.id),
      partnerId: a.social.partnerId,
      childrenIds: a.social.childrenIds,
      featured: a.narrative.featured,
      mood: reactions.find(r => r.agentId === a.core.id)?.mood || 'neutral',
      shortTermMemory: (a.memory?.shortTerm || []).slice(-2).map(m => m.content),
    }));
    emit('colony_snapshot', {
      turn, year,
      agents: snapshotAgents,
      population: after.colony.population,
      morale: after.colony.morale,
      foodReserve: after.colony.foodMonthsReserve,
      births, deaths,
    });
    } catch (err) {
      // Classify first: if this is a terminal quota/auth error it flips
      // the run-abort flag and the next turn will be skipped entirely via
      // the isAborted() gate instead of falling into this degraded path.
      reportProviderError(err, `turn${turn}:fatal`);
      console.error(`  [turn ${turn}] FATAL: ${err}`);
      // Emit a degraded colony_snapshot so the dashboard doesn't get stuck
      const fallbackAgents = kernel.getState().agents.map(a => ({
        agentId: a.core.id, name: a.core.name, department: a.core.department, role: a.core.role,
        rank: a.career.rank, alive: a.health.alive, marsborn: a.core.marsborn,
        psychScore: a.health.psychScore,
        age: Math.max(0, year - a.core.birthYear),
        generation: a.core.marsborn ? 1 : 0,
        partnerId: a.social.partnerId,
        childrenIds: a.social.childrenIds, featured: a.narrative.featured,
        mood: 'neutral', shortTermMemory: [],
      }));
      emit('colony_snapshot', {
        turn, year, agents: fallbackAgents,
        population: kernel.getState().colony.population,
        morale: kernel.getState().colony.morale,
        foodReserve: kernel.getState().colony.foodMonthsReserve,
        births: 0, deaths: 0,
      });
      emit('turn_done', { turn, year, colony: kernel.getState().colony, toolsForged: Object.values(toolRegs).flat().length, error: String(err) });
    }
  }

  const final = kernel.export();

  // Build colonist trajectories for promoted leaders
  const trajectories = Object.fromEntries(
    final.agents
      .filter(c => c.promotion && c.hexacoHistory.length > 1)
      .map(c => [c.core.id, {
        name: c.core.name,
        promotedTurn: c.promotion!.turnPromoted,
        promotedAs: c.promotion!.role,
        promotedBy: c.promotion!.promotedBy,
        hexacoTrajectory: c.hexacoHistory,
      }])
  );

  // Compute timeline fingerprint. Always start from the generic engine-
  // level fingerprint (resilience / innovation / riskStyle / decision
  // discipline / tool counts) so EVERY scenario gets these classifications
  // for free. Scenario hooks layer their own domain-specific fields on
  // top (e.g., Mars: autonomy, marsbornFraction). Hook output keys win
  // on conflict so authors can override generic values intentionally.
  const { genericFingerprint } = await import('./generic-fingerprint.js');
  const generic = genericFingerprint(final, outcomeLog, leader, toolRegs, maxTurns);
  const scenarioOverlay = sc.hooks.fingerprintHook
    ? sc.hooks.fingerprintHook(final, outcomeLog, leader, toolRegs, maxTurns)
    : {};
  const fingerprint = { ...generic, ...scenarioOverlay };

  // Canonical Forged Toolbox: deduplicated by tool name with first-forge
  // metadata, full invocation history, and reuse/rejection rollups.
  // Matches the data the dashboard's ToolboxSection renders.
  const forgedToolbox = buildForgedToolbox(forgedLedger, allForges);

  // Flat unique citation list across all department reports. URL is the
  // dedup key; each entry carries the departments + turns that cited it.
  const citationCatalog = buildCitationCatalog(allDepartmentReports);

  const output = {
    simulation: `${sc.id}-v3`,
    leader: {
      name: leader.name,
      archetype: leader.archetype,
      colony: leader.colony,
      /** Drifted current profile — matches the Agent type convention where hexaco is the live value. */
      hexaco: commanderHexacoLive,
      /** Original config the caller passed in — immutable baseline for trajectory comparison. */
      hexacoBaseline: { ...leader.hexaco },
      /** Per-turn snapshots of commander HEXACO evolution. */
      hexacoHistory: commanderHexacoHistory,
    },
    /** Per-turn artifacts — now carry the full department reports +
     *  merged commander decision + applied policies (was previously
     *  just empty placeholders). */
    turnArtifacts: artifacts,
    finalState: final,
    toolRegistries: toolRegs,
    agentTrajectories: trajectories,
    outcomeClassifications: outcomeLog,
    fingerprint,
    /** All director-generated events with options + research keywords. */
    directorEvents: allDirectorEvents,
    /** All commander decisions tied to their event + outcome. */
    commanderDecisions: allCommanderDecisions,
    /** All forge_tool attempts with schemas, success/failure, judge confidence. */
    forgeAttempts: allForges,
    /** Canonical deduplicated forged toolbox (parity with dashboard ToolboxSection). */
    forgedToolbox,
    /** Canonical deduplicated citation catalog (parity with References). */
    citationCatalog,
    /** Per-turn agent reactions with mood + quote + memory snippets. */
    agentReactions: allAgentReactions,
    /** Cost telemetry for the run. */
    cost: costTracker.finalCost(),
    /**
     * When a terminal provider error (quota exhausted, invalid API key)
     * was hit during the run, this carries the classified reason. `null`
     * on a healthy run. Programmatic consumers should check this BEFORE
     * consuming `finalState` or `turnArtifacts` because those will be
     * partial/degraded from the turn the error was hit.
     */
    providerError: ((pe: ClassifiedProviderError | null) =>
      pe
        ? {
            kind: pe.kind,
            provider: pe.provider,
            message: pe.message,
            actionUrl: pe.actionUrl,
          }
        : null
    )(providerErrorState),
    /**
     * True when the run was cancelled by an external AbortSignal
     * (typically: the server's cancel-on-disconnect watchdog fired
     * because the user navigated away). Distinct from providerError:
     * provider failures are classified and actionable, external aborts
     * are clean stops. Both leave the sim incomplete; consumers should
     * treat either as "partial results only."
     */
    aborted: externallyAborted,
    totalCitations: citationCatalog.length,
    totalToolsForged: forgedToolbox.length,
  };

  writeRunOutput(output, {
    leaderName: leader.name,
    leaderArchetype: leader.archetype,
    turns: artifacts.length,
    toolRegs,
  });

  engine.cleanupSession(sid);
  await closeResearchMemory();
  await commander.close();
  for (const a of deptAgents.values()) await a.close();
  return output;
}
