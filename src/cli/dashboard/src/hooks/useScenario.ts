import { useState, useEffect } from 'react';

export interface ScenarioClientPayload {
  id: string;
  version: string;
  labels: {
    name: string;
    shortName: string;
    populationNoun: string;
    settlementNoun: string;
    currency: string;
  };
  theme: {
    primaryColor: string;
    accentColor: string;
    cssVariables: Record<string, string>;
  };
  setup: {
    defaultTurns: number;
    defaultSeed: number;
    defaultStartYear: number;
    defaultPopulation: number;
  };
  departments: Array<{
    id: string;
    label: string;
    role: string;
    icon: string;
  }>;
  presets: Array<{
    id: string;
    label: string;
    leaders?: Array<{ name: string; archetype: string; hexaco: Record<string, number>; instructions: string }>;
    personnel?: Array<{ name: string; department: string; role: string; specialization: string; age: number; featured: boolean }>;
  }>;
  ui: {
    headerMetrics: Array<{ id: string; format: string }>;
    tooltipFields: string[];
    departmentIcons: Record<string, string>;
    setupSections: string[];
  };
  policies: {
    toolForging: boolean;
    bulletin: boolean;
    characterChat: boolean;
  };
}

const MARS_FALLBACK: ScenarioClientPayload = {
  id: 'mars-genesis',
  version: '3.0.0',
  labels: { name: 'Mars Genesis', shortName: 'mars', populationNoun: 'colonists', settlementNoun: 'colony', currency: 'credits' },
  theme: { primaryColor: '#dc2626', accentColor: '#f97316', cssVariables: {} },
  setup: { defaultTurns: 12, defaultSeed: 950, defaultStartYear: 2035, defaultPopulation: 100 },
  departments: [
    { id: 'medical', label: 'Medical', role: 'Chief Medical Officer', icon: '🏥' },
    { id: 'engineering', label: 'Engineering', role: 'Chief Engineer', icon: '⚙️' },
    { id: 'agriculture', label: 'Agriculture', role: 'Head of Agriculture', icon: '🌱' },
    { id: 'psychology', label: 'Psychology', role: 'Colony Psychologist', icon: '🧠' },
    { id: 'governance', label: 'Governance', role: 'Governance Advisor', icon: '🏛️' },
  ],
  presets: [],
  ui: {
    headerMetrics: [
      { id: 'population', format: 'number' }, { id: 'morale', format: 'percent' },
      { id: 'foodMonthsReserve', format: 'number' }, { id: 'powerKw', format: 'number' },
      { id: 'infrastructureModules', format: 'number' }, { id: 'scienceOutput', format: 'number' },
    ],
    tooltipFields: ['boneDensityPct', 'cumulativeRadiationMsv', 'psychScore', 'marsborn'],
    departmentIcons: { medical: '🏥', engineering: '⚙️', agriculture: '🌱', psychology: '🧠', governance: '🏛️' },
    setupSections: ['leaders', 'personnel', 'resources', 'departments', 'events', 'models', 'advanced'],
  },
  policies: { toolForging: true, bulletin: true, characterChat: true },
};

export function useScenario() {
  const [scenario, setScenario] = useState<ScenarioClientPayload>(MARS_FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/scenario')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.id) {
          setScenario(data);
          // Inject scenario CSS variables
          if (data.theme?.cssVariables) {
            const root = document.documentElement;
            for (const [key, value] of Object.entries(data.theme.cssVariables)) {
              root.style.setProperty(key, value as string);
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { scenario, loading };
}
