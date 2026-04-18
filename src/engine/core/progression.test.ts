import test from 'node:test';
import assert from 'node:assert/strict';
import { driftCommanderHexaco, applyPersonalityDrift } from './progression.js';
import { HEXACO_TRAITS, type HexacoProfile, type HexacoSnapshot } from './state.js';

const baseline = (): HexacoProfile => ({
  openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
  agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5,
});

test('driftCommanderHexaco pushes snapshot on first call', () => {
  const hex = baseline();
  const history: HexacoSnapshot[] = [];
  driftCommanderHexaco(hex, null, 1, 1, 2041, history);
  assert.equal(history.length, 1);
  assert.equal(history[0].turn, 1);
});

test('driftCommanderHexaco does not drift when outcome is null', () => {
  const hex = baseline();
  const history: HexacoSnapshot[] = [];
  driftCommanderHexaco(hex, null, 1, 1, 2041, history);
  for (const trait of HEXACO_TRAITS) {
    assert.equal(hex[trait], 0.5);
  }
});

test('driftCommanderHexaco drifts openness up on risky_success', () => {
  const hex = baseline();
  const history: HexacoSnapshot[] = [];
  driftCommanderHexaco(hex, 'risky_success', 1, 1, 2041, history);
  assert.ok(hex.openness > 0.5, `expected openness > 0.5, got ${hex.openness}`);
});

test('driftCommanderHexaco drifts openness DOWN on risky_failure', () => {
  const hex = baseline();
  const history: HexacoSnapshot[] = [];
  driftCommanderHexaco(hex, 'risky_failure', 1, 1, 2041, history);
  assert.ok(hex.openness < 0.5, `expected openness < 0.5, got ${hex.openness}`);
});

test('driftCommanderHexaco drifts extraversion on risky_success (new trait)', () => {
  const hex = baseline();
  const history: HexacoSnapshot[] = [];
  driftCommanderHexaco(hex, 'risky_success', 1, 1, 2041, history);
  assert.ok(hex.extraversion > 0.5);
});

test('driftCommanderHexaco drifts emotionality on risky_failure (new trait)', () => {
  const hex = baseline();
  const history: HexacoSnapshot[] = [];
  driftCommanderHexaco(hex, 'risky_failure', 1, 1, 2041, history);
  assert.ok(hex.emotionality > 0.5);
});

test('driftCommanderHexaco respects ±0.05/turn rate cap', () => {
  const hex = baseline();
  const history: HexacoSnapshot[] = [];
  driftCommanderHexaco(hex, 'risky_success', 1, 1, 2041, history);
  for (const trait of HEXACO_TRAITS) {
    assert.ok(Math.abs(hex[trait] - 0.5) <= 0.05, `${trait} drifted too far: ${hex[trait]}`);
  }
});

test('driftCommanderHexaco respects [0.05, 0.95] bounds', () => {
  const hex: HexacoProfile = { ...baseline(), openness: 0.94 };
  const history: HexacoSnapshot[] = [];
  for (let i = 0; i < 10; i++) {
    driftCommanderHexaco(hex, 'risky_success', 1, i, 2041 + i, history);
  }
  assert.ok(hex.openness <= 0.95, `openness exceeded upper bound: ${hex.openness}`);
});

test('driftCommanderHexaco appends snapshot each call', () => {
  const hex = baseline();
  const history: HexacoSnapshot[] = [];
  driftCommanderHexaco(hex, 'risky_success', 1, 1, 2041, history);
  driftCommanderHexaco(hex, 'conservative_success', 1, 2, 2042, history);
  driftCommanderHexaco(hex, 'risky_failure', 1, 3, 2043, history);
  assert.equal(history.length, 3);
  assert.equal(history[0].turn, 1);
  assert.equal(history[2].turn, 3);
});

test('applyPersonalityDrift still drifts openness + conscientiousness', () => {
  const agent = {
    core: { id: 'c1', name: 'X', birthYear: 2010, department: 'medical', role: 'CMO', marsborn: false },
    health: { alive: true, psychScore: 0.8, conditions: [] },
    career: { specialization: 'general', yearsExperience: 5, rank: 'senior' as const, achievements: [] },
    social: { childrenIds: [], friendIds: [], earthContacts: 0 },
    narrative: { featured: false, lifeEvents: [] },
    hexaco: baseline(),
    promotion: { department: 'medical', role: 'CMO', turnPromoted: 0, promotedBy: 'X' } as any,
    hexacoHistory: [] as HexacoSnapshot[],
    memory: { shortTerm: [], longTerm: [], stances: {}, relationships: {} },
  };
  applyPersonalityDrift([agent as any], baseline(), 'risky_success', 1, 1, 2041);
  assert.ok(agent.hexaco.openness > 0.5);
});

test('applyPersonalityDrift drifts NEW traits (E, A, Em, HH)', () => {
  const agent = {
    core: { id: 'c1', name: 'X', birthYear: 2010, department: 'medical', role: 'CMO', marsborn: false },
    health: { alive: true, psychScore: 0.8, conditions: [] },
    career: { specialization: 'general', yearsExperience: 5, rank: 'senior' as const, achievements: [] },
    social: { childrenIds: [], friendIds: [], earthContacts: 0 },
    narrative: { featured: false, lifeEvents: [] },
    hexaco: baseline(),
    promotion: { department: 'medical', role: 'CMO', turnPromoted: 0, promotedBy: 'X' } as any,
    hexacoHistory: [] as HexacoSnapshot[],
    memory: { shortTerm: [], longTerm: [], stances: {}, relationships: {} },
  };
  applyPersonalityDrift([agent as any], baseline(), 'risky_failure', 1, 1, 2041);
  assert.ok(agent.hexaco.emotionality > 0.5, `expected emotionality drift on risky_failure; got ${agent.hexaco.emotionality}`);
});
