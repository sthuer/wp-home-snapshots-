import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SITE_URL = process.env.SITE_URL;
const SITE_NAME = process.env.SITE_NAME || 'site';
const OUTPUT_DIR = process.env.OUTPUT_DIR || 'output';

if (!SITE_URL) {
  console.error('Missing SITE_URL environment variable.');
  process.exit(1);
}

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
  const page = await browser.newPage({
    viewport: { width: 1440, height: 2200 }
  });

  page.setDefaultTimeout(30000);

  try {
    await page.goto(SITE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('DOM loaded');

    await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {
      console.log('Load event timed out, continuing anyway');
    });

    await page.waitForTimeout(5000);

    console.log('Taking top screenshot...');
    await page.screenshot({
      path: topPath,
      fullPage: false,
      type: 'jpg',
      quality: 80
    });

    console.log('Taking full screenshot...');
    await page.screenshot({
      path: topPath,
      fullPage: true,
      type: 'jpg',
      quality: 80
    });

    console.log(`Saved top screenshot: ${topPath}`);
    console.log(`Saved full screenshot: ${fullPath}`);
  } catch (error) {
    console.error('Capture failed:');
    console.error(error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();