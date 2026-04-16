import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ITool } from '@framers/agentos';
import {
  EmergentCapabilityEngine, EmergentJudge, EmergentToolRegistry,
  ComposableToolBuilder, SandboxedToolForge, ForgeToolMetaTool, generateText,
  extractJson,
} from '@framers/agentos';
import type { Department, TurnOutcome } from '../engine/core/state.js';
import { SeededRng } from '../engine/core/rng.js';
import { classifyOutcome, classifyOutcomeById } from '../engine/core/progression.js';
import type { DepartmentReport, CommanderDecision, TurnArtifact } from './contracts.js';
import { SimulationKernel, type PolicyEffect } from '../engine/core/kernel.js';
import type { KeyPersonnel } from '../engine/core/agent-generator.js';
import { getResearchPacket } from './research/research.js';
import { getResearchFromBundle } from './research/scenario-research.js';
import { initResearchMemory, recallResearch, closeResearchMemory } from './research/research-memory.js';
import { buildDepartmentContext, getDepartmentsForTurn } from './departments.js';
import { EventDirector, type DirectorEvent, type DirectorContext, type DirectorEventBatch } from './director.js';
import { generateAgentReactions } from './agent-reactions.js';
import { recordReactionMemory, consolidateMemory, updateRelationshipsFromReactions } from './agent-memory.js';
import type { ScenarioPackage } from '../engine/types.js';
import type { LlmProvider, SimulationModelConfig } from '../engine/types.js';
import {
  DEFAULT_EXECUTION,
  resolveSimulationModels,
  type SimulationExecutionConfig,
  type StartingPolitics,
  type StartingResources,
} from '../cli/sim-config.js';
import { applyCustomEventToCrisis, buildPromotionPrompt, buildYearSchedule } from './runtime-helpers.js';
import { classifyProviderError, shouldAbortRun, type ClassifiedProviderError } from './provider-errors.js';
import { EffectRegistry } from '../engine/effect-registry.js';
import { marsScenario } from '../engine/mars/index.js';
import type { LeaderConfig } from '../engine/types.js';
export type { LeaderConfig };

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Web search tool
// ---------------------------------------------------------------------------

const webSearchTool: ITool = {
  id: 'tool.web_search', name: 'web_search', displayName: 'Multi-Provider Web Search',
  description: 'Search for scientific papers, NASA data, and Mars research using AgentOS WebSearchService with multi-provider fusion (Serper, Tavily, Firecrawl, Brave) and Cohere neural reranking.',
  inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  hasSideEffects: false,
  async execute(args: Record<string, unknown>) {
    const query = String(args.query || '');

    // Try AgentOS WebSearchService first (multi-provider with RRF fusion)
    try {
      const { WebSearchService, FirecrawlProvider, TavilyProvider, SerperProvider, BraveProvider } = await import('@framers/agentos/web-search');
      const service = new WebSearchService();

      if (process.env.FIRECRAWL_API_KEY) service.registerProvider(new FirecrawlProvider(process.env.FIRECRAWL_API_KEY));
      if (process.env.TAVILY_API_KEY) service.registerProvider(new TavilyProvider(process.env.TAVILY_API_KEY));
      if (process.env.SERPER_API_KEY) service.registerProvider(new SerperProvider(process.env.SERPER_API_KEY));
      if (process.env.BRAVE_API_KEY) service.registerProvider(new BraveProvider(process.env.BRAVE_API_KEY));

      if (!service.hasProviders()) {
        return { success: false, error: 'No search API keys configured. Set SERPER_API_KEY, TAVILY_API_KEY, FIRECRAWL_API_KEY, or BRAVE_API_KEY.' };
      }

      const results = await service.search(query, { maxResults: 5, rerank: !!process.env.COHERE_API_KEY });
      return {
        success: true,
        output: {
          results: results.map(r => ({
            title: r.title, url: r.url, snippet: r.snippet,
            providers: (r as any).providerSources || [],
            relevance: (r as any).rerankScore || (r as any).rrfScore || r.relevanceScore,
          })),
          query,
          reranked: !!process.env.COHERE_API_KEY,
        },
      };
    } catch {
      // Fallback to direct Serper if AgentOS web-search module not available
      try {
        const key = process.env.SERPER_API_KEY;
        if (!key) return { success: false, error: 'No search API keys configured' };
        const res = await fetch('https://google.serper.dev/search', {
          method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: query, num: 5 }),
        });
        if (!res.ok) return { success: false, error: `Search ${res.status}` };
        const data = await res.json() as any;
        return { success: true, output: { results: (data.organic || []).slice(0, 5).map((r: any) => ({ title: r.title, url: r.link, snippet: r.snippet })), query } };
      } catch (err) { return { success: false, error: String(err) }; }
    }
  },
};

// ---------------------------------------------------------------------------
// Emergent engine
// ---------------------------------------------------------------------------

/**
 * Create the emergent capability engine wired to AgentOS's forge + judge.
 *
 * @param toolMap Registry of built-in tools (web_search, etc.) that forged
 *        tools can compose against via the ComposableToolBuilder.
 * @param provider LLM provider for judge calls (openai | anthropic).
 * @param judgeModel Model ID used for judge reviews. Kept cheap by default
 *        in sim-config.ts — the judge runs once per forge (dozens per run)
 *        so flagship-model pricing here dominates total cost.
 * @param execution Runtime limits (sandbox timeout / memory).
 * @param onUsage Optional callback invoked after every judge LLM call so the
 *        orchestrator can fold judge spend into the run-wide cost telemetry.
 *        Without this, judge costs (often 30-50% of total run spend) were
 *        silently invisible to `runSimulation()`'s returned `cost` object
 *        even though the API bill against the provider was still real.
 */
function createEmergentEngine(
  toolMap: Map<string, ITool>,
  provider: LlmProvider,
  judgeModel: string,
  execution: Partial<SimulationExecutionConfig> = {},
  onUsage?: (result: { usage?: { totalTokens?: number; promptTokens?: number; completionTokens?: number; costUSD?: number } }) => void,
  /**
   * Called when the judge's LLM call throws. Forwards to the run-level
   * provider-error classifier so quota/auth failures on judge calls get
   * reported the same way as failures on any other call site.
   */
  onProviderError?: (err: unknown) => void,
) {
  const llmCb = async (model: string, prompt: string) => {
    try {
      const r = await generateText({ provider, model: model || judgeModel, prompt });
      // Forward usage to the run-wide tracker. Judge calls were previously
      // silently unaccounted, producing cost totals that looked like $0.25
      // while the real bill was $5-8 per run on Anthropic defaults.
      onUsage?.(r);
      return r.text;
    } catch (err) {
      // The AgentOS EmergentJudge has its own try/catch around this
      // callback and will record a rejected verdict on throw, which is
      // correct behavior. Re-throw so its existing error path runs; the
      // orchestrator's forge-wrapper catches propagation through
      // reportProviderError on the dept-level try/catch below.
      onProviderError?.(err);
      throw err;
    }
  };
  // Session-tier tool limit. Previously the engine config set this to 20
  // but the registry was constructed below WITHOUT receiving that config,
  // so it fell through to AgentOS's DEFAULT_EMERGENT_CONFIG value of 10.
  // That limit was reached by turn 3 in a 5-department run (5 depts ×
  // ~2 tools each = 10) and every subsequent forge failed with "Session
  // tool limit reached". Bumped to 50 and propagated to the registry so
  // the limit and the config are actually the SAME number.
  //
  // 50 comfortably fits 5 depts × 6 turns × ~1.5 unique tools each ≈ 45,
  // with headroom for re-forges and composition wrappers. Agent-tier
  // stays at 50 (those are promotion targets across runs).
  const SESSION_TOOL_LIMIT = 50;
  const AGENT_TOOL_LIMIT = 50;

  const registry = new EmergentToolRegistry({
    maxSessionTools: SESSION_TOOL_LIMIT,
    maxAgentTools: AGENT_TOOL_LIMIT,
  });
  const judge = new EmergentJudge({ judgeModel, promotionModel: judgeModel, generateText: llmCb });
  const executor = async (name: string, args: unknown, ctx: any) => {
    const t = toolMap.get(name);
    return t ? t.execute(args as any, ctx) : { success: false, error: `Tool "${name}" not found` };
  };
  const engine = new EmergentCapabilityEngine({
    config: {
      enabled: true,
      maxSessionTools: SESSION_TOOL_LIMIT,
      maxAgentTools: AGENT_TOOL_LIMIT,
      sandboxTimeoutMs: execution.sandboxTimeoutMs ?? DEFAULT_EXECUTION.sandboxTimeoutMs,
      sandboxMemoryMB: execution.sandboxMemoryMB ?? DEFAULT_EXECUTION.sandboxMemoryMB,
      promotionThreshold: { uses: 5, confidence: 0.8 },
      allowSandboxTools: true, persistSandboxSource: true,
      judgeModel, promotionJudgeModel: judgeModel,
    },
    composableBuilder: new ComposableToolBuilder(executor as any),
    sandboxForge: new SandboxedToolForge(),
    judge, registry,
  });
  return { engine, forgeTool: new ForgeToolMetaTool(engine) };
}

/** Captured forge event — the ground-truth record of an actual forge call,
 *  independent of whether the LLM remembered to self-report it in its JSON. */
export interface CapturedForge {
  name: string;
  description: string;
  mode: string;
  inputSchema: unknown;
  outputSchema: unknown;
  approved: boolean;
  confidence: number;
  output: unknown;
  errorReason?: string;
  department: string;
  /** Wall-clock ms timestamp so we can attribute forges to the surrounding event. */
  timestamp: number;
}

function wrapForgeTool(
  raw: ForgeToolMetaTool,
  agentId: string,
  sessionId: string,
  dept: string,
  /** Sink that receives every successful (and failed) forge attempt for
   *  this dept. The orchestrator merges these into the SSE payload so the
   *  count reflects reality even when the LLM forgets to mention the tool
   *  in its own JSON response. */
  capture: (record: CapturedForge) => void,
): ITool {
  return {
    ...(raw as any),
    async execute(args: Record<string, unknown>, ctx: any) {
      const fixed = { ...args };
      // Parse stringified nested JSON from tool call serialization
      for (const k of ['implementation', 'inputSchema', 'outputSchema', 'testCases']) {
        if (typeof (fixed as any)[k] === 'string') try { (fixed as any)[k] = JSON.parse((fixed as any)[k]); } catch (e) { console.warn(`  [forge] Failed to parse ${k}:`, e); }
      }
      // Normalize implementation. LLMs send a wide variety of mode
      // spellings and sometimes mis-label compose specs as sandbox or
      // vice versa. AgentOS's engine does a STRICT `mode === 'compose'`
      // check — anything else falls into the sandbox branch, which then
      // reads `allowlist` / `code` fields that a compose spec does not
      // carry. That path crashes with
      //   TypeError: Cannot read properties of undefined (reading 'includes')
      // inside SandboxedToolForge.validateCode when it tries
      // `allowlist.includes('fetch')` on an undefined allowlist.
      //
      // Normalize to one of exactly 'sandbox' or 'compose', infer from
      // field shape when the mode string is unfamiliar, and backstop
      // every required field so neither engine path can crash on
      // malformed LLM output.
      if (fixed.implementation && typeof fixed.implementation === 'object') {
        const impl = fixed.implementation as any;

        // Alias the common variants to their canonical values.
        if (impl.mode === 'code' || impl.mode === 'javascript' || impl.mode === 'js') {
          impl.mode = 'sandbox';
        }
        if (
          impl.mode === 'composed' ||
          impl.mode === 'composition' ||
          impl.mode === 'composable' ||
          impl.mode === 'chain' ||
          impl.mode === 'pipeline'
        ) {
          impl.mode = 'compose';
        }

        // Mode still unrecognized: infer from fields. A spec with a
        // `steps` array is a compose spec; one with `code` is sandbox.
        // When neither field is present, default to sandbox since that
        // is the more common LLM pattern and the safer default (sandbox
        // code runs in a V8 isolate under an allowlist).
        if (impl.mode !== 'sandbox' && impl.mode !== 'compose') {
          if (Array.isArray(impl.steps)) impl.mode = 'compose';
          else if (typeof impl.code === 'string') impl.mode = 'sandbox';
          else impl.mode = 'sandbox';
        }

        // Backstop every required field for the chosen mode so the
        // engine never hits an undefined-access crash. Missing fields
        // still produce rejected forges (no valid code or no steps),
        // but via the judge's normal rejection path with a readable
        // error, not a TypeError deep in sandbox validation.
        if (impl.mode === 'sandbox') {
          if (!Array.isArray(impl.allowlist)) impl.allowlist = [];
          if (impl.code != null && typeof impl.code !== 'string') impl.code = String(impl.code);
          if (!impl.code || typeof impl.code !== 'string') {
            // No code body — synthesize a placeholder the judge will
            // correctly reject rather than letting the sandbox crash.
            impl.code = 'function execute(input) { return { error: "No code provided in forge request" }; }';
          }
          if (!impl.code.includes('function execute')) {
            impl.code = `function execute(input) {\n${impl.code}\n}`;
          }
        } else if (impl.mode === 'compose') {
          if (!Array.isArray(impl.steps)) impl.steps = [];
          // Each step needs a tool name, input mapping, and output name.
          // Defaulting lets the judge reject structurally-invalid specs
          // via its normal path instead of throwing deep in the pipeline.
          for (const step of impl.steps) {
            if (step && typeof step === 'object') {
              if (typeof step.tool !== 'string') step.tool = '';
              if (typeof step.name !== 'string') step.name = step.tool || 'step';
              if (!step.inputMapping || typeof step.inputMapping !== 'object') {
                step.inputMapping = {};
              }
            }
          }
        }
      }
      // Ensure schemas are valid objects — use permissive schemas so the judge
      // doesn't reject on schema conformance mismatch
      if (!fixed.inputSchema || typeof fixed.inputSchema !== 'object') {
        fixed.inputSchema = { type: 'object', additionalProperties: true };
      }
      if (!fixed.outputSchema || typeof fixed.outputSchema !== 'object') {
        fixed.outputSchema = { type: 'object', additionalProperties: true };
      }
      // Ensure testCases is a non-empty array with valid structure
      if (!Array.isArray(fixed.testCases) || fixed.testCases.length === 0) {
        fixed.testCases = [{ input: {}, expectedOutput: {} }];
      }
      for (const tc of fixed.testCases as any[]) {
        if (!tc.input || typeof tc.input !== 'object') tc.input = {};
        if (tc.expectedOutput === undefined) tc.expectedOutput = {};
      }
      const mode = (fixed.implementation as any)?.mode || '?';
      const toolName = String(fixed.name || 'unnamed');
      const toolDescription = String((fixed as any).description || toolName);
      console.log(`    🔧 [${dept}] Forging "${toolName}" (${mode})...`);
      const patched = { ...ctx, gmiId: agentId, sessionData: { ...(ctx?.sessionData ?? {}), sessionId } };
      try {
        const r = await raw.execute(fixed as any, patched);
        const out = r.output as any;
        const verdict = out?.verdict || {};
        // Judge confidence is the LLM-as-judge's score for whether the
        // tool is safe + correct. When the judge fails the forge, its
        // confidence is in REJECTING the tool; surfacing it as the tool's
        // own quality score is misleading. So:
        //   approved → use judge confidence if provided, else 0.85
        //   rejected → confidence is 0 (the tool didn't get accepted at all)
        // This matches what the UI's PASS/FAIL pill is trying to communicate.
        const judgeConfidence = typeof verdict.confidence === 'number' ? verdict.confidence : null;
        const confidence = r.success
          ? (judgeConfidence ?? 0.85)
          : 0;
        const errorReason = !r.success
          ? String(r.error || verdict.reasoning || out?.error || '').slice(0, 240)
          : undefined;
        if (r.success) {
          console.log(`    🔧 [${dept}] ✓ "${toolName}" approved (conf ${confidence.toFixed(2)})`);
        } else {
          console.log(`    🔧 [${dept}] ✗ "${toolName}" — ${errorReason}`);
        }
        // Always capture — both successes and failures count as evidence of
        // emergent forging behavior. The UI distinguishes them via PASS/FAIL.
        capture({
          name: toolName,
          description: toolDescription,
          mode: String(mode),
          inputSchema: fixed.inputSchema,
          outputSchema: fixed.outputSchema,
          approved: !!r.success,
          confidence,
          output: out?.testResults ?? out?.result ?? out ?? null,
          errorReason,
          department: dept,
          timestamp: Date.now(),
        });
        return r;
      } catch (err) {
        console.log(`    🔧 [${dept}] ERR: ${err}`);
        capture({
          name: toolName,
          description: toolDescription,
          mode: String(mode),
          inputSchema: fixed.inputSchema,
          outputSchema: fixed.outputSchema,
          approved: false,
          confidence: 0,
          output: null,
          errorReason: String(err).slice(0, 240),
          department: dept,
          timestamp: Date.now(),
        });
        return { success: false, error: String(err) };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function humanizeToolName(name: string): string {
  return name.replace(/_v\d+$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}


function cleanSummary(raw: string): string {
  let s = raw
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^(Decision|Recommendation|Summary|Analysis|Conclusion|I recommend|My analysis|Based on|After careful|Given the|Looking at|The data|In conclusion|Therefore|Overall|To summarize|As a result|In summary|Considering|Upon review|Having analyzed)\s*:?\s*/gim, '')
    .replace(/^(choose|select|go with|opt for|approve|we should|I suggest|I propose)\s+/i, '')
    .replace(/^Option [A-C][.:,]\s*/i, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (s.startsWith('{') || s.startsWith('[')) return '';

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
  const jsonStr = extractJson(text);
  if (jsonStr) {
    try {
      const raw = JSON.parse(jsonStr);
      if (raw.department || raw.summary || raw.risks || raw.recommendedActions) {
        const report = { ...emptyReport(dept), ...raw, department: dept };
        report.summary = buildReadableSummary(raw, dept);
        if (typeof report.confidence !== 'number' || report.confidence < 0.1) report.confidence = 0.8;
        return report;
      }
    } catch { /* try next block */ }
  }

  const cites: DepartmentReport['citations'] = [];
  let m; const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((m = re.exec(text))) if (m[2].startsWith('http')) cites.push({ text: m[1], url: m[2], context: m[1] });
  return { ...emptyReport(dept), summary: cleanSummary(text), citations: cites };
}

function parseCmdDecision(text: string, depts: Department[]): CommanderDecision {
  const jsonStr = extractJson(text);
  if (jsonStr) {
    try {
      const raw = JSON.parse(jsonStr);
      if (raw.decision || raw.selectedOptionId) {
        return { ...emptyDecision(depts), ...raw };
      }
    } catch { /* fall through */ }
  }
  return { ...emptyDecision(depts), decision: text.slice(0, 500), rationale: text };
}

function emptyReport(d: Department): DepartmentReport {
  return { department: d, summary: '', citations: [], risks: [], opportunities: [], recommendedActions: [], proposedPatches: {}, forgedToolsUsed: [], featuredAgentUpdates: [], confidence: 0.7, openQuestions: [], recommendedEffects: [] };
}
function emptyDecision(d: Department[]): CommanderDecision {
  return { decision: '', rationale: '', departmentsConsulted: d, selectedPolicies: [], rejectedPolicies: [], expectedTradeoffs: [], watchMetricsNextTurn: [] };
}

function decisionToPolicy(decision: CommanderDecision, reports: DepartmentReport[], turn: number, year: number): PolicyEffect {
  const patches: PolicyEffect['patches'] = {};

  // Apply legacy proposedPatches (backward compat)
  for (const r of reports) {
    if (r.proposedPatches.colony) patches.colony = { ...patches.colony, ...r.proposedPatches.colony };
    if (r.proposedPatches.politics) patches.politics = { ...patches.politics, ...r.proposedPatches.politics };
    if (r.proposedPatches.agentUpdates) patches.agentUpdates = [...(patches.agentUpdates || []), ...r.proposedPatches.agentUpdates];
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export type SimEvent = {
  type:
    | 'turn_start' | 'event_start' | 'dept_start' | 'dept_done' | 'forge_attempt'
    | 'commander_deciding' | 'commander_decided' | 'outcome' | 'drift'
    | 'agent_reactions' | 'bulletin' | 'turn_done' | 'promotion'
    | 'colony_snapshot' | 'provider_error' | 'sim_aborted';
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
  let totalTokens = 0;
  let totalCostUSD = 0;
  let llmCalls = 0;

  /**
   * Per-call-site cost breakdown. Every `trackUsage` caller tags its
   * call with one of these labels so the dashboard can show WHERE the
   * money actually went (usually departments + reactions dominate).
   * Labels line up with the pipeline stages in the turn loop so a
   * developer reading the breakdown sees a clean mental model.
   */
  type CostSite = 'director' | 'commander' | 'departments' | 'judge' | 'reactions' | 'other';
  const costBySite: Record<CostSite, { totalTokens: number; totalCostUSD: number; calls: number }> = {
    director: { totalTokens: 0, totalCostUSD: 0, calls: 0 },
    commander: { totalTokens: 0, totalCostUSD: 0, calls: 0 },
    departments: { totalTokens: 0, totalCostUSD: 0, calls: 0 },
    judge: { totalTokens: 0, totalCostUSD: 0, calls: 0 },
    reactions: { totalTokens: 0, totalCostUSD: 0, calls: 0 },
    other: { totalTokens: 0, totalCostUSD: 0, calls: 0 },
  };

  // Per-million-token pricing estimates for cost tracking
  const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    'gpt-5.4': { input: 2.50, output: 10.00 },
    'gpt-5.4-mini': { input: 0.30, output: 1.20 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
    'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  };
  const defaultPricing = MODEL_PRICING[modelConfig.commander] || { input: 2.50, output: 10.00 };

  /**
   * Record token/cost usage from a single LLM call.
   *
   * @param result The result object from generateText / session.send(),
   *        which carries an optional `usage` field populated by AgentOS.
   * @param site Which pipeline stage made the call. Used to build the
   *        per-site cost breakdown the dashboard StatsBar can drill into.
   *        Defaults to 'other' when a call-site isn't tagged (harmless
   *        fallback, but tag every new call site so the breakdown stays
   *        meaningful).
   */
  function trackUsage(
    result: { usage?: { totalTokens?: number; promptTokens?: number; completionTokens?: number; costUSD?: number } },
    site: CostSite = 'other',
  ) {
    if (!result?.usage) return;
    const tokensThisCall = result.usage.totalTokens ?? 0;
    let costThisCall: number;
    if (typeof result.usage.costUSD === 'number') {
      costThisCall = result.usage.costUSD;
    } else {
      const input = result.usage.promptTokens ?? 0;
      const output = result.usage.completionTokens ?? 0;
      costThisCall = (input * defaultPricing.input / 1_000_000) + (output * defaultPricing.output / 1_000_000);
    }
    totalTokens += tokensThisCall;
    totalCostUSD += costThisCall;
    llmCalls++;
    const bucket = costBySite[site];
    bucket.totalTokens += tokensThisCall;
    bucket.totalCostUSD += costThisCall;
    bucket.calls++;
  }

  const emit = (type: SimEvent['type'], data?: Record<string, unknown>) => {
    // Round breakdown numbers so the SSE payload stays compact and the
    // UI doesn't display 11 decimal places of float noise.
    const breakdown: Record<string, { totalTokens: number; totalCostUSD: number; calls: number }> = {};
    for (const [k, v] of Object.entries(costBySite)) {
      if (v.calls > 0) {
        breakdown[k] = {
          totalTokens: v.totalTokens,
          totalCostUSD: Math.round(v.totalCostUSD * 10000) / 10000,
          calls: v.calls,
        };
      }
    }
    opts.onEvent?.({
      type,
      leader: leader.name,
      data: {
        ...data,
        _cost: {
          totalTokens,
          totalCostUSD: Math.round(totalCostUSD * 10000) / 10000,
          llmCalls,
          breakdown,
        },
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

  /** True when the run should stop launching new LLM work. */
  const isAborted = () => providerErrorState !== null;

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
  );
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
  interface ToolUseRecord {
    turn: number;
    year: number;
    eventIndex: number;
    eventTitle: string;
    department: string;
    /** What the tool produced this invocation (string-truncated to 400). */
    output: string | null;
    /** True when the LLM re-invoked forge_tool (vs cited an existing tool). */
    isReforge: boolean;
    /** Set when isReforge=true and the judge rejected the new attempt. */
    rejected: boolean;
    /** Judge confidence on this invocation (only meaningful for forge calls). */
    confidence?: number;
  }
  const forgedLedger = new Map<string, {
    firstForgedTurn: number;
    firstForgedDepartment: string;
    firstForgedEventIndex: number;
    firstForgedEventTitle: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
    /** Append-only history of every invocation across the run. */
    history: ToolUseRecord[];
  }>();

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
  // Bootstrap commander session. The HEXACO traits passed to agent() above
  // already shape the LLM's voice; this kickoff message reinforces that
  // decisions should be visibly personality-driven so two extreme leaders
  // produce visibly different timelines, not centrist convergent choices.
  const personalityCue = (() => {
    const h = leader.hexaco;
    const cues: string[] = [];
    if (h.openness > 0.7) cues.push('You favor novel, untested approaches over proven ones');
    if (h.openness < 0.3) cues.push('You favor proven protocols over experiments');
    if (h.conscientiousness > 0.7) cues.push('You demand evidence and contingency plans before committing');
    if (h.conscientiousness < 0.3) cues.push('You move fast and accept ambiguity');
    if (h.emotionality > 0.7) cues.push('You weigh human cost heavily — even small mortality risks deter you');
    if (h.emotionality < 0.3) cues.push('You will accept casualties for strategic gain');
    if (h.agreeableness < 0.4) cues.push('You override department consensus when you see a better path');
    if (h.honestyHumility < 0.4) cues.push('You leverage information asymmetries when useful');
    return cues.length ? `Your decision style: ${cues.join('. ')}.` : '';
  })();
  // Bootstrap the commander. This is the FIRST LLM call in the run, so if
  // the user's API key is invalid or credits are exhausted, this is where
  // we find out. Report it through the classifier so the dashboard banner
  // fires before we burn compute launching a sim that has no hope of
  // producing valid output.
  try {
    trackUsage(await cmdSess.send(
      `You are the colony commander. You receive department reports and make strategic decisions. ` +
      `${personalityCue} ` +
      `Your personality MUST visibly shape your choices — do not converge on a centrist option just because ` +
      `it sounds reasonable. If your traits push you toward the risky option, take it; if they push you toward ` +
      `the safe option, take it. The simulation's value is in how different leaders produce different outcomes ` +
      `from the same starting state. ` +
      `When the crisis includes options with IDs, you MUST include selectedOptionId in your JSON response. ` +
      `Return JSON with selectedOptionId, decision, rationale, selectedPolicies, rejectedPolicies, ` +
      `expectedTradeoffs, watchMetricsNextTurn. Acknowledge.`
    ), 'commander');
  } catch (err) {
    reportProviderError(err, 'commander-bootstrap');
    // If this is a terminal provider error, `isAborted()` is now true and
    // the turn loop below will skip all LLM work. Continue into the turn
    // loop anyway so the normal end-of-run cleanup path runs and the user
    // gets a proper `complete` SSE event (with the `provider_error` event
    // already sent above).
  }

  // Turn 0: Commander promotes department heads from agent roster
  console.log('  [Turn 0] Commander evaluating roster for promotions...');
  const promotionDepts: Department[] = sc.departments.map(d => d.id as Department);
  const roleNames: Record<string, string> = Object.fromEntries(sc.departments.map(d => [d.id, d.role]));
  const candidateSummaries = promotionDepts.map(dept => {
    const candidates = kernel.getCandidates(dept, 5);
    return `## ${dept.toUpperCase()} — Top 5 Candidates:\n${candidates.map(c => {
      const age = startYear - c.core.birthYear;
      const h = c.hexaco;
      return `- ${c.core.name} (${c.core.id}), age ${age}, spec: ${c.career.specialization}, O:${h.openness.toFixed(2)} C:${h.conscientiousness.toFixed(2)} E:${h.extraversion.toFixed(2)} A:${h.agreeableness.toFixed(2)} Em:${h.emotionality.toFixed(2)} HH:${h.honestyHumility.toFixed(2)}`;
    }).join('\n')}`;
  }).join('\n\n');

  const promoResult = await cmdSess.send(
    buildPromotionPrompt(candidateSummaries)
  );
  // Promotion is a commander-session call, so it lands in the commander bucket.
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
  // Fallback: promote top candidate per dept if commander didn't produce valid JSON
  for (const dept of promotionDepts) {
    const hasLeader = kernel.getState().agents.some(c => c.promotion?.department === dept);
    if (!hasLeader) {
      const top = kernel.getCandidates(dept, 1)[0];
      if (top) {
        kernel.promoteAgent(top.core.id, dept, roleNames[dept] || `Head of ${dept}`, leader.name);
        console.log(`  ✦ [fallback] ${top.core.name} → ${roleNames[dept]}`);
      }
    }
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
    const tools: ITool[] = opts.liveSearch ? [webSearchTool, wrapped] : [wrapped];
    // Universal forge_tool prompt injected for EVERY scenario (Mars,
    // Lunar, custom compiled, etc.). Previously only the hardcoded
    // DEPARTMENT_CONFIGS in departments.ts told the LLM about forging,
    // and that file was dead code — the orchestrator always reads
    // cfg.instructions from the scenario JSON, which doesn't mention
    // forge_tool. Result: no tools were ever forged unless the scenario
    // author thought to add the instruction themselves.
    const forgeGuidance = `

EMERGENT TOOLING — REQUIRED:
You have access to a forge_tool capability. Use it to invent a small computational model that helps you analyze the current event. Examples:
- a dose calculator, a load analyzer, a yield projector, a cohesion scorer, a risk index, a budget balancer
The implementation runs in a sandboxed V8 isolate (10s timeout, 128MB memory, no network unless allowlisted). An LLM judge reviews your tool for safety AND CORRECTNESS before it executes.

forge_tool args:
  name: snake_case identifier (e.g. radiation_dose_calculator)
  description: one-sentence purpose
  inputSchema:  { "type": "object", "properties": { ... }, "required": [...] }
  outputSchema: { "type": "object", "properties": { ... } }
  implementation: { "mode": "sandbox", "code": "function execute(input) { return result; }", "allowlist": [] }
  testCases: [ { "input": {...}, "expectedOutput": {...} } ]

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

Forge AT LEAST ONE tool per analysis when the event involves any quantitative reasoning. Run it to produce a number you reference in your summary. Re-use a previously-forged tool by name (no new forge needed) when the same calculation applies again.

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
    const maxEvents = sc.setup.maxEventsPerTurn ?? 3;
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
        // Ground director's researchKeywords / category in real bundle entries so
        // recallResearch/getResearchFromBundle can surface citations downstream.
        knowledgeTopics: Object.keys(sc.knowledge?.topics ?? {}),
        knowledgeCategories: Object.keys(sc.knowledge?.categoryMapping ?? {}),
      };
      emit('turn_start', { turn, year, title: 'Director generating...', crisis: '', births: 0, deaths: 0, colony: preState.colony });
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

      const deptPromises = depts.map(async (dept) => {
        const sess = deptSess.get(dept);
        if (!sess) return emptyReport(dept);
        const ctx = buildDepartmentContext(dept, kernel.getState(), scenario, packet, deptMemory.get(dept), sc.hooks.departmentPromptHook);
        emit('dept_start', { turn, year, department: dept, eventIndex: ei });
        // Snapshot the dept's forge bucket index BEFORE the LLM call so we
        // can attribute new forges to this specific dept_done. The LLM
        // self-reports `forgedToolsUsed` in JSON but frequently omits tools
        // it actually forged — captured forges below are authoritative.
        const forgeBucketStart = deptForgeBuckets.get(dept)?.length ?? 0;
        try {
          const r = await sess.send(ctx);
          // Tag as 'departments' so the StatsBar breakdown shows this
          // (biggest cost line item) separately from director/commander.
          trackUsage(r, 'departments');
          const report = parseDeptReport(r.text, dept);
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
      const summaries = reports.map(r => `## ${r.department.toUpperCase()} (conf: ${r.confidence})\n${r.summary}\nRisks: ${r.risks.map(x => `[${x.severity}] ${x.description}`).join('; ') || 'none'}\nRecs: ${r.recommendedActions.join('; ') || 'none'}`).join('\n\n');
      const optionText = event.options.length ? '\n\nOPTIONS:\n' + event.options.map(o => `- ${o.id}: ${o.label} — ${o.description}${o.isRisky ? ' [RISKY]' : ''}`).join('\n') + '\n\nYou MUST include "selectedOptionId" in your JSON response.' : '';
      const effectsList = reports.flatMap(r => (r.recommendedEffects || []).map(e => `  - ${e.id} (${e.type}): ${e.description}${e.colonyDelta ? ' | Delta: ' + JSON.stringify(e.colonyDelta) : ''}`));
      const effectsText = effectsList.length ? '\n\nAVAILABLE POLICY EFFECTS:\n' + effectsList.join('\n') : '';
      const eventLabel = turnEvents.length > 1 ? ` (Event ${ei + 1}/${turnEvents.length})` : '';
      const cmdPrompt = `TURN ${turn}${eventLabel} — ${year}: ${event.title}\n\n${event.description}\n\nDEPARTMENT REPORTS:\n${summaries}\n\nColony: Pop ${kernel.getState().colony.population} | Morale ${Math.round(kernel.getState().colony.morale * 100)}% | Food ${kernel.getState().colony.foodMonthsReserve.toFixed(1)}mo${optionText}${effectsText}\n\nDecide. Return JSON.`;

      emit('commander_deciding', { turn, year, eventIndex: ei });
      const cmdR = await cmdSess.send(cmdPrompt);
      // Commander decision per event — lands in the commander bucket.
      trackUsage(cmdR, 'commander');
      const decision = parseCmdDecision(cmdR.text, depts);
      console.log(`  [commander] ${decision.decision.slice(0, 120)}...`);
      emit('commander_decided', { turn, year, decision: decision.decision, rationale: decision.rationale, selectedPolicies: decision.selectedPolicies, eventIndex: ei });

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
        (leader.hexaco.openness - 0.5) * 0.20 +
        (leader.hexaco.conscientiousness - 0.5) * 0.12 +
        // Alignment kicker: choosing in line with personality boosts effect
        (isRiskyChoice ? (leader.hexaco.openness - 0.5) : (leader.hexaco.conscientiousness - 0.5)) * 0.10;

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
    kernel.applyDrift(leader.hexaco, lastOutcome, Math.max(1, year - prevYear));

    const drifted = kernel.getState().agents.filter(c => c.promotion && c.health.alive);
    const driftData: Record<string, { name: string; hexaco: any }> = {};
    for (const p of drifted.slice(0, 5)) { const h = p.hexaco; driftData[p.core.id] = { name: p.core.name, hexaco: { O: +h.openness.toFixed(2), C: +h.conscientiousness.toFixed(2), E: +h.extraversion.toFixed(2), A: +h.agreeableness.toFixed(2) } }; }
    emit('drift', { turn, year, agents: driftData });

    // Agent reactions (once per turn, reacting to ALL events)
    const reactionCtx = {
      crisisTitle: turnEventTitles.join(' / '),
      crisisCategory: turnEvents.map(e => e.category).join(', '),
      outcome: lastOutcome,
      decision: turnEventTitles.join('. '),
      year, turn, colonyMorale: kernel.getState().colony.morale,
      colonyPopulation: kernel.getState().colony.population,
    };

    // Progressive reactions: turn 1 always runs the full colony so
    // baseline personalities and memories get established. Turns 2+ pick
    // only agents who materially experienced this turn's events
    // (featured + promoted heads + anyone in a relevantDepartments for
    // the turn), capped at ~30. This cuts ~70% of reaction calls after
    // turn 1 with minor memory-sparsity tradeoff (non-reactors still
    // accumulate crisis/decision/outcome entries via the orchestrator's
    // per-event logging; only their shortTerm personal reaction memory
    // thins out).
    const progressiveReactions = opts.execution?.progressiveReactions ?? DEFAULT_EXECUTION.progressiveReactions;
    const reactionBatchSize = opts.execution?.reactionBatchSize ?? DEFAULT_EXECUTION.reactionBatchSize;
    const allAlive = kernel.getState().agents.filter(a => a.health.alive);
    const eligibleAgents = (() => {
      if (!progressiveReactions || turn === 1) return allAlive;
      const relevantDepts = new Set<string>();
      for (const ev of turnEvents) {
        for (const d of ev.relevantDepartments || []) relevantDepts.add(String(d));
      }
      const picked = new Map<string, typeof allAlive[number]>();
      const add = (a: typeof allAlive[number]) => { if (!picked.has(a.core.id)) picked.set(a.core.id, a); };
      // Featured agents (5-8 typically): always react. These are the
      // colonists users see in the bulletin and care about narratively.
      for (const a of allAlive) if (a.narrative.featured) add(a);
      // Promoted department heads (5): always react. They shape next
      // turn's analysis so their psych state matters.
      for (const a of allAlive) if (a.promotion) add(a);
      // Department-affected agents: up to 6 per relevant dept, prioritized
      // by absolute deviation from neutral psych (more dramatic reactors
      // first). Keeps the bulletin textured with voices actually in the
      // firing line of the event.
      for (const dept of relevantDepts) {
        const candidates = allAlive
          .filter(a => a.core.department === dept && !picked.has(a.core.id))
          .sort((a, b) => Math.abs(b.health.psychScore - 0.5) - Math.abs(a.health.psychScore - 0.5))
          .slice(0, 6);
        for (const a of candidates) add(a);
      }
      // Hard cap so a scenario with many relevant departments can't
      // blow past budget by accident.
      return Array.from(picked.values()).slice(0, 30);
    })();
    if (progressiveReactions && turn > 1) {
      console.log(`  [agents] Progressive: ${eligibleAgents.length}/${allAlive.length} react this turn`);
    }

    try {
      reactions = await generateAgentReactions(
        eligibleAgents, reactionCtx,
        {
          provider,
          model: modelConfig.agentReactions || 'gpt-4o-mini',
          maxConcurrent: 25,
          reactionContextHook: sc.hooks.reactionContextHook,
          batchSize: reactionBatchSize,
          // Fold reaction usage into run-wide cost tracking. With ~100 agents
          // per turn, these calls were a large untracked line item on the
          // real API bill. Tagged 'reactions' so the StatsBar breakdown
          // separates reaction spend from dept/commander/director.
          onUsage: (result) => trackUsage(result, 'reactions'),
          // Classify the first reaction-batch error so an 80-agent wall of
          // 429s produces one `provider_error` banner, not 80 toasts.
          onProviderError: (err) => reportProviderError(err, 'reactions'),
        },
      );
      if (reactions.length) {
        const agentMap = new Map(kernel.getState().agents.map(c => [c.core.id, c]));
        emit('agent_reactions', {
          turn, year,
          reactions: reactions.slice(0, 8).map(r => {
            const agent = agentMap.get(r.agentId);
            const mem = agent?.memory;
            return {
              name: r.name, age: r.age, department: r.department, role: r.role,
              specialization: r.specialization, marsborn: r.marsborn,
              quote: r.quote, mood: r.mood, intensity: r.intensity,
              hexaco: r.hexaco, psychScore: r.psychScore, boneDensity: r.boneDensity, radiation: r.radiation,
              agentId: r.agentId,
              memory: mem ? {
                recentMemories: mem.shortTerm.slice(-3).map(m => ({ year: m.year, content: m.content, valence: m.valence })),
                beliefs: mem.longTerm.slice(-3),
                stances: Object.entries(mem.stances).filter(([, v]) => Math.abs(v) > 0.2).map(([k, v]) => ({ topic: k, value: v })),
                relationships: Object.entries(mem.relationships).filter(([, v]) => Math.abs(v) > 0.2).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3).map(([id, v]) => ({ name: agentMap.get(id)?.core.name || id, sentiment: v })),
              } : null,
            };
          }),
          totalReactions: reactions.length,
        });
        for (const r of reactions) { const c = agentMap.get(r.agentId); if (c) recordReactionMemory(c, r, turnEventTitles.join(' / '), lastEventCategory, lastOutcome, turn, year); }
        updateRelationshipsFromReactions(kernel.getState().agents, reactions);
        for (const c of kernel.getState().agents) { if (c.health.alive) consolidateMemory(c); }

        const moodCounts: Record<string, number> = {};
        for (const r of reactions) moodCounts[r.mood] = (moodCounts[r.mood] || 0) + 1;
        const moodParts = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]).map(([m, c]) => `${Math.round(c / reactions.length * 100)}% ${m}`);
        lastTurnMoodSummary = `${reactions.length} colonists: ${moodParts.join(', ')}`;

        const bulletinRng = new SeededRng(seed).turnSeed(turn + 3000);
        const bulletinPosts = reactions.slice(0, 4).map(r => ({
          name: r.name, department: r.department, role: r.role, marsborn: r.marsborn, age: r.age,
          post: r.quote.length > 140 ? r.quote.slice(0, 137) + '...' : r.quote,
          mood: r.mood, intensity: r.intensity,
          likes: Math.floor(r.intensity * 20 + bulletinRng.next() * 10),
          replies: Math.floor(r.intensity * 5 + bulletinRng.next() * 3),
        }));
        emit('bulletin', { turn, year, posts: bulletinPosts });
      }
    } catch (err) {
      console.log(`  [agents] Reaction generation failed: ${err}`);
    }

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
    emit('turn_done', { turn, year, colony: after.colony, toolsForged: Object.values(toolRegs).flat().length, totalEvents: turnEvents.length });

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

  // Build the canonical Forged Toolbox: deduplicate forge attempts by
  // tool name, keep the first-forge metadata + accumulated reuse count.
  // Includes the full input/output JSON Schemas pulled from the
  // EmergentToolRegistry on first forge — the same data the dashboard's
  // ToolboxSection renders, now available to programmatic consumers.
  // Build the canonical Forged Toolbox from the forgedLedger (which has
  // the authoritative history). allForges is the raw stream of judge
  // calls; the ledger.history captures every USE (forge or reuse).
  const forgedToolbox = (() => {
    const out: Array<{
      name: string;
      description: string;
      mode: string;
      firstForgedTurn: number;
      firstForgedDepartment: string;
      firstForgedEventTitle: string;
      departments: string[];
      /** Total uses minus the original forge. */
      reuseCount: number;
      /** Total uses including the original forge. */
      totalUses: number;
      /** How many of those uses were re-forge attempts. */
      reforgeCount: number;
      /** Re-forge attempts that the judge rejected. */
      rejectedReforges: number;
      approved: boolean;
      confidence: number;
      inputSchema: unknown;
      outputSchema: unknown;
      sampleOutput: unknown;
      /** Full audit trail: every invocation with turn, year, dept, output. */
      history: Array<{ turn: number; year: number; eventIndex: number; eventTitle: string; department: string; output: string | null; isReforge: boolean; rejected: boolean; confidence?: number }>;
    }> = [];
    for (const [name, entry] of forgedLedger) {
      // Find the original forge metadata (description, mode) from the
      // first matching captured forge if available; fall back to history.
      const firstForge = allForges.find(f => f.name === name);
      const departments = new Set<string>();
      let approved = false;
      let maxConfidence = 0;
      let sampleOutput: string | null = null;
      let reforgeCount = 0;
      let rejectedReforges = 0;
      for (const h of entry.history) {
        departments.add(h.department);
        if (!h.rejected) approved = true;
        if (typeof h.confidence === 'number' && h.confidence > maxConfidence) maxConfidence = h.confidence;
        if (h.output) sampleOutput = h.output;
        if (h.isReforge) {
          reforgeCount++;
          if (h.rejected) rejectedReforges++;
        }
      }
      const totalUses = entry.history.length;
      out.push({
        name,
        description: firstForge?.description || name,
        mode: firstForge?.mode || 'sandbox',
        firstForgedTurn: entry.firstForgedTurn,
        firstForgedDepartment: entry.firstForgedDepartment,
        firstForgedEventTitle: entry.firstForgedEventTitle,
        departments: [...departments],
        reuseCount: Math.max(0, totalUses - 1),
        totalUses,
        reforgeCount,
        rejectedReforges,
        approved: approved || (firstForge?.approved ?? false),
        // Use the highest judge confidence across this tool's invocations.
        // If the tool was never approved (only failed forges), confidence
        // is 0 — never fabricate an 0.85 default that misrepresents
        // rejected tools as borderline-passable.
        confidence: maxConfidence || (firstForge?.approved ? firstForge.confidence : 0),
        inputSchema: entry.inputSchema,
        outputSchema: entry.outputSchema,
        sampleOutput,
        history: entry.history.slice(),
      });
    }
    return out.sort((a, b) => a.firstForgedTurn - b.firstForgedTurn);
  })();

  // Flat unique citation list across all department reports.
  const citationCatalog = (() => {
    const byKey = new Map<string, { text: string; url: string; doi?: string; departments: Set<string>; turns: Set<number> }>();
    for (const { turn: t, report } of allDepartmentReports) {
      for (const c of report.citations) {
        const key = (c.url || '').trim() || `text:${(c.text || '').trim()}`;
        if (!key) continue;
        let entry = byKey.get(key);
        if (!entry) {
          entry = { text: c.text || c.url || '', url: c.url || '', doi: c.doi, departments: new Set(), turns: new Set() };
          byKey.set(key, entry);
        }
        if (report.department) entry.departments.add(report.department);
        entry.turns.add(t);
        if (!entry.doi && c.doi) entry.doi = c.doi;
      }
    }
    return [...byKey.values()].map(e => ({ ...e, departments: [...e.departments], turns: [...e.turns].sort((a, b) => a - b) }));
  })();

  const output = {
    simulation: `${sc.id}-v3`,
    leader: { name: leader.name, archetype: leader.archetype, colony: leader.colony, hexaco: leader.hexaco },
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
    cost: { totalTokens, totalCostUSD: Math.round(totalCostUSD * 10000) / 10000, llmCalls },
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

  const outDir = resolve(__dirname, '..', '..', 'output');
  mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const tag = leader.archetype.toLowerCase().replace(/\s+/g, '-');
  const path = resolve(outDir, `v3-${tag}-${ts}.json`);
  writeFileSync(path, JSON.stringify(output, null, 2));

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  COMPLETE — ${leader.name}`);
  console.log(`  Output: ${path}`);
  console.log(`  Turns: ${artifacts.length} | Citations: ${output.totalCitations} | Tools: ${output.totalToolsForged}`);
  console.log(`  Final: Pop ${final.colony.population} | Morale ${Math.round(final.colony.morale * 100)}%`);
  console.log(`  Registries: ${JSON.stringify(toolRegs)}`);
  console.log(`${'═'.repeat(60)}\n`);

  engine.cleanupSession(sid);
  await closeResearchMemory();
  await commander.close();
  for (const a of deptAgents.values()) await a.close();
  return output;
}
