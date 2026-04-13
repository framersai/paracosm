/**
 * Mars scenario hooks. These are the functions that can't be serialized to JSON.
 * They inject Mars-specific domain logic into the generic engine.
 */

export { marsProgressionHook } from './progression-hooks.js';
export { marsDepartmentPromptLines, marsDirectorInstructions } from './prompts.js';
export { marsFingerprint } from './fingerprint.js';
export { marsPoliticsHook } from './politics.js';
export { marsReactionContext } from './reactions.js';
export { getMarsMilestoneCrisis } from './milestones.js';
