import test from 'node:test';
import assert from 'node:assert/strict';
import { getResearchFromBundle } from '../../../src/runtime/research/scenario-research.js';
import { MARS_KNOWLEDGE_BUNDLE } from '../../../src/engine/mars/research-bundle.js';
import { LUNAR_KNOWLEDGE_BUNDLE } from '../../../src/engine/lunar/research-bundle.js';

test('getResearchFromBundle returns Mars citations for environmental category', () => {
  const packet = getResearchFromBundle(MARS_KNOWLEDGE_BUNDLE, 'environmental');
  assert.ok(packet.canonicalFacts.length > 0);
  assert.ok(packet.canonicalFacts.some(f => f.url.startsWith('http')));
});

test('getResearchFromBundle returns Lunar citations for resource category', () => {
  const packet = getResearchFromBundle(LUNAR_KNOWLEDGE_BUNDLE, 'resource');
  assert.ok(packet.canonicalFacts.length > 0);
  // Lunar resource topics include water-ice
  assert.ok(packet.canonicalFacts.some(f => f.claim.toLowerCase().includes('ice') || f.claim.toLowerCase().includes('lunar') || f.claim.toLowerCase().includes('regolith')));
});

test('getResearchFromBundle returns empty for unknown category with no keyword match', () => {
  const packet = getResearchFromBundle(MARS_KNOWLEDGE_BUNDLE, 'nonexistent_category');
  // No category mapping, no keyword match = empty
  assert.equal(packet.canonicalFacts.length, 0);
});

test('getResearchFromBundle keyword fallback finds citations when category misses', () => {
  const packet = getResearchFromBundle(MARS_KNOWLEDGE_BUNDLE, 'nonexistent', ['radiation', 'Mars']);
  assert.ok(packet.canonicalFacts.length > 0, 'keyword fallback should find radiation citations');
});

test('getResearchFromBundle does not mix Mars and Lunar citations', () => {
  const marsPacket = getResearchFromBundle(MARS_KNOWLEDGE_BUNDLE, 'medical');
  const lunarPacket = getResearchFromBundle(LUNAR_KNOWLEDGE_BUNDLE, 'medical');
  // Mars medical should reference Mars radiation, Lunar medical should reference regolith/low-gravity
  const marsHasRadiation = marsPacket.canonicalFacts.some(f => f.claim.includes('0.67 mSv'));
  const lunarHasRegolith = lunarPacket.canonicalFacts.some(f => f.claim.toLowerCase().includes('regolith') || f.claim.toLowerCase().includes('gravity'));
  assert.ok(marsHasRadiation, 'Mars medical should include Mars radiation');
  assert.ok(lunarHasRegolith, 'Lunar medical should include regolith or gravity');
});
