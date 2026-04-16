import test from 'node:test';
import assert from 'node:assert/strict';
import { marsFingerprint } from '../../../src/engine/mars/fingerprint.js';

test('marsFingerprint classifies high-morale colony as antifragile', () => {
  const result = marsFingerprint(
    { colony: { morale: 0.75 }, politics: { earthDependencyPct: 30 }, agents: [{ health: { alive: true }, core: { marsborn: true } }, { health: { alive: true }, core: { marsborn: false } }] },
    [{ turn: 1, year: 2035, outcome: 'risky_success' }, { turn: 2, year: 2037, outcome: 'risky_success' }],
    { hexaco: { extraversion: 0.9, conscientiousness: 0.3 } },
    { medical: ['tool1', 'tool2', 'tool3'] },
    3,
  );
  assert.equal(result.resilience, 'antifragile');
  assert.equal(result.autonomy, 'autonomous');
  assert.equal(result.governance, 'charismatic');
  assert.equal(result.riskProfile, 'expansionist');
  assert.ok(result.summary.includes('antifragile'));
});

test('marsFingerprint classifies low-morale colony as brittle', () => {
  const result = marsFingerprint(
    { colony: { morale: 0.2 }, politics: { earthDependencyPct: 80 }, agents: [{ health: { alive: true }, core: { marsborn: false } }] },
    [{ turn: 1, year: 2035, outcome: 'conservative_success' }, { turn: 2, year: 2037, outcome: 'conservative_success' }],
    { hexaco: { extraversion: 0.3, conscientiousness: 0.9 } },
    {},
    3,
  );
  assert.equal(result.resilience, 'brittle');
  assert.equal(result.autonomy, 'Earth-tethered');
  assert.equal(result.governance, 'technocratic');
  assert.equal(result.riskProfile, 'conservative');
  assert.equal(result.identity, 'Earth-diaspora');
});

test('marsFingerprint identity is Martian when Mars-born > 30%', () => {
  const agents = [
    { health: { alive: true }, core: { marsborn: true } },
    { health: { alive: true }, core: { marsborn: true } },
    { health: { alive: true }, core: { marsborn: false } },
  ];
  const result = marsFingerprint(
    { colony: { morale: 0.5 }, politics: { earthDependencyPct: 50 }, agents },
    [], { hexaco: { extraversion: 0.5, conscientiousness: 0.5 } }, {}, 3,
  );
  assert.equal(result.identity, 'Martian');
});
