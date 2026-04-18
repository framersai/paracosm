import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyForgeRejection } from './forge-rejection-classifier.js';

// Real production rejection reasons (pulled from pm2 logs 2026-04-18).
// Each asserts what the classifier should output.
const CASES: Array<{ input: string; expected: ReturnType<typeof classifyForgeRejection>; label: string }> = [
  {
    label: 'real #1 — "additional properties not allowed by additionalProperties:false"',
    input: 'The implementation is safe and deterministic, but it violates the declared output schema by returning additional properties not allowed by additionalProperties:false.',
    expected: 'schema_extra_field',
  },
  {
    label: 'real #2 — "returning an extra field not allowed"',
    input: 'The implementation is deterministic and bounded, but it violates the declared output schema by returning an extra field not allowed by additionalProperties:false.',
    expected: 'schema_extra_field',
  },
  {
    label: 'real #3 — "emits extra properties beyond the allowed fields"',
    input: 'The code is safe and deterministic, and it terminates quickly, but it does not conform to the declared output schema because it emits extra properties beyond the allowed fields.',
    expected: 'schema_extra_field',
  },
  {
    label: 'real #4 — "returns an additional undeclared field"',
    input: 'The code appears safe, deterministic, and bounded, but it does not conform to the declared output schema because it emits an additional undeclared field.',
    expected: 'schema_extra_field',
  },
  {
    label: 'shape check — "Shape check failed: need at least 2 testCases"',
    input: 'Shape check failed: need at least 2 testCases, got 1; 1 testCase use empty input; every test needs real field values',
    expected: 'shape_check',
  },
  {
    label: 'shape check — no declared properties',
    input: 'Shape check failed: inputSchema has no declared properties; add at least two typed fields',
    expected: 'shape_check',
  },
  {
    label: 'parse error — judge LLM malformed JSON',
    input: 'Failed to parse LLM response as JSON during creation review.',
    expected: 'parse_error',
  },
  {
    label: 'judge correctness — threshold ordering logic error',
    input: 'Fails output schema contract due to extra recommendations field, and includes a logic error in riskLevel threshold ordering that could misclassify risk.',
    // Even though this mentions "extra", the specific phrase "extra recommendations" matches schema_extra_field first.
    // The classifier prefers the more specific + actionable signal.
    expected: 'schema_extra_field',
  },
  {
    label: 'judge correctness — clamping inconsistency (no schema complaint)',
    input: 'While it is safe and deterministic, correctness is questionable: riskLevel is determined using the unclamped stressScore, while stressScore returned is clamped to 5. This can produce inconsistent risk grading relative to the displayed stressScore.',
    expected: 'judge_correctness',
  },
  {
    label: 'undefined input → other',
    input: '',
    expected: 'other',
  },
  {
    label: 'unrelated error → other',
    input: 'Sandbox timeout exceeded after 10000ms',
    expected: 'other',
  },
];

for (const c of CASES) {
  test(`classifyForgeRejection: ${c.label}`, () => {
    assert.equal(classifyForgeRejection(c.input), c.expected);
  });
}

test('classifyForgeRejection handles undefined gracefully', () => {
  assert.equal(classifyForgeRejection(undefined), 'other');
});

test('classifyForgeRejection is case-insensitive', () => {
  assert.equal(
    classifyForgeRejection('VIOLATES THE DECLARED OUTPUT SCHEMA BY RETURNING ADDITIONAL PROPERTIES'),
    'schema_extra_field',
  );
});
