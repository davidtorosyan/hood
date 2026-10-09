// Freeways: the pieces — one freeway leg (or decoy) each: its road shape at
// true map position, a shield halfway along, and a home cell in the tray where
// it sits shrunk to fit. Moves go through the CSS `transform` property (never
// the SVG attribute: only Chromium transitions that) with a forced reflow so
// transitions run. Shields are counter-scaled so they read the same size in
// the tray as on the map.
import { svgEl } from '../ui/dom.js';
import { REFS, lineOf } from './puzzles.js';
import { pathD } from './map.js';

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function shield(ref, [ax, ay]) {
  const kind = REFS[ref]?.kind || 'CA';
  const w = ref.length >= 3 ? 70 : 56;
  const g = svgEl('g', { class: `fw-shield ${kind}` });
  g.append(
    svgEl('rect', { x: ax - w / 2, y: ay - 24, width: w, height: 48, rx: kind === 'US' ? 8 : 12 }),
    kind === 'I' ? svgEl('rect', { x: ax - w / 2, y: ay - 24, width: w, height: 13, rx: 6, class: 'fw-shield-top' }) : '',
    Object.assign(svgEl('text', { x: ax, y: ay + (kind === 'I' ? 15 : 11), 'text-anchor': 'middle' }), { textContent: ref }),
  );
  return g;
}

// The point halfway along a polyline (by length).
function midpoint(line) {
  let len = 0;
  const acc = line.slice(1).map((q, i) => (len += Math.hypot(q[0] - line[i][0], q[1] - line[i][1])));
  const half = len / 2;
  const j = Math.max(0, acc.findIndex((s) => s >= half));
  const a = line[j];
  const b = line[j + 1] ?? a;
  const s0 = acc[j - 1] ?? 0;
  const t = (half - s0) / Math.max(1e-6, acc[j] - s0);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// items: [{ ref, line, route, leg }] in tray order. Returns piece objects.
export function makePieces(items, P, layer, tray) {
  const [tx0, ty0, tx1, ty1] = tray;
  const n = items.length;
  const cols = n <= 3 ? n : Math.ceil(n / 2);
  const rows = Math.ceil(n / cols);
  const cw = (tx1 - tx0) / cols;
  const ch = (ty1 - ty0 - 56) / rows;
  return items.map((it, k) => {
    const line = lineOf(it).map(P);
    const xs = line.map((q) => q[0]);
    const ys = line.map((q) => q[1]);
    const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const anchor = midpoint(line);
    const d = pathD(line);
    const g = svgEl('g', { class: `fw-block ${REFS[it.ref]?.kind || 'CA'}` });
    g.dataset.ref = it.ref;
    g.dataset.route = it.route ? 'yes' : 'no'; // (the screenshot harness reads these)
    g.dataset.leg = it.leg;
    const sh = shield(it.ref, anchor);
    g.append(svgEl('path', { d, class: 'fw-hit' }), svgEl('path', { d, class: 'fw-casing' }), svgEl('path', { d, class: 'fw-road' }), sh);
    layer.append(g);
    const col = k % cols;
    const row = Math.floor(k / cols);
    const bw = Math.max(1, bb[2] - bb[0]);
    const bh = Math.max(1, bb[3] - bb[1]);
    const s = Math.min((cw * 0.8) / bw, (ch * 0.72) / bh, 1);
    const cx = tx0 + col * cw + cw / 2;
    const cy = ty0 + 56 + row * ch + ch / 2;
    const home = [cx - s * (bb[0] + bw / 2), cy - s * (bb[1] + bh / 2), s];
    return { ...it, g, sh, anchor, d, line, home, center: [bb[0] + bw / 2, bb[1] + bh / 2], tx: 0, ty: 0, s: 1 };
  });
}

export function moveTo(piece, tx, ty, s, ms = 0) {
  const tr = ms && !reduceMotion() ? `transform ${ms}ms cubic-bezier(.2,.8,.2,1)` : 'none';
  piece.g.style.transition = tr;
  piece.sh.style.transition = tr;
  if (tr !== 'none') piece.g.getBoundingClientRect(); // reflow, so the transition runs
  piece.g.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
  const [ax, ay] = piece.anchor;
  piece.sh.style.transform = `translate(${ax}px, ${ay}px) scale(${1 / s}) translate(${-ax}px, ${-ay}px)`;
  Object.assign(piece, { tx, ty, s });
}
export const goHome = (piece, ms = 320) => moveTo(piece, ...piece.home, ms);
