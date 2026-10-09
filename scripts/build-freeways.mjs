// Builds src/data/freeways.json — the Freeways mode's puzzles — from the
// hand-traced schematic in scripts/freeway-routes.mjs and the place shapes in
// src/data. Prints which places each freeway runs through: CHECK that list
// after editing the routes (it's how a mis-traced stretch gets caught).
//
// The freeways become a routable graph: densified vertices, linked along each
// freeway and at shared named interchanges. A puzzle is
// two places, each with a freeway running through it, and the best route
// between them, cut into "blocks": one per freeway along the way (the 10, then
// the 110, …). The game hands you exactly those freeways — no decoys.
//
// Usage: node scripts/build-freeways.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeRing, encodeRing } from '../src/jigsaw/polyline.js';
import { PLACES } from '../src/data/places.js';

import { NODES as JUNCTIONS, FREEWAYS } from './freeway-routes.mjs';
const { nodes, root } = JSON.parse(readFileSync('src/data/hierarchy.json', 'utf8'));
const shapes = JSON.parse(readFileSync('src/data/puzzle-shapes.json', 'utf8'));

// What each route number is, for its shield and name. (Common names only where
// the whole LA stretch goes by one; the 10 and 5 change names along the way.)
const REFS = {
  5: { kind: 'I', name: 'Golden State / Santa Ana Fwy' },
  10: { kind: 'I', name: 'Santa Monica / San Bernardino Fwy' },
  14: { kind: 'CA', name: 'Antelope Valley Fwy' },
  57: { kind: 'CA', name: 'Orange Fwy' },
  60: { kind: 'CA', name: 'Pomona Fwy' },
  71: { kind: 'CA', name: 'Chino Valley Fwy' },
  90: { kind: 'CA', name: 'Marina Fwy' },
  91: { kind: 'CA', name: 'Gardena / Artesia Fwy' },
  101: { kind: 'US', name: 'Hollywood / Ventura Fwy' },
  105: { kind: 'I', name: 'Glenn Anderson (Century) Fwy' },
  110: { kind: 'I', name: 'Harbor Fwy / Arroyo Seco Pkwy' },
  118: { kind: 'CA', name: 'Ronald Reagan Fwy' },
  134: { kind: 'CA', name: 'Ventura Fwy' },
  170: { kind: 'CA', name: 'Hollywood Fwy' },
  2: { kind: 'CA', name: 'Glendale Fwy' },
  210: { kind: 'I', name: 'Foothill Fwy' },
  405: { kind: 'I', name: 'San Diego Fwy' },
  47: { kind: 'CA', name: 'Terminal Island Fwy' },
  605: { kind: 'I', name: 'San Gabriel River Fwy' },
  710: { kind: 'I', name: 'Long Beach Fwy' },
};

// --- local planar coordinates (km), good enough across one county ---
const LON0 = -118.25;
const LAT0 = 34.0;
const KX = 111.32 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110.57;
const toXY = ([lon, lat]) => [(lon - LON0) * KX, (lat - LAT0) * KY];
const toLL = ([x, y]) => [+(x / KX + LON0).toFixed(5), +(y / KY + LAT0).toFixed(5)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// --- the places (leaves) and the area they cover ---
const kids = (id) => nodes[id]?.children || [];
const leaves = (id) => (kids(id).length ? kids(id).flatMap(leaves) : [id]);
const PLACE_IDS = leaves(root);
const ring = (id) => decodeRing(shapes[id]).map(toXY);
const placeRing = new Map(PLACE_IDS.map((id) => [id, ring(id)]));

function inside([x, y], r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const centroid = (r) => {
  let sx = 0, sy = 0;
  for (const [x, y] of r) { sx += x; sy += y; }
  return [sx / r.length, sy / r.length];
};

// --- freeway polylines (named interchanges resolved to points) ---
const lines = Object.entries(FREEWAYS).map(([ref, pts]) => ({
  ref,
  pts: pts.map((p) => toXY(typeof p === 'string' ? JUNCTIONS[p] : p)),
}));

// --- densify into a vertex graph ---
const STEP = 0.35; // km
const V = []; // { x, y, ref, line }
const adj = []; // [[to, w]]
const addV = (p, ref, line) => (V.push({ x: p[0], y: p[1], ref, line }), adj.push([]), V.length - 1);
const link = (a, b, w) => { adj[a].push([b, w]); adj[b].push([a, w]); };
const lineVerts = lines.map((l, li) => {
  const ids = [];
  for (let k = 0; k < l.pts.length - 1; k++) {
    const p = l.pts[k];
    const q = l.pts[k + 1];
    const n = Math.max(1, Math.ceil(dist(p, q) / STEP));
    for (let s = 0; s < n; s++) ids.push(addV([p[0] + ((q[0] - p[0]) * s) / n, p[1] + ((q[1] - p[1]) * s) / n], l.ref, li));
  }
  ids.push(addV(l.pts.at(-1), l.ref, li));
  for (let k = 1; k < ids.length; k++) link(ids[k - 1], ids[k], dist([V[ids[k - 1]].x, V[ids[k - 1]].y], [V[ids[k]].x, V[ids[k]].y]));
  return ids;
});
const xy = (v) => [V[v].x, V[v].y];

// Interchanges: vertices of different freeways at the same named point.
// Changing freeways costs a little, so routes prefer fewer, longer blocks.
const TRANSFER = 4; // km-equivalent: a local stays on one freeway rather than hop for a shortcut
let interchanges = 0;
for (let a = 0; a < V.length; a++) {
  for (let b = a + 1; b < V.length; b++) {
    if (V[a].ref === V[b].ref || dist(xy(a), xy(b)) > 0.01) continue;
    link(a, b, TRANSFER);
    interchanges++;
  }
}

// What each freeway runs through, in order — the check on the tracing.
const through = {};
for (const [li, ids] of lineVerts.entries()) {
  const seq = [];
  for (const v of ids) {
    const id = PLACE_IDS.find((p) => inside(xy(v), placeRing.get(p)));
    if (id && seq.at(-1) !== id) seq.push(id);
  }
  through[lines[li].ref] = seq;
}
if (process.argv.includes('--through')) {
  for (const [ref, seq] of Object.entries(through)) console.log(`${ref}: ${seq.join(' · ')}\n`);
}

// --- on-ramps: every vertex inside each place (any freeway through it) ---
const ramps = new Map();
for (const id of PLACE_IDS) {
  const r = placeRing.get(id);
  const vs = [];
  for (let v = 0; v < V.length; v++) if (inside(xy(v), r)) vs.push(v);
  if (vs.length) ramps.set(id, vs);
}

// A small binary min-heap of [cost, vertex] for the shortest-path searches.
class Heap {
  a = [];
  get size() { return this.a.length; }
  push(x) {
    const a = this.a;
    a.push(x);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// --- shortest paths: from any on-ramp in A to any in B, so the route uses
// whichever freeways through the two places make the simplest drive ---
function route(sources, targets) {
  const d = new Float64Array(V.length).fill(Infinity);
  const prev = new Int32Array(V.length).fill(-1);
  const heap = new Heap();
  for (const s of sources) { d[s] = 0; heap.push([0, s]); }
  const goal = new Set(targets);
  let end = -1;
  while (heap.size) {
    const [du, u] = heap.pop();
    if (du > d[u]) continue;
    if (goal.has(u)) { end = u; break; }
    for (const [w, c] of adj[u]) if (du + c < d[w]) { d[w] = du + c; prev[w] = u; heap.push([d[w], w]); }
  }
  if (end < 0) return null;
  const path = [];
  for (let v = end; v !== -1; v = prev[v]) path.push(v);
  return path.reverse();
}

// Interchanges with a name locals use; the rest are "the 5/110 interchange".
const NAMED = {
  ELA: 'the East LA Interchange',
  FOUR_LEVEL: 'the Four Level',
  HOLLYWOOD_SPLIT: 'the Hollywood Split',
  KELLOGG: 'the Kellogg Interchange',
  I110_105: 'the Judge Harry Pregerson Interchange',
};
const junctionAt = (pt) => {
  const hit = Object.entries(JUNCTIONS).find(([, ll]) => dist(toXY(ll), pt) < 0.05);
  return hit && NAMED[hit[0]];
};

// Does the drive double back (get further from the destination by more
// than `slack` km than it has already been)? Locals don't drive those.
function doublesBack(path, goal, slack = 2.5) {
  let best = Infinity;
  for (const v of path) {
    const dd = dist(xy(v), goal);
    if (dd > best + slack) return true;
    best = Math.min(best, dd);
  }
  return false;
}

// Route vertices → blocks, one per freeway run.
function blocksOf(path) {
  const runs = [];
  for (const v of path) {
    const last = runs.at(-1);
    if (last && last.ref === V[v].ref) last.vs.push(v);
    else runs.push({ ref: V[v].ref, vs: [v] });
  }
  return runs.map((r) => ({ ref: r.ref, pts: r.vs.map(xy), km: r.vs.slice(1).reduce((s, v, i) => s + dist(xy(r.vs[i]), xy(v)), 0) }));
}

// Douglas–Peucker, so blocks ship light.
function simplify(pts, tol = 0.12) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts.at(-1)];
  let idx = 0, md = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const L = dist(a, b) || 1e-9;
    const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L;
    if (d > md) { md = d; idx = i; }
  }
  return md > tol ? simplify(pts.slice(0, idx + 1), tol).slice(0, -1).concat(simplify(pts.slice(idx), tol)) : [a, b];
}

// --- generate puzzles (seeded, so builds are reproducible) ---
let seed = 20261008;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const known = (id) => (PLACES[id]?.pop ?? 0) >= 25000;
const ends = [...ramps.keys()].filter(known);
const puzzles = [];
const seenPair = new Set();
const uses = new Map();
const cOf = (id) => centroid(placeRing.get(id));
const WANT = { short: 52, long: 38 }; // 2-leg drives; 3–4-leg drives
const count = { short: 0, long: 0 };
for (let tries = 0; tries < 40000 && (count.short < WANT.short || count.long < WANT.long); tries++) {
  const a = ends[Math.floor(rand() * ends.length)];
  const b = ends[Math.floor(rand() * ends.length)];
  if (a === b || seenPair.has([a, b].sort().join('|'))) continue;
  if ((uses.get(a) || 0) >= 3 || (uses.get(b) || 0) >= 3) continue;
  const straight = dist(cOf(a), cOf(b));
  if (straight < 12) continue;
  const path = route(ramps.get(a), ramps.get(b));
  if (!path) continue;
  const blocks = blocksOf(path);
  const kind = blocks.length >= 3 ? 'long' : 'short';
  if (count[kind] >= WANT[kind]) continue;
  const total = blocks.reduce((s, x) => s + x.km, 0);
  const refs = new Set(blocks.map((x) => x.ref));
  if (blocks.length < 2 || blocks.length > 4) continue;
  if (refs.size !== blocks.length) continue; // no 10 → 110 → 10 doglegs
  if (blocks.some((x) => x.km < 5)) continue; // no stub legs
  if (blocks.length >= 3 && straight < 16) continue; // no 3-freeway hops for a short trip
  if (total > 1.45 * straight) continue;
  if (doublesBack(path, cOf(b))) continue;
  count[kind]++;
  seenPair.add([a, b].sort().join('|'));
  uses.set(a, (uses.get(a) || 0) + 1);
  uses.set(b, (uses.get(b) || 0) + 1);
  const enc = (pts) => encodeRing(simplify(pts).map(toLL));
  // A few places each block runs through, spread along it (for hints).
  // The best-known places each leg runs through, in driving order (hints
  // label them on the map as they name them).
  const via = (pts) => {
    const seq = [];
    for (const p of pts) {
      const id = PLACE_IDS.find((q) => inside(p, placeRing.get(q)));
      if (id && !seq.includes(id) && id !== a && id !== b) seq.push(id);
    }
    const top = [...seq].sort((x, y) => (PLACES[y]?.pop ?? 0) - (PLACES[x]?.pop ?? 0)).slice(0, 2);
    return seq.filter((id) => top.includes(id));
  };
  puzzles.push({
    from: a,
    to: b,
    km: Math.round(total),
    blocks: blocks.map((x, k) => ({
      ref: x.ref,
      line: enc(x.pts),
      via: via(x.pts),
      // Where you switch onto this freeway: a name locals use, else "the 5/110 interchange".
      ...(k ? { at: junctionAt(x.pts[0]) || `the ${blocks[k - 1].ref}/${x.ref} interchange` } : {}),
    })),
  });
}
// Order: a few 2-leg drives to learn on, then alternate 2-leg and longer
// ones so it doesn't plateau.
{
  const short = puzzles.filter((p) => p.blocks.length === 2);
  const long = puzzles.filter((p) => p.blocks.length > 2).sort((p, q) => p.blocks.length - q.blocks.length);
  const ordered = short.splice(0, 10);
  while (short.length || long.length) {
    if (short.length) ordered.push(short.shift());
    if (long.length) ordered.push(long.shift());
  }
  puzzles.splice(0, puzzles.length, ...ordered);
}

const usedRefs = new Set(puzzles.flatMap((p) => p.blocks.map((x) => x.ref)));
const out = {
  source: 'Hand-traced schematic (scripts/freeway-routes.mjs): right neighborhoods and interchanges, not survey lines.',
  refs: Object.fromEntries(Object.entries(REFS).filter(([r]) => usedRefs.has(r))),
  // Every freeway, for the map's faint road network (unlabeled — the shields
  // are what you place).
  network: lines.map((l) => ({ ref: l.ref, line: encodeRing(l.pts.map(toLL)) })),
  puzzles,
};
writeFileSync('src/data/freeways.json', JSON.stringify(out));
const by = puzzles.reduce((m, p) => ((m[p.blocks.length] = (m[p.blocks.length] || 0) + 1), m), {});
console.log(`${lines.length} lines, ${V.length} vertices, ${interchanges} interchange links, ${ramps.size} places with a freeway`);
console.log(`${puzzles.length} puzzles by block count:`, by, `refs: ${[...usedRefs].join(' ')}`);
