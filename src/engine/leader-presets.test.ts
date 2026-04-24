import test from 'node:test';
import assert from 'node:assert/strict';

import { LEADER_PRESETS, getPresetById, listPresetsByTrait } from './leader-presets.js';

test('LEADER_PRESETS: exports exactly 10 archetypes', () => {
  assert.equal(Object.keys(LEADER_PRESETS).length, 10);
});

test('LEADER_PRESETS: every HEXACO trait is in [0, 1]', () => {
  for (const preset of Object.values(LEADER_PRESETS)) {
    for (const [trait, value] of Object.entries(preset.hexaco)) {
      assert.ok(value >= 0 && value <= 1, `${preset.id}.${trait} out of bounds: ${value}`);
    }
  }
});

test('LEADER_PRESETS: every preset has name, archetype, description under 140 chars', () => {
  for (const preset of Object.values(LEADER_PRESETS)) {
    assert.ok(preset.name.length > 0, `${preset.id} missing name`);
    assert.ok(preset.archetype.length > 0, `${preset.id} missing archetype`);
    assert.ok(
      preset.description.length > 0 && preset.description.length <= 140,
      `${preset.id} description out of bounds: ${preset.description.length}`,
    );
  }
});

test('LEADER_PRESETS: ids are unique and match record keys', () => {
  for (const [key, preset] of Object.entries(LEADER_PRESETS)) {
    assert.equal(preset.id, key, `${key} id mismatch`);
  }
});

test('getPresetById: round-trips for known ids, undefined for unknown', () => {
  assert.equal(getPresetById('visionary')?.archetype, 'The Visionary');
  assert.equal(getPresetById('nonexistent'), undefined);
});

test('listPresetsByTrait: openness high returns at least 3 presets', () => {
  const result = listPresetsByTrait('openness', true);
  assert.ok(result.length >= 3, `expected >= 3 high-openness presets, got ${result.length}`);
  for (const p of result) {
    assert.ok(p.hexaco.openness > 0.7);
  }
});

test('listPresetsByTrait: emotionality low returns at least 2 presets', () => {
  const result = listPresetsByTrait('emotionality', false);
  assert.ok(result.length >= 2, `expected >= 2 low-emotionality presets, got ${result.length}`);
  for (const p of result) {
    assert.ok(p.hexaco.emotionality < 0.3);
  }
});
