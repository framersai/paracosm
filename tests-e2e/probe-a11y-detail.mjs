import playwright from '/Users/johnn/Documents/git/voice-chat-assistant/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.js';
const browser = await playwright.chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await ctx.addInitScript(() => { try { localStorage.setItem('paracosm:tourSeen', '1'); } catch {} });
const url = process.env.PROBE_URL ?? 'https://paracosm.agentos.sh/';
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const tab = process.env.PROBE_TAB;
if (tab) {
  await page.getByRole('tab', { name: new RegExp(`^${tab}$`, 'i') }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(1500);
}
await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/axe-core@4.11.2/axe.min.js' });
const rules = process.env.PROBE_RULES?.split(',') ?? ['nested-interactive', 'svg-img-alt'];
const result = await page.evaluate(async (rules) => {
  const axe = window.axe;
  return await axe.run(document, {
    runOnly: rules,
    resultTypes: ['violations'],
  });
}, rules);
for (const v of result.violations) {
  console.log(`\n=== ${v.id} (${v.impact}) — ${v.help} | ${v.nodes.length} nodes ===`);
  for (const node of v.nodes.slice(0, 5)) {
    console.log('  HTML:', node.html.slice(0, 250));
    console.log('  target:', node.target.join(' '));
    console.log('');
  }
}
await browser.close();
