/**
 * Generic registry for scenario world-metric schemas. Indexes
 * `WorldMetricSchema` records (the shape declared under
 * `scenario.world.{metrics,capacities,statuses,politics,environment}`)
 * by their string id.
 *
 * Used by the orchestrator and any consumer that needs O(1) lookup of
 * a metric's display label / unit / initial value / category given
 * just an id.
 *
 * Header-metric selection (which metrics show in the dashboard top
 * bar) lives in `scenario.ui.headerMetrics`, NOT on this registry.
 */
import type { WorldMetricSchema } from '../types.js';

/**
 * Backwards-compatible alias. Earlier versions called this type
 * `ScenarioMetric`; current code prefers `WorldMetricSchema` from
 * `./types.js`. The alias is exported so external consumers that
 * pinned the old name keep compiling.
 */
export type ScenarioMetric = WorldMetricSchema;

export class MetricRegistry {
  private metrics: Map<string, WorldMetricSchema>;

  constructor(definitions: WorldMetricSchema[]) {
    this.metrics = new Map(definitions.map((d) => [d.id, d]));
  }

  get(id: string): WorldMetricSchema | undefined {
    return this.metrics.get(id);
  }

  all(): WorldMetricSchema[] {
    return Array.from(this.metrics.values());
  }

  getByCategory(category: WorldMetricSchema['category']): WorldMetricSchema[] {
    return this.all().filter((m) => m.category === category);
  }

  getInitialValues(): Record<string, number | string | boolean> {
    const values: Record<string, number | string | boolean> = {};
    for (const m of this.metrics.values()) {
      values[m.id] = m.initial;
    }
    return values;
  }
}
