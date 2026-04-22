import type { SimulationState } from '../core/state.js';

/**
 * Mars-specific department prompt context lines.
 * Extracted from departments.ts buildDepartmentContext switch statement.
 */
export function marsDepartmentPromptLines(dept: string, state: SimulationState): string[] {
  const alive = state.agents.filter(c => c.health.alive);
  const featured = alive.filter(c => c.narrative.featured);
  const lines: string[] = [];

  switch (dept) {
    case 'medical': {
      const avgRad = alive.length ? alive.reduce((s, c) => s + (c.health.cumulativeRadiationMsv ?? 0), 0) / alive.length : 0;
      const avgBone = alive.length ? alive.reduce((s, c) => s + (c.health.boneDensityPct ?? 0), 0) / alive.length : 0;
      lines.push('HEALTH:', `Avg radiation: ${avgRad.toFixed(0)} mSv | Avg bone: ${avgBone.toFixed(1)}% | Mars-born: ${alive.filter(c => c.core.marsborn).length}`, '');
      lines.push('FEATURED:', ...featured.slice(0, 6).map(c => `- ${c.core.name} (${state.metadata.currentYear - c.core.birthYear}y): bone ${(c.health.boneDensityPct ?? 0).toFixed(0)}% rad ${(c.health.cumulativeRadiationMsv ?? 0).toFixed(0)}mSv psych ${c.health.psychScore.toFixed(2)}`));
      break;
    }
    case 'engineering':
      lines.push('INFRASTRUCTURE:', `Modules: ${state.systems.infrastructureModules} | Power: ${state.systems.powerKw}kW | Life support: ${state.systems.lifeSupportCapacity}/${state.systems.population} | Volume: ${state.systems.pressurizedVolumeM3}m³ | Water: ${state.systems.waterLitersPerDay}L/day`);
      break;
    case 'agriculture':
      lines.push('FOOD:', `Reserves: ${state.systems.foodMonthsReserve.toFixed(1)}mo | Pop to feed: ${state.systems.population} | Farm modules: ${Math.floor(state.systems.infrastructureModules * 0.3)}`);
      break;
    case 'psychology': {
      const avgPsych = alive.length ? alive.reduce((s, c) => s + c.health.psychScore, 0) / alive.length : 0;
      const depressed = alive.filter(c => c.health.psychScore < 0.5).length;
      lines.push('PSYCH:', `Morale: ${Math.round(state.systems.morale * 100)}% | Avg psych: ${avgPsych.toFixed(2)} | Depressed: ${depressed}/${alive.length} | Mars-born: ${alive.filter(c => c.core.marsborn).length}`);
      lines.push('', 'SOCIAL:', ...featured.slice(0, 4).map(c => `- ${c.core.name}: psych ${c.health.psychScore.toFixed(2)} partner:${c.social.partnerId ? 'y' : 'n'} children:${c.social.childrenIds.length} earthContacts:${c.social.earthContacts}`));
      break;
    }
    case 'governance':
      lines.push('POLITICS:', `Earth dep: ${state.politics.earthDependencyPct}% | Status: ${state.politics.governanceStatus} | Independence pressure: ${(state.politics.independencePressure * 100).toFixed(0)}% | Mars-born: ${alive.filter(c => c.core.marsborn).length}/${alive.length}`);
      break;
  }

  return lines;
}

/**
 * Mars-specific Crisis Director system instructions.
 * Extracted from director.ts DIRECTOR_INSTRUCTIONS constant.
 */
export function marsDirectorInstructions(): string {
  return `You are the Crisis Director for a Mars colony simulation. You observe colony state and generate crises that test the colony's weaknesses, exploit consequences of prior decisions, and create interesting narrative tension.

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
}
