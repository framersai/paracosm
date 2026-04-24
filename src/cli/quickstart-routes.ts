/**
 * Quickstart HTTP routes (Tier 5 onboarding). Three endpoints:
 *
 * - `POST /api/quickstart/fetch-seed`: URL -> extracted main text + title.
 * - `POST /api/quickstart/compile-from-seed`: seedText -> compiled ScenarioPackage.
 * - `POST /api/quickstart/generate-leaders`: scenarioId -> LeaderConfig[].
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
import { generateQuickstartLeaders } from '../runtime/world-model/index.js';
import type { ScenarioPackage } from '../engine/types.js';

const FetchSeedSchema = z.object({
  url: z.string().url().max(2048),
});

const CompileFromSeedSchema = z.object({
  seedText: z.string().min(200).max(50_000),
  domainHint: z.string().max(80).optional(),
  sourceUrl: z.string().url().max(2048).optional(),
});

const GenerateLeadersSchema = z.object({
  scenarioId: z.string().min(3).max(64),
  count: z.number().int().min(2).max(6).default(3),
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

export async function handleGenerateLeaders(
  _req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  deps: QuickstartDeps,
): Promise<void> {
  const parsed = GenerateLeadersSchema.safeParse(body);
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
    const leaders = await generateQuickstartLeaders(scenario, parsed.data.count, {
      provider: deps.defaultProvider,
      model: deps.defaultModel,
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ leaders }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Leader generation failed: ${String(err)}` }));
  }
}
