// Drives Hood through a full session at a phone viewport and saves labeled
// screenshots to .ui-review/, capturing any console errors. This is the eye
// for the UI-review loop (see .claude/skills/ui-review).
//
// Usage: node scripts/screenshots.mjs [url]
//   default url: http://localhost:5175/hood/
import { chromium, devices } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';

const URL = process.argv[2] ?? process.env.HOOD_URL ?? 'http://localhost:5175/hood/';
const OUT = '.ui-review';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

let step = 0;
const shot = async (label) => {
  await page.waitForTimeout(350);
  const name = `${String(++step).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path: `${OUT}/${name}` });
  console.log(`shot ${name}`);
};

await page.goto(URL, { waitUntil: 'networkidle' });
await shot('home');

await page.getByRole('button', { name: 'Play' }).click();
await shot('round1-where-prompt');

// Tap roughly in the middle of the map to answer a "where" round.
const map = page.locator('svg.map');
const box = await map.boundingBox();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
await shot('round1-where-reveal');

await page.getByRole('button', { name: /Next|See results/ }).click();
await shot('round2-what-choices');

await page.locator('.choice').first().click();
await shot('round2-what-reveal');

await browser.close();

if (errors.length) {
  console.log('\nCONSOLE ERRORS:');
  for (const e of errors) console.log(' -', e);
  process.exit(1);
}
console.log(`\nOK — ${step} screenshots in ${OUT}/`);
