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

/** SHA-256 hash of the scenario JSON, used for cache invalidation. */
export function hashScenario(scenarioJson: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(scenarioJson, null, 0))
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
