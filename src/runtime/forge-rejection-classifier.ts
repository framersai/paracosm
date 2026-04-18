/**
 * Classify a forge rejection's `errorReason` string into one of five
 * categories. Pure string matching against observed AgentOS judge
 * verdict text + paracosm's local shape-check messages.
 *
 * Why this exists: sub-project C exposed a `forges.rejected` counter
 * but the reason text was only visible via SSH'ing pm2 logs. Aggregating
 * by category lets the dashboard and /retry-stats answer
 * "is the LLM's output-schema discipline improving after the forge
 * guidance prompt fix" without a human reading error messages.
 *
 * Categories are deliberately narrow — we only split out patterns that
 * appeared clearly in the 2026-04-18 production log sample (where
 * ~92% of rejections were schema-extra-field) and leave anything
 * unrecognized in the `other` bucket.
 *
 * @module paracosm/runtime/forge-rejection-classifier
 */

/** Rejection-reason category. */
export type ForgeRejectionCategory =
  /** Implementation returned output fields not declared in outputSchema
   *  (violates additionalProperties:false). #1 production failure; the
   *  target the 2026-04-18 forge-guidance prompt fix is trying to cut. */
  | 'schema_extra_field'
  /** Paracosm's pre-judge shape check caught a malformed request
   *  (empty testCases, empty schema properties, empty-input testCases). */
  | 'shape_check'
  /** Judge LLM returned malformed JSON the engine could not parse. */
  | 'parse_error'
  /** Judge flagged logic / correctness / safety concerns in the code
   *  itself (division bugs, threshold inversions, unbounded outputs). */
  | 'judge_correctness'
  /** Everything else. A non-zero `other` bucket is a signal to read
   *  the raw text and consider adding a new category. */
  | 'other';

const SCHEMA_EXTRA_FIELD_PATTERNS = [
  'additional properties',
  'additional property',
  'additionalproperties',
  'extra field',
  'extra fields',
  'extra property',
  'extra properties',
  'undeclared extra field',
  'undeclared field',
  'emits an additional',
  'emits extra',
  'returning an additional',
  'returning extra',
  'returns an additional',
  'returns extra',
  'returns additional',
  'returning an undeclared',
];

/**
 * Regex-based patterns for "extra <modifier> field" phrasings that
 * substring matching misses. Example: "extra recommendations field"
 * is clearly a schema-extra-field rejection but the string "extra field"
 * is not contiguous. This regex catches the general form.
 */
const SCHEMA_EXTRA_FIELD_REGEXES: RegExp[] = [
  /\bextra\s+\w+\s+field\b/,
  /\badditional\s+\w+\s+field\b/,
  /\bextra\s+\w+\s+property\b/,
  /\badditional\s+\w+\s+property\b/,
];

const SHAPE_CHECK_PATTERNS = [
  'shape check failed',
  'inputschema has no declared properties',
  'outputschema has no declared properties',
  'testcases use empty input',
  'testcase use empty input',
  'need at least 2 testcases',
  'every test needs real field values',
];

const PARSE_ERROR_PATTERNS = [
  'failed to parse llm response',
  'could not parse judge response',
  'judge response was not valid json',
];

const JUDGE_CORRECTNESS_PATTERNS = [
  'logic error',
  'threshold ordering',
  'clamped',
  'unclamped',
  'inconsistent risk grading',
  'division by zero',
  'unbounded output',
  'unbounded',
  'returns nan',
  'returns infinity',
  'infinite loop',
  'not deterministic',
  'nondeterministic',
  'correctness is questionable',
  'correctness concern',
  'fails safety',
  'safety concern',
];

/**
 * Classify a rejection reason string. Case-insensitive substring match
 * against pattern lists, evaluated in order: schema_extra_field first
 * (most common), then shape_check (local pre-validator), then
 * parse_error, then judge_correctness, then `other`.
 *
 * Order matters: "violates the declared output schema by returning an
 * additional field due to a logic error" matches BOTH schema_extra_field
 * and judge_correctness; the former wins because it is the more specific
 * and more actionable signal.
 */
export function classifyForgeRejection(errorReason: string | undefined): ForgeRejectionCategory {
  if (!errorReason) return 'other';
  const lower = errorReason.toLowerCase();

  for (const p of SCHEMA_EXTRA_FIELD_PATTERNS) {
    if (lower.includes(p)) return 'schema_extra_field';
  }
  for (const rx of SCHEMA_EXTRA_FIELD_REGEXES) {
    if (rx.test(lower)) return 'schema_extra_field';
  }
  for (const p of SHAPE_CHECK_PATTERNS) {
    if (lower.includes(p)) return 'shape_check';
  }
  for (const p of PARSE_ERROR_PATTERNS) {
    if (lower.includes(p)) return 'parse_error';
  }
  for (const p of JUDGE_CORRECTNESS_PATTERNS) {
    if (lower.includes(p)) return 'judge_correctness';
  }
  return 'other';
}
