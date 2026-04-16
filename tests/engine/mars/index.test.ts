import test from 'node:test';
import assert from 'node:assert/strict';
import { marsScenario } from '../../../src/engine/mars/index.js';
import type { ScenarioPackage } from '../../../src/engine/types.js';

test('marsScenario satisfies ScenarioPackage interface', () => {
  const scenario: ScenarioPackage = marsScenario;
  assert.equal(scenario.id, 'mars-genesis');
  assert.equal(scenario.engineArchetype, 'closed_turn_based_settlement');
});

test('marsScenario has correct labels', () => {
  assert.equal(marsScenario.labels.name, 'Mars Genesis');
  assert.equal(marsScenario.labels.populationNoun, 'colonists');
  assert.equal(marsScenario.labels.settlementNoun, 'colony');
});

test('marsScenario declares 5 departments', () => {
  assert.equal(marsScenario.departments.length, 5);
  const ids = marsScenario.departments.map(d => d.id);
  assert.ok(ids.includes('medical'));
  assert.ok(ids.includes('engineering'));
  assert.ok(ids.includes('agriculture'));
  assert.ok(ids.includes('psychology'));
  assert.ok(ids.includes('governance'));
});

test('marsScenario has tool forging enabled', () => {
  assert.equal(marsScenario.policies.toolForging.enabled, true);
});

test('marsScenario has at least one preset', () => {
  assert.ok(marsScenario.presets.length >= 1);
  const defaultPreset = marsScenario.presets.find(p => p.id === 'default');
  assert.ok(defaultPreset);
  assert.ok(defaultPreset!.leaders!.length >= 2);
});

test('marsScenario hooks include progressionHook', () => {
  assert.ok(marsScenario.hooks.progressionHook);
  assert.equal(typeof marsScenario.hooks.progressionHook, 'function');
});

test('marsScenario hooks include directorInstructions', () => {
  assert.ok(marsScenario.hooks.directorInstructions);
  const instructions = marsScenario.hooks.directorInstructions!();
  assert.ok(instructions.includes('Mars colony'));
});

test('marsScenario hooks include departmentPromptHook', () => {
  assert.ok(marsScenario.hooks.departmentPromptHook);
  assert.equal(typeof marsScenario.hooks.departmentPromptHook, 'function');
});

test('marsScenario knowledge bundle has topics', () => {
  assert.ok(Object.keys(marsScenario.knowledge.topics).length > 0);
  assert.ok(Object.keys(marsScenario.knowledge.categoryMapping).length > 0);
});

test('marsScenario world schema declares all WorldSystems fields', () => {
  const metricIds = Object.keys(marsScenario.world.metrics);
  assert.ok(metricIds.includes('population'));
  assert.ok(metricIds.includes('morale'));
  assert.ok(metricIds.includes('powerKw'));
  assert.ok(metricIds.includes('foodMonthsReserve'));
});
