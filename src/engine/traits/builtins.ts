/**
 * Built-in trait model registration. Imported by `engine/index.ts`
 * so the singleton `traitModelRegistry` has 'hexaco' and 'ai-agent'
 * available as soon as `paracosm` is imported anywhere.
 *
 * Registration is idempotent at process startup (the registry's
 * `register` throws on duplicate, so this file imports exactly
 * once via the engine barrel).
 *
 * @module paracosm/engine/traits/builtins
 */

import { traitModelRegistry } from './index.js';
import { hexacoModel } from './hexaco.js';
import { aiAgentModel } from './ai-agent.js';

let registered = false;

/**
 * Register the built-in models. Safe to call multiple times; only
 * fires registration on the first call.
 */
export function registerBuiltinTraitModels(): void {
  if (registered) return;
  traitModelRegistry.register(hexacoModel);
  traitModelRegistry.register(aiAgentModel);
  registered = true;
}

// Auto-register on import. Engine consumers typically import
// `paracosm` (which re-exports through `engine/index.ts`) and the
// import chain triggers this side effect. Tests that need a clean
// registry can construct their own `new TraitModelRegistry()`.
registerBuiltinTraitModels();
