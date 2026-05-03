import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from 'react-dom/server';
import * as React from 'react';

import { LoadedScenarioCTA } from './LoadedScenarioCTA.js';
import { ScenarioContext } from '../../App.js';

const stubScenarioWithPreset = {
  id: 'mars-genesis',
  version: '3.0.0',
  labels: { name: 'Mars Genesis', shortName: 'mars', populationNoun: 'colonists', settlementNoun: 'colony', currency: 'credits' },
  theme: { primaryColor: '#dc2626', accentColor: '#f97316', cssVariables: {} },
  setup: { defaultTurns: 6, defaultSeed: 950, defaultStartTime: 2035, defaultPopulation: 100 },
  departments: [],
  presets: [{
    id: 'default',
    label: 'Default leaders',
    actors: [
      { name: 'Captain Reyes', archetype: 'Pragmatist', hexaco: { openness: 0.4 }, instructions: '' },
      { name: 'Director Liang', archetype: 'Visionary', hexaco: { openness: 0.9 }, instructions: '' },
    ],
  }],
  ui: { headerMetrics: [], tooltipFields: [], reportSections: [], departmentIcons: {}, setupSections: [] },
  policies: { toolForging: true, bulletin: true, characterChat: true },
} as unknown as React.ContextType<typeof ScenarioContext>;

const stubScenarioNoPreset = {
  ...stubScenarioWithPreset,
  presets: [],
} as unknown as React.ContextType<typeof ScenarioContext>;

function withScenario(value: React.ContextType<typeof ScenarioContext>, node: React.ReactNode) {
  return <ScenarioContext.Provider value={value}>{node}</ScenarioContext.Provider>;
}

test('LoadedScenarioCTA: renders preset leader names + archetype when scenario has presets', () => {
  const html = renderToString(withScenario(stubScenarioWithPreset, <LoadedScenarioCTA onRunStart={() => {}} />));
  // React SSR inserts <!-- --> comments between adjacent text+variable
  // expressions; match the heading by its literal trailing scenario name
  // segment without the colon-space prefix.
  assert.ok(html.includes('Run with the loaded scenario'));
  assert.ok(html.includes('Mars Genesis'));
  assert.match(html, /Captain Reyes \(Pragmatist\) vs Director Liang \(Visionary\)/);
  assert.match(html, /Same scenario, fresh seed/);
  assert.match(html, /value="2"/);
});

test('LoadedScenarioCTA: renders fallback line when scenario has no presets', () => {
  const html = renderToString(withScenario(stubScenarioNoPreset, <LoadedScenarioCTA onRunStart={() => {}} />));
  assert.match(html, /Auto-generated leaders \(no preset\)/);
  assert.match(html, /~30s for actor generation/);
});

test('LoadedScenarioCTA: disabled prop disables the button + slider, sets aria-busy=false (not launching)', () => {
  const html = renderToString(withScenario(stubScenarioWithPreset, <LoadedScenarioCTA onRunStart={() => {}} disabled />));
  assert.match(html, /<button[^>]*disabled[^>]*>/);
  assert.match(html, /aria-busy="false"/);
});
