import type { ScenarioMetric } from './mars/metrics.js';

export { type ScenarioMetric } from './mars/metrics.js';

export class MetricRegistry {
  private metrics: Map<string, ScenarioMetric>;

  constructor(definitions: ScenarioMetric[]) {
    this.metrics = new Map(definitions.map(d => [d.id, d]));
  }

  get(id: string): ScenarioMetric | undefined {
    return this.metrics.get(id);
  }

  all(): ScenarioMetric[] {
    return Array.from(this.metrics.values());
  }

  getHeaderMetrics(): ScenarioMetric[] {
    return this.all().filter(m => m.showInHeader);
  }

  getByCategory(category: ScenarioMetric['category']): ScenarioMetric[] {
    return this.all().filter(m => m.category === category);
  }

  getInitialValues(): Record<string, number | string | boolean> {
    const values: Record<string, number | string | boolean> = {};
    for (const m of this.metrics.values()) {
      values[m.id] = m.initial;
    }
    return values;
  }
}
