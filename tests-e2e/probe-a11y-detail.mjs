import playwright from '/Users/johnn/Documents/git/voice-chat-assistant/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.js';
const browser = await playwright.chromium.launch({ headless: true });
const w = parseInt(process.env.PROBE_W ?? '1440', 10);
const h = parseInt(process.env.PROBE_H ?? '900', 10);
const ctx = await browser.newContext({ viewport: { width: w, height: h } });
const page = await ctx.newPage();
const wantLight = process.env.PROBE_LIGHT === '1';
await ctx.addInitScript((light) => {
  try { localStorage.setItem('paracosm:tourSeen', '1'); } catch {}
  if (light) {
    try { localStorage.setItem('paracosm-theme', 'light'); } catch {}
    try { localStorage.setItem('paracosm:theme', 'light'); } catch {}
  }
}, wantLight);
const url = process.env.PROBE_URL ?? 'https://paracosm.agentos.sh/';
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const tab = process.env.PROBE_TAB;
if (tab) {
  await page.getByRole('tab', { name: new RegExp(`^${tab}$`, 'i') }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(1500);
}
// Optional sub-tab click for surfaces nested behind a sub-tab nav.
const subtab = process.env.PROBE_SUBTAB;
if (subtab) {
  await page.getByRole('tab', { name: new RegExp(`^${subtab}$`, 'i') }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(1000);
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
  for (const node of v.nodes.slice(0, 30)) {
    console.log('  HTML:', node.html.slice(0, 180));
    console.log('  target:', node.target.join(' '));
    if (node.failureSummary) {
      // Extract the contrast ratio + colors line for color-contrast.
      const lines = node.failureSummary.split('\n').filter(l => /contrast|color|ratio/i.test(l));
      if (lines.length > 0) console.log('  why:', lines.join(' | ').slice(0, 250));
    }
    console.log('');
  }
}
await browser.close();
