#!/usr/bin/env node
/**
 * Compile a scenario JSON draft. Thin shim around the dispatcher's
 * compile handler so existing `npx tsx src/cli/compile.ts ...` calls
 * still work. Callers on a published install should prefer
 * `paracosm compile`.
 *
 * @module paracosm/cli/compile
 */

import { runCompile } from './run-compile.js';
import { printCommandHelp } from './help.js';

const argv = process.argv.slice(2);

if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
  printCommandHelp('compile');
  process.exit(0);
}

runCompile(argv).then((exitCode) => {
  process.exit(exitCode);
}).catch((err: unknown) => {
  process.stderr.write(`Compile failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
