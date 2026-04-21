#!/usr/bin/env node
/**
 * Mars Genesis: General-purpose standalone simulation runner.
 *
 * Reads leader configs via `resolveLeaders` which walks a priority
 * chain: --leaders flag, $CWD/leaders.json, $CWD/config/leaders.json,
 * bundled config/leaders.json, bundled config/leaders.example.json.
 * CLI flags on top of that override individual leader fields.
 *
 * Usage:
 *   npx tsx src/run.ts --leader 0                         # Leader A
 *   npx tsx src/run.ts --leader 1 5                       # Leader B, 5 turns
 *   npx tsx src/run.ts --leader 0 --live                  # live web search
 *   npx tsx src/run.ts --name "Custom" --openness 0.8 3   # Override fields
 *   npx tsx src/run.ts --leaders ./my-leaders.json        # Custom config file
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
 * Load `.env` from the current working directory if one exists.
 *
 * The previous implementation resolved the path relative to this
 * module's own location (`__dirname/../..`), which meant:
 *
 *   - Paracosm devs cloning the repo: loaded `<repo>/.env` — desired.
 *   - npm consumers: searched `node_modules/paracosm/.env`, which is
 *     not shipped in the tarball and so never matched — fine in the
 *     normal case, but surprising if a rogue file (manual copy, dirty
 *     postinstall, tampered registry mirror) ever landed there.
 *
 * CWD-scoped is the more honest default:
 *
 *   - `paracosm-dashboard` from a project root: loads `<project>/.env`.
 *   - `paracosm-dashboard` from the paracosm repo root (dev mode):
 *     loads `<repo>/.env` because CWD matches. Same outcome as before.
 *   - `paracosm-dashboard` from anywhere else (e.g. `~/`): loads
 *     whatever `.env` sits there, which matches every other Node CLI
 *     tool's behavior and stops being silently-wrong-but-dev-friendly.
 *
 * Existing `process.env` values always win over `.env` entries so a
 * shell-exported key doesn't get clobbered by a stale file.
 *
 * Logs the source path when a file was loaded so users can audit where
 * their keys came from — addresses the "I deleted my .env but the sim
 * still runs, where is the key coming from?" surprise.
 */
function loadEnv() {
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
  if (loaded > 0) console.log(`  [env] loaded ${loaded} var${loaded === 1 ? '' : 's'} from ${envPath}`);
}

function loadLeaders(argv: readonly string[]): LeaderConfig[] {
  const explicitPath = parseLeadersFlag(argv);
  try {
    const resolved = resolveLeaders({ explicitPath });
    if (resolved.isExample) {
      console.log(`  Using bundled example leaders at ${resolved.sourcePath}`);
      console.log('  Create config/leaders.json in your project to customize.\n');
    } else {
      console.log(`  Loaded ${resolved.leaders.length} leaders from ${resolved.sourcePath}`);
    }
    return resolved.leaders;
  } catch (err) {
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

function parseLeaderFromArgs(args: string[]): Partial<LeaderConfig> {
  const leader: any = {};
  const hexaco: any = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i], next = args[i + 1];
    if (arg === '--name' && next) { leader.name = next; i++; }
    else if (arg === '--archetype' && next) { leader.archetype = next; i++; }
    else if (arg === '--colony' && next) { leader.colony = next; i++; }
    else if (arg === '--instructions' && next) { leader.instructions = next; i++; }
    else if (arg === '--openness' && next) { hexaco.openness = parseFloat(next); i++; }
    else if (arg === '--conscientiousness' && next) { hexaco.conscientiousness = parseFloat(next); i++; }
    else if (arg === '--extraversion' && next) { hexaco.extraversion = parseFloat(next); i++; }
    else if (arg === '--agreeableness' && next) { hexaco.agreeableness = parseFloat(next); i++; }
    else if (arg === '--emotionality' && next) { hexaco.emotionality = parseFloat(next); i++; }
    else if (arg === '--honesty' && next) { hexaco.honestyHumility = parseFloat(next); i++; }
  }
  if (Object.keys(hexaco).length) leader.hexaco = hexaco;
  return leader;
}

function getLeaderIndex(args: string[]): number {
  const idx = args.indexOf('--leader');
  if (idx >= 0 && args[idx + 1]) return parseInt(args[idx + 1], 10);
  return 0;
}

loadEnv();

const args = process.argv.slice(2);
const cliOptions = parseCliRunOptions(args);
const leaderIdx = getLeaderIndex(args);
const cliLeader = parseLeaderFromArgs(args);

const leaders = loadLeaders(args);
if (!leaders.length) {
  console.error('  No leaders defined in leaders.json');
  process.exit(1);
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

console.log(`\n  Leader: ${leader.name} (${leader.archetype}) — ${leader.colony}`);
console.log(`  HEXACO: O=${leader.hexaco.openness} C=${leader.hexaco.conscientiousness} E=${leader.hexaco.extraversion}`);

runSimulation(leader, DEFAULT_KEY_PERSONNEL, { seed: 950, ...cliOptions, scenario: marsScenario }).catch((err) => {
  console.error('Simulation failed:', err);
  process.exitCode = 1;
});
