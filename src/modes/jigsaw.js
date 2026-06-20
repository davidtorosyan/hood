// Mode 4 — Jigsaw.
// Assemble a small group of adjacent neighborhoods by fitting real (simplified)
// polygon pieces together. No slots, no pre-placed anchor: every piece is loose,
// and pieces snap to EACH OTHER when dropped in their correct relative position
// (like a real jigsaw). The assembly forms wherever you build it and can be
// dragged around as a unit. A piece glows when it's in a connectable spot.
import { geoMercator } from 'd3-geo';
import { el, clear, shuffle, pickOne } from '../ui/dom.js';
import { modeScreen } from '../ui/chrome.js';
import { PUZZLES, PUZZLE_BY_ID } from '../data/puzzles.js';
import shapes from '../data/puzzle-shapes.json';
import adjacency from '../data/puzzle-adjacency.json';
import { store } from '../store.js';

const isAdjacent = (a, b) => adjacency[a]?.includes(b) ?? false;

const SVG_NS = 'http://www.w3.org/2000/svg';
const VB = 1000; // square user-space viewBox
const FIT = 620; // default assembled size within the board (a puzzle may override)
const SNAP = 135; // connection radius in user units (~48px on a phone — forgiving)

// Project a puzzle's members into board coords. Each piece's path is drawn at
// its TRUE position, so two pieces are in correct relative arrangement exactly
// when their translate offsets are equal — that's what we snap on.
function project(puzzle) {
  const fc = {
    type: 'FeatureCollection',
    features: puzzle.members.map((name) => ({
      type: 'Feature',
      properties: { name },
      geometry: { type: 'Polygon', coordinates: [shapes[name]] },
    })),
  };
  const fit = puzzle.fit ?? FIT;
  const m = (VB - fit) / 2;
  const proj = geoMercator().fitExtent([[m, m], [VB - m, VB - m]], fc);
  return puzzle.members.map((name) => {
    const ring = shapes[name].map((c) => proj(c));
    const d = 'M' + ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z';
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { name, d, cx, cy, minX, minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
  });
}

// Entry point: a selector listing every puzzle (also handy for testing combos).
export function mountJigsaw(app, { back }) {
  clear(app);
  app.append(
    modeScreen(
      'Jigsaw',
      back,
      [
        el('p', { class: 'mode-intro' }, 'Pick a group of neighborhoods to piece together.'),
        el(
          'div',
          { class: 'mode-list' },
          PUZZLES.map((p) =>
            el('button', { class: 'mode-card', onClick: () => runPuzzle(app, { back }, p) }, [
              el('span', { class: 'mode-emoji' }, '🧩'),
              el('span', { class: 'mode-text' }, [
                el('span', { class: 'mode-title' }, p.title),
                el('span', { class: 'mode-desc' }, `${p.members.length} pieces · ${p.blurb}`),
              ]),
              el('span', { class: 'mode-arrow' }, '›'),
            ]),
          ),
        ),
      ],
      { bodyClass: 'scroll' },
    ),
  );
}

// Run one puzzle. `back` returns to the selector.
function runPuzzle(app, { back }, puzzle) {
  const toSelector = () => mountJigsaw(app, { back });
  const pieces = project(puzzle);

  function render() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${VB} ${VB}`);
    svg.setAttribute('class', 'jig');
    const pieceLayer = document.createElementNS(SVG_NS, 'g');
    svg.append(pieceLayer);

    const order = []; // recs in creation order
    const counter = el('span', {});

    function apply(rec) {
      rec.g.setAttribute('transform', `translate(${rec.tx.toFixed(1)} ${rec.ty.toFixed(1)})`);
    }
    const lockedList = () => order.filter((r) => r.locked);

    function refreshCounter() {
      const remaining = order.filter((r) => !r.locked).length;
      counter.textContent = remaining === 0 ? 'Done!' : `${remaining} to place`;
      if (remaining === 0) onSolved();
    }

    // Would dropping `rec` here connect it? A connection requires BOTH the right
    // relative position (matching translate) AND true geographic adjacency to a
    // piece already in place — so you can't bridge a gap with a non-neighbor.
    // Returns the target translate (and the seed piece, if this is the first
    // connection of two loose pieces).
    function wouldConnect(rec) {
      const locked = lockedList();
      if (locked.length) {
        const o = locked[0];
        const positioned = Math.hypot(rec.tx - o.tx, rec.ty - o.ty) < SNAP;
        if (positioned && locked.some((l) => isAdjacent(rec.p.name, l.p.name))) {
          return { tx: o.tx, ty: o.ty };
        }
        return null;
      }
      for (const q of order) {
        if (q === rec || q.locked) continue;
        if (Math.hypot(rec.tx - q.tx, rec.ty - q.ty) < SNAP && isAdjacent(rec.p.name, q.p.name)) {
          return { tx: q.tx, ty: q.ty, seed: q };
        }
      }
      return null;
    }

    function place(rec, res) {
      rec.tx = res.tx;
      rec.ty = res.ty;
      rec.locked = true;
      rec.g.classList.add('placed');
      rec.g.classList.remove('jig-near');
      apply(rec);
      if (res.seed) {
        res.seed.locked = true;
        res.seed.g.classList.add('placed');
      }
      store.markSeen(rec.p.name);
      refreshCounter();
    }

    // Scatter pieces into evenly-spaced sectors so they fan out without stacking,
    // each centroid clamped to a safe band that keeps the whole piece on-board.
    const MARGIN = 215;
    const CENTER = VB / 2;
    const clamp = (v) => Math.max(MARGIN, Math.min(VB - MARGIN, v));
    function scatterTranslate(p, k, count) {
      const angle = ((k + 0.5) / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const r = 300;
      const X = clamp(CENTER + Math.cos(angle) * r);
      const Y = clamp(CENTER + Math.sin(angle) * r);
      return [X - p.cx, Y - p.cy];
    }

    function makePiece(p) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'jig-piece');
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', p.d);
      path.setAttribute('class', 'jig-shape');
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', p.cx);
      label.setAttribute('y', p.cy);
      label.setAttribute('class', 'jig-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'central');
      label.textContent = p.name;
      g.append(path, label);
      pieceLayer.append(g);
      return g;
    }

    function toUser(evt) {
      const pt = svg.createSVGPoint();
      pt.x = evt.clientX;
      pt.y = evt.clientY;
      const u = pt.matrixTransform(svg.getScreenCTM().inverse());
      return [u.x, u.y];
    }

    // Drag handling: each piece only starts a drag on pointerdown; the pointer is
    // captured on the STABLE svg root (never re-parented) and move/up are handled
    // there. This keeps the drag alive even as the piece is raised above / passes
    // under other pieces — capturing on the re-parented piece itself is unreliable.
    let drag = null;
    let ready = false; // pieces aren't draggable until the explode intro finishes
    let zoomMode = false; // after solving a parent puzzle, tapping a piece zooms in

    // Camera-zoom into a solved region, then hand off to its child puzzle.
    function zoomInto(rec) {
      const child = PUZZLE_BY_ID[puzzle.children?.[rec.p.name]];
      if (!child) return;
      zoomMode = false; // prevent re-trigger mid-animation
      order.forEach((r) => {
        if (r === rec) return;
        r.g.style.transition = 'opacity 0.4s ease';
        r.g.style.opacity = '0';
      });
      const pad = 26;
      const target = [rec.p.minX - pad, rec.p.minY - pad, rec.p.w + 2 * pad, rec.p.h + 2 * pad];
      const start = [0, 0, VB, VB];
      const t0 = performance.now();
      const dur = 600;
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      function frame(now) {
        const k = Math.min(1, (now - t0) / dur);
        const e = ease(k);
        svg.setAttribute('viewBox', start.map((s, i) => (s + (target[i] - s) * e).toFixed(1)).join(' '));
        if (k < 1) requestAnimationFrame(frame);
        else runPuzzle(app, { back }, child);
      }
      requestAnimationFrame(frame);
    }

    function startDrag(rec, e) {
      if (!ready) return;
      if (zoomMode) {
        e.preventDefault();
        zoomInto(rec);
        return;
      }
      e.preventDefault();
      const [ux, uy] = toUser(e);
      if (rec.locked) {
        // Drag the whole assembled clump to reposition it.
        const locks = lockedList();
        locks.forEach((r) => r.g.classList.add('dragging'));
        drag = { mode: 'group', ux, uy, starts: locks.map((r) => ({ r, tx: r.tx, ty: r.ty })) };
      } else {
        pieceLayer.append(rec.g); // raise above others
        rec.g.classList.add('dragging');
        drag = { mode: 'free', rec, ux, uy, tx: rec.tx, ty: rec.ty };
      }
      svg.setPointerCapture(e.pointerId);
    }
    function attachDrag(rec) {
      rec.g.addEventListener('pointerdown', (e) => startDrag(rec, e));
    }
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const [ux, uy] = toUser(e);
      const dx = ux - drag.ux;
      const dy = uy - drag.uy;
      if (drag.mode === 'free') {
        drag.rec.tx = drag.tx + dx;
        drag.rec.ty = drag.ty + dy;
        apply(drag.rec);
        drag.rec.g.classList.toggle('jig-near', !!wouldConnect(drag.rec));
      } else {
        for (const s of drag.starts) {
          s.r.tx = s.tx + dx;
          s.r.ty = s.ty + dy;
          apply(s.r);
        }
      }
    });
    const endDrag = () => {
      if (!drag) return;
      if (drag.mode === 'free') {
        const rec = drag.rec;
        rec.g.classList.remove('dragging', 'jig-near');
        const res = wouldConnect(rec);
        if (res) place(rec, res);
      } else {
        drag.starts.forEach((s) => s.r.g.classList.remove('dragging'));
      }
      drag = null;
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);

    // Create all pieces. Each piece's home is its scatter position (tx/ty), but
    // we briefly show them ASSEMBLED (at translate 0) first, then let them fly
    // out to those scatter spots — so you see the whole map before it bursts.
    const scattered = shuffle(pieces);
    scattered.forEach((p, k) => {
      const g = makePiece(p);
      const [tx, ty] = scatterTranslate(p, k, scattered.length);
      const rec = { p, g, tx, ty, locked: false };
      order.push(rec);
      g.classList.add('exploding'); // CSS transition on transform
      g.setAttribute('transform', 'translate(0 0)'); // start assembled
      attachDrag(rec);
    });
    counter.textContent = `${order.length} to place`;

    const hint = el('span', { class: 'jig-hint' }, 'Putting the map together…');
    requestAnimationFrame(() => {
      setTimeout(() => {
        order.forEach((rec) => apply(rec)); // fly out to scatter (animated)
        hint.textContent = 'Fit the pieces back together.';
        setTimeout(() => {
          order.forEach((rec) => rec.g.classList.remove('exploding'));
          ready = true;
        }, 650);
      }, 850);
    });

    const banner = el('div', { class: 'jig-banner' }, [hint, counter]);
    const solvedSlot = el('div', { class: 'jig-solved-slot' });

    function onSolved() {
      banner.classList.add('done');
      const open = (p) => runPuzzle(app, { back }, p);
      let actions;
      if (puzzle.children) {
        // Drill down: tap a region piece on the map to zoom into its own
        // neighborhoods (handled by zoomInto via the pieces themselves).
        zoomMode = true;
        order.forEach((r) => r.g.classList.add('zoomable'));
        actions = [
          el('p', { class: 'jig-zoom-label' }, '👆 Tap a region to zoom in.'),
          el('button', { class: 'btn btn-ghost', onClick: toSelector }, 'All puzzles'),
        ];
      } else {
        const parent = puzzle.parent ? PUZZLE_BY_ID[puzzle.parent] : null;
        actions = [
          parent
            ? el('button', { class: 'btn', onClick: () => open(parent) }, `↑ Back to ${parent.title}`)
            : el('button', { class: 'btn', onClick: () => open(nextPuzzle(puzzle)) }, 'Next puzzle'),
          el('button', { class: 'btn btn-ghost', onClick: toSelector }, 'All puzzles'),
        ];
      }
      solvedSlot.append(
        el('div', { class: 'jig-solved' }, [
          el('p', { class: 'jig-solved-title' }, `${puzzle.title} assembled 🧩`),
          el('p', { class: 'jig-solved-blurb' }, puzzle.blurb),
          el('div', { class: 'jig-solved-actions' }, actions),
        ]),
      );
      solvedSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    clear(app);
    app.append(
      modeScreen(
        'Jigsaw',
        toSelector,
        [
          el('p', { class: 'mode-intro' }, 'Drag the neighborhoods so they connect in the right places.'),
          banner,
          el('div', { class: 'jig-board' }, [svg]),
          solvedSlot,
        ],
        { note: puzzle.title, bodyClass: 'jig-body' },
      ),
    );
  }

  render();
}

function nextPuzzle(current) {
  const others = PUZZLES.filter((p) => p.id !== current.id);
  return pickOne(others.length ? others : PUZZLES);
}
