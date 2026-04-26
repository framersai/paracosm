/**
 * Implementation of `paracosm compile`. Extracted from compile.ts so
 * the subcommand router can dispatch to it without process-level side
 * effects firing on import.
 *
 * @module paracosm/cli/run-compile
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileScenario } from '../engine/compiler/index.js';
import { parseCompileCliOptions } from './compile-cli-options.js';

/**
 * Compile a scenario JSON draft. Returns a process exit code.
 */
export async function runCompile(argv: readonly string[]): Promise<number> {
  const options = parseCompileCliOptions(argv);

  if (!options.scenarioPath) {
    process.stderr.write('  Scenario JSON path required. Run `paracosm help compile` for usage.\n');
    return 1;
  }

  const jsonPath = resolve(options.scenarioPath);

  process.stdout.write(`\n  Compiling scenario: ${jsonPath}\n`);
  process.stdout.write(`  Provider: ${options.provider} | Model: ${options.model} | Cache: ${options.cache}\n`);
  if (options.seedUrl) {
    process.stdout.write(`  Seed URL: ${options.seedUrl} | Web search: ${options.webSearch} | Max searches: ${options.maxSearches ?? 5}\n`);
  } else if (options.seedText) {
    process.stdout.write(`  Seed text: ${Math.min(options.seedText.length, 160)} chars | Web search: ${options.webSearch} | Max searches: ${options.maxSearches ?? 5}\n`);
  }
  process.stdout.write('\n');

  let scenarioJson: Record<string, unknown>;
  try {
    scenarioJson = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  } catch (err) {
    process.stderr.write(`  Error reading ${jsonPath}: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  try {
    const scenario = await compileScenario(scenarioJson, {
      provider: options.provider,
      model: options.model,
      cache: options.cache,
      cacheDir: options.cacheDir,
      seedText: options.seedText,
      seedUrl: options.seedUrl,
      webSearch: options.webSearch,
      maxSearches: options.maxSearches,
      onProgress(hookName, status) {
        const icons: Record<string, string> = {
          generating: '...',
          cached: '(cached)',
          done: 'done',
          fallback: 'FALLBACK',
        };
        if (status === 'generating') {
          process.stdout.write(`  Generating ${hookName}... `);
        } else {
          process.stdout.write(`${icons[status] ?? status}\n`);
        }
      },
    });

    process.stdout.write(`\n  Scenario compiled: ${scenario.id} v${scenario.version}\n`);
    process.stdout.write(`  Departments: ${scenario.departments.map(d => d.id).join(', ')}\n`);
    const hookKeys = Object.keys(scenario.hooks).filter(k => (scenario.hooks as Record<string, unknown>)[k]);
    process.stdout.write(`  Hooks: ${hookKeys.join(', ')}\n`);
    process.stdout.write('  Ready for: runSimulation(leader, personnel, { scenario })\n\n');
    return 0;
  } catch (err) {
    process.stderr.write(`Compile failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
