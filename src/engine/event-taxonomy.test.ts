import test from 'node:test';
import assert from 'node:assert/strict';
import { EventTaxonomy } from './event-taxonomy.js';
import { MARS_EVENT_DEFINITIONS } from './mars/events.js';

test('EventTaxonomy returns render metadata for a known event type', () => {
  const taxonomy = new EventTaxonomy(MARS_EVENT_DEFINITIONS);
  const crisis = taxonomy.get('crisis');
  assert.ok(crisis);
  assert.equal(crisis!.label, 'Crisis');
  assert.ok(crisis!.icon);
  assert.ok(crisis!.color);
});

test('EventTaxonomy returns undefined for unknown event type', () => {
  const taxonomy = new EventTaxonomy(MARS_EVENT_DEFINITIONS);
  assert.equal(taxonomy.get('nonexistent'), undefined);
});

test('EventTaxonomy.all returns all defined event types', () => {
  const taxonomy = new EventTaxonomy(MARS_EVENT_DEFINITIONS);
  const all = taxonomy.all();
  const ids = all.map(e => e.id);
  assert.ok(ids.includes('crisis'));
  assert.ok(ids.includes('decision'));
  assert.ok(ids.includes('birth'));
  assert.ok(ids.includes('death'));
  assert.ok(ids.includes('promotion'));
  assert.ok(ids.includes('tool_forge'));
  assert.ok(ids.includes('system'));
  assert.ok(ids.includes('relationship'));
});

test('Mars event definitions match the TurnEvent type values in kernel/state.ts', () => {
  const ids = MARS_EVENT_DEFINITIONS.map(e => e.id);
  for (const expected of ['crisis', 'decision', 'birth', 'death', 'promotion', 'relationship', 'tool_forge', 'system']) {
    assert.ok(ids.includes(expected), `Missing event type: ${expected}`);
  }
});
