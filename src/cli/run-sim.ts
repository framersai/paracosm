/**
 * Implementation of `paracosm run`. Extracted from run.ts so the
 * subcommand router can dispatch to it without process-level side
 * effects firing on import.
 *
 * @module paracosm/cli/run-sim
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runSimulation } from '../runtime/orchestrator.js';
import { parseCliRunOptions } from './cli-run-options.js';
import { DEFAULT_KEY_PERSONNEL } from './sim-config.js';
import { marsScenario } from '../engine/mars/index.js';
import { resolveLeaders, parseLeadersFlag } from './leaders-resolver.js';
import type { LeaderConfig } from './types.js';

/**
 * Load `.env` from the current working directory (CWD-scoped, not
 * package-relative). Existing process.env values always win.
 */
function loadEnv(): void {
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

function loadLeaders(argv: readonly string[]): LeaderConfig[] {
  const explicitPath = parseLeadersFlag(argv);
  try {
    const resolved = resolveLeaders({ explicitPath });
    if (resolved.isExample) {
      process.stdout.write(`  Using bundled example leaders at ${resolved.sourcePath}\n`);
      process.stdout.write('  Create config/leaders.json in your project to customize.\n\n');
    } else {
      process.stdout.write(`  Loaded ${resolved.leaders.length} leaders from ${resolved.sourcePath}\n`);
    }
    return resolved.leaders;
  } catch (err) {
    process.stderr.write(`  ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

function parseLeaderFromArgs(args: readonly string[]): Partial<LeaderConfig> {
  const leader: Partial<LeaderConfig> & { hexaco?: Partial<LeaderConfig['hexaco']> } = {};
  const hexaco: Partial<LeaderConfig['hexaco']> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--name' && next) { leader.name = next; i += 1; }
    else if (arg === '--archetype' && next) { leader.archetype = next; i += 1; }
    else if (arg === '--unit' && next) { leader.unit = next; i += 1; }
    else if (arg === '--instructions' && next) { leader.instructions = next; i += 1; }
    else if (arg === '--openness' && next) { hexaco.openness = parseFloat(next); i += 1; }
    else if (arg === '--conscientiousness' && next) { hexaco.conscientiousness = parseFloat(next); i += 1; }
    else if (arg === '--extraversion' && next) { hexaco.extraversion = parseFloat(next); i += 1; }
    else if (arg === '--agreeableness' && next) { hexaco.agreeableness = parseFloat(next); i += 1; }
    else if (arg === '--emotionality' && next) { hexaco.emotionality = parseFloat(next); i += 1; }
    else if (arg === '--honesty' && next) { hexaco.honestyHumility = parseFloat(next); i += 1; }
  }
  if (Object.keys(hexaco).length) leader.hexaco = hexaco as LeaderConfig['hexaco'];
  return leader as Partial<LeaderConfig>;
}

function getLeaderIndex(args: readonly string[]): number {
  const idx = args.indexOf('--leader');
  if (idx >= 0 && args[idx + 1]) return parseInt(args[idx + 1], 10);
  return 0;
}

/**
 * Run a simulation. Reads leaders, applies CLI overrides, calls
 * runSimulation against marsScenario by default. Returns the process
 * exit code so the caller can choose whether to call process.exit().
 */
export async function runSim(argv: readonly string[]): Promise<number> {
  loadEnv();

  const cliOptions = parseCliRunOptions(argv);
  const leaderIdx = getLeaderIndex(argv);
  const cliLeader = parseLeaderFromArgs(argv);

  const leaders = loadLeaders(argv);
  if (!leaders.length) {
    process.stderr.write('  No leaders defined in leaders.json\n');
    return 1;
  }

  const baseLeader = leaders[leaderIdx] || leaders[0];
  const leader: LeaderConfig = {
    ...baseLeader,
    ...cliLeader,
    hexaco: { ...baseLeader.hexaco, ...(cliLeader.hexaco || {}) },
  };

  if (cliLeader.name && !cliLeader.instructions) {
    leader.instructions = `You are Commander ${leader.name}. ${leader.archetype}. Respond with JSON.`;
  }

  process.stdout.write(`\n  Leader: ${leader.name} (${leader.archetype}): ${leader.unit}\n`);
  process.stdout.write(`  HEXACO: O=${leader.hexaco.openness} C=${leader.hexaco.conscientiousness} E=${leader.hexaco.extraversion}\n`);

  try {
    await runSimulation(leader, DEFAULT_KEY_PERSONNEL, {
      seed: 950,
      ...cliOptions,
      scenario: marsScenario,
    });
    return 0;
  } catch (err) {
    process.stderr.write(`Simulation failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    return 1;
  }
}
