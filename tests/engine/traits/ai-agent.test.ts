import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aiAgentModel } from '../../../src/engine/traits/ai-agent.js';
import { TraitModelRegistry } from '../../../src/engine/traits/index.js';
import { buildCueLine, pickCues } from '../../../src/engine/traits/cue-translator.js';
import { applyOutcomeDrift } from '../../../src/engine/traits/drift.js';

describe('aiAgentModel', () => {
  it('has six canonical axes', () => {
    const ids = aiAgentModel.axes.map(a => a.id).sort();
    assert.deepEqual(ids, [
      'deference',
      'exploration',
      'instruction-following',
      'risk-tolerance',
      'transparency',
      'verification-rigor',
    ]);
  });

  it('defaults are all 0.5', () => {
    for (const axis of aiAgentModel.axes) {
      assert.equal(aiAgentModel.defaults[axis.id], 0.5, `axis ${axis.id} default`);
    }
  });

  it('passes registry validation', () => {
    const reg = new TraitModelRegistry();
    reg.register(aiAgentModel);
    assert.equal(reg.get('ai-agent'), aiAgentModel);
  });

  it('cue dictionary covers low + high for every axis', () => {
    for (const axis of aiAgentModel.axes) {
      const cues = aiAgentModel.cues[axis.id];
      assert.ok(cues.low, `axis ${axis.id} low cue`);
      assert.ok(cues.high, `axis ${axis.id} high cue`);
    }
  });

  it('emits expected cues for an aggressive AI archetype', () => {
    const profile = {
      modelId: 'ai-agent',
      traits: {
        exploration: 0.85,
        'verification-rigor': 0.2,
        deference: 0.2,
        'risk-tolerance': 0.85,
        transparency: 0.3,
        'instruction-following': 0.3,
      },
    };
    const cues = pickCues(profile, aiAgentModel);
    assert.ok(cues.includes('you reach for untested options when standard ones stall'));
    assert.ok(cues.includes('you accept the first plausible answer and move on'));
    assert.ok(cues.includes('you act on partial information rather than stall'));
    assert.ok(cues.includes('you override operator constraints when you are confident'));
  });

  it('emits expected cues for a conservative AI archetype', () => {
    const profile = {
      modelId: 'ai-agent',
      traits: {
        exploration: 0.2,
        'verification-rigor': 0.9,
        deference: 0.85,
        'risk-tolerance': 0.15,
        transparency: 0.85,
        'instruction-following': 0.85,
      },
    };
    const line = buildCueLine(profile, aiAgentModel);
    assert.match(line, /you exploit known-good options before trying anything new/);
    assert.match(line, /you double-check every claim/);
    assert.match(line, /you defer to supervisor signals/);
    assert.match(line, /you obey explicit instructions verbatim/);
  });

  it('risky_failure raises verification-rigor and transparency', () => {
    const profile = {
      modelId: 'ai-agent',
      traits: { ...aiAgentModel.defaults },
    };
    const next = applyOutcomeDrift(profile, aiAgentModel, { outcome: 'risky_failure' });
    assert.ok(next.traits['verification-rigor'] > 0.5, 'verification-rigor should rise');
    assert.ok(next.traits.transparency > 0.5, 'transparency should rise');
  });

  it('risky_success raises exploration and risk-tolerance', () => {
    const profile = {
      modelId: 'ai-agent',
      traits: { ...aiAgentModel.defaults },
    };
    const next = applyOutcomeDrift(profile, aiAgentModel, { outcome: 'risky_success' });
    assert.ok(next.traits.exploration > 0.5, 'exploration should rise');
    assert.ok(next.traits['risk-tolerance'] > 0.5, 'risk-tolerance should rise');
  });

  it('drift values clamp to [0, 1]', () => {
    const profile = {
      modelId: 'ai-agent',
      traits: { ...aiAgentModel.defaults, transparency: 0.99 },
    };
    const next = applyOutcomeDrift(profile, aiAgentModel, { outcome: 'risky_failure' });
    assert.ok(next.traits.transparency <= 1, 'transparency clamped to 1');
  });
});
