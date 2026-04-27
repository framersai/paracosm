/**
 * Back-compat resolver for LeaderConfig. Bridges the legacy
 * `LeaderConfig.hexaco` field and the new `LeaderConfig.traitProfile`
 * pluggable shape so v0.7 callers keep working while v0.8+ callers
 * can supply non-HEXACO trait models.
 *
 * Resolution order:
 *
 *   1. If `leader.traitProfile` is set, use it as-is.
 *   2. Else synthesize `traitProfile = { modelId: 'hexaco', traits:
 *      leader.hexaco }` so HEXACO scenarios produce identical
 *      drift / cues / prompts as before this module landed.
 *
 * The runtime calls `normalizeLeaderConfig` once per leader at
 * simulate-start; downstream code reads from the normalized
 * `traitProfile` field only. The legacy `hexaco` field is preserved
 * on the artifact for back-compat artifact consumers but is
 * informational, not load-bearing.
 *
 * @module paracosm/engine/trait-models/normalize-leader
 */

import type { ActorConfig, LeaderConfig } from '../types.js';
import type { HexacoProfile } from '../core/state.js';
import type { TraitModel, TraitProfile, TraitModelRegistry } from './index.js';
import { traitModelRegistry, withDefaults } from './index.js';
// Side-effect import: register hexaco + ai-agent on the singleton.
// The resolver is the canonical entry point for any consumer that
// needs the singleton populated (orchestrator, dashboard, tests), so
// importing the builtins here guarantees registration without
// requiring callers to remember an explicit init.
import './builtins.js';

/**
 * A LeaderConfig where `traitProfile` is guaranteed populated and
 * filled with the model's defaults for any omitted axis. The runtime
 * passes this shape downstream instead of the raw LeaderConfig so
 * cue translation, drift, and prompt builders never have to handle
 * the missing-traitProfile branch.
 */
/**
 * A LeaderConfig where `traitProfile` is guaranteed populated and
 * filled with the model's defaults for any omitted axis. The runtime
 * passes this shape downstream instead of the raw LeaderConfig so
 * cue translation, drift, and prompt builders never have to handle
 * the missing-traitProfile branch.
 *
 * Renamed from `NormalizedLeaderConfig` in 0.8.0; the legacy name is
 * preserved as a deprecated alias below.
 */
export interface NormalizedActorConfig extends ActorConfig {
  traitProfile: TraitProfile;
}

/**
 * @deprecated since 0.8.0 — alias for {@link NormalizedActorConfig}.
 * Removed in 1.0.
 */
export type NormalizedLeaderConfig = NormalizedActorConfig;

export interface NormalizeOptions {
  /**
   * Registry to look up the model. Defaults to the process-wide
   * singleton; tests inject their own.
   */
  registry?: TraitModelRegistry;
}

/**
 * Normalize a LeaderConfig so `traitProfile` is guaranteed populated
 * and every axis declared by the chosen model has a value (defaults
 * fill omissions). Throws `UnknownTraitModelError` when
 * `traitProfile.modelId` references an unregistered model.
 */
/**
 * Normalize an actor config. Renamed from `normalizeLeaderConfig` in
 * 0.8.0; the legacy name is re-exported below as a deprecated alias.
 */
export function normalizeActorConfig(
  leader: ActorConfig,
  options: NormalizeOptions = {},
): NormalizedActorConfig {
  const registry = options.registry ?? traitModelRegistry;

  // Path 1: leader supplied a traitProfile explicitly.
  if (leader.traitProfile) {
    const model = registry.require(leader.traitProfile.modelId);
    // Cross-validate trait keys against the model's declared axes.
    // The cue translator silently drops unknown axes at runtime
    // (logs `[trait-cues] dropped unknown axis: <id>`), but
    // catching the same problem at simulate-start yields a clearer
    // error and prevents drift / cue subtle data loss.
    const declaredAxes = new Set(model.axes.map(a => a.id));
    const unknown: string[] = [];
    for (const axisId of Object.keys(leader.traitProfile.traits)) {
      if (!declaredAxes.has(axisId)) unknown.push(axisId);
    }
    if (unknown.length > 0) {
      throw new Error(
        `LeaderConfig "${leader.name ?? '<unnamed>'}" traitProfile ` +
        `(modelId='${leader.traitProfile.modelId}') references axes ` +
        `not declared by the model: [${unknown.join(', ')}]. ` +
        `Declared axes: [${[...declaredAxes].join(', ')}].`,
      );
    }
    const filled = withDefaults(leader.traitProfile.traits, model);
    return {
      ...leader,
      traitProfile: { modelId: leader.traitProfile.modelId, traits: filled },
    };
  }

  // Path 2: legacy hexaco field. Synthesize a hexaco-modeled profile.
  // Defensive guard: TS schema declares LeaderConfig.hexaco required,
  // but JSON-loaded leader configs and runtime callers can violate
  // that. Throw an explicit error instead of a `TypeError: cannot
  // read 'openness' of undefined` deep inside hexacoToTraits.
  if (!leader.hexaco) {
    throw new Error(
      `LeaderConfig "${leader.name ?? '<unnamed>'}" must have either ` +
      `traitProfile or the legacy hexaco field. Both are missing.`,
    );
  }
  const model = registry.require('hexaco');
  const traits = hexacoToTraits(leader.hexaco, model);
  return {
    ...leader,
    traitProfile: { modelId: 'hexaco', traits },
  };
}

/**
 * @deprecated since 0.8.0 — alias for {@link normalizeActorConfig}.
 * Removed in 1.0.
 */
export const normalizeLeaderConfig = normalizeActorConfig;

/**
 * Translate a HexacoProfile into the trait map the registered hexaco
 * model expects. Field names match (camelCase axis ids on the model;
 * camelCase field names on the legacy interface), so this is a
 * straight copy with `withDefaults` filling any extra axes a future
 * hexaco-extended model might define.
 */
export function hexacoToTraits(
  hexaco: HexacoProfile,
  model: TraitModel,
): Record<string, number> {
  const traits: Record<string, number> = {
    openness: hexaco.openness,
    conscientiousness: hexaco.conscientiousness,
    extraversion: hexaco.extraversion,
    agreeableness: hexaco.agreeableness,
    emotionality: hexaco.emotionality,
    honestyHumility: hexaco.honestyHumility,
  };
  return withDefaults(traits, model);
}

/**
 * Inverse of `hexacoToTraits`: when an artifact carries a
 * non-HEXACO `traitProfile` but a consumer wants a HexacoProfile-
 * shaped snapshot for legacy display, project the traits down to the
 * HEXACO axes that exist on this model. Missing axes default to 0.5.
 *
 * Used for back-compat dashboard sparkline rendering: the legacy
 * sparkline reads HEXACO axes; until the dashboard generalizes
 * (Phase 6), the resolver projects ai-agent profiles into HEXACO-
 * shaped neutral profiles for display.
 */
export function traitsToHexaco(traits: Record<string, number>): HexacoProfile {
  return {
    openness: clampInUnitInterval(traits.openness ?? 0.5),
    conscientiousness: clampInUnitInterval(traits.conscientiousness ?? 0.5),
    extraversion: clampInUnitInterval(traits.extraversion ?? 0.5),
    agreeableness: clampInUnitInterval(traits.agreeableness ?? 0.5),
    emotionality: clampInUnitInterval(traits.emotionality ?? 0.5),
    honestyHumility: clampInUnitInterval(traits.honestyHumility ?? 0.5),
  };
}

function clampInUnitInterval(v: number): number {
  if (Number.isNaN(v)) return 0.5;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
