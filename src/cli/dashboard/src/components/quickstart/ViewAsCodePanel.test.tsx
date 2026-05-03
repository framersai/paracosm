import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from 'react-dom/server';
import * as React from 'react';

import { ViewAsCodePanel } from './ViewAsCodePanel.js';

test('ViewAsCodePanel: default render is collapsed — toggle reads "View as code", panel not rendered', () => {
  const html = renderToString(
    <ViewAsCodePanel seedText="A coastal mayor must evacuate." actorCount={3} />,
  );
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /▸ View as code/);
  // The toggle's aria-controls attribute references the panel id even
  // when the panel is hidden, so check for the actual id="..." attribute
  // (which is only emitted when the panel element renders).
  assert.ok(!html.includes('id="quickstart-view-as-code-panel"'), 'panel element absent when collapsed');
  assert.ok(!html.includes('role="tabpanel"'), 'tabpanel role absent when collapsed');
  assert.ok(!html.includes('TypeScript'), 'TypeScript tab not rendered when collapsed');
});

test('ViewAsCodePanel: expanded with TS tab renders the escaped recipe', () => {
  // JSX-attribute strings can hold backticks and `${...}` literally
  // (the escape rule fires inside the helper, not in JSX). Lift the
  // input to a const so the messy characters do not visually clash
  // with the JSX. Backslashes and `${` here are just literal text.
  const messySeed = 'cost ${burn} `now`';
  const html = renderToString(
    <ViewAsCodePanel
      seedText={messySeed}
      actorCount={5}
      domainHint="urban planning"
      initiallyExpanded
      initialTab="ts"
    />,
  );
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /▾ Hide code/);
  assert.match(html, /id="quickstart-view-as-code-panel"/);
  // TS tab is selected.
  assert.match(html, /id="quickstart-view-as-code-tab-ts"[^>]*aria-pressed="true"/);
  assert.match(html, /id="quickstart-view-as-code-tab-curl"[^>]*aria-pressed="false"/);

  // Text content of <code> passes backticks / `${` / braces / backslash
  // through verbatim, but react-dom HTML-escapes single quotes to
  // `&#x27;` (and double quotes to `&quot;`) defensively. Substring
  // assertions encode that distinction so a future react-dom version
  // that flips the policy fails loudly with the rendered HTML attached.
  assert.ok(
    html.includes('seedText: `cost \\${burn} \\`now\\``'),
    `expected escaped seedText in rendered HTML; got:\n${html}`,
  );
  assert.ok(
    html.includes('domainHint: &#x27;urban planning&#x27;'),
    `expected domainHint with HTML-escaped single quotes; got:\n${html}`,
  );
  assert.ok(html.includes('wm.quickstart({ actorCount: 5 })'));
});

test('ViewAsCodePanel: expanded with curl tab renders the curl POST', () => {
  const html = renderToString(
    <ViewAsCodePanel
      seedText="A coastal mayor must evacuate."
      actorCount={3}
      initiallyExpanded
      initialTab="curl"
    />,
  );
  assert.match(html, /id="quickstart-view-as-code-tab-curl"[^>]*aria-pressed="true"/);
  assert.match(html, /id="quickstart-view-as-code-tab-ts"[^>]*aria-pressed="false"/);

  // react-dom escapes both `'` (→ &#x27;) and `"` (→ &quot;) inside
  // `<code>` text content. The substring assertion bakes the escaped
  // form in so a regression in either escape policy fails with the
  // rendered HTML attached for debugging.
  assert.ok(html.includes('curl -X POST https://paracosm.agentos.sh/api/quickstart/compile-from-seed'));
  assert.ok(
    html.includes('-d &#x27;{&quot;seedText&quot;:&quot;A coastal mayor must evacuate.&quot;}&#x27;'),
    `expected escaped curl body in rendered HTML; got:\n${html}`,
  );
});
