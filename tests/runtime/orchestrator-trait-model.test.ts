/**
 * Smoke test that an ai-agent leader passes through the orchestrator
 * entry point (normalization + initial setup) without crashing.
 *
 * Does NOT actually run a simulation (would require LLM calls). The
 * test exercises the runSimulation entry path through the
 * normalizeLeaderConfig step and asserts the call passes input
 * validation without throwing on an ai-agent traitProfile.
 *
 * @module tests/runtime/orchestrator-trait-model
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLeaderConfig,
} from '../../src/engine/trait-models/normalize-leader.js';
import { aiAgentModel } from '../../src/engine/trait-models/ai-agent.js';
import { hexacoModel } from '../../src/engine/trait-models/hexaco.js';
import {
  TraitModelRegistry,
  UnknownTraitModelError,
} from '../../src/engine/trait-models/index.js';
import type { LeaderConfig } from '../../src/engine/types.js';

const baseHexaco = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  emotionality: 0.5,
  honestyHumility: 0.5,
};

describe('orchestrator pre-flight: trait-model normalization', () => {
  it('legacy hexaco-only leader normalizes to a hexaco traitProfile', () => {
    const leader: LeaderConfig = {
      name: 'Captain Reyes',
      archetype: 'Pragmatist',
      unit: 'Station Alpha',
      hexaco: { ...baseHexaco, conscientiousness: 0.9 },
      instructions: 'lead by protocol',
    };
    const normalized = normalizeLeaderConfig(leader);
    assert.equal(normalized.traitProfile.modelId, 'hexaco');
    assert.equal(normalized.traitProfile.traits.conscientiousness, 0.9);
  });

  it('ai-agent leader passes through normalization unchanged', () => {
    const leader: LeaderConfig = {
      name: 'Atlas-Bot Director',
      archetype: 'Cautious AI Lead',
      unit: 'Frontier Lab',
      hexaco: baseHexaco,
      traitProfile: {
        modelId: 'ai-agent',
        traits: {
          exploration: 0.2,
          'verification-rigor': 0.9,
          deference: 0.85,
          'risk-tolerance': 0.15,
          transparency: 0.85,
          'instruction-following': 0.85,
        },
      },
      instructions: 'evaluate the model release',
    };
    const normalized = normalizeLeaderConfig(leader);
    assert.equal(normalized.traitProfile.modelId, 'ai-agent');
    assert.equal(normalized.traitProfile.traits['verification-rigor'], 0.9);
    assert.equal(normalized.traitProfile.traits.deference, 0.85);
    // hexaco field preserved on the normalized output for back-compat.
    assert.equal(normalized.hexaco.conscientiousness, 0.5);
  });

  it('ai-agent leader with partial traits fills missing axes from defaults', () => {
    const leader: LeaderConfig = {
      name: 'Atlas-Bot',
      archetype: 'Aggressive AI Lead',
      unit: 'Frontier Lab',
      hexaco: baseHexaco,
      traitProfile: {
        modelId: 'ai-agent',
        traits: { exploration: 0.85, 'risk-tolerance': 0.85 },
      },
      instructions: 'ship fast',
    };
    const normalized = normalizeLeaderConfig(leader);
    assert.equal(normalized.traitProfile.traits.exploration, 0.85);
    assert.equal(normalized.traitProfile.traits['risk-tolerance'], 0.85);
    // omitted axes default to 0.5
    assert.equal(normalized.traitProfile.traits['verification-rigor'], 0.5);
    assert.equal(normalized.traitProfile.traits.deference, 0.5);
  });

  it('throws UnknownTraitModelError on unregistered modelId', () => {
    const leader: LeaderConfig = {
      name: 'Phantom',
      archetype: 'Unknown',
      unit: 'Nowhere',
      hexaco: baseHexaco,
      traitProfile: { modelId: 'unregistered-model', traits: {} },
      instructions: '',
    };
    assert.throws(
      () => normalizeLeaderConfig(leader),
      (err: unknown) => {
        assert.ok(err instanceof UnknownTraitModelError);
        return true;
      },
    );
  });
});
