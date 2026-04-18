/**
 * Paracosm Runtime — orchestration layer
 *
 * Run simulations with AI agents, crisis directors, and department analysis.
 */

export { runSimulation } from './orchestrator.js';
export type { RunOptions, SimEvent, LeaderConfig } from './orchestrator.js';
export { EventDirector } from './director.js';
export type { DirectorEvent, DirectorCrisis, DirectorContext, EventCategory, CrisisCategory } from './director.js';
export type { DepartmentReport, CommanderDecision, TurnArtifact, CrisisResearchPacket } from './contracts.js';
export { buildDepartmentContext, getDepartmentsForTurn } from './departments.js';
export { generateAgentReactions } from './agent-reactions.js';
export { runBatch } from './batch.js';
export type { BatchConfig, BatchResult, BatchManifest } from './batch.js';
export { recordReactionMemory, consolidateMemory, updateRelationshipsFromReactions, buildMemoryContext } from './agent-memory.js';
