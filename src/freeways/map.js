// Freeways: the map under a drive — no game logic. Frames the drive (both
// places, the route, the decoys), draws the places faintly, the whole freeway
// network as unlabeled grey roads (something to attach to), the two ends as
// name pills placed clear of the route, and a few landmark names for bearings.
// Freeways you've already learned get their signs back on the map — except
// the ones in this drive's tray (that would give the answer away).
import { geoMercator } from 'd3-geo';
import { svgEl } from '../ui/dom.js';
import { ROOT, leavesOf, shapeOf, labelOf } from '../jigsaw/tree.js';
import { PLACES } from '../data/places.js';
import { NETWORK, lineOf } from './puzzles.js';
import { shield } from './pieces.js';

const ALL = leavesOf(ROOT);
const fmt = (q) => q.map((v) => v.toFixed(1)).join(',');
export const pathD = (pts) => 'M' + pts.map(fmt).join('L');

// Returns { P (lon/lat → board), routeD(blocks), layers } with the layers
// appended to `svg` in paint order: base, roads, slots, (pieces go after),
// labels on top. The caller appends pieces between `slots` and `labels`.
export function drawMap(svg, p, W, MH, learned = [], inTray = []) {
  // Frame the drive itself (route + both places' middles), not the decoys.
  const mid = (id) => {
    const r = shapeOf(id);
    return r.reduce((a, q) => [a[0] + q[0] / r.length, a[1] + q[1] / r.length], [0, 0]);
  };
  const pts = [...p.blocks.flatMap(lineOf), mid(p.from), mid(p.to)];
  const lons = pts.map((q) => q[0]);
  const lats = pts.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const dx = Math.max(x1 - x0, 0.14) * 0.2;
  const dy = Math.max(y1 - y0, 0.12) * 0.2;
  const frame = { type: 'MultiPoint', coordinates: [[x0 - dx, y0 - dy], [x1 + dx, y1 + dy], [x0 - dx, y1 + dy], [x1 + dx, y0 - dy]] };
  const proj = geoMercator().fitExtent([[20, 20], [W - 20, MH - 20]], frame);
  const P = (c) => proj(c);
  const ringD = (r) => pathD(r.map(P)) + 'Z';

  const defs = svgEl('defs');
  const clip = svgEl('clipPath', { id: 'fw-clip' });
  clip.append(svgEl('rect', { x: 0, y: 0, width: W, height: MH, rx: 22 }));
  defs.append(clip);

  const base = svgEl('g', { 'clip-path': 'url(#fw-clip)' });
  base.append(svgEl('rect', { x: 0, y: 0, width: W, height: MH, class: 'fw-sea' }));
  for (const id of ALL) {
    const cls = id === p.from ? 'fw-place from' : id === p.to ? 'fw-place to' : 'fw-place';
    base.append(svgEl('path', { d: ringD(shapeOf(id)), class: cls }));
  }
  const roads = svgEl('g', { 'clip-path': 'url(#fw-clip)', class: 'fw-roads' });
  for (const n of NETWORK) roads.append(svgEl('path', { d: pathD(lineOf(n).map(P)), class: 'fw-net' }));
  // Signs for learned freeways that aren't in this drive's tray (a sign on
  // the map would give away which tray signs are decoys), one per freeway.
  const onRoute = new Set(inTray);
  const known = svgEl('g', { class: 'fw-known' });
  const seen = new Set();
  for (const n of NETWORK) {
    if (onRoute.has(n.ref) || !learned.includes(n.ref) || seen.has(n.ref)) continue;
    const inView = lineOf(n).map(P).filter(([x, y]) => x > 60 && x < W - 60 && y > 50 && y < MH - 50);
    if (!inView.length) continue;
    const mid = inView[Math.floor(inView.length / 2)];
    known.append(shield(n.ref, mid, 0.7));
    seen.add(n.ref);
  }
  const slots = svgEl('g', { class: 'fw-slots' });
  const labels = svgEl('g', { class: 'fw-labels' });
  svg.append(defs, base, roads, known, slots);

  // --- labels: the two ends (clear of the route), then landmarks ---
  const centroid = (id) => {
    const r = shapeOf(id).map(P);
    const c = r.reduce((a, q) => [a[0] + q[0], a[1] + q[1]], [0, 0]);
    return [c[0] / r.length, c[1] / r.length];
  };
  // The route sampled densely (its stored lines are simplified), so name
  // pills keep off every stretch of it — and off the car at the start.
  const routePts = [];
  for (const b of p.blocks) {
    const l = lineOf(b).map(P);
    for (let i = 1; i < l.length; i++) {
      const n = Math.max(1, Math.ceil(Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]) / 12));
      for (let k = 0; k < n; k++) routePts.push([l[i - 1][0] + ((l[i][0] - l[i - 1][0]) * k) / n, l[i - 1][1] + ((l[i][1] - l[i - 1][1]) * k) / n]);
    }
    routePts.push(l.at(-1));
  }
  const carAt = P(lineOf(p.blocks[0])[0]);
  const taken = [[carAt[0] - 30, carAt[1] - 30, carAt[0] + 30, carAt[1] + 30]];
  const overlaps = (lx, ly, w, h) => taken.filter(([a, b, c, d]) => !(lx + w < a || lx > c || ly + h < b || ly > d)).length;
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
      return out + onRoute * 10 + overlaps(lx, ly, w, h) * 50;
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
  const big = ALL.filter((id) => id !== p.from && id !== p.to && (PLACES[id]?.pop ?? 0) >= 60000)
    .sort((a, b) => (PLACES[b].pop ?? 0) - (PLACES[a].pop ?? 0));
  let n = 0;
  for (const id of big) {
    if (n >= 6) break;
    const [cx, cy] = centroid(id);
    const name = labelOf(id);
    const w = name.length * 14;
    if (cx - w / 2 < 6 || cx + w / 2 > W - 6 || cy < 20 || cy > MH - 20 || overlaps(cx - w / 2, cy - 14, w, 28)) continue;
    taken.push([cx - w / 2, cy - 14, cx + w / 2, cy + 14]);
    const t = Object.assign(svgEl('text', { x: cx, y: cy + 8, class: 'fw-landmark', 'text-anchor': 'middle' }), { textContent: name });
    t.dataset.place = id; // (a hint naming the same place hides it)
    labels.append(t);
    n++;
  }

  return { P, slots, labels, known };
}
