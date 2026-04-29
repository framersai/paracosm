import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveGroundingQueries,
  searchSerper,
  groundScenario,
  type SerperResult,
} from './deep-research.js';
import type { ScenarioPackage } from '../../engine/types.js';

function makeScenario(over: Partial<ScenarioPackage> = {}): ScenarioPackage {
  return {
    id: 'test-scenario',
    version: '1.0.0',
    engineArchetype: 'closed_turn_based_settlement',
    labels: {
      name: 'Atlas Coastal Town',
      person: 'colonist',
      people: 'colonists',
      Person: 'Colonist',
      People: 'Colonists',
      settlementNoun: 'town',
      settlementNoun_plural: 'towns',
    } as ScenarioPackage['labels'],
    theme: {} as ScenarioPackage['theme'],
    setup: { defaultSeed: 42, defaultTurns: 6 } as ScenarioPackage['setup'],
    world: { metrics: {}, capacities: {}, statuses: {}, politics: {}, environment: {} },
    departments: [
      { id: 'public-safety', label: 'Public Safety', role: 'safety', icon: 'shield', defaultModel: 'gpt-5.4-mini', instructions: '' },
      { id: 'admin', label: 'Admin', role: 'admin', icon: 'gear', defaultModel: 'gpt-5.4-mini', instructions: '' },
    ],
    metrics: [],
    events: [
      { id: 'hurricane', label: 'Hurricane evacuation', icon: 'storm' } as ScenarioPackage['events'][number],
      { id: 'decision-1', label: 'Decision rendered', icon: 'check' } as ScenarioPackage['events'][number],
    ],
    effects: [],
    ui: {} as ScenarioPackage['ui'],
    knowledge: {} as ScenarioPackage['knowledge'],
    policies: {} as ScenarioPackage['policies'],
    presets: [],
    hooks: {} as ScenarioPackage['hooks'],
    ...over,
  };
}

test('deriveGroundingQueries: picks subject + non-generic department + non-decision event', () => {
  const queries = deriveGroundingQueries(makeScenario());
  assert.equal(queries.length, 3);
  assert.equal(queries[0], 'Atlas Coastal Town');
  assert.match(queries[1], /Public Safety/);
  assert.match(queries[2], /Hurricane evacuation/);
});

test('deriveGroundingQueries: falls back to settlement noun when no domain dept survives filter', () => {
  const queries = deriveGroundingQueries(makeScenario({
    departments: [
      { id: 'admin', label: 'Admin', role: 'admin', icon: 'gear', defaultModel: 'gpt-5.4-mini', instructions: '' },
      { id: 'ops', label: 'Operations', role: 'ops', icon: 'gear', defaultModel: 'gpt-5.4-mini', instructions: '' },
    ],
  }));
  assert.equal(queries.length, 3);
  assert.match(queries[1], /town/i);
});

test('deriveGroundingQueries: falls back to crisis-decision-making query when no concrete event', () => {
  const queries = deriveGroundingQueries(makeScenario({
    events: [
      { id: 'decision-1', label: 'Decision', icon: 'check' } as ScenarioPackage['events'][number],
    ],
  }));
  assert.match(queries[2], /crisis decision making/);
});

test('deriveGroundingQueries: dedupes when subject collides with derived queries', () => {
  const queries = deriveGroundingQueries(makeScenario({
    labels: { name: 'town', settlementNoun: 'town', settlementNoun_plural: 'towns', person: 'p', people: 'p', Person: 'P', People: 'P' } as ScenarioPackage['labels'],
    departments: [],
  }));
  // 'town' as subject + 'town' as fallback dept query should dedupe
  assert.ok(queries.length >= 2 && queries.length <= 3);
});

test('searchSerper: returns parsed results, mapping domain from URL', async () => {
  const fakeFetch = (async (_url: string, _init?: RequestInit) => {
    return new Response(JSON.stringify({
      organic: [
        { title: 'A', link: 'https://www.example.com/a', snippet: 'snip A' },
        { title: 'B', link: 'https://news.foo.org/b', snippet: 'snip B', date: '2024' },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const results = await searchSerper('test', 'fake-key', 5, fakeFetch);
  assert.equal(results.length, 2);
  assert.equal(results[0].domain, 'example.com');
  assert.equal(results[1].date, '2024');
});

test('searchSerper: throws on non-2xx', async () => {
  const fakeFetch = (async () => new Response('boom', { status: 500 })) as typeof fetch;
  await assert.rejects(() => searchSerper('test', 'fake-key', 5, fakeFetch), /Serper HTTP 500/);
});

test('searchSerper: drops malformed entries (no title or no link)', async () => {
  const fakeFetch = (async () => new Response(JSON.stringify({
    organic: [
      { title: 'Good', link: 'https://example.com/x' },
      { title: 'No link' },
      { link: 'https://example.com/y' },
    ],
  }), { status: 200 })) as typeof fetch;
  const results = await searchSerper('q', 'k', 5, fakeFetch);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Good');
});

test('groundScenario: returns null when no SERPER_API_KEY available', async () => {
  const out = await groundScenario(makeScenario(), { serperApiKey: '' });
  assert.equal(out, null);
});

test('groundScenario: dedupes URLs across queries', async () => {
  const fakeResults: SerperResult[] = [
    { title: 'Shared', link: 'https://shared.example/a', snippet: '', domain: 'shared.example' },
    { title: 'Q1-only', link: 'https://q1.example/x', snippet: '', domain: 'q1.example' },
  ];
  let call = 0;
  const fakeFetch = (async () => {
    call += 1;
    return new Response(JSON.stringify({
      organic: call === 1
        ? fakeResults.map((r) => ({ title: r.title, link: r.link, snippet: r.snippet }))
        : [
          { title: 'Shared', link: 'https://shared.example/a', snippet: '' },
          { title: 'Q2-only', link: 'https://q2.example/y', snippet: '' },
        ],
    }), { status: 200 });
  }) as typeof fetch;

  const out = await groundScenario(makeScenario(), {
    serperApiKey: 'k',
    fetchImpl: fakeFetch,
  });
  assert.ok(out);
  // 3 queries derived from the scenario; total unique URLs across all
  // queries is bounded by what fakeFetch returns. Important: every
  // citation bucket should NOT contain "https://shared.example/a"
  // more than once across all buckets combined.
  const allUrls = out.citations.flatMap((c) => c.sources.map((s) => s.link));
  const sharedCount = allUrls.filter((u) => u === 'https://shared.example/a').length;
  assert.equal(sharedCount, 1, 'shared URL should appear exactly once after dedup');
});

test('groundScenario: emits progress events for each phase', async () => {
  const events: string[] = [];
  const fakeFetch = (async () => new Response(JSON.stringify({ organic: [] }), { status: 200 })) as typeof fetch;
  await groundScenario(makeScenario(), {
    serperApiKey: 'k',
    fetchImpl: fakeFetch,
    onProgress: (e) => { events.push(e.kind); },
  });
  // 3 queries × 2 events each (start + done) + 1 complete = 7 events.
  assert.equal(events.length, 7);
  assert.equal(events.filter((e) => e === 'query_started').length, 3);
  assert.equal(events.filter((e) => e === 'query_done').length, 3);
  assert.equal(events[events.length - 1], 'complete');
});

test('groundScenario: failed query reports query_failed and adds to emptyQueries', async () => {
  let call = 0;
  const fakeFetch = (async () => {
    call += 1;
    if (call === 2) return new Response('boom', { status: 502 });
    // Return distinct URLs per call so dedup doesn't accidentally empty
    // the third bucket — we want to isolate the failure case.
    return new Response(JSON.stringify({
      organic: [{ title: `OK ${call}`, link: `https://ok.example/${call}`, snippet: '' }],
    }), { status: 200 });
  }) as typeof fetch;
  const out = await groundScenario(makeScenario(), {
    serperApiKey: 'k',
    fetchImpl: fakeFetch,
  });
  assert.ok(out);
  assert.equal(out.emptyQueries.length, 1);
});
