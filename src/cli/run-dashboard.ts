/**
 * Implementation of `paracosm dashboard`. Extracted from serve.ts so
 * the subcommand router can dispatch to it without process-level side
 * effects firing on import.
 *
 * @module paracosm/cli/run-dashboard
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMarsServer } from './server-app.js';
import { normalizeSimulationConfig } from './sim-config.js';
import { parseCliRunOptions } from './cli-run-options.js';
import { resolveLeaders, parseLeadersFlag } from './leaders-resolver.js';
import type { LeaderConfig } from './types.js';

function loadEnvFromCwd(): void {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  let loaded = 0;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.+?)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
      loaded += 1;
    }
  }
  if (loaded > 0) {
    process.stdout.write(`  [env] loaded ${loaded} var${loaded === 1 ? '' : 's'} from ${envPath}\n`);
  }
}

/**
 * Boot the SSE dashboard. Returns a Promise that never resolves while
 * the server is listening (the dashboard runs until the user kills the
 * process). When `argv` includes a positional turn count, the dashboard
 * auto-launches a simulation on boot; otherwise it waits for setup
 * via /sim?tab=settings.
 */
export async function runDashboard(argv: readonly string[]): Promise<number> {
  loadEnvFromCwd();

  const PORT = parseInt(process.env.PORT || '3456', 10);
  const server = createMarsServer({ env: process.env });
  const cliOptions = parseCliRunOptions(argv);

  await new Promise<void>((resolveServer) => {
    server.listen(PORT, () => {
      process.stdout.write(`\n  Paracosm dashboard: http://localhost:${PORT}\n`);
      process.stdout.write(`  Settings route:     http://localhost:${PORT}/sim?tab=settings\n`);
      process.stdout.write(`  SSE endpoint:       http://localhost:${PORT}/events\n\n`);
      resolveServer();
    });
  });

  if (!cliOptions.maxTurns) {
    process.stdout.write('  Waiting for setup at /sim?tab=settings or /setup. No simulation started yet.\n');
    return 0;
  }

  const explicitPath = parseLeadersFlag(argv);
  let leaders: LeaderConfig[];
  try {
    const resolved = resolveLeaders({ explicitPath });
    leaders = resolved.leaders;
    if (resolved.isExample) {
      process.stdout.write(`  Using bundled example leaders at ${resolved.sourcePath}\n`);
      process.stdout.write('  Create config/leaders.json in your project to customize.\n');
    } else {
      process.stdout.write(`  Loaded ${leaders.length} leaders from ${resolved.sourcePath}\n`);
    }
  } catch (err) {
    process.stderr.write(`  ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  const simConfig = normalizeSimulationConfig({
    leaders,
    turns: cliOptions.maxTurns,
    seed: cliOptions.seed,
    startTime: cliOptions.startTime,
    liveSearch: cliOptions.liveSearch,
    provider: cliOptions.provider,
    models: cliOptions.models,
  });

  await server.startWithConfig(simConfig);
  process.stdout.write(`\n  Simulations complete. Dashboard at http://localhost:${PORT}\n`);
  process.stdout.write(`  Run again at http://localhost:${PORT}/sim?tab=settings\n\n`);
  return 0;
}
