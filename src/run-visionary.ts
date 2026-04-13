/**
 * Mars Genesis: Commander Aria Chen — "The Visionary"
 *
 * Multi-agent Mars colony simulation with deterministic kernel,
 * department agents, emergent tool forging, and HEXACO personality evolution.
 *
 * Usage:
 *   OPENAI_API_KEY=... npm run visionary          # full 12 turns
 *   OPENAI_API_KEY=... npm run smoke              # 3-turn test
 *   OPENAI_API_KEY=... npx tsx src/run-visionary.ts 5 --live   # 5 turns + web search
 *   ANTHROPIC_API_KEY=... npx tsx src/run-visionary.ts 5 --provider anthropic
 */

import { runSimulation } from './agents/orchestrator.js';
import { parseCliRunOptions } from './cli-run-options.js';
import { DEFAULT_KEY_PERSONNEL } from './sim-config.js';

const VISIONARY = {
  name: 'Aria Chen',
  archetype: 'The Visionary',
  colony: 'Ares Horizon',
  hexaco: { openness: 0.95, conscientiousness: 0.35, extraversion: 0.85, agreeableness: 0.55, emotionality: 0.3, honestyHumility: 0.65 },
  instructions: 'You are Commander Aria Chen. You believe in bold expansion and discovery. You accept calculated risks. When departments disagree, you favor the option with higher upside even if riskier. Respond with JSON.',
};

const cliOptions = parseCliRunOptions(process.argv.slice(2));

runSimulation(VISIONARY, DEFAULT_KEY_PERSONNEL, { seed: 950, ...cliOptions }).catch((err) => {
  console.error('Simulation failed:', err);
  process.exitCode = 1;
});
