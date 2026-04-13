import type { SimulationState, Colonist, TurnEvent, HexacoProfile, TurnOutcome, Department } from './state.js';
import type { ColonySystems, ColonyPolitics } from './state.js';
import { SeededRng } from './rng.js';
import { generateInitialPopulation, type KeyPersonnel } from './colonist-generator.js';
import { progressBetweenTurns, applyPersonalityDrift, ROLE_ACTIVATIONS } from './progression.js';
import { SCENARIOS } from '../research/scenarios.js';

export interface ColonyPatch {
  colony?: Partial<ColonySystems>;
  politics?: Partial<ColonyPolitics>;
  colonistUpdates?: Array<{
    colonistId: string;
    health?: Partial<Colonist['health']>;
    career?: Partial<Colonist['career']>;
  }>;
}

export interface PolicyEffect {
  description: string;
  patches: ColonyPatch;
  events: TurnEvent[];
}

export interface SimulationInitOverrides {
  startYear?: number;
  initialPopulation?: number;
  startingResources?: Partial<ColonySystems>;
  startingPolitics?: Partial<ColonyPolitics>;
}

export class SimulationKernel {
  private state: SimulationState;
  private rng: SeededRng;

  constructor(seed: number, leaderId: string, keyPersonnel: KeyPersonnel[], init: SimulationInitOverrides = {}) {
    this.rng = new SeededRng(seed);
    const startYear = init.startYear ?? 2035;
    const colonists = generateInitialPopulation(seed, startYear, keyPersonnel, init.initialPopulation ?? 100);

    this.state = {
      metadata: {
        simulationId: `sim-${seed}-${leaderId.toLowerCase().replace(/\s+/g, '-')}`,
        leaderId, seed,
        startYear, currentYear: startYear, currentTurn: 0,
      },
      colony: {
        population: colonists.length,
        powerKw: init.startingResources?.powerKw ?? 400,
        foodMonthsReserve: init.startingResources?.foodMonthsReserve ?? 18,
        waterLitersPerDay: init.startingResources?.waterLitersPerDay ?? 800,
        pressurizedVolumeM3: init.startingResources?.pressurizedVolumeM3 ?? 3000,
        lifeSupportCapacity: init.startingResources?.lifeSupportCapacity ?? 120,
        infrastructureModules: init.startingResources?.infrastructureModules ?? 3,
        scienceOutput: init.startingResources?.scienceOutput ?? 0,
        morale: init.startingResources?.morale ?? 0.85,
      },
      colonists,
      politics: {
        earthDependencyPct: init.startingPolitics?.earthDependencyPct ?? 95,
        governanceStatus: init.startingPolitics?.governanceStatus ?? 'earth-governed',
        independencePressure: init.startingPolitics?.independencePressure ?? 0.05,
      },
      eventLog: [],
    };
  }

  getState(): SimulationState { return structuredClone(this.state); }

  getScenario(turn: number) { return SCENARIOS[turn - 1] ?? null; }

  getFeaturedColonists(): Colonist[] {
    return this.state.colonists.filter(c => c.narrative.featured && c.health.alive);
  }

  getAliveColonists(): Colonist[] {
    return this.state.colonists.filter(c => c.health.alive);
  }

  getAliveCount(): number {
    return this.state.colonists.filter(c => c.health.alive).length;
  }

  getDepartmentSummary(dept: string) {
    const m = this.state.colonists.filter(c => c.health.alive && c.core.department === dept);
    if (!m.length) return { count: 0, avgMorale: 0, avgBoneDensity: 0, avgRadiation: 0 };
    return {
      count: m.length,
      avgMorale: m.reduce((s, c) => s + c.health.psychScore, 0) / m.length,
      avgBoneDensity: m.reduce((s, c) => s + c.health.boneDensityPct, 0) / m.length,
      avgRadiation: m.reduce((s, c) => s + c.health.cumulativeRadiationMsv, 0) / m.length,
    };
  }

  /** Apply a policy effect from the commander's decision. */
  applyPolicy(effect: PolicyEffect): void {
    const { patches, events } = effect;

    if (patches.colony) {
      const c = this.state.colony;
      for (const [k, v] of Object.entries(patches.colony)) {
        if (v !== undefined && k in c) (c as any)[k] = v;
      }
      c.population = Math.max(0, c.population);
      c.morale = Math.max(0, Math.min(1, c.morale));
      c.foodMonthsReserve = Math.max(0, c.foodMonthsReserve);
      c.powerKw = Math.max(0, c.powerKw);
    }

    if (patches.politics) {
      const p = this.state.politics;
      for (const [k, v] of Object.entries(patches.politics)) {
        if (v !== undefined && k in p) (p as any)[k] = v;
      }
      p.earthDependencyPct = Math.max(0, Math.min(100, p.earthDependencyPct));
      p.independencePressure = Math.max(0, Math.min(1, p.independencePressure));
    }

    if (patches.colonistUpdates) {
      for (const u of patches.colonistUpdates) {
        const col = this.state.colonists.find(c => c.core.id === u.colonistId);
        if (!col) continue;
        if (u.health) Object.assign(col.health, u.health);
        if (u.career) Object.assign(col.career, u.career);
      }
    }

    this.state.eventLog.push(...events);
  }

  /** Advance to the next turn. Runs between-turn progression. */
  advanceTurn(nextTurn: number, nextYear: number, progressionHook?: (ctx: { colonists: any[]; yearDelta: number; year: number; turn: number; startYear: number; rng: any }) => void): SimulationState {
    const prevYear = this.state.metadata.currentYear;
    const yearDelta = nextYear - prevYear;
    const turnRng = this.rng.turnSeed(nextTurn);

    // Update metadata FIRST so progression stamps events correctly
    this.state.metadata.currentYear = nextYear;
    this.state.metadata.currentTurn = nextTurn;

    const { state: progressed, events } = progressBetweenTurns(this.state, yearDelta, turnRng, progressionHook);
    this.state = progressed;
    this.state.colony.population = this.getAliveCount();
    this.updateFeaturedColonists(events);

    return this.getState();
  }

  private updateFeaturedColonists(recentEvents: TurnEvent[]): void {
    const eventIds = new Set(recentEvents.filter(e => e.colonistId).map(e => e.colonistId!));
    for (const c of this.state.colonists) {
      if (eventIds.has(c.core.id) && c.health.alive) c.narrative.featured = true;
    }
    const featured = this.state.colonists.filter(c => c.narrative.featured && c.health.alive);
    if (featured.length > 16) {
      const sorted = featured.sort((a, b) => b.narrative.lifeEvents.length - a.narrative.lifeEvents.length);
      for (let i = 16; i < sorted.length; i++) sorted[i].narrative.featured = false;
    }
  }

  /** Get top N candidates for a department role, scored by trait fit. */
  getCandidates(dept: Department, topN: number = 5): Colonist[] {
    const activation = ROLE_ACTIVATIONS[dept] ?? {};
    return this.state.colonists
      .filter(c => c.health.alive && !c.promotion)
      .map(c => ({
        colonist: c,
        score: Object.entries(activation).reduce((s, [trait, target]) =>
          s + (1 - Math.abs((c.hexaco as any)[trait] - (target as number))), 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map(x => x.colonist);
  }

  /** Promote a colonist to a department head role. */
  promoteColonist(colonistId: string, dept: Department, role: string, promotedBy: string): void {
    const c = this.state.colonists.find(col => col.core.id === colonistId);
    if (!c) throw new Error(`Colonist ${colonistId} not found`);
    c.promotion = { department: dept, role, turnPromoted: this.state.metadata.currentTurn, promotedBy };
    c.core.department = dept;
    c.core.role = role;
    c.career.rank = 'chief';
    c.narrative.featured = true;
    c.narrative.lifeEvents.push({
      year: this.state.metadata.currentYear,
      event: `Promoted to ${role} by ${promotedBy}`,
      source: 'commander',
    });
    this.state.eventLog.push({
      turn: this.state.metadata.currentTurn,
      year: this.state.metadata.currentYear,
      type: 'promotion',
      description: `${c.core.name} promoted to ${role}`,
      colonistId,
      data: { department: dept, promotedBy },
    });
  }

  /** Apply additive deltas to colony systems (not absolute values). */
  applyColonyDeltas(deltas: Partial<ColonySystems>, events: TurnEvent[] = []): void {
    const c = this.state.colony;
    for (const [k, v] of Object.entries(deltas)) {
      if (v !== undefined && typeof v === 'number' && k in c) {
        (c as any)[k] = (c as any)[k] + v;
      }
    }
    c.morale = Math.max(0, Math.min(1, c.morale));
    c.foodMonthsReserve = Math.max(0, c.foodMonthsReserve);
    c.powerKw = Math.max(0, c.powerKw);
    c.population = Math.max(0, c.population);
    c.lifeSupportCapacity = Math.max(0, c.lifeSupportCapacity);
    c.infrastructureModules = Math.max(0, c.infrastructureModules);
    this.state.eventLog.push(...events);
  }

  /** Apply additive deltas to colony politics. */
  applyPoliticsDeltas(deltas: Partial<ColonyPolitics>, events: TurnEvent[] = []): void {
    const p = this.state.politics;
    for (const [k, v] of Object.entries(deltas)) {
      if (v !== undefined && typeof v === 'number' && k in p) {
        (p as any)[k] = (p as any)[k] + v;
      }
    }
    p.earthDependencyPct = Math.max(0, Math.min(100, p.earthDependencyPct));
    p.independencePressure = Math.max(0, Math.min(1, p.independencePressure));
    this.state.eventLog.push(...events);
  }

  /** Apply personality drift to all promoted colonists. */
  applyDrift(commanderHexaco: HexacoProfile, outcome: TurnOutcome | null, yearDelta: number): void {
    applyPersonalityDrift(
      this.state.colonists, commanderHexaco, outcome, yearDelta,
      this.state.metadata.currentTurn, this.state.metadata.currentYear,
    );
  }

  /** Apply featured colonist updates from department reports. */
  applyColonistUpdates(updates: Array<{ colonistId: string; health?: Partial<Colonist['health']>; career?: Partial<Colonist['career']>; narrativeEvent?: string }>): void {
    for (const u of updates) {
      const col = this.state.colonists.find(c => c.core.id === u.colonistId);
      if (!col || !col.health.alive) continue;

      if (u.health) {
        if (u.health.psychScore !== undefined) {
          col.health.psychScore = Math.max(0, Math.min(1, u.health.psychScore));
        }
        if (u.health.conditions) {
          col.health.conditions = u.health.conditions;
        }
      }
      if (u.career) {
        if (u.career.achievements) {
          col.career.achievements = [...col.career.achievements, ...u.career.achievements];
        }
        if (u.career.currentProject !== undefined) {
          col.career.currentProject = u.career.currentProject;
        }
      }
      if (u.narrativeEvent) {
        col.narrative.lifeEvents.push({
          year: this.state.metadata.currentYear,
          event: u.narrativeEvent,
          source: col.core.department,
        });
      }
    }
  }

  export(): SimulationState { return structuredClone(this.state); }
}
