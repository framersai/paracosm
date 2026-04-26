#!/usr/bin/env node
/**
 * Paracosm umbrella CLI. Dispatches subcommands to their handlers.
 *
 *   paracosm <command> [options]
 *
 * Commands:
 *   run           Run a simulation against leaders.json (or --leaders <path>)
 *   dashboard     Start the SSE dashboard at http://localhost:3456
 *   compile       Compile a scenario JSON draft (cached)
 *   init          Scaffold a starter project from a free-text brief
 *   help          Show help (top-level or per-subcommand)
 *   version       Print version
 *
 * Global flags `--help`/`-h` and `--version`/`-v` work at any position.
 *
 * Back-compat: legacy invocations without a subcommand (e.g.
 * `paracosm --leader 0 6`) print a one-line deprecation hint then dispatch
 * to `run`. Removal scheduled for 0.8.0.
 *
 * @module paracosm/cli/run
 */

import { dispatch, type DispatchResult } from './router.js';

const argv = process.argv.slice(2);

dispatch(argv).then((result: DispatchResult) => {
  if (result.deprecation) {
    process.stderr.write(`\n[deprecated] ${result.deprecation}\n`);
  }
  if (typeof result.exitCode === 'number') {
    process.exit(result.exitCode);
  }
}).catch((err: unknown) => {
  process.stderr.write(`\nFATAL: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
