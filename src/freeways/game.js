// Freeways (prototype): "Drive from Encino to Pico-Union." The map shows the
// two places; the tray holds freeway pieces — the 101, the 405, the 10 — plus a
// decoy. Drag each piece to where that freeway really runs; it clicks in when
// it's close. Place the whole route and a car drives it.
//
// One screen, one puzzle at a time. Every deferred effect goes through a
// Scheduler so leaving the screen cancels it all.
import { geoMercator } from 'd3-geo';
import { el, svgEl, clear } from '../ui/dom.js';
import { ROOT, leavesOf, shapeOf, labelOf } from '../jigsaw/tree.js';
import { Scheduler } from '../jigsaw/scheduler.js';
import { PLACES } from '../data/places.js';
import { store } from '../store.js';
import { countEvent } from '../telemetry.js';
import { REFS, PUZZLES, idOf, lineOf, say, nextIndex, snaps, hintLevel } from './puzzles.js';

const book = store.freeways;
const W = 1000;
const ALL = leavesOf(ROOT);
const SNAP = 70; // board units — about a finger's width on a phone
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
  let run = null; // { index, placed: Set, misses: [], done }
  let onResize = null;

  const start = (index) => {
    run = { index, placed: new Set(), misses: [], done: false };
    book.set('at', index);
    countEvent('freeway-start');
    mount();
  };

  function mount() {
    sched.cancelAll();
    const p = PUZZLES[run.index];
    const from = labelOf(p.from);
    const to = labelOf(p.to);
    const solvedN = PUZZLES.filter((q) => book.isSolved(idOf(q))).length;

    const msg = el('div', { class: 'fw-msg', role: 'status', 'aria-live': 'polite' }, '');
    const footer = el('div', { class: 'fw-foot' });
    const svgWrap = el('div', { class: 'fw-board' });
    clear(app);
    app.append(
      el('div', { class: 'screen fw-screen' }, [
        el('div', { class: 'topbar' }, [
          el('button', { class: 'icon-btn', onClick: onBack, 'aria-label': 'Home' }, '⌂'),
          el('span', { class: 'topbar-title' }, 'Freeways'),
          el('span', { class: 'fw-count' }, `${solvedN} / ${PUZZLES.length} drives`),
        ]),
        el('div', { class: 'fw-ask' }, [
          el('div', { class: 'fw-ask-line' }, [
            'Drive from ',
            el('b', { class: 'fw-from' }, from),
            ' to ',
            el('b', { class: 'fw-to' }, to),
          ]),
          el('div', { class: 'fw-ask-sub' }, `Drag each freeway to where it runs.${p.decoys.length > 1 ? ' Two pieces aren’t on this drive.' : ' One piece isn’t on this drive.'}`),
        ]),
        svgWrap,
        msg,
        footer,
      ]),
    );

    // Size the board to the space it has (phone portrait, desktop, rotated).
    const box = svgWrap.getBoundingClientRect();
    const H = Math.round(W * Math.max(0.9, Math.min(2.2, box.height / Math.max(1, box.width))));
    const MH = Math.round(H * 0.6); // the map; the tray gets the rest
    const TRAY = [16, MH + 18, W - 16, H - 8];

    // --- projection: frame the drive (route, decoys, both places) ---
    const pts = [
      ...p.blocks.flatMap(lineOf),
      ...p.decoys.flatMap(lineOf),
      ...shapeOf(p.from),
      ...shapeOf(p.to),
    ];
    const lons = pts.map((q) => q[0]);
    const lats = pts.map((q) => q[1]);
    const pad = 0.12;
    const [x0, x1, y0, y1] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
    const dx = Math.max(x1 - x0, 0.12) * pad;
    const dy = Math.max(y1 - y0, 0.1) * pad;
    const frame = { type: 'MultiPoint', coordinates: [[x0 - dx, y0 - dy], [x1 + dx, y1 + dy], [x0 - dx, y1 + dy], [x1 + dx, y0 - dy]] };
    const proj = geoMercator().fitExtent([[20, 20], [W - 20, MH - 20]], frame);
    const P = (c) => proj(c);
    const ringD = (r) => 'M' + r.map((c) => P(c).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z';
    const lineD = (r) => 'M' + r.map((c) => P(c).map((v) => v.toFixed(1)).join(',')).join('L');

    const svg = svgEl('svg', { class: 'fw-svg', viewBox: `0 0 ${W} ${H}`, role: 'application', 'aria-label': `Map: drive from ${from} to ${to}` });
    const defs = svgEl('defs');
    const clip = svgEl('clipPath', { id: 'fw-clip' });
    clip.append(svgEl('rect', { x: 0, y: 0, width: W, height: MH, rx: 22 }));
    defs.append(clip);
    svg.append(defs);

    // --- the map: places (faint), the two ends, a few landmarks for bearings ---
    const map = svgEl('g', { 'clip-path': 'url(#fw-clip)' });
    map.append(svgEl('rect', { x: 0, y: 0, width: W, height: MH, class: 'fw-sea' }));
    for (const id of ALL) {
      const cls = id === p.from ? 'fw-place from' : id === p.to ? 'fw-place to' : 'fw-place';
      map.append(svgEl('path', { d: ringD(shapeOf(id)), class: cls }));
    }
    svg.append(map);

    const centroid = (id) => {
      const r = shapeOf(id).map(P);
      const c = r.reduce((a, q) => [a[0] + q[0], a[1] + q[1]], [0, 0]);
      return [c[0] / r.length, c[1] / r.length];
    };
    const labels = svgEl('g', { class: 'fw-labels' });
    const taken = [];
    const free = ([x, y], w, h) =>
      x - w / 2 > 6 && x + w / 2 < W - 6 && y - h / 2 > 6 && y + h / 2 < MH - 6 &&
      taken.every(([a, b, c, d]) => x + w / 2 < a || x - w / 2 > c || y + h / 2 < b || y - h / 2 > d);
    // The two ends get name pills — beside the place, on whichever side keeps
    // clear of the route (so the pill never hides where the freeway goes).
    const routePts = p.blocks.flatMap((b) => lineOf(b).map(P));
    const endLabel = (id, cls) => {
      const [x, y] = centroid(id);
      const name = labelOf(id);
      const w = name.length * 19 + 54;
      const h = 46;
      const spots = [
        [x - w / 2, y - 64], [x - w / 2, y + 18], [x + 18, y - h / 2], [x - w - 18, y - h / 2],
        [x - w / 2, y - 110], [x - w / 2, y + 64],
      ];
      const cost = ([lx, ly]) => {
        const out = lx < 6 || ly < 6 || lx + w > W - 6 || ly + h > MH - 6 ? 1000 : 0;
        const onRoute = routePts.filter(([qx, qy]) => qx > lx - 12 && qx < lx + w + 12 && qy > ly - 12 && qy < ly + h + 12).length;
        const onOther = taken.filter(([a, b, c, d]) => !(lx + w < a || lx > c || ly + h < b || ly > d)).length;
        return out + onRoute * 10 + onOther * 50;
      };
      const [lx, ly] = spots.reduce((best, sp) => (cost(sp) < cost(best) ? sp : best));
      const g = svgEl('g', { class: `fw-end ${cls}` });
      g.append(
        svgEl('line', { x1: x, y1: y, x2: Math.max(lx, Math.min(lx + w, x)), y2: Math.max(ly, Math.min(ly + h, y)) }),
        svgEl('rect', { x: lx, y: ly, width: w, height: h, rx: 23 }),
        Object.assign(svgEl('text', { x: lx + w / 2 + 10, y: ly + 31, 'text-anchor': 'middle' }), { textContent: name }),
        Object.assign(svgEl('text', { x: lx + 24, y: ly + 31, 'text-anchor': 'middle', class: 'fw-end-icon' }), { textContent: cls === 'from' ? '●' : '⚑' }),
        svgEl('circle', { cx: x, cy: y, r: 9 }),
      );
      taken.push([lx, ly, lx + w, ly + h]);
      labels.append(g);
    };
    endLabel(p.from, 'from');
    endLabel(p.to, 'to');
    // Landmarks: a handful of the biggest places in view, if there's room.
    const big = ALL.filter((id) => id !== p.from && id !== p.to && (PLACES[id]?.pop ?? 0) >= 60000)
      .sort((a, b) => (PLACES[b].pop ?? 0) - (PLACES[a].pop ?? 0));
    let n = 0;
    for (const id of big) {
      if (n >= 7) break;
      const c = centroid(id);
      const name = labelOf(id);
      const w = name.length * 14;
      if (!free(c, w, 28)) continue;
      taken.push([c[0] - w / 2, c[1] - 14, c[0] + w / 2, c[1] + 14]);
      labels.append(Object.assign(svgEl('text', { x: c[0], y: c[1] + 8, class: 'fw-landmark', 'text-anchor': 'middle' }), { textContent: name }));
      n++;
    }

    // --- the tray ---
    const tray = svgEl('g');
    tray.append(
      svgEl('rect', { x: TRAY[0], y: TRAY[1], width: TRAY[2] - TRAY[0], height: TRAY[3] - TRAY[1], rx: 26, class: 'fw-tray' }),
      Object.assign(svgEl('text', { x: TRAY[0] + 26, y: TRAY[1] + 40, class: 'fw-tray-label' }), { textContent: run.done ? 'YOUR ROUTE' : 'FREEWAY PIECES' }),
    );
    svg.append(tray);

    const ghostLayer = svgEl('g');
    const blockLayer = svgEl('g');
    svg.append(ghostLayer, blockLayer, labels);

    // --- the pieces: route blocks + decoys, in a stable shuffled order ---
    const pieces = [
      ...p.blocks.map((b, i) => ({ ...b, route: true, i })),
      ...p.decoys.map((b, i) => ({ ...b, route: false, i: 100 + i })),
    ];
    let seed = run.index * 7919 + 13;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const order = pieces.map((x) => [x, rnd()]).sort((a, b) => a[1] - b[1]).map(([x]) => x);

    const cols = order.length <= 3 ? order.length : Math.ceil(order.length / 2);
    const rows = Math.ceil(order.length / cols);
    const cw = (TRAY[2] - TRAY[0]) / cols;
    const ch = (TRAY[3] - TRAY[1] - 56) / rows;
    const shield = (ref, [ax, ay]) => {
      const kind = REFS[ref]?.kind || 'CA';
      const w = ref.length >= 3 ? 70 : 56;
      const g = svgEl('g', { class: `fw-shield ${kind}` });
      g.append(
        svgEl('rect', { x: ax - w / 2, y: ay - 24, width: w, height: 48, rx: kind === 'US' ? 8 : 12 }),
        kind === 'I' ? svgEl('rect', { x: ax - w / 2, y: ay - 24, width: w, height: 13, rx: 6, class: 'fw-shield-top' }) : null,
        Object.assign(svgEl('text', { x: ax, y: ay + (kind === 'I' ? 15 : 11), 'text-anchor': 'middle' }), { textContent: ref }),
      );
      return g;
    };
    const blocks = order.map((b, k) => {
      const line = lineOf(b).map(P);
      const xs = line.map((q) => q[0]);
      const ys = line.map((q) => q[1]);
      const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      // The shield sits halfway along the piece.
      let len = 0;
      const seg = line.slice(1).map((q, i) => (len += Math.hypot(q[0] - line[i][0], q[1] - line[i][1])));
      const half = len / 2;
      const j = seg.findIndex((s) => s >= half);
      const a = line[j];
      const bq = line[j + 1];
      const t = (half - (seg[j - 1] ?? 0)) / Math.max(1e-6, seg[j] - (seg[j - 1] ?? 0));
      const anchor = [a[0] + (bq[0] - a[0]) * t, a[1] + (bq[1] - a[1]) * t];

      const d = 'M' + line.map((q) => q.map((v) => v.toFixed(1)).join(',')).join('L');
      const g = svgEl('g', { class: `fw-block ${REFS[b.ref]?.kind || 'CA'}` });
      g.dataset.ref = b.ref;
      g.dataset.route = b.route ? 'yes' : 'no'; // (the screenshot harness reads this)
      const sh = shield(b.ref, anchor);
      g.append(svgEl('path', { d, class: 'fw-hit' }), svgEl('path', { d, class: 'fw-casing' }), svgEl('path', { d, class: 'fw-road' }), sh);
      blockLayer.append(g);

      const col = k % cols;
      const row = Math.floor(k / cols);
      const cell = [TRAY[0] + col * cw, TRAY[1] + 56 + row * ch, cw, ch];
      const bw = Math.max(1, bb[2] - bb[0]);
      const bh = Math.max(1, bb[3] - bb[1]);
      const s = Math.min((cw * 0.8) / bw, (ch * 0.72) / bh, 1);
      const home = [cell[0] + cw / 2 - s * (bb[0] + bw / 2), cell[1] + ch / 2 - s * (bb[1] + bh / 2), s];
      return { ...b, g, sh, anchor, home, center: [bb[0] + bw / 2, bb[1] + bh / 2], d, tx: 0, ty: 0, s: 1 };
    });

    const moveTo = (b, tx, ty, s, ms = 0) => {
      const tr = ms && !reduceMotion() ? `transform ${ms}ms cubic-bezier(.2,.8,.2,1)` : 'none';
      b.g.style.transition = tr;
      b.sh.style.transition = tr;
      if (tr !== 'none') b.g.getBoundingClientRect(); // reflow, so the transition runs
      b.g.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      // Shields stay the same size whatever the piece's scale.
      const [ax, ay] = b.anchor;
      b.sh.style.transform = `translate(${ax}px, ${ay}px) scale(${1 / s}) translate(${-ax}px, ${-ay}px)`;
      Object.assign(b, { tx, ty, s });
    };
    for (const b of blocks) {
      if (run.placed.has(b.i)) {
        moveTo(b, 0, 0, 1);
        b.g.classList.add('placed');
      } else moveTo(b, ...b.home);
    }

    svgWrap.append(svg);

    // --- messages + footer ---
    const say1 = (text, tone = '') => {
      msg.textContent = text;
      msg.className = `fw-msg ${tone}`;
    };
    const renderFooter = () => {
      clear(footer);
      if (run.done) {
        footer.append(
          el('button', { class: 'btn fw-next', onClick: () => start(nextIndex(book.isSolved, run.index)) }, 'Next drive ▶'),
        );
      } else {
        footer.append(
          el('button', { class: 'btn btn-quiet', onClick: () => start(nextIndex(book.isSolved, run.index)) }, 'Skip'),
          el('button', { class: 'btn btn-quiet', onClick: showRoute }, 'Show me'),
        );
      }
    };
    const madeIt = () => `🎉 You made it! ${p.blocks.map((b) => b.ref).join(' → ')} · about ${Math.round(p.km * 0.621)} mi`;
    if (run.done) say1(madeIt(), 'good');
    else say1(run.placed.size ? `${run.placed.size} of ${p.blocks.length} placed` : `Tip: the drive starts on a freeway through ${from}.`);
    renderFooter();

    // --- dragging (pointer captured on the stable svg root) ---
    const toSvg = (e) => {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      return pt.matrixTransform(svg.getScreenCTM().inverse());
    };
    let drag = null;
    svg.addEventListener('pointerdown', (e) => {
      if (run.done || drag) return;
      const g = e.target.closest?.('.fw-block');
      const b = g && blocks.find((x) => x.g === g);
      if (!b || run.placed.has(b.i)) return;
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      const q = toSvg(e);
      const lift = e.pointerType === 'touch' ? 110 : 0;
      const tx = q.x - b.center[0];
      const ty = q.y - b.center[1] - lift;
      drag = { b, id: e.pointerId, off: [tx - q.x, ty - q.y] };
      blockLayer.append(b.g); // on top
      b.g.classList.add('held');
      moveTo(b, tx, ty, 1, 160);
      say1(`${say(b.ref)} · ${REFS[b.ref]?.name ?? ''}`);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const q = toSvg(e);
      moveTo(drag.b, q.x + drag.off[0], q.y + drag.off[1], 1);
    });
    const end = (e, cancelled) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { b } = drag;
      drag = null;
      b.g.classList.remove('held');
      if (cancelled) return moveTo(b, ...b.home, 260);
      drop(b);
    };
    svg.addEventListener('pointerup', (e) => end(e, false));
    svg.addEventListener('pointercancel', (e) => end(e, true));

    function drop(b) {
      if (!b.route) {
        moveTo(b, ...b.home, 320);
        b.g.classList.add('nope');
        sched.after(500, () => b.g.classList.remove('nope'));
        say1(`Not this one — ${say(b.ref)} isn’t on the way from ${from} to ${to}.`, 'warn');
        countEvent('freeway-decoy');
        return;
      }
      if (snaps(b.tx, b.ty, SNAP)) {
        moveTo(b, 0, 0, 1, 200);
        b.g.classList.add('placed');
        run.placed.add(b.i);
        ghostLayer.replaceChildren();
        if (run.placed.size === p.blocks.length) return finish(false);
        say1(`✓ ${say(b.ref)} · ${run.placed.size} of ${p.blocks.length} placed`, 'good');
        return;
      }
      run.misses[b.i] = (run.misses[b.i] || 0) + 1;
      moveTo(b, ...b.home, 320);
      const lvl = hintLevel(run.misses[b.i]);
      if (lvl === 2) {
        ghostLayer.replaceChildren(svgEl('path', { d: b.d, class: 'fw-ghost' }));
        say1(`Here’s where ${say(b.ref)} goes — the dashed line.`, 'warn');
        countEvent('freeway-hint-ghost');
      } else if (lvl === 1 && b.via?.length) {
        say1(`Hint: ${say(b.ref)} runs through ${b.via.map(labelOf).join(', ')}.`, 'warn');
        countEvent('freeway-hint-via');
      } else say1(`Not quite — ${say(b.ref)} runs somewhere else.`, 'warn');
    }

    // After the drive, the tray lists the route: each freeway's shield + name.
    function recap() {
      svg.querySelector('.fw-tray-label').textContent = 'YOUR ROUTE';
      const g = svgEl('g', { class: 'fw-recap' });
      const rowH = Math.min(70, (TRAY[3] - TRAY[1] - 70) / p.blocks.length);
      p.blocks.forEach((b, k) => {
        const y = TRAY[1] + 70 + rowH * k + rowH / 2;
        g.append(shield(b.ref, [TRAY[0] + 70, y]));
        g.append(Object.assign(svgEl('text', { x: TRAY[0] + 120, y: y + 9, class: 'fw-recap-name' }), { textContent: REFS[b.ref]?.name ?? '' }));
      });
      svg.append(g);
    }
    if (run.done) recap();

    // Place everything for them (no ✓), then drive.
    function showRoute() {
      for (const b of blocks) if (b.route && !run.placed.has(b.i)) {
        moveTo(b, 0, 0, 1, 500);
        b.g.classList.add('placed');
        run.placed.add(b.i);
      }
      sched.after(reduceMotion() ? 0 : 520, () => finish(true));
    }

    function finish(shown) {
      run.done = true;
      if (!shown) book.markDone(idOf(p), 'solved');
      else book.markDone(idOf(p), 'skipped');
      countEvent(shown ? 'freeway-shown' : 'freeway-solved');
      for (const b of blocks) if (!b.route) b.g.classList.add('gone');
      // The car drives the route, block by block, start to finish.
      const route = svgEl('path', { d: p.blocks.map((b) => lineD(lineOf(b))).join(' '), class: 'fw-route' });
      const car = svgEl('g', { class: 'fw-car' });
      car.append(svgEl('circle', { r: 17 }), Object.assign(svgEl('text', { y: 9, 'text-anchor': 'middle' }), { textContent: '🚗' }));
      svg.insertBefore(route, labels);
      svg.insertBefore(car, labels);
      const total = route.getTotalLength();
      const at = (k) => {
        const q = route.getPointAtLength(total * k);
        car.setAttribute('transform', `translate(${q.x.toFixed(1)},${q.y.toFixed(1)})`);
      };
      at(0);
      const done = () => {
        say1(madeIt(), 'good');
        renderFooter();
        recap();
      };
      say1(`On ${p.blocks.map((b) => say(b.ref)).join(', then ')}…`);
      if (reduceMotion()) {
        at(1);
        done();
      } else sched.animate(Math.min(4200, 1400 + total * 1.2), (k) => at(k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2), done);
    }
  }

  onResize = () => sched.after(150, () => run && mount());
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
