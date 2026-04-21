/**
 * Paracosm Runtime — orchestration layer
 *
 * Run simulations with AI agents, crisis directors, and department analysis.
 */

export { runSimulation, buildEventSummary } from './orchestrator.js';
export type {
  RunOptions,
  SimEvent,
  SimEventType,
  SimEventPayloadMap,
  SimEventCostPayload,
  LeaderConfig,
} from './orchestrator.js';
export type { CostPreset } from '../cli/sim-config.js';
export { EventDirector } from './director.js';
export type { DirectorEvent, DirectorCrisis, DirectorContext, EventCategory, CrisisCategory } from './director.js';
export type { DepartmentReport, CommanderDecision, TurnArtifact, CrisisResearchPacket } from './contracts.js';
export { buildDepartmentContext, getDepartmentsForTurn } from './departments.js';
export { generateAgentReactions } from './agent-reactions.js';
export { runBatch } from './batch.js';
export type { BatchConfig, BatchResult, BatchManifest } from './batch.js';
export {
  buildEconomicsEnvelope,
  resolveEconomicsProfile,
} from './economics-profile.js';
export type {
  EconomicsEnvelope,
  ResolvedEconomicsProfile,
  SimulationEconomicsProfileId,
} from './economics-profile.js';
export { recordReactionMemory, consolidateMemory, updateRelationshipsFromReactions, buildMemoryContext } from './agent-memory.js';
