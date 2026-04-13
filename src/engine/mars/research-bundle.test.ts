import test from 'node:test';
import assert from 'node:assert/strict';
import { MARS_KNOWLEDGE_BUNDLE } from './research-bundle.js';

test('Mars knowledge bundle contains all expected topics', () => {
  const topics = Object.keys(MARS_KNOWLEDGE_BUNDLE.topics);
  assert.ok(topics.includes('radiation'));
  assert.ok(topics.includes('water'));
  assert.ok(topics.includes('perchlorate'));
  assert.ok(topics.includes('psychology'));
  assert.ok(topics.includes('governance'));
  assert.ok(topics.includes('terraforming'));
  assert.ok(topics.includes('infrastructure'));
});

test('Mars knowledge bundle has category mapping for all 8 crisis categories', () => {
  const categories = Object.keys(MARS_KNOWLEDGE_BUNDLE.categoryMapping);
  for (const cat of ['environmental', 'resource', 'medical', 'psychological', 'political', 'infrastructure', 'social', 'technological']) {
    assert.ok(categories.includes(cat), `Missing category mapping: ${cat}`);
  }
});

test('Each topic has at least one canonical fact with a URL', () => {
  for (const [topicId, topic] of Object.entries(MARS_KNOWLEDGE_BUNDLE.topics)) {
    assert.ok(topic.canonicalFacts.length > 0, `Topic ${topicId} has no facts`);
    for (const fact of topic.canonicalFacts) {
      assert.ok(fact.claim.length > 10, `Fact in ${topicId} has no claim`);
      assert.ok(fact.url.startsWith('http'), `Fact in ${topicId} has no URL`);
    }
  }
});

test('Category mapping points to existing topics', () => {
  const topicIds = new Set(Object.keys(MARS_KNOWLEDGE_BUNDLE.topics));
  for (const [cat, refs] of Object.entries(MARS_KNOWLEDGE_BUNDLE.categoryMapping)) {
    for (const ref of refs) {
      assert.ok(topicIds.has(ref), `Category ${cat} references non-existent topic: ${ref}`);
    }
  }
});
