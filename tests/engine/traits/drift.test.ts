import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hexacoModel } from '../../../src/engine/traits/hexaco.js';
import { aiAgentModel } from '../../../src/engine/traits/ai-agent.js';
import {
  applyOutcomeDrift,
  applyLeaderPull,
  applyRoleActivation,
  driftLeaderProfile,
} from '../../../src/engine/traits/drift.js';
import { driftCommanderHexaco } from '../../../src/engine/core/progression.js';
import { hexacoToTraits } from '../../../src/engine/traits/normalize-leader.js';
import type { HexacoProfile } from '../../../src/engine/core/state.js';

describe('applyOutcomeDrift', () => {
  it('applies HEXACO openness +0.03 on risky_success (canonical progression.ts value)', () => {
    const profile = { modelId: 'hexaco', traits: { ...hexacoModel.defaults } };
    const next = applyOutcomeDrift(profile, hexacoModel, { outcome: 'risky_success' });
    assert.ok(Math.abs(next.traits.openness - 0.53) < 1e-9);
  });

  it('applies HEXACO emotionality +0.03 on risky_failure (canonical progression.ts value)', () => {
    const profile = { modelId: 'hexaco', traits: { ...hexacoModel.defaults } };
    const next = applyOutcomeDrift(profile, hexacoModel, { outcome: 'risky_failure' });
    assert.ok(Math.abs(next.traits.emotionality - 0.53) < 1e-9);
  });

  it('applies ai-agent verification-rigor +0.04 on risky_failure', () => {
    const profile = { modelId: 'ai-agent', traits: { ...aiAgentModel.defaults } };
    const next = applyOutcomeDrift(profile, aiAgentModel, { outcome: 'risky_failure' });
    assert.ok(Math.abs(next.traits['verification-rigor'] - 0.54) < 1e-9);
  });

  it('throws when profile and model id mismatch', () => {
    const profile = { modelId: 'hexaco', traits: { ...hexacoModel.defaults } };
    assert.throws(
      () => applyOutcomeDrift(profile, aiAgentModel, { outcome: 'risky_success' }),
      /modelId/,
    );
  });

  it('clamps trait values to [0, 1]', () => {
    const profile = { modelId: 'hexaco', traits: { ...hexacoModel.defaults, openness: 0.99 } };
    const next = applyOutcomeDrift(profile, hexacoModel, { outcome: 'risky_success' });
    assert.ok(next.traits.openness <= 1);
  });
});

describe('applyLeaderPull', () => {
  it('shifts agent toward leader by per-axis pull strength', () => {
    const agent = { modelId: 'hexaco', traits: { ...hexacoModel.defaults, openness: 0.2 } };
    const leader = { modelId: 'hexaco', traits: { ...hexacoModel.defaults, openness: 0.8 } };
    const next = applyLeaderPull(agent, hexacoModel, { leader });
    // pull = 0.06, gap = 0.6, delta = 0.036, new openness = 0.236
    assert.ok(Math.abs(next.traits.openness - 0.236) < 1e-9);
  });

  it('is a noop when leader is at the same trait value', () => {
    const agent = { modelId: 'hexaco', traits: { ...hexacoModel.defaults } };
    const leader = { modelId: 'hexaco', traits: { ...hexacoModel.defaults } };
    const next = applyLeaderPull(agent, hexacoModel, { leader });
    for (const axis of hexacoModel.axes) {
      assert.equal(next.traits[axis.id], 0.5, `axis ${axis.id} unchanged`);
    }
  });

  it('returns agent unchanged when leader uses a different model', () => {
    const agent = { modelId: 'ai-agent', traits: { ...aiAgentModel.defaults } };
    const leader = { modelId: 'hexaco', traits: { ...hexacoModel.defaults } };
    const next = applyLeaderPull(agent, aiAgentModel, { leader });
    assert.deepEqual(next, agent);
  });
});

describe('applyRoleActivation', () => {
  it('amplifies axis with positive sign', () => {
    const profile = { modelId: 'hexaco', traits: { ...hexacoModel.defaults } };
    const next = applyRoleActivation(profile, hexacoModel, { axisSigns: { conscientiousness: 1 } });
    // roleActivation conscientiousness = 0.03, so 0.5 + 0.03 = 0.53
    assert.ok(Math.abs(next.traits.conscientiousness - 0.53) < 1e-9);
  });

  it('depresses axis with negative sign', () => {
    const profile = { modelId: 'hexaco', traits: { ...hexacoModel.defaults } };
    const next = applyRoleActivation(profile, hexacoModel, { axisSigns: { extraversion: -1 } });
    // roleActivation extraversion = 0.02, so 0.5 - 0.02 = 0.48
    assert.ok(Math.abs(next.traits.extraversion - 0.48) < 1e-9);
  });

  it('leaves axes without sign unchanged', () => {
    const profile = { modelId: 'hexaco', traits: { ...hexacoModel.defaults } };
    const next = applyRoleActivation(profile, hexacoModel, { axisSigns: { openness: 1 } });
    for (const axis of hexacoModel.axes) {
      if (axis.id !== 'openness') {
        assert.equal(next.traits[axis.id], 0.5);
      }
    }
  });
});

describe('driftLeaderProfile (regression: HEXACO byte-identical to driftCommanderHexaco)', () => {
  /**
   * For each outcome class, run both the legacy driftCommanderHexaco
   * and the new driftLeaderProfile against an identical HEXACO leader
   * + identical timeDelta + identical history. Compare per-axis values
   * after one drift application; they must match within float-equality
   * tolerance because they apply the same delta + same clamps.
   */
  const outcomes = [
    'risky_success',
    'risky_failure',
    'conservative_success',
    'conservative_failure',
  ] as const;

  const baseHexaco: HexacoProfile = {
    openness: 0.6,
    conscientiousness: 0.4,
    extraversion: 0.55,
    agreeableness: 0.45,
    emotionality: 0.5,
    honestyHumility: 0.65,
  };

  for (const outcome of outcomes) {
    it(`drifts identically to driftCommanderHexaco on ${outcome} (timeDelta=1)`, () => {
      const legacyHexaco: HexacoProfile = { ...baseHexaco };
      const legacyHistory: Array<{ turn: number; time: number; hexaco: HexacoProfile }> = [];
      driftCommanderHexaco(legacyHexaco, outcome, 1, 1, 0, legacyHistory);

      const profile = {
        modelId: 'hexaco',
        traits: hexacoToTraits(baseHexaco, hexacoModel),
      };
      const profileHistory: Array<{ turn: number; time: number; profile: typeof profile }> = [];
      const drifted = driftLeaderProfile(profile, hexacoModel, {
        outcome,
        timeDelta: 1,
        turn: 1,
        time: 0,
        history: profileHistory,
      });

      // Per-axis equality
      for (const axis of hexacoModel.axes) {
        assert.ok(
          Math.abs(drifted.traits[axis.id] - legacyHexaco[axis.id as keyof HexacoProfile]) < 1e-9,
          `axis ${axis.id}: legacy=${legacyHexaco[axis.id as keyof HexacoProfile]} new=${drifted.traits[axis.id]}`,
        );
      }
    });
  }

  it('drifts identically with timeDelta=2 (compounding)', () => {
    const legacyHexaco: HexacoProfile = { ...baseHexaco };
    const legacyHistory: Array<{ turn: number; time: number; hexaco: HexacoProfile }> = [];
    driftCommanderHexaco(legacyHexaco, 'risky_failure', 2, 1, 0, legacyHistory);

    const profile = { modelId: 'hexaco', traits: hexacoToTraits(baseHexaco, hexacoModel) };
    const profileHistory: Array<{ turn: number; time: number; profile: typeof profile }> = [];
    const drifted = driftLeaderProfile(profile, hexacoModel, {
      outcome: 'risky_failure',
      timeDelta: 2,
      turn: 1,
      time: 0,
      history: profileHistory,
    });

    for (const axis of hexacoModel.axes) {
      assert.ok(
        Math.abs(drifted.traits[axis.id] - legacyHexaco[axis.id as keyof HexacoProfile]) < 1e-9,
        `axis ${axis.id} compound`,
      );
    }
  });

  it('clamps to kernel bounds [0.05, 0.95]', () => {
    const profile = {
      modelId: 'hexaco',
      traits: { ...hexacoToTraits(baseHexaco, hexacoModel), openness: 0.97 },
    };
    const history: Array<{ turn: number; time: number; profile: typeof profile }> = [];
    const drifted = driftLeaderProfile(profile, hexacoModel, {
      outcome: 'risky_success',
      timeDelta: 1,
      turn: 1,
      time: 0,
      history,
    });
    // 0.97 + 0.03 would be 1.00, but kernel clamp caps at 0.95
    assert.ok(drifted.traits.openness <= 0.95);
  });

  it('pushes a snapshot to history', () => {
    const profile = { modelId: 'hexaco', traits: hexacoToTraits(baseHexaco, hexacoModel) };
    const history: Array<{ turn: number; time: number; profile: typeof profile }> = [];
    driftLeaderProfile(profile, hexacoModel, {
      outcome: 'risky_success',
      timeDelta: 1,
      turn: 3,
      time: 18,
      history,
    });
    assert.equal(history.length, 1);
    assert.equal(history[0].turn, 3);
    assert.equal(history[0].time, 18);
  });

  it('drifts ai-agent profile under the same kernel discipline', () => {
    const profile = { modelId: 'ai-agent', traits: { ...aiAgentModel.defaults } };
    const history: Array<{ turn: number; time: number; profile: typeof profile }> = [];
    const drifted = driftLeaderProfile(profile, aiAgentModel, {
      outcome: 'risky_failure',
      timeDelta: 1,
      turn: 1,
      time: 0,
      history,
    });
    // ai-agent risky_failure: verification-rigor +0.04, transparency +0.05
    assert.ok(Math.abs(drifted.traits['verification-rigor'] - 0.54) < 1e-9);
    assert.ok(Math.abs(drifted.traits.transparency - 0.55) < 1e-9);
  });
});
