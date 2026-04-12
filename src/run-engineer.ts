/**
 * Mars Genesis: Commander Dietrich Voss — "The Engineer"
 *
 * Same colony, same colonists, same crises. Different personality, different outcomes.
 *
 * Usage:
 *   OPENAI_API_KEY=... npm run engineer
 *   OPENAI_API_KEY=... npx tsx src/run-engineer.ts 3
 */

import { runSimulation } from './agents/orchestrator.js';

const ENGINEER = {
  name: 'Dietrich Voss',
  archetype: 'The Engineer',
  colony: 'Meridian Base',
  hexaco: { openness: 0.25, conscientiousness: 0.97, extraversion: 0.3, agreeableness: 0.45, emotionality: 0.7, honestyHumility: 0.9 },
  instructions: 'You are Commander Dietrich Voss. You believe in engineering discipline and safety margins. You demand data before decisions. When departments disagree, you favor the option with lower risk. Respond with JSON.',
};

const KEY_PERSONNEL = [
  { name: 'Dr. Yuki Tanaka', department: 'medical' as const, role: 'Chief Medical Officer', specialization: 'Radiation Medicine', age: 38, featured: true },
  { name: 'Erik Lindqvist', department: 'engineering' as const, role: 'Chief Engineer', specialization: 'Structural Engineering', age: 45, featured: true },
  { name: 'Amara Osei', department: 'agriculture' as const, role: 'Head of Agriculture', specialization: 'Hydroponics', age: 34, featured: true },
  { name: 'Dr. Priya Singh', department: 'psychology' as const, role: 'Colony Psychologist', specialization: 'Clinical Psychology', age: 41, featured: true },
  { name: 'Carlos Fernandez', department: 'science' as const, role: 'Chief Scientist', specialization: 'Geology', age: 50, featured: true },
];

const maxTurns = process.argv[2] ? parseInt(process.argv[2], 10) : undefined;
const liveSearch = process.argv.includes('--live');

runSimulation(ENGINEER, KEY_PERSONNEL, { maxTurns, liveSearch, seed: 950 }).catch((err) => {
  console.error('Simulation failed:', err);
  process.exitCode = 1;
});
