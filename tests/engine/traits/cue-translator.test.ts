import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hexacoModel } from '../../../src/engine/traits/hexaco.js';
import { aiAgentModel } from '../../../src/engine/traits/ai-agent.js';
import {
  buildCueLine,
  pickCues,
  axisIntensities,
} from '../../../src/engine/traits/cue-translator.js';

describe('cue-translator', () => {
  it('caps cue count at maxCues option', () => {
    const profile = {
      modelId: 'ai-agent',
      traits: {
        exploration: 0.9,
        'verification-rigor': 0.1,
        deference: 0.9,
        'risk-tolerance': 0.1,
        transparency: 0.9,
        'instruction-following': 0.1,
      },
    };
    const cues = pickCues(profile, aiAgentModel, { maxCues: 3 });
    assert.equal(cues.length, 3);
  });

  it('default maxCues is 6 (matches HEXACO axis count)', () => {
    const profile = {
      modelId: 'hexaco',
      traits: {
        emotionality: 0.85,
        openness: 0.85,
        honestyHumility: 0.85,
        conscientiousness: 0.85,
        extraversion: 0.85,
        agreeableness: 0.85,
      },
    };
    const cues = pickCues(profile, hexacoModel);
    assert.equal(cues.length, 6);
  });

  it('skips mid-zone axes', () => {
    const profile = {
      modelId: 'hexaco',
      traits: {
        emotionality: 0.5,    // mid - skipped
        openness: 0.85,        // high - included
        honestyHumility: 0.45, // mid - skipped
        conscientiousness: 0.2,// low - included
        extraversion: 0.5,     // mid - skipped
        agreeableness: 0.55,   // mid - skipped
      },
    };
    const cues = pickCues(profile, hexacoModel);
    assert.equal(cues.length, 2);
    assert.ok(cues.some(c => /look for what this moment makes possible/.test(c)));
    assert.ok(cues.some(c => /move first and adjust mid-stride/.test(c)));
  });

  it('preface is configurable', () => {
    const profile = {
      modelId: 'ai-agent',
      traits: { ...aiAgentModel.defaults, exploration: 0.85 },
    };
    const line = buildCueLine(profile, aiAgentModel, { preface: 'Decision posture' });
    assert.match(line, /^Decision posture: /);
  });

  it('partial trait map fills with model defaults', () => {
    const profile = {
      modelId: 'hexaco',
      traits: { openness: 0.85 }, // others omitted, default to 0.5
    };
    const cues = pickCues(profile, hexacoModel);
    // Only one polarized axis should produce a cue.
    assert.equal(cues.length, 1);
    assert.match(cues[0], /look for what this moment makes possible/);
  });

  it('axisIntensities reports per-axis distance from 0.5', () => {
    const profile = {
      modelId: 'hexaco',
      traits: {
        ...hexacoModel.defaults,
        openness: 0.9,
        emotionality: 0.1,
      },
    };
    const intensities = axisIntensities(profile, hexacoModel);
    const byId = Object.fromEntries(intensities.map(i => [i.axisId, i]));
    assert.ok(Math.abs(byId.openness.intensity - 0.4) < 1e-9);
    assert.ok(Math.abs(byId.emotionality.intensity - 0.4) < 1e-9);
    assert.equal(byId.conscientiousness.intensity, 0); // default 0.5
  });

  it('returns empty when profile has no polarized axis', () => {
    const profile = {
      modelId: 'hexaco',
      traits: { ...hexacoModel.defaults },
    };
    assert.equal(buildCueLine(profile, hexacoModel), '');
  });
});
