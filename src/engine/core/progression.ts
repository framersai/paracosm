import type { Agent, WorldSystems, TurnEvent, SimulationState, HexacoProfile, TurnOutcome } from './state.js';
import { HEXACO_TRAITS } from './state.js';
import { SeededRng } from './rng.js';

// Trait activation profiles per department role (Tett & Burnett 2003)
const ROLE_ACTIVATIONS: Record<string, Partial<HexacoProfile>> = {
  medical:     { conscientiousness: 0.7, emotionality: 0.6, agreeableness: 0.6 },
  engineering: { conscientiousness: 0.9, openness: 0.3 },
  agriculture: { conscientiousness: 0.6, agreeableness: 0.7, openness: 0.5 },
  psychology:  { agreeableness: 0.8, emotionality: 0.7, openness: 0.6 },
  governance:  { extraversion: 0.7, honestyHumility: 0.6 },
};

export { ROLE_ACTIVATIONS };

/**
 * Apply personality drift to all promoted colonists. Deterministic from inputs.
 * Three forces: leader pull, role pull, outcome pull.
 */
export function applyPersonalityDrift(
  colonists: Agent[],
  commanderHexaco: HexacoProfile,
  turnOutcome: TurnOutcome | null,
  yearDelta: number,
  turn: number,
  year: number,
): void {
  for (const c of colonists) {
    if (!c.health.alive || !c.promotion) continue;

    const dept = c.promotion.department;
    const activation = ROLE_ACTIVATIONS[dept] ?? {};

    for (const trait of HEXACO_TRAITS) {
      let pull = 0;

      // Leader pull: traits converge toward commander (Van Iddekinge 2023)
      pull += (commanderHexaco[trait] - c.hexaco[trait]) * 0.02;

      // Role pull: department role activates specific traits (Tett & Burnett 2003)
      if (activation[trait] !== undefined) {
        pull += (activation[trait]! - c.hexaco[trait]) * 0.01;
      }

      // Outcome pull: success/failure reinforces or punishes traits
      if (turnOutcome) {
        if (trait === 'openness') {
          if (turnOutcome === 'risky_success') pull += 0.03;
          if (turnOutcome === 'risky_failure') pull -= 0.04;
          if (turnOutcome === 'conservative_failure') pull += 0.02;
        }
        if (trait === 'conscientiousness') {
          if (turnOutcome === 'risky_failure') pull += 0.03;
          if (turnOutcome === 'conservative_success') pull += 0.02;
        }
      }

      // Rate cap and bounds
      const delta = Math.max(-0.05, Math.min(0.05, pull)) * yearDelta;
      c.hexaco[trait] = Math.max(0.05, Math.min(0.95, c.hexaco[trait] + delta));
    }

    c.hexacoHistory.push({ turn, year, hexaco: { ...c.hexaco } });
  }
}

/**
 * Classify turn outcome as risky/conservative success/failure.
 * Deterministic from seed + decision text.
 */
export function classifyOutcome(
  decisionText: string,
  riskyOption: string,
  riskSuccessProbability: number,
  colony: WorldSystems,
  rng: SeededRng,
): TurnOutcome {
  const isRisky = decisionText.toLowerCase().includes(riskyOption.toLowerCase());

  let prob = riskSuccessProbability;
  if (colony.morale > 0.7) prob += 0.1;
  if (colony.foodMonthsReserve > 12) prob += 0.05;
  if (colony.population > 150) prob -= 0.05;
  prob = Math.max(0.1, Math.min(0.9, prob));

  const success = rng.chance(prob);

  if (isRisky && success) return 'risky_success';
  if (isRisky && !success) return 'risky_failure';
  if (!isRisky && success) return 'conservative_success';
  return 'conservative_failure';
}

/**
 * Classify turn outcome using structured option ID.
 * Preferred over text-based classifyOutcome.
 */
export function classifyOutcomeById(
  selectedOptionId: string,
  options: Array<{ id: string; isRisky: boolean }>,
  riskSuccessProbability: number,
  colony: WorldSystems,
  rng: SeededRng,
): TurnOutcome {
  const selected = options.find(o => o.id === selectedOptionId);
  const isRisky = selected?.isRisky ?? false;

  let prob = riskSuccessProbability;
  if (colony.morale > 0.7) prob += 0.1;
  if (colony.foodMonthsReserve > 12) prob += 0.05;
  if (colony.population > 150) prob -= 0.05;
  prob = Math.max(0.1, Math.min(0.9, prob));

  const success = rng.chance(prob);

  if (isRisky && success) return 'risky_success';
  if (isRisky && !success) return 'risky_failure';
  if (!isRisky && success) return 'conservative_success';
  return 'conservative_failure';
}

/**
 * Run all between-turn progression: aging, mortality, births, careers,
 * health degradation, resource production. All deterministic from seed.
 */
export function progressBetweenTurns(
  state: SimulationState,
  yearDelta: number,
  turnRng: SeededRng,
  progressionHook?: (ctx: { agents: any[]; yearDelta: number; year: number; turn: number; startYear: number; rng: any }) => void,
): { state: SimulationState; events: TurnEvent[] } {
  const events: TurnEvent[] = [];
  const year = state.metadata.currentYear;
  const turn = state.metadata.currentTurn;
  let colonists = state.agents.map(c => structuredClone(c));
  let colony = structuredClone(state.colony);

  // 1. Age all colonists (generic: experience, earth contacts)
  for (const c of colonists) {
    if (!c.health.alive) continue;
    c.career.yearsExperience += yearDelta;

    // Earth contacts decay
    if (c.social.earthContacts > 0 && turnRng.chance(0.15 * yearDelta)) {
      c.social.earthContacts = Math.max(0, c.social.earthContacts - 1);
    }
  }

  // 1b. Scenario-specific progression (radiation, bone density, etc.)
  if (progressionHook) {
    progressionHook({ agents: colonists, yearDelta, year, turn, startYear: state.metadata.startYear, rng: turnRng });
  }

  // 2. Mortality — multi-cause. Each cause independently rolls and
  // attributes a specific reason of death, so the dashboard can break
  // down "8 deaths: 3 starvation, 2 radiation cancer, 2 accidents,
  // 1 suicide" instead of reporting a faceless total.
  const killColonist = (c: Agent, cause: string, description: string) => {
    if (!c.health.alive) return;
    const age = year - c.core.birthYear;
    c.health.alive = false;
    c.health.deathYear = year;
    c.health.deathCause = cause;
    c.narrative.lifeEvents.push({ year, event: `Died at age ${age} (${cause})`, source: 'kernel' });
    events.push({ turn, year, type: 'death', description: `${c.core.name}: ${description}`, agentId: c.core.id, cause });
  };

  for (const c of colonists) {
    if (!c.health.alive) continue;
    const age = year - c.core.birthYear;

    // 2a. Natural mortality (age-dependent)
    if (age >= 60) {
      let mortalityProb = 0;
      if (age >= 60) mortalityProb = 0.01 * yearDelta;
      if (age >= 70) mortalityProb = 0.03 * yearDelta;
      if (age >= 80) mortalityProb = 0.08 * yearDelta;
      if (age >= 90) mortalityProb = 0.20 * yearDelta;
      if (turnRng.chance(Math.min(mortalityProb, 0.5))) {
        killColonist(c, age >= 80 ? 'natural causes' : 'age-related complications',
          `died at age ${age} of ${age >= 80 ? 'natural causes' : 'age-related complications'}`);
        continue;
      }
    }

    // 2b. Radiation cancer — separate cause attribution so the
    // dashboard can show cumulative radiation as a distinct mortality
    // story from natural aging. Gated at adult ages so kids do not die
    // of radiation exposure the kernel is still accumulating.
    if (age >= 30 && (c.health.cumulativeRadiationMsv ?? 0) > 1000) {
      const rad = c.health.cumulativeRadiationMsv ?? 0;
      let radProb = 0;
      if (rad > 1000) radProb = 0.02 * yearDelta;
      if (rad > 2000) radProb = 0.05 * yearDelta;
      if (rad > 3500) radProb = 0.10 * yearDelta;
      if (turnRng.chance(Math.min(radProb, 0.3))) {
        killColonist(c, 'radiation cancer',
          `died at age ${age} of radiation-induced cancer (cumulative ${Math.round(rad)} mSv)`);
        continue;
      }
    }

    // 2c. Starvation — colony-wide food reserve below a month triggers
    // per-colonist starvation risk. Every colonist is equally at risk;
    // it is colony-scale, not individual.
    if (colony.foodMonthsReserve < 1.0) {
      const starveProb = (1.0 - colony.foodMonthsReserve) * 0.15 * yearDelta;
      if (turnRng.chance(Math.min(starveProb, 0.3))) {
        killColonist(c, 'starvation',
          `died at age ${age} of starvation (colony food reserve ${colony.foodMonthsReserve.toFixed(1)} months)`);
        continue;
      }
    }

    // 2d. Despair — low psych score + high emotionality → suicide /
    // slow decline risk. Covered as a real phenomenon in long-duration
    // isolation studies (Antarctic, submarine crews, ISS).
    if (age >= 18 && c.health.psychScore < 0.2) {
      const despairProb = (0.2 - c.health.psychScore) * 0.25 * yearDelta * (0.5 + c.hexaco.emotionality);
      if (turnRng.chance(Math.min(despairProb, 0.2))) {
        killColonist(c, 'despair',
          `died at age ${age} of prolonged psychological decline (psych ${c.health.psychScore.toFixed(2)})`);
        continue;
      }
    }

    // 2e. Bone-density fracture — Mars-specific. Below ~60% bone
    // density fracture risk becomes meaningful; severe falls can
    // cascade to fatal in a low-medical-capacity environment. Gated
    // on age >= 40 since younger colonists have reserve to recover.
    if (age >= 40 && typeof c.health.boneDensityPct === 'number' && c.health.boneDensityPct < 60) {
      const fractureProb = (60 - c.health.boneDensityPct) * 0.003 * yearDelta;
      if (turnRng.chance(Math.min(fractureProb, 0.15))) {
        killColonist(c, 'fatal fracture',
          `died at age ${age} of a fall-induced fracture (bone density ${c.health.boneDensityPct.toFixed(0)}%)`);
        continue;
      }
    }

    // 2f. Baseline accident risk — small but non-zero, reflecting
    // mundane EVA / construction / life-support hazards that exist in
    // any Mars habitat. Weighted by role: engineering + medical
    // colonists are more often in hazardous positions than governance.
    const roleAccidentWeight: Record<string, number> = {
      engineering: 1.5,
      medical: 1.2,
      agriculture: 1.0,
      science: 0.9,
      psychology: 0.6,
      governance: 0.5,
    };
    const accidentBase = 0.003 * yearDelta;
    const accidentProb = accidentBase * (roleAccidentWeight[c.core.department ?? 'science'] ?? 1.0);
    if (age >= 18 && turnRng.chance(accidentProb)) {
      const descriptors = ['airlock failure', 'EVA accident', 'falling debris', 'pressure-suit tear', 'vehicle rollover'];
      const descriptor = turnRng.pick(descriptors);
      killColonist(c, `accident: ${descriptor}`,
        `died at age ${age} in a ${descriptor}`);
      continue;
    }
  }

  // 3. Births
  const aliveAdults = colonists.filter(c => c.health.alive && (year - c.core.birthYear) >= 20 && (year - c.core.birthYear) <= 42);
  const birthProb = colony.morale > 0.4 && colony.foodMonthsReserve > 6 ? 0.08 * yearDelta : 0.02 * yearDelta;
  const potentialParents = aliveAdults.filter(c => c.social.childrenIds.length < 3);

  for (let i = 0; i < potentialParents.length - 1; i += 2) {
    if (turnRng.chance(birthProb)) {
      const p1 = potentialParents[i];
      const p2 = potentialParents[i + 1];
      const childName = `${turnRng.pick(['Nova', 'Kai', 'Sol', 'Tera', 'Eos', 'Zan', 'Lyra', 'Orion', 'Vega', 'Juno', 'Atlas', 'Iris', 'Clio', 'Pax', 'Io', 'Thea'])} ${p1.core.name.split(' ').pop()}`;
      const childId = `col-mars-${year}-${turnRng.int(1000, 9999)}`;
      // Child inherits blend of parents' traits with slight noise
      const childHexaco: any = {};
      for (const trait of ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'emotionality', 'honestyHumility'] as const) {
        childHexaco[trait] = Math.max(0.05, Math.min(0.95,
          (p1.hexaco[trait] + p2.hexaco[trait]) / 2 + turnRng.next() * 0.1 - 0.05
        ));
      }
      const child: Agent = {
        core: { id: childId, name: childName, birthYear: year, marsborn: true, department: 'science', role: 'Child' },
        health: { alive: true, boneDensityPct: 88, cumulativeRadiationMsv: 0, psychScore: 0.9, conditions: [] },
        career: { specialization: 'Undetermined', yearsExperience: 0, rank: 'junior', achievements: ['Born on Mars'] },
        social: { childrenIds: [], friendIds: [], earthContacts: 0 },
        narrative: { lifeEvents: [{ year, event: `Born on Mars to ${p1.core.name} and ${p2.core.name}`, source: 'kernel' }], featured: false },
        hexaco: childHexaco,
        hexacoHistory: [{ turn, year, hexaco: { ...childHexaco } }],
        memory: { shortTerm: [], longTerm: [], stances: {}, relationships: {} },
      };
      p1.social.childrenIds.push(childId);
      p2.social.childrenIds.push(childId);
      p1.narrative.lifeEvents.push({ year, event: `Child born: ${childName}`, source: 'kernel' });
      p2.narrative.lifeEvents.push({ year, event: `Child born: ${childName}`, source: 'kernel' });
      colonists.push(child);
      events.push({ turn, year, type: 'birth', description: `${childName} born to ${p1.core.name} and ${p2.core.name}`, agentId: childId });
    }
  }

  // 4. Career progression
  for (const c of colonists) {
    if (!c.health.alive) continue;
    const age = year - c.core.birthYear;

    // Mars-born children enter workforce at 18
    if (c.core.role === 'Child' && age >= 18) {
      c.core.department = turnRng.pick(['medical', 'engineering', 'agriculture', 'science'] as const);
      c.career.specialization = turnRng.pick(['General', 'Support', 'Research']);
      c.core.role = `Junior ${c.career.specialization} Specialist`;
      c.career.rank = 'junior';
      c.narrative.lifeEvents.push({ year, event: `Began career in ${c.core.department}`, source: 'kernel' });
    }

    if (age < 18) continue;

    if (c.career.rank === 'junior' && c.career.yearsExperience >= 5 && turnRng.chance(0.15 * yearDelta)) {
      c.career.rank = 'senior';
      c.narrative.lifeEvents.push({ year, event: `Promoted to Senior ${c.career.specialization}`, source: 'kernel' });
      events.push({ turn, year, type: 'promotion', description: `${c.core.name} promoted to senior`, agentId: c.core.id });
    }
    if (c.career.rank === 'senior' && c.career.yearsExperience >= 12 && turnRng.chance(0.08 * yearDelta)) {
      c.career.rank = 'lead';
      c.narrative.lifeEvents.push({ year, event: `Promoted to Lead ${c.career.specialization}`, source: 'kernel' });
      events.push({ turn, year, type: 'promotion', description: `${c.core.name} promoted to lead`, agentId: c.core.id });
    }
  }

  // 5. Relationship-driven psych effects
  // Deaths cause grief in partners, children, and friends
  const deadThisTurn = new Set(events.filter(e => e.type === 'death' && e.agentId).map(e => e.agentId!));
  for (const c of colonists) {
    if (!c.health.alive) continue;

    // Partner died this turn: major psych hit
    if (c.social.partnerId && deadThisTurn.has(c.social.partnerId)) {
      c.health.psychScore = Math.max(0, c.health.psychScore - 0.25);
      c.narrative.lifeEvents.push({ year, event: `Partner died. Grief.`, source: 'kernel' });
      c.social.partnerId = undefined;
    }

    // Friend died: moderate psych hit
    const friendIds = c.social.friendIds || [];
    const deadFriends = friendIds.filter(id => deadThisTurn.has(id));
    if (deadFriends.length) {
      c.health.psychScore = Math.max(0, c.health.psychScore - 0.08 * deadFriends.length);
      c.social.friendIds = friendIds.filter(id => !deadThisTurn.has(id));
    }

    // Parent of dead child: devastating
    const childIds = c.social.childrenIds || [];
    const deadChildren = childIds.filter(id => deadThisTurn.has(id));
    if (deadChildren.length) {
      c.health.psychScore = Math.max(0, c.health.psychScore - 0.35);
      c.narrative.lifeEvents.push({ year, event: `Lost a child. Devastated.`, source: 'kernel' });
    }

    // Having a partner provides a psych buffer
    if (c.social.partnerId) {
      c.health.psychScore = Math.min(1, c.health.psychScore + 0.02 * yearDelta);
    }

    // Earth contacts provide comfort but decay over time
    if (c.social.earthContacts > 0) {
      c.health.psychScore = Math.min(1, c.health.psychScore + 0.01 * yearDelta);
    }

    // Isolation penalty: no partner, no friends, no earth contacts
    if (!c.social.partnerId && (c.social.friendIds || []).length === 0 && c.social.earthContacts === 0) {
      c.health.psychScore = Math.max(0, c.health.psychScore - 0.04 * yearDelta);
    }
  }

  // 5b. Form new relationships (partnerships and friendships)
  const singles = colonists.filter(c => c.health.alive && !c.social.partnerId && (year - c.core.birthYear) >= 20);
  for (let i = 0; i < singles.length - 1; i += 2) {
    if (turnRng.chance(0.05 * yearDelta)) {
      singles[i].social.partnerId = singles[i + 1].core.id;
      singles[i + 1].social.partnerId = singles[i].core.id;
      singles[i].narrative.lifeEvents.push({ year, event: `Partnered with ${singles[i + 1].core.name}`, source: 'kernel' });
      singles[i + 1].narrative.lifeEvents.push({ year, event: `Partnered with ${singles[i].core.name}`, source: 'kernel' });
      events.push({ turn, year, type: 'relationship', description: `${singles[i].core.name} and ${singles[i + 1].core.name} partnered`, agentId: singles[i].core.id });
    }
  }

  // 5c. Form friendships within departments
  const alive = colonists.filter(c => c.health.alive && (c.social.friendIds || []).length < 5);
  for (let i = 0; i < alive.length - 1; i++) {
    const a = alive[i], b = alive[i + 1];
    if (!a.social.friendIds) a.social.friendIds = [];
    if (!b.social.friendIds) b.social.friendIds = [];
    if (a.core.department === b.core.department && !a.social.friendIds.includes(b.core.id) && turnRng.chance(0.08 * yearDelta)) {
      a.social.friendIds.push(b.core.id);
      b.social.friendIds.push(a.core.id);
    }
  }

  // 6. Morale drift (now informed by average psych scores)
  const aliveColonists = colonists.filter(c => c.health.alive);
  const avgPsych = aliveColonists.length ? aliveColonists.reduce((s, c) => s + c.health.psychScore, 0) / aliveColonists.length : 0.5;
  const psychPressure = avgPsych < 0.4 ? -0.06 : avgPsych > 0.7 ? 0.03 : 0;
  const foodPressure = colony.foodMonthsReserve < 6 ? -0.05 : 0;
  const popPressure = aliveColonists.length > colony.lifeSupportCapacity ? -0.08 : 0;
  const deathShock = deadThisTurn.size > 2 ? -0.04 * deadThisTurn.size : 0;
  colony.morale = Math.max(0, Math.min(1, colony.morale + (0.6 - colony.morale) * 0.1 + foodPressure + popPressure + psychPressure + deathShock));

  // 7. Update population count
  colony.population = aliveColonists.length;

  // 8. Resource production
  colony.foodMonthsReserve = Math.max(0, colony.foodMonthsReserve - (yearDelta * 0.5) + (colony.infrastructureModules * 0.3 * yearDelta));
  colony.scienceOutput += yearDelta;

  return {
    state: { ...state, agents: colonists, colony, eventLog: [...state.eventLog, ...events] },
    events,
  };
}
