// A play tool for tester agents: replays a list of actions on the Freeways
// mode from a fresh start, saving a screenshot after each, and prints what the
// game said. (A "player's eye" — it doesn't reveal answers.)
//
// Usage: node scripts/playtest.mjs <actions.json> <outdir> [--drive N]
//   actions.json: [ {"drag":[x,y],"to":[x,y]}, {"tap":[x,y]}, {"button":"Skip"},
//                   {"wait":1500} ]  — coordinates are screenshot pixels.
//   Add "hold": true to a drag to also get a screenshot mid-drag, before the
//   finger lifts (to see what you're carrying).
// The viewport is a 430×932 phone at 1× scale, so screenshot pixels = tap points.
// Needs the dev server (npm run dev). Set CHROMIUM_PATH if needed.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';

const [file, out = '.playtest'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const di = process.argv.indexOf('--drive');
const drive = di > 0 ? Number(process.argv[di + 1]) : 0;
const actions = file ? JSON.parse(readFileSync(file, 'utf8')) : [];
const URL = process.env.HOOD_URL ?? 'http://localhost:5173/hood/';

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL);
await page.evaluate((n) => {
  localStorage.clear();
  localStorage.setItem('hood.v2', JSON.stringify({ freeways: { progress: {}, puzzles: {}, at: n }, coached: true }));
}, drive);
await page.reload();
await page.locator('.home-play-3').click();
await page.waitForTimeout(700);

const report = async (i, what) => {
  const text = await page.evaluate(() => ({
    msg: document.querySelector('.fw-msg')?.textContent || '',
    leg: document.querySelector('.fw-tray-label')?.textContent || '',
  }));
  const name = `${out}/step-${String(i).padStart(2, '0')}.png`;
  await page.screenshot({ path: name });
  console.log(`[${i}] ${what}\n    tray: ${text.leg}\n    says: ${text.msg}\n    shot: ${name}`);
};
await report(0, 'start');
let i = 0;
for (const a of actions) {
  i++;
  if (a.drag) {
    await page.mouse.move(...a.drag);
    await page.mouse.down();
    await page.mouse.move(...a.to, { steps: 16 });
    if (a.hold) {
      await page.waitForTimeout(250);
      await report(`${i}-held`, `holding at ${a.to} (not released yet)`);
    }
    await page.mouse.up();
    await page.waitForTimeout(a.wait ?? 2800);
    await report(i, `drag ${a.drag} → ${a.to}`);
  } else if (a.tap) {
    await page.mouse.click(...a.tap);
    await page.waitForTimeout(a.wait ?? 600);
    await report(i, `tap ${a.tap}`);
  } else if (a.button) {
    await page.getByRole('button', { name: a.button }).first().click();
    await page.waitForTimeout(a.wait ?? 1200);
    await report(i, `button ${a.button}`);
  } else if (a.wait) {
    await page.waitForTimeout(a.wait);
    await report(i, `wait ${a.wait}`);
  }
}
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
await browser.close();
