// Mode 4 — Jigsaw.
// Assemble a small group of adjacent neighborhoods by dragging labeled pieces
// into their correct relative positions. Recognition + a mechanical action, so
// it works from zero knowledge: the geographically central piece is pre-placed
// as an anchor, faint slot outlines show where pieces go, and picking up a piece
// highlights its target. Moving "Highland Park" to its spot next to Eagle Rock
// is what builds the mental map.
import { geoMercator } from 'd3-geo';
import { el, clear, shuffle, pickOne } from '../ui/dom.js';
import { modeScreen } from '../ui/chrome.js';
import { BY_NAME } from '../data/neighborhoods.js';
import { PUZZLES } from '../data/puzzles.js';
import shapes from '../data/puzzle-shapes.json';
import { store } from '../store.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VB = 1000; // square user-space viewBox
const FIT = 620; // assembled puzzle fits within this; margin left for scatter
const SNAP = 105; // snap radius in user units (~38px on a phone — forgiving)

// Build projected geometry for one puzzle: each member gets an SVG path (in
// board coords, at its TRUE position) and that path's centroid.
function project(puzzle) {
  const fc = {
    type: 'FeatureCollection',
    features: puzzle.members.map((name) => ({
      type: 'Feature',
      properties: { name },
      geometry: { type: 'Polygon', coordinates: [shapes[name]] },
    })),
  };
  const m = (VB - FIT) / 2;
  const proj = geoMercator().fitExtent(
    [[m, m], [VB - m, VB - m]],
    fc,
  );
  return puzzle.members.map((name) => {
    const ring = shapes[name].map((c) => proj(c));
    const d = 'M' + ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z';
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    return { name, d, cx, cy };
  });
}

function centralPiece(pieces) {
  // The piece whose centroid is closest to the group's mean — the anchor.
  const mx = pieces.reduce((s, p) => s + p.cx, 0) / pieces.length;
  const my = pieces.reduce((s, p) => s + p.cy, 0) / pieces.length;
  let best = pieces[0];
  let bestD = Infinity;
  for (const p of pieces) {
    const d = (p.cx - mx) ** 2 + (p.cy - my) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

export function mountJigsaw(app, { back }, puzzle) {
  puzzle = puzzle ?? PUZZLES[0];
  const pieces = project(puzzle);
  const anchor = centralPiece(pieces);

  function render() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${VB} ${VB}`);
    svg.setAttribute('class', 'jig');

    const slotLayer = document.createElementNS(SVG_NS, 'g');
    const pieceLayer = document.createElementNS(SVG_NS, 'g');
    svg.append(slotLayer, pieceLayer);

    // Faint target slots for every non-anchor piece.
    const slotByName = {};
    for (const p of pieces) {
      if (p.name === anchor.name) continue;
      const slot = document.createElementNS(SVG_NS, 'path');
      slot.setAttribute('d', p.d);
      slot.setAttribute('class', 'jig-slot');
      slotLayer.append(slot);
      slotByName[p.name] = slot;
    }

    const state = {}; // name -> { g, tx, ty, placed }
    let remaining = pieces.length - 1;
    const counter = el('span', {});

    // Scatter pieces into evenly-spaced sectors around the anchor so they fan
    // out without stacking, each centroid clamped to a safe band that keeps the
    // whole piece on the board. Returns the translate from the piece's TRUE
    // position out to its scatter point.
    const MARGIN = 215;
    const CENTER = VB / 2;
    const clamp = (v) => Math.max(MARGIN, Math.min(VB - MARGIN, v));
    function scatterTranslate(p, k, count) {
      const angle = ((k + 0.5) / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const r = 300;
      const X = clamp(CENTER + Math.cos(angle) * r);
      const Y = clamp(CENTER + Math.sin(angle) * r);
      return [X - p.cx, Y - p.cy];
    }

    function makePiece(p, { anchor: isAnchor }) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', `jig-piece${isAnchor ? ' jig-anchor' : ''}`);
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

    // Anchor: locked at true position.
    makePiece(anchor, { anchor: true });

    // Draggable pieces, scattered into sectors around the anchor.
    const scattered = shuffle(pieces.filter((p) => p.name !== anchor.name));
    scattered.forEach((p, k) => {
      const g = makePiece(p, { anchor: false });
      const [tx, ty] = scatterTranslate(p, k, scattered.length);
      const rec = { g, tx, ty, placed: false, p };
      state[p.name] = rec;
      apply(rec);
      attachDrag(rec);
    });

    function apply(rec) {
      rec.g.setAttribute('transform', `translate(${rec.tx.toFixed(1)} ${rec.ty.toFixed(1)})`);
    }

    function toUser(evt) {
      const pt = svg.createSVGPoint();
      pt.x = evt.clientX;
      pt.y = evt.clientY;
      const u = pt.matrixTransform(svg.getScreenCTM().inverse());
      return [u.x, u.y];
    }

    function attachDrag(rec) {
      let start = null;
      rec.g.addEventListener('pointerdown', (e) => {
        if (rec.placed) return;
        e.preventDefault();
        rec.g.setPointerCapture(e.pointerId);
        rec.g.classList.add('dragging');
        slotByName[rec.p.name]?.classList.add('jig-slot-active');
        pieceLayer.append(rec.g); // raise to top
        const [ux, uy] = toUser(e);
        start = { ux, uy, tx: rec.tx, ty: rec.ty };
      });
      rec.g.addEventListener('pointermove', (e) => {
        if (!start) return;
        const [ux, uy] = toUser(e);
        rec.tx = start.tx + (ux - start.ux);
        rec.ty = start.ty + (uy - start.uy);
        apply(rec);
      });
      const end = (e) => {
        if (!start) return;
        start = null;
        rec.g.classList.remove('dragging');
        slotByName[rec.p.name]?.classList.remove('jig-slot-active');
        const dist = Math.hypot(rec.tx, rec.ty);
        if (dist < SNAP) {
          rec.tx = 0;
          rec.ty = 0;
          rec.placed = true;
          rec.g.classList.add('placed');
          apply(rec);
          store.markSeen(rec.p.name);
          remaining -= 1;
          counter.textContent = remaining === 0 ? 'Done!' : `${remaining} to place`;
          if (remaining === 0) onSolved();
        }
      };
      rec.g.addEventListener('pointerup', end);
      rec.g.addEventListener('pointercancel', end);
    }

    counter.textContent = `${remaining} to place`;

    const banner = el('div', { class: 'jig-banner' }, [
      el('span', { class: 'jig-anchor-note' }, `${anchor.name} is placed for you.`),
      counter,
    ]);
    const solvedSlot = el('div', { class: 'jig-solved-slot' });

    function onSolved() {
      banner.classList.add('done');
      solvedSlot.append(
        el('div', { class: 'jig-solved' }, [
          el('p', { class: 'jig-solved-title' }, `${puzzle.title} assembled 🧩`),
          el('p', { class: 'jig-solved-blurb' }, puzzle.blurb),
          el('div', { class: 'jig-solved-actions' }, [
            el('button', { class: 'btn', onClick: () => mountJigsaw(app, { back }, nextPuzzle(puzzle)) }, 'Next puzzle'),
            el('button', { class: 'btn btn-ghost', onClick: back }, 'Home'),
          ]),
        ]),
      );
      solvedSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    clear(app);
    app.append(
      modeScreen(
        'Jigsaw',
        back,
        [
          el('p', { class: 'mode-intro' }, 'Drag each neighborhood next to where it belongs.'),
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
