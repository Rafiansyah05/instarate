import puppeteer from 'puppeteer-core';
import { existsSync } from 'fs';

const IG_BASE = 'https://www.instagram.com';
const NAV_TIMEOUT = 20000;

function findChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const platform = process.platform;
  const candidates = {
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe',
    ],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
    linux: ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'],
  };

  const paths = candidates[platform] || candidates.linux;
  const found = paths.find((p) => p && existsSync(p));

  if (!found) {
    throw new Error(`Chrome tidak ditemukan. Install Google Chrome atau set PUPPETEER_EXECUTABLE_PATH di .env.local\nPaths dicek:\n${paths.join('\n')}`);
  }
  console.log(`[screenshot] Browser: ${found}`);
  return found;
}

async function makeBrowser() {
  return puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--disable-gpu', '--disable-blink-features=AutomationControlled', '--window-size=390,844'],
    defaultViewport: {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
  });
}

async function setupPage(browser) {
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) ' + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1');

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"iOS"',
  });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['id-ID', 'id', 'en'] });
    window.chrome = { runtime: {} };
  });

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    const url = req.url();
    if (['font', 'media', 'websocket'].includes(type) || url.includes('google-analytics') || url.includes('facebook.com/tr') || url.includes('doubleclick')) {
      req.abort();
    } else {
      req.continue();
    }
  });

  page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  return page;
}

async function dismissPopups(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[role="dialog"]').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 200) el.style.display = 'none';
    });
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
  });
}

async function readPageStatus(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || '';
    const url = window.location.href;
    if (url.includes('/login') || url.includes('/accounts/login')) return 'login_wall';
    if (text.includes("Sorry, this page isn't available") || text.includes('Halaman ini tidak tersedia')) return 'not_found';
    if (text.includes('This Account is Private') || text.includes('Akun ini bersifat pribadi') || text.includes('This account is private')) return 'private';
    const hasContent = !!(document.querySelector('header') || document.querySelector('main') || document.querySelector('meta[property="og:title"]'));
    return hasContent ? 'public' : 'unknown';
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randDelay = (min, max) => sleep(min + Math.random() * (max - min));

async function attempt(username) {
  const browser = await makeBrowser();
  try {
    const page = await setupPage(browser);
    await randDelay(300, 800);

    const resp = await page
      .goto(`${IG_BASE}/${username}/`, {
        waitUntil: 'domcontentloaded',
      })
      .catch(() => null);

    if (resp && resp.status() === 404) {
      return { exists: false, isPrivate: false, screenshotBase64: null, method: 'none' };
    }

    await randDelay(1500, 2800);
    const status = await readPageStatus(page);
    console.log(`[screenshot] @${username} → ${status}`);

    if (status === 'not_found') {
      return { exists: false, isPrivate: false, screenshotBase64: null, method: 'none' };
    }
    if (status === 'login_wall') {
      return { exists: true, isPrivate: false, screenshotBase64: null, method: 'login_wall', loginWall: true };
    }

    await dismissPopups(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(500);
    await dismissPopups(page);
    await sleep(300);

    const buf = await page.screenshot({
      type: 'jpeg',
      quality: 82,
      clip: { x: 0, y: 0, width: 390, height: 720 },
    });

    return {
      exists: true,
      isPrivate: status === 'private',
      screenshotBase64: buf.toString('base64'),
      method: status === 'private' ? 'direct_private' : 'direct_public',
      loginWall: false,
    };
  } finally {
    await browser.close();
  }
}

export async function getInstagramScreenshot(username) {
  try {
    const result = await attempt(username);

    if (result.loginWall) {
      console.log(`[screenshot] Login wall — retrying @${username} in 3s...`);
      await sleep(3000);
      try {
        const retry = await attempt(username);
        if (!retry.loginWall) return retry;
      } catch (e) {
        console.error('[screenshot] Retry error:', e.message);
      }
      return { exists: true, isPrivate: false, screenshotBase64: null, method: 'login_wall', loginWall: true };
    }

    return result;
  } catch (err) {
    console.error(`[screenshot] Fatal @${username}:`, err.message);
    return { exists: true, isPrivate: false, screenshotBase64: null, method: 'error', loginWall: false };
  }
}
