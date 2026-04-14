#!/usr/bin/env node
/**
 * CLI: Compile a scenario JSON into a runnable ScenarioPackage.
 *
 * Usage:
 *   npx tsx src/cli/compile.ts scenarios/submarine.json
 *   npx tsx src/cli/compile.ts scenarios/submarine.json --provider anthropic --model claude-sonnet-4-6
 *   npx tsx src/cli/compile.ts scenarios/submarine.json --no-cache
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileScenario } from '../engine/compiler/index.js';
import { parseCompileCliOptions } from './compile-cli-options.js';

async function main() {
  const rawArgs = process.argv.slice(2);
  const options = parseCompileCliOptions(rawArgs);

  if (rawArgs.length === 0 || rawArgs.includes('--help') || rawArgs.includes('-h')) {
    console.log(`
paracosm compile — Generate runtime hooks for a scenario JSON

Usage:
  npx tsx src/cli/compile.ts <scenario.json> [options]

Options:
  --provider <provider>   LLM provider: openai | anthropic (default: anthropic)
  --model <model>         Model name (default: claude-sonnet-4-6)
  --no-cache              Skip disk cache
  --cache-dir <dir>       Cache directory (default: .paracosm/cache)
  --seed-text <text>      Seed scenario knowledge from inline text before hook generation
  --seed-url <url>        Seed scenario knowledge from a URL before hook generation
  --no-web-search         Skip live citation grounding during seed ingestion
  --max-searches <n>      Cap the number of live grounding searches during seed ingestion
  -h, --help              Show this help
`);
    process.exit(0);
  }

  if (!options.scenarioPath) {
    console.error('  Scenario JSON path required. Run with --help for usage.');
    process.exit(1);
  }

  const jsonPath = resolve(options.scenarioPath);

  console.log(`\n  Compiling scenario: ${jsonPath}`);
  console.log(`  Provider: ${options.provider} | Model: ${options.model} | Cache: ${options.cache}`);
  if (options.seedUrl) {
    console.log(`  Seed URL: ${options.seedUrl} | Web search: ${options.webSearch} | Max searches: ${options.maxSearches ?? 5}`);
  } else if (options.seedText) {
    console.log(`  Seed text: ${Math.min(options.seedText.length, 160)} chars | Web search: ${options.webSearch} | Max searches: ${options.maxSearches ?? 5}`);
  }
  console.log();

  let scenarioJson: Record<string, unknown>;
  try {
    scenarioJson = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  } catch (err) {
    console.error(`  Error reading ${jsonPath}: ${err}`);
    process.exit(1);
  }

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
        console.log(icons[status] ?? status);
      }
    },
  });

  console.log(`\n  Scenario compiled: ${scenario.id} v${scenario.version}`);
  console.log(`  Departments: ${scenario.departments.map(d => d.id).join(', ')}`);
  console.log(`  Hooks: ${Object.keys(scenario.hooks).filter(k => (scenario.hooks as any)[k]).join(', ')}`);
  console.log(`  Ready for: runSimulation(leader, personnel, { scenario })\n`);
}

main().catch((err) => {
  console.error('Compile failed:', err);
  process.exit(1);
});
