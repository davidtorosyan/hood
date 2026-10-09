// Freeways: the pieces — uniform road tiles, each carrying one freeway's sign.
// Every tile looks the same apart from its sign, so you choose by NAME (the
// thing to learn), not by matching a shape. A tile sits in a tray cell, follows
// the finger, and once placed parks on its road. Moves go through the CSS
// `transform` property (never the SVG attribute — only Chromium transitions
// that) with a forced reflow so transitions run.
import { svgEl } from '../ui/dom.js';
import { REFS } from './puzzles.js';

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const TILE = { w: 150, h: 76 };

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

// items: [{ ref, route, leg }] in tray order → tiles laid out in the tray.
export function makeTiles(items, layer, [tx0, ty0, tx1, ty1]) {
  const n = items.length;
  const cols = Math.min(n, 3);
  const rows = Math.ceil(n / cols);
  const cw = (tx1 - tx0) / cols;
  const ch = (ty1 - ty0 - 50) / rows;
  return items.map((it, k) => {
    const g = svgEl('g', { class: 'fw-tile' });
    g.dataset.ref = it.ref;
    g.dataset.route = it.route ? 'yes' : 'no'; // (the screenshot harness reads these)
    g.dataset.leg = it.leg;
    const { w, h } = TILE;
    g.append(
      svgEl('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 18, class: 'fw-tile-road' }),
      svgEl('line', { x1: -w / 2 + 14, y1: 0, x2: w / 2 - 14, y2: 0, class: 'fw-tile-lane' }),
      shield(it.ref, [0, 0], 1.15),
    );
    layer.append(g);
    const row = Math.floor(k / cols);
    const inRow = row === rows - 1 ? n - row * cols : cols; // centre a short last row
    const col = k % cols;
    const x = (tx0 + tx1) / 2 + (col - (inRow - 1) / 2) * cw;
    const y = ty0 + 50 + row * ch + ch / 2;
    return { ...it, g, home: [x, y], x, y, s: 1 };
  });
}

export function moveTile(t, x, y, ms = 0, s = 1) {
  const tr = ms && !reduceMotion() ? `transform ${ms}ms cubic-bezier(.2,.8,.2,1)` : 'none';
  t.g.style.transition = tr;
  if (tr !== 'none') t.g.getBoundingClientRect(); // reflow, so the transition runs
  t.g.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  Object.assign(t, { x, y, s });
}
export const goHome = (t, ms = 320) => moveTile(t, ...t.home, ms);
