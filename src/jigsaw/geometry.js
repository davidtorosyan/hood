// Pure geometry for one node's puzzle — no DOM. Projects a node's children into
// the board's user-space, so each child's path sits at its TRUE position and the
// map is solved exactly when every piece's translate is (0,0).
import { geoMercator } from 'd3-geo';
import { childrenOf, hasChildren, shapeOf } from './tree.js';

export const VB_W = 1000; // user-space board width; height derived from aspect
export const FILL = 0.84; // fraction of the board the assembled map fills

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
export function projectChildren(nodeId, vbW, vbH) {
  const kids = childrenOf(nodeId);
  const fc = {
    type: 'FeatureCollection',
    features: kids.map((id) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [shapeOf(id)] },
    })),
  };
  const bw = vbW * FILL;
  const bh = vbH * FILL;
  const proj = geoMercator().fitExtent(
    [[(vbW - bw) / 2, (vbH - bh) / 2], [(vbW + bw) / 2, (vbH + bh) / 2]],
    fc,
  );
  const projectRing = (lnglat) => lnglat.map((c) => proj(c));

  return kids.map((id) => {
    const ring = projectRing(shapeOf(id));
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    // Zoomable pieces carry faint outlines of their own children, so you can SEE
    // they break down (and tapping reveals exactly those sections).
    const inner = hasChildren(id)
      ? childrenOf(id).map((gid) => ringToPath(projectRing(shapeOf(gid))))
      : null;
    return {
      id,
      zoomable: hasChildren(id),
      inner,
      d: ringToPath(ring),
      cx: ring.reduce((s, p) => s + p[0], 0) / ring.length,
      cy: ring.reduce((s, p) => s + p[1], 0) / ring.length,
      minX,
      minY,
      w: Math.max(...xs) - minX,
      h: Math.max(...ys) - minY,
    };
  });
}

// Where a loose piece scatters to before assembly: spread evenly around a ring,
// jittered, clamped inside the board. Returns the translate that moves the
// piece's centroid to that spot (its solved translate is 0,0).
export function scatterTranslate(p, k, count, vbH) {
  const angle = ((k + 0.5) / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
  const x = VB_W / 2 + Math.cos(angle) * VB_W * 0.31;
  const y = vbH / 2 + Math.sin(angle) * vbH * 0.33;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return [
    clamp(x, VB_W * 0.16, VB_W * 0.84) - p.cx,
    clamp(y, vbH * 0.13, vbH * 0.87) - p.cy,
  ];
}
