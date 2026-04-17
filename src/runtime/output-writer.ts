/**
 * Run-output file writer.
 *
 * Extracted from orchestrator.ts so the end-of-run side-effect (JSON
 * snapshot to disk + summary log line) lives separately from the
 * turn-loop coordinator. Pure function over its inputs; returns the
 * absolute path it wrote to so the caller can log or surface it.
 *
 * @module paracosm/runtime/output-writer
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Write a simulation result payload to `<repo>/output/v3-<tag>-<ts>.json`
 * and log a one-screen summary to stdout. Ensures the output dir exists
 * before writing. Returns the absolute path of the written file.
 *
 * The tag slot comes from the leader's archetype so side-by-side runs
 * get distinguishable filenames even when they start in the same
 * millisecond (e.g. `v3-the-engineer-...` vs `v3-the-visionary-...`).
 */
export function writeRunOutput(
  output: {
    totalCitations: number;
    totalToolsForged: number;
    finalState: { colony: { population: number; morale: number } };
  } & Record<string, unknown>,
  args: {
    leaderName: string;
    leaderArchetype: string;
    turns: number;
    toolRegs: Record<string, string[]>;
  },
): string {
  const outDir = resolve(__dirname, '..', '..', 'output');
  mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const tag = args.leaderArchetype.toLowerCase().replace(/\s+/g, '-');
  const path = resolve(outDir, `v3-${tag}-${ts}.json`);
  writeFileSync(path, JSON.stringify(output, null, 2));

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  COMPLETE — ${args.leaderName}`);
  console.log(`  Output: ${path}`);
  console.log(`  Turns: ${args.turns} | Citations: ${output.totalCitations} | Tools: ${output.totalToolsForged}`);
  console.log(`  Final: Pop ${output.finalState.colony.population} | Morale ${Math.round(output.finalState.colony.morale * 100)}%`);
  console.log(`  Registries: ${JSON.stringify(args.toolRegs)}`);
  console.log(`${'═'.repeat(60)}\n`);

  return path;
}
