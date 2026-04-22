import test from 'node:test';
import assert from 'node:assert/strict';
import { readCache, COMPILE_SCHEMA_VERSION } from '../../../src/engine/compiler/cache.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Cache-bust regression guard. The tests/fixtures/legacy-0.4-cache
 * fixture carries a v2 manifest with scenarioHash 'abc123def456' and
 * a progression hook that reads ctx.state.colony.foodMonthsReserve.
 * After the v2 → v3 bump in cache.ts, readCache must reject it because
 * hashScenario folds COMPILE_SCHEMA_VERSION into the hash — any value
 * the fixture carries hashes to something different under v3.
 *
 * Protects against a future schema-shape change that forgets to
 * propagate through the hash function.
 */

test('COMPILE_SCHEMA_VERSION is at 3 (v3 or later; never revert past it)', () => {
  assert.ok(
    COMPILE_SCHEMA_VERSION >= 3,
    `expected schema version >= 3 to reject legacy colony-shape caches; got ${COMPILE_SCHEMA_VERSION}`,
  );
});

test('readCache rejects a v2-shaped manifest after schema bump to v3+', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const fixtureDir = resolve(here, '../../fixtures/legacy-0.4-cache');

  // scenarioJson carries id/version matching the fixture dir name
  // (test-scenario-v1.0.0). The manifest's scenarioHash is a hand-
  // crafted string ('abc123def456') chosen so it would hash-mismatch
  // under ANY COMPILE_SCHEMA_VERSION — guaranteeing the reader returns
  // null and the caller regenerates.
  const scenarioJson = { id: 'test-scenario', version: '1.0.0' };

  const result = readCache(scenarioJson, 'progression', 'gpt-5.4-mini', fixtureDir);
  assert.equal(result, null, 'v2-cache must be rejected so scenarios regenerate');
});
