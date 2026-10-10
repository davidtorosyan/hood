// Drives Hood at a phone viewport and saves labeled screenshots to .ui-review/,
// failing on any console error or failed assertion. The eye for the ui-review
// skill. The flow: home → the county puzzle starts itself → a wrong grab →
// glow → missed drops escalate hints → place every asked-for piece → solved →
// zoom into a region (it starts itself) → solve it → zoom out (✓) → dive with
// Solve → a place card → search fly-through → reload mid-puzzle (restores) →
// home with Continue → Rebuild LA (overworld → build → back → frontier) → a
// landscape desktop pass.
//
// Usage: node scripts/screenshots.mjs [url]
// Set CHROMIUM_PATH to use a specific Chromium binary (e.g. when the installed
// Playwright's own browser build isn't available).
import { chromium, devices } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';

const URL = process.argv[2] ?? process.env.HOOD_URL ?? 'http://localhost:5173/hood/';
const OUT = '.ui-review';
// A held piece floats this far (board user units) above the finger on touch
// devices. Must match PADDLE_LIFT in src/jigsaw/board.js.
const PADDLE_LIFT = 300;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);

const errors = [];
const fail = (msg) => {
  errors.push(msg);
  console.log(`FAIL: ${msg}`);
};
let step = 0;
let page;

async function newPage(contextOpts) {
  const context = await browser.newContext(contextOpts);
  const p = await context.newPage();
  p.on('console', (m) => {
    // The analytics beacon is blocked in sandboxes; that's not an app error.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  p.on('pageerror', (e) => errors.push(String(e)));
  return p;
}

const shot = async (label) => {
  await page.waitForTimeout(300);
  const name = `${String(++step).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path: `${OUT}/${name}` });
  console.log(`shot ${name}`);
};

const readPieces = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.jig-piece')].map((g) => ({
      name: g.dataset.name,
      tx: +(g.dataset.tx || 0),
      ty: +(g.dataset.ty || 0),
      placed: g.classList.contains('placed'),
      zoomable: g.classList.contains('zoomable'),
    })),
  );
const promptName = () =>
  page.evaluate(() => {
    const p = document.querySelector('.jig-prompt');
    const asking = p && p.style.display !== 'none' && !p.classList.contains('celebrate');
    return asking ? p.querySelector('.jig-prompt-name').textContent : null;
  });
const promptSub = () => page.evaluate(() => document.querySelector('.jig-prompt-sub')?.textContent || '');
const phaseIsPlay = async () => (await promptName()) != null;
const waitForPrompt = async () => {
  for (let i = 0; i < 40 && !(await phaseIsPlay()); i++) await page.waitForTimeout(100);
  if (!(await phaseIsPlay())) fail('puzzle never started (no prompt)');
};

// A screen point provably inside a piece's fill (centroids can sit in a
// concavity), after raising it above its siblings.
const grabPoint = (name) =>
  page.evaluate((nm) => {
    const g = [...document.querySelectorAll('.jig-piece')].find((el) => el.dataset.name === nm);
    if (!g) return null;
    const path = g.querySelector('.jig-shape');
    const svg = g.ownerSVGElement;
    const bb = path.getBBox();
    const tx = parseFloat(g.dataset.tx) || 0;
    const ty = parseFloat(g.dataset.ty) || 0;
    const pt = svg.createSVGPoint();
    for (let iy = 1; iy < 10; iy++) {
      for (let ix = 1; ix < 10; ix++) {
        pt.x = bb.x + (bb.width * ix) / 10;
        pt.y = bb.y + (bb.height * iy) / 10;
        if (!path.isPointInFill(pt)) continue;
        const u = svg.createSVGPoint();
        u.x = pt.x + tx;
        u.y = pt.y + ty;
        const s = u.matrixTransform(svg.getScreenCTM());
        // Make sure nothing else is on top at that spot.
        const hit = document.elementFromPoint(s.x, s.y)?.closest('.jig-piece');
        if (hit === g) return { sx: s.x, sy: s.y };
      }
    }
    return null;
  }, name);

async function u2px() {
  const box = await page.locator('svg.jig').boundingBox();
  const vb = await page.evaluate(() => document.querySelector('svg.jig').viewBox.baseVal.width);
  return box.width / vb;
}

// Drag piece `name` so its translate ends at (tx, ty). `lift` = paddle lift.
async function dragTo(name, tx, ty, { release = true, lift = PADDLE_LIFT } = {}) {
  const p = (await readPieces()).find((q) => q.name === name);
  const grab = await grabPoint(name);
  if (!grab) return fail(`no grab point for ${name}`);
  const k = await u2px();
  const toX = grab.sx + (tx - p.tx) * k;
  const toY = grab.sy + (ty - p.ty + lift) * k;
  await page.mouse.move(grab.sx, grab.sy);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 14 });
  if (release) {
    await page.mouse.up();
    await page.waitForTimeout(60);
  }
}

// Place every asked-for piece, reading the prompt each time.
async function solveByName({ onMidway, lift } = {}) {
  for (let guard = 0; guard < 12; guard++) {
    const name = await promptName();
    if (!name) return;
    await dragTo(name, 0, 0, { lift });
    await page.waitForTimeout(420); // snap + next ask
    const placed = (await readPieces()).find((q) => q.name === name)?.placed;
    if (!placed) return fail(`${name} didn't snap when dropped on its spot`);
    if (guard === 1 && onMidway) await onMidway();
  }
}

async function tapPiece(name) {
  const g = await grabPoint(name);
  if (!g) return fail(`no tap point for ${name}`);
  await page.mouse.click(g.sx, g.sy);
}

// ---------------------------------------------------------------------------
page = await newPage({ ...devices['iPhone 13'] });
await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await shot('home-first-visit');

await page.locator('.home-play-2').click();
await page.waitForTimeout(250);
await shot('county-intro-assembled');
await waitForPrompt();
await page.waitForTimeout(400);
await shot('county-play-first-ask');

// A wrong grab: wiggle + "That's X — find Y".
{
  const target = await promptName();
  const other = (await readPieces()).find((p) => !p.placed && p.name !== target);
  const g = await grabPoint(other.name);
  await page.mouse.move(g.sx, g.sy);
  await page.mouse.down();
  await page.mouse.up();
  const sub = await promptSub();
  if (!sub.includes(other.name)) fail(`wrong grab didn't name the piece (sub: "${sub}")`);
  await shot('wrong-piece-named');
}

// Glow: hold the target near its spot.
{
  const target = await promptName();
  await dragTo(target, 30, 40, { release: false });
  await shot('connection-glow');
  await page.mouse.up();
  await page.waitForTimeout(400);
  if (!(await readPieces()).find((q) => q.name === target).placed) fail('near drop did not snap');
  if (!(await page.locator('.trophy-toast').count())) fail('no "First Piece" trophy toast');
  await shot('trophy-toast');
  // The whole first-ever run keeps the bold tutorial prompt…
  if (await page.locator('.jig-prompt.quiet').count()) fail('prompt went quiet during the tutorial run');
}

// Missed drops escalate: 2 misses → neighbour hint, 3 → ghost outline.
{
  const target = await promptName();
  for (let i = 0; i < 3; i++) {
    await dragTo(target, 0, -900); // way off, up into nowhere
    await page.waitForTimeout(350);
    if (i === 1) {
      if (!(await promptSub()).startsWith('Hint')) fail('no neighbour hint after 2 misses');
      await shot('hint-neighbor');
    }
  }
  if (!(await page.locator('.jig-ghost').count())) fail('no ghost outline after 3 misses');
  await shot('hint-ghost');
}

await solveByName({ onMidway: () => shot('county-midway') });
await page.waitForTimeout(500);
await shot('county-solved');

// Zoom into a region: past the tutorial it opens assembled, to explore — no
// auto-scramble — and the primary ▶ Play starts it.
const regionName = (await readPieces()).find((p) => p.zoomable)?.name;
await tapPiece(regionName);
await page.waitForTimeout(1600);
if (await phaseIsPlay()) fail('a level auto-started after the tutorial');
await shot('region-arrived-to-explore');
await page.getByRole('button', { name: /Play this puzzle/ }).click();
await waitForPrompt();
await page.waitForTimeout(300);
await shot('region-play');
// …and every run after it gets the quiet one.
if (!(await page.locator('.jig-prompt.quiet').count())) fail('prompt not quiet after the tutorial run');

// Zoom out mid-puzzle: the county shows the region as in progress; going back in
// resumes the same ask.
{
  const ask = await promptName();
  await page.getByRole('button', { name: /Zoom out/ }).click();
  await page.waitForTimeout(1200);
  if (!(await page.locator('.jig-chip.wip').count())) fail('no "in progress" chip after zooming out mid-puzzle');
  await shot('zoomed-out-mid-puzzle');
  await tapPiece(regionName);
  await page.waitForTimeout(900);
  if ((await promptName()) !== ask) fail(`zooming back in lost the ask (${ask})`);
}
if (!(await page.locator('.jig-ctx').count())) fail('no surrounding-area context when zoomed in');
await solveByName();
await page.waitForTimeout(600);
await shot('region-solved');

// Zoom out: the county shows the region ✓.
await page.getByRole('button', { name: /Zoom out/ }).click();
await page.waitForTimeout(1300);
await shot('county-with-check');
if (!(await page.locator('.jig-check').count())) fail('no ✓ on the solved region');

// Dive down to a level of places (exploring — nothing auto-starts), then open a
// place's card. Some regions nest one level deeper than others.
await tapPiece(regionName);
await page.waitForTimeout(800);
for (let depth = 0; depth < 4; depth++) {
  const pieces = await readPieces();
  const leaf = pieces.find((p) => !p.zoomable && p.placed);
  if (leaf && !(await phaseIsPlay())) {
    await shot('leaf-level-explore');
    await tapPiece(leaf.name);
    await page.waitForTimeout(400);
    await shot('place-card');
    if (!(await page.locator('.card').count())) fail('tapping a leaf did not open its card');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    break;
  }
  const group = pieces.find((p) => p.zoomable)?.name;
  if (!group) break;
  await tapPiece(group);
  await page.waitForTimeout(1200);
}

// Search fly-through.
await page.getByRole('button', { name: 'Search' }).click();
await page.keyboard.type('Pasadena');
await page.waitForTimeout(200);
await shot('search-autocomplete');
await page.keyboard.press('Enter');
await page.waitForTimeout(5200);
await shot('search-landed');

// Reload mid-puzzle: the puzzle (and its ask) comes back, and a missed drop
// after the restore doesn't crash.
await page.getByRole('button', { name: /Play/ }).click();
await waitForPrompt();
await page.waitForTimeout(300);
{
  const before = await promptName();
  await page.reload();
  await page.waitForTimeout(800);
  const after = await promptName();
  if (before !== after) fail(`restore lost the ask (${before} → ${after})`);
  if (!(await page.getByRole('button', { name: 'Solve' }).isVisible())) fail('no Solve button after restore');
  await dragTo(after, 0, -900);
  await page.waitForTimeout(400);
  await shot('restored-after-reload');

  // Rotate to landscape mid-puzzle: the level re-lays out, every loose piece is
  // still on screen, and the same piece is still asked for.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(900);
  if ((await promptName()) !== after) fail('rotation lost the ask');
  const offscreen = await page.evaluate(() => {
    const svg = document.querySelector('svg.jig').getBoundingClientRect();
    return [...document.querySelectorAll('.jig-piece:not(.placed)')]
      .map((g) => [g.dataset.name, g.getBoundingClientRect()])
      .filter(([, r]) => r.bottom < svg.top || r.top > svg.bottom || r.right < svg.left || r.left > svg.right)
      .map(([n]) => n);
  });
  if (offscreen.length) fail(`pieces off screen after rotating: ${offscreen.join(', ')}`);
  await shot('rotated-mid-puzzle');
  await page.setViewportSize({ width: 390, height: 664 });
  await page.waitForTimeout(900);
}

// Tap a surrounding area: it flies there.
{
  const before = await page.locator('.jig-crumb.current').textContent();
  const label = page.locator('.jig-ctx-label').first();
  if (await label.count()) {
    const name = await label.textContent();
    await label.click();
    await page.waitForTimeout(4500);
    const after = await page.locator('.jig-crumb.current').textContent();
    if (after === before) fail(`tapping "${name}" didn't navigate`);
    await shot('context-tap-landed');
  } else fail('no context label to tap');
}

// Home: Continue + progress.
await page.getByRole('button', { name: 'Home' }).click();
await page.waitForTimeout(300);
await shot('home-continue');
await page.locator('.home-progress').click();
await page.waitForTimeout(300);
await shot('progress-screen');
await page.mouse.wheel(0, 900);
await page.waitForTimeout(300);
await shot('progress-trophies');

// Rebuild LA: a fresh campaign. Start choices → build one → back to the map,
// which shows it rebuilt plus the frontier around it.
page = await newPage({ ...devices['iPhone 13'] });
await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.locator('.home-play').first().click();
await page.waitForTimeout(400);
await shot('campaign-start-choices');
{
  const n = await page.locator('.ow-card').count();
  if (n !== 3) fail(`expected 3 starting choices, got ${n}`);
  if (await page.locator('.ow-built').count()) fail('fresh campaign already has built places');
}
// Keep playing the top card. Offers favour finishing a district, so a
// "Connect" (building the groups themselves into one) comes within a few.
let linked = false;
for (let round = 0; round < 9 && !linked; round++) {
  const isLink = (await page.locator('.ow-card.link').count()) > 0;
  if (isLink) await shot('campaign-connect-offered');
  const card = page.locator(isLink ? '.ow-card.link' : '.ow-card.build').first();
  const title = await card.locator('b').textContent();
  await card.click();
  await page.waitForTimeout(300);
  if (round === 0) await shot('campaign-puzzle-start');
  await waitForPrompt();
  if (isLink) await shot('campaign-connect-play');
  await solveByName();
  await page.waitForTimeout(900);
  if (round === 0) await shot('campaign-puzzle-solved');
  await page.getByRole('button', { name: /Back to the map/ }).last().click();
  await page.waitForTimeout(500);
  if (round === 0) {
    await shot('campaign-overworld-after-one');
    if (!(await page.locator('.ow-place').count())) fail(`${title}: nothing shows as built`);
    if (!(await page.locator('.ow-card').count())) fail('no offers after the first build');
  }
  if (isLink) {
    linked = true;
    await page.waitForTimeout(1500);
    await shot('campaign-after-connect');
  }
}
if (!linked) fail('no Connect offered within 9 builds');

// Tap a frontier place on the map: selects its puzzle + card.
{
  // A screen point that really hits a slot (a slot's box center can fall
  // outside a concave shape).
  const spot = await page.evaluate(() => {
    for (const slot of document.querySelectorAll('.ow-slot')) {
      const r = slot.getBoundingClientRect();
      for (let iy = 1; iy < 8; iy++) for (let ix = 1; ix < 8; ix++) {
        const x = r.x + (r.width * ix) / 8;
        const y = r.y + (r.height * iy) / 8;
        if (document.elementFromPoint(x, y) === slot) return [x, y];
      }
    }
    return null;
  });
  if (spot) {
    await page.mouse.click(...spot);
    await page.waitForTimeout(500);
    if (!(await page.locator('.ow-card.selected').count())) fail('tapping a frontier place selected nothing');
    await shot('campaign-map-tap-select');
  } else fail('no frontier on the map');
}
// Relaunch lands back on the overworld.
await page.reload();
await page.waitForTimeout(500);
if (!(await page.locator('.ow-map').count())) fail('relaunch did not return to the overworld');
await page.getByRole('button', { name: 'Home' }).click();
await page.waitForTimeout(300);
await shot('home-campaign-started');

// Freeways (prototype, v4 — abstract): two blocks on a grid; each freeway is
// an arrow (direction + length). Chain them tail-to-tip from the car.
{
  await page.locator('.home-play-3').click();
  await page.waitForTimeout(500);
  await shot('freeways-start');
  const toScreen = (x, y) =>
    page.evaluate(([x, y]) => {
      const svg = document.querySelector('.fw-svg');
      const pt = svg.createSVGPoint();
      pt.x = x;
      pt.y = y;
      const s = pt.matrixTransform(svg.getScreenCTM());
      return [s.x, s.y];
    }, [x, y]);
  const arrow = (ref) => page.locator(`.fw-arrow-piece[data-ref="${ref}"]`);
  const tailOf = async (ref) => {
    const b = await arrow(ref).locator('.fw-arrow-tail').boundingBox();
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  // Where the finger goes so the lifted arrow's tail lands on its spot (touch
  // lifts the arrow above the finger). Must match LIFT in src/freeways/game.js.
  const FW_LIFT = 240;
  const goal = async (ref) => {
    // Touch holds the arrow by its middle, so the finger goes under the middle.
    const [x, y] = (await arrow(ref).getAttribute('data-goal')).split(',').map(Number);
    const [mx, my] = (await arrow(ref).getAttribute('data-mid')).split(',').map(Number);
    return toScreen(x + mx, y + my + FW_LIFT);
  };
  const carry = async (ref, to, { hold = false } = {}) => {
    await page.mouse.move(...(await tailOf(ref)));
    await page.mouse.down();
    await page.mouse.move(...to, { steps: 12 });
    if (hold) return;
    await page.mouse.up();
    await page.waitForTimeout(450);
  };
  const refs = await page.$$eval('.fw-arrow-piece', (gs) => gs.map((g) => g.dataset.ref));
  if (refs.length < 2) fail(`freeways: odd route ${refs}`);
  // Drop one far from where it belongs: it goes back, with a nudge.
  const box = await page.locator('.fw-svg').boundingBox();
  await carry(refs[0], [box.x + 40, box.y + 40]);
  if (await page.locator('.fw-arrow-piece.laid').count()) fail('freeways: a far-off drop should not count');
  // Carry the right one to its spot (sloppily): it glows, then clicks in.
  for (const ref of refs) {
    const [gx, gy] = await goal(ref);
    if (ref === refs[0]) {
      await carry(ref, [gx + 10, gy - 8], { hold: true });
      await shot('freeways-carrying-arrow');
      await page.mouse.up();
      await page.waitForTimeout(450);
    } else await carry(ref, [gx + 10, gy - 8]);
    if (!(await arrow(ref).evaluate((g) => g.classList.contains('laid')))) fail(`freeways: ${ref} didn't click in at its spot`);
  }
  await page.waitForTimeout(1500);
  if (!/You made it/.test(await page.locator('.fw-msg').textContent())) fail('freeways: chain laid but not solved');
  await shot('freeways-morphing');
  await page.waitForTimeout(2500);
  if (!(await page.locator('.fw-real-map.showing').count())) fail('freeways: solved drive never morphed onto the map');
  await shot('freeways-solved');
  await page.getByRole('button', { name: /Next drive/ }).click();
  await page.waitForTimeout(500);
  await shot('freeways-next');
  await page.getByRole('button', { name: 'Home' }).click();
  await page.waitForTimeout(300);
  await shot('home-with-freeways');
}

// Desktop / landscape: direct drag (no paddle lift).
page = await newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.locator('.home-play-2').click();
await waitForPrompt();
await page.waitForTimeout(400);
await shot('desktop-play');
await solveByName({ lift: 0 });
await page.waitForTimeout(600);
await shot('desktop-solved');
await page.getByRole('button', { name: 'Home' }).click();
await page.waitForTimeout(300);
await page.locator('.home-play-3').click();
await page.waitForTimeout(500);
await shot('desktop-freeways');

await browser.close();

if (errors.length) {
  console.log('\nERRORS:');
  for (const e of errors) console.log(' - ' + e);
  process.exit(1);
}
console.log('\nOK');
