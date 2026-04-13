import test from 'node:test';
import assert from 'node:assert/strict';
import { MARS_FIRST_NAMES, MARS_LAST_NAMES, MARS_CHILD_NAMES, MARS_DEPARTMENT_DISTRIBUTION, MARS_SPECIALIZATIONS } from './names.js';
import { MARS_DEFAULT_KEY_PERSONNEL, MARS_DEFAULT_LEADERS } from './presets.js';

test('Mars name lists have sufficient entries for population generation', () => {
  assert.ok(MARS_FIRST_NAMES.length >= 50);
  assert.ok(MARS_LAST_NAMES.length >= 50);
  assert.ok(MARS_CHILD_NAMES.length >= 10);
});

test('Mars department distribution covers all departments', () => {
  const depts = new Set(MARS_DEPARTMENT_DISTRIBUTION);
  assert.ok(depts.has('engineering'));
  assert.ok(depts.has('medical'));
  assert.ok(depts.has('agriculture'));
  assert.ok(depts.has('science'));
});

test('Mars specializations covers all departments in distribution', () => {
  const depts = new Set(MARS_DEPARTMENT_DISTRIBUTION);
  for (const dept of depts) {
    assert.ok(MARS_SPECIALIZATIONS[dept], `Missing specializations for ${dept}`);
    assert.ok(MARS_SPECIALIZATIONS[dept].length > 0, `Empty specializations for ${dept}`);
  }
});

test('Mars default key personnel has 5 entries', () => {
  assert.equal(MARS_DEFAULT_KEY_PERSONNEL.length, 5);
  for (const kp of MARS_DEFAULT_KEY_PERSONNEL) {
    assert.ok(kp.name);
    assert.ok(kp.department);
    assert.ok(kp.role);
  }
});

test('Mars default leaders has 2 entries (Aria Chen and Dietrich Voss)', () => {
  assert.equal(MARS_DEFAULT_LEADERS.length, 2);
  assert.equal(MARS_DEFAULT_LEADERS[0].name, 'Aria Chen');
  assert.equal(MARS_DEFAULT_LEADERS[1].name, 'Dietrich Voss');
});
