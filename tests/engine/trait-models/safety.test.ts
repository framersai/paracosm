/**
 * Negative-path + defensive-behavior tests. Locks in the trait-model
 * surface's resilience against the failure modes CodeRabbit flagged
 * during the trait-model implementation review:
 *
 *   - Cue translator silently skips axes whose model.cues entry
 *     omits the relevant zone (low / mid / high). Mid is intentionally
 *     never emitted; low/high are optional per CueZone interface.
 *   - Drift dispatcher treats missing outcome entries as zero delta,
 *     never throws.
 *   - normalizeLeaderConfig rejects traitProfile.traits keys that
 *     reference axes the named model does not declare.
 *   - Replay fails fast when modelId references an unregistered
 *     model (UnknownTraitModelError surfaces from require()).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TraitModelRegistry,
  UnknownTraitModelError,
  type TraitModel,
} from '../../../src/engine/trait-models/index.js';
import { hexacoModel } from '../../../src/engine/trait-models/hexaco.js';
import { aiAgentModel } from '../../../src/engine/trait-models/ai-agent.js';
import { buildCueLine, pickCues } from '../../../src/engine/trait-models/cue-translator.js';
import { applyOutcomeDrift, driftLeaderProfile } from '../../../src/engine/trait-models/drift.js';
import { normalizeLeaderConfig } from '../../../src/engine/trait-models/normalize-leader.js';
import type { LeaderConfig } from '../../../src/engine/types.js';

/**
 * A hand-rolled minimal model with deliberately missing zones and
 * outcomes. Used by tests below to verify defensive paths in the
 * cue translator and drift dispatcher.
 */
const sparseModel: TraitModel = {
  id: 'sparse-test',
  name: 'Sparse',
  description: 'Test model with missing zones and outcomes.',
  axes: [
    { id: 'a', label: 'Axis A', description: 'first axis' },
    { id: 'b', label: 'Axis B', description: 'second axis' },
  ],
  defaults: { a: 0.5, b: 0.5 },
  drift: {
    // axis 'a' has only one outcome; axis 'b' is missing entirely.
    outcomes: { a: { risky_failure: 0.04 } },
    leaderPull: { a: 0.05, b: 0.05 },
    roleActivation: { a: 0.02, b: 0.02 },
  },
  cues: {
    // axis 'a' has only the high-pole cue; axis 'b' is missing
    // entirely (no entry in the dictionary).
    a: { high: 'a is high' },
  },
};

describe('cue-translator: missing zone safety', () => {
  it('skips axes whose cue zone is undefined', () => {
    const reg = new TraitModelRegistry();
    reg.register(sparseModel);
    const profile = {
      modelId: 'sparse-test',
      traits: { a: 0.2, b: 0.85 },
    };
    // axis 'a' at low (0.2) has no .low cue -> skipped.
    // axis 'b' at high (0.85) has no entry at all -> skipped.
    const cues = pickCues(profile, sparseModel);
    assert.deepEqual(cues, []);
  });

  it('emits the present cue when zone matches', () => {
    const profile = {
      modelId: 'sparse-test',
      traits: { a: 0.85, b: 0.5 },
    };
    // axis 'a' at high (0.85) -> 'a is high'; axis 'b' mid -> skipped.
    const cues = pickCues(profile, sparseModel);
    assert.deepEqual(cues, ['a is high']);
  });

  it('mid-zone is never emitted by design', () => {
    const profile = {
      modelId: 'hexaco',
      traits: { ...hexacoModel.defaults, openness: 0.5 }, // exactly mid
    };
    const line = buildCueLine(profile, hexacoModel);
    assert.equal(line, '');
  });
});

describe('drift dispatcher: missing outcome safety', () => {
  it('treats missing outcome entry as zero delta (no throw)', () => {
    const profile = {
      modelId: 'sparse-test',
      traits: { a: 0.5, b: 0.5 },
    };
    // sparse model has only 'a' -> 'risky_failure'. Pass 'safe_success'
    // which neither axis defines. Expect no change, no throw.
    const next = applyOutcomeDrift(profile, sparseModel, { outcome: 'safe_success' });
    assert.equal(next.traits.a, 0.5);
    assert.equal(next.traits.b, 0.5);
  });

  it('driftLeaderProfile tolerates missing outcome on every axis', () => {
    const profile = { modelId: 'sparse-test', traits: { a: 0.5, b: 0.5 } };
    const history: Array<{ turn: number; time: number; profile: typeof profile }> = [];
    const next = driftLeaderProfile(profile, sparseModel, {
      outcome: 'conservative_success', // no entry on either axis
      timeDelta: 1,
      turn: 1,
      time: 0,
      history,
    });
    assert.equal(next.traits.a, 0.5);
    assert.equal(next.traits.b, 0.5);
    assert.equal(history.length, 1, 'history snapshot still pushed');
  });

  it('null outcome is also safe (no drift on first turn)', () => {
    const profile = { modelId: 'hexaco', traits: { ...hexacoModel.defaults } };
    const history: Array<{ turn: number; time: number; profile: typeof profile }> = [];
    const next = driftLeaderProfile(profile, hexacoModel, {
      outcome: null,
      timeDelta: 1,
      turn: 1,
      time: 0,
      history,
    });
    for (const axis of hexacoModel.axes) {
      assert.equal(next.traits[axis.id], 0.5, `axis ${axis.id} unchanged on null outcome`);
    }
  });
});

describe('normalizeLeaderConfig: axis validation', () => {
  const baseLeader: LeaderConfig = {
    name: 'Test',
    archetype: 'Test',
    unit: 'Test',
    hexaco: {
      openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5,
    },
    instructions: '',
  };

  it('rejects traitProfile.traits keys that the model does not declare', () => {
    const leader: LeaderConfig = {
      ...baseLeader,
      traitProfile: {
        modelId: 'hexaco',
        traits: {
          openness: 0.5,
          // typo / hallucination: HEXACO has no "creativity" axis
          creativity: 0.7,
        },
      },
    };
    assert.throws(
      () => normalizeLeaderConfig(leader),
      (err: unknown) => {
        assert.match(
          (err as Error).message,
          /references axes not declared by the model: \[creativity\]/,
        );
        return true;
      },
    );
  });

  it('lists every unknown axis when multiple are bad', () => {
    const leader: LeaderConfig = {
      ...baseLeader,
      traitProfile: {
        modelId: 'ai-agent',
        traits: {
          exploration: 0.8,
          // both nonexistent
          creativity: 0.5,
          patience: 0.4,
        },
      },
    };
    assert.throws(
      () => normalizeLeaderConfig(leader),
      (err: unknown) => {
        const msg = (err as Error).message;
        assert.match(msg, /creativity/);
        assert.match(msg, /patience/);
        return true;
      },
    );
  });

  it('allows partial trait maps (missing axes default, no rejection)', () => {
    const leader: LeaderConfig = {
      ...baseLeader,
      traitProfile: {
        modelId: 'ai-agent',
        traits: { exploration: 0.85 }, // others omitted
      },
    };
    const normalized = normalizeLeaderConfig(leader);
    assert.equal(normalized.traitProfile.traits.exploration, 0.85);
    assert.equal(normalized.traitProfile.traits['verification-rigor'], 0.5);
  });

  it('throws clear error when both hexaco and traitProfile are missing', () => {
    const leader = {
      name: 'Phantom',
      archetype: 'X',
      unit: 'Y',
      instructions: '',
      // hexaco intentionally absent (TS escape hatch via runtime cast)
    } as unknown as LeaderConfig;
    assert.throws(
      () => normalizeLeaderConfig(leader),
      /must have either traitProfile or the legacy hexaco field/,
    );
  });
});

describe('UnknownTraitModelError: replay safety', () => {
  it('throws UnknownTraitModelError with registered list in message', () => {
    const reg = new TraitModelRegistry();
    reg.register(hexacoModel);
    reg.register(aiAgentModel);
    try {
      reg.require('zodiac-12-axes');
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(err instanceof UnknownTraitModelError);
      assert.match((err as Error).message, /Unknown trait model id: 'zodiac-12-axes'/);
      assert.match((err as Error).message, /Registered models: hexaco, ai-agent/);
    }
  });

  it('UnknownTraitModelError exposes modelId + registered fields', () => {
    const reg = new TraitModelRegistry();
    reg.register(hexacoModel);
    try {
      reg.require('mystery');
    } catch (err) {
      const utme = err as UnknownTraitModelError;
      assert.equal(utme.modelId, 'mystery');
      assert.deepEqual(utme.registered, ['hexaco']);
      assert.equal(utme.name, 'UnknownTraitModelError');
    }
  });
});
