import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateSchemaRetries, type PerRunSchemaRetries } from './retry-stats.js';

const emptyRun: PerRunSchemaRetries = {};

test('aggregateSchemaRetries returns empty rollup on no runs', () => {
  const agg = aggregateSchemaRetries([]);
  assert.deepEqual(agg, { runCount: 0, schemas: {} });
});

test('aggregateSchemaRetries sums calls / attempts / fallbacks across runs', () => {
  const runs: PerRunSchemaRetries[] = [
    {
      DepartmentReport: { attempts: 12, calls: 10, fallbacks: 0 },
      CommanderDecision: { attempts: 8, calls: 8, fallbacks: 0 },
    },
    {
      DepartmentReport: { attempts: 15, calls: 10, fallbacks: 1 },
      CommanderDecision: { attempts: 10, calls: 8, fallbacks: 0 },
    },
  ];
  const agg = aggregateSchemaRetries(runs);
  assert.equal(agg.runCount, 2);
  assert.equal(agg.schemas.DepartmentReport.calls, 20);
  assert.equal(agg.schemas.DepartmentReport.attempts, 27);
  assert.equal(agg.schemas.DepartmentReport.fallbacks, 1);
  assert.equal(agg.schemas.CommanderDecision.calls, 16);
});

test('aggregateSchemaRetries computes avgAttempts (attempts/calls) per schema', () => {
  const runs: PerRunSchemaRetries[] = [
    { DepartmentReport: { attempts: 27, calls: 20, fallbacks: 1 } },
  ];
  const agg = aggregateSchemaRetries(runs);
  assert.equal(agg.schemas.DepartmentReport.avgAttempts, 1.35);
});

test('aggregateSchemaRetries computes fallbackRate per schema', () => {
  const runs: PerRunSchemaRetries[] = [
    { DepartmentReport: { attempts: 27, calls: 20, fallbacks: 1 } },
  ];
  const agg = aggregateSchemaRetries(runs);
  assert.equal(agg.schemas.DepartmentReport.fallbackRate, 0.05);
});

test('aggregateSchemaRetries skips empty / missing run entries gracefully', () => {
  const runs: PerRunSchemaRetries[] = [
    emptyRun,
    { DepartmentReport: { attempts: 10, calls: 10, fallbacks: 0 } },
    emptyRun,
  ];
  const agg = aggregateSchemaRetries(runs);
  assert.equal(agg.runCount, 3);
  assert.equal(agg.schemas.DepartmentReport.calls, 10);
});

test('aggregateSchemaRetries handles schema appearing in only some runs', () => {
  const runs: PerRunSchemaRetries[] = [
    { DepartmentReport: { attempts: 10, calls: 10, fallbacks: 0 } },
    { CommanderDecision: { attempts: 8, calls: 8, fallbacks: 0 } },
  ];
  const agg = aggregateSchemaRetries(runs);
  assert.equal(agg.schemas.DepartmentReport.runsPresent, 1);
  assert.equal(agg.schemas.CommanderDecision.runsPresent, 1);
});
