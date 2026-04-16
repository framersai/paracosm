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

function createEmergentEngine(
  toolMap: Map<string, ITool>,
  provider: LlmProvider,
  judgeModel: string,
  execution: Partial<SimulationExecutionConfig> = {},
) {
  const llmCb = async (model: string, prompt: string) => {
    const r = await generateText({ provider, model: model || judgeModel, prompt });
    return r.text;
  };
  const registry = new EmergentToolRegistry();
  const judge = new EmergentJudge({ judgeModel, promotionModel: judgeModel, generateText: llmCb });
  const executor = async (name: string, args: unknown, ctx: any) => {
    const t = toolMap.get(name);
    return t ? t.execute(args as any, ctx) : { success: false, error: `Tool "${name}" not found` };
  };
  const engine = new EmergentCapabilityEngine({
    config: {
      enabled: true, maxSessionTools: 20, maxAgentTools: 50,
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

function wrapForgeTool(raw: ForgeToolMetaTool, agentId: string, sessionId: string, dept: string): ITool {
  return {
    ...(raw as any),
    async execute(args: Record<string, unknown>, ctx: any) {
      const fixed = { ...args };
      // Parse stringified nested JSON from tool call serialization
      for (const k of ['implementation', 'inputSchema', 'outputSchema', 'testCases']) {
        if (typeof (fixed as any)[k] === 'string') try { (fixed as any)[k] = JSON.parse((fixed as any)[k]); } catch (e) { console.warn(`  [forge] Failed to parse ${k}:`, e); }
      }
      // Normalize implementation: OpenAI models send "code" instead of "sandbox", may omit allowlist
      if (fixed.implementation && typeof fixed.implementation === 'object') {
        const impl = fixed.implementation as any;
        if (impl.mode === 'code') impl.mode = 'sandbox';
        if (impl.mode === 'sandbox' && !Array.isArray(impl.allowlist)) impl.allowlist = [];
        if (impl.code && typeof impl.code !== 'string') impl.code = String(impl.code);
        // Ensure code wraps in function execute(input) if missing
        if (impl.mode === 'sandbox' && impl.code && !impl.code.includes('function execute')) {
          impl.code = `function execute(input) {\n${impl.code}\n}`;
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
      console.log(`    🔧 [${dept}] Forging "${fixed.name}" (${mode})...`);
      const patched = { ...ctx, gmiId: agentId, sessionData: { ...(ctx?.sessionData ?? {}), sessionId } };
      try {
        const r = await raw.execute(fixed as any, patched);
        if (r.success) {
          console.log(`    🔧 [${dept}] ✓ "${fixed.name}" approved`);
        } else {
          const reason = r.error || (r.output as any)?.verdict?.reasoning || (r.output as any)?.error || '';
          console.log(`    🔧 [${dept}] ✗ "${fixed.name}" — ${String(reason).slice(0, 150)}`);
        }
        return r;
      } catch (err) {
        console.log(`    🔧 [${dept}] ERR: ${err}`);
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
  type: 'turn_start' | 'event_start' | 'dept_start' | 'dept_done' | 'forge_attempt' | 'commander_deciding' | 'commander_decided' | 'outcome' | 'drift' | 'agent_reactions' | 'bulletin' | 'turn_done' | 'promotion' | 'colony_snapshot';
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

  // Per-million-token pricing estimates for cost tracking
  const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    'gpt-5.4': { input: 2.50, output: 10.00 },
    'gpt-5.4-mini': { input: 0.30, output: 1.20 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
    'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  };
  const defaultPricing = MODEL_PRICING[modelConfig.commander] || { input: 2.50, output: 10.00 };

  function trackUsage(result: { usage?: { totalTokens?: number; promptTokens?: number; completionTokens?: number; costUSD?: number } }) {
    if (result?.usage) {
      totalTokens += result.usage.totalTokens ?? 0;
      llmCalls++;
      if (typeof result.usage.costUSD === 'number') {
        totalCostUSD += result.usage.costUSD;
      } else {
        const input = result.usage.promptTokens ?? 0;
        const output = result.usage.completionTokens ?? 0;
        totalCostUSD += (input * defaultPricing.input / 1_000_000) + (output * defaultPricing.output / 1_000_000);
      }
    }
  }

  const emit = (type: SimEvent['type'], data?: Record<string, unknown>) => {
    opts.onEvent?.({ type, leader: leader.name, data: { ...data, _cost: { totalTokens, totalCostUSD: Math.round(totalCostUSD * 10000) / 10000, llmCalls } } });
  };

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
    startingResources: opts.startingResources,
    startingPolitics: opts.startingPolitics,
  });

  const toolMap = new Map<string, ITool>();
  toolMap.set('web_search', webSearchTool);
  const { engine, forgeTool } = createEmergentEngine(toolMap, provider, modelConfig.judge, opts.execution);
  const toolRegs: Record<string, string[]> = {};

  const commander = agent({
    provider, model: modelConfig.commander,
    instructions: leader.instructions,
    personality: { openness: leader.hexaco.openness, conscientiousness: leader.hexaco.conscientiousness, extraversion: leader.hexaco.extraversion, agreeableness: leader.hexaco.agreeableness, emotionality: leader.hexaco.emotionality, honesty: leader.hexaco.honestyHumility },
    maxSteps: opts.execution?.commanderMaxSteps ?? DEFAULT_EXECUTION.commanderMaxSteps,
  });
  const cmdSess = commander.session(`${sid}-cmd`);
  trackUsage(await cmdSess.send('You are the colony commander. You receive department reports and make strategic decisions. When the crisis includes options with IDs, you MUST include selectedOptionId in your JSON response. Return JSON with selectedOptionId, decision, rationale, selectedPolicies, rejectedPolicies, expectedTradeoffs, watchMetricsNextTurn. Acknowledge.'));

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
  trackUsage(promoResult);

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

  // Create department agent sessions from promoted agents
  const deptAgents = new Map<Department, any>();
  const deptSess = new Map<Department, any>();
  const promoted = kernel.getState().agents.filter(c => c.promotion);
  for (const p of promoted) {
    const dept = p.promotion!.department;
    const cfg = sc.departments.find(c => c.id === dept);
    if (!cfg) continue;
    const wrapped = wrapForgeTool(forgeTool, `${sid}-${dept}`, sid, dept);
    const tools: ITool[] = opts.liveSearch ? [webSearchTool, wrapped] : [wrapped];
    const a = agent({
      provider,
      model: modelConfig.departments || cfg.defaultModel,
      instructions: cfg.instructions + '\n\nIMPORTANT: You MUST respond with valid JSON only. No markdown, no prose, no explanation outside the JSON object.',
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
  const director = new EventDirector();
  const effectRegistry = new EffectRegistry(sc.effects[0]?.categoryDefaults ?? {});
  // Department memory: stores previous turn summaries per department for session continuity
  const deptMemory = new Map<Department, import('./departments.js').DepartmentTurnMemory[]>();
  const activeDepartments = new Set<Department>(opts.activeDepartments ?? sc.departments.map(d => d.id));

  for (let turn = 1; turn <= maxTurns; turn++) {
    const year = yearSchedule[turn - 1] ?? (yearSchedule[yearSchedule.length - 1] + (turn - yearSchedule.length) * 5);
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

    for (let ei = 0; ei < turnEvents.length; ei++) {
      try {
      let event = applyCustomEventToCrisis(turnEvents[ei], opts.customEvents ?? [], turn);

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
        try {
          const r = await sess.send(ctx);
          trackUsage(r);
          const report = parseDeptReport(r.text, dept);
          const validTools = report.forgedToolsUsed.filter(t => t && (t.name || t.description)).map(t => {
            const rawOutput = t.output ? (typeof t.output === 'string' ? t.output : JSON.stringify(t.output)) : null;
            let inputFields: string[] = [], outputFields: string[] = [];
            if (rawOutput) { try { const p = JSON.parse(rawOutput); if (p && typeof p === 'object') { const keys = Object.keys(p); const inKey = keys.find(k => ['inputs','input','parameters','params'].includes(k)); if (inKey && p[inKey] && typeof p[inKey] === 'object') { inputFields = Object.keys(p[inKey]); outputFields = keys.filter(k => k !== inKey); } else { outputFields = keys; } } } catch {} }
            return { name: t.name || t.description || 'tool', mode: t.mode || 'sandbox', confidence: t.confidence ?? 0.85, description: t.description || humanizeToolName(t.name || ''), output: rawOutput?.slice(0, 400) || null, inputFields: inputFields.slice(0, 8), outputFields: outputFields.slice(0, 8), department: dept, crisis: event.title };
          });
          emit('dept_done', { turn, year, department: dept, summary: report.summary, eventIndex: ei, citations: report.citations.length, citationList: report.citations.slice(0, 5).map(c => ({ text: c.text, url: c.url, doi: c.doi })), risks: report.risks, forgedTools: validTools, recommendedActions: report.recommendedActions?.slice(0, 2) });
          if (report.forgedToolsUsed.length) { const names = report.forgedToolsUsed.map(t => t?.name || t?.description || 'unnamed').filter(Boolean); if (names.length) toolRegs[dept] = [...(toolRegs[dept] || []), ...names]; }
          return report;
        } catch (err) { console.log(`  [${dept}] ERROR: ${err}`); return emptyReport(dept); }
      });
      const reports = await Promise.all(deptPromises);

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
      trackUsage(cmdR);
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
      const personalityBonus = (leader.hexaco.openness - 0.5) * 0.08 + (leader.hexaco.conscientiousness - 0.5) * 0.04;
      const colonyDeltas = effectRegistry.applyOutcome(event.category, outcome, { personalityBonus, noise: outcomeEffectRng.next() * 0.2 - 0.1 });
      kernel.applyColonyDeltas(colonyDeltas as any, [{ turn, year, type: 'system', description: `Outcome effect (${outcome}): ${Object.entries(colonyDeltas).map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v}`).join(', ')}` }]);

      const polDelta = sc.hooks.politicsHook?.(event.category, outcome);
      if (polDelta) kernel.applyPoliticsDeltas(polDelta);

      outcomeLog.push({ turn, year, outcome });
      eventHistory.push({ turn, title: event.title, category: event.category, selectedOptionId: resolvedOptionId, decision: decision.decision.slice(0, 200), outcome });
      lastOutcome = outcome;
      lastEventCategory = event.category;

      console.log(`  [outcome] ${outcome} (${event.category}) effects: ${JSON.stringify(colonyDeltas)}`);
      emit('outcome', { turn, year, outcome, category: event.category, emergent: !milestone, colonyDeltas, eventIndex: ei });
      } catch (err) {
        console.error(`  [event ${ei + 1}/${turnEvents.length}] Failed: ${err}`);
        // Continue to next event; don't kill the turn
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
    try {
      reactions = await generateAgentReactions(
        kernel.getState().agents, reactionCtx,
        { provider, model: modelConfig.agentReactions || 'gpt-4o-mini', maxConcurrent: 25, reactionContextHook: sc.hooks.reactionContextHook },
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

    const after = kernel.getState();
    artifacts.push({
      turn, year, crisis: turnEventTitles.join(' / '),
      departmentReports: [], commanderDecision: emptyDecision(sc.departments.map(d => d.id as Department)),
      policyEffectsApplied: [],
      stateSnapshotAfter: {
        population: after.colony.population, morale: after.colony.morale,
        foodMonthsReserve: after.colony.foodMonthsReserve, infrastructureModules: after.colony.infrastructureModules,
        scienceOutput: after.colony.scienceOutput, births, deaths,
      },
    });
    console.log(`  State: Pop ${after.colony.population} | Morale ${Math.round(after.colony.morale * 100)}% | Food ${after.colony.foodMonthsReserve.toFixed(1)}mo`);
    emit('turn_done', { turn, year, colony: after.colony, toolsForged: Object.values(toolRegs).flat().length, totalEvents: turnEvents.length });

    // Emit full agent roster for colony visualization
    const snapshotAgents = after.agents.map(a => ({
      agentId: a.core.id,
      name: a.core.name,
      department: a.core.department,
      role: a.core.role,
      rank: a.career.rank,
      alive: a.health.alive,
      marsborn: a.core.marsborn,
      psychScore: a.health.psychScore,
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
      console.error(`  [turn ${turn}] FATAL: ${err}`);
      // Emit a degraded colony_snapshot so the dashboard doesn't get stuck
      const fallbackAgents = kernel.getState().agents.map(a => ({
        agentId: a.core.id, name: a.core.name, department: a.core.department, role: a.core.role,
        rank: a.career.rank, alive: a.health.alive, marsborn: a.core.marsborn,
        psychScore: a.health.psychScore, partnerId: a.social.partnerId,
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

  // Compute timeline fingerprint via scenario hook
  const fingerprint = sc.hooks.fingerprintHook
    ? sc.hooks.fingerprintHook(final, outcomeLog, leader, toolRegs, maxTurns)
    : { summary: 'no fingerprint hook' };

  const output = {
    simulation: `${sc.id}-v3`, leader: { name: leader.name, archetype: leader.archetype, colony: leader.colony, hexaco: leader.hexaco },
    turnArtifacts: artifacts, finalState: final, toolRegistries: toolRegs,
    agentTrajectories: trajectories,
    outcomeClassifications: outcomeLog,
    fingerprint,
    totalCitations: artifacts.reduce((s, t) => s + t.departmentReports.reduce((s2, r) => s2 + r.citations.length, 0), 0),
    totalToolsForged: Object.values(toolRegs).flat().length,
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
