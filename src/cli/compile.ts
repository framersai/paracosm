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

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
paracosm compile — Generate runtime hooks for a scenario JSON

Usage:
  npx tsx src/cli/compile.ts <scenario.json> [options]

Options:
  --provider <provider>   LLM provider: openai | anthropic (default: anthropic)
  --model <model>         Model name (default: claude-sonnet-4-6)
  --no-cache              Skip disk cache
  --cache-dir <dir>       Cache directory (default: .paracosm/cache)
  -h, --help              Show this help
`);
    process.exit(0);
  }

  const jsonPath = resolve(args[0]);
  const provider = getArg(args, '--provider') ?? 'anthropic';
  const model = getArg(args, '--model') ?? 'claude-sonnet-4-6';
  const cache = !args.includes('--no-cache');
  const cacheDir = getArg(args, '--cache-dir') ?? '.paracosm/cache';

  console.log(`\n  Compiling scenario: ${jsonPath}`);
  console.log(`  Provider: ${provider} | Model: ${model} | Cache: ${cache}\n`);

  let scenarioJson: Record<string, unknown>;
  try {
    scenarioJson = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  } catch (err) {
    console.error(`  Error reading ${jsonPath}: ${err}`);
    process.exit(1);
  }

  const scenario = await compileScenario(scenarioJson, {
    provider: provider as any,
    model,
    cache,
    cacheDir,
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

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

main().catch((err) => {
  console.error('Compile failed:', err);
  process.exit(1);
});
