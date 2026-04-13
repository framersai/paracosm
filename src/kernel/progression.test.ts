import test from 'node:test';
import assert from 'node:assert/strict';
import { SeededRng } from './rng.js';
import { progressBetweenTurns } from './progression.js';

test('progressBetweenTurns anchors Earth-born Mars exposure to the configured start year', () => {
  const { state } = progressBetweenTurns({
    metadata: {
      simulationId: 'sim-1',
      leaderId: 'Commander',
      seed: 950,
      startYear: 2042,
      currentYear: 2043,
      currentTurn: 1,
    },
    colony: {
      population: 1,
      powerKw: 400,
      foodMonthsReserve: 18,
      waterLitersPerDay: 800,
      pressurizedVolumeM3: 3000,
      lifeSupportCapacity: 120,
      infrastructureModules: 3,
      scienceOutput: 0,
      morale: 0.85,
    },
    colonists: [{
      core: {
        id: 'col-1',
        name: 'Alex Rivera',
        birthYear: 2020,
        marsborn: false,
        department: 'science',
        role: 'Analyst',
      },
      hexaco: {
        openness: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
        emotionality: 0.5,
        honestyHumility: 0.5,
      },
      hexacoHistory: [],
      health: {
        alive: true,
        deathYear: undefined,
        deathCause: undefined,
        cumulativeRadiationMsv: 0,
        boneDensityPct: 100,
        psychScore: 0.8,
      },
      career: {
        yearsExperience: 2,
        specialization: 'Operations',
      },
      social: {
        earthContacts: 2,
        childrenIds: [],
      },
      narrative: {
        featured: false,
        lifeEvents: [],
      },
    }],
    politics: {
      earthDependencyPct: 95,
      governanceStatus: 'earth-governed',
      independencePressure: 0.05,
    },
    eventLog: [],
  } as any, 1, new SeededRng(950));

  assert.equal(state.colonists[0].health.boneDensityPct, 99.5);
});
