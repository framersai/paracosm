/**
 * Disk cache for generated scenario hooks.
 * Stores generated hook source alongside a manifest tracking
 * the scenario hash, model used, and generation timestamp.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface CacheManifest {
  scenarioHash: string;
  model: string;
  timestamp: string;
  hooks: Record<string, string>;
}

const DEFAULT_CACHE_DIR = '.paracosm/cache';

/**
 * Bump this to invalidate all cached hook sources globally after a
 * prompt-format change. The hash folded into {@link hashScenario} so
 * a bump forces every scenario to recompile its hooks on next use.
 *
 * Version history:
 * - v1: initial format
 * - v2 (2026-04-18): milestones prompt switched from [founding, legacy]
 *   array shape to { founding, legacy } object shape for OpenAI
 *   response_format:json_object compatibility.
 */
export const COMPILE_SCHEMA_VERSION = 2;

/** SHA-256 hash of the scenario JSON, used for cache invalidation. */
export function hashScenario(scenarioJson: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(scenarioJson, null, 0))
    .update(`|v${COMPILE_SCHEMA_VERSION}`)
    .digest('hex')
    .slice(0, 16);
}

/** Build the cache directory path for a scenario + version combo. */
function cacheDir(scenarioId: string, version: string, baseDir: string): string {
  return join(baseDir, `${scenarioId}-v${version}`);
}

/** Read a cached hook result. Returns null on cache miss. */
export function readCache(
  scenarioJson: Record<string, unknown>,
  hookName: string,
  model: string,
  baseDir = DEFAULT_CACHE_DIR,
): string | null {
  const id = (scenarioJson as any).id ?? 'unknown';
  const ver = (scenarioJson as any).version ?? '0.0.0';
  const dir = cacheDir(id, ver, baseDir);
  const manifestPath = join(dir, 'manifest.json');

  if (!existsSync(manifestPath)) return null;

  try {
    const manifest: CacheManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const currentHash = hashScenario(scenarioJson);
    if (manifest.scenarioHash !== currentHash) return null;
    if (manifest.model !== model) return null;
    const hookFile = manifest.hooks[hookName];
    if (!hookFile) return null;
    const hookPath = join(dir, hookFile);
    if (!existsSync(hookPath)) return null;
    return readFileSync(hookPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Read a cached seed-ingestion bundle. Cache key includes the seed source
 * (text or URL) and the maxSearches cap so different seeds don't collide.
 * Returns null on miss or if the seed signature differs.
 */
export function readSeedBundleCache(
  scenarioJson: Record<string, unknown>,
  seedSignature: string,
  baseDir = DEFAULT_CACHE_DIR,
): unknown | null {
  const id = (scenarioJson as any).id ?? 'unknown';
  const ver = (scenarioJson as any).version ?? '0.0.0';
  const dir = cacheDir(id, ver, baseDir);
  const path = join(dir, `seed-bundle-${seedSignature}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/** Write a seed-ingestion bundle to disk cache, keyed by seed signature. */
export function writeSeedBundleCache(
  scenarioJson: Record<string, unknown>,
  seedSignature: string,
  bundle: unknown,
  baseDir = DEFAULT_CACHE_DIR,
): void {
  const id = (scenarioJson as any).id ?? 'unknown';
  const ver = (scenarioJson as any).version ?? '0.0.0';
  const dir = cacheDir(id, ver, baseDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `seed-bundle-${seedSignature}.json`),
    JSON.stringify(bundle, null, 2),
    'utf-8',
  );
}

/**
 * Compute a stable signature for a seed config. Same seed text/URL +
 * search settings → same signature. Used as the cache key so we never
 * re-ingest a previously-fetched bundle.
 */
export function seedSignature(opts: { seedText?: string; seedUrl?: string; webSearch?: boolean; maxSearches?: number }): string {
  const payload = JSON.stringify({
    text: opts.seedText ?? '',
    url: opts.seedUrl ?? '',
    web: opts.webSearch ?? true,
    n: opts.maxSearches ?? 5,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/** Write a hook result to disk cache. */
export function writeCache(
  scenarioJson: Record<string, unknown>,
  hookName: string,
  content: string,
  model: string,
  baseDir = DEFAULT_CACHE_DIR,
): void {
  const id = (scenarioJson as any).id ?? 'unknown';
  const ver = (scenarioJson as any).version ?? '0.0.0';
  const dir = cacheDir(id, ver, baseDir);
  mkdirSync(dir, { recursive: true });

  const manifestPath = join(dir, 'manifest.json');
  let manifest: CacheManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch {
    manifest = {
      scenarioHash: hashScenario(scenarioJson),
      model,
      timestamp: new Date().toISOString(),
      hooks: {},
    };
  }

  const fileName = `${hookName}.ts`;
  writeFileSync(join(dir, fileName), content, 'utf-8');
  manifest.hooks[hookName] = fileName;
  manifest.scenarioHash = hashScenario(scenarioJson);
  manifest.model = model;
  manifest.timestamp = new Date().toISOString();
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}
