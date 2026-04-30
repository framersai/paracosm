import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from 'react-dom/server';
import * as React from 'react';
import { SimLayoutToggle } from './SimLayoutToggle.js';

test('SimLayoutToggle: at actorCount=2 both options enabled', () => {
  const html = renderToString(
    <SimLayoutToggle layout="side-by-side" actorCount={2} onChange={() => {}} />,
  );
  const sideBtn = html.match(/<button[^>]*data-layout="side-by-side"[^>]*>/);
  assert.ok(sideBtn, 'side-by-side button rendered');
  assert.ok(!sideBtn![0].includes('disabled'), 'side-by-side enabled at N=2');
});

test('SimLayoutToggle: at actorCount=3 side-by-side is disabled with explanatory title', () => {
  const html = renderToString(
    <SimLayoutToggle layout="constellation" actorCount={3} onChange={() => {}} />,
  );
  const sideBtn = html.match(/<button[^>]*data-layout="side-by-side"[^>]*>/);
  assert.ok(sideBtn);
  assert.ok(sideBtn![0].includes('disabled'), 'side-by-side disabled at N>2');
  assert.match(sideBtn![0], /title="[^"]*caps at 2/);
});

test('SimLayoutToggle: active button gets aria-pressed=true', () => {
  const html = renderToString(
    <SimLayoutToggle layout="constellation" actorCount={5} onChange={() => {}} />,
  );
  const constBtn = html.match(/<button[^>]*data-layout="constellation"[^>]*>/);
  assert.ok(constBtn);
  assert.match(constBtn![0], /aria-pressed="true"/);
});
