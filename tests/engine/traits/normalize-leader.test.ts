import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeActorConfig,
  hexacoToTraits,
  traitsToHexaco,
} from '../../../src/engine/traits/normalize-leader.js';
import { hexacoModel } from '../../../src/engine/traits/hexaco.js';
import { aiAgentModel } from '../../../src/engine/traits/ai-agent.js';
import {
  TraitModelRegistry,
  UnknownTraitModelError,
} from '../../../src/engine/traits/index.js';
import type { ActorConfig } from '../../../src/engine/types.js';

const baseLegacyLeader: ActorConfig = {
  name: 'Captain Reyes',
  archetype: 'Pragmatist',
  unit: 'Station Alpha',
  hexaco: {
    openness: 0.4,
    conscientiousness: 0.9,
    extraversion: 0.3,
    agreeableness: 0.6,
    emotionality: 0.5,
    honestyHumility: 0.8,
  },
  instructions: 'lead by protocol',
};

function freshRegistry() {
  const reg = new TraitModelRegistry();
  reg.register(hexacoModel);
  reg.register(aiAgentModel);
  return reg;
}

describe('normalizeActorConfig', () => {
  it('synthesizes traitProfile from legacy hexaco field', () => {
    const reg = freshRegistry();
    const normalized = normalizeActorConfig(baseLegacyLeader, { registry: reg });
    assert.equal(normalized.traitProfile.modelId, 'hexaco');
    assert.equal(normalized.traitProfile.traits.openness, 0.4);
    assert.equal(normalized.traitProfile.traits.conscientiousness, 0.9);
    assert.equal(normalized.traitProfile.traits.honestyHumility, 0.8);
  });

  it('preserves explicit traitProfile when set', () => {
    const reg = freshRegistry();
    const leader: ActorConfig = {
      ...baseLegacyLeader,
      traitProfile: {
        modelId: 'ai-agent',
        traits: {
          exploration: 0.85,
          'verification-rigor': 0.2,
          deference: 0.2,
          'risk-tolerance': 0.85,
          transparency: 0.3,
          'instruction-following': 0.3,
        },
      },
    };
    const normalized = normalizeActorConfig(leader, { registry: reg });
    assert.equal(normalized.traitProfile.modelId, 'ai-agent');
    assert.equal(normalized.traitProfile.traits.exploration, 0.85);
    // Hexaco field is preserved on the normalized output (back-compat).
    assert.equal(normalized.hexaco.openness, 0.4);
  });

  it('fills missing axes with model defaults', () => {
    const reg = freshRegistry();
    const leader: ActorConfig = {
      ...baseLegacyLeader,
      traitProfile: {
        modelId: 'ai-agent',
        traits: { exploration: 0.85 }, // others omitted, default to 0.5
      },
    };
    const normalized = normalizeActorConfig(leader, { registry: reg });
    assert.equal(normalized.traitProfile.traits.exploration, 0.85);
    assert.equal(normalized.traitProfile.traits.deference, 0.5);
    assert.equal(normalized.traitProfile.traits['verification-rigor'], 0.5);
  });

  it('throws UnknownTraitModelError on unregistered modelId', () => {
    const reg = freshRegistry();
    const leader: ActorConfig = {
      ...baseLegacyLeader,
      traitProfile: { modelId: 'nope', traits: {} },
    };
    assert.throws(
      () => normalizeActorConfig(leader, { registry: reg }),
      (err: unknown) => {
        assert.ok(err instanceof UnknownTraitModelError);
        return true;
      },
    );
  });

  it('uses the singleton registry by default', () => {
    // The singleton has hexaco + ai-agent registered via builtins.ts.
    // No `registry` option passed.
    const normalized = normalizeActorConfig(baseLegacyLeader);
    assert.equal(normalized.traitProfile.modelId, 'hexaco');
  });
});

describe('hexacoToTraits + traitsToHexaco round trip', () => {
  it('hexacoToTraits preserves all six axes', () => {
    const traits = hexacoToTraits(baseLegacyLeader.hexaco, hexacoModel);
    assert.equal(traits.openness, 0.4);
    assert.equal(traits.conscientiousness, 0.9);
    assert.equal(traits.extraversion, 0.3);
    assert.equal(traits.agreeableness, 0.6);
    assert.equal(traits.emotionality, 0.5);
    assert.equal(traits.honestyHumility, 0.8);
  });

  it('traitsToHexaco fills missing axes with 0.5', () => {
    const profile = traitsToHexaco({ openness: 0.85 });
    assert.equal(profile.openness, 0.85);
    assert.equal(profile.conscientiousness, 0.5);
    assert.equal(profile.extraversion, 0.5);
  });

  it('traitsToHexaco clamps out-of-range values', () => {
    const profile = traitsToHexaco({ openness: 1.5, emotionality: -0.3 });
    assert.equal(profile.openness, 1);
    assert.equal(profile.emotionality, 0);
  });

  it('round-trip preserves HEXACO values', () => {
    const traits = hexacoToTraits(baseLegacyLeader.hexaco, hexacoModel);
    const back = traitsToHexaco(traits);
    assert.deepEqual(back, baseLegacyLeader.hexaco);
  });
});
