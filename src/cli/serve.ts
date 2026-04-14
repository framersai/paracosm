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

  // Load leaders from leaders.json
  const leadersPath = resolve(__dirname, '..', '..', 'leaders.json');
  let leaders: LeaderConfig[];
  if (existsSync(leadersPath)) {
    leaders = JSON.parse(readFileSync(leadersPath, 'utf-8')).leaders;
    console.log(`  Loaded ${leaders.length} leaders from leaders.json`);
  } else {
    console.log('  leaders.json not found, using defaults');
    leaders = [
      { name: 'Aria Chen', archetype: 'The Visionary', colony: 'Ares Horizon', hexaco: { openness: 0.95, conscientiousness: 0.35, extraversion: 0.85, agreeableness: 0.55, emotionality: 0.3, honestyHumility: 0.65 }, instructions: 'You are Commander Aria Chen. Bold expansion, calculated risks. Favor higher upside. Respond with JSON.' },
      { name: 'Dietrich Voss', archetype: 'The Engineer', colony: 'Meridian Base', hexaco: { openness: 0.25, conscientiousness: 0.97, extraversion: 0.3, agreeableness: 0.45, emotionality: 0.7, honestyHumility: 0.9 }, instructions: 'You are Commander Dietrich Voss. Engineering discipline, safety margins. Favor lower risk. Respond with JSON.' },
    ];
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
