// Freeways (v4, abstract): no map. Two blocks — where you start and where
// you're going — at their rough real positions on a faint grid. Each freeway
// on the drive is an ARROW: its direction (8-way) and length (grid steps)
// come from the real leg, its sign rides on it, and the tray shows them all
// at the same scale, so you can see "the 101 goes a long way east, the 5 a
// bit southeast" before touching anything. Chain them from the 🚗 to the
// flag: an arrow clicks in when its tail sits where that freeway really
// starts; the car hops along as the chain grows.
//
// Every deferred effect goes through a Scheduler, so leaving cancels it all.
import { el, svgEl, clear } from '../ui/dom.js';
import { labelOf } from '../jigsaw/tree.js';
import { Scheduler } from '../jigsaw/scheduler.js';
import { store } from '../store.js';
import { countEvent } from '../telemetry.js';
import { REFS, PUZZLES, idOf, lineOf, say, nextIndex, drivable, arrowsFor, dirName } from './puzzles.js';
import { shield } from './sign.js';

const book = store.freeways;
const W = 1000;
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const KX = 111.32 * Math.cos((34 * Math.PI) / 180);
const toKm = ([lon, lat]) => [lon * KX, -lat * 110.57]; // y down, like the screen

let live = null;
export function unmountFreeways() {
  live?.dispose();
  live = null;
}

export function renderFreeways(app, { onBack }) {
  unmountFreeways();
  const sched = new Scheduler();
  let run = null; // { index, placed: Set<leg>, driven, done, shown }

  const start = (index) => {
    run = { index, placed: new Set(), driven: 0, done: false, shown: 0 };
    book.set('at', index);
    countEvent('freeway-start');
    mount();
  };

  function mount() {
    sched.cancelAll();
    const p = PUZZLES[run.index];
    const legs = p.blocks.length;
    const from = labelOf(p.from);
    const to = labelOf(p.to);
    const arrows = arrowsFor(p.blocks.map((b) => {
      const l = lineOf(b);
      return [toKm(l[0]), toKm(l.at(-1))];
    }), legs === 2 ? 5 : 6);

    const msg = el('div', { class: 'fw-msg', role: 'status', 'aria-live': 'polite' }, '');
    const footer = el('div', { class: 'fw-foot' });
    const wrap = el('div', { class: 'fw-board' });
    clear(app);
    app.append(
      el('div', { class: 'screen fw-screen' }, [
        el('div', { class: 'topbar' }, [
          el('button', { class: 'icon-btn', onClick: onBack, 'aria-label': 'Home' }, '⌂'),
          el('span', { class: 'topbar-title' }, 'Freeways'),
          el('span', { class: 'fw-count' }, `${PUZZLES.filter((q) => book.isSolved(idOf(q))).length} / ${PUZZLES.length} drives`),
        ]),
        el('div', { class: 'fw-ask' }, [
          el('div', { class: 'fw-ask-line' }, ['Get from ', el('b', { class: 'fw-from' }, from), ' to ', el('b', { class: 'fw-to' }, to)]),
          el('div', { class: 'fw-ask-sub' }, 'Chain the freeway arrows from the 🚗 to the flag.'),
        ]),
        wrap,
        msg,
        footer,
      ]),
    );

    // --- layout: board on top, a tray of arrows below ---
    const box = wrap.getBoundingClientRect();
    const H = Math.round(W * Math.max(1, Math.min(2.2, box.height / Math.max(1, box.width))));
    const TRAY_H = Math.round(H * 0.3);
    const BH = H - TRAY_H - 16;
    const TRAY = [16, BH + 12, W - 16, H - 4];

    // Grid: all the chain's points, plus a margin for the blocks.
    const nodes = [[0, 0], ...arrows.map((a) => a.to)];
    const xs = nodes.map((n) => n[0]);
    const ys = nodes.map((n) => n[1]);
    const [gx0, gx1, gy0, gy1] = [Math.min(...xs) - 1, Math.max(...xs) + 1, Math.min(...ys) - 1, Math.max(...ys) + 1];
    const cell = Math.min(230, (W - 80) / (gx1 - gx0), (BH - 80) / (gy1 - gy0));
    const ox = W / 2 - ((gx0 + gx1) / 2) * cell;
    const oy = BH / 2 - ((gy0 + gy1) / 2) * cell;
    const at = ([gx, gy]) => [ox + gx * cell, oy + gy * cell];

    const svg = svgEl('svg', { class: 'fw-svg', viewBox: `0 0 ${W} ${H}`, role: 'application', 'aria-label': `Get from ${from} to ${to}` });
    const board = svgEl('g');
    board.append(svgEl('rect', { x: 8, y: 8, width: W - 16, height: BH - 8, rx: 26, class: 'fw-plane' }));
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
      const [x, y] = at([gx, gy]);
      board.append(svgEl('circle', { cx: x, cy: y, r: 4, class: 'fw-dot' }));
    }
    // The two places, as blocks.
    const block = (node, name, cls) => {
      const [x, y] = at(node);
      const s = Math.min(cell * 0.9, 120);
      const g = svgEl('g', { class: `fw-block-place ${cls}` });
      g.append(
        svgEl('rect', { x: x - s / 2, y: y - s / 2, width: s, height: s, rx: 18 }),
        Object.assign(svgEl('text', { x, y: y + s / 2 + 34, 'text-anchor': 'middle' }), { textContent: name }),
        Object.assign(svgEl('text', { x, y: y + 12, 'text-anchor': 'middle', class: 'fw-block-icon' }), { textContent: cls === 'from' ? '●' : '⚑' }),
      );
      return g;
    };
    board.append(block([0, 0], from, 'from'), block(arrows.at(-1).to, to, 'to'));
    const laidLayer = svgEl('g');
    const carLayer = svgEl('g');
    const trayLayer = svgEl('g');
    svg.append(
      board,
      laidLayer,
      carLayer,
      svgEl('rect', { x: TRAY[0], y: TRAY[1], width: TRAY[2] - TRAY[0], height: TRAY[3] - TRAY[1], rx: 26, class: 'fw-tray' }),
      Object.assign(svgEl('text', { x: TRAY[0] + 26, y: TRAY[1] + 40, class: 'fw-tray-label' }), { textContent: 'FREEWAYS ON THIS DRIVE' }),
      trayLayer,
    );
    wrap.append(svg);

    // --- arrows: drawn with the tail at (0,0), in board scale ---
    const arrowEl = (a, ref) => {
      const kind = REFS[ref]?.kind || 'CA';
      const L = a.len * cell * Math.hypot(...a.dir);
      const ux = a.dir[0] / Math.hypot(...a.dir);
      const uy = a.dir[1] / Math.hypot(...a.dir);
      const head = 34;
      const ex = ux * (L - head * 0.6);
      const ey = uy * (L - head * 0.6);
      const tip = [ux * L, uy * L];
      const nx = -uy;
      const ny = ux;
      const g = svgEl('g', { class: `fw-arrow-piece ${kind}` });
      g.dataset.ref = ref;
      g.append(
        svgEl('line', { x1: 0, y1: 0, x2: tip[0], y2: tip[1], class: 'fw-arrow-hit' }),
        svgEl('line', { x1: 0, y1: 0, x2: ex, y2: ey, class: 'fw-arrow-shaft' }),
        svgEl('polygon', { points: [tip, [ex + nx * head * 0.75, ey + ny * head * 0.75], [ex - nx * head * 0.75, ey - ny * head * 0.75]].map((q) => q.join(',')).join(' '), class: 'fw-arrow-head' }),
        svgEl('circle', { cx: 0, cy: 0, r: 9, class: 'fw-arrow-tail' }),
        shield(ref, [tip[0] / 2, tip[1] / 2], 0.85),
      );
      return { g, bbox: [Math.min(0, tip[0]), Math.min(0, tip[1]), Math.max(0, tip[0]), Math.max(0, tip[1])] };
    };

    // Tray: shuffled (working out the order is the puzzle), all at one scale
    // so lengths compare honestly.
    let seed = run.index * 7919 + 13;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const order = arrows.map((a, leg) => ({ a, leg, ref: p.blocks[leg].ref })).map((x) => [x, rnd()]).sort((u, v) => u[1] - v[1]).map(([x]) => x);
    const slotW = (TRAY[2] - TRAY[0]) / order.length;
    const slotH = TRAY[3] - TRAY[1] - 60;
    const pieces = order.map((x) => ({ ...x, ...arrowEl(x.a, x.ref) }));
    const s = Math.min(1, ...pieces.map(({ bbox }) => Math.min((slotW * 0.8) / Math.max(1, bbox[2] - bbox[0]), (slotH * 0.8) / Math.max(1, bbox[3] - bbox[1]))));
    pieces.forEach((pc, k) => {
      const [bx0, by0, bx1, by1] = pc.bbox;
      const cx = TRAY[0] + slotW * (k + 0.5);
      const cy = TRAY[1] + 50 + slotH / 2;
      pc.home = [cx - s * (bx0 + bx1) / 2, cy - s * (by0 + by1) / 2, s];
      pc.goal = at(pc.a.from); // where its tail belongs
      pc.g.dataset.goal = pc.goal.map((v) => v.toFixed(1)).join(','); // (harness only)
      trayLayer.append(pc.g);
    });
    const move = (pc, x, y, sc, ms = 0) => {
      const tr = ms && !reduceMotion() ? `transform ${ms}ms cubic-bezier(.2,.8,.2,1)` : 'none';
      pc.g.style.transition = tr;
      if (tr !== 'none') pc.g.getBoundingClientRect(); // reflow, so the transition runs
      pc.g.style.transform = `translate(${x}px, ${y}px) scale(${sc})`;
      Object.assign(pc, { x, y, sc });
    };
    const layDown = (pc, ms) => {
      laidLayer.append(pc.g);
      pc.g.classList.add('laid');
      move(pc, ...pc.goal, 1, ms);
    };
    for (const pc of pieces) (run.placed.has(pc.leg) ? layDown(pc, 0) : move(pc, ...pc.home));

    // --- the car hops along the chain ---
    const car = svgEl('g', { class: 'fw-car' });
    car.append(svgEl('circle', { r: 24 }), Object.assign(svgEl('text', { y: 9, 'text-anchor': 'middle' }), { textContent: '🚗' }));
    carLayer.append(car);
    const park = ([x, y]) => car.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
    run.driven = Math.min(run.driven, drivable(run.placed, legs));
    park(at(run.driven ? arrows[run.driven - 1].to : [0, 0]));

    const say1 = (text, tone = '') => {
      msg.textContent = text;
      msg.className = `fw-msg ${tone}`;
    };
    const routeWords = () => p.blocks.map((b, i) => `${b.ref} ${dirName(arrows[i].dir)}`).join(' → ');
    const renderFooter = () => {
      clear(footer);
      if (run.done) footer.append(el('button', { class: 'btn fw-next', onClick: () => start(nextIndex(book.isSolved, run.index)) }, 'Next drive ▶'));
      else footer.append(
        el('button', { class: 'btn btn-quiet', onClick: () => start(nextIndex(book.isSolved, run.index)) }, 'Skip'),
        el('button', { class: 'btn btn-quiet', onClick: showOne }, 'Show me'),
      );
    };
    if (run.done) say1(`🎉 You made it! ${routeWords()}`, 'good');
    else say1('Which freeway leaves from the 🚗 — and which way does it go?');
    renderFooter();

    // --- dragging (pointer captured on the stable svg root) ---
    const toSvg = (e) => {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const q = pt.matrixTransform(svg.getScreenCTM().inverse());
      return [q.x, q.y];
    };
    const near = (pc) => Math.hypot(pc.x - pc.goal[0], pc.y - pc.goal[1]) < cell * 0.45;
    let drag = null;
    svg.addEventListener('pointerdown', (e) => {
      if (run.done || drag) return;
      const g = e.target.closest?.('.fw-arrow-piece');
      const pc = g && pieces.find((x) => x.g === g);
      if (!pc || g.classList.contains('laid')) return;
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      const q = toSvg(e);
      const lift = e.pointerType === 'touch' ? 60 : 0;
      // Keep the grabbed point of the arrow under the finger as it grows to full size.
      const local = [(q[0] - pc.x) / pc.sc, (q[1] - pc.y) / pc.sc];
      drag = { pc, id: e.pointerId, local, lift };
      trayLayer.append(g);
      g.classList.add('held');
      move(pc, q[0] - local[0], q[1] - local[1] - lift, 1, 120);
      say1(`${say(pc.ref)} — ${REFS[pc.ref]?.name ?? ''}, heading ${dirName(pc.a.dir)}.`);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const q = toSvg(e);
      let [x, y] = [q[0] - drag.local[0], q[1] - drag.local[1] - drag.lift];
      const { pc } = drag;
      // Magnetism: close to its spot, it's pulled in.
      const d = Math.hypot(x - pc.goal[0], y - pc.goal[1]);
      if (d < cell * 0.9) {
        const k = 0.25 + 0.75 * (d / (cell * 0.9));
        x = pc.goal[0] + (x - pc.goal[0]) * k;
        y = pc.goal[1] + (y - pc.goal[1]) * k;
      }
      move(pc, x, y, 1);
      pc.g.classList.toggle('near', near(pc));
    });
    const end = (e, cancelled) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { pc } = drag;
      const q = toSvg(e);
      drag = null;
      pc.g.classList.remove('held', 'near');
      if (!cancelled && near(pc)) return place(pc);
      const tail = [pc.x, pc.y]; // where they put its tail
      move(pc, ...pc.home, 300);
      if (cancelled || q[1] > BH) return;
      // Nudge, kindly.
      const carAt = at(run.driven ? arrows[run.driven - 1].to : [0, 0]);
      const onCar = Math.hypot(tail[0] - carAt[0], tail[1] - carAt[1]) < cell * 0.5;
      if (onCar) say1(`Not first — ${say(pc.ref)} comes later in the drive. Which arrow leaves from the 🚗?`, 'warn');
      else say1(`Arrows chain tail-to-tip: start ${say(pc.ref)} where the freeway before it ends.`, 'warn');
    };
    svg.addEventListener('pointerup', (e) => end(e, false));
    svg.addEventListener('pointercancel', (e) => end(e, true));

    function place(pc, shown = false) {
      run.placed.add(pc.leg);
      layDown(pc, 160);
      const left = legs - run.placed.size;
      say1(`${shown ? 'Here’s' : '✓'} ${say(pc.ref)} ${dirName(pc.a.dir)}.${left ? ` ${left} to go.` : ' That’s the drive!'}`, shown ? '' : 'good');
      sched.after(reduceMotion() ? 0 : 250, driveOn);
    }
    function showOne() {
      const next = pieces.find((pc) => pc.leg === drivable(run.placed, legs));
      if (!next || run.done) return;
      run.shown++;
      place(next, true);
    }

    let driving = false;
    function driveOn() {
      if (driving) return;
      const upto = drivable(run.placed, legs);
      if (upto <= run.driven) return;
      const a = at(run.driven ? arrows[run.driven - 1].to : [0, 0]);
      const b = at(arrows[upto - 1].to);
      const pts = [a, ...arrows.slice(run.driven, upto).map((x) => at(x.to))];
      run.driven = upto;
      const arrive = () => {
        driving = false;
        if (run.driven === legs) finish();
        else driveOn();
      };
      if (reduceMotion()) {
        park(b);
        return arrive();
      }
      driving = true;
      const segs = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
      const total = segs.reduce((x, y) => x + y, 0);
      sched.animate(Math.min(1800, 400 + total * 1.2), (k) => {
        let left = total * (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
        for (let i = 0; i < segs.length; i++) {
          if (left <= segs[i] || i === segs.length - 1) {
            const t = segs[i] ? Math.min(1, left / segs[i]) : 1;
            return park([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
          }
          left -= segs[i];
        }
      }, arrive);
    }

    function finish() {
      run.done = true;
      book.markDone(idOf(p), run.shown >= legs ? 'skipped' : 'solved');
      countEvent(run.shown >= legs ? 'freeway-shown' : 'freeway-solved');
      say1(`🎉 You made it! ${routeWords()}`, 'good');
      renderFooter();
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
