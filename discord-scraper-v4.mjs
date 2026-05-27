/**
 * v4 — INCREMENTAL extraction. Scrolls bottom→top, extracts after every viewport,
 * dedupes by message ID. This survives Discord's DOM virtualization.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = `${process.env.HOME}/Documents/agentos-star-audit/scammers/dm-scrape`;
const PROFILE = `${process.env.HOME}/.agentos-evidence-chrome-profile`;
mkdirSync(`${OUT}/screenshots`, { recursive: true });

const TARGET_DM = 'https://discord.com/channels/@me/1492963001756553357';

let shotCount = 0;
async function shot(page, label) {
  shotCount++;
  await page.screenshot({ path: join(OUT, 'screenshots', `v4-${String(shotCount).padStart(3,'0')}-${label}.png`), fullPage: false });
}

async function dismissModals(page) {
  for (let i = 0; i < 5; i++) {
    const did = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      if (!dlg) return false;
      const ok = Array.from(dlg.querySelectorAll('button')).find(b => /^(okay|ok|got it|close|continue)$/i.test((b.textContent || '').trim()));
      if (ok) { ok.click(); return true; }
      const x = dlg.querySelector('button[aria-label*="close" i]');
      if (x) { x.click(); return true; }
      return false;
    });
    if (!did) break;
    await page.waitForTimeout(400);
  }
}

async function expandShows(page) {
  for (let i = 0; i < 30; i++) {
    const did = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('button, span[role="button"], div[role="button"], h3, a'));
      const clicked = [];
      for (const el of all) {
        const t = (el.textContent || '').trim().toLowerCase();
        if (t === 'show' || /^show\s+\d/.test(t) || /blocked.*show|show.*blocked/.test(t)) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && el.offsetParent !== null) { el.click(); clicked.push(t); }
        }
      }
      return clicked;
    });
    if (!did.length) break;
    await page.waitForTimeout(300);
  }
}

function extractMessages(page) {
  return page.evaluate(() => {
    const items = document.querySelectorAll('[id^="chat-messages-"], li[class*="messageListItem"]');
    return Array.from(items).map(el => {
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
}

async function main() {
  console.log('Reconnecting persistent profile...');
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    executablePath: '/Users/johnn/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  
  await page.goto(TARGET_DM, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await dismissModals(page);
  await expandShows(page);
  await page.waitForTimeout(1500);
  await shot(page, 'initial-bottom');
  
  // Discord positions at bottom = MOST RECENT on load. Scroll to absolute bottom first.
  console.log('Force-scroll to absolute bottom (most recent messages)...');
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => {
      const sc = document.querySelector('main [class*="scroller"]') || document.querySelector('[data-list-id="chat-messages"]');
      if (sc) sc.scrollTop = sc.scrollHeight;
    });
    await page.waitForTimeout(300);
  }
  await shot(page, 'at-bottom-most-recent');
  
  // Now extract messages and scroll UP incrementally
  console.log('\n=== INCREMENTAL EXTRACTION bottom→top ===');
  const allMessages = new Map(); // dedupe by id
  let pass = 0;
  let consecutiveNoNew = 0;
  
  while (pass < 600 && consecutiveNoNew < 5) {
    await dismissModals(page);
    await expandShows(page);
    
    const current = await extractMessages(page);
    let newCount = 0;
    for (const m of current) {
      const key = m.id || `${m.timestamp_iso}-${m.author}-${(m.content||'').slice(0,30)}`;
      if (!allMessages.has(key)) {
        allMessages.set(key, m);
        newCount++;
      }
    }
    
    if (pass % 5 === 0) {
      console.log(`  pass ${pass}: viewport has ${current.length} msgs, ${newCount} new, total=${allMessages.size}`);
    }
    if (pass % 20 === 0) {
      await shot(page, `pass-${String(pass).padStart(3,'0')}-total-${allMessages.size}`);
    }
    
    if (newCount === 0) {
      consecutiveNoNew++;
    } else {
      consecutiveNoNew = 0;
    }
    
    // Scroll up one viewport
    const reachedTop = await page.evaluate(() => {
      const sc = document.querySelector('main [class*="scroller"]') || document.querySelector('[data-list-id="chat-messages"]');
      if (!sc) return true;
      const beforeTop = sc.scrollTop;
      sc.scrollBy({ top: -700, behavior: 'instant' });
      return sc.scrollTop === 0 && beforeTop === 0;
    });
    
    if (reachedTop) {
      console.log(`  Hit top at pass ${pass}, total messages: ${allMessages.size}`);
      // Do one more extract just in case
      const final = await extractMessages(page);
      for (const m of final) {
        const key = m.id || `${m.timestamp_iso}-${m.author}-${(m.content||'').slice(0,30)}`;
        if (!allMessages.has(key)) { allMessages.set(key, m); }
      }
      break;
    }
    
    await page.waitForTimeout(600);
    pass++;
  }
  
  console.log(`\n=== Final extract complete. Total unique messages: ${allMessages.size} ===`);
  
  await shot(page, 'after-scroll-up-complete');
  
  // Now scroll DOWN, extracting again to catch anything we missed
  console.log('\n=== Reverse pass: bottom-extraction sweep ===');
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => {
      const sc = document.querySelector('main [class*="scroller"]') || document.querySelector('[data-list-id="chat-messages"]');
      if (sc) sc.scrollTop = sc.scrollHeight;
    });
    await page.waitForTimeout(400);
  }
  await dismissModals(page);
  await expandShows(page);
  
  pass = 0;
  consecutiveNoNew = 0;
  while (pass < 600 && consecutiveNoNew < 5) {
    await dismissModals(page);
    await expandShows(page);
    
    const current = await extractMessages(page);
    let newCount = 0;
    for (const m of current) {
      const key = m.id || `${m.timestamp_iso}-${m.author}-${(m.content||'').slice(0,30)}`;
      if (!allMessages.has(key)) { allMessages.set(key, m); newCount++; }
    }
    if (pass % 10 === 0) {
      console.log(`  reverse pass ${pass}: ${current.length} in viewport, +${newCount} new, total=${allMessages.size}`);
    }
    if (newCount === 0) { consecutiveNoNew++; } else { consecutiveNoNew = 0; }
    
    const reachedTop = await page.evaluate(() => {
      const sc = document.querySelector('main [class*="scroller"]') || document.querySelector('[data-list-id="chat-messages"]');
      if (!sc) return true;
      const beforeTop = sc.scrollTop;
      sc.scrollBy({ top: -700, behavior: 'instant' });
      return sc.scrollTop === 0 && beforeTop === 0;
    });
    if (reachedTop) break;
    await page.waitForTimeout(500);
    pass++;
  }
  
  // Final write
  const msgs = Array.from(allMessages.values());
  msgs.sort((a, b) => (a.timestamp_iso || '').localeCompare(b.timestamp_iso || ''));
  
  writeFileSync(join(OUT, 'dm-messages-v4-full.json'), JSON.stringify(msgs, null, 2));
  writeFileSync(join(OUT, 'dm-messages-v4-full.txt'),
    msgs.map(m => 
      `[${m.timestamp_iso || m.timestamp_display || '?'}] ${m.author || '?'}: ${m.content || '(media)'}` +
      (m.attachments.length ? '\n  ATTACH:\n    ' + m.attachments.join('\n    ') : '')
    ).join('\n\n')
  );
  
  shotCount++;
  await page.screenshot({ path: join(OUT, 'screenshots', `v4-${String(shotCount).padStart(3,'0')}-FINAL-fullpage.png`), fullPage: true });
  
  console.log(`\n+ Complete. ${msgs.length} unique messages.`);
  console.log(`  ${OUT}/dm-messages-v4-full.json`);
  console.log(`  ${OUT}/dm-messages-v4-full.txt`);
  console.log(`  Date range: ${msgs[0]?.timestamp_iso} → ${msgs[msgs.length-1]?.timestamp_iso}`);
}

main().catch(e => { console.error(e); process.exit(1); });
