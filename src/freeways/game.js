// Freeways (prototype): "Drive from Echo Park to Downey." The map shows the
// two places and the freeway network as unlabeled grey roads; the car waits
// at the start. The tray holds freeway SIGNS on identical road tiles — the
// right ones plus decoys — so you choose by name, the thing to learn. You
// build the drive leg by leg ("Leg 1 of 2 · Leaving Echo Park — which
// freeway?"): drag a sign onto its road; near the road it's pulled in
// (magnetism), on it, the road lights up and the car drives that leg.
//
// Early drives dash the current leg's road (just name it); then a few dash
// only its first stretch (which way to head); later ones only park the car
// where it starts (find the road too). Freeways you learn get their signs on
// the map in later drives (unless they're on that drive's route). Misses escalate help one
// step at a time; Show me does one leg for you. Every deferred effect goes
// through a Scheduler, so leaving cancels it all.
import { el, svgEl, clear } from '../ui/dom.js';
import { labelOf, shapeOf } from '../jigsaw/tree.js';
import { Scheduler } from '../jigsaw/scheduler.js';
import { store } from '../store.js';
import { countEvent } from '../telemetry.js';
import {
  REFS, PUZZLES, NETWORK, idOf, lineOf, say, nextIndex, tierOf, nextLeg, drivable, legHint, nearestOnLine, magnet, compass,
} from './puzzles.js';
import { drawMap, pathD } from './map.js';
import { makeTiles, moveTile, goHome, shield } from './pieces.js';

const book = store.freeways;
const W = 1000;
const MAGNET = 130; // board units from the road (~55px on a phone): inside it a sign is pulled in, and a drop counts
const IDLE_MS = 10000;
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const NUM = ['No', 'One', 'Two', 'Three', 'Four'];

let live = null;
export function unmountFreeways() {
  live?.dispose();
  live = null;
}

// The point a fraction `t` of the way along a polyline (by length).
function along(pts, t) {
  const seg = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  let left = seg.reduce((a, b) => a + b, 0) * t;
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i]) {
      const k = seg[i] ? left / seg[i] : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
    }
    left -= seg[i];
  }
  return pts.at(-1);
}

// onBack: home.
export function renderFreeways(app, { onBack }) {
  unmountFreeways();
  const sched = new Scheduler();
  let run = null; // { index, placed: Set<leg>, misses: {leg: n}, driven, done, shown }

  const start = (index) => {
    run = { index, placed: new Set(), misses: {}, driven: 0, done: false, shown: false };
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
    const solvedN = PUZZLES.filter((q) => book.isSolved(idOf(q))).length;

    const msg = el('div', { class: 'fw-msg', role: 'status', 'aria-live': 'polite' }, '');
    const footer = el('div', { class: 'fw-foot' });
    const svgWrap = el('div', { class: 'fw-board' });
    let countEl = null;
    let subEl = null;
    clear(app);
    app.append(
      el('div', { class: 'screen fw-screen' }, [
        el('div', { class: 'topbar' }, [
          el('button', { class: 'icon-btn', onClick: onBack, 'aria-label': 'Home' }, '⌂'),
          el('span', { class: 'topbar-title' }, 'Freeways'),
          (countEl = el('span', { class: 'fw-count' }, `${solvedN} / ${PUZZLES.length} drives`)),
        ]),
        el('div', { class: 'fw-ask' }, [
          el('div', { class: 'fw-ask-line' }, ['Drive from ', el('b', { class: 'fw-from' }, from), ' to ', el('b', { class: 'fw-to' }, to)]),
          (subEl = el('div', { class: 'fw-ask-sub' }, {
            guided: 'Name each dashed road: drag its sign onto it.',
            bridge: 'The dash shows which way to head — drag the right sign onto that road.',
            open: 'Find each road from the 🚗 and drag its sign onto it.',
          }[tier])),
        ]),
        svgWrap,
        msg,
        footer,
      ]),
    );

    // Size the board to the space it has; the tray only needs room for tiles.
    const items = [
      ...p.blocks.map((b, leg) => ({ ...b, route: true, leg })),
      ...p.decoys.map((b) => ({ ...b, route: false, leg: -1 })),
    ];
    const rows = Math.ceil(items.length / 3);
    const box = svgWrap.getBoundingClientRect();
    const H = Math.round(W * Math.max(0.9, Math.min(2.2, box.height / Math.max(1, box.width))));
    const trayH = 70 + rows * 104;
    const MH = H - trayH - 18;
    const TRAY = [16, MH + 14, W - 16, H - 4];

    const svg = svgEl('svg', { class: 'fw-svg', viewBox: `0 0 ${W} ${H}`, role: 'application', 'aria-label': `Map: drive from ${from} to ${to}` });
    const learned = book.get('learned') || [];
    const { P, slots, labels, known } = drawMap(svg, p, W, MH, learned, items.map((x) => x.ref));
    const built = svgEl('g', { class: 'fw-builtroads', 'clip-path': 'url(#fw-clip)' });
    const carLayer = svgEl('g');
    const hintLayer = svgEl('g', { class: 'fw-hints' });
    const trayHead = svgEl('text', { x: TRAY[0] + 26, y: TRAY[1] + 40, class: 'fw-tray-label' });
    const tileLayer = svgEl('g');
    svg.append(
      built,
      known, // learned signs sit above lit-up roads
      carLayer,
      labels,
      hintLayer,
      svgEl('rect', { x: TRAY[0], y: TRAY[1], width: TRAY[2] - TRAY[0], height: TRAY[3] - TRAY[1], rx: 26, class: 'fw-tray' }),
      trayHead,
      tileLayer,
    );

    // Tiles in a stable shuffled order.
    let seed = run.index * 7919 + 13;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const order = items.map((x) => [x, rnd()]).sort((a, b) => a[1] - b[1]).map(([x]) => x);
    const tiles = makeTiles(order, tileLayer, TRAY);
    const lineFor = (t) => lineOf(t).map(P); // a route leg's road, or a decoy's own road
    const legPts = (leg) => lineOf(p.blocks[leg]).map(P);
    const tileForLeg = (leg) => tiles.find((t) => t.leg === leg);
    // Every freeway on the map, projected — so a drop is judged against the
    // road it's actually nearest, not just "near enough" to the right one.
    const net = NETWORK.map((n) => ({ ref: n.ref, pts: lineOf(n).map(P) }));
    const nearestRoad = (pos) => {
      let best = { ref: null, d: Infinity };
      for (const n of net) {
        const { d } = nearestOnLine(pos, n.pts);
        if (d < best.d) best = { ref: n.ref, d };
      }
      return best;
    };
    // Flash where a freeway really runs. Returns how to point at it: '' when
    // it's on the map, else "further north" (it's off this map).
    const flashRoad = (ref, cls = 'decoy') => {
      const all = net.filter((n) => n.ref === ref).flatMap((n) => n.pts);
      const flashes = [];
      for (const n of net) {
        if (n.ref !== ref) continue;
        const f = svgEl('path', { d: pathD(n.pts), class: `fw-preview ${cls}` });
        built.append(f);
        flashes.push(f);
      }
      // Enough of it on the map to see? (a sliver at the edge doesn't count)
      const shown = all.filter(([x, y]) => x > 30 && x < W - 30 && y > 30 && y < MH - 30);
      let span = 0;
      for (let i = 1; i < shown.length; i++) span += Math.min(80, Math.hypot(shown[i][0] - shown[i - 1][0], shown[i][1] - shown[i - 1][1]));
      if (span > 90) {
        const sign = shield(ref, shown[Math.floor(shown.length / 2)], 0.75);
        sign.classList.add('fw-flash-sign');
        hintLayer.append(sign);
        flashes.push(sign);
      }
      sched.after(2600, () => flashes.forEach((f) => f.remove()));
      if (span > 90 || !all.length) return '';
      const nearest = all.reduce((b, q) => (Math.hypot(q[0] - W / 2, q[1] - MH / 2) < Math.hypot(b[0] - W / 2, b[1] - MH / 2) ? q : b));
      return `further ${compass([W / 2, MH / 2], nearest)}, off this map`;
    };
    for (const t of tiles) {
      if (!t.route) continue; // (harness only:) a point mid-leg, and one at the leg's start
      t.g.dataset.goal = along(lineFor(t), 0.5).map((v) => v.toFixed(1)).join(',');
      t.g.dataset.start = along(lineFor(t), 0.04).map((v) => v.toFixed(1)).join(',');
      t.g.dataset.end = along(lineFor(t), 0.96).map((v) => v.toFixed(1)).join(',');
      t.g.dataset.mid = t.g.dataset.goal;
    }
    svgWrap.append(svg);

    // --- the car ---
    const car = svgEl('g', { class: 'fw-car' });
    car.append(svgEl('circle', { r: 20 }), Object.assign(svgEl('text', { y: 8, 'text-anchor': 'middle' }), { textContent: '🚗' }));
    carLayer.append(car);
    const parkAt = ([x, y]) => car.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);

    // A placed leg: its road lights up (unrolling start → end) and its sign
    // parks halfway along.
    const buildRoad = (leg, animate) => {
      const pts = legPts(leg);
      const path = svgEl('path', { d: pathD(pts), class: `fw-built ${REFS[p.blocks[leg].ref]?.kind || 'CA'}` });
      built.append(path);
      if (animate && !reduceMotion()) {
        const len = path.getTotalLength();
        path.style.strokeDasharray = `${len}`;
        path.style.strokeDashoffset = `${len}`;
        path.getBoundingClientRect();
        path.style.transition = 'stroke-dashoffset 600ms ease-out';
        path.style.strokeDashoffset = '0';
      }
      const t = tileForLeg(leg);
      t.g.classList.add('placed');
      moveTile(t, ...along(pts, 0.5), animate ? 260 : 0, 0.62);
    };
    for (const leg of run.placed) buildRoad(leg, false);
    run.driven = Math.min(run.driven, drivable(run.placed, legs));
    parkAt(run.driven ? legPts(run.driven - 1).at(-1) : legPts(0)[0]);
    for (const t of tiles) if (!t.g.classList.contains('placed')) goHome(t, 0);

    // --- the current leg: tray heading, dashed road (guided), hint labels ---
    // "Leaving Encino" / "From the 405" (where you switch is named once it's placed).
    const legName = (leg, lower = false) => {
      const [verb, rest] = leg === 0 ? ['Leaving', from] : ['From', say(p.blocks[leg - 1].ref)];
      return `${lower ? verb.toLowerCase() : verb} ${rest}`;
    };
    const current = () => nextLeg(run.placed, legs);
    let slotShown = false;
    const showSlot = (leg, force) => {
      slots.replaceChildren();
      slotShown = false;
      if (leg >= legs || run.done) return;
      if (tier === 'guided' || force) {
        slots.append(svgEl('path', { d: pathD(legPts(leg)), class: 'fw-slot' }));
        slotShown = true;
      } else if (tier === 'bridge') {
        // Just the first stretch: which way to head out.
        const pts = legPts(leg);
        let left = 110;
        const stub = [pts[0]];
        for (let i = 1; i < pts.length && left > 0; i++) {
          const d = Math.hypot(pts[i][0] - stub.at(-1)[0], pts[i][1] - stub.at(-1)[1]);
          const k = Math.min(1, left / d);
          stub.push([stub.at(-1)[0] + (pts[i][0] - stub.at(-1)[0]) * k, stub.at(-1)[1] + (pts[i][1] - stub.at(-1)[1]) * k]);
          left -= d;
        }
        slots.append(svgEl('path', { d: pathD(stub), class: 'fw-slot stub' }));
      }
    };
    const refreshLeg = () => {
      const leg = current();
      trayHead.textContent = run.done ? 'YOUR ROUTE' : leg >= legs ? 'ALL LEGS PLACED' : `LEG ${leg + 1} OF ${legs} · ${legName(leg).toUpperCase()}`;
      hintLayer.replaceChildren();
      for (const t of labels.querySelectorAll('.fw-landmark')) t.style.display = '';
      showSlot(leg, false);
    };
    refreshLeg();

    const say1 = (text, tone = '') => {
      msg.textContent = text;
      msg.className = `fw-msg ${tone}`;
    };
    const routeLine = () => `${p.blocks.map((b) => b.ref).join(' → ')} · about ${Math.round(p.km * 0.621)} mi`;
    const madeIt = () =>
      run.shown ? `Here’s the whole route: ${routeLine()}. Try the next one!` : `🎉 You made it${run.peeked ? ' (with a peek)' : ''}! ${routeLine()}`;
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
    const decoyLine = `(${NUM[p.decoys.length] ?? p.decoys.length} of the signs ${p.decoys.length === 1 ? 'is a decoy' : 'are decoys'}.)`;
    // First drive at a harder level: say what changed.
    const lastTier = book.get('tier');
    const tierNews = !run.done && !run.placed.size && lastTier && lastTier !== tier
      ? { bridge: 'New: only the start of each leg is dashed now. ', open: 'New: no more dashes — find each road from the 🚗. ' }[tier] ?? ''
      : '';
    if (!run.done) book.set('tier', tier);
    if (run.done) say1(madeIt(), run.shown ? '' : 'good');
    else if (run.placed.size) say1(`Keep going — ${legName(current(), true)}.`);
    else say1(`${tierNews}Leg 1: which freeway takes you out of ${from}? ${decoyLine}`);
    if (run.done) subEl.hidden = true;
    renderFooter();

    // Name the places a hint mentions, right on the map.
    const labelPlaces = (ids) => {
      hintLayer.replaceChildren();
      for (const t of labels.querySelectorAll('.fw-landmark')) t.style.display = 'none'; // hints replace them for now
      const used = [];
      const carAt = car.getAttribute('transform')?.match(/[-\d.]+/g)?.map(Number) || [0, 0];
      const routePts = p.blocks.flatMap((_, l) => legPts(l));
      const leg = legPts(current());
      for (const id of ids) {
        const r = shapeOf(id).map(P);
        const cc = r.reduce((a, q) => [a[0] + q[0] / r.length, a[1] + q[1] / r.length], [0, 0]);
        // Anchored where the current leg passes the place, not at its middle.
        const c0 = nearestOnLine(cc, leg).point;
        const name = labelOf(id);
        const w = name.length * 15 + 26;
        // Beside the place, wherever it covers least: the car, the route, other pills.
        const spots = [[0, -40], [0, 40], [w / 2 + 24, 0], [-w / 2 - 24, 0], [0, -84], [0, 84]].map(([dx, dy]) => [c0[0] + dx, c0[1] + dy]);
        const cost = ([x, y]) =>
          (Math.abs(x - carAt[0]) < w / 2 + 30 && Math.abs(y - carAt[1]) < 50 ? 100 : 0) +
          net.filter((n) => n.pts.some(([qx, qy]) => Math.abs(qx - x) < w / 2 && Math.abs(qy - y) < 22)).length * 6 +
          routePts.filter(([qx, qy]) => Math.abs(qx - x) < w / 2 && Math.abs(qy - y) < 22).length * 3 +
          used.filter(([ux, uy]) => Math.abs(ux - x) < 200 && Math.abs(uy - y) < 42).length * 100 +
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

    // A gentle nudge if nothing happens for a while.
    let idle = 0;
    const armIdle = () => {
      sched.cancel(idle);
      if (run.done) return;
      idle = sched.after(IDLE_MS, () => {
        svg.classList.add('nudge');
        sched.after(2400, () => svg.classList.remove('nudge'));
        armIdle();
      });
    };
    armIdle();

    // --- dragging a sign (pointer captured on the stable svg root) ---
    const toSvg = (e) => {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const q = pt.matrixTransform(svg.getScreenCTM().inverse());
      return [q.x, q.y];
    };
    let drag = null;
    let preview = null;
    const clearPreview = () => {
      preview?.remove();
      preview = null;
    };
    svg.addEventListener('pointerdown', (e) => {
      if (run.done || drag) return;
      const g = e.target.closest?.('.fw-tile');
      const t = g && tiles.find((q) => q.g === g);
      if (!t || g.classList.contains('placed')) return;
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      armIdle();
      const lift = e.pointerType === 'touch' ? 70 : 0;
      const q = toSvg(e);
      drag = { t, id: e.pointerId, lift, pos: [q[0], q[1] - lift] };
      tileLayer.append(t.g); // on top
      g.classList.add('held');
      for (const o of tiles) o.g.classList.remove('pulse');
      moveTile(t, ...drag.pos, 120);
      say1(`${say(t.ref)} · ${REFS[t.ref]?.name ?? ''}`);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { t } = drag;
      const q = toSvg(e);
      drag.pos = [q[0], q[1] - drag.lift];
      let shown = drag.pos;
      const isNear = t.route && !run.placed.has(t.leg) && drag.pos[1] < MH;
      const n = isNear ? nearestOnLine(drag.pos, lineFor(t)) : null;
      if (n && n.d < MAGNET && n.d <= nearestRoad(drag.pos).d + 8) {
        shown = magnet(drag.pos, n.point, n.d, MAGNET);
        if (!preview) {
          preview = svgEl('path', { d: pathD(lineFor(t)), class: 'fw-preview' });
          built.append(preview);
        }
        t.g.classList.add('near');
      } else {
        clearPreview();
        t.g.classList.remove('near');
      }
      moveTile(t, ...shown);
    });
    const end = (e, cancelled) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { t, pos } = drag;
      drag = null;
      clearPreview();
      t.g.classList.remove('held', 'near');
      if (cancelled) return goHome(t, 260);
      drop(t, pos);
    };
    svg.addEventListener('pointerup', (e) => end(e, false));
    svg.addEventListener('pointercancel', (e) => end(e, true));

    function drop(t, pos) {
      armIdle();
      const inTray = pos[1] > MH;
      const own = nearestOnLine(pos, lineFor(t));
      const road = nearestRoad(pos); // the road they actually dropped it on
      // On its own road: right on it, nearer it than any other road, or
      // anywhere along its own freeway (just past the dashed part counts).
      // A finger-pad from its road always counts (fingers land 20–30px off);
      // with the leg dashed, anywhere near the dash counts (that's clearly what
      // they meant); further out it must be nearer its own road than any other.
      const dashed = slotShown || tier === 'guided';
      const onOwn = own.d < MAGNET && (own.d < 75 || (dashed && t.leg === current()) || own.d <= road.d + 8 || road.ref === t.ref);
      if (!inTray && t.route && (onOwn || (road.ref === t.ref && road.d < MAGNET))) return place(t);
      goHome(t);
      if (inTray) return; // put back: no harm done
      if (t.route && t.leg === current()) {
        // The RIGHT sign, just not on its road: never tell them it's wrong.
        if (road.d < MAGNET) flashRoad(road.ref);
        say1(
          road.d < MAGNET
            ? `Right sign! But that’s ${say(road.ref)}’s road (flashing) — drop ${say(t.ref)} on its own road.`
            : `Right sign! Now drop it on its road, ${tier === 'open' ? 'starting from the 🚗' : 'the dashed one'}.`,
          'good',
        );
        return;
      }
      if (!t.route && onOwn) {
        say1(`That is ${say(t.ref)}’s road — but this drive doesn’t use ${say(t.ref)}.`, 'warn');
        const flash = svgEl('path', { d: pathD(lineFor(t)), class: 'fw-preview decoy' });
        built.append(flash);
        sched.after(1400, () => flash.remove());
        countEvent('freeway-decoy');
        return;
      }
      // A miss on the current leg (a wrong sign): a step more help each time.
      const leg = current();
      if (leg >= legs) return;
      run.misses[leg] = (run.misses[leg] || 0) + 1;
      const right = tileForLeg(leg);
      const onLeg = nearestOnLine(pos, legPts(leg)).d < MAGNET;
      // Teach from the miss: show where the sign's freeway really runs.
      const off = flashRoad(t.ref);
      const where = off ? `it runs ${off}` : 'it runs where it’s flashing';
      const lead = onLeg
        ? `Not ${say(t.ref)} — ${where}.`
        : road.d < MAGNET && road.ref !== t.ref
          ? `That’s ${say(road.ref)}’s road, not ${say(t.ref)} — ${where}.`
          : `Not there — ${say(t.ref)} ${where.replace(/^it /, '')}.`;
      const help = legHint(run.misses[leg]);
      const pts = legPts(leg);
      const heads = compass(pts[0], pts.at(-1));
      if (help === 'via') {
        if (right.via?.length) labelPlaces(right.via);
        const through = right.via?.length ? ` through ${right.via.map(labelOf).join(' and ')}` : '';
        say1(`${lead} Hint: this leg heads ${heads}${through}.`, 'warn');
        countEvent('freeway-hint-via');
      } else if (help === 'slot') {
        const was = slotShown;
        if (!slotShown) showSlot(leg, true);
        say1(`${lead} ${was ? 'Look at the dashed road' : 'This leg’s road is dashed now'} — which sign is it?`, 'warn');
        countEvent('freeway-hint-slot');
      } else if (help === 'name') {
        if (!slotShown) showSlot(leg, true);
        right.g.classList.add('pulse');
        say1(`It’s ${say(right.ref)} (${REFS[right.ref]?.name}). Drag its sign onto the dashed road.`, 'warn');
      } else say1(lead, 'warn');
    }

    function place(t, shown = false) {
      const wasCurrent = t.leg === current();
      const known = book.get('learned') || [];
      if (!shown && !known.includes(t.ref)) book.set('learned', [...known, t.ref]); // its sign shows on later maps
      t.g.classList.remove('pulse');
      run.placed.add(t.leg);
      buildRoad(t.leg, true);
      refreshLeg();
      const at = p.blocks[t.leg].at ? ` You switched at ${p.blocks[t.leg].at}.` : '';
      const name = `${say(t.ref)} — ${REFS[t.ref]?.name ?? ''}`;
      if (run.placed.size === legs) say1(`✓ ${name}.${at} That’s the whole drive — here we go!`, 'good');
      else if (shown) say1(`Here’s ${name}.${at} Your turn: ${legName(current(), true)}.`);
      else if (wasCurrent) say1(`✓ ${name}!${at} Next leg: which freeway ${current() === 0 ? `out of ${from}` : `from ${say(p.blocks[current() - 1].ref)}`}?`, 'good');
      else say1(`✓ ${name} — that’s later in the drive. Still need: ${legName(current(), true)}.`, 'good');
      renderFooter();
      sched.after(reduceMotion() ? 0 : 450, driveOn);
    }

    // Show me: do the current leg for them (the drive then counts as shown).
    function showOne() {
      if (run.done) return;
      const leg = current();
      if (leg >= legs) return;
      run.shown = true;
      run.shownLegs = (run.shownLegs || 0) + 1;
      countEvent('freeway-show-leg');
      place(tileForLeg(leg), true);
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
      // A peek or two still counts; only a fully shown drive doesn't.
      run.peeked = run.shown;
      run.shown = run.shownLegs >= legs;
      book.markDone(idOf(p), run.shown ? 'skipped' : 'solved');
      countEvent(run.shown ? 'freeway-shown' : 'freeway-solved');
      countEl.textContent = `${PUZZLES.filter((q) => book.isSolved(idOf(q))).length} / ${PUZZLES.length} drives`;
      refreshLeg();
      recap();
      say1(madeIt(), 'good');
      renderFooter();
    }

    // After the drive the tray lists the route: each sign + its name.
    function recap() {
      for (const t of tiles) if (!t.route) t.g.classList.add('gone');
      const g = svgEl('g', { class: 'fw-recap' });
      const rowH = Math.min(p.blocks.some((b) => b.at) ? 78 : 64, (TRAY[3] - TRAY[1] - 84) / legs);
      p.blocks.forEach((b, k) => {
        const y = TRAY[1] + 60 + rowH * k + rowH / 2 - 10;
        g.append(shield(b.ref, [TRAY[0] + 70, y]));
        g.append(Object.assign(svgEl('text', { x: TRAY[0] + 120, y: y + 9, class: 'fw-recap-name' }), { textContent: REFS[b.ref]?.name ?? '' }));
        if (b.at) g.append(Object.assign(svgEl('text', { x: TRAY[0] + 120, y: y + 36, class: 'fw-recap-at' }), { textContent: `switch at ${b.at}` }));
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
