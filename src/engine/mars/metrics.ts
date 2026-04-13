export interface ScenarioMetric {
  id: string;
  label: string;
  unit: string;
  type: 'number' | 'string' | 'boolean';
  initial: number | string | boolean;
  min?: number;
  max?: number;
  category: 'metric' | 'capacity' | 'status' | 'politic';
  showInHeader: boolean;
  format: 'number' | 'percent' | 'currency' | 'duration' | 'string';
}

/** Colony systems metrics (from ColonySystems in kernel/state.ts) */
export const MARS_WORLD_METRICS: ScenarioMetric[] = [
  { id: 'population', label: 'Population', unit: '', type: 'number', initial: 100, min: 0, category: 'metric', showInHeader: true, format: 'number' },
  { id: 'powerKw', label: 'Power', unit: 'kW', type: 'number', initial: 400, min: 0, category: 'metric', showInHeader: true, format: 'number' },
  { id: 'foodMonthsReserve', label: 'Food Reserve', unit: 'months', type: 'number', initial: 18, min: 0, category: 'metric', showInHeader: true, format: 'number' },
  { id: 'waterLitersPerDay', label: 'Water', unit: 'L/day', type: 'number', initial: 800, min: 0, category: 'metric', showInHeader: true, format: 'number' },
  { id: 'pressurizedVolumeM3', label: 'Volume', unit: 'm³', type: 'number', initial: 3000, min: 0, category: 'metric', showInHeader: false, format: 'number' },
  { id: 'infrastructureModules', label: 'Modules', unit: '', type: 'number', initial: 3, min: 0, category: 'metric', showInHeader: true, format: 'number' },
  { id: 'scienceOutput', label: 'Science', unit: '', type: 'number', initial: 0, min: 0, category: 'metric', showInHeader: true, format: 'number' },
  { id: 'morale', label: 'Morale', unit: '%', type: 'number', initial: 0.85, min: 0, max: 1, category: 'metric', showInHeader: true, format: 'percent' },
];

/** Capacity metrics (from ColonySystems) */
export const MARS_CAPACITY_METRICS: ScenarioMetric[] = [
  { id: 'lifeSupportCapacity', label: 'Life Support Cap', unit: '', type: 'number', initial: 120, min: 0, category: 'capacity', showInHeader: false, format: 'number' },
];

/** Status metrics (from ColonyPolitics) */
export const MARS_STATUS_METRICS: ScenarioMetric[] = [
  { id: 'governanceStatus', label: 'Governance', unit: '', type: 'string', initial: 'earth-governed', category: 'status', showInHeader: false, format: 'string' },
];

/** Politics metrics (from ColonyPolitics) */
export const MARS_POLITICS_METRICS: ScenarioMetric[] = [
  { id: 'earthDependencyPct', label: 'Earth Dependency', unit: '%', type: 'number', initial: 95, min: 0, max: 100, category: 'politic', showInHeader: false, format: 'percent' },
  { id: 'independencePressure', label: 'Independence Pressure', unit: '%', type: 'number', initial: 0.05, min: 0, max: 1, category: 'politic', showInHeader: false, format: 'percent' },
];
