/**
 * Paracosm Scenario Compiler
 *
 * Takes a raw scenario JSON (the data portion of a ScenarioPackage) and generates
 * all runtime hooks via LLM calls. Returns a complete ScenarioPackage ready to
 * pass to runSimulation().
 *
 * @example
 * ```typescript
 * import { compileScenario } from 'paracosm/compiler';
 * import { runSimulation } from 'paracosm/runtime';
 *
 * const scenario = await compileScenario(submarineJson, {
 *   provider: 'anthropic',
 *   model: 'claude-sonnet-4-6',
 * });
 *
 * const output = await runSimulation(leader, personnel, { scenario, maxTurns: 8 });
 * ```
 */

import type { ScenarioPackage, ScenarioHooks, LlmProvider } from '../types.js';
import type { CompileOptions, GenerateTextFn } from './types.js';
import { readCache, writeCache } from './cache.js';
import { generateProgressionHook, parseResponse as parseProgression } from './generate-progression.js';
import { generateDirectorInstructions } from './generate-director.js';
import { generateMilestones, parseMilestones } from './generate-milestones.js';
import { generateFingerprintHook, parseResponse as parseFingerprint } from './generate-fingerprint.js';
import { generatePoliticsHook, parseResponse as parsePolitics } from './generate-politics.js';
import { generateReactionContextHook, parseResponse as parseReactions } from './generate-reactions.js';
import { ingestSeed, ingestFromUrl } from './seed-ingestion.js';
import { generateDepartmentPromptHook, parseResponse as parsePrompts } from './generate-prompts.js';
import type { MilestoneCrisisDef } from '../types.js';

export type { CompileOptions, GenerateTextFn };
export { ingestSeed, ingestFromUrl } from './seed-ingestion.js';
export type { SeedIngestionOptions } from './seed-ingestion.js';

/** Build a default generateText function using AgentOS. */
async function buildDefaultGenerateText(provider: LlmProvider, model: string): Promise<GenerateTextFn> {
  const { generateText } = await import('@framers/agentos');
  return async (prompt: string) => {
    const result = await generateText({ provider, model, prompt });
    return result.text;
  };
}

/** Hook names in generation order. */
const HOOK_NAMES = [
  'progression',
  'director',
  'prompts',
  'milestones',
  'fingerprint',
  'politics',
  'reactions',
] as const;

/** Restore a hook from cached source text. Returns the hook assignment or null if parse fails. */
function restoreHookFromCache(hookName: string, source: string): Partial<ScenarioHooks> | null {
  try {
    switch (hookName) {
      case 'progression': {
        const fn = parseProgression(source);
        return fn ? { progressionHook: fn } : null;
      }
      case 'director': {
        const cleaned = source.trim();
        return cleaned.length > 50 ? { directorInstructions: () => cleaned } : null;
      }
      case 'prompts': {
        const fn = parsePrompts(source);
        return fn ? { departmentPromptHook: fn } : null;
      }
      case 'milestones': {
        const result = parseMilestones(source);
        if (!result) return null;
        const [founding, legacy] = result;
        return {
          getMilestoneCrisis: (turn: number, maxTurns: number): MilestoneCrisisDef | null => {
            if (turn === 1) return founding;
            if (turn === maxTurns) return legacy;
            return null;
          },
        };
      }
      case 'fingerprint': {
        const fn = parseFingerprint(source);
        return fn ? { fingerprintHook: fn } : null;
      }
      case 'politics': {
        const fn = parsePolitics(source);
        return fn ? { politicsHook: fn } : null;
      }
      case 'reactions': {
        const fn = parseReactions(source);
        return fn ? { reactionContextHook: fn } : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Compile a scenario JSON into a complete ScenarioPackage with generated hooks.
 *
 * @param scenarioJson - The data portion of a scenario (labels, departments, metrics, effects, etc.)
 * @param options - Compiler options (provider, model, cache settings)
 * @returns A complete ScenarioPackage ready for runSimulation()
 */
export async function compileScenario(
  scenarioJson: Record<string, unknown>,
  options: CompileOptions = {},
): Promise<ScenarioPackage> {
  const {
    provider = 'anthropic',
    model = 'claude-sonnet-4-6',
    cache = true,
    cacheDir = '.paracosm/cache',
    onProgress,
  } = options;

  const genText = options.generateText ?? await buildDefaultGenerateText(provider, model);
  const json = scenarioJson as Record<string, any>;
  const hooks: ScenarioHooks = {};

  // Generate each hook, using cache when available
  for (const hookName of HOOK_NAMES) {
    // Try to restore from cache first
    if (cache) {
      const cached = readCache(json, hookName, model, cacheDir);
      if (cached !== null) {
        const restored = restoreHookFromCache(hookName, cached);
        if (restored) {
          onProgress?.(hookName, 'cached');
          Object.assign(hooks, restored);
          continue;
        }
      }
    }

    onProgress?.(hookName, 'generating');

    switch (hookName) {
      case 'progression': {
        const result = await generateProgressionHook(json, genText);
        hooks.progressionHook = result.hook;
        if (cache) writeCache(json, hookName, result.source, model, cacheDir);
        break;
      }
      case 'director': {
        const result = await generateDirectorInstructions(json, genText);
        hooks.directorInstructions = result.hook;
        if (cache) writeCache(json, hookName, result.source, model, cacheDir);
        break;
      }
      case 'prompts': {
        const result = await generateDepartmentPromptHook(json, genText);
        hooks.departmentPromptHook = result.hook;
        if (cache) writeCache(json, hookName, result.source, model, cacheDir);
        break;
      }
      case 'milestones': {
        const result = await generateMilestones(json, genText);
        hooks.getMilestoneCrisis = result.hook;
        if (cache) writeCache(json, hookName, result.source, model, cacheDir);
        break;
      }
      case 'fingerprint': {
        const result = await generateFingerprintHook(json, genText);
        hooks.fingerprintHook = result.hook;
        if (cache) writeCache(json, hookName, result.source, model, cacheDir);
        break;
      }
      case 'politics': {
        const result = await generatePoliticsHook(json, genText);
        hooks.politicsHook = result.hook;
        if (cache) writeCache(json, hookName, result.source, model, cacheDir);
        break;
      }
      case 'reactions': {
        const result = await generateReactionContextHook(json, genText);
        hooks.reactionContextHook = result.hook;
        if (cache) writeCache(json, hookName, result.source, model, cacheDir);
        break;
      }
    }

    onProgress?.(hookName, 'done');
  }

  // Seed ingestion: enrich knowledge bundle from document or URL
  let knowledge = json.knowledge ?? { topics: {}, categoryMapping: {} };
  if (options.seedUrl) {
    onProgress?.('seed-ingestion', 'generating');
    const seedBundle = await ingestFromUrl(options.seedUrl, {
      generateText: genText,
      webSearch: options.webSearch ?? true,
      maxSearches: options.maxSearches ?? 5,
      onProgress: (step, status) => onProgress?.(`seed-${step}`, status === 'start' ? 'generating' : 'done'),
    });
    knowledge = mergeKnowledgeBundles(knowledge, seedBundle);
    onProgress?.('seed-ingestion', 'done');
  } else if (options.seedText) {
    onProgress?.('seed-ingestion', 'generating');
    const seedBundle = await ingestSeed(options.seedText, {
      generateText: genText,
      webSearch: options.webSearch ?? true,
      maxSearches: options.maxSearches ?? 5,
      onProgress: (step, status) => onProgress?.(`seed-${step}`, status === 'start' ? 'generating' : 'done'),
    });
    knowledge = mergeKnowledgeBundles(knowledge, seedBundle);
    onProgress?.('seed-ingestion', 'done');
  }

  // Build world schema from metrics if not already structured
  const world = json.world ?? {
    metrics: {},
    capacities: {},
    statuses: {},
    politics: {},
    environment: {},
  };

  // Build effects array
  const effects = Array.isArray(json.effects)
    ? json.effects
    : json.effects && typeof json.effects === 'object'
      ? [{ id: 'category_effects', type: 'category_outcome', label: 'Category Outcome Effects', categoryDefaults: json.effects }]
      : [];

  // Build UI definition
  const ui = {
    ...(json.ui ?? {}),
    eventRenderers: Object.fromEntries(
      (json.events ?? []).map((e: any) => [e.id, { icon: e.icon, color: e.color }])
    ),
  };

  return {
    id: json.id ?? 'compiled-scenario',
    version: json.version ?? '1.0.0',
    engineArchetype: json.engineArchetype ?? 'closed_turn_based_settlement',
    labels: json.labels ?? { name: 'Compiled Scenario', shortName: 'compiled', populationNoun: 'members', settlementNoun: 'settlement', currency: 'credits' },
    theme: json.theme ?? { primaryColor: '#6366f1', accentColor: '#818cf8', cssVariables: {} },
    setup: json.setup ?? { defaultTurns: 8, defaultSeed: 100, defaultStartYear: 2040, defaultPopulation: 50, configurableSections: ['leaders', 'departments', 'models'] },
    world,
    departments: json.departments ?? [],
    metrics: json.metrics ?? [],
    events: json.events ?? [],
    effects,
    ui,
    knowledge,
    policies: json.policies ?? {
      toolForging: { enabled: true },
      liveSearch: { enabled: false, mode: 'off' as const },
      bulletin: { enabled: true },
      characterChat: { enabled: true },
      sandbox: { timeoutMs: 10000, memoryMB: 128 },
    },
    presets: json.presets ?? [],
    hooks,
  } as ScenarioPackage;
}

/** Merge two knowledge bundles, combining topics and category mappings. */
function mergeKnowledgeBundles(
  base: { topics: Record<string, any>; categoryMapping: Record<string, string[]> },
  overlay: { topics: Record<string, any>; categoryMapping: Record<string, string[]> },
): { topics: Record<string, any>; categoryMapping: Record<string, string[]> } {
  const topics = { ...base.topics };
  for (const [key, topic] of Object.entries(overlay.topics)) {
    if (topics[key]) {
      // Merge citations into existing topic
      topics[key] = {
        ...topics[key],
        canonicalFacts: [...(topics[key].canonicalFacts || []), ...(topic.canonicalFacts || [])],
        counterpoints: [...(topics[key].counterpoints || []), ...(topic.counterpoints || [])],
      };
    } else {
      topics[key] = topic;
    }
  }

  const categoryMapping = { ...base.categoryMapping };
  for (const [cat, topicIds] of Object.entries(overlay.categoryMapping)) {
    categoryMapping[cat] = [...new Set([...(categoryMapping[cat] || []), ...topicIds])];
  }

  return { topics, categoryMapping };
}
