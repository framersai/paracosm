import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Regression test: runSimulation must NOT mutate the caller's
 * LeaderConfig.hexaco. The drift lives in orchestrator-local state
 * (`commanderHexacoLive` + `commanderHexacoHistory`), not in the input
 * object.
 *
 * We assert via source inspection rather than a live runSimulation
 * call — the latter would require API keys. Any assignment pattern
 * like `leader.hexaco.X = ...` or `leader.hexaco[X] = ...` indicates
 * the contract is violated.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const orchestratorSrc = readFileSync(
  path.join(__dirname, 'orchestrator.ts'),
  'utf-8',
);

test('orchestrator never assigns to leader.hexaco[<anything>]', () => {
  // Match leader.hexaco.X = ... or leader.hexaco[X] = ...
  const mutationPatterns = [
    /leader\.hexaco\.\w+\s*=(?!=)/g,
    /leader\.hexaco\[[^\]]+\]\s*=(?!=)/g,
  ];
  for (const pattern of mutationPatterns) {
    const matches = orchestratorSrc.match(pattern);
    assert.equal(
      matches,
      null,
      `orchestrator.ts contains mutation of leader.hexaco: ${matches?.join(', ')}`,
    );
  }
});

test('orchestrator clones leader.hexaco into commanderHexacoLive', () => {
  assert.match(
    orchestratorSrc,
    /commanderHexacoLive[^=]*=\s*\{\s*\.\.\.\s*leader\.hexaco\s*\}/,
    'orchestrator.ts should contain `commanderHexacoLive: ... = { ...leader.hexaco }`',
  );
});

test('orchestrator calls driftCommanderHexaco with the live HEXACO', () => {
  assert.match(
    orchestratorSrc,
    /driftCommanderHexaco\s*\(\s*commanderHexacoLive/,
    'orchestrator.ts should call driftCommanderHexaco(commanderHexacoLive, ...)',
  );
});
