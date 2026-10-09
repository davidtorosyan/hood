// Freeways (prototype): "Drive from Encino to Pico-Union." The map shows the
// two places and the freeway network as unlabeled grey roads. The tray holds
// freeway pieces — the 101, the 405, the 10 — plus a decoy. You build the
// drive leg by leg, in driving order: "Leg 1 of 3 · Leaving Encino — which
// freeway?" Pieces are pulled in (magnetism) near their road and click in;
// the car drives each leg as you place it.
//
// Early drives outline the current leg's road (a matching game); later ones
// only mark where the leg starts. Misses escalate help one step at a time.
// Every deferred effect goes through a Scheduler, so leaving cancels it all.
import { el, svgEl, clear } from '../ui/dom.js';
import { labelOf } from '../jigsaw/tree.js';
import { Scheduler } from '../jigsaw/scheduler.js';
import { store } from '../store.js';
import { countEvent } from '../telemetry.js';
import { REFS, PUZZLES, idOf, lineOf, say, nextIndex, tierOf, nextLeg, drivable, pull, near, legHint } from './puzzles.js';
import { drawMap, pathD } from './map.js';
import { makePieces, moveTo, goHome, shield } from './pieces.js';

const book = store.freeways;
const W = 1000;
const MAGNET = 150; // board units: inside this, a held piece is pulled in, and a drop clicks
const IDLE_MS = 10000;
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
    clear(app);
    app.append(
      el('div', { class: 'screen fw-screen' }, [
        el('div', { class: 'topbar' }, [
          el('button', { class: 'icon-btn', onClick: onBack, 'aria-label': 'Home' }, '⌂'),
          el('span', { class: 'topbar-title' }, 'Freeways'),
          el('span', { class: 'fw-count' }, `${solvedN} / ${PUZZLES.length} drives`),
        ]),
        el('div', { class: 'fw-ask' }, [
          el('div', { class: 'fw-ask-line' }, ['Drive from ', el('b', { class: 'fw-from' }, from), ' to ', el('b', { class: 'fw-to' }, to)]),
          el('div', { class: 'fw-ask-sub' },
            tier === 'guided'
              ? 'Build it leg by leg: drag the right freeway onto the dashed road.'
              : 'Build it leg by leg: drag each freeway onto its road, starting at the dot.'),
        ]),
        svgWrap,
        msg,
        footer,
      ]),
    );

    // Size the board to the space it has (phone portrait, desktop, rotated).
    const box = svgWrap.getBoundingClientRect();
    const H = Math.round(W * Math.max(0.9, Math.min(2.2, box.height / Math.max(1, box.width))));
    const MH = Math.round(H * 0.6);
    const TRAY = [16, MH + 18, W - 16, H - 8];

    const svg = svgEl('svg', { class: 'fw-svg', viewBox: `0 0 ${W} ${H}`, role: 'application', 'aria-label': `Map: drive from ${from} to ${to}` });
    const { P, slots, labels } = drawMap(svg, p, W, MH);

    const trayHead = Object.assign(svgEl('text', { x: TRAY[0] + 26, y: TRAY[1] + 42, class: 'fw-tray-label' }), { textContent: '' });
    svg.append(
      svgEl('rect', { x: TRAY[0], y: TRAY[1], width: TRAY[2] - TRAY[0], height: TRAY[3] - TRAY[1], rx: 26, class: 'fw-tray' }),
      trayHead,
    );
    const blockLayer = svgEl('g');
    const carLayer = svgEl('g');
    svg.append(blockLayer, carLayer, labels);

    // Pieces: route legs + decoys, in a stable shuffled tray order.
    let seed = run.index * 7919 + 13;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const items = [
      ...p.blocks.map((b, leg) => ({ ...b, route: true, leg })),
      ...p.decoys.map((b) => ({ ...b, route: false, leg: -1 })),
    ].map((x) => [x, rnd()]).sort((a, b) => a[1] - b[1]).map(([x]) => x);
    const pieces = makePieces(items, P, blockLayer, TRAY);
    const pieceForLeg = (leg) => pieces.find((x) => x.leg === leg);
    for (const x of pieces) {
      if (x.route && run.placed.has(x.leg)) {
        moveTo(x, 0, 0, 1);
        x.g.classList.add('placed');
      } else goHome(x, 0);
    }
    svgWrap.append(svg);

    // --- the car: parked at the start, drives each leg as it's placed ---
    const car = svgEl('g', { class: 'fw-car' });
    car.append(svgEl('circle', { r: 19 }), Object.assign(svgEl('text', { y: 8, 'text-anchor': 'middle' }), { textContent: '🚗' }));
    carLayer.append(car);
    const legPts = (leg) => lineOf(p.blocks[leg]).map(P);
    const parkAt = ([x, y]) => car.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
    parkAt(run.driven ? legPts(run.driven - 1).at(-1) : legPts(0)[0]);

    // --- the current leg: prompt, slot, start dot ---
    // "Leaving Encino" / "leaving Encino" — only the first word changes case.
    const legName = (leg, lower = false) => {
      const [verb, rest] = leg === 0 ? ['Leaving', from] : leg === legs - 1 ? ['Into', to] : ['From', say(p.blocks[leg - 1].ref)];
      return `${lower ? verb.toLowerCase() : verb} ${rest}`;
    };
    let slotShown = false;
    const showSlot = (leg, force) => {
      slots.replaceChildren();
      if (leg >= legs) return;
      const pts = legPts(leg);
      if (tier === 'guided' || force) {
        slots.append(svgEl('path', { d: pathD(pts), class: 'fw-slot' }));
        slotShown = true;
      }
      slots.append(svgEl('circle', { cx: pts[0][0], cy: pts[0][1], r: 16, class: 'fw-slot-dot' }));
    };
    const current = () => nextLeg(run.placed, legs);
    const refreshLeg = () => {
      const leg = current();
      if (run.done) trayHead.textContent = 'YOUR ROUTE';
      else trayHead.textContent = `LEG ${leg + 1} OF ${legs} · ${legName(leg).toUpperCase()}`;
      slotShown = false;
      showSlot(leg, false);
    };
    refreshLeg();

    const say1 = (text, tone = '') => {
      msg.textContent = text;
      msg.className = `fw-msg ${tone}`;
    };
    const madeIt = () => `🎉 You made it! ${p.blocks.map((b) => b.ref).join(' → ')} · about ${Math.round(p.km * 0.621)} mi`;
    const renderFooter = () => {
      clear(footer);
      if (run.done) {
        footer.append(el('button', { class: 'btn fw-next', onClick: () => start(nextIndex(book.isSolved, run.index)) }, 'Next drive ▶'));
      } else {
        footer.append(
          el('button', { class: 'btn btn-quiet', onClick: () => start(nextIndex(book.isSolved, run.index)) }, 'Skip'),
          el('button', { class: 'btn btn-quiet', onClick: showRoute }, 'Show me'),
        );
      }
    };
    if (run.done) say1(madeIt(), 'good');
    else say1(run.placed.size ? `Keep going — ${legName(current(), true)}.` : `Which freeway takes you out of ${from}? One of these isn’t on the way.`);
    renderFooter();

    // A gentle nudge if nothing happens for a while: pulse where to go.
    let idle = 0;
    const armIdle = () => {
      sched.cancel(idle);
      if (run.done) return;
      idle = sched.after(IDLE_MS, () => {
        slots.classList.add('nudge');
        sched.after(2400, () => slots.classList.remove('nudge'));
        armIdle();
      });
    };
    armIdle();

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
      const x = g && pieces.find((q) => q.g === g);
      if (!x || x.g.classList.contains('placed')) return;
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      armIdle();
      const q = toSvg(e);
      const lift = e.pointerType === 'touch' ? 110 : 0;
      const raw = [q.x - x.center[0], q.y - x.center[1] - lift];
      drag = { x, id: e.pointerId, off: [raw[0] - q.x, raw[1] - q.y], raw };
      blockLayer.append(x.g); // on top
      x.g.classList.add('held');
      for (const o of pieces) o.g.classList.remove('pulse');
      moveTo(x, raw[0], raw[1], 1, 160);
      say1(`${say(x.ref)} · ${REFS[x.ref]?.name ?? ''}`);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const q = toSvg(e);
      const { x } = drag;
      drag.raw = [q.x + drag.off[0], q.y + drag.off[1]];
      const [dx, dy] = x.route ? pull(drag.raw[0], drag.raw[1], MAGNET) : drag.raw;
      x.g.classList.toggle('near', x.route && near(dx, dy, MAGNET));
      moveTo(x, dx, dy, 1);
    });
    const end = (e, cancelled) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { x, raw } = drag;
      drag = null;
      x.g.classList.remove('held', 'near');
      if (cancelled) return goHome(x, 260);
      drop(x, raw);
    };
    svg.addEventListener('pointerup', (e) => end(e, false));
    svg.addEventListener('pointercancel', (e) => end(e, true));

    // Distance (board units) from a dropped piece's centre to the current
    // leg's road — "did they aim at the slot?"
    const offSlot = (x, [dx, dy]) => {
      const leg = current();
      if (leg >= legs) return Infinity;
      const [cx, cy] = [x.center[0] + dx, x.center[1] + dy];
      return Math.min(...legPts(leg).map(([a, b]) => Math.hypot(a - cx, b - cy)));
    };

    function drop(x, raw) {
      armIdle();
      const leg = current();
      if (x.route && near(raw[0], raw[1], MAGNET)) return place(x);
      goHome(x);
      if (!x.route && near(raw[0], raw[1], MAGNET)) {
        say1(`Right road — that’s ${say(x.ref)} — but it isn’t on this drive.`, 'warn');
        countEvent('freeway-decoy');
        return;
      }
      // A miss on the current leg: help a step more each time.
      run.misses[leg] = (run.misses[leg] || 0) + 1;
      const aimed = offSlot(x, raw) < 140;
      const right = pieceForLeg(leg);
      const lead = aimed && x !== right ? `That’s ${say(x.ref)} — not this road.` : `Not quite.`;
      const help = legHint(run.misses[leg]);
      if (help === 'via' && right.via?.length) say1(`${lead} This leg runs through ${right.via.map(labelOf).join(', ')}.`, 'warn');
      else if (help === 'slot') {
        if (!slotShown) showSlot(leg, true);
        right.g.classList.add('pulse');
        say1(`${lead} It’s the pulsing piece — drag it onto the dashed road.`, 'warn');
        countEvent('freeway-hint-slot');
      } else if (help === 'name') {
        if (!slotShown) showSlot(leg, true);
        right.g.classList.add('pulse');
        say1(`It’s ${say(right.ref)} (${REFS[right.ref]?.name}). Drag it onto the dashed road.`, 'warn');
      } else say1(lead, 'warn');
    }

    function place(x, quiet = false) {
      const wasCurrent = x.leg === current();
      moveTo(x, 0, 0, 1, quiet ? 500 : 200);
      x.g.classList.add('placed');
      x.g.classList.remove('pulse');
      run.placed.add(x.leg);
      refreshLeg();
      if (!quiet) {
        if (run.placed.size === legs) say1(`✓ ${say(x.ref)} — all legs placed. Here we go!`, 'good');
        else if (wasCurrent) say1(`✓ ${say(x.ref)}! Now: ${legName(current(), true)} — which freeway?`, 'good');
        else say1(`✓ ${say(x.ref)} — that’s later in the drive. Still need: ${legName(current(), true)}.`, 'good');
      }
      driveOn();
    }

    // Drive the car along any newly drivable legs; arrive → finish.
    let driving = false;
    function driveOn() {
      if (driving) return;
      const upto = drivable(run.placed, legs);
      if (upto <= run.driven) return;
      const pts = [];
      for (let l = run.driven; l < upto; l++) pts.push(...legPts(l));
      run.driven = upto;
      const path = svgEl('path', { d: pathD(pts), class: 'fw-route' });
      carLayer.insertBefore(path, car);
      const total = path.getTotalLength();
      const at = (k) => {
        const q = path.getPointAtLength(total * k);
        parkAt([q.x, q.y]);
      };
      const arrive = () => {
        driving = false;
        if (run.driven === legs) finish();
        else driveOn();
      };
      if (reduceMotion()) {
        at(1);
        return arrive();
      }
      driving = true;
      sched.animate(Math.min(2600, 700 + total * 1.1), (k) => at(k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2), arrive);
    }

    // Place everything for them, then drive (counts as skipped, not solved).
    function showRoute() {
      if (run.done) return;
      run.shown = true;
      for (const x of pieces) if (x.route && !run.placed.has(x.leg)) place(x, true);
    }

    function finish() {
      if (run.done) return;
      run.done = true;
      sched.cancel(idle);
      book.markDone(idOf(p), run.shown ? 'skipped' : 'solved');
      countEvent(run.shown ? 'freeway-shown' : 'freeway-solved');
      for (const x of pieces) if (!x.route) x.g.classList.add('gone');
      refreshLeg();
      recap();
      say1(madeIt(), 'good');
      renderFooter();
    }

    // After the drive, the tray lists the route: each freeway's shield + name.
    function recap() {
      const g = svgEl('g', { class: 'fw-recap' });
      const rowH = Math.min(70, (TRAY[3] - TRAY[1] - 70) / legs);
      p.blocks.forEach((b, k) => {
        const y = TRAY[1] + 70 + rowH * k + rowH / 2;
        g.append(shield(b.ref, [TRAY[0] + 70, y]));
        g.append(Object.assign(svgEl('text', { x: TRAY[0] + 120, y: y + 9, class: 'fw-recap-name' }), { textContent: REFS[b.ref]?.name ?? '' }));
      });
      svg.append(g);
    }
    if (run.done) {
      for (const x of pieces) if (!x.route) x.g.classList.add('gone');
      recap();
    }
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
