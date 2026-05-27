/**
 * v3 — explicitly unblock itxjames111 BEFORE going to DM, dismiss any modals continuously,
 * then scroll + expand + extract.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = `${process.env.HOME}/Documents/agentos-star-audit/scammers/dm-scrape`;
const PROFILE = `${process.env.HOME}/.agentos-evidence-chrome-profile`;
mkdirSync(`${OUT}/screenshots`, { recursive: true });

const TARGET_DM = 'https://discord.com/channels/@me/1492963001756553357';
const TARGET_USER_ID = '1015086764567842857';  // itxjames111
const TARGET_USERNAME = 'itxjames111';

let shotCount = 0;
async function shot(page, label) {
  shotCount++;
  const fname = `v3-${String(shotCount).padStart(3,'0')}-${label}.png`;
  await page.screenshot({ path: join(OUT, 'screenshots', fname), fullPage: false });
  console.log(`  [shot ${shotCount}] ${fname}`);
}

/** Dismisses any modal/popup on screen. Click Okay, X, or press Escape. */
async function dismissModals(page) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const dismissed = await page.evaluate(() => {
      // Discord modals have role="dialog"
      const dialogs = document.querySelectorAll('[role="dialog"]');
      let clickedAny = false;
      for (const dlg of dialogs) {
        // Try Okay/OK/Got it/Confirm button first
        const okBtn = Array.from(dlg.querySelectorAll('button')).find(b => {
          const t = (b.textContent || '').toLowerCase().trim();
          return t === 'okay' || t === 'ok' || t === 'got it' || t === 'continue' || t === 'close';
        });
        if (okBtn) { okBtn.click(); clickedAny = true; continue; }
        // Try close X button (aria-label="Close")
        const closeBtn = dlg.querySelector('button[aria-label*="close" i], button[aria-label*="dismiss" i]');
        if (closeBtn) { closeBtn.click(); clickedAny = true; continue; }
      }
      return clickedAny;
    });
    if (!dismissed) break;
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
  }
}

async function unblockViaSettings(page) {
  console.log(`\nOpening User Settings → Privacy & Safety → Blocked Users...`);
  try {
    // Click the gear icon next to user avatar (bottom left)
    await page.locator('button[aria-label*="User Settings" i]').first().click({ timeout: 5000 });
    await page.waitForTimeout(2000);
    await shot(page, 'settings-opened');
    
    // Click Privacy & Safety in the sidebar
    const privacyClicked = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('div[role="tab"], div[class*="sideBar"] div'));
      const t = items.find(el => /privacy.*safety|privacy & safety/i.test(el.textContent || ''));
      if (t) { t.click(); return true; }
      return false;
    });
    if (privacyClicked) console.log(`  Clicked Privacy & Safety`);
    await page.waitForTimeout(1500);
    
    // Scroll the settings panel down to find "Blocked Users" link OR find Friends tab → Blocked
    // In recent Discord UI, blocked users live under: Friends tab in left sidebar of main app, OR Privacy panel
    // Try to navigate via clicking a button labeled "Manage" or "View Blocked Users"
    const blockedClicked = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('div[role="tab"], button, a'));
      const t = all.find(el => /blocked user|^blocked$|manage blocked/i.test(el.textContent || ''));
      if (t) { t.click(); return true; }
      return false;
    });
    if (blockedClicked) {
      console.log(`  Clicked Blocked Users`);
      await page.waitForTimeout(1500);
    }
    await shot(page, 'blocked-list');
    
    // Find target user and click unblock
    const unblockResult = await page.evaluate((target) => {
      // Find row containing target username
      const rows = Array.from(document.querySelectorAll('div')).filter(d => {
        const t = d.textContent || '';
        return t.toLowerCase().includes(target.toLowerCase()) && d.querySelector('button, svg');
      });
      // Find smallest matching row (most specific)
      const row = rows.sort((a, b) => a.textContent.length - b.textContent.length)[0];
      if (!row) return { found: false };
      // Find unblock X button inside
      const btn = row.querySelector('button[aria-label*="Unblock" i], svg[class*="cross" i], button:has(svg)');
      if (btn) {
        btn.click();
        return { found: true, clicked: true, rowText: row.textContent.slice(0, 100) };
      }
      return { found: true, clicked: false, rowText: row.textContent.slice(0, 100) };
    }, TARGET_USERNAME);
    
    console.log(`  Unblock attempt: ${JSON.stringify(unblockResult)}`);
    await page.waitForTimeout(1500);
    
    // Confirm Unblock dialog appears
    const confirmed = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const confirm = buttons.find(b => /unblock|confirm/i.test(b.textContent || '') &&
                                          b.closest('[role="dialog"]'));
      if (confirm) { confirm.click(); return true; }
      return false;
    });
    if (confirmed) console.log(`  + Unblock confirmed`);
    await page.waitForTimeout(2000);
    await shot(page, 'after-unblock');
    
    // Close settings
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  } catch (e) {
    console.log(`Settings flow err: ${e.message}`);
  }
}

async function clickAllShowBlockedExpanders(page) {
  let total = 0;
  for (let pass = 0; pass < 80; pass++) {
    const expanded = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('button, a, span[role="button"], div[role="button"], h3'));
      const matchers = candidates.filter(el => {
        const t = (el.textContent || '').trim().toLowerCase();
        return t === 'show' || /^show$/.test(t) || /blocked message.*show|show.*blocked/i.test(t) || /^show\s+message/i.test(t);
      });
      const clicked = [];
      for (const el of matchers) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && el.offsetParent !== null) {
          el.click();
          clicked.push(el.textContent.slice(0, 80));
        }
      }
      return clicked;
    });
    if (expanded.length === 0) break;
    total += expanded.length;
    await page.waitForTimeout(400);
  }
  return total;
}

async function main() {
  console.log(`Launching with persistent profile (you're already logged in from last run)...`);
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    executablePath: '/Users/johnn/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  
  // Start at the @me main app to verify login + dismiss any startup modals
  await page.goto('https://discord.com/channels/@me');
  await page.waitForTimeout(3000);
  await dismissModals(page);
  await shot(page, 'logged-in-state');
  
  // === Unblock the user first ===
  await unblockViaSettings(page);
  
  // === Now navigate to DM ===
  console.log(`\nNavigating to DM: ${TARGET_DM}`);
  await page.goto(TARGET_DM, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await dismissModals(page);
  await shot(page, 'dm-loaded-after-unblock');
  
  console.log(`Initial pass: click all "Show" expanders on visible blocked messages...`);
  const initial = await clickAllShowBlockedExpanders(page);
  console.log(`  Expanded ${initial}`);
  await page.waitForTimeout(1500);
  await dismissModals(page);
  await shot(page, 'after-initial-expand');
  
  console.log(`\nScroll to TOP...`);
  let prevHeight = 0, stable = 0;
  for (let i = 0; i < 500; i++) {
    const r = await page.evaluate(() => {
      const sc = document.querySelector('main [class*="scroller"]') || document.querySelector('[data-list-id="chat-messages"]');
      if (!sc) return { ok: false };
      sc.scrollTop = 0;
      return { ok: true, scrollTop: sc.scrollTop, scrollHeight: sc.scrollHeight };
    });
    if (!r.ok) break;
    await page.waitForTimeout(600);
    await dismissModals(page);
    if (i % 4 === 3) await clickAllShowBlockedExpanders(page);
    if (i % 25 === 24) await shot(page, `scroll-up-${i}`);
    if (r.scrollTop === 0 && r.scrollHeight === prevHeight) {
      stable++;
      if (stable >= 4) { console.log(`+ At top after ${i+1} scrolls (height=${r.scrollHeight})`); break; }
    } else { stable = 0; }
    prevHeight = r.scrollHeight;
    if (i % 10 === 9) console.log(`  scroll ${i+1}, h=${r.scrollHeight}`);
  }
  
  await clickAllShowBlockedExpanders(page);
  await page.waitForTimeout(2000);
  await dismissModals(page);
  await shot(page, 'at-top-fully-expanded');
  
  console.log(`\nNow scroll DOWN with chunked screenshots...`);
  for (let i = 0; i < 80; i++) {
    await page.evaluate(() => {
      const sc = document.querySelector('main [class*="scroller"]') || document.querySelector('[data-list-id="chat-messages"]');
      if (sc) sc.scrollBy({ top: 600, behavior: 'instant' });
    });
    await page.waitForTimeout(400);
    await dismissModals(page);
    if (i % 2 === 1) await clickAllShowBlockedExpanders(page);
    await shot(page, `down-${String(i).padStart(3,'0')}`);
    const bottom = await page.evaluate(() => {
      const sc = document.querySelector('main [class*="scroller"]') || document.querySelector('[data-list-id="chat-messages"]');
      if (!sc) return true;
      return Math.abs(sc.scrollHeight - sc.clientHeight - sc.scrollTop) < 30;
    });
    if (bottom) { console.log(`+ Reached bottom`); break; }
  }
  
  shotCount++;
  await page.screenshot({ path: join(OUT, 'screenshots', `v3-${String(shotCount).padStart(3,'0')}-FINAL-fullpage.png`), fullPage: true });
  console.log(`  [final fullshot ${shotCount}]`);
  
  console.log(`\nExtracting messages from DOM...`);
  const messages = await page.evaluate(() => {
    const items = document.querySelectorAll('[id^="chat-messages-"], li[class*="messageListItem"], [data-list-item-id^="chat-messages"]');
    return Array.from(items).map((el) => {
      const timeEl = el.querySelector('time');
      const authorEl = el.querySelector('[class*="username"]') || el.querySelector('h3 span');
      const contentEl = el.querySelector('[id^="message-content"]') || el.querySelector('[class*="messageContent"]');
      const attachments = [
        ...Array.from(el.querySelectorAll('a[href*="cdn.discordapp.com"]')).map(a => a.href),
        ...Array.from(el.querySelectorAll('img[src*="cdn.discordapp.com"]')).map(a => a.src),
      ];
      return {
        id: el.id || null,
        timestamp_iso: timeEl?.getAttribute('datetime') || null,
        timestamp_display: timeEl?.textContent || null,
        author: authorEl?.textContent?.trim() || null,
        content: contentEl?.innerText?.trim() || contentEl?.textContent?.trim() || null,
        attachments: [...new Set(attachments)],
      };
    }).filter(m => m.content || m.attachments.length);
  });
  
  console.log(`Extracted ${messages.length} messages`);
  writeFileSync(join(OUT, 'dm-messages.json'), JSON.stringify(messages, null, 2));
  writeFileSync(join(OUT, 'dm-messages.txt'),
    messages.map(m => 
      `[${m.timestamp_iso || m.timestamp_display || '?'}] ${m.author || '?'}: ${m.content || '(media)'}` +
      (m.attachments.length ? '\n  ATTACH:\n    ' + m.attachments.join('\n    ') : '')
    ).join('\n\n')
  );
  writeFileSync(join(OUT, 'dm-page.html'), await page.content());
  
  console.log(`\n+ Done.`);
  console.log(`  ${OUT}/dm-messages.json (${messages.length} msgs)`);
  console.log(`  ${OUT}/dm-messages.txt`);
  console.log(`  ${OUT}/dm-page.html`);
  console.log(`  ${OUT}/screenshots/v3-*.png (${shotCount} screenshots)`);
}

main().catch(e => { console.error(e); process.exit(1); });
