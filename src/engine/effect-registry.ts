type TurnOutcome = 'risky_success' | 'risky_failure' | 'conservative_success' | 'conservative_failure';

const OUTCOME_MULTIPLIERS: Record<TurnOutcome, number> = {
  risky_success: 2.5,
  risky_failure: -2.0,
  conservative_success: 1.0,
  conservative_failure: -1.0,
};

export interface OutcomeModifiers {
  personalityBonus: number;
  noise: number;
}

export class EffectRegistry {
  private effects: Record<string, Record<string, number>>;
  private fallback: Record<string, number>;

  constructor(
    categoryEffects: Record<string, Record<string, number>>,
    fallback: Record<string, number> = { morale: 0.08 },
  ) {
    this.effects = categoryEffects;
    this.fallback = fallback;
  }

  getBaseEffect(category: string): Record<string, number> {
    return this.effects[category] ?? { ...this.fallback };
  }

  applyOutcome(
    category: string,
    outcome: TurnOutcome,
    modifiers: OutcomeModifiers,
  ): Record<string, number> {
    const base = this.getBaseEffect(category);
    const multiplier = OUTCOME_MULTIPLIERS[outcome];
    const deltas: Record<string, number> = {};

    for (const [key, value] of Object.entries(base)) {
      const raw = value * (multiplier + modifiers.personalityBonus + modifiers.noise);
      deltas[key] = Math.round(raw * 100) / 100;
    }

    return deltas;
  }
}
