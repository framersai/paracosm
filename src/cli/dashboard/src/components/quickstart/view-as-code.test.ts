import test from 'node:test';
import assert from 'node:assert/strict';

import { renderTsRecipe, renderCurlRecipe, type RecipeInput } from './view-as-code.js';

const baseInput: RecipeInput = {
  seedText: 'A coastal mayor must evacuate.',
  actorCount: 3,
};

test('renderTsRecipe: base case — emits import + fromPrompt with seedText only', () => {
  const out = renderTsRecipe(baseInput);
  assert.match(out, /^import \{ WorldModel \} from 'paracosm\/world-model';/m);
  assert.match(out, /WorldModel\.fromPrompt\(\{/);
  assert.match(out, /seedText: `A coastal mayor must evacuate\.`/);
  assert.match(out, /wm\.quickstart\(\{\}\);/);
  // Defaults are omitted in the base case.
  assert.ok(!out.includes('domainHint'), 'domainHint omitted when undefined');
  assert.ok(!out.includes('sourceUrl'), 'sourceUrl omitted when undefined');
  assert.ok(!out.includes('actorCount'), 'actorCount omitted when default 3');
});

test('renderTsRecipe: escapes literal backticks in seedText', () => {
  const out = renderTsRecipe({ seedText: 'price is `$14`/mo', actorCount: 3 });
  assert.ok(out.includes('seedText: `price is \\`$14\\`/mo`'), out);
});

test('renderTsRecipe: escapes ${ template-literal interpolation in seedText', () => {
  const out = renderTsRecipe({ seedText: 'cost ${burn}', actorCount: 3 });
  assert.ok(out.includes('seedText: `cost \\${burn}`'), out);
});

test('renderTsRecipe: escapes literal backslash in seedText, preserves newlines', () => {
  // Source string has `\` (one backslash) and `\n` (real newline) in
  // characters; the helper doubles backslashes and leaves newlines verbatim.
  const out = renderTsRecipe({ seedText: 'path C:\\users\nbreak', actorCount: 3 });
  assert.ok(out.includes('seedText: `path C:\\\\users\nbreak`'), out);
});

test('renderTsRecipe: emits domainHint when present', () => {
  const out = renderTsRecipe({ ...baseInput, domainHint: 'urban planning' });
  assert.match(out, /domainHint: 'urban planning',/);
});

test('renderTsRecipe: omits domainHint when blank or whitespace', () => {
  const blank = renderTsRecipe({ ...baseInput, domainHint: '' });
  const ws = renderTsRecipe({ ...baseInput, domainHint: '   ' });
  assert.ok(!blank.includes('domainHint'));
  assert.ok(!ws.includes('domainHint'));
});

test('renderTsRecipe: escapes single quote and backslash in domainHint', () => {
  const out = renderTsRecipe({ ...baseInput, domainHint: "Bob's path \\ here" });
  assert.ok(out.includes("domainHint: 'Bob\\'s path \\\\ here'"), out);
});

test('renderTsRecipe: emits sourceUrl when present', () => {
  const out = renderTsRecipe({ ...baseInput, sourceUrl: 'https://example.com/article' });
  assert.match(out, /sourceUrl: 'https:\/\/example\.com\/article',/);
});

test('renderTsRecipe: omits sourceUrl when undefined', () => {
  const out = renderTsRecipe(baseInput);
  assert.ok(!out.includes('sourceUrl'));
});

test('renderTsRecipe: emits actorCount when not the default of 3', () => {
  const out5 = renderTsRecipe({ ...baseInput, actorCount: 5 });
  const out1 = renderTsRecipe({ ...baseInput, actorCount: 1 });
  assert.match(out5, /wm\.quickstart\(\{ actorCount: 5 \}\);/);
  assert.match(out1, /wm\.quickstart\(\{ actorCount: 1 \}\);/);
});

test('renderTsRecipe: omits actorCount when equal to default 3', () => {
  const out = renderTsRecipe(baseInput);
  assert.match(out, /wm\.quickstart\(\{\}\);/);
  assert.ok(!out.includes('actorCount'));
});

test('renderTsRecipe: empty seedText falls back to placeholder, recipe still copies as a recipe', () => {
  const out = renderTsRecipe({ seedText: '', actorCount: 3 });
  assert.match(out, /seedText: `<paste your scenario above>`/);
});

test('renderCurlRecipe: base case — POSTs to compile-from-seed with seedText only', () => {
  const out = renderCurlRecipe(baseInput);
  assert.match(out, /^# This compiles a typed ScenarioPackage from your prompt\./m);
  assert.match(out, /^curl -X POST https:\/\/paracosm\.agentos\.sh\/api\/quickstart\/compile-from-seed/m);
  assert.match(out, /-H 'Content-Type: application\/json'/);
  assert.match(out, /-d '\{"seedText":"A coastal mayor must evacuate\."\}'/);
});

test("renderCurlRecipe: escapes literal single quote in seedText via the sh-quote idiom", () => {
  const out = renderCurlRecipe({ seedText: "it's fine", actorCount: 3 });
  // JSON is `{"seedText":"it's fine"}`; shell wrap with `'...'` and the
  // single quote inside becomes `'\''`. Final emitted -d argument:
  // '{"seedText":"it'\''s fine"}'
  assert.ok(out.includes(`-d '{"seedText":"it'\\''s fine"}'`), out);
});

test('renderCurlRecipe: emits domainHint when present, actorCount when not default', () => {
  const out = renderCurlRecipe({ ...baseInput, domainHint: 'urban planning', actorCount: 5 });
  assert.match(out, /"domainHint":"urban planning"/);
  assert.match(out, /"actorCount":5/);
});

test('renderCurlRecipe: omits domainHint when blank, actorCount when default', () => {
  const out = renderCurlRecipe({ ...baseInput, domainHint: '   ' });
  assert.ok(!out.includes('domainHint'));
  assert.ok(!out.includes('actorCount'));
});

test('renderCurlRecipe: empty seedText falls back to placeholder', () => {
  const out = renderCurlRecipe({ seedText: '', actorCount: 3 });
  assert.match(out, /"seedText":"<paste your scenario above>"/);
});
