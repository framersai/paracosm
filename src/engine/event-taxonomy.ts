import type { ScenarioEventDef } from './mars/events.js';

export { type ScenarioEventDef } from './mars/events.js';

export class EventTaxonomy {
  private events: Map<string, ScenarioEventDef>;

  constructor(definitions: ScenarioEventDef[]) {
    this.events = new Map(definitions.map(d => [d.id, d]));
  }

  get(id: string): ScenarioEventDef | undefined {
    return this.events.get(id);
  }

  all(): ScenarioEventDef[] {
    return Array.from(this.events.values());
  }
}
