// Drives Hood through all four modes at a phone viewport and saves labeled
// screenshots to .ui-review/, capturing console errors. The eye for ui-review.
//
// Usage: node scripts/screenshots.mjs [url]
import { chromium, devices } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';

const URL = process.argv[2] ?? process.env.HOOD_URL ?? 'http://localhost:5173/hood/';
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
  await page.waitForTimeout(300);
  const name = `${String(++step).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path: `${OUT}/${name}` });
  console.log(`shot ${name}`);
};
const back = () => page.locator('button[aria-label="Back"]').click();

await page.goto(URL, { waitUntil: 'networkidle' });
await shot('home');

// --- Daily Mystery ---
await page.getByText('Daily Mystery').click();
await shot('mystery-clue1');
await page.getByText('Reveal next clue').click();
await page.getByText('Reveal next clue').click();
await shot('mystery-clues');
await page.locator('.guess-input').fill('Venice');
await page.locator('.suggestion').first().click();
await shot('mystery-guess-feedback');
await page.getByText('Give up').click();
await shot('mystery-reveal');
await page.locator('.choice').first().click();
await shot('mystery-reinforce');
await back();

// --- Card Battle ---
await page.getByText('Card Battle').click();
await shot('battle-question');
await page.locator('.battle-option').first().click();
await shot('battle-explain');
await back();

// --- Build the Cluster ---
await page.getByText('Build the Cluster').click();
await shot('cluster-question');
await page.locator('.choice').first().click();
await shot('cluster-explain');
await back();

// --- Browse ---
await page.getByText('Browse cards').click();
await shot('browse-list');
await page.locator('.browse-row').first().click();
await shot('browse-detail');

await browser.close();

if (errors.length) {
  console.log('\nCONSOLE ERRORS:');
  for (const e of errors) console.log(' -', e);
  process.exit(1);
}
console.log(`\nOK — ${step} screenshots in ${OUT}/`);
