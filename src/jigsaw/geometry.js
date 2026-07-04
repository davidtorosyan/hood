// Pure geometry for one node's puzzle — no DOM. Projects a node's children into
// the board's user-space, so each child's path sits at its TRUE position and the
// map is solved exactly when every piece's translate is (0,0).
import { geoMercator } from 'd3-geo';
import { childrenOf, hasChildren, shapeOf } from './tree.js';

export const VB_W = 1000; // user-space board width; height derived from aspect
export const FILL = 0.9; // fraction of the build canvas the assembled map fills

// The board is split into two canvases with a gap: a "build" canvas (where the
// map lives) and a "tray" canvas (loose pieces). On a tall (portrait) board they
// stack — build on top, tray below; on a wide (landscape) board they sit side by
// side — build on the left, tray on the right. Rects are [x0,y0,x1,y1] fractions.
export const CANVAS_INSET = 0.025; // canvases inset from the board edges

export function layoutFor(vbH) {
  const i = CANVAS_INSET;
  const wide = VB_W / vbH > 1.15; // board wider than ~1.15:1 → side-by-side
  if (wide) {
    const split = 0.63;
    const gap = 0.03;
    return { wide, build: [i, i, split, 1 - i], tray: [split + gap, i, 1 - i, 1 - i] };
  }
  const split = 0.54;
  const gap = 0.06;
  return { wide, build: [i, i, 1 - i, split], tray: [i, split + gap, 1 - i, 1 - i] };
}

const toUser = ([x0, y0, x1, y1], vbH) => [x0 * VB_W, y0 * vbH, x1 * VB_W, y1 * vbH];
export const buildRect = (vbH) => toUser(layoutFor(vbH).build, vbH);
export const trayRect = (vbH) => toUser(layoutFor(vbH).tray, vbH);

export const fullVB = (vbH) => [0, 0, VB_W, vbH];

// A zoom-target box around a single piece, with breathing room, used as the
// viewBox we animate to when zooming into that piece (and out of, in reverse).
export function pieceBox(p) {
  const pad = Math.max(p.w, p.h) * 0.12 + 20;
  return [p.minX - pad, p.minY - pad, p.w + 2 * pad, p.h + 2 * pad];
}

const ringToPath = (ring) =>
  'M' + ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z';

// Project every child of `nodeId` into a vbW×vbH board centred and scaled to
// FILL. Returns one geometry record per child (in sibling order): its path `d`,
// centroid, bounding box, faint inner subdivisions (if it zooms further), and
// whether it's zoomable. Label and colour are attached later by the caller.
export function projectChildren(nodeId, vbH, mode) {
  const kids = childrenOf(nodeId);
  const fc = {
    type: 'FeatureCollection',
    features: kids.map((id) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [shapeOf(id, mode)] },
    })),
  };
  // Fit the map into the upper build canvas (so the map always lives there, with
  // the tray below), filling FILL of it.
  const [x0, y0, x1, y1] = buildRect(vbH);
  const padX = ((x1 - x0) * (1 - FILL)) / 2;
  const padY = ((y1 - y0) * (1 - FILL)) / 2;
  const proj = geoMercator().fitExtent(
    [[x0 + padX, y0 + padY], [x1 - padX, y1 - padY]],
    fc,
  );
  const projectRing = (lnglat) => lnglat.map((c) => proj(c));

  return kids.map((id) => {
    const ring = projectRing(shapeOf(id, mode));
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    // Zoomable pieces carry faint outlines of their own children, so you can SEE
    // they break down (and tapping reveals exactly those sections).
    const inner = hasChildren(id)
      ? childrenOf(id).map((gid) => ringToPath(projectRing(shapeOf(gid, mode))))
      : null;
    const [cx, cy] = visualCenter(ring); // a point reliably INSIDE the shape
    return {
      id,
      zoomable: hasChildren(id),
      inner,
      ring, // projected local points [x,y][], for the facing-edge glow + hit tests
      d: ringToPath(ring),
      cx,
      cy,
      minX,
      minY,
      w: Math.max(...xs) - minX,
      h: Math.max(...ys) - minY,
    };
  });
}

// The "pole of inaccessibility": the interior point farthest from the boundary.
// Used to center a piece's label anchor — unlike the vertex-average centroid, it
// always lands inside the shape (concave LA pieces can put the centroid outside).
function visualCenter(ring) {
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
  let best = [(minX + maxX) / 2, (minY + maxY) / 2];
  let bestD = ringContains(ring, best[0], best[1]) ? distToRing(best, ring) : -Infinity;
  const consider = (x, y) => {
    if (!ringContains(ring, x, y)) return;
    const d = distToRing([x, y], ring);
    if (d > bestD) {
      bestD = d;
      best = [x, y];
    }
  };
  const N = 14; // coarse grid over the bbox, then hill-climb to refine
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++)
      consider(minX + ((maxX - minX) * i) / N, minY + ((maxY - minY) * j) / N);
  let step = Math.max(maxX - minX, maxY - minY) / N;
  for (let iter = 0; iter < 6; iter++) {
    const [cx, cy] = best;
    for (const [ox, oy] of [[step, 0], [-step, 0], [0, step], [0, -step], [step, step], [-step, -step], [step, -step], [-step, step]])
      consider(cx + ox, cy + oy);
    step /= 2;
  }
  return best;
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

// Where the loose pieces wait before assembly: spread across the tray canvas in a
// grid — more columns when the tray is wide (portrait, a bottom strip), a single
// column when it's tall (landscape, a right strip) — jittered, and kept inside the
// tray (big pieces centred if they don't fit). Returns the translate that moves
// the piece's centroid to its slot (its solved translate is 0,0).
export function trayScatter(p, k, count, vbH) {
  const [x0, y0, x1, y1] = trayRect(vbH);
  const w = x1 - x0;
  const h = y1 - y0;
  // Wide tray (portrait, bottom strip) → a few columns; tall tray (landscape,
  // right strip) → a single column, since the region pieces are wide.
  const cols = w >= h ? Math.min(count, 3) : 1;
  const rows = Math.ceil(count / cols);
  const col = k % cols;
  const row = Math.floor(k / cols);
  const jx = (Math.random() - 0.5) * (w / cols) * 0.22;
  const jy = (Math.random() - 0.5) * (h / rows) * 0.22;
  const x = x0 + (w * (col + 0.5)) / cols + jx;
  const y = y0 + (h * (row + 0.5)) / rows + jy;

  // Clamp the centroid so the piece's bounding box stays inside the tray (its
  // centroid can sit off-centre in the bbox, so clamp against its real distance to
  // each edge). If a piece is too big for a slot, centre it in the available room.
  const m = VB_W * 0.015;
  const left = p.cx - p.minX + m;
  const right = p.minX + p.w - p.cx + m;
  const top = p.cy - p.minY + m;
  const bottom = p.minY + p.h - p.cy + m;
  const fit = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
  const cx = fit(x, x0 + left, x1 - right);
  const cy = fit(y, y0 + top, y1 - bottom);
  return [cx - p.cx, cy - p.cy];
}
