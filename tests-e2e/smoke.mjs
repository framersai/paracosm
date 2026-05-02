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
      // SubTabNav buttons are <button role="tab">, so getByRole('tab')
      // not 'button'. Match the second tab in the tablist named "Studio
      // sub-tabs" (or the global "Branches" tab anywhere on the page).
      const branches = page.getByRole('tab', { name: /^branches$/i }).first();
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
      // SettingsPanel uses SubTabNav with options [Settings, Event Log].
      const log = page.getByRole('tab', { name: /^event log$/i }).first();
      await log.waitFor({ state: 'visible', timeout: 4_000 }).catch(() => {});
      await log.click({ force: true }).catch(() => {});
      await page.waitForTimeout(800);
    },
  },
  // Light theme — only landing + 2 dashboard tabs to keep matrix lean.
  // Pre-seeds `paracosm-theme=light` so the first-paint init script
  // adds the .light class before React mounts.
  {
    name: 'landing-top-light',
    url: '/',
    scroll: 0,
    theme: 'light',
  },
  {
    name: 'sim-tab-light',
    url: '/sim',
    clickTab: 'sim',
    theme: 'light',
  },
  {
    name: 'library-tab-light',
    url: '/sim',
    clickTab: 'library',
    theme: 'light',
  },
  // Pin 2 cells in CompareModal so SwarmDiff actually renders. Each
  // gallery card has a ☆ pin toggle next to the name; we click the
  // first two visible ones, then capture.
  {
    name: 'compare-pinned-swarm-diff',
    url: '/sim',
    clickTab: 'library',
    interaction: async (page) => {
      // Open compare modal first.
      const compare = page.getByRole('button', { name: /^Compare$/ }).first();
      await compare.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
      await compare.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      // Pin the first 2 cells. Pin toggles use aria-label like
      // "Pin actor for diff". Match anything containing "pin" + actor.
      const pins = page.locator('[aria-label*="pin" i]');
      const count = await pins.count();
      for (let i = 0; i < Math.min(2, count); i++) {
        await pins.nth(i).click({ force: true }).catch(() => {});
        await page.waitForTimeout(300);
      }
      // Scroll the modal so SwarmDiff (last in the diff stack) is visible.
      await page.waitForTimeout(800);
      await page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll('h5, h4, h6'));
        const swarmHeading = headings.find(h => /agent swarm/i.test(h.textContent ?? ''));
        if (swarmHeading) swarmHeading.scrollIntoView({ behavior: 'instant', block: 'center' });
      });
      await page.waitForTimeout(500);
    },
  },
  // First-load guided tour as new users see it. Skips the tourSeen
  // pre-seed so the tour overlay actually shows, captures step 1
  // (Quickstart) without dismissing.
  {
    name: 'tour-step-1-quickstart',
    url: '/sim',
    skipTourSeen: true,
  },
  // Walk a few tour milestones via the Next button to verify each
  // step's spotlight target resolves and the description renders.
  // Captures only the description card; the spotlight ring on the
  // target shifts per tab.
  {
    name: 'tour-step-3-topbar',
    url: '/sim',
    skipTourSeen: true,
    interaction: async (page) => {
      // Press Next twice to advance from step 1 → step 3.
      for (let i = 0; i < 2; i++) {
        const next = page.getByRole('button', { name: /^next$/i }).first();
        await next.click({ force: true }).catch(() => {});
        await page.waitForTimeout(700);
      }
    },
  },
  {
    name: 'tour-step-9-viz',
    url: '/sim',
    skipTourSeen: true,
    interaction: async (page) => {
      for (let i = 0; i < 8; i++) {
        const next = page.getByRole('button', { name: /^next$/i }).first();
        await next.click({ force: true }).catch(() => {});
        await page.waitForTimeout(500);
      }
    },
  },
  // Open the scenario picker in Settings and capture the dropdown
  // state so we can verify the scenario list renders cleanly with the
  // built-in pack (Mars / Lunar / Frontier AI Lab / Submarine /
  // Corporate / T2D Protocol).
  {
    name: 'settings-scenario-picker-open',
    url: '/sim',
    clickTab: 'settings',
    interaction: async (page) => {
      // The picker is a button summary that toggles a list of scenario
      // cards. Match by aria-label or by visible "Scenario" trigger.
      const trigger = page.getByRole('button', { name: /scenario|change scenario/i }).first();
      if (await trigger.count() > 0) {
        await trigger.click({ force: true }).catch(() => {});
        await page.waitForTimeout(600);
      } else {
        // Fall back: click on the SCENARIO label area.
        const label = page.locator('text=/^Scenario$/i').first();
        await label.click({ force: true }).catch(() => {});
      }
      await page.waitForTimeout(700);
    },
  },
  // Open the run-detail drawer with the SwarmPanel inline. The path is
  // Library → click Compare on a bundle → modal opens with actor cells
  // → click the "Open" button on a cell → drawer slides in from the
  // right and renders SwarmPanel under the run summary.
  {
    name: 'library-run-detail-swarm-panel',
    url: '/sim',
    clickTab: 'library',
    interaction: async (page) => {
      // Step 1: open the CompareModal.
      const compare = page.getByRole('button', { name: /^Compare$/ }).first();
      await compare.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
      await compare.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      // Step 2: click the first "Open <name> details" button inside the modal.
      // CompareCell renders aria-label="Open <displayName> details".
      const open = page.getByRole('button', { name: /^Open .+ details$/i }).first();
      await open.waitFor({ state: 'visible', timeout: 4_000 }).catch(() => {});
      await open.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2000);
      // Drawer is right-anchored; scroll its content to the SwarmPanel.
      await page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll('h3'));
        const sw = headings.find(h => /agent swarm/i.test(h.textContent ?? ''));
        if (sw) sw.scrollIntoView({ behavior: 'instant', block: 'center' });
      });
      await page.waitForTimeout(500);
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
  // landing.html has its own first-paint script that reads
  // `paracosm-theme` to apply .light before React mounts; if the
  // surface declares a theme we set both keys (covers landing + dashboard).
  const theme = surface.theme;
  const skipTourSeen = surface.skipTourSeen ?? false;
  await ctx.addInitScript(({ theme, skipTourSeen }) => {
    if (!skipTourSeen) {
      try { localStorage.setItem('paracosm:tourSeen', '1'); } catch { /* ignore */ }
    }
    if (theme === 'light') {
      try { localStorage.setItem('paracosm-theme', 'light'); } catch { /* ignore */ }
      try { localStorage.setItem('paracosm:theme', 'light'); } catch { /* ignore */ }
    }
  }, { theme, skipTourSeen });
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

  // Tour surfaces need extra settle time. The auto-start has a 600ms
  // setTimeout in App.tsx before firing the tour overlay; we wait
  // 1500ms total to give it room plus animation.
  if (surface.skipTourSeen) {
    await page.waitForTimeout(1500);
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
