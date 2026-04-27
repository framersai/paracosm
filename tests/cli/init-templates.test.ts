import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderPackageJson,
  renderRunMjs,
  renderReadme,
  renderEnvExample,
  renderGitignore,
  slugifyName,
} from '../../src/cli/init-templates.js';

test('renderPackageJson produces parseable JSON with caret dep', () => {
  const out = renderPackageJson({ name: 'submarine-sim', paracosmVersion: '1.0.0' });
  const parsed = JSON.parse(out);
  assert.equal(parsed.name, 'submarine-sim');
  assert.equal(parsed.type, 'module');
  assert.equal(parsed.dependencies.paracosm, '^1.0.0');
  assert.equal(parsed.scripts.start, 'node run.mjs');
});

test('renderRunMjs imports runSimulation from paracosm/runtime with positional args', () => {
  const out = renderRunMjs();
  assert.ok(out.includes(`from 'paracosm/runtime'`), 'must import from paracosm/runtime');
  assert.match(out, /runSimulation\(\s*actor\s*,\s*\[\s*\]\s*,/, 'must use positional signature');
  assert.ok(out.includes('maxTurns:'), 'must use maxTurns');
  assert.ok(out.includes('readFileSync'), 'must read scenario.json + actors.json');
});

test('renderReadme contains the user-supplied name + truncated domain + mode', () => {
  const longDomain = 'x'.repeat(300);
  const out = renderReadme({ name: 'demo', domain: longDomain, mode: 'turn-loop', actors: 3 });
  assert.ok(out.includes('# demo'));
  assert.ok(out.includes('turn-loop'));
  assert.ok(out.includes('3 HEXACO actor configs'));
  assert.ok(out.includes('...'), 'long domain must be truncated with ellipsis');
});

test('renderEnvExample names OPENAI_API_KEY', () => {
  const out = renderEnvExample();
  assert.ok(out.includes('OPENAI_API_KEY='));
});

test('renderGitignore covers node_modules, .env, .paracosm', () => {
  const out = renderGitignore();
  assert.ok(out.includes('node_modules/'));
  assert.ok(out.includes('.env'));
  assert.ok(out.includes('.paracosm/'));
});

test('slugifyName lowercases, dashifies, strips weird chars, caps at 50', () => {
  assert.equal(slugifyName('Submarine Survival Sim!'), 'submarine-survival-sim');
  assert.equal(slugifyName('  Multi   Spaces  '), 'multi-spaces');
  assert.equal(slugifyName('!!!@@@'), 'paracosm-app');
  assert.equal(slugifyName('a'.repeat(80)).length, 50);
});
