/**
 * Emergent-tool forge + judge wiring, extracted from orchestrator.ts.
 *
 * The orchestrator needs three things to let department agents forge
 * tools at runtime:
 *   1. A shared web_search tool (multi-provider fusion + reranking)
 *   2. An EmergentCapabilityEngine (forge pipeline + judge)
 *   3. A per-dept wrapper around forge_tool that captures every attempt
 *      into a run-level ledger so the UI can show reality, not just
 *      whatever the LLM self-reports.
 *
 * All three are standalone and pure — they take their collaborators via
 * arguments and return values. Pulling them out of orchestrator.ts drops
 * ~360 lines from the god file and makes the forge machinery testable
 * without spinning up a full simulation run.
 *
 * @module paracosm/runtime/emergent-setup
 */

import type { ITool } from '@framers/agentos';
import {
  EmergentCapabilityEngine, EmergentJudge, EmergentToolRegistry,
  ComposableToolBuilder, SandboxedToolForge, ForgeToolMetaTool, generateText,
  type EmergentTool,
} from '@framers/agentos';
import { DEFAULT_EXECUTION, type SimulationExecutionConfig } from '../cli/sim-config.js';
import type { LlmProvider } from '../engine/types.js';

// ---------------------------------------------------------------------------
// Web search tool
// ---------------------------------------------------------------------------

/**
 * Multi-provider web search tool exposed to every department agent.
 *
 * Tries AgentOS WebSearchService first (Serper, Tavily, Firecrawl, Brave
 * with RRF fusion and optional Cohere rerank). Falls back to a direct
 * Serper call when the fusion service is unavailable. Missing keys
 * return a clean error payload instead of throwing.
 */
export const webSearchTool: ITool = {
  id: 'tool.web_search', name: 'web_search', displayName: 'Multi-Provider Web Search',
  description: 'Search for scientific papers, NASA data, and Mars research using AgentOS WebSearchService with multi-provider fusion (Serper, Tavily, Firecrawl, Brave) and Cohere neural reranking.',
  inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  hasSideEffects: false,
  async execute(args: Record<string, unknown>) {
    const query = String(args.query || '');
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
      // Fallback: direct Serper when the fusion service isn't available.
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
// Emergent engine factory
// ---------------------------------------------------------------------------

/**
 * Create the emergent capability engine wired to AgentOS's forge + judge.
 *
 * @param toolMap Registry of built-in tools (web_search, etc.) that forged
 *        tools can compose against via the ComposableToolBuilder.
 * @param provider LLM provider for judge calls (openai | anthropic).
 * @param judgeModel Model ID used for judge reviews. Defaults in
 *        sim-config.ts keep this cheap — the judge runs once per forge
 *        (dozens per run) so flagship-model pricing here dominates total
 *        cost.
 * @param execution Runtime limits (sandbox timeout / memory).
 * @param onUsage Optional callback invoked after every judge LLM call so
 *        the orchestrator can fold judge spend into run-wide cost
 *        telemetry. Without this, judge costs (often 30-50% of total run
 *        spend) were invisible to `runSimulation()`'s returned `cost`.
 * @param onProviderError Optional callback invoked when the judge's LLM
 *        call throws. Forwards to the run-level provider-error
 *        classifier so quota/auth failures get reported the same way as
 *        any other call site.
 */
export function createEmergentEngine(
  toolMap: Map<string, ITool>,
  provider: LlmProvider,
  judgeModel: string,
  execution: Partial<SimulationExecutionConfig> = {},
  onUsage?: (result: { usage?: { totalTokens?: number; promptTokens?: number; completionTokens?: number; costUSD?: number } }) => void,
  onProviderError?: (err: unknown) => void,
  /**
   * Shared map that receives every approved forged tool's executable.
   * The orchestrator threads this into createCallForgedTool() so dept
   * agents in later turns can actually CALL a previously-forged tool
   * (rather than only cite it by name). Populated via the engine's
   * onToolForged callback; the same map is read by the meta-tool.
   */
  forgedExecutables?: Map<string, ITool>,
) {
  const llmCb = async (model: string, prompt: string) => {
    try {
      const r = await generateText({ provider, model: model || judgeModel, prompt });
      onUsage?.(r);
      return r.text;
    } catch (err) {
      onProviderError?.(err);
      throw err;
    }
  };
  // Structured callback with cacheable system block. Judge's stable
  // rubric (~500 tokens) lands in the system slot with cacheBreakpoint:
  // true, so on Anthropic the second judge call onward reads cached
  // tokens at 10% of input rate. OpenAI auto-caches prompts >= 1024
  // tokens so the same savings apply. Typical run saves ~25% of judge
  // spend.
  const llmCbWithSystem = async (model: string, system: string, user: string) => {
    try {
      const r = await generateText({
        provider,
        model: model || judgeModel,
        system: [{ text: system, cacheBreakpoint: true }],
        prompt: user,
      });
      onUsage?.(r);
      return r.text;
    } catch (err) {
      onProviderError?.(err);
      throw err;
    }
  };

  // Session-tier tool limit. The registry was previously constructed
  // without the config so it fell through to DEFAULT_EMERGENT_CONFIG's
  // value of 10. That limit was reached by turn 3 in a 5-department
  // run (5 depts × ~2 tools each = 10) and every subsequent forge
  // failed with "Session tool limit reached". 50 comfortably fits
  // 5 depts × 6 turns × ~1.5 unique tools each ≈ 45 with headroom for
  // re-forges and composition wrappers.
  const SESSION_TOOL_LIMIT = 50;
  const AGENT_TOOL_LIMIT = 50;

  const registry = new EmergentToolRegistry({
    maxSessionTools: SESSION_TOOL_LIMIT,
    maxAgentTools: AGENT_TOOL_LIMIT,
  });
  // EmergentJudgeConfig accepts an optional `generateTextWithSystem`
  // callback for prompt caching. The installed @framers/agentos may
  // predate that field (monorepo adds it, npm publish is separate);
  // the any-cast lets the cached path activate today and TS tightens
  // automatically once the new version lands in node_modules.
  const judgeConfig = {
    judgeModel,
    promotionModel: judgeModel,
    generateText: llmCb,
    generateTextWithSystem: llmCbWithSystem,
  } as unknown as ConstructorParameters<typeof EmergentJudge>[0];
  const judge = new EmergentJudge(judgeConfig);
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
    // Capture every approved forged tool's executable into the shared
    // map so the call_forged_tool meta-tool can dispatch to it in
    // later turns. Without this, forged tools were citable but not
    // callable — the LLM had no path to produce fresh output from an
    // existing tool other than re-forging it.
    onToolForged: forgedExecutables
      ? async (tool: EmergentTool, executable: ITool) => {
          forgedExecutables.set(tool.name, executable);
        }
      : undefined,
  });
  return { engine, forgeTool: new ForgeToolMetaTool(engine) };
}

// ---------------------------------------------------------------------------
// call_forged_tool meta-tool
// ---------------------------------------------------------------------------

/**
 * Returns an ITool that lets dept agents execute a previously-forged
 * tool by name. Closes over the `forgedExecutables` map populated by
 * `createEmergentEngine`'s `onToolForged` callback, so tools forged in
 * turn 1 are callable by any department in turns 2+ at no forge cost.
 *
 * Without this meta-tool, the dept LLM could only cite a tool by name
 * in its JSON report (no real execution) or re-invoke `forge_tool`
 * with the same name (full judge review again, counted as re-forge).
 * Both are worse than just running the approved tool on new inputs.
 *
 * Dispatch is strict: unknown names return an error rather than
 * silently missing, so the LLM's JSON output reliably reflects what
 * actually happened.
 */
export function createCallForgedTool(forgedExecutables: Map<string, ITool>): ITool {
  return {
    id: 'tool.call_forged_tool',
    name: 'call_forged_tool',
    displayName: 'Call Forged Tool',
    description: 'Execute a previously-forged tool by name with new inputs. Use this instead of re-forging when an existing tool already covers your analysis. The tool name must match one listed in the ALREADY-FORGED TOOLS block of your context.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Machine-readable name of the tool to call (e.g. radiation_dose_calculator).' },
        args: { type: 'object', description: 'Input arguments for the tool. Must match the tool\'s declared inputSchema.' },
      },
      required: ['name'],
    },
    hasSideEffects: false,
    async execute(args: Record<string, unknown>, ctx: any) {
      const name = String(args.name || '').trim();
      if (!name) return { success: false, error: 'name is required' };
      const executable = forgedExecutables.get(name);
      if (!executable) {
        return {
          success: false,
          error: `Tool "${name}" not found. Available forged tools: ${[...forgedExecutables.keys()].join(', ') || '(none yet)'}`,
        };
      }
      try {
        const payload = (args.args && typeof args.args === 'object') ? args.args as Record<string, unknown> : {};
        const result = await executable.execute(payload, ctx);
        return result;
      } catch (err) {
        return { success: false, error: String(err).slice(0, 240) };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Forge wrapper
// ---------------------------------------------------------------------------

/**
 * Captured forge event — the ground-truth record of an actual forge call,
 * independent of whether the LLM remembered to self-report it in its JSON.
 */
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

/**
 * Wrap the raw forge_tool meta-tool so each department's forge attempts
 * get captured + logged + normalized before they reach the engine. LLMs
 * emit wild variety in forge_tool args (stringified JSON, wrong mode
 * spellings, missing allowlists, no code body). This wrapper fixes them
 * up so the engine never crashes deep in sandbox validation, and every
 * attempt gets recorded into the `capture` sink regardless of outcome.
 */
export function wrapForgeTool(
  raw: ForgeToolMetaTool,
  agentId: string,
  sessionId: string,
  dept: string,
  capture: (record: CapturedForge) => void,
): ITool {
  return {
    ...(raw as any),
    async execute(args: Record<string, unknown>, ctx: any) {
      const fixed = { ...args };
      for (const k of ['implementation', 'inputSchema', 'outputSchema', 'testCases']) {
        if (typeof (fixed as any)[k] === 'string') {
          try {
            (fixed as any)[k] = JSON.parse((fixed as any)[k]);
          } catch (e) {
            console.warn(`  [forge] Failed to parse ${k}:`, e);
          }
        }
      }
      // Normalize implementation. LLMs send a wide variety of mode
      // spellings and sometimes mis-label compose specs as sandbox or
      // vice versa. AgentOS's engine does a STRICT `mode === 'compose'`
      // check — anything else falls into the sandbox branch, which
      // then reads `allowlist` / `code` fields that a compose spec
      // does not carry. That path crashes with
      //   TypeError: Cannot read properties of undefined (reading 'includes')
      // inside SandboxedToolForge.validateCode. Normalize to one of
      // exactly 'sandbox' or 'compose', infer from field shape when
      // the mode string is unfamiliar, backstop every required field
      // so neither engine path can crash on malformed LLM output.
      if (fixed.implementation && typeof fixed.implementation === 'object') {
        const impl = fixed.implementation as any;
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
        if (impl.mode !== 'sandbox' && impl.mode !== 'compose') {
          if (Array.isArray(impl.steps)) impl.mode = 'compose';
          else if (typeof impl.code === 'string') impl.mode = 'sandbox';
          else impl.mode = 'sandbox';
        }
        if (impl.mode === 'sandbox') {
          if (!Array.isArray(impl.allowlist)) impl.allowlist = [];
          if (impl.code != null && typeof impl.code !== 'string') impl.code = String(impl.code);
          if (!impl.code || typeof impl.code !== 'string') {
            impl.code = 'function execute(input) { return { error: "No code provided in forge request" }; }';
          }
          if (!impl.code.includes('function execute')) {
            impl.code = `function execute(input) {\n${impl.code}\n}`;
          }
        } else if (impl.mode === 'compose') {
          if (!Array.isArray(impl.steps)) impl.steps = [];
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
      if (!fixed.inputSchema || typeof fixed.inputSchema !== 'object') {
        fixed.inputSchema = { type: 'object', additionalProperties: true };
      }
      if (!fixed.outputSchema || typeof fixed.outputSchema !== 'object') {
        fixed.outputSchema = { type: 'object', additionalProperties: true };
      }
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
        // Judge confidence is the judge's score for whether the tool
        // is safe + correct. When the judge fails the forge, its
        // confidence is in REJECTING the tool; surfacing that as the
        // tool's own quality score is misleading. So:
        //   approved → use judge confidence if provided, else 0.85
        //   rejected → confidence is 0 (not accepted at all)
        const judgeConfidence = typeof verdict.confidence === 'number' ? verdict.confidence : null;
        const confidence = r.success ? (judgeConfidence ?? 0.85) : 0;
        const errorReason = !r.success
          ? String(r.error || verdict.reasoning || out?.error || '').slice(0, 240)
          : undefined;
        if (r.success) {
          console.log(`    🔧 [${dept}] ✓ "${toolName}" approved (conf ${confidence.toFixed(2)})`);
        } else {
          console.log(`    🔧 [${dept}] ✗ "${toolName}" — ${errorReason}`);
        }
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
