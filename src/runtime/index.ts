/**
 * Paracosm Runtime — orchestration layer
 *
 * Run simulations with AI agents, crisis directors, and department analysis.
 */

export { runSimulation } from './orchestrator.js';
export type { RunOptions, SimEvent, LeaderConfig } from './orchestrator.js';
export { CrisisDirector } from './director.js';
export type { DirectorCrisis, DirectorContext } from './director.js';
export type { DepartmentReport, CommanderDecision, TurnArtifact, CrisisResearchPacket } from './contracts.js';
export { buildDepartmentContext, getDepartmentsForTurn } from './departments.js';
export { generateColonistReactions } from './colonist-reactions.js';
