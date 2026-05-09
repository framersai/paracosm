/**
 * Data-driven scenario hook factory.
 *
 * Mars Genesis and Lunar Outpost ship as separate engine modules
 * because their hooks have genuine domain logic (bone density decay,
 * regolith exposure curves, lunar gravity multipliers). The newer
 * AI/SaaS/governance scenarios — Atlas Lab, Dual Superintelligence
 * Council, future frontier-lab variants — don't have that. Their
 * hooks are 90% data wearing a function costume:
 *
 *   - `directorInstructions` is a string literal
 *   - `departmentPromptHook` is a switch over dept ids that emits
 *     formatted metric lines — pure mapping
 *   - `fingerprintHook` is threshold checks against named metrics
 *     and an outcome-trichotomy lookup
 *   - `politicsHook` is a `category → Record<string, number>` table
 *   - `reactionContextHook` is a string template per agent
 *
 * Without a factory, every new AI-shaped scenario gets a 200-line
 * `hooks.ts` that's near-identical to the previous one. With this
 * factory, the same scenarios become **scenario.json + 5-line
 * wrapper** — config in, function values out. The factory translates
 * the config into the function shapes the engine expects.
 *
 * Mars / Lunar keep their hand-written modules — the factory doesn't
 * fit their domain. But every scenario that's "metrics + dept context
 * + fingerprint thresholds + politics map" should route through here.
 *
 * @module paracosm/engine/data-driven-hooks
 */
import type { Agent, SimulationState } from '../core/state.js';
import type { ActorConfig, ScenarioHooks } from '../types.js';

/**
 * Per-department row of metric chips that get formatted into the
 * department prompt context. Keys reference metric / capacity / status
 * / politic / environment paths so the factory can reach the right bag
 * inside `SimulationState`.
 *
 * Format flags drive how the value renders:
 *   - 'number' → toFixed(3) for fractions, toFixed(0) for integers
 *   - 'percent' → value * 100 + '%'
 *   - 'string' → as-is
 *
 * The factory composes label + formatted value into a single chip
 * (`AlignmentBench: 0.840`) and joins chips with ` | ` so the dept
 * prompt reads as one wide line instead of a multi-row dump.
 */
export interface DataDrivenChip {
  label: string;
  /** Path under SimulationState — `metrics.alignmentBench`, `politics.boardConfidence`, `environment.competitorCapabilityGap`, `statuses.compactTier`. */
  source: string;
  format: 'number' | 'percent' | 'string';
}

/** Per-department prompt-row spec. */
export interface DataDrivenDepartmentSpec {
  /** Heading printed above the chips: `ALIGNMENT METRICS:`. */
  heading: string;
  /** Chips formatted left-to-right and joined with ` | `. */
  chips: DataDrivenChip[];
  /** Optional trailing line for free-form context. */
  footer?: string;
}

/**
 * Threshold rule for the fingerprint trichotomy. Each rule is checked
 * in order; the first rule whose `when` predicate returns true wins
 * and its `posture` becomes the `posture` field on the fingerprint.
 *
 * `when` reads from a flattened state view — the factory walks
 * `metrics`, `politics`, `environment` and merges them so a rule can
 * read any field by its leaf name without having to know which bag
 * it lives in.
 */
export interface DataDrivenPostureRule {
  posture: string;
  when: (state: Record<string, number | string | boolean>) => boolean;
}

/**
 * Per-axis fingerprint band. `axes[].when` returns the band label
 * for a given state; the factory writes them into the fingerprint
 * record under their `name`. Used for the 1-2-letter band tags
 * (alignment: high/moderate/degraded; capability: frontier/competitive/lagging).
 */
export interface DataDrivenFingerprintAxis {
  name: string;
  when: (state: Record<string, number | string | boolean>) => string;
}

/** Per-category politics delta. The factory exposes outcome via a
 *  closure (`outcome.endsWith('success')`) so each category entry can
 *  branch on success/failure without needing a function-typed config. */
export interface DataDrivenCategoryPolitics {
  /** Politics deltas applied on a successful outcome. */
  onSuccess?: Record<string, number>;
  /** Politics deltas applied on a failed outcome. Defaults to `onSuccess` negated when omitted is too risky — leave undefined to no-op on failure. */
  onFailure?: Record<string, number>;
}

/**
 * The top-level scenario config consumed by the factory. Lives next
 * to the scenario.json or inline in the wrapper module.
 */
export interface DataDrivenScenarioConfig {
  /** System prompt for the Crisis Director LLM. Should describe the
   *  scenario domain, the categories of crises, and the metrics the
   *  director should anchor crises against. */
  directorInstructions: string;

  /** Per-department prompt context. Keys are department ids matching
   *  scenario.departments[].id; values are the chip specs. Departments
   *  not in this map render the engine's generic chip line. */
  departments: Record<string, DataDrivenDepartmentSpec>;

  /** Posture rules checked top-to-bottom. The first match wins. The
   *  default fallback is `'mixed-posture'` if no rule matches. */
  postureRules: DataDrivenPostureRule[];

  /** Per-axis fingerprint bands rendered into the per-run summary. */
  fingerprintAxes: DataDrivenFingerprintAxis[];

  /** Per-category politics deltas. Categories without an entry no-op. */
  politics: Record<string, DataDrivenCategoryPolitics>;

  /** Per-agent reaction context template. The factory passes the agent
   *  and turn context; the template should anchor the agent voice to
   *  their role + department + the scenario domain. */
  reactionTemplate: (agent: Agent, ctx: { time: number; turn: number }) => string;
}

/**
 * Resolve a `metrics.alignmentBench` style path against a runtime
 * SimulationState bag. Returns undefined for missing paths so the
 * formatter can fall back to a `?` chip rather than crashing.
 */
function readPath(state: SimulationState, path: string): unknown {
  const [bag, leaf] = path.split('.', 2);
  if (!leaf) return undefined;
  switch (bag) {
    case 'metrics':
      return (state.metrics as Record<string, unknown>)[leaf];
    case 'politics':
      return (state.politics as Record<string, unknown>)[leaf];
    case 'environment':
      return state.environment[leaf];
    case 'statuses':
      return state.statuses[leaf];
    default:
      return undefined;
  }
}

/**
 * Format a chip value according to its declared format flag. Falls
 * back to a `?` chip for missing / non-numeric values where a number
 * was expected so the dept prompt reads cleanly even under partial
 * scenario state.
 */
function formatChip(chip: DataDrivenChip, raw: unknown): string {
  if (chip.format === 'string') {
    return `${chip.label}: ${raw == null ? '?' : String(raw)}`;
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return `${chip.label}: ?`;
  }
  if (chip.format === 'percent') {
    return `${chip.label}: ${(raw * 100).toFixed(0)}%`;
  }
  // 'number' — three decimals for sub-1 fractions, plain integer otherwise.
  if (Math.abs(raw) > 0 && Math.abs(raw) < 1) {
    return `${chip.label}: ${raw.toFixed(3)}`;
  }
  return `${chip.label}: ${raw.toLocaleString('en-US', { maximumFractionDigits: 1 })}`;
}

/**
 * Build a flat `metric/politic/environment` view of state for posture
 * + fingerprint rules. Each axis can read any field by its leaf name
 * without having to know which bag it lives in. Status fields surface
 * as their string values. Last writer wins on collisions, but in
 * practice scenarios use unique leaf names across bags.
 */
function flattenState(state: SimulationState): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  for (const [k, v] of Object.entries(state.metrics)) {
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out[k] = v;
  }
  for (const [k, v] of Object.entries(state.politics)) {
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out[k] = v;
  }
  for (const [k, v] of Object.entries(state.environment)) {
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out[k] = v;
  }
  for (const [k, v] of Object.entries(state.statuses)) {
    // Same primitive-only filter as the other bags. SimulationState
    // types statuses as `Record<string, string | boolean>` so this
    // is defense-in-depth against future scenario configs adding
    // exotic state values that the rule lambdas can't reason about.
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/**
 * Build a {@link ScenarioHooks} record from a {@link DataDrivenScenarioConfig}.
 * Wrappers like atlas-lab/index.ts and dual-superintelligence-council/
 * index.ts call this once at module init and spread the result into
 * the {@link ScenarioPackage}'s `hooks` field. Mars/Lunar bypass this
 * because their domain hooks (bone density, regolith exposure) don't
 * fit the data-driven shape.
 */
export function buildDataDrivenHooks(config: DataDrivenScenarioConfig): ScenarioHooks {
  return {
    departmentPromptHook: (ctx) => {
      const spec = config.departments[ctx.department];
      if (!spec) return [];
      const chips = spec.chips
        .map((chip) => formatChip(chip, readPath(ctx.state, chip.source)))
        .join(' | ');
      const lines = [spec.heading, chips];
      if (spec.footer) lines.push(spec.footer);
      lines.push('');
      return lines;
    },

    directorInstructions: () => config.directorInstructions,

    fingerprintHook: (
      finalState: SimulationState,
      _outcomeLog: Array<{ turn: number; time: number; outcome: string }>,
      _leader: ActorConfig,
      _toolRegs: Record<string, string[]>,
      _maxTurns: number,
    ) => {
      const flat = flattenState(finalState);
      const out: Record<string, string> = {};
      const matched = config.postureRules.find((rule) => {
        try {
          return rule.when(flat);
        } catch {
          return false;
        }
      });
      out.posture = matched ? matched.posture : 'mixed-posture';
      for (const axis of config.fingerprintAxes) {
        try {
          out[axis.name] = axis.when(flat);
        } catch {
          out[axis.name] = 'unknown';
        }
      }
      return out;
    },

    politicsHook: (category, outcome) => {
      const entry = config.politics[category];
      if (!entry) return null;
      // Defensive string-check: orchestrator typing says `outcome` is
      // a string, but a stray null/undefined from a malformed runtime
      // event would otherwise throw inside endsWith. Treat anything
      // non-string as a failure so the failure-side deltas apply.
      const isSuccess = typeof outcome === 'string' && outcome.endsWith('success');
      return isSuccess
        ? entry.onSuccess ?? null
        : entry.onFailure ?? null;
    },

    reactionContextHook: (agent, ctx) => config.reactionTemplate(agent, ctx),
  };
}
