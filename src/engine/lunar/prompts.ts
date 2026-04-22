import type { SimulationState } from '../core/state.js';

/**
 * Lunar-specific department prompt context lines.
 */
export function lunarDepartmentPromptLines(dept: string, state: SimulationState): string[] {
  const alive = state.agents.filter(c => c.health.alive);
  const lines: string[] = [];

  switch (dept) {
    case 'medical': {
      const avgDust = alive.length ? alive.reduce((s, c) => s + (c.health.cumulativeRadiationMsv ?? 0), 0) / alive.length : 0;
      const avgBone = alive.length ? alive.reduce((s, c) => s + (c.health.boneDensityPct ?? 0), 0) / alive.length : 0;
      lines.push('HEALTH:', `Avg regolith exposure: ${avgDust.toFixed(0)} | Avg bone/muscle: ${avgBone.toFixed(1)}%`, '');
      break;
    }
    case 'engineering':
      lines.push('INFRASTRUCTURE:', `Modules: ${state.systems.infrastructureModules} | Power: ${state.systems.powerKw}kW (solar + nuclear) | Life support: ${state.systems.lifeSupportCapacity}/${state.systems.population} | Volume: ${state.systems.pressurizedVolumeM3}m³`);
      break;
    case 'mining':
      lines.push('MINING:', `Ice extraction active in permanently shadowed craters. Regolith processing for construction materials. ISRU capacity scales with power.`);
      break;
    case 'life-support':
      lines.push('LIFE SUPPORT:', `Reserves: ${state.systems.foodMonthsReserve.toFixed(1)}mo | Water: ${state.systems.waterLitersPerDay}L/day | O2 from electrolysis. Crew to support: ${state.systems.population}`);
      break;
    case 'communications':
      lines.push('COMMS:', `Earth visible from crater rim during ~70% of lunar day. Direct line-of-sight link. 1.3s signal delay. Relay satellite for far-side coverage.`);
      break;
  }

  return lines;
}

/**
 * Lunar-specific Crisis Director system instructions.
 */
export function lunarDirectorInstructions(): string {
  return `You are the Crisis Director for a lunar outpost simulation. You observe outpost state and generate crises that test the crew's weaknesses, exploit consequences of prior decisions, and create narrative tension.

RULES:
1. Each crisis has exactly 2-3 options with stable IDs (option_a, option_b, option_c)
2. Exactly one option must be marked isRisky: true (higher upside, higher downside)
3. Crises must reference real lunar science (regolith toxicity, 1/6g effects, solar power cycles, ISRU)
4. Never repeat a crisis category from the immediately previous turn
5. Escalate: later crises should reference consequences of earlier decisions
6. Calibrate difficulty to outpost state
7. Include actual numbers in the crisis description
8. Specify which departments should analyze (2-4 departments per crisis)

CRISIS CATEGORIES:
- environmental: micrometeorites, thermal cycling, seismic activity, solar storms
- resource: water ice, regolith, power, oxygen shortage
- medical: dust toxicity, muscle atrophy, bone loss, radiation from solar events
- psychological: isolation, Earth-homesickness, crew tension, monotony
- political: Earth agency relations, commercial interests, international partners
- infrastructure: habitat damage, power systems, communications, mining equipment
- social: crew rotation, family separation, cultural friction
- technological: equipment failure, software, autonomous systems

AVAILABLE DEPARTMENTS (use ONLY these exact names):
- medical
- engineering
- mining
- life-support
- communications

Return ONLY valid JSON matching the standard crisis format.`;
}
