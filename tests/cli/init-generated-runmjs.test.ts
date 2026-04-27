import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRunMjs } from '../../src/cli/init-templates.js';

test('renderRunMjs imports runSimulation from paracosm/runtime, not paracosm', () => {
  const out = renderRunMjs();
  assert.ok(out.includes(`from 'paracosm/runtime'`), 'must import from paracosm/runtime subpath');
  assert.ok(!/from\s+['"]paracosm['"]/.test(out), 'must not import from bare paracosm root');
});

test('renderRunMjs uses positional runSimulation(actor, [], opts) signature', () => {
  const out = renderRunMjs();
  // Must not pass an options object as the first argument.
  assert.ok(!/runSimulation\(\s*\{/.test(out), 'first arg must be an actor, not an options object');
  // Must pass actor (variable) followed by an empty array literal.
  assert.match(out, /runSimulation\(\s*actor\s*,\s*\[\s*\]\s*,/, 'must call runSimulation(actor, [], { ... })');
});

test('renderRunMjs uses maxTurns, never bare turns', () => {
  const out = renderRunMjs();
  assert.ok(out.includes('maxTurns:'), 'must use maxTurns');
  assert.ok(!/\bturns:\s*\d/.test(out), 'must not use bare turns: <number>');
});

test('renderRunMjs does not embed a mode literal in the runSimulation call', () => {
  const out = renderRunMjs();
  // mode is a property of RunArtifact.metadata, not a runSimulation input.
  assert.ok(!/runSimulation\([\s\S]*mode\s*:/.test(out), 'mode must not appear inside runSimulation options');
});

test('renderRunMjs produces output without unfilled template placeholders', () => {
  const out = renderRunMjs();
  assert.ok(!out.includes('${'), 'no template-literal placeholders should leak through');
  assert.ok(!out.includes('TEMPLATE_'), 'no debug placeholders');
});
