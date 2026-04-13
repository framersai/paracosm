/**
 * Mars Genesis: General-purpose standalone simulation runner.
 *
 * Reads leader configs from leaders.json. CLI flags override any field.
 *
 * Usage:
 *   npx tsx src/run.ts --leader 0           # Leader A from leaders.json
 *   npx tsx src/run.ts --leader 1 5         # Leader B, 5 turns
 *   npx tsx src/run.ts --leader 0 --live    # Leader A with live web search
 *   npx tsx src/run.ts --name "Custom" --openness 0.8 3  # Override fields
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSimulation } from './agents/orchestrator.js';
import { parseCliRunOptions } from './cli-run-options.js';
import { DEFAULT_KEY_PERSONNEL } from './sim-config.js';
import { marsScenario } from './engine/mars/index.js';
import type { LeaderConfig } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const match = line.match(/^\s*([^#=]+?)\s*=\s*(.+?)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  }
}

function loadLeaders(): LeaderConfig[] {
  const jsonPath = resolve(__dirname, '..', 'leaders.json');
  if (!existsSync(jsonPath)) {
    console.error(`  leaders.json not found at ${jsonPath}`);
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  return data.leaders || [];
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

const leaders = loadLeaders();
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
