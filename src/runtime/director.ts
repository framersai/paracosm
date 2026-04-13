/**
 * Crisis Director — generates emergent crises per timeline based on colony state.
 *
 * Replaces static SCENARIOS for turns 2-11. Turn 1 (Landfall) and the final turn
 * (Legacy Assessment) remain fixed milestones for narrative anchoring.
 */

import type { Department, HexacoProfile, TurnOutcome } from '../engine/core/state.js';
import type { CrisisOption } from './contracts.js';
import type { LlmProvider } from '../engine/types.js';
import { SCENARIOS } from './research/scenarios.js';

export type CrisisCategory =
  | 'environmental' | 'resource' | 'medical' | 'psychological'
  | 'political' | 'infrastructure' | 'social' | 'technological';

export interface DirectorCrisis {
  title: string;
  crisis: string;
  options: CrisisOption[];
  riskyOptionId: string;
  riskSuccessProbability: number;
  category: CrisisCategory;
  researchKeywords: string[];
  relevantDepartments: Department[];
  turnSummary: string;
}

export interface DirectorContext {
  turn: number;
  year: number;
  leaderName: string;
  leaderArchetype: string;
  leaderHexaco: HexacoProfile;
  colony: {
    population: number;
    morale: number;
    foodMonthsReserve: number;
    waterLitersPerDay: number;
    powerKw: number;
    infrastructureModules: number;
    lifeSupportCapacity: number;
    scienceOutput: number;
  };
  politics: {
    earthDependencyPct: number;
    governanceStatus: string;
    independencePressure: number;
  };
  aliveCount: number;
  marsBornCount: number;
  recentDeaths: number;
  recentBirths: number;
  previousCrises: Array<{
    turn: number;
    title: string;
    category: string;
    selectedOptionId?: string;
    decision?: string;
    outcome: TurnOutcome;
  }>;
  toolsForged: string[];
  driftSummary: Array<{ name: string; role: string; openness: number; conscientiousness: number }>;
  /** Key outputs from forged tools last turn, so director can generate crises that follow from computed analysis */
  recentToolOutputs: Array<{ name: string; department: string; output: string }>;
  /** Colonist mood summary from last turn */
  colonistMoodSummary?: string;
}

const DIRECTOR_INSTRUCTIONS = `You are the Crisis Director for a Mars colony simulation. You observe colony state and generate crises that test the colony's weaknesses, exploit consequences of prior decisions, and create interesting narrative tension.

RULES:
1. Each crisis has exactly 2-3 options with stable IDs (option_a, option_b, option_c)
2. Exactly one option must be marked isRisky: true (higher upside, higher downside)
3. Crises must reference real Mars science (radiation, gravity, atmosphere, psychology, politics)
4. Never repeat a crisis category from the immediately previous turn
5. Escalate: later crises should reference consequences of earlier decisions
6. Calibrate difficulty to colony state: struggling colonies get survivable crises, thriving colonies get existential ones
7. Include the colony's actual numbers in the crisis description (population, morale, food, etc.)
8. Specify which departments should analyze (2-4 departments per crisis)

CRISIS CATEGORIES:
- environmental: radiation, dust storms, seismic activity, atmospheric events
- resource: water, food, power, oxygen, materials shortage
- medical: disease, injury, bone density, radiation sickness, pandemic
- psychological: morale, isolation, generational tension, grief, burnout
- political: Earth relations, independence, governance disputes, factions
- infrastructure: habitat damage, life support failure, construction
- social: births, education, cultural identity, intergenerational conflict
- technological: equipment failure, communication, AI systems

AVAILABLE DEPARTMENTS (use ONLY these exact names in relevantDepartments):
- medical
- engineering
- agriculture
- psychology
- governance

Do NOT use any other department names. Pick 2-4 from this list.

Return ONLY valid JSON:
{"title":"Crisis Title","crisis":"Full description with specific colony numbers...","options":[{"id":"option_a","label":"Option Label","description":"What this option does","isRisky":false},{"id":"option_b","label":"Risky Option","description":"Higher upside, higher risk","isRisky":true}],"riskyOptionId":"option_b","riskSuccessProbability":0.55,"category":"environmental","researchKeywords":["mars dust storm","habitat pressure"],"relevantDepartments":["engineering","medical"],"turnSummary":"One sentence: why this crisis emerged from prior events"}`;

/** Build the prompt for the director given colony context. */
function buildDirectorPrompt(ctx: DirectorContext): string {
  const prevCrises = ctx.previousCrises.length
    ? ctx.previousCrises.map(c => `  Turn ${c.turn}: "${c.title}" (${c.category}) → ${c.outcome}${c.decision ? ': ' + c.decision.slice(0, 80) : ''}`).join('\n')
    : '  None yet (this is the first emergent turn)';

  const prevCategories = ctx.previousCrises.map(c => c.category);
  const lastCategory = prevCategories[prevCategories.length - 1] || 'none';

  return `GENERATE CRISIS FOR TURN ${ctx.turn}, YEAR ${ctx.year}

COLONY STATE:
- Commander: ${ctx.leaderName} (${ctx.leaderArchetype})
- Population: ${ctx.aliveCount} alive (${ctx.marsBornCount} Mars-born)
- Recent: +${ctx.recentBirths} births, -${ctx.recentDeaths} deaths
- Morale: ${Math.round(ctx.colony.morale * 100)}%
- Food: ${ctx.colony.foodMonthsReserve.toFixed(1)} months reserve
- Water: ${ctx.colony.waterLitersPerDay} L/day
- Power: ${ctx.colony.powerKw} kW
- Infrastructure: ${ctx.colony.infrastructureModules} modules, ${ctx.colony.lifeSupportCapacity} life support cap
- Earth dependency: ${ctx.politics.earthDependencyPct}%
- Independence pressure: ${(ctx.politics.independencePressure * 100).toFixed(0)}%
- Governance: ${ctx.politics.governanceStatus}
- Tools forged so far: ${ctx.toolsForged.length}

COMMANDER PERSONALITY (HEXACO):
O: ${ctx.leaderHexaco.openness.toFixed(2)} C: ${ctx.leaderHexaco.conscientiousness.toFixed(2)} E: ${ctx.leaderHexaco.extraversion.toFixed(2)}
A: ${ctx.leaderHexaco.agreeableness.toFixed(2)} Em: ${ctx.leaderHexaco.emotionality.toFixed(2)} HH: ${ctx.leaderHexaco.honestyHumility.toFixed(2)}

DECISION HISTORY:
${prevCrises}
${ctx.recentToolOutputs.length ? `\nTOOL INTELLIGENCE (what department agents computed last turn):\n${ctx.recentToolOutputs.slice(0, 4).map(t => `  [${t.department}] ${t.name}: ${t.output.slice(0, 120)}`).join('\n')}\nUse these findings to generate a crisis that follows from what the tools revealed.` : ''}
${ctx.colonistMoodSummary ? `\nCOLONIST MOOD: ${ctx.colonistMoodSummary}` : ''}

CONSTRAINT: Do NOT use category "${lastCategory}" (used last turn). Pick a different category.

Generate a crisis that tests this colony based on its current state, past decisions, and tool intelligence. The crisis should feel like a consequence of what happened before. Return JSON only.`;
}

/** Parse director LLM response into DirectorCrisis. */
function parseDirectorResponse(text: string): DirectorCrisis | null {
  // Try to extract JSON
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) start = i; depth++; }
    if (text[i] === '}') { depth--; if (depth === 0 && start >= 0) {
      try {
        const raw = JSON.parse(text.slice(start, i + 1));
        if (raw.title && raw.crisis && raw.options) {
          return {
            title: raw.title,
            crisis: raw.crisis,
            options: (raw.options || []).map((o: any, idx: number) => ({
              id: o.id || `option_${String.fromCharCode(97 + idx)}`,
              label: o.label || `Option ${String.fromCharCode(65 + idx)}`,
              description: o.description || '',
              isRisky: o.isRisky === true,
            })),
            riskyOptionId: raw.riskyOptionId || raw.options?.find((o: any) => o.isRisky)?.id || 'option_b',
            riskSuccessProbability: typeof raw.riskSuccessProbability === 'number' ? raw.riskSuccessProbability : 0.5,
            category: raw.category || 'infrastructure',
            researchKeywords: raw.researchKeywords || [],
            relevantDepartments: raw.relevantDepartments || ['medical', 'engineering'],
            turnSummary: raw.turnSummary || '',
          };
        }
      } catch { /* try next block */ }
      start = -1;
    }}
  }
  return null;
}

/** Fallback crises if director fails. */
const FALLBACK_CRISES: DirectorCrisis[] = [
  {
    title: 'System Malfunction',
    crisis: 'A critical life support component has developed an intermittent failure. Oxygen recycling is operating at 60% efficiency. You have 72 hours before reserves become dangerously low.',
    options: [
      { id: 'option_a', label: 'Emergency repair', description: 'Divert all engineering to immediate repair. Safe but halts all other construction for 2 weeks.', isRisky: false },
      { id: 'option_b', label: 'Improvised bypass', description: 'Build a bypass from non-standard parts. Faster but untested. Could fail catastrophically.', isRisky: true },
    ],
    riskyOptionId: 'option_b', riskSuccessProbability: 0.5, category: 'infrastructure',
    researchKeywords: ['life support failure', 'ECLSS redundancy'], relevantDepartments: ['engineering', 'medical'],
    turnSummary: 'Infrastructure strain triggered a life support component failure.',
  },
  {
    title: 'Supply Shortage',
    crisis: 'Unexpected contamination of food reserves has rendered 30% of stored rations inedible. The colony must decide how to manage the shortfall before the next harvest cycle.',
    options: [
      { id: 'option_a', label: 'Strict rationing', description: 'Reduce caloric intake by 25% colony-wide for 3 months. Morale will drop.', isRisky: false },
      { id: 'option_b', label: 'Emergency crop acceleration', description: 'Boost grow lights to 24/7, triple nutrient concentration. Could yield 2x harvest or kill the crops.', isRisky: true },
    ],
    riskyOptionId: 'option_b', riskSuccessProbability: 0.55, category: 'resource',
    researchKeywords: ['food security mars', 'hydroponic acceleration'], relevantDepartments: ['agriculture', 'medical'],
    turnSummary: 'Food contamination created an unexpected supply crisis.',
  },
  {
    title: 'Social Unrest',
    crisis: 'Tensions between work crews have escalated into a refusal to cooperate. Two factions have formed around competing visions for the colony future. Productivity has dropped 40%.',
    options: [
      { id: 'option_a', label: 'Mediation program', description: 'Mandatory conflict resolution sessions. Slow but addresses root causes.', isRisky: false },
      { id: 'option_b', label: 'Restructure work crews', description: 'Break up existing teams and reassign. Disrupts established relationships.', isRisky: true },
    ],
    riskyOptionId: 'option_b', riskSuccessProbability: 0.45, category: 'psychological',
    researchKeywords: ['group conflict isolation', 'crew cohesion'], relevantDepartments: ['psychology', 'governance'],
    turnSummary: 'Accumulated social pressure erupted into factional conflict.',
  },
];

export class CrisisDirector {
  /**
   * Generate a crisis for a specific timeline. Uses AgentOS agent() if available,
   * falls back to generateText() for simpler integration.
   */
  async generateCrisis(ctx: DirectorContext, provider: LlmProvider = 'openai', model: string = 'gpt-5.4', instructions?: string): Promise<DirectorCrisis> {
    const prompt = buildDirectorPrompt(ctx);
    const systemInstructions = instructions || DIRECTOR_INSTRUCTIONS;

    try {
      const { generateText } = await import('@framers/agentos');
      const result = await generateText({
        provider,
        model,
        prompt: systemInstructions + '\n\n' + prompt,
      });

      const crisis = parseDirectorResponse(result.text);
      if (crisis) {
        console.log(`  [director] Generated: "${crisis.title}" (${crisis.category}) for ${ctx.leaderName}`);
        return crisis;
      }
      console.log(`  [director] Failed to parse response for ${ctx.leaderName}, using fallback`);
    } catch (err) {
      console.log(`  [director] Error for ${ctx.leaderName}: ${err}`);
    }

    // Fallback
    const fallback = FALLBACK_CRISES[ctx.turn % FALLBACK_CRISES.length];
    console.log(`  [director] Using fallback: "${fallback.title}"`);
    return { ...fallback };
  }

  /**
   * Get a milestone crisis (Turn 1 or final turn).
   * These are fixed for narrative anchoring.
   */
  getMilestoneCrisis(turn: number, maxTurns: number): DirectorCrisis | null {
    if (turn === 1) {
      const s = SCENARIOS[0];
      return {
        title: s.title,
        crisis: s.crisis,
        options: s.options || [
          { id: 'option_a', label: 'Arcadia Planitia', description: 'Flat basalt plains, safe, ice access', isRisky: false },
          { id: 'option_b', label: 'Valles Marineris rim', description: 'Canyon rim, mineral rich, hazardous terrain', isRisky: true },
        ],
        riskyOptionId: 'option_b',
        riskSuccessProbability: s.riskSuccessProbability,
        category: 'infrastructure',
        researchKeywords: s.researchKeywords,
        relevantDepartments: ['medical', 'engineering'],
        turnSummary: 'Colony ship in orbit. Safe plains or mineral-rich canyon rim: the first decision shapes everything.',
      };
    }

    if (turn === maxTurns) {
      const s = SCENARIOS[11]; // Legacy Assessment
      return {
        title: s?.title || 'Legacy Assessment',
        crisis: s?.crisis || 'Earth requests a comprehensive status report on your colony. Assess your legacy.',
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
    }

    return null; // Not a milestone turn
  }
}
