// Freeways: the pieces. Each leg of the drive is one piece in two forms:
//   - a SIGN TILE in the tray (identical road tiles, so the tray reads like
//     directions — 101 → 5 → 710 — not like a shape puzzle), and
//   - its SHAPE: the WHOLE freeway at true map scale (not just this leg —
//     a leg-shaped piece just lines up with the car; playtesters solved it
//     without knowing anything), its sign riding on it. You lay the freeway
//     where it runs; once it clicks in, this drive's stretch of it lights up.
// Moves go through the CSS `transform` property (never the SVG attribute —
// only Chromium transitions that) with a forced reflow so transitions run.
import { svgEl } from '../ui/dom.js';
import { REFS } from './puzzles.js';

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const TILE = { w: 150, h: 76 };
const fmt = (q) => q.map((v) => v.toFixed(1)).join(',');

export function shield(ref, [ax, ay], scale = 1) {
  const kind = REFS[ref]?.kind || 'CA';
  const w = (ref.length >= 3 ? 70 : 56) * scale;
  const h = 48 * scale;
  const g = svgEl('g', { class: `fw-shield ${kind}` });
  g.append(
    svgEl('rect', { x: ax - w / 2, y: ay - h / 2, width: w, height: h, rx: (kind === 'US' ? 8 : 12) * scale }),
    kind === 'I' ? svgEl('rect', { x: ax - w / 2, y: ay - h / 2, width: w, height: 13 * scale, rx: 6 * scale, class: 'fw-shield-top' }) : '',
    Object.assign(svgEl('text', { x: ax, y: ay + (kind === 'I' ? 15 : 11) * scale, 'text-anchor': 'middle', style: `font-size:${24 * scale}px` }), { textContent: ref }),
  );
  return g;
}

// The point a fraction `t` of the way along a polyline (by length).
export function along(pts, t) {
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

// legs: [{ ref, pts (board coords) }] in driving order; wholeOf(ref): the
// freeway's lines (board coords); view: [x0, y0, x1, y1] of the map. Tiles go
// in a row in the tray with arrows between; shapes start hidden.
export function makePieces(legs, tileLayer, shapeLayer, [tx0, ty0, tx1, ty1], wholeOf, [vx0, vy0, vx1, vy1]) {
  const n = legs.length;
  const gap = 56;
  const rowW = n * TILE.w + (n - 1) * gap;
  const x0 = (tx0 + tx1) / 2 - rowW / 2 + TILE.w / 2;
  const y = ty0 + 50 + (ty1 - ty0 - 50) / 2;
  for (let k = 1; k < n; k++) {
    const ax = x0 + (k - 0.5) * (TILE.w + gap);
    tileLayer.append(Object.assign(svgEl('text', { x: ax, y: y + 12, 'text-anchor': 'middle', class: 'fw-arrow' }), { textContent: '→' }));
  }
  return legs.map((leg, k) => {
    // The tile.
    const tile = svgEl('g', { class: 'fw-tile' });
    tile.dataset.ref = leg.ref; // (the screenshot harness reads these)
    tile.dataset.leg = k;
    tile.append(
      svgEl('rect', { x: -TILE.w / 2, y: -TILE.h / 2, width: TILE.w, height: TILE.h, rx: 18, class: 'fw-tile-road' }),
      svgEl('line', { x1: -TILE.w / 2 + 14, y1: 0, x2: TILE.w / 2 - 14, y2: 0, class: 'fw-tile-lane' }),
      shield(leg.ref, [0, 0], 1.15),
    );
    tileLayer.append(tile);
    const home = [x0 + k * (TILE.w + gap), y];
    tile.style.transform = `translate(${home[0]}px, ${home[1]}px)`;

    // The shape, drawn at its true position (translate 0,0 = in place): the
    // whole freeway, plus this leg (shown once it's laid).
    const lines = wholeOf(leg.ref);
    const inView = lines.flat().filter(([x, y]) => x > vx0 && x < vx1 && y > vy0 && y < vy1);
    const pool = inView.length ? inView : leg.pts;
    const center = pool.reduce((a, q) => [a[0] + q[0] / pool.length, a[1] + q[1] / pool.length], [0, 0]);
    // Its sign sits on the freeway where it's nearest the middle of the map.
    const vm = [(vx0 + vx1) / 2, (vy0 + vy1) / 2];
    const signAt = pool.reduce((b, q) => (Math.hypot(q[0] - vm[0], q[1] - vm[1]) < Math.hypot(b[0] - vm[0], b[1] - vm[1]) ? q : b));
    const mid = along(leg.pts, 0.5);
    const d = 'M' + leg.pts.map(fmt).join('L');
    const shape = svgEl('g', { class: `fw-shape ${REFS[leg.ref]?.kind || 'CA'}` });
    shape.dataset.ref = leg.ref;
    for (const l of lines) shape.append(svgEl('path', { d: 'M' + l.map(fmt).join('L'), class: 'fw-shape-whole' }));
    const sign = shield(leg.ref, signAt, 0.8);
    sign.classList.add('fw-shape-sign');
    shape.append(svgEl('path', { d, class: 'fw-shape-casing' }), svgEl('path', { d, class: 'fw-shape-road' }), sign);
    shapeLayer.append(shape);
    return { ...leg, leg: k, tile, home, shape, center, mid, d, tx: 0, ty: 0 };
  });
}

export function moveShape(piece, tx, ty, ms = 0) {
  const tr = ms && !reduceMotion() ? `transform ${ms}ms cubic-bezier(.2,.8,.2,1)` : 'none';
  piece.shape.style.transition = tr;
  if (tr !== 'none') piece.shape.getBoundingClientRect(); // reflow, so the transition runs
  piece.shape.style.transform = `translate(${tx}px, ${ty}px)`;
  Object.assign(piece, { tx, ty });
}
