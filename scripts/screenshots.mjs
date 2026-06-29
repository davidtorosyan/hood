// Drives Hood's zoomable Jigsaw at a phone viewport and saves labeled
// screenshots to .ui-review/, failing on any console error. The eye for the
// ui-review skill: home → assemble the region map → zoom into a region →
// assemble that level → zoom out.
//
// Usage: node scripts/screenshots.mjs [url]
import { chromium, devices } from 'playwright';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';

const URL = process.argv[2] ?? process.env.HOOD_URL ?? 'http://localhost:5173/hood/';
const OUT = '.ui-review';

// A held piece floats this many board user-units above the finger (the drag
// "paddle"), so to land a piece's grab point we aim the pointer that far BELOW
// the target. Must match PADDLE_LIFT in src/jigsaw/board.js.
const PADDLE_LIFT = 300;

// Region adjacency, used to drive the glow/snap demo against the seed (the only
// magnet) and to test that two loose pieces refuse to merge with each other.
const hierarchy = JSON.parse(readFileSync('src/data/hierarchy.json', 'utf8'));
const adjacency = JSON.parse(readFileSync('src/data/puzzle-adjacency.json', 'utf8'));
const regions = hierarchy.nodes.la.children;
const radj = (r) => (adjacency[r] || []).filter((x) => regions.includes(x));
const adjPairs = [];
for (const x of regions) for (const y of radj(x)) if (x < y) adjPairs.push([x, y]);
const seedName = () => page.evaluate(() => document.querySelector('.jig-piece.seed')?.dataset.name);

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
      cluster: g.dataset.cluster,
      csize: +(g.dataset.csize || 1),
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

// Drag every loose piece onto the growing assembly. The map assembles at the
// seed's offset (a scramble leaves one placed seed raised above centre), so we
// aim each piece at the ANCHOR translate — the placed cluster's position — not at
// (0,0). Account for the paddle lift on Y. A connection also requires adjacency,
// so repeat in passes until everything locks (the adjacency graph is connected).
async function solveBoard(onMidway) {
  const svg = page.locator('svg.jig');
  const box = await svg.boundingBox();
  const u2px = box.width / 1000;
  let didMid = false;
  const solved = (ps) => ps.every((p) => p.csize === ps.length); // one cluster
  for (let pass = 0; pass < 12; pass++) {
    const ps = await readPieces();
    if (solved(ps)) break;
    // Anchor = the biggest placed cluster (the growing assembly, which sits at the
    // seed's offset). Drag everything NOT already in it onto it — including any
    // pieces that snapped to a stray neighbour, so they get another chance.
    const placed = ps.filter((p) => p.placed);
    const anchor = placed.length ? placed.reduce((a, b) => (b.csize > a.csize ? b : a)) : null;
    for (const p of ps) {
      if (anchor && p.cluster === anchor.cluster) continue; // already in the main cluster
      const grab = await grabPoint(p.name);
      if (!grab) continue;
      const aTx = anchor ? anchor.tx : 0;
      const aTy = anchor ? anchor.ty : 0;
      const toX = grab.sx + (aTx - p.tx) * u2px; // align with the assembly
      const toY = grab.sy + (aTy - p.ty + PADDLE_LIFT) * u2px; // + paddle lift
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
  const toY = g.sy + (ty - p.ty + PADDLE_LIFT) * u2px; // aim below: the piece floats up
  await page.mouse.move(g.sx, g.sy);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 20 });
  await page.mouse.move(toX, toY);
  if (release) await page.mouse.up();
}

// Scramble a solved map via the Scramble button (the discoverable, primary path).
async function shakeScramble() {
  await page.locator('.jig-scramble').click();
  await page.waitForTimeout(900); // explode → play
}

// The bonus gesture: grab the solved map and shake it (vertically, to prove any
// direction works). Returns whether it scrambled.
async function dragShake() {
  const box = await page.locator('svg.jig').boundingBox();
  const u2px = box.width / 1000;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 8; i++) await page.mouse.move(cx, cy + (i % 2 ? 230 : -230) * u2px);
  await page.mouse.up();
  await page.waitForTimeout(900);
  return (await readPieces()).some((p) => p.csize === 1); // some piece came loose
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

// Verify the one action button's label and whether the "tap to zoom/info" hint
// is showing (it only appears after the player has solved a board).
const checkState = async (where, wantLabel, wantZoomHint) => {
  const label = await page.locator('.jig-action').textContent();
  if (!label.includes(wantLabel)) errors.push(`BUG: action button is "${label}" ${where} (want ${wantLabel})`);
  const hint = (await page.locator('.jig-hint').textContent()) || '';
  const hasZoomHint = /zoom|card/.test(hint);
  if (hasZoomHint !== wantZoomHint) errors.push(`BUG: zoom hint ${hasZoomHint ? 'shown' : 'missing'} ${where} (want ${wantZoomHint})`);
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
await checkState('on a fresh assembled board', 'Scramble', false); // no zoom hint yet

// Bonus gesture: grabbing the map and shaking it should also scramble.
if (!(await dragShake())) errors.push('BUG: drag-shake gesture did not scramble');
await page.locator('.jig-action').click(); // now reads "Solve" → re-solve
await page.waitForTimeout(800);
await checkState('after solving by button', 'Scramble', true); // now the hint appears

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
await checkState('while assembling', 'Solve', false);

// Connection glow: bring a loose region up to the SEED (the only magnet) and hold
// just outside snap range — only the shared edge should light up on both.
const seed = await seedName();
const seedNbr = radj(seed)[0];
if (!seedNbr) throw new Error(`seed ${seed} has no region neighbour on the board`);
const seedP = (await readPieces()).find((p) => p.name === seed);
await pressDragTo(seedNbr, seedP.tx + 120, seedP.ty + 120, false); // near the seed, in glow range, held
await page.waitForTimeout(120);
if (!(await anyGlow())) errors.push('BUG: no connection glow as a piece nears the resolved section');
await shot('connection-glow');
await page.mouse.up();

// Pull it the last bit in to snap onto the seed, and grab a frame of the burst.
await pressDragTo(seedNbr, seedP.tx + 22, seedP.ty + 22, true); // within snap → snaps + sparks
await page.waitForTimeout(60);
await page.screenshot({ path: `${OUT}/${String(++step).padStart(2, '0')}-snap-spark.png` });
console.log('shot snap-spark');

await solveBoard(() => shot('regions-midway'));
{
  const ps = await readPieces();
  const left = ps.filter((p) => p.csize !== ps.length);
  if (left.length) console.log('UNPLACED after solve:', JSON.stringify(left.map((p) => p.name)));
}
await shot('regions-solved');
await checkState('after solving by hand', 'Scramble', true);

// Loose pieces must NOT merge with each other — only with the resolved section.
// Park two adjacent regions (neither the seed) together, well clear of the seed,
// and confirm they stay separate singletons.
await shakeScramble();
const seed2 = await seedName();
const loosePair = adjPairs.find(([x, y]) => x !== seed2 && y !== seed2);
if (loosePair) {
  await pressDragTo(loosePair[0], -220, 180, true); // park one away from the seed
  const l0 = (await readPieces()).find((p) => p.name === loosePair[0]);
  await pressDragTo(loosePair[1], l0.tx, l0.ty, true); // try to stack its neighbour onto it
  await shot('loose-no-merge');
  const after = await readPieces();
  const A = after.find((p) => p.name === loosePair[0]);
  const B = after.find((p) => p.name === loosePair[1]);
  if (A.csize > 1 || B.csize > 1) {
    errors.push('BUG: two loose pieces merged with each other (only the resolved section is a magnet)');
  }
}
// Back to a clean solved board for the rest of the flow.
await page.locator('.jig-action').click(); // "Solve"
await page.waitForTimeout(800);

// Pinch to zoom in (into the region under the pinch), then pinch to zoom out.
if ((await pinch(true)) <= 0) errors.push('BUG: pinch-out did not zoom in');
await shot('pinch-zoomed-in');
if ((await pinch(false)) >= 0) errors.push('BUG: pinch-in did not zoom out');

// Tap a region to zoom in (assembled boards are tap-to-zoom).
{
  const target = (await readPieces()).find((p) => p.zoomable) ?? (await readPieces())[0];
  const g = await grabPoint(target.name); // a point provably inside (concave-safe)
  await page.mouse.click(g.sx, g.sy);
  await page.waitForTimeout(1200); // zoom anim
  await shot('region-zoomed');
}

// On the sub-level: shake to scramble, Solve button, then verify a
// shake→Solve→tap sequence still zooms (regression guard for the phase race).
const crumbDepth = () => page.locator('.jig-crumb').count();
const depthBefore = await crumbDepth();
await shakeScramble();
await shot('region-jumbled');
await page.locator('.jig-action').click();
await page.waitForTimeout(800); // let the snap-together animation finish
await shot('region-solved-by-button');
{
  const ps = await readPieces();
  const target = ps.find((p) => p.zoomable);
  if (target) {
    const g = await grabPoint(target.name);
    await page.mouse.click(g.sx, g.sy);
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

// Search: type a place, pick it from autocomplete, land in its region.
await page.locator('.search-btn').click();
await page.waitForTimeout(250);
await page.locator('.search-input').fill('Pasadena');
await page.waitForTimeout(250);
if ((await page.locator('.search-item').count()) === 0) {
  errors.push('BUG: search gave no autocomplete results for "Pasadena"');
}
await shot('search-autocomplete');
await page.locator('.search-item').first().click();
// The fly zooms OUT to the common ancestor then back IN level by level, so it can
// take a few seconds from a deep start — poll until it lands on the board that
// actually shows Pasadena (the smallest grouping that contains it).
const pieceNames = () =>
  page.evaluate(() => [...document.querySelectorAll('.jig-piece')].map((g) => g.dataset.name));
let landed = false;
for (let i = 0; i < 44; i++) {
  await page.waitForTimeout(250);
  if ((await pieceNames()).includes('Pasadena')) { landed = true; break; }
}
if (!landed) errors.push('BUG: search for Pasadena never landed on a board showing Pasadena');
{
  const crumbs = await page.locator('.jig-crumb').allTextContents();
  if (!crumbs.some((c) => /San Gabriel Valley/.test(c))) {
    errors.push(`BUG: search for Pasadena did not land under San Gabriel Valley (crumbs: ${crumbs.join(' › ')})`);
  }
}
await shot('search-landed');

// Back to the full county via the breadcrumb, and confirm the top level shows its
// 7 regions assembled.
await page.locator('.jig-crumb').first().click(); // breadcrumb → LA County
await page.waitForTimeout(900);
{
  const n = await page.locator('.jig-piece').count();
  if (n !== 7) errors.push(`BUG: county level shows ${n} pieces (want 7)`);
}
await shot('county-top');

await browser.close();

if (errors.length) {
  console.log('\nCONSOLE ERRORS:');
  for (const e of errors) console.log(' -', e);
  process.exit(1);
}
console.log(`\nOK — ${step} screenshots in ${OUT}/`);
