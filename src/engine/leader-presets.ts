/**
 * Curated library of archetypal leader presets with HEXACO personality
 * profiles. Dual-use:
 *
 * - Dashboard `ForkModal` + `Quickstart` "Swap leader" controls read
 *   from it.
 * - External consumers pull `LEADER_PRESETS` via the `paracosm/leader-presets`
 *   subpath for programmatic `runBatch` sweeps.
 *
 * HEXACO traits live in [0, 1]. Each preset is designed to diverge from
 * the others on at least one high-impact trait (openness, conscientiousness,
 * emotionality), producing measurably different decision-making when
 * the same scenario + seed runs against them.
 *
 * @module paracosm/leader-presets
 */
import type { HexacoProfile } from './core/state.js';

/**
 * One preset entry. `hexaco` must have all six traits in [0, 1].
 * `description` is shown in the dashboard preset picker and kept under
 * 140 chars for compact UI rendering.
 */
export interface LeaderPreset {
  id: string;
  name: string;
  archetype: string;
  description: string;
  hexaco: HexacoProfile;
}

export const LEADER_PRESETS: Readonly<Record<string, LeaderPreset>> = Object.freeze({
  'visionary': {
    id: 'visionary',
    name: 'Aria Okafor',
    archetype: 'The Visionary',
    description: 'Bets on bold experiments. Tolerates ambiguity. Casts a wide pattern net.',
    hexaco: {
      openness: 0.95, conscientiousness: 0.35, extraversion: 0.85,
      agreeableness: 0.55, emotionality: 0.30, honestyHumility: 0.65,
    },
  },
  'pragmatist': {
    id: 'pragmatist',
    name: 'Marcus Reyes',
    archetype: 'The Pragmatist',
    description: 'Leads by protocol and evidence. Safety margins first.',
    hexaco: {
      openness: 0.40, conscientiousness: 0.90, extraversion: 0.35,
      agreeableness: 0.60, emotionality: 0.50, honestyHumility: 0.85,
    },
  },
  'innovator': {
    id: 'innovator',
    name: 'Yuki Tanaka',
    archetype: 'The Innovator',
    description: 'Pushes novel tool forging. Accepts higher variance.',
    hexaco: {
      openness: 0.90, conscientiousness: 0.40, extraversion: 0.70,
      agreeableness: 0.45, emotionality: 0.35, honestyHumility: 0.55,
    },
  },
  'stabilizer': {
    id: 'stabilizer',
    name: 'Elena Voss',
    archetype: 'The Stabilizer',
    description: 'Holds the line. Protects existing capacity. Change-averse.',
    hexaco: {
      openness: 0.30, conscientiousness: 0.85, extraversion: 0.40,
      agreeableness: 0.75, emotionality: 0.55, honestyHumility: 0.70,
    },
  },
  'crisis-manager': {
    id: 'crisis-manager',
    name: 'Nadia Chen',
    archetype: 'The Crisis Manager',
    description: 'Thrives under pressure. Decisive. Low emotional reactivity.',
    hexaco: {
      openness: 0.55, conscientiousness: 0.80, extraversion: 0.75,
      agreeableness: 0.45, emotionality: 0.25, honestyHumility: 0.60,
    },
  },
  'growth-optimist': {
    id: 'growth-optimist',
    name: 'Diego Santoro',
    archetype: 'The Growth Optimist',
    description: 'Chases expansion. High risk tolerance. Charismatic rally-er.',
    hexaco: {
      openness: 0.80, conscientiousness: 0.50, extraversion: 0.90,
      agreeableness: 0.55, emotionality: 0.35, honestyHumility: 0.40,
    },
  },
  'protocol-builder': {
    id: 'protocol-builder',
    name: 'Priya Rao',
    archetype: 'The Protocol Builder',
    description: 'Codifies everything. Demands evidence. Slow to decide, hard to dislodge.',
    hexaco: {
      openness: 0.50, conscientiousness: 0.95, extraversion: 0.35,
      agreeableness: 0.60, emotionality: 0.45, honestyHumility: 0.90,
    },
  },
  'social-architect': {
    id: 'social-architect',
    name: 'Kai Rivers',
    archetype: 'The Social Architect',
    description: 'Builds coalitions. Manages morale. Relationship-first.',
    hexaco: {
      openness: 0.60, conscientiousness: 0.65, extraversion: 0.80,
      agreeableness: 0.90, emotionality: 0.55, honestyHumility: 0.70,
    },
  },
  'cost-cutter': {
    id: 'cost-cutter',
    name: 'Hannah Novak',
    archetype: 'The Cost Cutter',
    description: 'Optimizes ruthlessly. Will trade morale for capacity.',
    hexaco: {
      openness: 0.35, conscientiousness: 0.90, extraversion: 0.45,
      agreeableness: 0.30, emotionality: 0.25, honestyHumility: 0.55,
    },
  },
  'compliance-hawk': {
    id: 'compliance-hawk',
    name: 'Owen Ibarra',
    archetype: 'The Compliance Hawk',
    description: 'Audits every decision. Never cuts corners. Reports failures transparently.',
    hexaco: {
      openness: 0.40, conscientiousness: 0.90, extraversion: 0.45,
      agreeableness: 0.65, emotionality: 0.50, honestyHumility: 0.95,
    },
  },
});

/** Lookup by preset id. Returns undefined for unknown ids. */
export function getPresetById(id: string): LeaderPreset | undefined {
  return LEADER_PRESETS[id];
}

/**
 * List all presets where the given HEXACO trait is above 0.7 (when
 * `high: true`) or below 0.3 (when `high: false`). Used by the preset
 * picker to group recommendations by trait emphasis.
 */
export function listPresetsByTrait(
  trait: keyof HexacoProfile,
  high: boolean,
): LeaderPreset[] {
  return Object.values(LEADER_PRESETS).filter(p => {
    const v = p.hexaco[trait];
    return high ? v > 0.7 : v < 0.3;
  });
}
