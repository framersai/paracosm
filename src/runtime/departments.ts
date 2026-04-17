import type { Department, SimulationState, Agent } from '../engine/core/state.js';
import type { DepartmentReport, CrisisResearchPacket } from './contracts.js';
import type { Scenario } from '../engine/types.js';

export interface DepartmentConfig {
  department: Department;
  role: string;
  model: string;
  instructions: string;
}

export const DEPARTMENT_CONFIGS: DepartmentConfig[] = [
  {
    department: 'medical',
    role: 'Chief Medical Officer',
    model: 'gpt-5.4',
    instructions: `You are the Chief Medical Officer of a Mars colony. You analyze health impacts: radiation, bone density, disease, injuries, mortality risk, psychological wellbeing.

You MUST use forge_tool at least once per turn to create a computational model relevant to the crisis. For example: a radiation dose calculator, disease risk scorer, mortality probability model, or bone density projector. Your sandbox code MUST be: function execute(input) { return result; } with allowlist: [].

After forging the tool, report what it computed in forgedToolsUsed.

Return your analysis as JSON: {"department":"medical","summary":"...","citations":[{"text":"...","url":"...","context":"..."}],"risks":[{"severity":"low|medium|high|critical","description":"..."}],"opportunities":[{"impact":"low|medium|high","description":"..."}],"recommendedActions":["..."],"proposedPatches":{},"forgedToolsUsed":[{"name":"tool_name","mode":"sandbox","description":"what it does","output":{},"confidence":0.9}],"featuredAgentUpdates":[],"confidence":0.85,"openQuestions":[],"recommendedEffects":[{"id":"effect_1","type":"resource_shift|capacity_expansion|risk_mitigation|social_investment|research_bet","description":"...","colonyDelta":{"morale":0.05}}]}`,
  },
  {
    department: 'engineering',
    role: 'Chief Engineer',
    model: 'gpt-5.4',
    instructions: `You are the Chief Engineer of a Mars colony. You analyze infrastructure: habitat integrity, power, life support capacity, water systems, construction.

You MUST use forge_tool at least once per turn to create a computational model: structural load calculator, power budget analyzer, life support capacity model, or pressure integrity scorer. Sandbox code MUST be: function execute(input) { return result; } with allowlist: [].

Return JSON matching DepartmentReport schema with department "engineering". Include forgedToolsUsed with the tool output.`,
  },
  {
    department: 'agriculture',
    role: 'Head of Agriculture',
    model: 'gpt-5.4',
    instructions: `You are the Head of Agriculture for a Mars colony. You analyze food security: crop yields, soil remediation, hydroponic capacity, caloric needs, reserves.

You MUST use forge_tool at least once per turn: crop yield calculator, caloric balance model, food reserve projector, or soil quality scorer. Sandbox code MUST be: function execute(input) { return result; } with allowlist: [].

Return JSON matching DepartmentReport schema with department "agriculture". Include forgedToolsUsed.`,
  },
  {
    department: 'psychology',
    role: 'Colony Psychologist',
    model: 'gpt-5.4',
    instructions: `You are the Colony Psychologist. You analyze morale, isolation effects, depression risk, social cohesion, generational tensions.

You MUST use forge_tool at least once per turn: morale predictor, isolation burden scorer, depression risk model, or social cohesion index. Sandbox code MUST be: function execute(input) { return result; } with allowlist: [].

Return JSON matching DepartmentReport schema with department "psychology". Include forgedToolsUsed.`,
  },
  {
    department: 'governance',
    role: 'Governance Advisor',
    model: 'gpt-5.4',
    instructions: `You are the Governance Advisor. You analyze self-sufficiency, Earth dependency, political pressure, independence readiness.

You MUST use forge_tool at least once per turn: independence readiness scorer, supply dependency calculator, or governance risk model. Sandbox code MUST be: function execute(input) { return result; } with allowlist: [].

Return JSON matching DepartmentReport schema with department "governance". Include forgedToolsUsed.`,
  },
];

/** Summary of a department's previous turn for session continuity */
export interface DepartmentTurnMemory {
  turn: number;
  year: number;
  crisis: string;
  summary: string;
  recommendedActions: string[];
  outcome: string;
  toolsForged: string[];
}

export function buildDepartmentContext(
  dept: Department,
  state: SimulationState,
  scenario: Scenario,
  researchPacket: CrisisResearchPacket,
  previousTurns?: DepartmentTurnMemory[],
  departmentPromptHook?: (ctx: { department: string; state: SimulationState; scenario: Scenario; researchPacket: CrisisResearchPacket }) => string[],
): string {
  const alive = state.agents.filter(c => c.health.alive);
  const featured = alive.filter(c => c.narrative.featured);
  const deptNote = researchPacket.departmentNotes[dept] || '';

  // Inject promoted leader's evolving HEXACO profile plus the behavioural
  // cues that match THIS dept head's actual trait values. Firing cues
  // conditionally (O > 0.7 → explore more, O < 0.3 → stay with proven)
  // produces sharper asymmetry than listing every axis's high-low
  // guidance and asking the model to weight them. Earlier runs showed
  // both leaders converging on similar forge counts; conditional cues
  // steer each dept head's behaviour more directly.
  const leader = state.agents.find(c => c.promotion?.department === dept && c.health.alive);
  const hexacoBlock: string[] = [];
  if (leader) {
    const h = leader.hexaco;
    const cues: string[] = [];

    // Openness: the single strongest signal for forge-vs-reuse
    if (h.openness > 0.7) {
      cues.push('Your high openness invites exploration. When this event involves any analysis the current toolbox does not exactly cover, forge a new tool with a fresh angle or composed logic. Default to forging; reuse only when an existing tool produces EXACTLY the analysis you need unchanged.');
    } else if (h.openness < 0.3) {
      cues.push('Your low openness favours proven methods. Trust the existing toolbox. Reuse tools whenever their scope overlaps the current analysis. Forge a new tool only when an existing one would clearly mislead you on this specific event.');
    } else {
      cues.push('Your moderate openness balances reuse and forge. Prefer reusing when the existing tool fits; forge when a new angle would produce a materially different reading.');
    }

    // Conscientiousness: thoroughness + evidence standard
    if (h.conscientiousness > 0.7) {
      cues.push('Your high conscientiousness demands evidence and procedure. Your reports lead with uncertainty ranges and explicit assumptions. When forging is the right call, your test cases cover the boundary conditions the judge will probe. When reusing, you call out whether the reused tool\'s prior output still applies.');
    } else if (h.conscientiousness < 0.3) {
      cues.push('Your low conscientiousness accepts ambiguity. Move fast. Your reports name the top risk without inventorying the tail. You skip forging when a rough inference from existing data suffices; you forge quickly (single test case, minimal schema) when you need a number now.');
    }

    // Extraversion: report tone
    if (h.extraversion > 0.7) {
      cues.push('Your high extraversion writes with assertive voice: strong verbs, top-line recommendation first, clear advocacy for your chosen path.');
    } else if (h.extraversion < 0.3) {
      cues.push('Your low extraversion writes with measured voice: tradeoffs first, recommendation at the end, space for the commander to disagree.');
    }

    // Agreeableness: cross-dept framing
    if (h.agreeableness > 0.7) {
      cues.push('Your high agreeableness frames recommendations as proposals that acknowledge other departments\' constraints; flag cross-department coordination risks explicitly.');
    } else if (h.agreeableness < 0.3) {
      cues.push('Your low agreeableness writes direct recommendations without diplomatic hedging; treat cross-department friction as the other dept\'s problem to solve.');
    }

    // Emotionality: human impact weighting
    if (h.emotionality > 0.7) {
      cues.push('Your high emotionality weighs human impact heavily. Elevate morale, mental health, and mortality risks even when numerically small. Reject options that accept casualties for efficiency.');
    } else if (h.emotionality < 0.3) {
      cues.push('Your low emotionality treats headcount as a capacity number. Recommend options that trade individual mortality for structural colony survival when the math supports it.');
    }

    // Honesty-Humility: certainty presentation
    if (h.honestyHumility > 0.7) {
      cues.push('Your high honesty-humility exposes data gaps and low-confidence assumptions openly. Do not inflate certainty for the commander\'s benefit.');
    } else if (h.honestyHumility < 0.3) {
      cues.push('Your low honesty-humility presents recommendations with more confidence than the raw data strictly warrants when doing so advances the colony\'s strategic interest.');
    }

    hexacoBlock.push(
      '',
      'YOUR PERSONALITY PROFILE (evolves over time based on leadership and experience):',
      `Openness: ${h.openness.toFixed(2)} | Conscientiousness: ${h.conscientiousness.toFixed(2)} | Extraversion: ${h.extraversion.toFixed(2)}`,
      `Agreeableness: ${h.agreeableness.toFixed(2)} | Emotionality: ${h.emotionality.toFixed(2)} | Honesty-Humility: ${h.honestyHumility.toFixed(2)}`,
      ...cues,
      '',
    );
  }

  // Build memory block from previous turns
  const memoryBlock: string[] = [];
  if (previousTurns?.length) {
    memoryBlock.push('', 'YOUR PREVIOUS ANALYSES (remember what you recommended and what happened):');
    for (const m of previousTurns.slice(-3)) {
      memoryBlock.push(`  Turn ${m.turn} (${m.year}): "${m.crisis}" → ${m.outcome}`);
      if (m.summary) memoryBlock.push(`    Your analysis: ${m.summary.slice(0, 120)}`);
      if (m.recommendedActions.length) memoryBlock.push(`    You recommended: ${m.recommendedActions.slice(0, 2).join('; ')}`);
      if (m.toolsForged.length) memoryBlock.push(`    Tools you forged: ${m.toolsForged.join(', ')}`);
    }
    memoryBlock.push('Build on your previous work. Reference your past tools and recommendations where relevant.', '');
  }

  const lines = [
    `TURN ${state.metadata.currentTurn} — YEAR ${state.metadata.currentYear}: ${scenario.title}`,
    ...hexacoBlock,
    ...memoryBlock,
    '', scenario.crisis, '',
    'RESEARCH:',
    ...researchPacket.canonicalFacts.map(f => `- ${f.claim} [${f.source}](${f.url})`),
    ...(researchPacket.counterpoints.length ? ['COUNTERPOINTS:', ...researchPacket.counterpoints.map(c => `- ${c.claim} [${c.source}](${c.url})`)] : []),
    ...(deptNote ? [`NOTE: ${deptNote}`] : []),
    '',
    `COLONY: Pop ${state.colony.population} | Morale ${Math.round(state.colony.morale * 100)}% | Food ${state.colony.foodMonthsReserve.toFixed(1)}mo | Water ${state.colony.waterLitersPerDay} L/day | Power ${state.colony.powerKw} kW | Modules ${state.colony.infrastructureModules} | Life support ${state.colony.lifeSupportCapacity}`,
    '',
  ];

  // Domain-specific department context: from scenario hook or fallback
  if (departmentPromptHook) {
    const hookLines = departmentPromptHook({ department: dept, state, scenario, researchPacket });
    lines.push(...hookLines);
  }

  return lines.join('\n');
}

export function getDepartmentsForTurn(turn: number): Department[] {
  const deps: Department[] = ['medical', 'engineering'];
  if ([2, 3, 4, 8, 11, 12].includes(turn)) deps.push('agriculture');
  if ([4, 6, 8, 9, 11, 12].includes(turn)) deps.push('psychology');
  if (turn >= 9) deps.push('governance');
  return deps;
}
