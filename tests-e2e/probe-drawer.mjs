import playwright from '/Users/johnn/Documents/git/voice-chat-assistant/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.js';
const browser = await playwright.chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('paracosm:tourSeen', '1'); } catch {} });
const page = await ctx.newPage();
await page.goto('https://paracosm.agentos.sh/sim', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.getByRole('tab', { name: /^library$/i }).first().click({ force: true }).catch(() => {});
await page.waitForTimeout(2500);
const compare = page.getByRole('button', { name: /^Compare$/ }).first();
await compare.click({ force: true }).catch(() => {});
await page.waitForTimeout(1500);
const open = page.getByRole('button', { name: /^Open$/ }).first();
const cnt = await page.getByRole('button', { name: /^Open$/ }).count();
console.log('Open buttons:', cnt);
const visible = await open.isVisible().catch(() => false);
console.log('first Open visible:', visible);
await open.click({ force: true }).catch(e => console.log('click err:', e.message));
await page.waitForTimeout(2500);

// Inspect drawer presence
const drawerInfo = await page.evaluate(() => {
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
  return dialogs.map(d => {
    const r = d.getBoundingClientRect();
    return {
      ariaLabel: d.getAttribute('aria-label'),
      visible: r.width > 0 && r.height > 0 && getComputedStyle(d).visibility !== 'hidden',
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      zIndex: getComputedStyle(d).zIndex,
      transform: getComputedStyle(d).transform,
    };
  });
});
console.log('dialogs:', JSON.stringify(drawerInfo, null, 2));

// Also check if any element with text "Agent swarm" is in DOM
const swarmHeads = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('h3'))
    .filter(h => /agent swarm/i.test(h.textContent ?? ''))
    .map(h => ({ text: h.textContent, rect: h.getBoundingClientRect() }));
});
console.log('Agent swarm h3:', JSON.stringify(swarmHeads, null, 2));

await browser.close();
