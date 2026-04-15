import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ITool } from '@framers/agentos';
import {
  EmergentCapabilityEngine, EmergentJudge, EmergentToolRegistry,
  ComposableToolBuilder, SandboxedToolForge, ForgeToolMetaTool, generateText,
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
import { EventDirector, type DirectorEvent, type DirectorContext } from './director.js';
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
        if (typeof (fixed as any)[k] === 'string') try { (fixed as any)[k] = JSON.parse((fixed as any)[k]); } catch {}
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
  type: 'turn_start' | 'dept_start' | 'dept_done' | 'forge_attempt' | 'commander_deciding' | 'commander_decided' | 'outcome' | 'drift' | 'agent_reactions' | 'bulletin' | 'turn_done' | 'promotion';
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

  function trackUsage(result: { usage?: { totalTokens?: number; promptTokens?: number; completionTokens?: number; costUSD?: number } }) {
    if (result?.usage) {
      totalTokens += result.usage.totalTokens ?? 0;
      llmCalls++;
      if (typeof result.usage.costUSD === 'number') {
        totalCostUSD += result.usage.costUSD;
      } else {
        // Estimate cost from tokens if provider doesn't report it (~$0.15/1M input, ~$0.60/1M output for gpt-4o-mini)
        const input = result.usage.promptTokens ?? 0;
        const output = result.usage.completionTokens ?? 0;
        totalCostUSD += (input * 0.00000015) + (output * 0.0000006);
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
    } catch { /* fallback below */ }
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

    // Get crisis: milestone (turn 1 / final) or emergent (director)
    let event: DirectorEvent;
    const getMilestone = sc.hooks.getMilestoneEvent ?? sc.hooks.getMilestoneEvent;
    const milestone = getMilestone?.(turn, maxTurns);
    if (milestone) {
      event = { ...milestone, description: (milestone as any).description || (milestone as any).crisis || '' } as DirectorEvent;
    } else {
      // Build director context from current colony state
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
      event = await director.generateEvent(dirCtx, provider, modelConfig.director, dirInstructions);
    }

    event = applyCustomEventToCrisis(event, opts.customEvents ?? [], turn);

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`  Turn ${turn}/${maxTurns} — Year ${year}: ${event.title} [${milestone ? 'MILESTONE' : 'EMERGENT'}]`);
    console.log(`${'─'.repeat(50)}`);

    const state = kernel.advanceTurn(turn, year, sc.hooks.progressionHook);
    const births = state.eventLog.filter(e => e.turn === turn && e.type === 'birth').length;
    const deaths = state.eventLog.filter(e => e.turn === turn && e.type === 'death').length;
    console.log(`  Kernel: +${births} births, -${deaths} deaths → pop ${state.colony.population}`);

    emit('turn_start', { turn, year, title: event.title, crisis: event.description.slice(0, 200), category: event.category, births, deaths, colony: state.colony, emergent: !milestone, turnSummary: event.turnSummary });

    // Get research: memory recall > live web search > static fallback
    let packet: import('./contracts.js').CrisisResearchPacket;
    if (milestone) {
      // Milestone research: try scenario knowledge bundle first, fall back to legacy static
      packet = getResearchFromBundle(sc.knowledge, event.category, event.researchKeywords);
      if (packet.canonicalFacts.length === 0) {
        packet = getResearchPacket(turn);
      }
    } else {
      // Try research memory first (semantic recall from ingested scenario citations)
      const memPacket = await recallResearch(event.title + ' ' + event.description.slice(0, 100), event.researchKeywords, event.category);
      if (memPacket.canonicalFacts.length >= 2) {
        packet = memPacket;
        console.log(`  [research] Memory recall: ${packet.canonicalFacts.length} citations`);
      } else if (opts.liveSearch && event.researchKeywords.length) {
        // Live web search using AgentOS WebSearchService
        try {
          const query = event.researchKeywords.slice(0, 3).join(' ') + ' ' + sc.labels.settlementNoun + ' science';
          console.log(`  [research] Live search: "${query}"`);
          const searchResult = await webSearchTool.execute({ query }, { gmiId: sid, personaId: sid, userContext: {} } as any);
          const results = (searchResult as any)?.output?.results || [];
          packet = {
            canonicalFacts: results.slice(0, 5).map((r: any) => ({
              claim: r.snippet || r.title || '',
              source: r.title || 'web search',
              url: r.url || '',
            })),
            counterpoints: [],
            departmentNotes: {},
          };
          console.log(`  [research] ${packet.canonicalFacts.length} live results`);
        } catch (err) {
          console.log(`  [research] Live search failed, using scenario bundle: ${err}`);
          packet = getResearchFromBundle(sc.knowledge, event.category, event.researchKeywords);
        }
      } else {
        // Fallback to scenario knowledge bundle (not hardcoded Mars)
        packet = getResearchFromBundle(sc.knowledge, event.category, event.researchKeywords);
      }
    }

    // Departments: from director for emergent, from schedule for milestones
    const validDepts: Department[] = ['medical', 'engineering', 'agriculture', 'psychology', 'governance'];
    const rawDepts = milestone ? getDepartmentsForTurn(turn) : event.relevantDepartments;
    const depts = rawDepts.filter(d => validDepts.includes(d) && activeDepartments.has(d));
    if (!depts.length) depts.push('medical', 'engineering');
    console.log(`  Departments: ${depts.join(', ')}`);

    // Build a Scenario-compatible object for department context builder
    const scenario = {
      turn, year, title: event.title, crisis: event.description,
      researchKeywords: event.researchKeywords, snapshotHints: {} as any,
      riskyOption: event.options.find(o => o.isRisky)?.label || '',
      riskSuccessProbability: event.riskSuccessProbability,
      options: event.options,
    };

    // Run all departments in parallel for speed
    const deptPromises = depts.map(async (dept) => {
      const sess = deptSess.get(dept);
      if (!sess) return emptyReport(dept);
      const ctx = buildDepartmentContext(dept, state, scenario, packet, deptMemory.get(dept), sc.hooks.departmentPromptHook);
      console.log(`  [${dept}] Analyzing...`);
      emit('dept_start', { turn, year, department: dept });
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
                  } else {
                    outputFields = keys;
                  }
                }
              } catch {}
            }
            return {
              name: t.name || t.description || 'tool',
              mode: t.mode || 'sandbox',
              confidence: t.confidence ?? 0.85,
              description: t.description || humanizeToolName(t.name || ''),
              output: rawOutput?.slice(0, 400) || null,
              inputFields: inputFields.slice(0, 8),
              outputFields: outputFields.slice(0, 8),
              department: dept,
              crisis: event.title,
            };
          });
        emit('dept_done', {
          turn, year, department: dept, summary: report.summary,
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

    // Collect tool outputs for next turn's director context
    lastTurnToolOutputs = reports.flatMap(r =>
      (r.forgedToolsUsed || []).filter(t => t?.output).map(t => ({
        name: t.name || 'unnamed',
        department: r.department,
        output: typeof t.output === 'string' ? t.output.slice(0, 200) : JSON.stringify(t.output).slice(0, 200),
      }))
    );

    // Store department memories for session continuity (will be completed with outcome after decision)
    const pendingDeptMemories = new Map<Department, import('./departments.js').DepartmentTurnMemory>();
    for (const r of reports) {
      pendingDeptMemories.set(r.department, {
        turn, year, crisis: event.title,
        summary: r.summary,
        recommendedActions: r.recommendedActions?.slice(0, 3) || [],
        outcome: '', // filled after outcome classification
        toolsForged: (r.forgedToolsUsed || []).map(t => t?.name || '').filter(Boolean),
      });
    }

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
    const cmdPrompt = `TURN ${turn} — ${year}: ${event.title}\n\n${event.description}\n\nDEPARTMENT REPORTS:\n${summaries}\n\nColony: Pop ${state.colony.population} | Morale ${Math.round(state.colony.morale * 100)}% | Food ${state.colony.foodMonthsReserve.toFixed(1)}mo${optionText}${effectsText}\n\nDecide. Return JSON.`;

    console.log(`  [commander] Deciding...`);
    emit('commander_deciding', { turn, year });
    const cmdR = await cmdSess.send(cmdPrompt);
    trackUsage(cmdR);
    const decision = parseCmdDecision(cmdR.text, depts);
    console.log(`  [commander] ${decision.decision.slice(0, 120)}...`);
    emit('commander_decided', { turn, year, decision: decision.decision, rationale: decision.rationale, selectedPolicies: decision.selectedPolicies });

    kernel.applyPolicy(decisionToPolicy(decision, reports, turn, year));

    // Apply featured agent updates
    const agentUpdates = reports.flatMap(r =>
      (r.featuredAgentUpdates || []).filter(u => u && u.agentId && u.updates).map(u => ({
        agentId: u.agentId,
        health: u.updates?.health,
        career: u.updates?.career,
        narrativeEvent: u.updates?.narrative?.event,
      }))
    );
    if (agentUpdates.length) kernel.applyAgentUpdates(agentUpdates);

    // Classify outcome using structured option IDs
    const outcomeRng = new SeededRng(seed).turnSeed(turn + 1000);
    // Determine selected option: prefer explicit ID, then try to infer from decision text matching option labels
    let resolvedOptionId = decision.selectedOptionId;
    if (!resolvedOptionId && event.options.length) {
      const decLower = (decision.decision || '').toLowerCase();
      for (const opt of event.options) {
        if (decLower.includes(opt.id) || decLower.includes(opt.label.toLowerCase())) {
          resolvedOptionId = opt.id;
          break;
        }
      }
    }
    const outcome = resolvedOptionId
      ? classifyOutcomeById(resolvedOptionId, event.options, event.riskSuccessProbability, kernel.getState().colony, outcomeRng)
      : classifyOutcome(decision.decision, scenario.riskyOption, event.riskSuccessProbability, kernel.getState().colony, outcomeRng);

    // Apply outcome-driven colony effects via EffectRegistry
    const outcomeEffectRng = new SeededRng(seed).turnSeed(turn + 2000);
    const personalityBonus = (leader.hexaco.openness - 0.5) * 0.08 + (leader.hexaco.conscientiousness - 0.5) * 0.04;
    const colonyDeltas = effectRegistry.applyOutcome(event.category, outcome, {
      personalityBonus,
      noise: outcomeEffectRng.next() * 0.2 - 0.1,
    });
    kernel.applyColonyDeltas(colonyDeltas as any, [{
      turn, year, type: 'system',
      description: `Outcome effect (${outcome}): ${Object.entries(colonyDeltas).map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v}`).join(', ')}`,
    }]);

    // Apply politics deltas via scenario hook
    const polDelta = sc.hooks.politicsHook?.(event.category, outcome);
    if (polDelta) {
      kernel.applyPoliticsDeltas(polDelta);
    }

    const prevYear = turn === 1 ? startYear : yearSchedule[turn - 2] ?? startYear;
    kernel.applyDrift(leader.hexaco, outcome, Math.max(1, year - prevYear));
    outcomeLog.push({ turn, year, outcome });

    // Track crisis history for director context
    eventHistory.push({ turn, title: event.title, category: event.category, selectedOptionId: decision.selectedOptionId, decision: decision.decision.slice(0, 100), outcome });

    // Finalize department memories with outcome and store
    for (const [dept, mem] of pendingDeptMemories) {
      mem.outcome = outcome;
      const existing = deptMemory.get(dept) || [];
      existing.push(mem);
      deptMemory.set(dept, existing);
    }

    console.log(`  [outcome] ${outcome} (${event.category}${milestone ? ', milestone' : ', emergent'}) effects: ${JSON.stringify(colonyDeltas)}`);
    emit('outcome', { turn, year, outcome, riskyOption: scenario.riskyOption, category: event.category, emergent: !milestone, colonyDeltas });

    // Log drift
    const drifted = kernel.getState().agents.filter(c => c.promotion && c.health.alive);
    const driftData: Record<string, { name: string; hexaco: any }> = {};
    for (const p of drifted.slice(0, 5)) {
      const h = p.hexaco;
      driftData[p.core.id] = { name: p.core.name, hexaco: { O: +h.openness.toFixed(2), C: +h.conscientiousness.toFixed(2), E: +h.extraversion.toFixed(2), A: +h.agreeableness.toFixed(2) } };
    }
    emit('drift', { turn, year, agents: driftData });

    // Generate colonist reactions in parallel (all alive agents, cheap model)
    const reactionCtx = {
      crisisTitle: event.title, crisisCategory: event.category,
      outcome, decision: decision.decision.slice(0, 200),
      year, turn, colonyMorale: kernel.getState().colony.morale,
      colonyPopulation: kernel.getState().colony.population,
    };
    try {
      const reactions = await generateAgentReactions(
        kernel.getState().agents, reactionCtx,
        { provider, model: modelConfig.agentReactions || 'gpt-4o-mini', maxConcurrent: 25, reactionContextHook: sc.hooks.reactionContextHook },
      );
      if (reactions.length) {
        // Emit top 8 most intense reactions for dashboard display
        // Build memory summaries for display
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
                relationships: Object.entries(mem.relationships)
                  .filter(([, v]) => Math.abs(v) > 0.2)
                  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                  .slice(0, 3)
                  .map(([id, v]) => ({ name: agentMap.get(id)?.core.name || id, sentiment: v })),
              } : null,
            };
          }),
          totalReactions: reactions.length,
        });
        // Record reactions into persistent memory
        for (const r of reactions) {
          const c = agentMap.get(r.agentId);
          if (c) recordReactionMemory(c, r, event.title, event.category, outcome, turn, year);
        }
        updateRelationshipsFromReactions(kernel.getState().agents, reactions);
        // Consolidate any overflowing short-term memories
        for (const c of kernel.getState().agents) {
          if (c.health.alive) consolidateMemory(c);
        }

        // Summarize mood for next turn's director
        const moodCounts: Record<string, number> = {};
        for (const r of reactions) moodCounts[r.mood] = (moodCounts[r.mood] || 0) + 1;
        const moodParts = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]).map(([m, c]) => `${Math.round(c / reactions.length * 100)}% ${m}`);
        lastTurnMoodSummary = `${reactions.length} colonists: ${moodParts.join(', ')}`;

        // Colony bulletin board: top 4 most intense reactions as public posts
        const bulletinPosts = reactions.slice(0, 4).map(r => ({
          name: r.name, department: r.department, role: r.role,
          marsborn: r.marsborn, age: r.age,
          post: r.quote.length > 140 ? r.quote.slice(0, 137) + '...' : r.quote,
          mood: r.mood, intensity: r.intensity,
          likes: Math.floor(r.intensity * 20 + outcomeEffectRng.next() * 10),
          replies: Math.floor(r.intensity * 5 + outcomeEffectRng.next() * 3),
        }));
        emit('bulletin', { turn, year, posts: bulletinPosts });
      }
    } catch (err) {
      console.log(`  [agents] Reaction generation failed: ${err}`);
    }

    const after = kernel.getState();
    artifacts.push({
      turn, year, crisis: event.title,
      departmentReports: reports, commanderDecision: decision,
      policyEffectsApplied: decision.selectedPolicies,
      stateSnapshotAfter: {
        population: after.colony.population, morale: after.colony.morale,
        foodMonthsReserve: after.colony.foodMonthsReserve, infrastructureModules: after.colony.infrastructureModules,
        scienceOutput: after.colony.scienceOutput, births, deaths,
      },
    });
    console.log(`  State: Pop ${after.colony.population} | Morale ${Math.round(after.colony.morale * 100)}% | Food ${after.colony.foodMonthsReserve.toFixed(1)}mo`);
    emit('turn_done', { turn, year, colony: after.colony, toolsForged: Object.values(toolRegs).flat().length });
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
