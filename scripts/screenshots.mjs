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

// Read the live pieces (name, true centroid, current translate, placed?). The
// app tracks the translate in data-tx/data-ty (it renders via CSS transform).
const readPieces = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.jig-piece')].map((g) => ({
      name: g.dataset.name,
      tx: +(g.dataset.tx || 0),
      ty: +(g.dataset.ty || 0),
      lx: +g.dataset.cx,
      ly: +g.dataset.cy,
      placed: g.classList.contains('placed'),
      zoomable: g.classList.contains('zoomable'),
    })),
  );

// Raise a loose piece to the top and return a screen point PROVABLY inside its
// shape (via isPointInFill). A piece's centroid can fall in a concavity, so once
// it's nudged into the assembled cluster a centroid grab would hit-test a piece
// behind it — this samples the fill so the grab always lands on the piece.
const grabPoint = (name) =>
  page.evaluate((nm) => {
    const g = [...document.querySelectorAll('.jig-piece')].find(
      (el) => el.dataset.name === nm,
    );
    if (!g) return null;
    g.parentNode.appendChild(g); // raise above siblings
    const path = g.querySelector('.jig-shape');
    const svg = g.ownerSVGElement;
    const bb = path.getBBox(); // geometry coords, pre-translate (the `d` numbers)
    const tx = parseFloat(g.dataset.tx) || 0;
    const ty = parseFloat(g.dataset.ty) || 0;
    const pt = svg.createSVGPoint();
    for (let iy = 1; iy < 8; iy++) {
      for (let ix = 1; ix < 8; ix++) {
        pt.x = bb.x + (bb.width * ix) / 8;
        pt.y = bb.y + (bb.height * iy) / 8;
        if (path.isPointInFill(pt)) {
          // geometry → SVG-root user space (add the piece's translate) → screen.
          const u = svg.createSVGPoint();
          u.x = pt.x + tx;
          u.y = pt.y + ty;
          const s = u.matrixTransform(svg.getScreenCTM());
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

// Press a piece and drag it so its translate becomes (tx,ty); optionally hold
// the press open (release=false) to capture a mid-drag state.
async function pressDragTo(name, tx, ty, release = true) {
  const g = await grabPoint(name);
  const p = (await readPieces()).find((x) => x.name === name);
  const box = await page.locator('svg.jig').boundingBox();
  const u2px = box.width / 1000;
  const toX = g.sx + (tx - p.tx) * u2px;
  const toY = g.sy + (ty - p.ty) * u2px;
  await page.mouse.move(g.sx, g.sy);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 20 });
  await page.mouse.move(toX, toY);
  if (release) await page.mouse.up();
}

// Scramble a solved map by grabbing it and shaking. Shake VERTICALLY to prove
// shake works in any direction, not just side-to-side.
async function shakeScramble() {
  const box = await page.locator('svg.jig').boundingBox();
  const u2px = box.width / 1000;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 8; i++) await page.mouse.move(cx, cy + (i % 2 ? 230 : -230) * u2px);
  await page.mouse.up();
  await page.waitForTimeout(900); // explode → play
}

// Two-finger pinch via synthetic pointer events. spread=true zooms in (fingers
// apart), false zooms out. Returns the change in breadcrumb depth.
async function pinch(spread) {
  const before = await page.locator('.jig-crumb').count();
  await page.evaluate((isSpread) => {
    const svg = document.querySelector('svg.jig');
    const r = svg.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const ev = (type, id, x) =>
      svg.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: cy, bubbles: true, cancelable: true }));
    const a = isSpread ? 30 : 150;
    const b = isSpread ? 165 : 22;
    ev('pointerdown', 1, cx - a);
    ev('pointerdown', 2, cx + a);
    ev('pointermove', 1, cx - b);
    ev('pointermove', 2, cx + b);
    ev('pointerup', 1, cx - b);
    ev('pointerup', 2, cx + b);
  }, spread);
  await page.waitForTimeout(1200);
  return (await page.locator('.jig-crumb').count()) - before;
}

const solveVisible = () => page.locator('.jig-solve').isVisible();
const checkSolve = async (where, want) => {
  if ((await solveVisible()) !== want) errors.push(`BUG: Solve visibility wrong ${where} (want ${want})`);
};
const anyGlow = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.jig-glow')].some((e) => e.getAttribute('d') && e.style.display !== 'none'),
  );

await page.goto(URL, { waitUntil: 'networkidle' });
await shot('home');

// Enter the Jigsaw — the board arrives already assembled (no auto-jumble).
await page.getByRole('button', { name: 'Play' }).click();
await page.waitForTimeout(800);
await shot('regions-assembled');
await checkSolve('when solved', false); // nothing to solve → Solve hidden

// Pan the solved map (a plain drag, no shake), then release — it should spring
// back to centre.
{
  const box = await page.locator('svg.jig').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 55, { steps: 10 });
  await shot('panned');
  await page.mouse.up();
  await page.waitForTimeout(450);
  const off = (await readPieces()).reduce((m, p) => Math.max(m, Math.hypot(p.tx, p.ty)), 0);
  if (off > 45) errors.push(`BUG: solved map didn't spring back after pan (offset ${off.toFixed(0)})`);
}

// Scramble by shaking, then assemble by hand (exercises real drag + snap).
await shakeScramble();
await shot('regions-jumbled');
await checkSolve('when scrambled', true);

// Connection glow: drop one region in place, bring an adjacent one close and
// hold — only the shared edge should light up on both.
await pressDragTo('San Fernando Valley', 0, 0, true);
await pressDragTo('Central LA', 135, 135, false); // held within the glow range
await page.waitForTimeout(120);
if (!(await anyGlow())) errors.push('BUG: no connection glow as a piece nears its target');
await shot('connection-glow');
await page.mouse.up();

// Now pull it in to snap, and grab a quick frame of the snap-spark burst.
await pressDragTo('Central LA', 22, 22, true); // within snap → snaps + sparks
await page.waitForTimeout(60);
await page.screenshot({ path: `${OUT}/${String(++step).padStart(2, '0')}-snap-spark.png` });
console.log('shot snap-spark');

await solveBoard(() => shot('regions-midway'));
{
  const left = (await readPieces()).filter((p) => !p.placed);
  if (left.length) console.log('UNPLACED after solve:', JSON.stringify(left));
}
await shot('regions-solved');
await checkSolve('back when solved', false);

// Pinch to zoom in (into the region under the pinch), then pinch to zoom out.
if ((await pinch(true)) <= 0) errors.push('BUG: pinch-out did not zoom in');
await shot('pinch-zoomed-in');
if ((await pinch(false)) >= 0) errors.push('BUG: pinch-in did not zoom out');

// Tap a region to zoom in (assembled boards are tap-to-zoom).
{
  const ps = await readPieces();
  const target = ps.find((p) => p.zoomable) ?? ps[0];
  const box = await page.locator('svg.jig').boundingBox();
  const u2px = box.width / 1000;
  await page.mouse.click(box.x + target.lx * u2px, box.y + target.ly * u2px);
  await page.waitForTimeout(1200); // zoom anim
  await shot('region-zoomed');
}

// On the sub-level: shake to scramble, Solve button, then verify a
// shake→Solve→tap sequence still zooms (regression guard for the phase race).
const crumbDepth = () => page.locator('.jig-crumb').count();
const depthBefore = await crumbDepth();
await shakeScramble();
await shot('region-jumbled');
await page.locator('.jig-solve').click();
await page.waitForTimeout(800); // let the snap-together animation finish
await shot('region-solved-by-button');
{
  const ps = await readPieces();
  const target = ps.find((p) => p.zoomable);
  if (target) {
    const box = await page.locator('svg.jig').boundingBox();
    const u2px = box.width / 1000;
    await page.mouse.click(box.x + (target.lx + target.tx) * u2px, box.y + (target.ly + target.ty) * u2px);
    await page.waitForTimeout(1200);
    if ((await crumbDepth()) <= depthBefore) {
      errors.push('BUG: tap after shake→Solve did not zoom in (phase race)');
    } else {
      await shot('after-solve-zoom');
      await page.locator('.jig-up').click(); // step back to the sub-level
      await page.waitForTimeout(1100);
    }
  }
}

// Zoom back out via the "up" control.
await page.locator('.jig-up').click();
await page.waitForTimeout(1100);
await shot('zoomed-back-out');

// Dive to a leaf level and open a neighborhood info card (boards load already
// assembled, so we can tap straight down without solving).
const tapPiece = async (filter) => {
  const ps = await readPieces();
  const t = ps.find(filter) ?? ps[0];
  // Grab a point provably inside the piece (its centroid can fall in a concavity).
  const g = await grabPoint(t.name);
  await page.mouse.click(g.sx, g.sy);
  await page.waitForTimeout(1100);
  return t;
};
await tapPiece((p) => p.name === 'Central LA' && p.zoomable); // region with groups
await tapPiece((p) => p.zoomable); // into a group → leaf level
await shot('leaf-level');
await tapPiece((p) => !p.zoomable); // tap a neighborhood → card
await page.waitForTimeout(400);
if (!(await page.locator('.card').count())) {
  errors.push('BUG: tapping a leaf neighborhood did not open the info card');
}
await shot('neighborhood-card');
await page.locator('.card-close').click();
await page.waitForTimeout(300);

await browser.close();

if (errors.length) {
  console.log('\nCONSOLE ERRORS:');
  for (const e of errors) console.log(' -', e);
  process.exit(1);
}
console.log(`\nOK — ${step} screenshots in ${OUT}/`);
