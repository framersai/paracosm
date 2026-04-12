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
 */

import { runSimulation } from './agents/orchestrator.js';

const VISIONARY = {
  name: 'Aria Chen',
  archetype: 'The Visionary',
  colony: 'Ares Horizon',
  hexaco: { openness: 0.95, conscientiousness: 0.35, extraversion: 0.85, agreeableness: 0.55, emotionality: 0.3, honestyHumility: 0.65 },
  instructions: 'You are Commander Aria Chen. You believe in bold expansion and discovery. You accept calculated risks. When departments disagree, you favor the option with higher upside even if riskier. Respond with JSON.',
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

runSimulation(VISIONARY, KEY_PERSONNEL, { maxTurns, liveSearch, seed: 950 }).catch((err) => {
  console.error('Simulation failed:', err);
  process.exitCode = 1;
});
