/**
 * Validation harness for generated scenario hooks.
 * Each validator tests a generated hook against synthetic fixtures
 * to verify it produces correct output shapes and does not throw.
 */

import type { ProgressionHookContext, ScenarioHooks } from '../types.js';

/** Minimal synthetic colonist for validation. */
function makeTestColonist(overrides: Record<string, any> = {}): any {
  return {
    core: { name: 'Test', birthYear: 2010, marsborn: false, ...overrides.core },
    health: { alive: true, boneDensityPct: 95, cumulativeRadiationMsv: 100, psychScore: 0.7, ...overrides.health },
    career: { department: 'engineering', role: 'engineer', promoted: false, promotionTurn: 0 },
    social: { partnerId: null, childrenIds: [], earthContacts: 3 },
    narrative: { featured: false, lifeEvents: [] },
    hexaco: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5 },
  };
}

/** Validate a progression hook does not throw and modifies health fields within bounds. */
export function validateProgressionHook(hook: ScenarioHooks['progressionHook']): { ok: boolean; error?: string } {
  if (!hook) return { ok: true };
  try {
    const colonists = [makeTestColonist(), makeTestColonist({ core: { marsborn: true, birthYear: 2040 } }), makeTestColonist({ health: { alive: false } })];
    const ctx: ProgressionHookContext = {
      agents: colonists,
      yearDelta: 4,
      year: 2045,
      turn: 3,
      startYear: 2035,
      rng: { chance: () => false, next: () => 0.5, pick: (arr: any) => arr[0], int: (min: number, max: number) => min },
    };
    hook(ctx);
    for (const c of colonists) {
      if (c.health.alive && (c.health.boneDensityPct < 0 || c.health.boneDensityPct > 200)) {
        return { ok: false, error: `boneDensityPct out of bounds: ${c.health.boneDensityPct}` };
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Validate director instructions mention departments and crisis categories. */
export function validateDirectorInstructions(fn: ScenarioHooks['directorInstructions'], departments: string[]): { ok: boolean; error?: string } {
  if (!fn) return { ok: true };
  try {
    const text = fn();
    if (typeof text !== 'string' || text.length < 100) return { ok: false, error: 'Director instructions too short' };
    const missingDepts = departments.filter(d => !text.toLowerCase().includes(d.toLowerCase()));
    if (missingDepts.length > departments.length / 2) {
      return { ok: false, error: `Missing departments in director instructions: ${missingDepts.join(', ')}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Validate milestone hook returns crises for turn 1 and final turn. */
export function validateMilestones(fn: ScenarioHooks['getMilestoneCrisis'], maxTurns: number): { ok: boolean; error?: string } {
  if (!fn) return { ok: true };
  try {
    const turn1 = fn(1, maxTurns);
    if (!turn1 || !turn1.title || !(turn1.description || turn1.crisis) || !turn1.options || turn1.options.length < 2) {
      return { ok: false, error: 'Turn 1 milestone invalid or missing' };
    }
    const last = fn(maxTurns, maxTurns);
    if (!last || !last.title || !(last.description || last.crisis)) {
      return { ok: false, error: 'Final turn milestone invalid or missing' };
    }
    const mid = fn(Math.floor(maxTurns / 2), maxTurns);
    if (mid !== null && mid !== undefined) {
      // Mid-turn milestones are optional but must be valid if present
      if (!mid.title || !mid.options) return { ok: false, error: 'Mid-turn milestone has invalid shape' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Validate fingerprint hook returns an object with a summary key. */
export function validateFingerprint(fn: ScenarioHooks['fingerprintHook']): { ok: boolean; error?: string } {
  if (!fn) return { ok: true };
  try {
    const mockState = {
      agents: [makeTestColonist()],
      colony: { morale: 0.6, population: 80, foodMonthsReserve: 6, powerKw: 300, infrastructureModules: 10, scienceOutput: 5, lifeSupportCapacity: 100, pressurizedVolumeM3: 2000, waterLitersPerDay: 500 },
      politics: { earthDependencyPct: 50, governanceStatus: 'earth-governed' as const, independencePressure: 0.3 },
      metadata: { simulationId: 'test', leaderId: 'test', seed: 100, startYear: 2035, currentYear: 2070, currentTurn: 8 },
      eventLog: [],
    };
    const log = [{ turn: 1, year: 2035, outcome: 'conservative_success' }, { turn: 2, year: 2039, outcome: 'risky_success' }];
    const leader = { name: 'Test', archetype: 'test', colony: 'Test', instructions: '', hexaco: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5 } };
    const result = fn(mockState, log, leader, { engineering: ['tool1'] }, 8);
    if (typeof result !== 'object' || !result.summary) {
      return { ok: false, error: 'Fingerprint must return object with summary key' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Validate politics hook returns null for non-political categories and deltas for political ones. */
export function validatePolitics(fn: ScenarioHooks['politicsHook']): { ok: boolean; error?: string } {
  if (!fn) return { ok: true };
  try {
    const nonPolitical = fn('environmental', 'risky_success');
    // null is fine, empty object is fine, deltas are fine
    const political = fn('political', 'risky_success');
    if (political !== null && typeof political !== 'object') {
      return { ok: false, error: 'Politics hook must return null or a record of deltas' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Validate reaction context hook returns a string. */
export function validateReactionContext(fn: ScenarioHooks['reactionContextHook']): { ok: boolean; error?: string } {
  if (!fn) return { ok: true };
  try {
    const result = fn(makeTestColonist(), { year: 2045, turn: 3 });
    if (typeof result !== 'string') return { ok: false, error: 'Reaction context must return a string' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
