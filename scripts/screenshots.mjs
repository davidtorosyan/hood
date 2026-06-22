// Drives Hood's zoomable Jigsaw at a phone viewport and saves labeled
// screenshots to .ui-review/, failing on any console error. The eye for the
// ui-review skill: home → assemble the region map → zoom into a region →
// assemble that level → zoom out.
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

// Read the live pieces (name, true centroid, current translate, placed?).
const readPieces = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.jig-piece')].map((g) => {
      const t = g.getAttribute('transform') || 'translate(0 0)';
      const m = t.match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/);
      return {
        name: g.querySelector('.jig-label').textContent,
        tx: +m[1],
        ty: +m[2],
        lx: +g.dataset.cx,
        ly: +g.dataset.cy,
        placed: g.classList.contains('placed'),
        zoomable: g.classList.contains('zoomable'),
      };
    }),
  );

// Raise a loose piece to the top and return a screen point PROVABLY inside its
// shape (via isPointInFill). A piece's centroid can fall in a concavity, so once
// it's nudged into the assembled cluster a centroid grab would hit-test a piece
// behind it — this samples the fill so the grab always lands on the piece.
const grabPoint = (name) =>
  page.evaluate((nm) => {
    const g = [...document.querySelectorAll('.jig-piece')].find(
      (el) => el.querySelector('.jig-label').textContent === nm,
    );
    if (!g) return null;
    g.parentNode.appendChild(g); // raise above siblings
    const path = g.querySelector('.jig-shape');
    const svg = g.ownerSVGElement;
    const bb = path.getBBox();
    const pt = svg.createSVGPoint();
    for (let iy = 1; iy < 8; iy++) {
      for (let ix = 1; ix < 8; ix++) {
        pt.x = bb.x + (bb.width * ix) / 8;
        pt.y = bb.y + (bb.height * iy) / 8;
        if (path.isPointInFill(pt)) {
          const s = pt.matrixTransform(path.getScreenCTM());
          return { sx: s.x, sy: s.y };
        }
      }
    }
    return null;
  }, name);

// Drag every loose piece to its TRUE position (translate 0). Grabbing a point on
// the piece and dragging by exactly its current translate zeroes it. A
// connection also requires adjacency to a placed piece, so repeat in passes
// until everything locks (the adjacency graph is connected → this converges).
async function solveBoard(onMidway) {
  const svg = page.locator('svg.jig');
  const box = await svg.boundingBox();
  const u2px = box.width / 1000;
  let didMid = false;
  for (let pass = 0; pass < 8; pass++) {
    const ps = await readPieces();
    if (ps.every((p) => p.placed)) break;
    for (const p of ps) {
      if (p.placed) continue;
      const grab = await grabPoint(p.name);
      if (!grab) continue;
      const toX = grab.sx - p.tx * u2px; // shift by -translate → true position
      const toY = grab.sy - p.ty * u2px;
      await page.mouse.move(grab.sx, grab.sy);
      await page.mouse.down();
      await page.mouse.move(toX, toY, { steps: 16 });
      await page.mouse.move(toX, toY);
      await page.mouse.up();
      await page.waitForTimeout(45);
      if (!didMid && onMidway) {
        await onMidway();
        didMid = true;
      }
    }
  }
}

await page.goto(URL, { waitUntil: 'networkidle' });
await shot('home');

// Enter the Jigsaw.
await page.getByRole('button', { name: 'Play' }).click();
await page.waitForTimeout(1700); // let the explode intro settle into the scatter
await shot('regions-initial');

await solveBoard(() => shot('regions-midway'));
{
  const left = (await readPieces()).filter((p) => !p.placed);
  if (left.length) console.log('UNPLACED after solve:', JSON.stringify(left));
}
await shot('regions-solved');

// Zoom into the first zoomable region.
{
  const ps = await readPieces();
  const target = ps.find((p) => p.zoomable) ?? ps[0];
  const box = await page.locator('svg.jig').boundingBox();
  const u2px = box.width / 1000;
  await page.mouse.click(box.x + target.lx * u2px, box.y + target.ly * u2px);
  await page.waitForTimeout(1700); // zoom anim + child intro
  await shot('region-zoomed-initial');
  await solveBoard();
  await shot('region-solved');
}

// Zoom back out via the "up" control.
await page.locator('.jig-up').click();
await page.waitForTimeout(1100);
await shot('zoomed-back-out');

await browser.close();

if (errors.length) {
  console.log('\nCONSOLE ERRORS:');
  for (const e of errors) console.log(' -', e);
  process.exit(1);
}
console.log(`\nOK — ${step} screenshots in ${OUT}/`);
