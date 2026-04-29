/**
 * Quickstart HTTP routes (Tier 5 onboarding). Three endpoints:
 *
 * - `POST /api/quickstart/fetch-seed`: URL -> extracted main text + title.
 * - `POST /api/quickstart/compile-from-seed`: seedText -> compiled ScenarioPackage.
 * - `POST /api/quickstart/generate-actors`: scenarioId -> ActorConfig[].
 *
 * Each is stateless except for the compiled-scenario install: a
 * successful `compile-from-seed` installs the result as the active
 * scenario so the subsequent `/setup` POST runs it. Routes are
 * extracted from `server-app.ts` for unit-test isolation.
 *
 * @module paracosm/cli/quickstart-routes
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { compileFromSeed } from '../engine/compiler/compile-from-seed.js';
import { generateQuickstartActors } from '../runtime/world-model/index.js';
import type { ScenarioPackage } from '../engine/types.js';
import { groundScenario, type GroundingResult } from './server/deep-research.js';

const FetchSeedSchema = z.object({
  url: z.string().url().max(2048),
});

const CompileFromSeedSchema = z.object({
  seedText: z.string().min(200).max(50_000),
  domainHint: z.string().max(80).optional(),
  sourceUrl: z.string().url().max(2048).optional(),
  // Number of parallel actors to generate + run. Default 3; max 50.
  // Threaded into generate-actors + the subsequent /setup batch path.
  // The compiler ignores it; only the dashboard reads it back.
  actorCount: z.number().int().min(1).max(50).optional(),
});

const GenerateActorsSchema = z.object({
  scenarioId: z.string().min(3).max(64),
  // Max 50 actors per bundle. Each actor is ~$0.30 LLM spend; the
  // SeedInput cost preview surfaces this so users opt in consciously.
  count: z.number().int().min(2).max(50).default(3),
});

const GroundScenarioSchema = z.object({
  scenarioId: z.string().min(3).max(64),
});

export interface QuickstartDeps {
  /** Installs a compiled scenario as the active scenario. */
  setActiveScenario: (scenario: ScenarioPackage) => void;
  /** Resolves an in-memory scenario id against the server catalog. */
  getScenarioById: (id: string) => ScenarioPackage | undefined;
  /** Fetches a URL's main text content. Returns `{text, title, sourceUrl}`. */
  fetchSeedFromUrl: (url: string) => Promise<{ text: string; title: string; sourceUrl: string }>;
  /** Default provider + model for the LLM calls. */
  defaultProvider: string;
  defaultModel: string;
  /** Stash deep-research citations keyed by scenario id. Optional so
   *  legacy callers (older test fixtures) don't have to construct the
   *  full record. The grounding route is the only writer; future
   *  actor-generation prompts can read via a sibling helper. */
  recordGroundingCitations?: (
    scenarioId: string,
    citations: Array<{ query: string; sources: Array<{ title: string; link: string; domain: string }> }>,
  ) => void;
}

export async function handleFetchSeed(
  _req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  deps: QuickstartDeps,
): Promise<void> {
  const parsed = FetchSeedSchema.safeParse(body);
  if (!parsed.success) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid URL', issues: parsed.error.issues.slice(0, 3).map(i => i.message) }));
    return;
  }
  const { url } = parsed.data;
  let scheme: string;
  try {
    scheme = new URL(url).protocol;
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid URL' }));
    return;
  }
  if (scheme !== 'http:' && scheme !== 'https:') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Unsupported URL scheme: ${scheme}. Use http or https.` }));
    return;
  }
  try {
    const { text, title, sourceUrl } = await deps.fetchSeedFromUrl(url);
    const truncated = text.length > 50_000;
    const finalText = truncated ? text.slice(0, 50_000) : text;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ text: finalText, title, sourceUrl, truncated }));
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Failed to fetch URL: ${String(err)}` }));
  }
}

export async function handleCompileFromSeed(
  _req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  deps: QuickstartDeps,
): Promise<void> {
  const parsed = CompileFromSeedSchema.safeParse(body);
  if (!parsed.success) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Invalid compile-from-seed payload',
      issues: parsed.error.issues.slice(0, 5).map(i => i.message),
    }));
    return;
  }
  try {
    const scenario = await compileFromSeed(parsed.data, {
      draftProvider: deps.defaultProvider,
      draftModel: deps.defaultModel,
    });
    deps.setActiveScenario(scenario);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ scenario, scenarioId: scenario.id }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Compile failed: ${String(err)}` }));
  }
}

export async function handleGenerateActors(
  _req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  deps: QuickstartDeps,
): Promise<void> {
  const parsed = GenerateActorsSchema.safeParse(body);
  if (!parsed.success) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.issues.slice(0, 3).map(i => i.message) }));
    return;
  }
  const scenario = deps.getScenarioById(parsed.data.scenarioId);
  if (!scenario) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Scenario '${parsed.data.scenarioId}' not found. Compile it via /api/quickstart/compile-from-seed first.` }));
    return;
  }
  try {
    const actors = await generateQuickstartActors(scenario, parsed.data.count, {
      provider: deps.defaultProvider,
      model: deps.defaultModel,
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ actors }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Actor generation failed: ${String(err)}` }));
  }
}

/**
 * POST /api/quickstart/ground-scenario
 *
 * Runs the deep-research grounding pass over a previously-compiled
 * scenario. Returns citations + the ScenarioPackage gets the same
 * citations attached to its `metadata.groundingCitations` slot so the
 * subsequent actor-generation + run prompts can reference them.
 *
 * Returns `{ skipped: true, reason }` rather than 4xx when SERPER_API_KEY
 * isn't configured — the Quickstart flow continues without grounding
 * rather than failing the whole run.
 */
export async function handleGroundScenario(
  _req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  deps: QuickstartDeps,
): Promise<void> {
  const parsed = GroundScenarioSchema.safeParse(body);
  if (!parsed.success) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.issues.slice(0, 3).map(i => i.message) }));
    return;
  }
  const scenario = deps.getScenarioById(parsed.data.scenarioId);
  if (!scenario) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Scenario '${parsed.data.scenarioId}' not found. Compile it via /api/quickstart/compile-from-seed first.` }));
    return;
  }
  try {
    const result: GroundingResult | null = await groundScenario(scenario);
    if (!result) {
      // SERPER_API_KEY missing — skip gracefully so the Quickstart UI
      // can show a single "skipped: no API key" line instead of breaking
      // the run.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ skipped: true, reason: 'SERPER_API_KEY not configured' }));
      return;
    }
    // Stash citations under the scenario id so future actor-generation
    // and narration prompts can read them. ScenarioPackage doesn't have
    // a free-form metadata slot today; this in-memory side-channel is
    // intentionally scoped to the server process so a restart drops
    // citations along with the scenario itself.
    deps.recordGroundingCitations?.(scenario.id, result.citations);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      citations: result.citations,
      totalSources: result.totalSources,
      durationMs: result.durationMs,
      emptyQueries: result.emptyQueries,
    }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Grounding failed: ${String(err)}` }));
  }
}
