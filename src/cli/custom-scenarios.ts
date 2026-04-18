import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ScenarioPackage } from '../engine/types.js';

export type CustomScenarioSource = 'memory' | 'disk' | 'compiled' | 'builtin';

export interface CustomScenarioEntry {
  scenario: ScenarioPackage;
  source: CustomScenarioSource;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'string' && value[key].length > 0;
}

function hasNumber(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'number' && Number.isFinite(value[key]);
}

export function isRunnableScenarioPackage(value: unknown): value is ScenarioPackage {
  if (!isRecord(value)) return false;
  if (!hasString(value, 'id') || !hasString(value, 'version')) return false;
  if (value.engineArchetype !== 'closed_turn_based_settlement') return false;

  const labels = value.labels;
  const theme = value.theme;
  const setup = value.setup;
  const world = value.world;
  const ui = value.ui;
  const policies = value.policies;
  const hooks = value.hooks;

  if (!isRecord(labels)) return false;
  if (!hasString(labels, 'name') || !hasString(labels, 'shortName') || !hasString(labels, 'populationNoun') || !hasString(labels, 'settlementNoun') || !hasString(labels, 'currency')) return false;

  if (!isRecord(theme)) return false;
  if (!hasString(theme, 'primaryColor') || !hasString(theme, 'accentColor') || !isRecord(theme.cssVariables)) return false;

  if (!isRecord(setup)) return false;
  if (!hasNumber(setup, 'defaultTurns') || !hasNumber(setup, 'defaultSeed') || !hasNumber(setup, 'defaultStartYear') || !hasNumber(setup, 'defaultPopulation') || !Array.isArray(setup.configurableSections)) return false;

  if (!isRecord(world) || !isRecord(world.metrics) || !isRecord(world.capacities) || !isRecord(world.statuses) || !isRecord(world.politics) || !isRecord(world.environment)) return false;

  if (!Array.isArray(value.departments) || !Array.isArray(value.metrics) || !Array.isArray(value.events) || !Array.isArray(value.effects) || !Array.isArray(value.presets)) return false;

  if (!isRecord(ui)) return false;
  if (!Array.isArray(ui.headerMetrics) || !Array.isArray(ui.tooltipFields) || !Array.isArray(ui.reportSections) || !isRecord(ui.departmentIcons) || !isRecord(ui.eventRenderers) || !Array.isArray(ui.setupSections)) return false;

  if (!isRecord(policies)) return false;
  if (!isRecord(policies.toolForging) || typeof policies.toolForging.enabled !== 'boolean') return false;
  if (!isRecord(policies.liveSearch) || typeof policies.liveSearch.enabled !== 'boolean' || typeof policies.liveSearch.mode !== 'string') return false;
  if (!isRecord(policies.bulletin) || typeof policies.bulletin.enabled !== 'boolean') return false;
  if (!isRecord(policies.characterChat) || typeof policies.characterChat.enabled !== 'boolean') return false;
  if (!isRecord(policies.sandbox) || !hasNumber(policies.sandbox, 'timeoutMs') || !hasNumber(policies.sandbox, 'memoryMB')) return false;

  if (!isRecord(value.knowledge) || !isRecord(value.knowledge.topics) || !isRecord(value.knowledge.categoryMapping)) return false;
  if (!isRecord(hooks)) return false;

  return true;
}

export function loadDiskCustomScenarios(scenarioDir: string): Map<string, CustomScenarioEntry> {
  const catalog = new Map<string, CustomScenarioEntry>();
  if (!existsSync(scenarioDir)) return catalog;

  for (const entry of readdirSync(scenarioDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

    const filePath = resolve(scenarioDir, entry.name);

    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
      if (!isRunnableScenarioPackage(parsed)) continue;
      catalog.set(parsed.id, { scenario: parsed, source: 'disk' });
    } catch {
      // Ignore unreadable or invalid custom scenario files at boot.
    }
  }

  return catalog;
}

export function describeCustomScenarioSource(source: CustomScenarioSource): string {
  if (source === 'builtin') return 'Built-in scenario';
  if (source === 'disk') return 'Custom scenario (disk)';
  if (source === 'compiled') return 'Custom compiled scenario';
  return 'Custom scenario (memory)';
}
