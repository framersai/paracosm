/**
 * Lunar-specific colonist reaction context.
 */
export function lunarReactionContext(colonist: any, ctx: any): string {
  const lines: string[] = [];
  lines.push(`Stationed at lunar outpost. ${ctx.time - 2030} years on the Moon.`);

  if (colonist.health?.boneDensityPct < 65) {
    lines.push('Severe muscle and bone atrophy from 1/6g.');
  }
  if (colonist.health?.cumulativeRadiationMsv > 100) {
    lines.push('Significant regolith dust exposure.');
  }

  return lines.join(' ');
}
