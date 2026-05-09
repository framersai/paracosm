/**
 * Generic registry for scenario event-type definitions. Indexes
 * `EventDefinition` records (the shape declared under `scenario.events`)
 * by their string id, exposing O(1) `get(id)` for the dashboard's
 * EventChronicle and report renderers.
 */
import type { EventDefinition } from './types.js';

/**
 * Backwards-compatible alias. Earlier versions called this type
 * `ScenarioEventDef`; current code prefers `EventDefinition` from
 * `types.ts`. The alias is exported so external consumers that pinned
 * the old name keep compiling.
 */
export type ScenarioEventDef = EventDefinition;

export class EventTaxonomy {
  private events: Map<string, EventDefinition>;

  constructor(definitions: EventDefinition[]) {
    this.events = new Map(definitions.map((d) => [d.id, d]));
  }

  get(id: string): EventDefinition | undefined {
    return this.events.get(id);
  }

  all(): EventDefinition[] {
    return Array.from(this.events.values());
  }
}
