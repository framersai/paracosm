import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCommit,
  classifyCommit,
} from '../../scripts/generate-changelog.mjs';

test('parseCommit extracts type, scope, breaking, subject from "feat(runtime): add X"', () => {
  const c = parseCommit({
    sha: 'abc1234567890abcdef1234567890abcdef12345',
    subject: 'feat(runtime): add new client factory',
    body: '',
    author: 'Jane Dev',
  });
  assert.equal(c.type, 'feat');
  assert.equal(c.scope, 'runtime');
  assert.equal(c.breaking, false);
  assert.equal(c.subject, 'add new client factory');
});

test('parseCommit recognises breaking-change ! marker', () => {
  const c = parseCommit({
    sha: '0'.repeat(40),
    subject: 'feat!: drop deprecated field',
    body: '',
    author: 'Jane Dev',
  });
  assert.equal(c.type, 'feat');
  assert.equal(c.breaking, true);
  assert.equal(c.subject, 'drop deprecated field');
});

test('parseCommit recognises breaking-change via body trailer', () => {
  const c = parseCommit({
    sha: '0'.repeat(40),
    subject: 'refactor(core): reshape internals',
    body: 'Body prose.\n\nBREAKING CHANGE: consumer must update field names.',
    author: 'Jane Dev',
  });
  assert.equal(c.breaking, true);
});

test('parseCommit handles scope-only subjects ("dashboard: X")', () => {
  const c = parseCommit({
    sha: '0'.repeat(40),
    subject: 'dashboard: fix contrast on gradient rows',
    body: '',
    author: 'Jane Dev',
  });
  assert.equal(c.type, null);
  assert.equal(c.scope, null);
  assert.equal(c.breaking, false);
  assert.equal(c.subject, 'dashboard: fix contrast on gradient rows', 'scope-only keeps full subject');
});

test('parseCommit handles no-prefix subjects ("Update README.md")', () => {
  const c = parseCommit({
    sha: '0'.repeat(40),
    subject: 'Update README.md',
    body: '',
    author: 'Jane Dev',
  });
  assert.equal(c.type, null);
  assert.equal(c.scope, null);
  assert.equal(c.subject, 'Update README.md');
});

test('classifyCommit: feat goes to features', () => {
  const c = parseCommit({ sha: '0'.repeat(40), subject: 'feat: add X', body: '', author: 'X' });
  assert.equal(classifyCommit(c), 'features');
});

test('classifyCommit: fix goes to bugfixes', () => {
  const c = parseCommit({ sha: '0'.repeat(40), subject: 'fix: repair Y', body: '', author: 'X' });
  assert.equal(classifyCommit(c), 'bugfixes');
});

test('classifyCommit: perf goes to performance', () => {
  const c = parseCommit({ sha: '0'.repeat(40), subject: 'perf: tighten loop', body: '', author: 'X' });
  assert.equal(classifyCommit(c), 'performance');
});

test('classifyCommit: feat! goes to breaking (not features)', () => {
  const c = parseCommit({ sha: '0'.repeat(40), subject: 'feat!: drop Z', body: '', author: 'X' });
  assert.equal(classifyCommit(c), 'breaking');
});

test('classifyCommit: refactor with BREAKING CHANGE body goes to breaking', () => {
  const c = parseCommit({
    sha: '0'.repeat(40),
    subject: 'refactor: rename things',
    body: 'BREAKING CHANGE: renamed foo to bar',
    author: 'X',
  });
  assert.equal(classifyCommit(c), 'breaking');
});

test('classifyCommit: scope-only "dashboard:" goes to other', () => {
  const c = parseCommit({ sha: '0'.repeat(40), subject: 'dashboard: tweak UI', body: '', author: 'X' });
  assert.equal(classifyCommit(c), 'other');
});

test('classifyCommit: chore goes to other', () => {
  const c = parseCommit({ sha: '0'.repeat(40), subject: 'chore: bump deps', body: '', author: 'X' });
  assert.equal(classifyCommit(c), 'other');
});

test('classifyCommit: docs goes to other', () => {
  const c = parseCommit({ sha: '0'.repeat(40), subject: 'docs: update README', body: '', author: 'X' });
  assert.equal(classifyCommit(c), 'other');
});
