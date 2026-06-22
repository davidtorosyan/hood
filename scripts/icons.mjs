// Rasterizes public/favicon.svg into the PNG app icons the PWA manifest needs.
// Run: node scripts/icons.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const svg = readFileSync('public/favicon.svg', 'utf8');
mkdirSync('public/icons', { recursive: true });

const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<style>html,body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`,
  );
  await page.locator('svg').screenshot({ path: `public/icons/icon-${size}.png`, omitBackground: true });
  await page.close();
  console.log(`wrote public/icons/icon-${size}.png`);
}
await browser.close();
