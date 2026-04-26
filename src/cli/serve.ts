#!/usr/bin/env node
/**
 * Back-compat shim for the `paracosm-dashboard` binary. New code paths
 * should use `paracosm dashboard`; this entry point exists so existing
 * scripts and Docker invocations don't break.
 *
 * @module paracosm/cli/serve
 */

import { runDashboard } from './run-dashboard.js';

runDashboard(process.argv.slice(2)).then((exitCode) => {
  if (typeof exitCode === 'number' && exitCode !== 0) process.exit(exitCode);
}).catch((err: unknown) => {
  process.stderr.write(`\nFATAL: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
