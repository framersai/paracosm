import type { ScenarioMetric } from '../mars/metrics.js';

export const LUNAR_WORLD_METRICS: ScenarioMetric[] = [
  { id: 'population', label: 'Crew', unit: '', type: 'number', initial: 50, min: 0, category: 'metric', showInHeader: true, format: 'number' },
  { id: 'powerKw', label: 'Power', unit: 'kW', type: 'number', initial: 200, min: 0, category: 'metric', showInHeader: true, format: 'number' },
  { id: 'foodMonthsReserve', label: 'Food Reserve', unit: 'months', type: 'number', initial: 12, min: 0, category: 'metric', showInHeader: true, format: 'number' },
  { id: 'waterLitersPerDay', label: 'Water', unit: 'L/day', type: 'number', initial: 400, min: 0, category: 'metric', showInHeader: true, format: 'number' },
  { id: 'pressurizedVolumeM3', label: 'Volume', unit: 'm³', type: 'number', initial: 1500, min: 0, category: 'metric', showInHeader: false, format: 'number' },
  { id: 'infrastructureModules', label: 'Modules', unit: '', type: 'number', initial: 2, min: 0, category: 'metric', showInHeader: true, format: 'number' },
  { id: 'scienceOutput', label: 'Science', unit: '', type: 'number', initial: 0, min: 0, category: 'metric', showInHeader: true, format: 'number' },
  { id: 'morale', label: 'Morale', unit: '%', type: 'number', initial: 0.80, min: 0, max: 1, category: 'metric', showInHeader: true, format: 'percent' },
];

export const LUNAR_CAPACITY_METRICS: ScenarioMetric[] = [
  { id: 'lifeSupportCapacity', label: 'Life Support Cap', unit: '', type: 'number', initial: 60, min: 0, category: 'capacity', showInHeader: false, format: 'number' },
];
