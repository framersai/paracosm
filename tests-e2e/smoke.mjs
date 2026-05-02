#!/usr/bin/env node
/**
 * Live smoke test for paracosm.agentos.sh.
 *
 * Visits every primary surface in desktop (1440x900) and mobile (390x844)
 * viewports and writes screenshots to tests-e2e/screenshots/. Borrows
 * the @playwright/test install from apps/agentos-workbench so paracosm
 * does not gain a heavy direct dependency.
 *
 * Usage:
 *   node tests-e2e/smoke.mjs
 *   BASE_URL=http://localhost:3456 node tests-e2e/smoke.mjs
 */
import playwright from '/Users/johnn/Documents/git/voice-chat-assistant/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.js';
const { chromium } = playwright;
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(__dirname, 'screenshots');
mkdirSync(SHOTS, { recursive: true });

const BASE_URL = process.env.BASE_URL ?? 'https://paracosm.agentos.sh';

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};

/**
 * Surface to capture. Each entry produces 2 screenshots (desktop +
 * mobile). `prepare` runs after navigation; use it to click tabs,
 * scroll, open modals, etc.
 */
const SURFACES = [
  { name: 'landing-top', url: '/', scroll: 0 },
  { name: 'landing-mid', url: '/', scroll: 1200 },
  { name: 'landing-demo-card', url: '/', scroll: 2400 },
  { name: 'landing-whitepaper', url: '/', scroll: 3600 },
  { name: 'landing-bottom', url: '/', scroll: 9999 },
  { name: 'quickstart-tab', url: '/sim' },
  { name: 'studio-tab', url: '/sim', clickTab: 'studio' },
  { name: 'sim-tab', url: '/sim', clickTab: 'sim' },
  { name: 'viz-tab', url: '/sim', clickTab: 'viz' },
  { name: 'chat-tab', url: '/sim', clickTab: 'chat' },
  { name: 'reports-tab', url: '/sim', clickTab: 'reports' },
  { name: 'library-tab', url: '/sim', clickTab: 'library' },
  { name: 'settings-tab', url: '/sim', clickTab: 'settings' },
  { name: 'about-tab', url: '/sim', clickTab: 'about' },
  { name: 'docs-landing', url: '/docs' },
  // Interactive states — open the drawer/modal so we can verify the
  // SwarmPanel + SwarmDiff actually render in production.
  {
    name: 'library-run-drawer',
    url: '/sim',
    clickTab: 'library',
    interaction: async (page) => {
      // First Compare button on the gallery cards opens the drawer.
      const card = page.locator('button', { hasText: /^Compare$/ }).first();
      await card.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
      await card.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
    },
  },
  {
    name: 'studio-branches',
    url: '/sim',
    clickTab: 'studio',
    interaction: async (page) => {
      const branches = page.getByRole('button', { name: /^branches$/i }).first();
      await branches.waitFor({ state: 'visible', timeout: 4_000 }).catch(() => {});
      await branches.click({ force: true }).catch(() => {});
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'settings-event-log',
    url: '/sim',
    clickTab: 'settings',
    interaction: async (page) => {
      const log = page.getByRole('button', { name: /^event log$/i }).first();
      await log.waitFor({ state: 'visible', timeout: 4_000 }).catch(() => {});
      await log.click({ force: true }).catch(() => {});
      await page.waitForTimeout(800);
    },
  },
];

const consoleErrors = [];

async function captureSurface(browser, surface, viewportName) {
  const ctx = await browser.newContext({
    viewport: VIEWPORTS[viewportName],
    deviceScaleFactor: 1,
  });
  // Pre-seed localStorage so the GuidedTour considers itself dismissed
  // before the React app mounts. App.tsx uses key `paracosm:tourSeen=1`.
  await ctx.addInitScript(() => {
    try { localStorage.setItem('paracosm:tourSeen', '1'); } catch { /* ignore */ }
  });
  const page = await ctx.newPage();

  page.on('pageerror', err => consoleErrors.push({
    surface: surface.name, viewport: viewportName, kind: 'pageerror', message: err.message,
  }));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({
        surface: surface.name, viewport: viewportName, kind: 'console.error', message: msg.text(),
      });
    }
  });

  const url = `${BASE_URL}${surface.url}`;
  let nav;
  try {
    nav = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } catch (err) {
    console.warn(`  [warn] navigation timeout for ${surface.name} ${viewportName}: ${err.message}`);
    nav = null;
  }
  const status = nav?.status();

  // Dashboard surfaces ship with a 14-step guided tour that intercepts
  // pointer events on the tab strip until dismissed. Press Escape (the
  // tour respects Esc per its keyboard handler) so subsequent tab
  // clicks land on the underlying SimNav.
  if (surface.clickTab || surface.name.startsWith('sim-tab')) {
    try {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      // Belt-and-suspenders: also click any visible "Skip" button.
      const skip = page.getByRole('button', { name: /skip/i }).first();
      if (await skip.count() > 0 && await skip.isVisible().catch(() => false)) {
        await skip.click({ trial: false }).catch(() => {});
        await page.waitForTimeout(150);
      }
    } catch {
      /* tour may not be present */
    }
  }

  // Tab clicks (dashboard surfaces). TabBar.tsx uses role="tab".
  if (surface.clickTab) {
    try {
      const target = page.getByRole('tab', { name: new RegExp(`^${surface.clickTab}$`, 'i') }).first();
      await target.waitFor({ state: 'visible', timeout: 5_000 });
      await target.click({ force: true });
      await page.waitForTimeout(900);
    } catch (err) {
      console.warn(`  [warn] tab click "${surface.clickTab}" failed for ${surface.name} ${viewportName}: ${err.message}`);
    }
  }

  // Per-surface interaction (open drawer, click sub-tab, etc.) runs
  // after primary tab click so it can act on the rendered tab content.
  if (typeof surface.interaction === 'function') {
    try {
      await surface.interaction(page);
    } catch (err) {
      console.warn(`  [warn] interaction failed for ${surface.name} ${viewportName}: ${err.message}`);
    }
  }

  if (typeof surface.scroll === 'number') {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), surface.scroll);
    await page.waitForTimeout(400);
  }

  // Fonts settle before snap.
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(300);

  const file = resolve(SHOTS, `${surface.name}.${viewportName}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  ✓ ${surface.name}.${viewportName} (${status ?? 'no-status'}) → ${file}`);

  await ctx.close();
  return { surface: surface.name, viewport: viewportName, status, file };
}

async function main() {
  console.log(`paracosm e2e smoke against ${BASE_URL}`);
  const started = Date.now();
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const surface of SURFACES) {
    for (const viewportName of Object.keys(VIEWPORTS)) {
      try {
        const r = await captureSurface(browser, surface, viewportName);
        results.push(r);
      } catch (err) {
        console.error(`  ✗ ${surface.name} ${viewportName}: ${err.message}`);
        results.push({ surface: surface.name, viewport: viewportName, error: err.message });
      }
    }
  }

  await browser.close();

  const reportPath = resolve(SHOTS, '_report.json');
  writeFileSync(
    reportPath,
    JSON.stringify({ baseUrl: BASE_URL, results, consoleErrors, durationMs: Date.now() - started }, null, 2),
  );
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s. Report: ${reportPath}`);
  console.log(`Console errors: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    for (const e of consoleErrors.slice(0, 20)) {
      console.log(`  · [${e.surface}.${e.viewport}] ${e.kind}: ${e.message.slice(0, 200)}`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
