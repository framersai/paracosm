import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from 'react-dom/server';
import * as React from 'react';

// Node test runs without a DOM. Stub the bits TabBar reads at module
// scope before importing it so the SSR `renderToString` path doesn't
// throw on `window.innerWidth` / `addEventListener`.
if (typeof globalThis.window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: {
      innerWidth: 1400,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    configurable: true,
  });
}

import { TabBar } from './TabBar.js';

const baseScenario: any = {
  policies: { characterChat: true },
};

// Per-tab attribute-extraction helper. SSR HTML attribute order is
// determined by React; using `<button[^>]*>` between attribute checks
// avoids relying on whatever order React happens to emit them in.
function extractTabAttrs(html: string, tabId: string): Record<string, string | undefined> {
  const re = new RegExp(`<button[^>]*id="tab-${tabId}"[^>]*>`);
  const match = html.match(re);
  if (!match) return {};
  const attrs: Record<string, string> = {};
  // Grab key="value" pairs from the matched <button ...> tag.
  for (const m of match[0].matchAll(/([a-z-]+)="([^"]*)"/gi)) {
    attrs[m[1]!] = m[2]!;
  }
  return attrs;
}

test('TabBar: only the active tab has tabindex=0 (roving tabindex per ARIA APG)', () => {
  const html = renderToString(
    <TabBar active="sim" onTabChange={() => {}} scenario={baseScenario} />,
  );
  assert.equal(extractTabAttrs(html, 'sim').tabindex, '0', 'active tab has tabindex=0');
  assert.equal(extractTabAttrs(html, 'quickstart').tabindex, '-1', 'inactive tab has tabindex=-1');
});

test('TabBar: aria-controls links each tab to its panel', () => {
  const html = renderToString(
    <TabBar active="sim" onTabChange={() => {}} scenario={baseScenario} />,
  );
  assert.equal(extractTabAttrs(html, 'sim')['aria-controls'], 'tabpanel-sim');
  assert.equal(extractTabAttrs(html, 'viz')['aria-controls'], 'tabpanel-viz');
});

test('TabBar non-compact: aria-label is omitted (visible label avoids duplicate SR readout)', () => {
  // Force non-compact path via wide window mock.
  const realInnerWidth = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true });
  try {
    const html = renderToString(
      <TabBar active="sim" onTabChange={() => {}} scenario={baseScenario} />,
    );
    const attrs = extractTabAttrs(html, 'quickstart');
    assert.equal(attrs['aria-label'], undefined, 'aria-label omitted in non-compact mode');
    assert.ok(html.includes('QUICKSTART'), 'visible label still rendered');
  } finally {
    Object.defineProperty(window, 'innerWidth', { value: realInnerWidth, configurable: true });
  }
});

test('TabBar: respects scenario policy gating (chat tab hidden when characterChat is off)', () => {
  const noChatScenario: any = { policies: { characterChat: false } };
  const html = renderToString(
    <TabBar active="sim" onTabChange={() => {}} scenario={noChatScenario} />,
  );
  assert.ok(!html.includes('id="tab-chat"'), 'chat tab gated off');
  assert.ok(html.includes('id="tab-sim"'), 'other tabs unaffected');
});
