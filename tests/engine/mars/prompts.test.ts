import test from 'node:test';
import assert from 'node:assert/strict';
import { marsDepartmentPromptLines, marsDirectorInstructions } from '../../../src/engine/mars/prompts.js';

test('marsDepartmentPromptLines returns medical-specific lines for medical dept', () => {
  const state = {
    agents: [
      { health: { alive: true, cumulativeRadiationMsv: 500, boneDensityPct: 85, psychScore: 0.7 }, core: { marsborn: true, name: 'Nova Chen', birthYear: 2040 }, narrative: { featured: true }, social: { partnerId: null, childrenIds: [], earthContacts: 0 } },
      { health: { alive: true, cumulativeRadiationMsv: 200, boneDensityPct: 90, psychScore: 0.8 }, core: { marsborn: false, birthYear: 2000, name: 'Test User' }, narrative: { featured: true }, social: { partnerId: null, childrenIds: [], earthContacts: 3 } },
    ],
    colony: { population: 100, morale: 0.85, foodMonthsReserve: 18, waterLitersPerDay: 800, powerKw: 400, infrastructureModules: 3, lifeSupportCapacity: 120, pressurizedVolumeM3: 3000 },
    politics: { earthDependencyPct: 95, governanceStatus: 'earth-governed', independencePressure: 0.05 },
    metadata: { currentYear: 2040 },
  };

  const lines = marsDepartmentPromptLines('medical', state as any);
  const joined = lines.join('\n');
  assert.ok(joined.includes('radiation'));
  assert.ok(joined.includes('bone'));
  assert.ok(joined.includes('Mars-born'));
});

test('marsDepartmentPromptLines returns infrastructure lines for engineering dept', () => {
  const state = {
    agents: [],
    colony: { population: 100, morale: 0.85, foodMonthsReserve: 18, waterLitersPerDay: 800, powerKw: 400, infrastructureModules: 3, lifeSupportCapacity: 120, pressurizedVolumeM3: 3000 },
    politics: { earthDependencyPct: 95, governanceStatus: 'earth-governed', independencePressure: 0.05 },
    metadata: { currentYear: 2040 },
  };

  const lines = marsDepartmentPromptLines('engineering', state as any);
  const joined = lines.join('\n');
  assert.ok(joined.includes('Modules'));
  assert.ok(joined.includes('Power'));
  assert.ok(joined.includes('Life support'));
});

test('marsDepartmentPromptLines returns politics lines for governance dept', () => {
  const state = {
    agents: [{ health: { alive: true }, core: { marsborn: true }, narrative: { featured: false } }],
    colony: { population: 50, morale: 0.7, foodMonthsReserve: 12, waterLitersPerDay: 600, powerKw: 300, infrastructureModules: 2, lifeSupportCapacity: 80, pressurizedVolumeM3: 2000 },
    politics: { earthDependencyPct: 70, governanceStatus: 'commonwealth', independencePressure: 0.3 },
    metadata: { currentYear: 2050 },
  };

  const lines = marsDepartmentPromptLines('governance', state as any);
  const joined = lines.join('\n');
  assert.ok(joined.includes('Earth dep'));
  assert.ok(joined.includes('commonwealth'));
});

test('marsDirectorInstructions contains Mars-specific crisis categories', () => {
  const instructions = marsDirectorInstructions();
  assert.ok(instructions.includes('Mars colony'));
  assert.ok(instructions.includes('radiation'));
  assert.ok(instructions.includes('environmental'));
  assert.ok(instructions.includes('medical'));
  assert.ok(instructions.includes('governance'));
});
