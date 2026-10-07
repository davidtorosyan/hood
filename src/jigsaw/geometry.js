// Geometry for one node's puzzle — no DOM. Projects a node's children into
// the board's user-space, so each child's path sits at its TRUE position and the
// map is solved exactly when every piece's translate is (0,0).
import { geoMercator, geoPath } from 'd3-geo';
import { childrenOf, hasChildren, shapeOf, contextOf } from './tree.js';
import { FILL, FILL_CONTEXT } from './layout.js';

const featureCollection = (ids) => ({
  type: 'FeatureCollection',
  features: ids.map((id) => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [shapeOf(id)] },
  })),
});

// The width:height of a node's assembled map (its children together), measured
// in the same conformal projection the board uses — so it's also the aspect of
// that node's piece on its parent's board.
const aspects = new Map();
export function mapAspectOf(nodeId) {
  if (!aspects.has(nodeId)) {
    const fc = featureCollection(childrenOf(nodeId));
    const proj = geoMercator().fitSize([1000, 1000], fc);
    const [[x0, y0], [x1, y1]] = geoPath(proj).bounds(fc);
    aspects.set(nodeId, (x1 - x0) / Math.max(1e-6, y1 - y0));
  }
  return aspects.get(nodeId);
}

// How much of its build canvas a node's map fills: less when there's context
// (surrounding areas) to show around it.
export const fillFor = (nodeId) => (contextOf(nodeId).length ? FILL_CONTEXT : FILL);

const ringToPath = (ring) =>
  'M' + ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z';

// The projection that fits `nodeId`'s map into `buildRect` (user units),
// centred, filling `fill` of it.
export function fitProjection(nodeId, buildRect, fill = FILL) {
  const [x0, y0, x1, y1] = buildRect;
  const padX = ((x1 - x0) * (1 - fill)) / 2;
  const padY = ((y1 - y0) * (1 - fill)) / 2;
  return geoMercator().fitExtent([[x0 + padX, y0 + padY], [x1 - padX, y1 - padY]], featureCollection(childrenOf(nodeId)));
}

// Project every child of `nodeId` into the board's build canvas (`buildRect`,
// in user units), centred and scaled to `fill`. Returns one geometry record per
// child (in sibling order): its path `d`, label anchor candidates, bounding box,
// and whether it's zoomable. Label and colour are attached later by the caller.
export function projectChildren(nodeId, buildRect, fill = FILL, proj = fitProjection(nodeId, buildRect, fill)) {
  const kids = childrenOf(nodeId);

  return kids.map((id) => {
    const ring = shapeOf(id).map((c) => proj(c));
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const anchors = labelAnchors(ring); // interior points, roomiest first
    const [cx, cy] = anchors[0];
    return {
      id,
      zoomable: hasChildren(id),
      ring, // projected local points [x,y][], for the facing-edge glow + hit tests
      d: ringToPath(ring),
      cx,
      cy,
      anchors,
      minX,
      minY,
      w: Math.max(...xs) - minX,
      h: Math.max(...ys) - minY,
    };
  });
}

// One projection fitting `fitIds` into rect [x0, y0, x1, y1], and a path in
// it for any node (the campaign overworld draws the whole county this way).
export function projectAll(fitIds, [x0, y0, x1, y1]) {
  const proj = geoMercator().fitExtent([[x0, y0], [x1, y1]], featureCollection(fitIds));
  return { proj, pathOf: (id) => ringToPath(shapeOf(id).map((c) => proj(c))) };
}

// The surrounding areas, in the same projection as the map: [{ id, dFull,
// anchors }] (the caller clips the drawing to the build canvas). `anchors` are
// label spots inside the visible part (within `clipRect`) with at least
// `minRoom` clearance, roomiest first — the caller picks one that's clear.
export function projectContext(nodeId, proj, clipRect, minRoom) {
  return contextOf(nodeId)
    .map((id) => {
      const full = shapeOf(id).map((c) => proj(c));
      const ring = clipRing(full, clipRect);
      if (ring.length < 3) return null;
      const anchors = labelAnchors(ring, 12).filter(([, , room]) => room >= minRoom);
      return { id, dFull: ringToPath(full), anchors };
    })
    .filter(Boolean);
}

// Clip a polygon to an axis-aligned rect [x0, y0, x1, y1] (Sutherland–Hodgman).
export function clipRing(ring, [x0, y0, x1, y1]) {
  const edges = [
    [(p) => p[0] >= x0, (a, b) => lerpAt(a, b, 0, x0)],
    [(p) => p[0] <= x1, (a, b) => lerpAt(a, b, 0, x1)],
    [(p) => p[1] >= y0, (a, b) => lerpAt(a, b, 1, y0)],
    [(p) => p[1] <= y1, (a, b) => lerpAt(a, b, 1, y1)],
  ];
  let out = ring;
  for (const [inside, cut] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[(i + src.length - 1) % src.length];
      const b = src[i];
      if (inside(b)) {
        if (!inside(a)) out.push(cut(a, b));
        out.push(b);
      } else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) break;
  }
  return out;
}
const lerpAt = (a, b, axis, v) => {
  const t = (v - a[axis]) / (b[axis] - a[axis]);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
};

// Candidate label anchors: interior points ranked by clearance from the
// boundary (the first is the "pole of inaccessibility", the point farthest from
// any edge — unlike the vertex centroid it always lands inside a concave shape).
// The rest are well-spaced runners-up, so the label layout can slide a label
// elsewhere inside its piece when the best spot collides with a neighbour's.
export function labelAnchors(ring, max = 10) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const cand = [];
  const consider = (x, y) => {
    if (ringContains(ring, x, y)) cand.push({ x, y, d: distToRing([x, y], ring) });
  };
  const N = 14; // coarse grid over the bbox
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) consider(minX + ((maxX - minX) * i) / N, minY + ((maxY - minY) * j) / N);
  if (!cand.length) return [[(minX + maxX) / 2, (minY + maxY) / 2]];
  cand.sort((a, b) => b.d - a.d);
  // Hill-climb the best point to refine the pole.
  let best = cand[0];
  let step = Math.max(maxX - minX, maxY - minY) / N;
  for (let iter = 0; iter < 6; iter++) {
    for (const [ox, oy] of [[step, 0], [-step, 0], [0, step], [0, -step], [step, step], [-step, -step], [step, -step], [-step, step]]) {
      const x = best.x + ox;
      const y = best.y + oy;
      if (!ringContains(ring, x, y)) continue;
      const d = distToRing([x, y], ring);
      if (d > best.d) best = { x, y, d };
    }
    step /= 2;
  }
  const out = [best];
  const spacing = Math.max(maxX - minX, maxY - minY) / 9;
  for (const c of cand) {
    if (out.length >= max) break;
    if (out.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > spacing)) out.push(c);
  }
  return out.map((o) => [o.x, o.y, o.d]);
}

// Shortest distance from point p to the polyline `ring` (treated as closed).
function distToRing(p, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = a[0] + t * dx;
    const cy = a[1] + t * dy;
    best = Math.min(best, Math.hypot(p[0] - cx, p[1] - cy));
  }
  return best;
}

// The stretch of ring A that mates with ring B — the SHARED border. `aT` should
// be the translate A will sit at when SNAPPED (so the result is the true shared
// edge, independent of how A is currently being dragged), `bT` is B's translate.
// Returns { d, mid }: an SVG path of the shared A edges in A's LOCAL coords (so
// it rides A's transform), and the midpoint of those edges (also A-local), or
// null mid if nothing is close enough.
export function facingInfo(aRing, aT, bRing, bT) {
  const bWorld = bRing.map((q) => [q[0] + bT[0], q[1] + bT[1]]);
  const dist = aRing.map((q) => distToRing([q[0] + aT[0], q[1] + aT[1]], bWorld));
  const minD = Math.min(...dist);
  if (!Number.isFinite(minD)) return { d: '', mid: null };
  // Only the edges that truly mate. At the snap position the shared border
  // coincides (distance ≈ 0), so a tight band keeps the glow to the actual
  // contact instead of spilling along the rest of the outline.
  const band = minD + 22;
  let d = '';
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < aRing.length; i++) {
    const j = (i + 1) % aRing.length;
    if (dist[i] <= band && dist[j] <= band) {
      const a = aRing[i];
      const b = aRing[j];
      d += `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`;
      sx += (a[0] + b[0]) / 2;
      sy += (a[1] + b[1]) / 2;
      n += 1;
    }
  }
  return { d, mid: n ? [sx / n, sy / n] : null };
}

// Is local point (x,y) inside ring (even-odd / ray cast)? Used for pinch hit-test.
export function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

