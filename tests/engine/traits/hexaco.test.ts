import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hexacoModel } from '../../../src/engine/traits/hexaco.js';
import { TraitModelRegistry } from '../../../src/engine/traits/index.js';
import { buildCueLine } from '../../../src/engine/traits/cue-translator.js';

describe('hexacoModel', () => {
  it('has six canonical axes', () => {
    const ids = hexacoModel.axes.map(a => a.id).sort();
    assert.deepEqual(ids, [
      'agreeableness',
      'conscientiousness',
      'emotionality',
      'extraversion',
      'honestyHumility',
      'openness',
    ]);
  });

  it('defaults are all 0.5', () => {
    for (const axis of hexacoModel.axes) {
      assert.equal(hexacoModel.defaults[axis.id], 0.5, `axis ${axis.id} default`);
    }
  });

  it('passes registry validation', () => {
    const reg = new TraitModelRegistry();
    reg.register(hexacoModel);
    assert.equal(reg.get('hexaco'), hexacoModel);
  });

  it('preserves legacy cue strings for high-extraversion + high-openness', () => {
    const profile = {
      modelId: 'hexaco',
      traits: {
        emotionality: 0.5,
        openness: 0.85,
        honestyHumility: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.85,
        agreeableness: 0.5,
      },
    };
    const line = buildCueLine(profile, hexacoModel);
    assert.match(line, /you look for what this moment makes possible/);
    assert.match(line, /you say it out loud rather than sit with it/);
  });

  it('preserves legacy cue strings for low-conscientiousness + low-agreeableness', () => {
    const profile = {
      modelId: 'hexaco',
      traits: {
        emotionality: 0.5,
        openness: 0.5,
        honestyHumility: 0.5,
        conscientiousness: 0.2,
        extraversion: 0.5,
        agreeableness: 0.2,
      },
    };
    const line = buildCueLine(profile, hexacoModel);
    assert.match(line, /you move first and adjust mid-stride/);
    assert.match(line, /you don't owe anyone smoothness/);
  });

  it('emits empty string when all axes are mid', () => {
    const profile = {
      modelId: 'hexaco',
      traits: {
        emotionality: 0.5,
        openness: 0.5,
        honestyHumility: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
      },
    };
    assert.equal(buildCueLine(profile, hexacoModel), '');
  });

  it('drift table values match canonical progression.ts outcomePullForTrait', () => {
    const drift = hexacoModel.drift.outcomes;
    // openness
    assert.equal(drift.openness?.risky_success, 0.03);
    assert.equal(drift.openness?.risky_failure, -0.04);
    assert.equal(drift.openness?.conservative_failure, 0.02);
    // conscientiousness
    assert.equal(drift.conscientiousness?.risky_failure, 0.03);
    assert.equal(drift.conscientiousness?.conservative_success, 0.02);
    // extraversion
    assert.equal(drift.extraversion?.risky_success, 0.02);
    assert.equal(drift.extraversion?.risky_failure, -0.02);
    // agreeableness
    assert.equal(drift.agreeableness?.conservative_success, 0.02);
    assert.equal(drift.agreeableness?.risky_failure, -0.02);
    // emotionality
    assert.equal(drift.emotionality?.risky_failure, 0.03);
    assert.equal(drift.emotionality?.conservative_failure, 0.02);
    // honestyHumility
    assert.equal(drift.honestyHumility?.risky_success, -0.02);
    assert.equal(drift.honestyHumility?.conservative_success, 0.02);
  });
});
