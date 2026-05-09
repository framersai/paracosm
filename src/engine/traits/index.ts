/**
 * Trait Model Registry. Pluggable interface for leader / agent
 * personality (or, for non-human leaders, decision-tendency) models.
 *
 * Today paracosm ships two built-in models:
 *   - 'hexaco'    six-axis Ashton-Lee personality (the historical default)
 *   - 'ai-agent'  six-axis AI-system tendency model
 *
 * Adding a third model post-hoc is a single `traitModelRegistry.register(...)`
 * call.
 *
 * @module paracosm/engine/traits
 */

import type { LlmProvider } from '../types.js';

/* ─────────────────────────── types ─────────────────────────── */

/**
 * Outcome classes the kernel emits for each turn. Trait models map
 * each outcome to a per-axis delta in their drift table.
 */
export type Outcome =
  | 'risky_success'
  | 'risky_failure'
  | 'conservative_success'
  | 'conservative_failure'
  | 'safe_success'
  | 'safe_failure';

/**
 * One axis of a trait model. Axes are fixed at registration; the
 * registry is registration-time-only.
 */
export interface TraitAxis {
  /** kebab-case stable id used in serialization. */
  id: string;
  /** Human-readable label for UI. */
  label: string;
  /** One-sentence description of what the axis measures. */
  description: string;
  /** Optional short label for the low pole (UI tooltip). */
  lowPole?: string;
  /** Optional short label for the high pole (UI tooltip). */
  highPole?: string;
}

/**
 * Per-zone prose cue for prompt injection. Zone selection: `low` when
 * value <= 0.35, `high` when value >= 0.65, `mid` otherwise.
 */
export interface CueZone {
  low?: string;
  mid?: string;
  high?: string;
}

/**
 * Drift parameters for a trait model. The kernel applies these to
 * agents and to the leader after each turn outcome.
 */
export interface DriftTable {
  /**
   * axis-id -> outcome -> delta. Typical range -0.05 to +0.05.
   * Missing entries treated as zero.
   */
  outcomes: Record<string, Partial<Record<Outcome, number>>>;

  /**
   * axis-id -> per-turn pull strength (0..1) toward the leader's value.
   * Agents drift toward leader's traits; leader does not pull-self.
   */
  leaderPull: Record<string, number>;

  /**
   * axis-id -> per-turn amplification when the agent is promoted to a
   * department whose role activates that axis. Sign-aware: positive
   * pushes the trait up, negative pushes it down.
   */
  roleActivation: Record<string, number>;
}

/**
 * Complete definition of a trait model. Registered once at engine
 * load; consumed by the cue translator, the drift dispatcher, the
 * dashboard sliders, and the prompt builder.
 */
export interface TraitModel {
  /** kebab-case stable id used in artifacts and configs. */
  id: string;
  /** Human-readable name for UI. */
  name: string;
  /** One-paragraph description of the model. */
  description: string;
  /** Ordered list of axes; UI renders sliders in this order. */
  axes: readonly TraitAxis[];
  /** axis-id -> default float in [0, 1] when an axis is omitted. */
  defaults: Record<string, number>;
  /** Drift table consumed by the kernel between turns. */
  drift: DriftTable;
  /** axis-id -> per-zone prose cue for prompt injection. */
  cues: Record<string, CueZone>;
  /**
   * Optional citation / provenance string for UI tooltips, e.g.
   * "Ashton & Lee, PSPR 2007" for HEXACO.
   */
  citation?: string;
  /**
   * Recommended LLM providers / models for runs against this trait
   * model. Informational only; the orchestrator does not enforce.
   */
  recommendedProviders?: readonly LlmProvider[];
}

/**
 * A leader's (or agent's) profile under a specific trait model. Stored
 * on ActorConfig.traitProfile and Agent.traitProfile.
 */
export interface TraitProfile {
  /** id of the registered TraitModel. */
  modelId: string;
  /** axis-id -> float in [0, 1]. */
  traits: Record<string, number>;
}

/* ─────────────────────────── registry ─────────────────────────── */

/**
 * Thrown when a TraitProfile references an unregistered modelId.
 */
export class UnknownTraitModelError extends Error {
  readonly modelId: string;
  readonly registered: readonly string[];

  constructor(modelId: string, registered: readonly string[]) {
    const list = registered.length > 0 ? registered.join(', ') : '(none)';
    super(
      `Unknown trait model id: '${modelId}'. ` +
      `Registered models: ${list}. ` +
      `If this artifact was created by a newer paracosm version, upgrade. ` +
      `If you registered a custom model, ensure paracosm/engine/traits loads first.`,
    );
    this.modelId = modelId;
    this.registered = registered;
    this.name = 'UnknownTraitModelError';
  }
}

/**
 * In-memory map of TraitModel by id. The runtime singleton lives at
 * `traitModelRegistry`; tests and isolated callers can construct
 * their own via `new TraitModelRegistry()`.
 */
export class TraitModelRegistry {
  private readonly models = new Map<string, TraitModel>();

  /**
   * Register a model. Throws if a model with the same id is already
   * registered (registration-time-only; no live re-binding).
   */
  register(model: TraitModel): void {
    if (this.models.has(model.id)) {
      throw new Error(
        `TraitModelRegistry.register: id '${model.id}' is already registered. ` +
        `Re-registration is not supported; use a unique id.`,
      );
    }
    this.assertValid(model);
    this.models.set(model.id, model);
  }

  /** Return the model or `undefined` if not registered. */
  get(modelId: string): TraitModel | undefined {
    return this.models.get(modelId);
  }

  /** Return the model or throw `UnknownTraitModelError`. */
  require(modelId: string): TraitModel {
    const model = this.models.get(modelId);
    if (!model) throw new UnknownTraitModelError(modelId, this.list().map(m => m.id));
    return model;
  }

  /** All registered models in registration order. */
  list(): TraitModel[] {
    return Array.from(this.models.values());
  }

  /**
   * Validate model shape: axes match defaults + drift + cues, ids are
   * kebab-case, defaults are in [0, 1].
   */
  private assertValid(model: TraitModel): void {
    if (!/^[a-z0-9-]+$/.test(model.id)) {
      throw new Error(`TraitModel.id must be kebab-case: '${model.id}'`);
    }
    if (model.axes.length < 2 || model.axes.length > 12) {
      throw new Error(`TraitModel.axes count must be 2..12, got ${model.axes.length}`);
    }
    const axisIds = new Set<string>();
    for (const axis of model.axes) {
      // Axis ids accept kebab-case OR camelCase identifier-safe strings.
      // The hexaco model's `honestyHumility` axis is camelCase to match
      // the legacy ActorConfig.hexaco.honestyHumility field name so the
      // back-compat resolver can synthesize TraitProfile.traits from
      // the legacy field without renaming. New models should still
      // prefer kebab-case for new axes.
      if (!/^[a-zA-Z0-9_-]+$/.test(axis.id)) {
        throw new Error(`TraitAxis.id must be identifier-safe: '${axis.id}' (model: ${model.id})`);
      }
      if (axisIds.has(axis.id)) {
        throw new Error(`Duplicate axis id '${axis.id}' in model '${model.id}'`);
      }
      axisIds.add(axis.id);
      const def = model.defaults[axis.id];
      if (typeof def !== 'number' || def < 0 || def > 1 || Number.isNaN(def)) {
        throw new Error(
          `TraitModel '${model.id}' axis '${axis.id}': defaults must be a number in [0, 1], got ${def}`,
        );
      }
    }
    // Sanity check drift / cues only reference declared axes; missing
    // axes are tolerated (treated as zero / no cue).
    for (const axisId of Object.keys(model.drift.outcomes)) {
      if (!axisIds.has(axisId)) {
        throw new Error(`TraitModel '${model.id}' drift.outcomes references unknown axis '${axisId}'`);
      }
    }
    for (const axisId of Object.keys(model.cues)) {
      if (!axisIds.has(axisId)) {
        throw new Error(`TraitModel '${model.id}' cues references unknown axis '${axisId}'`);
      }
    }
  }
}

/**
 * Process-wide singleton registry. The hexaco + ai-agent built-ins
 * register on import via `engine/traits/builtins.ts` (which is
 * imported by `engine/index.ts`). External consumers should `import
 * { traitModelRegistry } from 'paracosm/engine/traits'`.
 */
export const traitModelRegistry = new TraitModelRegistry();

/* ─────────────────────────── helpers ─────────────────────────── */

/**
 * Clamp a numeric trait value to [0, 1]. Used by the drift dispatcher
 * after applying outcome / leader-pull / role-activation deltas.
 */
export function clampTrait(value: number): number {
  if (Number.isNaN(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Compute the zone for a trait value: 'low' when <= 0.35, 'high' when
 * >= 0.65, 'mid' otherwise. Used by the cue translator.
 */
export function traitZone(value: number): 'low' | 'mid' | 'high' {
  if (value <= 0.35) return 'low';
  if (value >= 0.65) return 'high';
  return 'mid';
}

/**
 * Fill a partial trait map with model defaults so every axis has a
 * value. Idempotent: existing keys are preserved.
 */
export function withDefaults(
  partial: Record<string, number>,
  model: TraitModel,
): Record<string, number> {
  const out: Record<string, number> = { ...model.defaults };
  for (const axis of model.axes) {
    if (axis.id in partial) {
      out[axis.id] = clampTrait(partial[axis.id]);
    }
  }
  return out;
}
