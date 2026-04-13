/**
 * Mars-specific colonist reaction context.
 * Extracted from colonist-reactions.ts buildColonistPrompt lines 51, 67-68.
 * Returns location/identity phrasing and domain-specific health context.
 */
export function marsReactionContext(colonist: any, ctx: any): string {
  const lines: string[] = [];

  // Location/identity phrasing
  if (colonist.core.marsborn) {
    lines.push('Mars-born, never seen Earth.');
  } else {
    lines.push(`Earth-born, ${ctx.year - 2035} years on Mars.`);
  }

  // Domain-specific health context
  if (colonist.health?.boneDensityPct < 70) {
    lines.push('Suffering significant bone density loss.');
  }
  if (colonist.health?.cumulativeRadiationMsv > 1500) {
    lines.push('High cumulative radiation exposure.');
  }

  return lines.join(' ');
}
