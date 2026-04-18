import test from 'node:test';
import assert from 'node:assert/strict';
import { createCostTracker } from './cost-tracker.js';

const modelConfig = {
  commander: 'claude-sonnet-4-6',
  departments: 'claude-sonnet-4-6',
  judge: 'claude-haiku-4-5-20251001',
  director: 'claude-sonnet-4-6',
  agentReactions: 'claude-haiku-4-5-20251001',
};

test('recordSchemaAttempt aggregates per-schema counts', () => {
  const tracker = createCostTracker(modelConfig);
  tracker.recordSchemaAttempt('DepartmentReport', 1, false);
  tracker.recordSchemaAttempt('DepartmentReport', 2, false);
  tracker.recordSchemaAttempt('DepartmentReport', 3, true);
  const cost = tracker.finalCost();
  assert.ok(cost.schemaRetries);
  const dept = cost.schemaRetries!.DepartmentReport;
  assert.equal(dept.calls, 3);
  assert.equal(dept.attempts, 6);
  assert.equal(dept.fallbacks, 1);
});

test('recordSchemaAttempt keeps per-schema buckets separate', () => {
  const tracker = createCostTracker(modelConfig);
  tracker.recordSchemaAttempt('DepartmentReport', 1, false);
  tracker.recordSchemaAttempt('CommanderDecision', 2, false);
  tracker.recordSchemaAttempt('DepartmentReport', 1, false);
  const cost = tracker.finalCost();
  assert.equal(cost.schemaRetries!.DepartmentReport.calls, 2);
  assert.equal(cost.schemaRetries!.CommanderDecision.calls, 1);
  assert.equal(cost.schemaRetries!.CommanderDecision.attempts, 2);
});

test('finalCost omits schemaRetries when no schema attempt was recorded', () => {
  const tracker = createCostTracker(modelConfig);
  const cost = tracker.finalCost();
  assert.equal(cost.schemaRetries, undefined);
});

test('recordSchemaAttempt ignores empty schema names', () => {
  const tracker = createCostTracker(modelConfig);
  tracker.recordSchemaAttempt('', 3, false);
  const cost = tracker.finalCost();
  assert.equal(cost.schemaRetries, undefined);
});
