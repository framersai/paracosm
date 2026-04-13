/**
 * Mars Genesis: Commander Dietrich Voss — "The Engineer"
 *
 * Same colony, same colonists, same crises. Different personality, different outcomes.
 *
 * Usage:
 *   OPENAI_API_KEY=... npm run engineer
 *   OPENAI_API_KEY=... npx tsx src/run-engineer.ts 3
 *   ANTHROPIC_API_KEY=... npx tsx src/run-engineer.ts 3 --provider anthropic
 */

import { runSimulation } from './agents/orchestrator.js';
import { parseCliRunOptions } from './cli-run-options.js';
import { DEFAULT_KEY_PERSONNEL } from './sim-config.js';

const ENGINEER = {
  name: 'Dietrich Voss',
  archetype: 'The Engineer',
  colony: 'Meridian Base',
  hexaco: { openness: 0.25, conscientiousness: 0.97, extraversion: 0.3, agreeableness: 0.45, emotionality: 0.7, honestyHumility: 0.9 },
  instructions: 'You are Commander Dietrich Voss. You believe in engineering discipline and safety margins. You demand data before decisions. When departments disagree, you favor the option with lower risk. Respond with JSON.',
};

const cliOptions = parseCliRunOptions(process.argv.slice(2));

runSimulation(ENGINEER, DEFAULT_KEY_PERSONNEL, { seed: 950, ...cliOptions }).catch((err) => {
  console.error('Simulation failed:', err);
  process.exitCode = 1;
});
