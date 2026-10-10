// Freeways: where a drive's two places are, for players who don't know them.
// A tiny county map (the 7 regions, a dot for each end) and a one-line
// "which part of LA" caption under each block.
import { geoMercator } from 'd3-geo';
import { svgEl } from '../ui/dom.js';
import { ROOT, childrenOf, labelOf, pathIds, shapeOf } from '../jigsaw/tree.js';

// Districts named more truly than their region (the Eastside isn't really
// the San Gabriel Valley, though our partition files it there).
const DISTRICTS = new Set(['The Eastside', 'Northeast L.A.']);

// "Gateway Cities", "South L.A.", "The Eastside"…
export function areaOf(id) {
  const names = pathIds(id).slice(1, -1).map(labelOf);
  return names.find((n) => DISTRICTS.has(n)) ?? names[0] ?? '';
}

const centre = (ring, P) => {
  const r = ring.map(P);
  return r.reduce((a, q) => [a[0] + q[0] / r.length, a[1] + q[1] / r.length], [0, 0]);
};

// The inset, fitted into [x, y, w, h] (board units).
export function locator(from, to, [x, y, w, h]) {
  const regions = childrenOf(ROOT);
  const proj = geoMercator().fitExtent([[x + 12, y + 12], [x + w - 12, y + h - 12]], {
    type: 'MultiPolygon',
    coordinates: regions.map((id) => [shapeOf(id)]),
  });
  const P = (c) => proj(c);
  const d = (ring) => 'M' + ring.map((c) => P(c).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z';
  const g = svgEl('g', { class: 'fw-locator', 'aria-hidden': 'true' });
  g.append(svgEl('rect', { x, y, width: w, height: h, rx: 16, class: 'fw-locator-card' }));
  for (const id of regions) g.append(svgEl('path', { d: d(shapeOf(id)), class: 'fw-locator-region' }));
  for (const [id, cls] of [[from, 'from'], [to, 'to']]) {
    const [cx, cy] = centre(shapeOf(id), P);
    g.append(svgEl('circle', { cx, cy, r: 11, class: `fw-locator-dot ${cls}` }));
  }
  return g;
}
