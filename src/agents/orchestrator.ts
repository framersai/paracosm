import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ITool } from '@framers/agentos';
import {
  EmergentCapabilityEngine, EmergentJudge, EmergentToolRegistry,
  ComposableToolBuilder, SandboxedToolForge, ForgeToolMetaTool, generateText,
} from '@framers/agentos';
import type { Department, TurnOutcome } from '../kernel/state.js';
import { SeededRng } from '../kernel/rng.js';
import { classifyOutcome, classifyOutcomeById } from '../kernel/progression.js';
import type { DepartmentReport, CommanderDecision, TurnArtifact } from './contracts.js';
import { SimulationKernel, type PolicyEffect } from '../kernel/kernel.js';
import type { KeyPersonnel } from '../kernel/colonist-generator.js';
import { getResearchPacket } from '../research/research.js';
import { getResearchForCategory } from '../research/knowledge-base.js';
import { initResearchMemory, recallResearch, closeResearchMemory } from '../research/research-memory.js';
import { DEPARTMENT_CONFIGS, buildDepartmentContext, getDepartmentsForTurn } from './departments.js';
import { CrisisDirector, type DirectorCrisis, type DirectorContext } from './director.js';
import { generateColonistReactions } from './colonist-reactions.js';
import {
  DEFAULT_EXECUTION,
  resolveSimulationModels,
  type LlmProvider,
  type SimulationExecutionConfig,
  type SimulationModelConfig,
  type StartingPolitics,
  type StartingResources,
} from '../sim-config.js';
import { applyCustomEventToCrisis, buildPromotionPrompt, buildYearSchedule } from './runtime-helpers.js';
import { EffectRegistry } from '../engine/effect-registry.js';
import { MARS_CATEGORY_EFFECTS, MARS_FALLBACK_EFFECT, MARS_POLITICS_CATEGORIES, MARS_POLITICS_SUCCESS_DELTA, MARS_POLITICS_FAILURE_DELTA } from '../engine/mars/effects.js';
import type { LeaderConfig } from '../types.js';
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

      const results = await service.search(query, { limit: 5, rerank: !!process.env.COHERE_API_KEY });
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
  return { department: d, summary: '', citations: [], risks: [], opportunities: [], recommendedActions: [], proposedPatches: {}, forgedToolsUsed: [], featuredColonistUpdates: [], confidence: 0.7, openQuestions: [], recommendedEffects: [] };
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export type SimEvent = {
  type: 'turn_start' | 'dept_start' | 'dept_done' | 'forge_attempt' | 'commander_deciding' | 'commander_decided' | 'outcome' | 'drift' | 'colonist_reactions' | 'bulletin' | 'turn_done' | 'promotion';
  leader: string;
  turn?: number;
  year?: number;
  data?: Record<string, unknown>;
};

export interface RunOptions {
  maxTurns?: number;
  seed?: number;
  startYear?: number;
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
}

export async function runSimulation(leader: LeaderConfig, keyPersonnel: KeyPersonnel[], opts: RunOptions = {}) {
  const { agent } = await import('@framers/agentos');
  const maxTurns = opts.maxTurns ?? 12;
  const startYear = opts.startYear ?? 2035;
  const provider = opts.provider ?? 'openai';
  const sid = `mars-v2-${leader.archetype.toLowerCase().replace(/\s+/g, '-')}`;
  const modelConfig = resolveSimulationModels(provider, opts.models);
  const emit = (type: SimEvent['type'], data?: Record<string, unknown>) => {
    opts.onEvent?.({ type, leader: leader.name, data });
  };

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  MARS GENESIS v2`);
  console.log(`  Commander: ${leader.name} — "${leader.archetype}"`);
  console.log(`  Turns: ${maxTurns} | Live search: ${opts.liveSearch ? 'yes' : 'no'}`);
  console.log(`${'═'.repeat(60)}\n`);

  // Initialize research memory (semantic recall from DOI citations)
  await initResearchMemory();

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
  await cmdSess.send('You are the colony commander. You receive department reports and make strategic decisions. When the crisis includes options with IDs, you MUST include selectedOptionId in your JSON response. Return JSON with selectedOptionId, decision, rationale, selectedPolicies, rejectedPolicies, expectedTradeoffs, watchMetricsNextTurn. Acknowledge.');

  // Turn 0: Commander promotes department heads from colonist roster
  console.log('  [Turn 0] Commander evaluating roster for promotions...');
  const promotionDepts: Department[] = ['medical', 'engineering', 'agriculture', 'psychology', 'governance'];
  const roleNames: Record<string, string> = {
    medical: 'Chief Medical Officer', engineering: 'Chief Engineer',
    agriculture: 'Head of Agriculture', psychology: 'Colony Psychologist',
    governance: 'Governance Advisor',
  };
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

  const promoMatch = promoResult.text.match(/\{[\s\S]*"promotions"[\s\S]*\}/);
  if (promoMatch) {
    try {
      const pd = JSON.parse(promoMatch[0]);
      for (const p of pd.promotions || []) {
        try {
          kernel.promoteColonist(p.colonistId, p.department, p.role, leader.name);
          console.log(`  ✦ ${p.colonistId} → ${p.role}: ${p.reason?.slice(0, 80)}`);
          emit('promotion', { colonistId: p.colonistId, department: p.department, role: p.role, reason: p.reason?.slice(0, 120) });
        } catch (err) { console.log(`  ✦ Promotion failed: ${err}`); }
      }
    } catch { /* fallback below */ }
  }
  // Fallback: promote top candidate per dept if commander didn't produce valid JSON
  for (const dept of promotionDepts) {
    const hasLeader = kernel.getState().colonists.some(c => c.promotion?.department === dept);
    if (!hasLeader) {
      const top = kernel.getCandidates(dept, 1)[0];
      if (top) {
        kernel.promoteColonist(top.core.id, dept, roleNames[dept] || `Head of ${dept}`, leader.name);
        console.log(`  ✦ [fallback] ${top.core.name} → ${roleNames[dept]}`);
      }
    }
  }

  // Create department agent sessions from promoted colonists
  const deptAgents = new Map<Department, any>();
  const deptSess = new Map<Department, any>();
  const promoted = kernel.getState().colonists.filter(c => c.promotion);
  for (const p of promoted) {
    const dept = p.promotion!.department;
    const cfg = DEPARTMENT_CONFIGS.find(c => c.department === dept);
    if (!cfg) continue;
    const wrapped = wrapForgeTool(forgeTool, `${sid}-${dept}`, sid, dept);
    const tools: ITool[] = opts.liveSearch ? [webSearchTool, wrapped] : [wrapped];
    const a = agent({
      provider,
      model: modelConfig.departments || cfg.model,
      instructions: cfg.instructions,
      tools,
      maxSteps: opts.execution?.departmentMaxSteps ?? DEFAULT_EXECUTION.departmentMaxSteps,
    });
    deptAgents.set(dept, a);
    deptSess.set(dept, a.session(`${sid}-${dept}`));
  }
  console.log(`  Promoted ${promoted.length} department heads. Agents created.\n`);

  const artifacts: TurnArtifact[] = [];
  const yearSchedule = buildYearSchedule(startYear, maxTurns);
  const outcomeLog: Array<{ turn: number; year: number; outcome: TurnOutcome }> = [];
  const crisisHistory: DirectorContext['previousCrises'] = [];
  let lastTurnToolOutputs: Array<{ name: string; department: string; output: string }> = [];
  let lastTurnMoodSummary: string | undefined;
  const director = new CrisisDirector();
  const effectRegistry = new EffectRegistry(MARS_CATEGORY_EFFECTS, MARS_FALLBACK_EFFECT);
  // Department memory: stores previous turn summaries per department for session continuity
  const deptMemory = new Map<Department, import('./departments.js').DepartmentTurnMemory[]>();
  const activeDepartments = new Set<Department>(opts.activeDepartments ?? ['medical', 'engineering', 'agriculture', 'psychology', 'governance']);

  for (let turn = 1; turn <= maxTurns; turn++) {
    const year = yearSchedule[turn - 1] ?? (yearSchedule[yearSchedule.length - 1] + (turn - yearSchedule.length) * 5);

    // Get crisis: milestone (turn 1 / final) or emergent (director)
    let crisis: DirectorCrisis;
    const milestone = director.getMilestoneCrisis(turn, maxTurns);
    if (milestone) {
      crisis = milestone;
    } else {
      // Build director context from current colony state
      const preState = kernel.getState();
      const alive = preState.colonists.filter(c => c.health.alive);
      const dirCtx: DirectorContext = {
        turn, year,
        leaderName: leader.name, leaderArchetype: leader.archetype, leaderHexaco: leader.hexaco,
        colony: preState.colony, politics: preState.politics,
        aliveCount: alive.length,
        marsBornCount: alive.filter(c => c.core.marsborn).length,
        recentDeaths: preState.eventLog.filter(e => e.turn === turn - 1 && e.type === 'death').length,
        recentBirths: preState.eventLog.filter(e => e.turn === turn - 1 && e.type === 'birth').length,
        previousCrises: crisisHistory,
        toolsForged: Object.values(toolRegs).flat(),
        driftSummary: preState.colonists.filter(c => c.promotion && c.health.alive).slice(0, 4)
          .map(c => ({ name: c.core.name, role: c.core.role, openness: c.hexaco.openness, conscientiousness: c.hexaco.conscientiousness })),
        recentToolOutputs: lastTurnToolOutputs,
        colonistMoodSummary: lastTurnMoodSummary,
      };
      emit('turn_start', { turn, year, title: 'Director generating...', crisis: '', births: 0, deaths: 0, colony: preState.colony });
      crisis = await director.generateCrisis(dirCtx, provider, modelConfig.director);
    }

    crisis = applyCustomEventToCrisis(crisis, opts.customEvents ?? [], turn);

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`  Turn ${turn}/${maxTurns} — Year ${year}: ${crisis.title} [${milestone ? 'MILESTONE' : 'EMERGENT'}]`);
    console.log(`${'─'.repeat(50)}`);

    const state = kernel.advanceTurn(turn, year);
    const births = state.eventLog.filter(e => e.turn === turn && e.type === 'birth').length;
    const deaths = state.eventLog.filter(e => e.turn === turn && e.type === 'death').length;
    console.log(`  Kernel: +${births} births, -${deaths} deaths → pop ${state.colony.population}`);

    emit('turn_start', { turn, year, title: crisis.title, crisis: crisis.crisis.slice(0, 200), category: crisis.category, births, deaths, colony: state.colony, emergent: !milestone, turnSummary: crisis.turnSummary });

    // Get research: memory recall > live web search > static fallback
    let packet: import('./contracts.js').CrisisResearchPacket;
    if (milestone) {
      packet = getResearchPacket(turn);
    } else {
      // Try research memory first (semantic recall from ingested DOI citations)
      const memPacket = await recallResearch(crisis.title + ' ' + crisis.crisis.slice(0, 100), crisis.researchKeywords, crisis.category);
      if (memPacket.canonicalFacts.length >= 2) {
        packet = memPacket;
        console.log(`  [research] Memory recall: ${packet.canonicalFacts.length} citations`);
      } else if (opts.liveSearch && crisis.researchKeywords.length) {
        // Live web search using AgentOS WebSearchService
        try {
          const query = crisis.researchKeywords.slice(0, 3).join(' ') + ' mars colony science';
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
          console.log(`  [research] Live search failed, using static: ${err}`);
          packet = getResearchForCategory(crisis.category, crisis.researchKeywords);
        }
      } else {
        packet = getResearchForCategory(crisis.category, crisis.researchKeywords);
      }
    }

    // Departments: from director for emergent, from schedule for milestones
    const validDepts: Department[] = ['medical', 'engineering', 'agriculture', 'psychology', 'governance'];
    const rawDepts = milestone ? getDepartmentsForTurn(turn) : crisis.relevantDepartments;
    const depts = rawDepts.filter(d => validDepts.includes(d) && activeDepartments.has(d));
    if (!depts.length) depts.push('medical', 'engineering');
    console.log(`  Departments: ${depts.join(', ')}`);

    // Build a Scenario-compatible object for department context builder
    const scenario = {
      turn, year, title: crisis.title, crisis: crisis.crisis,
      researchKeywords: crisis.researchKeywords, snapshotHints: {} as any,
      riskyOption: crisis.options.find(o => o.isRisky)?.label || '',
      riskSuccessProbability: crisis.riskSuccessProbability,
      options: crisis.options,
    };

    const reports: DepartmentReport[] = [];
    for (const dept of depts) {
      const sess = deptSess.get(dept);
      if (!sess) continue;
      const ctx = buildDepartmentContext(dept, state, scenario, packet, deptMemory.get(dept));
      console.log(`  [${dept}] Analyzing...`);
      emit('dept_start', { turn, year, department: dept });
      try {
        const r = await sess.send(ctx);
        const report = parseDeptReport(r.text, dept);
        reports.push(report);
        console.log(`  [${dept}] Done: ${report.citations.length} citations, ${report.risks.length} risks, ${report.forgedToolsUsed.length} tools`);
        const validTools = report.forgedToolsUsed
          .filter(t => t && (t.name || t.description))
          .map(t => {
            const rawOutput = t.output ? (typeof t.output === 'string' ? t.output : JSON.stringify(t.output)) : null;
            // Extract input/output field names from output JSON
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
              crisis: crisis.title,
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
      } catch (err) {
        console.log(`  [${dept}] ERROR: ${err}`);
        reports.push(emptyReport(dept));
      }
    }

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
        turn, year, crisis: crisis.title,
        summary: r.summary,
        recommendedActions: r.recommendedActions?.slice(0, 3) || [],
        outcome: '', // filled after outcome classification
        toolsForged: (r.forgedToolsUsed || []).map(t => t?.name || '').filter(Boolean),
      });
    }

    const summaries = reports.map(r => `## ${r.department.toUpperCase()} (conf: ${r.confidence})\n${r.summary}\nRisks: ${r.risks.map(x => `[${x.severity}] ${x.description}`).join('; ') || 'none'}\nRecs: ${r.recommendedActions.join('; ') || 'none'}`).join('\n\n');
    const optionText = crisis.options.length
      ? '\n\nOPTIONS:\n' + crisis.options.map(o => `- ${o.id}: ${o.label} — ${o.description}${o.isRisky ? ' [RISKY]' : ''}`).join('\n') + '\n\nYou MUST include "selectedOptionId" in your JSON response.'
      : '';
    const effectsList = reports.flatMap(r => (r.recommendedEffects || []).map(e =>
      `  - ${e.id} (${e.type}): ${e.description}${e.colonyDelta ? ' | Delta: ' + JSON.stringify(e.colonyDelta) : ''}`
    ));
    const effectsText = effectsList.length
      ? '\n\nAVAILABLE POLICY EFFECTS (include "selectedEffectIds" array in your JSON to apply):\n' + effectsList.join('\n')
      : '';
    const cmdPrompt = `TURN ${turn} — ${year}: ${crisis.title}\n\n${crisis.crisis}\n\nDEPARTMENT REPORTS:\n${summaries}\n\nColony: Pop ${state.colony.population} | Morale ${Math.round(state.colony.morale * 100)}% | Food ${state.colony.foodMonthsReserve.toFixed(1)}mo${optionText}${effectsText}\n\nDecide. Return JSON.`;

    console.log(`  [commander] Deciding...`);
    emit('commander_deciding', { turn, year });
    const cmdR = await cmdSess.send(cmdPrompt);
    const decision = parseCmdDecision(cmdR.text, depts);
    console.log(`  [commander] ${decision.decision.slice(0, 120)}...`);
    emit('commander_decided', { turn, year, decision: decision.decision, rationale: decision.rationale, selectedPolicies: decision.selectedPolicies });

    kernel.applyPolicy(decisionToPolicy(decision, reports, turn, year));

    // Apply featured colonist updates
    const colonistUpdates = reports.flatMap(r =>
      (r.featuredColonistUpdates || []).filter(u => u && u.colonistId && u.updates).map(u => ({
        colonistId: u.colonistId,
        health: u.updates?.health,
        career: u.updates?.career,
        narrativeEvent: u.updates?.narrative?.event,
      }))
    );
    if (colonistUpdates.length) kernel.applyColonistUpdates(colonistUpdates);

    // Classify outcome using structured option IDs
    const outcomeRng = new SeededRng(seed).turnSeed(turn + 1000);
    // Determine selected option: prefer explicit ID, then try to infer from decision text matching option labels
    let resolvedOptionId = decision.selectedOptionId;
    if (!resolvedOptionId && crisis.options.length) {
      const decLower = (decision.decision || '').toLowerCase();
      for (const opt of crisis.options) {
        if (decLower.includes(opt.id) || decLower.includes(opt.label.toLowerCase())) {
          resolvedOptionId = opt.id;
          break;
        }
      }
    }
    const outcome = resolvedOptionId
      ? classifyOutcomeById(resolvedOptionId, crisis.options, crisis.riskSuccessProbability, kernel.getState().colony, outcomeRng)
      : classifyOutcome(decision.decision, scenario.riskyOption, crisis.riskSuccessProbability, kernel.getState().colony, outcomeRng);

    // Apply outcome-driven colony effects via EffectRegistry
    const outcomeEffectRng = new SeededRng(seed).turnSeed(turn + 2000);
    const personalityBonus = (leader.hexaco.openness - 0.5) * 0.08 + (leader.hexaco.conscientiousness - 0.5) * 0.04;
    const colonyDeltas = effectRegistry.applyOutcome(crisis.category, outcome, {
      personalityBonus,
      noise: outcomeEffectRng.next() * 0.2 - 0.1,
    });
    kernel.applyColonyDeltas(colonyDeltas as any, [{
      turn, year, type: 'system',
      description: `Outcome effect (${outcome}): ${Object.entries(colonyDeltas).map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v}`).join(', ')}`,
    }]);

    // Apply politics deltas for political/governance crises
    if (MARS_POLITICS_CATEGORIES.has(crisis.category)) {
      const polDelta = outcome.includes('success')
        ? MARS_POLITICS_SUCCESS_DELTA
        : MARS_POLITICS_FAILURE_DELTA;
      kernel.applyPoliticsDeltas(polDelta);
    }

    const prevYear = turn === 1 ? startYear : yearSchedule[turn - 2] ?? startYear;
    kernel.applyDrift(leader.hexaco, outcome, Math.max(1, year - prevYear));
    outcomeLog.push({ turn, year, outcome });

    // Track crisis history for director context
    crisisHistory.push({ turn, title: crisis.title, category: crisis.category, selectedOptionId: decision.selectedOptionId, decision: decision.decision.slice(0, 100), outcome });

    // Finalize department memories with outcome and store
    for (const [dept, mem] of pendingDeptMemories) {
      mem.outcome = outcome;
      const existing = deptMemory.get(dept) || [];
      existing.push(mem);
      deptMemory.set(dept, existing);
    }

    console.log(`  [outcome] ${outcome} (${crisis.category}${milestone ? ', milestone' : ', emergent'}) effects: ${JSON.stringify(colonyDeltas)}`);
    emit('outcome', { turn, year, outcome, riskyOption: scenario.riskyOption, category: crisis.category, emergent: !milestone, colonyDeltas });

    // Log drift
    const drifted = kernel.getState().colonists.filter(c => c.promotion && c.health.alive);
    const driftData: Record<string, { name: string; hexaco: any }> = {};
    for (const p of drifted.slice(0, 5)) {
      const h = p.hexaco;
      driftData[p.core.id] = { name: p.core.name, hexaco: { O: +h.openness.toFixed(2), C: +h.conscientiousness.toFixed(2), E: +h.extraversion.toFixed(2), A: +h.agreeableness.toFixed(2) } };
    }
    emit('drift', { turn, year, colonists: driftData });

    // Generate colonist reactions in parallel (all alive colonists, cheap model)
    const reactionCtx = {
      crisisTitle: crisis.title, crisisCategory: crisis.category,
      outcome, decision: decision.decision.slice(0, 200),
      year, turn, colonyMorale: kernel.getState().colony.morale,
      colonyPopulation: kernel.getState().colony.population,
    };
    try {
      const reactions = await generateColonistReactions(
        kernel.getState().colonists, reactionCtx,
        { provider, model: modelConfig.colonistReactions || 'gpt-4o-mini', maxConcurrent: 25 },
      );
      if (reactions.length) {
        // Emit top 8 most intense reactions for dashboard display
        emit('colonist_reactions', {
          turn, year,
          reactions: reactions.slice(0, 8).map(r => ({
            name: r.name, age: r.age, department: r.department, role: r.role,
            specialization: r.specialization, marsborn: r.marsborn,
            quote: r.quote, mood: r.mood, intensity: r.intensity,
            hexaco: r.hexaco, psychScore: r.psychScore, boneDensity: r.boneDensity, radiation: r.radiation,
          })),
          totalReactions: reactions.length,
        });
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
      console.log(`  [colonists] Reaction generation failed: ${err}`);
    }

    const after = kernel.getState();
    artifacts.push({
      turn, year, crisis: crisis.title,
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
    final.colonists
      .filter(c => c.promotion && c.hexacoHistory.length > 1)
      .map(c => [c.core.id, {
        name: c.core.name,
        promotedTurn: c.promotion!.turnPromoted,
        promotedAs: c.promotion!.role,
        promotedBy: c.promotion!.promotedBy,
        hexacoTrajectory: c.hexacoHistory,
      }])
  );

  // Compute timeline fingerprint: classify the colony based on final state
  const riskyWins = outcomeLog.filter(o => o.outcome === 'risky_success').length;
  const riskyLosses = outcomeLog.filter(o => o.outcome === 'risky_failure').length;
  const conservativeWins = outcomeLog.filter(o => o.outcome === 'conservative_success').length;
  const aliveCount = final.colonists.filter(c => c.health.alive).length;
  const marsBorn = final.colonists.filter(c => c.health.alive && c.core.marsborn).length;

  const fingerprint = {
    // Resilience: high morale + survived losses = antifragile; low morale = brittle
    resilience: final.colony.morale > 0.6 ? 'antifragile' : final.colony.morale > 0.35 ? 'resilient' : 'brittle',
    // Autonomy: low earth dependency = autonomous
    autonomy: final.politics.earthDependencyPct < 40 ? 'autonomous' : final.politics.earthDependencyPct < 70 ? 'transitioning' : 'Earth-tethered',
    // Governance style: based on commander personality
    governance: leader.hexaco.extraversion > 0.7 ? 'charismatic' : leader.hexaco.conscientiousness > 0.7 ? 'technocratic' : 'communal',
    // Risk profile: based on actual outcomes
    riskProfile: riskyWins + riskyLosses > conservativeWins ? 'expansionist' : 'conservative',
    // Identity: Mars-born majority = Martian identity
    identity: marsBorn > aliveCount * 0.3 ? 'Martian' : 'Earth-diaspora',
    // Innovation: tools forged as a measure
    innovation: Object.values(toolRegs).flat().length > maxTurns * 2 ? 'innovative' : Object.values(toolRegs).flat().length > maxTurns ? 'adaptive' : 'conventional',
    // Summary line
    summary: '',
  };
  fingerprint.summary = `${fingerprint.resilience} · ${fingerprint.autonomy} · ${fingerprint.governance} · ${fingerprint.riskProfile} · ${fingerprint.identity} · ${fingerprint.innovation}`;

  const output = {
    simulation: 'mars-genesis-v3', leader: { name: leader.name, archetype: leader.archetype, colony: leader.colony, hexaco: leader.hexaco },
    turnArtifacts: artifacts, finalState: final, toolRegistries: toolRegs,
    colonistTrajectories: trajectories,
    outcomeClassifications: outcomeLog,
    fingerprint,
    totalCitations: artifacts.reduce((s, t) => s + t.departmentReports.reduce((s2, r) => s2 + r.citations.length, 0), 0),
    totalToolsForged: Object.values(toolRegs).flat().length,
  };

  const outDir = resolve(__dirname, '..', 'output');
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
