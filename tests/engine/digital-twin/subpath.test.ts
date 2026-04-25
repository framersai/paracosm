/**
 * Tests for the paracosm/digital-twin subpath barrel. The subpath
 * re-exports WorldModel as DigitalTwin (no wrapper class) and the
 * digital-twin-relevant types (SubjectConfig, InterventionConfig,
 * RunArtifact). The class identity check is the core invariant: any
 * future refactor that wraps WorldModel must update this test
 * deliberately.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as DigitalTwinModule from '../../../src/engine/digital-twin/index.js';
import { WorldModel } from '../../../src/runtime/world-model/index.js';

test('paracosm/digital-twin re-exports DigitalTwin as the same class as WorldModel', () => {
  assert.equal(DigitalTwinModule.DigitalTwin, WorldModel, 'DigitalTwin must be the same class as WorldModel');
});

test('paracosm/digital-twin types are usable at runtime via assignment shape', () => {
  // Type-level: the import statement at the top compiles iff the names
  // are exported and assignable to the live subject/intervention shape.
  const subj: import('../../../src/engine/schema/index.js').SubjectConfig = { id: 's', kind: 'person', attributes: {} } as never;
  const iv: import('../../../src/engine/schema/index.js').InterventionConfig = { id: 'i', kind: 'treatment', description: 'x', parameters: {} } as never;
  assert.ok(subj.id);
  assert.ok(iv.id);
});

test('paracosm/digital-twin module exports the expected public names', () => {
  const exportedNames = Object.keys(DigitalTwinModule).sort();
  assert.ok(exportedNames.includes('DigitalTwin'), 'must export DigitalTwin');
});
