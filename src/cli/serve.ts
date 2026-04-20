#!/usr/bin/env node
/**
 * SSE server for the Mars Genesis dashboard.
 *
 * Usage:
 *   npx tsx src/serve.ts [turns]
 *   Open http://localhost:3456/sim?tab=settings or /setup
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMarsServer } from './server-app.js';
import { normalizeSimulationConfig } from './sim-config.js';
import { parseCliRunOptions } from './cli-run-options.js';
import { resolveLeaders, parseLeadersFlag } from './leaders-resolver.js';
import type { LeaderConfig } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3456', 10);

const envPath = resolve(__dirname, '..', '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.+?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const server = createMarsServer({ env: process.env });
const cliOptions = parseCliRunOptions(process.argv.slice(2));

server.listen(PORT, async () => {
  console.log(`\n  Mars Genesis Dashboard: http://localhost:${PORT}`);
  console.log(`  Settings route: http://localhost:${PORT}/sim?tab=settings`);
  console.log(`  Setup alias: http://localhost:${PORT}/setup`);
  console.log(`  SSE endpoint: http://localhost:${PORT}/events\n`);

  if (!cliOptions.maxTurns) {
    console.log('  Waiting for setup at /sim?tab=settings or /setup. No simulation started yet.\n');
    return;
  }

  // Resolve leaders via the shared lookup chain (CLI flag → CWD
  // leaders.json → CWD config/leaders.json → package-bundled config
  // → example). Falls back gracefully so `npx paracosm-dashboard`
  // runs from a bare install.
  const explicitPath = parseLeadersFlag(process.argv.slice(2));
  let leaders: LeaderConfig[];
  try {
    const resolved = resolveLeaders({ explicitPath });
    leaders = resolved.leaders;
    if (resolved.isExample) {
      console.log(`  Using bundled example leaders at ${resolved.sourcePath}`);
      console.log('  Create config/leaders.json in your project to customize.');
    } else {
      console.log(`  Loaded ${leaders.length} leaders from ${resolved.sourcePath}`);
    }
  } catch (err) {
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const simConfig = normalizeSimulationConfig({
    leaders,
    turns: cliOptions.maxTurns,
    seed: cliOptions.seed,
    startYear: cliOptions.startYear,
    liveSearch: cliOptions.liveSearch,
    provider: cliOptions.provider,
    models: cliOptions.models,
  });

  await server.startWithConfig(simConfig);
  console.log('\n  Simulations complete. Dashboard at http://localhost:' + PORT);
  console.log('  Run again at http://localhost:' + PORT + '/sim?tab=settings\n');
});
