/**
 * Mars Genesis: Leader B (second entry in leaders.json)
 * Edit leaders.json to change who this runs.
 *
 * Usage:
 *   npx tsx src/run-b.ts              # full 12 turns
 *   npx tsx src/run-b.ts 3            # 3-turn smoke test
 *   npx tsx src/run-b.ts 5 --live     # 5 turns + live web search
 */
process.argv.splice(2, 0, '--leader', '1');
await import('./run.js');
