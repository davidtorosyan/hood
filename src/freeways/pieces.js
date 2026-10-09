// Freeways: the pieces. Each leg of the drive is one piece in two forms:
//   - a SIGN TILE in the tray (identical road tiles, so the tray reads like
//     directions — 101 → 5 → 710 — not like a shape puzzle), and
//   - its SHAPE: that stretch of freeway at true map scale, with its sign
//     riding on it. Picking up a tile unfolds it into the shape; the shape is
//     what you lay on the map, and it clicks in at its real position.
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

// legs: [{ ref, pts (board coords) }] in driving order. Tiles go in a row in
// the tray with arrows between; shapes start hidden.
export function makePieces(legs, tileLayer, shapeLayer, [tx0, ty0, tx1, ty1]) {
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

    // The shape, drawn at its true position (translate 0,0 = in place).
    const xs = leg.pts.map((q) => q[0]);
    const ys = leg.pts.map((q) => q[1]);
    const center = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    const mid = along(leg.pts, 0.5);
    const d = 'M' + leg.pts.map(fmt).join('L');
    const shape = svgEl('g', { class: `fw-shape ${REFS[leg.ref]?.kind || 'CA'}` });
    shape.dataset.ref = leg.ref;
    shape.append(svgEl('path', { d, class: 'fw-shape-casing' }), svgEl('path', { d, class: 'fw-shape-road' }), shield(leg.ref, mid, 0.8));
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
