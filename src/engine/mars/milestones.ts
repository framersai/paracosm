/**
 * Mars crisis milestones: fixed narrative anchors for turn 1 and the final turn.
 * Extracted from agents/director.ts getMilestoneCrisis and research/scenarios.ts.
 */

import type { CrisisOption } from '../../agents/contracts.js';

export interface MilestoneCrisis {
  title: string;
  crisis: string;
  options: CrisisOption[];
  riskyOptionId: string;
  riskSuccessProbability: number;
  category: string;
  researchKeywords: string[];
  relevantDepartments: string[];
  turnSummary: string;
}

const LANDFALL: MilestoneCrisis = {
  title: 'Landfall',
  crisis: `Your colony ship has entered Mars orbit. You must choose a landing site for the first permanent settlement. Two candidates:

OPTION A: Arcadia Planitia \u2014 flat basalt plains at 47\u00b0N. Stable terrain, minimal landslide risk, access to subsurface ice deposits detected by Mars Express MARSIS radar. Geologically unremarkable.

OPTION B: Valles Marineris rim \u2014 edge of the 4,000 km canyon system at 14\u00b0S. Exposed geological strata spanning 3.5 billion years. Rich mineral diversity detected by CRISM. Significant terrain hazards: slopes up to 30\u00b0, rockfall risk, and 2km elevation changes within the operational zone.

Both sites receive similar solar irradiance. Surface radiation at either site: approximately 0.67 mSv/day per Curiosity RAD measurements.

Research the real science of Mars landing site selection and make your decision.`,
  options: [
    { id: 'option_a', label: 'Arcadia Planitia', description: 'Flat basalt plains, safe, ice access', isRisky: false },
    { id: 'option_b', label: 'Valles Marineris rim', description: 'Canyon rim, mineral rich, hazardous terrain', isRisky: true },
  ],
  riskyOptionId: 'option_b',
  riskSuccessProbability: 0.65,
  category: 'infrastructure',
  researchKeywords: ['Mars landing site selection', 'Arcadia Planitia geology', 'Valles Marineris mineralogy', 'Mars surface radiation Curiosity RAD'],
  relevantDepartments: ['medical', 'engineering'],
  turnSummary: 'Colony ship in orbit. Safe plains or mineral-rich canyon rim: the first decision shapes everything.',
};

const LEGACY_ASSESSMENT: MilestoneCrisis = {
  title: 'Legacy Assessment',
  crisis: `Earth requests a comprehensive status report on your colony:

1. POPULATION: Current count, birth rate, death rate, immigration status
2. INFRASTRUCTURE: Number of modules, total pressurized volume, power generation
3. SELF-SUFFICIENCY: Percentage of needs met without Earth supply ships
4. SCIENCE: Major discoveries, papers published, unique knowledge created
5. CULTURE: What kind of society did you build? What values define your colony?
6. REGRETS: What would you do differently if you could start over?
7. TOOLS BUILT: Review every tool you forged during this simulation. Which were most valuable?
8. LEGACY: What will your colony look like in another 50 years?

Be honest. Your personality shapes your assessment.`,
  options: [
    { id: 'option_a', label: 'Honest assessment', description: 'Report factually, including failures and regrets', isRisky: false },
    { id: 'option_b', label: 'Ambitious projection', description: 'Emphasize achievements, propose bold next-century vision', isRisky: true },
  ],
  riskyOptionId: 'option_b',
  riskSuccessProbability: 0.5,
  category: 'political',
  researchKeywords: ['Mars colony long-term projections'],
  relevantDepartments: ['governance', 'psychology', 'medical', 'engineering'],
  turnSummary: 'Earth demands a full status report. The commander must decide: honest accounting of failures, or bold vision for the next century.',
};

/** Map of turn number -> milestone crisis */
export const MARS_MILESTONES = new Map<number, MilestoneCrisis>([
  [1, LANDFALL],
  [12, LEGACY_ASSESSMENT],
]);

/**
 * Get a milestone crisis for a given turn.
 * Turn 1 is always Landfall. The final turn (maxTurns) is always Legacy Assessment.
 * Returns null for non-milestone turns.
 */
export function getMarsMilestoneCrisis(turn: number, maxTurns: number): MilestoneCrisis | null {
  if (turn === 1) return LANDFALL;
  if (turn === maxTurns) return LEGACY_ASSESSMENT;
  return null;
}
