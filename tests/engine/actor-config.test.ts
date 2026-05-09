import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeActorConfig } from '../../src/engine/traits/normalize-leader.js';
import type { ActorConfig } from '../../src/engine/types.js';

test('actor with traitProfile but no hexaco normalizes to ai-agent', () => {
  const result = normalizeActorConfig({
    name: 'Atlas-Bot',
    archetype: 'AI safety lab autopilot',
    unit: 'Atlas-7 Release Team',
    traitProfile: {
      modelId: 'ai-agent',
      traits: {
        'exploration': 0.85,
        'verification-rigor': 0.2,
        'deference': 0.2,
        'risk-tolerance': 0.85,
        'transparency': 0.4,
        'instruction-following': 0.3,
      },
    },
    instructions: 'Override safety-team escalations on plausible justification.',
  } as ActorConfig);
  assert.equal(result.traitProfile.modelId, 'ai-agent');
  assert.equal(result.traitProfile.traits['exploration'], 0.85);
});

test('actor with hexaco-only normalizes to hexaco trait profile', () => {
  const result = normalizeActorConfig({
    name: 'Captain Reyes',
    archetype: 'The Pragmatist',
    unit: 'Station Alpha',
    hexaco: { openness: 0.4, conscientiousness: 0.9, extraversion: 0.3, agreeableness: 0.6, emotionality: 0.5, honestyHumility: 0.8 },
    instructions: 'Lead by protocol.',
  });
  assert.equal(result.traitProfile.modelId, 'hexaco');
  assert.equal(result.traitProfile.traits.openness, 0.4);
});

test('actor with neither hexaco nor traitProfile throws clear error', () => {
  assert.throws(
    () => normalizeActorConfig({
      name: 'Ghost',
      archetype: 'Missing Personality',
      unit: 'Nowhere',
      instructions: 'Cannot run.',
    } as ActorConfig),
    /must have either traitProfile or .* hexaco/,
  );
});

test('actor with both hexaco AND traitProfile prefers traitProfile', () => {
  const result = normalizeActorConfig({
    name: 'Hybrid',
    archetype: 'Both',
    unit: 'Test',
    hexaco: { openness: 0.1, conscientiousness: 0.1, extraversion: 0.1, agreeableness: 0.1, emotionality: 0.1, honestyHumility: 0.1 },
    traitProfile: {
      modelId: 'hexaco',
      traits: { openness: 0.9, conscientiousness: 0.9, extraversion: 0.9, agreeableness: 0.9, emotionality: 0.9, honestyHumility: 0.9 },
    },
    instructions: 'Test.',
  });
  // traitProfile wins
  assert.equal(result.traitProfile.traits.openness, 0.9);
});
