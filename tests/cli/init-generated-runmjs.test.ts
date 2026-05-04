import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRunMjs } from '../../src/cli/init-templates.js';

test('renderRunMjs imports WorldModel from paracosm root', () => {
  const out = renderRunMjs();
  assert.ok(/from\s+['"]paracosm['"]/.test(out), 'must import from bare paracosm root');
  assert.ok(!out.includes(`paracosm/runtime`), 'must not import from removed v0.8 /runtime subpath');
  assert.ok(!out.includes(`paracosm/world-model`), 'must not import from removed v0.8 /world-model subpath');
});

test('renderRunMjs uses v0.9 wm.simulate({ actor, ... }) options-bag', () => {
  const out = renderRunMjs();
  // The actor goes inside the options bag, not as a positional arg.
  assert.match(out, /wm\.simulate\(\{/, 'must use options-bag wm.simulate({ ... })');
  assert.ok(out.includes('actor: actors[0]'), 'must pass actor as a named option');
  assert.ok(!/runSimulation\b/.test(out), 'must not reference removed top-level runSimulation');
});

test('renderRunMjs uses maxTurns, never bare turns', () => {
  const out = renderRunMjs();
  assert.ok(out.includes('maxTurns:'), 'must use maxTurns');
  assert.ok(!/\bturns:\s*\d/.test(out), 'must not use bare turns: <number>');
});

test('renderRunMjs does not embed a mode literal in the simulate call', () => {
  const out = renderRunMjs();
  // mode is a property of RunArtifact.metadata, not a simulate input.
  assert.ok(!/simulate\([\s\S]*mode\s*:/.test(out), 'mode must not appear inside simulate options');
});

test('renderRunMjs produces output without unfilled template placeholders', () => {
  const out = renderRunMjs();
  assert.ok(!out.includes('${'), 'no template-literal placeholders should leak through');
  assert.ok(!out.includes('TEMPLATE_'), 'no debug placeholders');
});
