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

// --- Jigsaw --- (selector, then simulate dragging each piece to assemble)
await page.getByText('Jigsaw', { exact: true }).click();
await shot('jigsaw-select');
await page.locator('.mode-card').first().click();
await page.waitForTimeout(1700); // let the explode intro settle into the scatter
await shot('jigsaw-initial');
{
  const svg = page.locator('svg.jig');
  const box = await svg.boundingBox();
  const u2px = box.width / 1000;
  // A piece's true position is translate(0,0). Drag every unplaced piece there.
  // Because a connection now also requires adjacency to a placed piece, a piece
  // dropped before its neighbor won't lock yet — so we repeat in passes until
  // everything is placed (the adjacency graph is connected, so this converges).
  const read = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.jig-piece')].map((g) => {
        const t = g.getAttribute('transform') || 'translate(0 0)';
        const m = t.match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/);
        const l = g.querySelector('.jig-label');
        return {
          name: l.textContent,
          tx: +m[1], ty: +m[2],
          lx: +l.getAttribute('x'), ly: +l.getAttribute('y'),
          placed: g.classList.contains('placed'),
        };
      }),
    );
  // Raise a piece to the top so a simulated grab can't hit an overlapping piece.
  const raise = (name) =>
    page.evaluate((nm) => {
      const g = [...document.querySelectorAll('.jig-piece')].find(
        (el) => el.querySelector('.jig-label').textContent === nm);
      g.parentNode.appendChild(g);
    }, name);
  let shotMid = false;
  for (let pass = 0; pass < 6; pass++) {
    const ps = await read();
    if (ps.every((p) => p.placed)) break;
    for (const p of ps) {
      if (p.placed) continue;
      await raise(p.name);
      const fromX = box.x + (p.lx + p.tx) * u2px;
      const fromY = box.y + (p.ly + p.ty) * u2px;
      const toX = box.x + p.lx * u2px;
      const toY = box.y + p.ly * u2px;
      await page.mouse.move(fromX, fromY);
      await page.mouse.down();
      await page.mouse.move(toX, toY, { steps: 16 });
      await page.mouse.move(toX, toY);
      await page.mouse.up();
      await page.waitForTimeout(45);
      if (!shotMid) { await shot('jigsaw-midway'); shotMid = true; }
    }
  }
  await shot('jigsaw-solved');
}
await back(); // puzzle -> selector
await back(); // selector -> home

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
