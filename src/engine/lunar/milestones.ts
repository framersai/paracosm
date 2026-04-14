import type { MilestoneCrisisDef } from '../types.js';

const LANDING: MilestoneCrisisDef = {
  title: 'Lunar Arrival',
  description: 'Your crew module has entered lunar orbit. Choose a base location for the permanent outpost.',
  crisis: `Your crew module has entered lunar orbit. You must choose a base location for the permanent outpost. Two candidates:

OPTION A: Shackleton Crater Rim (south pole, 89.9°S). Near-permanent sunlight for solar power. Access to permanently shadowed craters with confirmed water ice deposits (LCROSS 2009). Challenging terrain with steep slopes.

OPTION B: Marius Hills Lava Tube. Natural radiation shielding from the intact lava tube ceiling (up to 50m of basalt). Stable thermal environment. No direct solar power access (requires nuclear or transmitted power). Limited water ice nearby.

Both sites offer access to regolith for ISRU construction. Communication with Earth is line-of-sight dependent.`,
  options: [
    { id: 'option_a', label: 'Shackleton Crater Rim', description: 'Sunlight, water ice, steep terrain', isRisky: false },
    { id: 'option_b', label: 'Marius Hills Lava Tube', description: 'Natural shielding, no solar, limited water', isRisky: true },
  ],
  riskyOptionId: 'option_b',
  riskSuccessProbability: 0.55,
  category: 'infrastructure',
  researchKeywords: ['lunar south pole base', 'Shackleton crater water ice', 'lunar lava tube habitat', 'LCROSS water discovery'],
  relevantDepartments: ['engineering', 'mining'],
  turnSummary: 'Crew in orbit. Solar-powered crater rim or radiation-shielded lava tube: the first decision defines everything.',
};

const STATUS_REPORT: MilestoneCrisisDef = {
  title: 'Mission Review',
  description: 'Earth space agencies request a comprehensive status report on your outpost.',
  crisis: `Earth space agencies request a comprehensive status report on your outpost:

1. CREW: Current headcount, rotation schedule, health status
2. INFRASTRUCTURE: Modules, pressurized volume, power generation, mining output
3. SELF-SUFFICIENCY: Water from ISRU, food production, oxygen generation
4. SCIENCE: Geological surveys, astronomical observations, technology demonstrations
5. OPERATIONS: What worked, what failed, what needs redesign
6. RECOMMENDATION: Should the outpost expand, maintain, or be re-evaluated?

Be direct. Your assessment shapes the next decade of lunar policy.`,
  options: [
    { id: 'option_a', label: 'Factual assessment', description: 'Report data accurately, flag risks', isRisky: false },
    { id: 'option_b', label: 'Expansion proposal', description: 'Advocate for major expansion based on results', isRisky: true },
  ],
  riskyOptionId: 'option_b',
  riskSuccessProbability: 0.5,
  category: 'political',
  researchKeywords: ['lunar base long-term planning', 'Artemis program sustainability'],
  relevantDepartments: ['communications', 'engineering', 'medical', 'mining'],
  turnSummary: 'Earth agencies demand a full status report. The commander must decide: honest assessment or bold expansion pitch.',
};

export function getLunarMilestoneCrisis(turn: number, maxTurns: number): MilestoneCrisisDef | null {
  if (turn === 1) return LANDING;
  if (turn === maxTurns) return STATUS_REPORT;
  return null;
}
