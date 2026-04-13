/**
 * Mars Genesis: Leader A (first entry in leaders.json)
 * Edit leaders.json to change who this runs.
 *
 * Usage:
 *   npx tsx src/run-a.ts              # full 12 turns
 *   npx tsx src/run-a.ts 3            # 3-turn smoke test
 *   npx tsx src/run-a.ts 5 --live     # 5 turns + live web search
 */
process.argv.splice(2, 0, '--leader', '0');
await import('./run.js');
