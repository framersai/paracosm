/**
 * Build the "AVAILABLE STATE SHAPE" block that every state-accessing
 * generator's system prompt includes. Declares the exact flat key list
 * on each world bag so the LLM cannot silently hallucinate nested
 * access patterns like `state.systems.hull.integrity`.
 *
 * @module paracosm/engine/compiler/state-shape-block
 */

interface MetricDef { id: string; type?: 'number' | 'string' | 'boolean' }

function keys(bag: Record<string, MetricDef> | undefined): string[] {
  return bag ? Object.keys(bag) : [];
}

function listOrNone(ks: string[]): string {
  return ks.length ? ks.join(', ') : '(none declared)';
}

export function buildStateShapeBlock(scenarioJson: Record<string, unknown>): string {
  const world = (scenarioJson.world ?? {}) as Record<string, Record<string, MetricDef> | undefined>;
  const labels = (scenarioJson.labels ?? {}) as { timeUnitNoun?: string; timeUnitNounPlural?: string };
  const timeUnit = labels.timeUnitNoun ?? 'tick';
  const timeUnitPlural = labels.timeUnitNounPlural ?? 'ticks';

  return `AVAILABLE STATE SHAPE (read-only, flat):

state.systems = Record<string, number>
  keys: ${listOrNone(keys(world.metrics))}
state.capacities = Record<string, number>
  keys: ${listOrNone(keys(world.capacities))}
state.politics = Record<string, number | string | boolean>
  keys: ${listOrNone(keys(world.politics))}
state.statuses = Record<string, string | boolean>
  keys: ${listOrNone(keys(world.statuses))}
state.environment = Record<string, number | string | boolean>
  keys: ${listOrNone(keys(world.environment))}
state.metadata = { simulationId, leaderId, seed, startTime, currentTime, currentTurn }

RULES:
- All five state bags are FLAT. Access is state.<bag>.<key> — no deeper nesting.
- state.systems.<key> is always a number. Do not write state.systems.<key>.<subfield>.
- Only reference keys listed above. Other keys are not guaranteed to exist.
- Time is measured in ${timeUnit} units (plural: ${timeUnitPlural}). Use that vocabulary in any user-visible strings.`;
}
