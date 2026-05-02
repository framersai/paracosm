#!/usr/bin/env node
/**
 * Inspect the live VIZ tab on phone width and find the
 * "★ Dr. Yuki Tanaka MEDICA…" overlay so we can fix its CSS.
 */
import playwright from '/Users/johnn/Documents/git/voice-chat-assistant/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.js';
const { chromium } = playwright;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => {
  try { localStorage.setItem('paracosm:tourSeen', '1'); } catch {}
});
const page = await ctx.newPage();
await page.goto('https://paracosm.agentos.sh/sim', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// Click the VIZ tab.
await page.getByRole('tab', { name: /^viz$/i }).first().click({ force: true }).catch(() => {});
await page.waitForTimeout(2500);

const findings = await page.evaluate(() => {
  // Pick the BUTTON ancestor of the "Dr. Yuki Tanaka" text and dump
  // its outerHTML + inline style + computed position so we can
  // identify the rendering component.
  function walk(node, out) {
    if (!node) return;
    if (node.nodeType === 3 && /Yuki/.test(node.nodeValue ?? '')) out.push(node);
    for (const c of node.childNodes) walk(c, out);
  }
  const matches = [];
  walk(document.body, matches);
  if (matches.length === 0) return { error: 'no Yuki text found' };
  let el = matches[0].parentElement;
  while (el && el.tagName !== 'BUTTON') el = el.parentElement;
  if (!el) return { error: 'no BUTTON ancestor' };
  const styleAttr = el.getAttribute('style') ?? '';
  const computed = getComputedStyle(el);
  return {
    outerHTML: el.outerHTML.slice(0, 600),
    parentOuter: el.parentElement?.outerHTML.slice(0, 600),
    inlineStyle: styleAttr,
    position: computed.position,
    left: computed.left,
    top: computed.top,
    right: computed.right,
    width: computed.width,
    transform: computed.transform,
    zIndex: computed.zIndex,
    rect: el.getBoundingClientRect(),
  };
});
console.log(JSON.stringify(findings, null, 2));
await browser.close();
