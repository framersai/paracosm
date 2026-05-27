/**
 * Launches a NEW Chromium window with persistent profile.
 * User logs in, navigates to target DM, then we screenshot + scrape everything.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT = `${process.env.HOME}/Documents/agentos-star-audit/scammers/dm-scrape`;
const PROFILE = `${process.env.HOME}/.agentos-evidence-chrome-profile`;
mkdirSync(OUT, { recursive: true });
mkdirSync(`${OUT}/screenshots`, { recursive: true });
mkdirSync(PROFILE, { recursive: true });

const TARGET_DM = 'https://discord.com/channels/@me/1492963001756553357';
const TARGET_USERNAME = 'itxjames111';

let shotCount = 0;
async function shot(page, label) {
  shotCount++;
  const fname = `${String(shotCount).padStart(3,'0')}-${label}.png`;
  await page.screenshot({ path: join(OUT, 'screenshots', fname), fullPage: false });
  console.log(`  [shot ${shotCount}] ${fname}`);
}
async function fullshot(page, label) {
  shotCount++;
  const fname = `${String(shotCount).padStart(3,'0')}-${label}-fullpage.png`;
  await page.screenshot({ path: join(OUT, 'screenshots', fname), fullPage: true });
  console.log(`  [fullshot ${shotCount}] ${fname}`);
}

async function main() {
  console.log(`Launching Chromium with persistent profile at ${PROFILE}`);
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    executablePath: "/Users/johnn/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  
  console.log(`Navigating to Discord login (you'll need to sign in)...`);
  await page.goto('https://discord.com/login');
  await shot(page, 'login-page');
  
  console.log(`\n>>> SIGN IN TO DISCORD IN THE CHROMIUM WINDOW THAT JUST OPENED.`);
  console.log(`>>> Use your normal credentials. I'll wait for you to land on Discord's main app.`);
  console.log(`>>> Polling for /channels/@me URL...`);
  
  // Poll for login completion
  let loggedIn = false;
  for (let i = 0; i < 600; i++) { // 10 min max
    const url = page.url();
    if (url.includes('discord.com/channels/@me') || url.includes('discord.com/channels/')) {
      loggedIn = true;
      console.log(`+ Logged in detected (URL=${url})`);
      await shot(page, 'logged-in');
      break;
    }
    await page.waitForTimeout(1000);
    if (i % 30 === 0) console.log(`  ...still waiting (${i}s elapsed, current URL: ${url})`);
  }
  if (!loggedIn) {
    console.log(`! Timed out waiting for login`);
    return;
  }
  
  await page.waitForTimeout(2000);
  
  // Try to unblock via Settings → Privacy → Blocked Users
  console.log(`\nOpening User Settings to unblock ${TARGET_USERNAME}...`);
  try {
    // Click gear icon (User Settings) — usually bottom-left
    await page.locator('button[aria-label*="User Settings" i]').first().click({ timeout: 5000 });
    await page.waitForTimeout(1500);
    await shot(page, 'settings-opened');
    
    // Navigate to Privacy & Safety
    const privacyTab = page.locator('div[role="tab"]:has-text("Privacy"), div:has-text("Privacy & Safety")').first();
    if (await privacyTab.count() > 0) {
      await privacyTab.click();
      await page.waitForTimeout(1000);
      await shot(page, 'privacy-tab');
    }
    
    // Find Blocked Users section
    const blockedSection = page.locator('div[role="tab"]:has-text("Blocked"), div:has-text("Blocked Users")').first();
    if (await blockedSection.count() > 0) {
      await blockedSection.click();
      await page.waitForTimeout(1500);
      await shot(page, 'blocked-list');
      
      // Find unblock button for target user
      const targetRow = page.locator(`div:has-text("${TARGET_USERNAME}")`).first();
      if (await targetRow.count() > 0) {
        // Look for the unblock x button
        const unblockBtn = targetRow.locator('xpath=ancestor-or-self::*[contains(@class, "user")][1]').locator('button[aria-label*="Unblock" i], svg[class*="icon" i]').first();
        await unblockBtn.click({ timeout: 3000 }).catch(() => console.log(`  (no direct unblock button found, trying hover)`));
        await page.waitForTimeout(500);
        // Confirm dialog
        const confirmBtn = page.locator('button:has-text("Unblock"), button:has-text("Confirm"), button:has-text("Yes")').last();
        if (await confirmBtn.count() > 0) {
          await confirmBtn.click();
          console.log(`  + Unblock confirmed`);
        }
      } else {
        console.log(`  (${TARGET_USERNAME} not in blocked list — already unblocked or never blocked)`);
      }
      await shot(page, 'after-unblock');
    }
    
    // Close settings
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  } catch (e) {
    console.log(`Unblock attempt failed: ${e.message}`);
    console.log(`(continuing anyway — DM history may still be visible)`);
  }
  
  console.log(`\nNavigating to target DM: ${TARGET_DM}`);
  await page.goto(TARGET_DM, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await shot(page, 'dm-loaded');
  
  console.log(`\nAuto-scrolling to load full history...`);
  let prevHeight = 0;
  let stableCount = 0;
  for (let i = 0; i < 300; i++) {
    const result = await page.evaluate(() => {
      const scroller = document.querySelector('main [class*="scroller"]') 
                    || document.querySelector('[data-list-id="chat-messages"]')
                    || document.querySelector('[class*="messagesWrapper"] [class*="scroller"]');
      if (!scroller) return { ok: false };
      const before = scroller.scrollTop;
      scroller.scrollTop = 0;
      return { ok: true, scrollTop: scroller.scrollTop, scrollHeight: scroller.scrollHeight, prevScrollTop: before };
    });
    if (!result.ok) { console.log(`  no scroller at iter ${i}`); break; }
    await page.waitForTimeout(800);
    
    if (i % 15 === 0 && i > 0) await shot(page, `scroll-${i}`);
    
    if (result.scrollTop === 0 && result.scrollHeight === prevHeight) {
      stableCount++;
      if (stableCount >= 3) {
        console.log(`+ Hit top of conversation (stable ${stableCount}x) after ${i+1} scrolls`);
        break;
      }
    } else {
      stableCount = 0;
    }
    prevHeight = result.scrollHeight;
    if (i % 10 === 9) console.log(`  scroll ${i+1}, scrollHeight=${result.scrollHeight}`);
  }
  
  await page.waitForTimeout(2000);
  await fullshot(page, 'dm-fully-scrolled-top');
  
  // Scroll back DOWN and take screenshots in chunks for visual evidence
  console.log(`\nTaking chunked screenshots while scrolling down for full visual record...`);
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => {
      const scroller = document.querySelector('main [class*="scroller"]') 
                    || document.querySelector('[data-list-id="chat-messages"]');
      if (scroller) scroller.scrollBy({ top: 800, behavior: 'instant' });
    });
    await page.waitForTimeout(500);
    await shot(page, `chunk-down-${i}`);
    const atBottom = await page.evaluate(() => {
      const sc = document.querySelector('main [class*="scroller"]') || document.querySelector('[data-list-id="chat-messages"]');
      if (!sc) return true;
      return Math.abs(sc.scrollHeight - sc.clientHeight - sc.scrollTop) < 20;
    });
    if (atBottom) {
      console.log(`+ Reached bottom of conversation`);
      break;
    }
  }
  await fullshot(page, 'dm-final-fullpage');
  
  console.log(`\nExtracting all messages from DOM...`);
  const messages = await page.evaluate(() => {
    const items = document.querySelectorAll('[id^="chat-messages-"], li[class*="messageListItem"], [data-list-item-id^="chat-messages"]');
    return Array.from(items).map((el) => {
      const timeEl = el.querySelector('time');
      const authorEl = el.querySelector('[class*="username"]') || el.querySelector('h3 span');
      const contentEl = el.querySelector('[id^="message-content"]') || el.querySelector('[class*="messageContent"]');
      const attachments = [
        ...Array.from(el.querySelectorAll('a[href*="cdn.discordapp.com"]')).map(a => a.href),
        ...Array.from(el.querySelectorAll('img[src*="cdn.discordapp.com"]')).map(a => a.src),
        ...Array.from(el.querySelectorAll('video source, video')).map(a => a.src || a.querySelector('source')?.src).filter(Boolean),
      ];
      return {
        id: el.id || el.getAttribute('data-list-item-id') || null,
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
      `[${m.timestamp_iso || m.timestamp_display}] ${m.author}: ${m.content || '(no text)'}` +
      (m.attachments.length ? '\n  ATTACHMENTS:\n    ' + m.attachments.join('\n    ') : '')
    ).join('\n\n')
  );
  writeFileSync(join(OUT, 'dm-page.html'), await page.content());
  
  console.log(`\n+ Complete.`);
  console.log(`  ${OUT}/dm-messages.json (${messages.length} messages)`);
  console.log(`  ${OUT}/dm-messages.txt`);
  console.log(`  ${OUT}/dm-page.html`);
  console.log(`  ${OUT}/screenshots/ (${shotCount} screenshots)`);
  console.log(`\nKeeping browser open — close it when you're done verifying.`);
}

main().catch(e => { console.error(e); process.exit(1); });
