import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SITE_URL = process.env.SITE_URL;
const SITE_NAME = process.env.SITE_NAME || 'site';
const OUTPUT_DIR = process.env.OUTPUT_DIR || 'output';
const AUTH_STATE_PATH = process.env.AUTH_STATE_PATH || path.join('.auth', 'storage-state.json');
const AUTH_USERNAME = process.env.WP_USERNAME;
const AUTH_PASSWORD = process.env.WP_PASSWORD;
const EXPECTED_MODAL_SELECTOR = process.env.EXPECTED_MODAL_SELECTOR || '#pmsm-modal:not([hidden])';
const EXPECTED_MODAL_DIALOG_SELECTOR = '#pmsm-modal .pmsm-modal__dialog';
const NON_REGISTERED_MESSAGE_TEXT = process.env.NON_REGISTERED_MESSAGE_TEXT || 'usuario no registrado|usuarios no registrados|no registrado|not registered|not logged in';
const PMSM_STORAGE_TERMS = [
  'pmsm',
  'subscription_modal',
  'subscription-modal',
  'pmpro_modal',
  'pmpro-modal'
];

if (!SITE_URL) {
  console.error('Missing SITE_URL environment variable.');
  process.exit(1);
}

const LOGIN_URL = process.env.WP_LOGIN_URL || new URL('/wp-login.php', SITE_URL).toString();

function sanitizeName(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
}

function getDateParts() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return {
    dateFolder: `${year}-${month}-${day}`,
    monthFolder: `${year}-${month}`
  };
}

function authStateExists() {
  return fs.existsSync(AUTH_STATE_PATH);
}

function authStorageOption() {
  return authStateExists() ? { storageState: AUTH_STATE_PATH } : {};
}

function loginPath() {
  return new URL(LOGIN_URL).pathname.replace(/\/$/, '');
}

function isLoginUrl(pageUrl) {
  const current = new URL(pageUrl);
  const expectedPath = loginPath();
  return current.pathname.replace(/\/$/, '') === expectedPath || current.pathname.includes('wp-login.php');
}

async function waitForPage(page) {
  await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {
    console.log('Load event timed out, continuing anyway');
  });

  await page.waitForTimeout(5000);
}

async function hasVisibleText(page, textPattern) {
  const locator = page.getByText(new RegExp(textPattern, 'i'));
  return await locator.first().isVisible({ timeout: 3000 }).catch(() => false);
}

async function hasVisibleSelector(page, selector) {
  const locator = page.locator(selector);
  await locator.first().waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});

  const count = Math.min(await locator.count(), 20);
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) {
      return true;
    }
  }

  return false;
}

async function addPmsmCooldownReset(page) {
  await page.addInitScript((terms) => {
    const matchesPmsmTerm = (name) => {
      const normalized = String(name || '').toLowerCase();
      return terms.some((term) => normalized.includes(term));
    };

    const removeMatchingStorageKeys = (storage) => {
      if (!storage) {
        return;
      }

      const keys = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (matchesPmsmTerm(key)) {
          keys.push(key);
        }
      }

      keys.forEach((key) => storage.removeItem(key));
    };

    removeMatchingStorageKeys(window.localStorage);
    removeMatchingStorageKeys(window.sessionStorage);

    document.cookie.split(';').forEach((cookie) => {
      const name = cookie.split('=')[0].trim();
      if (!matchesPmsmTerm(name)) {
        return;
      }

      const expires = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';
      document.cookie = `${name}=; ${expires}; path=/`;
      document.cookie = `${name}=; ${expires}; path=${window.location.pathname}`;
    });
  }, PMSM_STORAGE_TERMS);
}

async function pmsmDiagnostics(page) {
  return await page.evaluate(() => {
    const modal = document.querySelector('#pmsm-modal');
    const computed = modal ? window.getComputedStyle(modal) : null;
    const matchingKeys = (storage) => {
      const keys = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (/pmsm|modal|pmpro/i.test(key)) {
          keys.push(key);
        }
      }
      return keys;
    };

    return {
      url: window.location.href,
      modalExists: Boolean(modal),
      hidden: modal ? modal.getAttribute('hidden') : null,
      display: computed ? computed.display : null,
      visibility: computed ? computed.visibility : null,
      opacity: computed ? computed.opacity : null,
      className: modal ? modal.className : null,
      localStorageKeys: matchingKeys(window.localStorage),
      sessionStorageKeys: matchingKeys(window.sessionStorage)
    };
  });
}

async function logPmsmDiagnostics(page) {
  const diagnostics = await pmsmDiagnostics(page).catch((error) => ({
    error: `${error.name}: ${error.message}`
  }));

  console.error('PMSM modal diagnostics:');
  console.error(JSON.stringify(diagnostics, null, 2));
}

async function validateAuthenticatedCapture(page) {
  if (isLoginUrl(page.url())) {
    throw new Error(`Authentication validation failed: redirected to login (${page.url()}).`);
  }

  if (await hasVisibleText(page, NON_REGISTERED_MESSAGE_TEXT)) {
    throw new Error('Authentication validation failed: non-registered user message is visible.');
  }

  if (!await page.locator(EXPECTED_MODAL_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false)) {
    await logPmsmDiagnostics(page);
    throw new Error(`Capture validation failed: expected modal is not visible (${EXPECTED_MODAL_SELECTOR}).`);
  }

  if (!await hasVisibleSelector(page, EXPECTED_MODAL_DIALOG_SELECTOR)) {
    await logPmsmDiagnostics(page);
    throw new Error(`Capture validation failed: expected modal dialog is not visible (${EXPECTED_MODAL_DIALOG_SELECTOR}).`);
  }
}

async function openTargetPage(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await addPmsmCooldownReset(page);

  await page.goto(SITE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  console.log('DOM loaded');
  await waitForPage(page);

  return page;
}

async function login(browser) {
  if (!AUTH_USERNAME || !AUTH_PASSWORD) {
    throw new Error('Missing WP_USERNAME or WP_PASSWORD environment variable.');
  }

  console.log('Creating a fresh authenticated session...');

  const context = await browser.newContext({
    viewport: { width: 1440, height: 2200 }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  try {
    await page.goto(LOGIN_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await page.locator('#user_login, input[name="log"], input[name="username"], input[type="email"]').first().fill(AUTH_USERNAME);
    await page.locator('#user_pass, input[name="pwd"], input[name="password"], input[type="password"]').first().fill(AUTH_PASSWORD);

    await Promise.all([
      page.waitForLoadState('domcontentloaded').catch(() => {}),
      page.locator('#wp-submit, input[type="submit"], button[type="submit"]').first().click()
    ]);

    await addPmsmCooldownReset(page);

    await page.goto(SITE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('DOM loaded');
    await waitForPage(page);
    await validateAuthenticatedCapture(page);

    fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
    await context.storageState({ path: AUTH_STATE_PATH });
    console.log(`Saved authenticated storage state: ${AUTH_STATE_PATH}`);

    return { context, page };
  } catch (error) {
    error.page = page;
    error.context = context;
    throw error;
  }
}

async function authenticatedPage(browser) {
  if (authStateExists()) {
    console.log(`Using stored authenticated session: ${AUTH_STATE_PATH}`);

    const context = await browser.newContext({
      viewport: { width: 1440, height: 2200 },
      ...authStorageOption()
    });
    const page = await openTargetPage(context);

    try {
      await validateAuthenticatedCapture(page);
      return { context, page };
    } catch (error) {
      console.log(`Stored session is not valid: ${error.message}`);
      await context.close();
    }
  }

  return login(browser);
}

async function saveDiagnosticScreenshot(page, targetDir, dateFolder, safeSiteName) {
  if (!page || page.isClosed()) {
    return null;
  }

  const diagnosticsDir = path.join(OUTPUT_DIR, 'diagnostics');
  fs.mkdirSync(diagnosticsDir, { recursive: true });

  const diagnosticPath = path.join(diagnosticsDir, `${dateFolder}-${safeSiteName}-diagnostic.jpg`);
  try {
    await page.screenshot({
      path: diagnosticPath,
      fullPage: true,
      type: 'jpeg',
      quality: 80
    });
    return diagnosticPath;
  } catch {
    const fallbackPath = path.join(targetDir, `${dateFolder}-${safeSiteName}-diagnostic.jpg`);
    await page.screenshot({
      path: fallbackPath,
      fullPage: true,
      type: 'jpeg',
      quality: 80
    });
    return fallbackPath;
  }
}

async function main() {
  const { dateFolder, monthFolder } = getDateParts();
  const safeSiteName = sanitizeName(SITE_NAME);

  const targetDir = path.join(OUTPUT_DIR, monthFolder, dateFolder);
  fs.mkdirSync(targetDir, { recursive: true });

  const topPath = path.join(targetDir, `${dateFolder}-${safeSiteName}-home-top.jpg`);
  const fullPath = path.join(targetDir, `${dateFolder}-${safeSiteName}-home-full.jpg`);

  console.log(`Opening: ${SITE_URL}`);
  console.log(`Output folder: ${targetDir}`);

  const browser = await chromium.launch({ headless: true });
  let page;
  let context;
  let failedContext;

  try {
    ({ context, page } = await authenticatedPage(browser));
    await validateAuthenticatedCapture(page);

    console.log('Taking top screenshot...');
    await page.screenshot({
      path: topPath,
      fullPage: false,
      type: 'jpeg',
      quality: 80
    });

    console.log('Taking full screenshot...');
    await page.screenshot({
      path: fullPath,
      fullPage: true,
      type: 'jpeg',
      quality: 80
    });

    console.log(`Saved top screenshot: ${topPath}`);
    console.log(`Saved full screenshot: ${fullPath}`);
  } catch (error) {
    console.error('Capture failed:');
    console.error(`${error.name}: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    failedContext = error.context;
    const diagnosticPath = await saveDiagnosticScreenshot(page || error.page, targetDir, dateFolder, safeSiteName);
    if (diagnosticPath) {
      console.error(`Saved diagnostic screenshot: ${diagnosticPath}`);
    }
    process.exitCode = 1;
  } finally {
    if (context) {
      await context.close();
    } else if (failedContext) {
      await failedContext.close();
    }
    await browser.close();
  }
}

main();
