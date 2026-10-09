// Freeways (prototype): "Drive from Echo Park to Downey." The tray gives you
// the route as directions — 101 → 5 — on identical sign tiles (no decoys).
// Pick one up and it unfolds into the real shape of that stretch of freeway,
// at map scale, its sign riding on it: lay it where it really runs. Near its
// spot it's pulled in (magnetism) and clicks into place; the road lights up
// and the car drives on as soon as the legs from the start are in.
//
// Early drives draw the whole freeway network as grey roads to line shapes
// up against; later ones don't, so you place each freeway from where the
// places are. A miss says which way to move it ("further west"), then names
// the places it runs through, then outlines exactly where it goes. Show me
// lays one leg for you. Every deferred effect goes through a Scheduler, so
// leaving cancels it all.
import { el, svgEl, clear } from '../ui/dom.js';
import { labelOf, shapeOf } from '../jigsaw/tree.js';
import { Scheduler } from '../jigsaw/scheduler.js';
import { store } from '../store.js';
import { countEvent } from '../telemetry.js';
import {
  REFS, PUZZLES, idOf, lineOf, say, nextIndex, tierOf, nextLeg, drivable, placeHint, pull, fit, compass, nearestOnLine,
} from './puzzles.js';
import { drawMap, pathD } from './map.js';
import { makePieces, moveShape, shield, along } from './pieces.js';

const book = store.freeways;
const W = 1000;
const MAGNET = 170; // board units: within this of its spot a held shape is pulled in
// A drop counts when the shape lies along its road: mean distance from it
// under this (~32px on a phone). The glow uses the same test, so a glow
// always means "let go here and it clicks in".
const ACCEPT = 75;
const IDLE_MS = 12000;
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let live = null;
export function unmountFreeways() {
  live?.dispose();
  live = null;
}

// onBack: home.
export function renderFreeways(app, { onBack }) {
  unmountFreeways();
  const sched = new Scheduler();
  let run = null; // { index, placed: Set<leg>, misses: {leg: n}, driven, done, shownLegs }

  const start = (index) => {
    run = { index, placed: new Set(), misses: {}, driven: 0, done: false, shownLegs: 0 };
    book.set('at', index);
    countEvent('freeway-start');
    mount();
  };

  function mount() {
    sched.cancelAll();
    const p = PUZZLES[run.index];
    const legs = p.blocks.length;
    const tier = tierOf(run.index);
    const from = labelOf(p.from);
    const to = labelOf(p.to);
    const solvedN = () => PUZZLES.filter((q) => book.isSolved(idOf(q))).length;

    const msg = el('div', { class: 'fw-msg', role: 'status', 'aria-live': 'polite' }, '');
    const footer = el('div', { class: 'fw-foot' });
    const svgWrap = el('div', { class: 'fw-board' });
    const countEl = el('span', { class: 'fw-count' }, `${solvedN()} / ${PUZZLES.length} drives`);
    const subEl = el('div', { class: 'fw-ask-sub' }, tier === 'roads'
      ? 'Pick up each freeway to see its shape, then lay it on its road.'
      : 'No roads drawn now — lay each freeway where it runs.');
    clear(app);
    app.append(
      el('div', { class: 'screen fw-screen' }, [
        el('div', { class: 'topbar' }, [
          el('button', { class: 'icon-btn', onClick: onBack, 'aria-label': 'Home' }, '⌂'),
          el('span', { class: 'topbar-title' }, 'Freeways'),
          countEl,
        ]),
        el('div', { class: 'fw-ask' }, [
          el('div', { class: 'fw-ask-line' }, ['Drive from ', el('b', { class: 'fw-from' }, from), ' to ', el('b', { class: 'fw-to' }, to)]),
          subEl,
        ]),
        svgWrap,
        msg,
        footer,
      ]),
    );

    // Board: the map, and a slim tray holding one row of signs.
    const box = svgWrap.getBoundingClientRect();
    const H = Math.round(W * Math.max(0.9, Math.min(2.2, box.height / Math.max(1, box.width))));
    const trayH = 190;
    const MH = H - trayH - 16;
    const TRAY = [16, MH + 12, W - 16, H - 4];

    const svg = svgEl('svg', { class: 'fw-svg', viewBox: `0 0 ${W} ${H}`, role: 'application', 'aria-label': `Map: drive from ${from} to ${to}` });
    const learned = book.get('learned') || [];
    const { P, slots, labels, known } = drawMap(svg, p, W, MH, learned, p.blocks.map((b) => b.ref), { roads: tier === 'roads' });
    const placedLayer = svgEl('g', { 'clip-path': 'url(#fw-clip)' });
    const carLayer = svgEl('g');
    const hintLayer = svgEl('g', { class: 'fw-hints' });
    const trayHead = svgEl('text', { x: TRAY[0] + 26, y: TRAY[1] + 40, class: 'fw-tray-label' });
    const tileLayer = svgEl('g');
    const dragLayer = svgEl('g'); // the shape being carried, above everything
    svg.append(
      placedLayer,
      known,
      carLayer,
      labels,
      hintLayer,
      svgEl('rect', { x: TRAY[0], y: TRAY[1], width: TRAY[2] - TRAY[0], height: TRAY[3] - TRAY[1], rx: 26, class: 'fw-tray' }),
      trayHead,
      tileLayer,
      dragLayer,
    );

    const legPts = (leg) => lineOf(p.blocks[leg]).map(P);
    const pieces = makePieces(p.blocks.map((b, leg) => ({ ...b, pts: legPts(leg) })), tileLayer, dragLayer, TRAY);
    for (const x of pieces) {
      // ~24 points along the shape, for judging how well it lies on its road.
      const n = Math.max(2, Math.min(24, x.pts.length * 3));
      x.sample = Array.from({ length: n }, (_, i) => along(x.pts, i / (n - 1)));
      x.tile.dataset.goal = x.center.map((v) => v.toFixed(1)).join(','); // (harness only)
      if (run.placed.has(x.leg)) layDown(x, false);
      else x.shape.style.display = 'none';
    }
    svgWrap.append(svg);

    // --- the car ---
    const car = svgEl('g', { class: 'fw-car' });
    car.append(svgEl('circle', { r: 20 }), Object.assign(svgEl('text', { y: 8, 'text-anchor': 'middle' }), { textContent: '🚗' }));
    carLayer.append(car);
    const parkAt = ([x, y]) => car.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
    run.driven = Math.min(run.driven, drivable(run.placed, legs));
    parkAt(run.driven ? legPts(run.driven - 1).at(-1) : legPts(0)[0]);

    // A shape laid in place: it joins the map as a lit-up road.
    function layDown(x, animate) {
      x.tile.classList.add('used');
      x.shape.style.display = '';
      x.shape.classList.add('placed');
      x.shape.classList.remove('near', 'held');
      placedLayer.append(x.shape);
      moveShape(x, 0, 0, animate ? 180 : 0);
    }

    const say1 = (text, tone = '') => {
      msg.textContent = text;
      msg.className = `fw-msg ${tone}`;
    };
    const routeLine = () => `${p.blocks.map((b) => b.ref).join(' → ')} · about ${Math.round(p.km * 0.621)} mi`;
    const madeIt = () =>
      run.shownLegs >= legs
        ? `Here’s the whole route: ${routeLine()}. Try the next one!`
        : `🎉 You made it${run.shownLegs ? ' (with a peek)' : ''}! ${routeLine()}`;
    const refreshHead = () => {
      trayHead.textContent = run.done ? 'YOUR ROUTE' : `YOUR ROUTE · ${run.placed.size} OF ${legs} LAID`;
    };
    refreshHead();
    const renderFooter = () => {
      clear(footer);
      if (run.done) {
        footer.append(el('button', { class: 'btn fw-next', onClick: () => start(nextIndex(book.isSolved, run.index)) }, 'Next drive ▶'));
      } else if (run.placed.size < legs) {
        footer.append(
          el('button', { class: 'btn btn-quiet', onClick: () => start(nextIndex(book.isSolved, run.index)) }, 'Skip'),
          el('button', { class: 'btn btn-quiet', onClick: showOne }, 'Show me'),
        );
      }
    };
    // First drive with the roads hidden: say what changed.
    const lastTier = book.get('tier');
    const news = !run.done && !run.placed.size && lastTier && lastTier !== tier && tier === 'blind' ? 'New: no roads drawn now. ' : '';
    if (!run.done) book.set('tier', tier);
    if (run.done) {
      subEl.hidden = true;
      say1(madeIt(), run.shownLegs >= legs ? '' : 'good');
    } else if (run.placed.size) say1(`Keep going — ${legs - run.placed.size} to lay.`);
    else say1(`${news}Start with ${say(p.blocks[0].ref)}: it leaves ${from} from the 🚗.`);
    renderFooter();

    // Name places on the map (for hints), along the freeway they're about.
    const labelPlaces = (ids, alongPts) => {
      hintLayer.replaceChildren();
      // Keep the map's own labels; place the hint tags clear of them.
      const used = [];
      const boxes = [...labels.querySelectorAll('.fw-landmark, .fw-end rect')].map((n) => n.getBBox());
      const onLabel = (x, y, w) => boxes.some((b) => x + w / 2 > b.x && x - w / 2 < b.x + b.width && y + 19 > b.y && y - 19 < b.y + b.height);
      for (const id of ids) {
        const r = shapeOf(id).map(P);
        const cc = r.reduce((a, q) => [a[0] + q[0] / r.length, a[1] + q[1] / r.length], [0, 0]);
        const c0 = nearestOnLine(cc, alongPts).point;
        const name = labelOf(id);
        const w = name.length * 15 + 26;
        const spots = [[0, -40], [0, 40], [w / 2 + 24, 0], [-w / 2 - 24, 0], [0, -84], [0, 84]].map(([dx, dy]) => [c0[0] + dx, c0[1] + dy]);
        const cost = ([x, y]) =>
          alongPts.filter(([qx, qy]) => Math.abs(qx - x) < w / 2 && Math.abs(qy - y) < 22).length * 3 +
          used.filter(([ux, uy]) => Math.abs(ux - x) < 200 && Math.abs(uy - y) < 42).length * 100 +
          (onLabel(x, y, w) ? 60 : 0) +
          (x - w / 2 < 4 || x + w / 2 > W - 4 || y < 24 || y > MH - 24 ? 100 : 0);
        const c = spots.reduce((b, sp) => (cost(sp) < cost(b) ? sp : b));
        used.push(c);
        const g = svgEl('g', { class: 'fw-hintlabel' });
        g.append(
          svgEl('rect', { x: c[0] - w / 2, y: c[1] - 19, width: w, height: 38, rx: 19 }),
          Object.assign(svgEl('text', { x: c[0], y: c[1] + 8, 'text-anchor': 'middle' }), { textContent: name }),
        );
        hintLayer.append(g);
      }
    };
    const clearHints = () => {
      hintLayer.replaceChildren();
      slots.replaceChildren();
    };

    // A gentle nudge if nothing happens for a while: the next tile bounces.
    let idle = 0;
    const armIdle = () => {
      sched.cancel(idle);
      if (run.done) return;
      idle = sched.after(IDLE_MS, () => {
        const next = pieces[nextLeg(run.placed, legs)];
        next?.tile.classList.add('pulse');
        sched.after(2400, () => next?.tile.classList.remove('pulse'));
        armIdle();
      });
    };
    armIdle();

    // --- carrying a shape (pointer captured on the stable svg root) ---
    const toSvg = (e) => {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const q = pt.matrixTransform(svg.getScreenCTM().inverse());
      return [q.x, q.y];
    };
    let drag = null;
    svg.addEventListener('pointerdown', (e) => {
      if (run.done || drag) return;
      const tile = e.target.closest?.('.fw-tile');
      const x = tile && pieces.find((q) => q.tile === tile);
      if (!x || run.placed.has(x.leg)) return;
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      armIdle();
      clearHints();
      const lift = e.pointerType === 'touch' ? 80 : 0;
      const q = toSvg(e);
      // The shape unfolds with its middle under the finger.
      const off = [-x.center[0], -x.center[1] - lift];
      drag = { x, id: e.pointerId, off, raw: [q[0] + off[0], q[1] + off[1]] };
      tile.classList.add('lifted');
      x.shape.style.display = '';
      x.shape.classList.add('held');
      for (const o of pieces) o.tile.classList.remove('pulse');
      moveShape(x, ...drag.raw);
      say1(`${say(x.ref)} · ${REFS[x.ref]?.name ?? ''} — lay it where it runs.`);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const q = toSvg(e);
      drag.raw = [q[0] + drag.off[0], q[1] + drag.off[1]];
      const [dx, dy] = pull(drag.raw[0], drag.raw[1], MAGNET);
      drag.x.shape.classList.toggle('near', fit(drag.x.sample, drag.x.pts, [dx, dy]) < ACCEPT);
      drag.shown = [dx, dy];
      moveShape(drag.x, dx, dy);
    });
    const end = (e, cancelled) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { x, raw } = drag;
      const shown = drag.shown || raw;
      const q = toSvg(e);
      drag = null;
      x.shape.classList.remove('held', 'near');
      if (!cancelled && fit(x.sample, x.pts, shown) < ACCEPT) return place(x);
      putBack(x);
      if (cancelled || q[1] > MH) return; // dropped back on the tray: no harm done
      miss(x, shown);
    };
    svg.addEventListener('pointerup', (e) => end(e, false));
    svg.addEventListener('pointercancel', (e) => end(e, true));

    function putBack(x) {
      x.shape.style.display = 'none';
      x.tile.classList.remove('lifted');
    }

    // A miss: which way to move it, then where it runs, then exactly where.
    function miss(x, [dx, dy]) {
      armIdle();
      run.misses[x.leg] = (run.misses[x.leg] || 0) + 1;
      const dir = compass([x.center[0] + dx, x.center[1] + dy], x.center);
      const close = fit(x.sample, x.pts, [dx, dy]) < 2 * ACCEPT;
      const lead = close ? `Close — ${say(x.ref)} runs a little further ${dir}.` : `Not quite — ${say(x.ref)} runs further ${dir}.`;
      const help = placeHint(run.misses[x.leg]);
      if (help === 'dir') say1(lead, 'warn');
      else if (help === 'via' && x.via?.length) {
        labelPlaces(x.via, x.pts);
        say1(`${lead} It goes through ${x.via.map(labelOf).join(' and ')}.`, 'warn');
        countEvent('freeway-hint-via');
      } else if (help === 'ghost' || help === 'via') {
        slots.replaceChildren(svgEl('path', { d: x.d, class: 'fw-slot' }));
        say1(`${lead} Here’s exactly where — the dashed line.`, 'warn');
        countEvent('freeway-hint-ghost');
      } else say1(lead, 'warn');
    }

    function place(x, shown = false) {
      run.placed.add(x.leg);
      clearHints();
      layDown(x, true);
      refreshHead();
      if (!shown) {
        const known = book.get('learned') || [];
        if (!known.includes(x.ref)) book.set('learned', [...known, x.ref]); // its sign shows on later maps
      }
      const at = p.blocks[x.leg].at ? ` (You switch onto it at ${p.blocks[x.leg].at}.)` : '';
      const name = `${say(x.ref)} — ${REFS[x.ref]?.name ?? ''}`;
      const left = legs - run.placed.size;
      if (!left) say1(`✓ ${name}.${at} That’s the whole drive — here we go!`, 'good');
      else if (shown) say1(`Here’s ${name}.${at} ${left} to go.`);
      else say1(`✓ ${name}!${at} ${left} to go.`, 'good');
      renderFooter();
      sched.after(reduceMotion() ? 0 : 300, driveOn);
    }

    // Show me: lay the next leg (in driving order) for them.
    function showOne() {
      if (run.done) return;
      const leg = nextLeg(run.placed, legs);
      if (leg >= legs) return;
      run.shownLegs++;
      countEvent('freeway-show-leg');
      place(pieces[leg], true);
    }

    // Drive the car along newly drivable legs; arrive → finish.
    let driving = false;
    function driveOn() {
      if (driving) return;
      const upto = drivable(run.placed, legs);
      if (upto <= run.driven) return;
      const pts = [];
      for (let l = run.driven; l < upto; l++) pts.push(...legPts(l));
      run.driven = upto;
      const path = svgEl('path', { d: pathD(pts), class: 'fw-drivepath' });
      svg.append(path);
      const total = path.getTotalLength();
      const at = (k) => {
        const q = path.getPointAtLength(total * k);
        parkAt([q.x, q.y]);
      };
      const arrive = () => {
        path.remove();
        driving = false;
        if (run.driven === legs) finish();
        else driveOn();
      };
      if (reduceMotion()) {
        at(1);
        return arrive();
      }
      driving = true;
      sched.animate(Math.min(2400, 600 + total * 1.1), (k) => at(k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2), arrive);
    }

    function finish() {
      if (run.done) return;
      run.done = true;
      sched.cancel(idle);
      book.markDone(idOf(p), run.shownLegs >= legs ? 'skipped' : 'solved');
      countEvent(run.shownLegs >= legs ? 'freeway-shown' : 'freeway-solved');
      countEl.textContent = `${solvedN()} / ${PUZZLES.length} drives`;
      subEl.hidden = true;
      refreshHead();
      recap();
      say1(madeIt(), run.shownLegs >= legs ? '' : 'good');
      renderFooter();
    }

    // After the drive the tray lists the route: each sign, its name, and
    // where you switch.
    function recap() {
      tileLayer.style.display = 'none';
      const g = svgEl('g', { class: 'fw-recap' });
      const rowH = Math.min(52, (TRAY[3] - TRAY[1] - 60) / legs);
      p.blocks.forEach((b, k) => {
        const y = TRAY[1] + 62 + rowH * k + rowH / 2 - 8;
        g.append(shield(b.ref, [TRAY[0] + 60, y], 0.8));
        const label = `${REFS[b.ref]?.name ?? ''}${b.at ? ` · switch at ${b.at}` : ''}`;
        g.append(Object.assign(svgEl('text', { x: TRAY[0] + 100, y: y + 8, class: 'fw-recap-name' }), { textContent: label }));
      });
      svg.append(g);
    }
    if (run.done) recap();
  }

  const onResize = () => sched.after(150, () => run && mount());
  window.addEventListener('resize', onResize);
  live = {
    dispose() {
      sched.dispose();
      window.removeEventListener('resize', onResize);
    },
  };

  const saved = book.get('at');
  start(Number.isInteger(saved) && PUZZLES[saved] ? saved : nextIndex(book.isSolved));
}
