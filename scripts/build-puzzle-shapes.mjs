// Builds the zoomable jigsaw hierarchy + geometry the app ships:
//   src/data/hierarchy.json       — the tree of nodes (regions → groups → hoods)
//   src/data/puzzle-shapes.json    — simplified polygon for every node
//   src/data/puzzle-adjacency.json — which sibling pieces border each other
//
// Every node holds at most CAP children. A region with more neighborhoods than
// that is split into contiguous, capped sub-groups (recursively) until the leaves
// are individual neighborhoods. A node's shape is the union of its descendant
// neighborhoods, so children always tile their parent exactly.
//
// Run: node scripts/build-puzzle-shapes.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import simplify from '@turf/simplify';
import union from '@turf/union';
import booleanIntersects from '@turf/boolean-intersects';
import { featureCollection } from '@turf/helpers';
import rewind from '@mapbox/geojson-rewind';
import { REGION_GROUPS } from '../src/data/regions.js';

const CAP = 6; // hard cap on pieces per puzzle
const TOLERANCE = 0.0006;
const PRECISION = 5;
const round = (n) => Number(n.toFixed(PRECISION));

const boundaries = JSON.parse(readFileSync('src/data/boundaries.json', 'utf8'));
const centroids = JSON.parse(readFileSync('src/data/centroids.json', 'utf8'));
const byName = new Map(boundaries.features.map((f) => [f.properties.name, f]));
const names = Object.values(REGION_GROUPS).flat();

function largestRingGeometry(geom) {
  const rings = geom.type === 'Polygon' ? [geom.coordinates[0]] : geom.coordinates.map((p) => p[0]);
  const area = (ring) =>
    Math.abs(ring.reduce((s, [x, y], i) => {
      const [x2, y2] = ring[(i + 1) % ring.length];
      return s + (x * y2 - x2 * y);
    }, 0)) / 2;
  return { type: 'Polygon', coordinates: [rings.sort((a, b) => area(b) - area(a))[0]] };
}

const polyCache = new Map();
const poly = (name) => {
  if (!polyCache.has(name)) {
    polyCache.set(name, { type: 'Feature', properties: {}, geometry: largestRingGeometry(byName.get(name).geometry) });
  }
  return polyCache.get(name);
};
const ringOf = (name) => poly(name).geometry.coordinates[0];
const ringArea = (ring) =>
  Math.abs(ring.reduce((s, [x, y], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length];
    return s + (x * y2 - x2 * y);
  }, 0)) / 2;
const bboxOf = (name) => {
  const xs = ringOf(name).map((p) => p[0]);
  const ys = ringOf(name).map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const dist = (a, b) => Math.hypot(centroids[a][0] - centroids[b][0], centroids[a][1] - centroids[b][1]);

// --- neighbourhood adjacency (shared borders) ------------------------------
const bb = Object.fromEntries(names.map((n) => [n, bboxOf(n)]));
const overlap = (a, b) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
const adj = Object.fromEntries(names.map((n) => [n, new Set()]));
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const a = names[i];
    const b = names[j];
    if (overlap(bb[a], bb[b]) && booleanIntersects(poly(a), poly(b))) {
      adj[a].add(b);
      adj[b].add(a);
    }
  }
}

// --- connected, balanced partition of a member set into k groups -----------
function farthestFirst(members, k) {
  const chosen = [[...members].sort((a, b) => centroids[a][0] - centroids[b][0])[0]];
  while (chosen.length < k) {
    let best = null;
    let bd = -1;
    for (const m of members) {
      if (chosen.includes(m)) continue;
      const d = Math.min(...chosen.map((c) => dist(m, c)));
      if (d > bd) {
        bd = d;
        best = m;
      }
    }
    chosen.push(best);
  }
  return chosen;
}

function partition(members, k) {
  const seeds = farthestFirst(members, k);
  const assign = new Map();
  const groups = seeds.map((s, i) => {
    assign.set(s, i);
    return [s];
  });
  // Grow groups one neighbour at a time along real borders (round-robin keeps
  // them roughly balanced). No size cap here — a connected group is mandatory
  // (you must be able to attach every piece); over-cap groups are split again
  // one level down. The region graph is connected, so nothing is left over.
  let progress = true;
  while (assign.size < members.length && progress) {
    progress = false;
    for (let i = 0; i < k; i++) {
      let best = null;
      let bd = Infinity;
      for (const n of members) {
        if (assign.has(n)) continue;
        if (groups[i].some((m) => adj[m].has(n))) {
          const d = dist(n, seeds[i]);
          if (d < bd) {
            bd = d;
            best = n;
          }
        }
      }
      if (best != null) {
        assign.set(best, i);
        groups[i].push(best);
        progress = true;
      }
    }
  }
  // Any straggler (only if the set were disconnected) → an adjacent group.
  for (const n of members) {
    if (assign.has(n)) continue;
    let bi = groups.findIndex((g) => g.some((m) => adj[m].has(n)));
    if (bi < 0) {
      let bd = Infinity;
      groups.forEach((g, i) => { const d = dist(n, seeds[i]); if (d < bd) { bd = d; bi = i; } });
    }
    groups[bi].push(n);
    assign.set(n, bi);
  }
  return groups;
}

// --- build the tree --------------------------------------------------------
const nodes = {};
const nodeHoods = new Map(); // id -> [neighborhood names]

function build(id, label, parent, members, used = new Set()) {
  const node = { id, label, parent, children: [] };
  nodes[id] = node;
  nodeHoods.set(id, members);
  if (members.length <= CAP) {
    for (const name of members) {
      nodes[name] = { id: name, label: name, parent: id, leaf: true };
      nodeHoods.set(name, [name]);
      node.children.push(name);
    }
  } else {
    const k = Math.min(CAP, Math.ceil(members.length / CAP));
    for (const g of partition(members, k)) {
      const sorted = [...g].sort((a, b) => ringArea(ringOf(b)) - ringArea(ringOf(a)));
      const anchor = sorted.find((n) => !used.has(n)) || sorted[0];
      // A group is named for its most prominent neighborhood, but suffixed so it
      // never reads as one of the neighborhoods it contains (which is confusing
      // — e.g. a "Glassell Park" group holding the Glassell Park hood).
      const gid = `${id} › ${anchor}`;
      build(gid, `${anchor} area`, id, g, new Set([...used, anchor]));
      node.children.push(gid);
    }
  }
}

const TOP_REGIONS = Object.keys(REGION_GROUPS);

nodes.la = { id: 'la', label: 'LA County', parent: null, children: [] };
nodeHoods.set('la', TOP_REGIONS.flatMap((r) => REGION_GROUPS[r]));
for (const region of TOP_REGIONS) {
  build(region, region, 'la', REGION_GROUPS[region]);
  nodes.la.children.push(region);
}

// --- shapes (union of each node's neighborhoods) ---------------------------
function unionHoods(hoods) {
  let u = poly(hoods[0]);
  for (let i = 1; i < hoods.length; i++) u = union(featureCollection([u, poly(hoods[i])]));
  return u;
}
const shapes = {};
for (const id of Object.keys(nodes)) {
  if (id === 'la') continue;
  const feat = unionHoods(nodeHoods.get(id));
  const single = { type: 'Feature', properties: {}, geometry: structuredClone(largestRingGeometry(feat.geometry)) };
  rewind(single, true);
  const s = simplify(single, { tolerance: TOLERANCE, highQuality: true, mutate: true });
  shapes[id] = s.geometry.coordinates[0].map(([x, y]) => [round(x), round(y)]);
}

// --- sibling adjacency -----------------------------------------------------
const adjacency = {};
for (const id of Object.keys(nodes)) if (id !== 'la') adjacency[id] = [];
const touch = (a, b) => nodeHoods.get(a).some((x) => nodeHoods.get(b).some((y) => adj[x].has(y) || x === y));
for (const node of Object.values(nodes)) {
  const kids = node.children || [];
  for (let i = 0; i < kids.length; i++) {
    for (let j = i + 1; j < kids.length; j++) {
      if (touch(kids[i], kids[j])) {
        adjacency[kids[i]].push(kids[j]);
        adjacency[kids[j]].push(kids[i]);
      }
    }
  }
}

// --- write -----------------------------------------------------------------
const hierarchy = {
  root: 'la',
  nodes: Object.fromEntries(
    Object.values(nodes).map((n) => [n.id, { label: n.label, parent: n.parent, children: n.children, leaf: !!n.leaf }]),
  ),
};
writeFileSync('src/data/hierarchy.json', JSON.stringify(hierarchy));
writeFileSync('src/data/puzzle-shapes.json', JSON.stringify(shapes));
writeFileSync('src/data/puzzle-adjacency.json', JSON.stringify(adjacency));

// --- report ----------------------------------------------------------------
console.log(`Nodes: ${Object.keys(nodes).length} | shapes: ${Object.keys(shapes).length}`);
console.log(`Shapes size: ${(readFileSync('src/data/puzzle-shapes.json').length / 1024).toFixed(1)}KB\n`);
function show(id, depth) {
  const n = nodes[id];
  const kids = n.children || [];
  const isolated = kids.filter((k) => kids.length > 1 && !kids.some((o) => o !== k && adjacency[k].includes(o)));
  const over = kids.length > CAP ? '  ⚠ OVER CAP' : '';
  console.log(`${'  '.repeat(depth)}${n.label} (${kids.length})${over}${isolated.length ? `  ⚠ isolated: ${isolated.join(', ')}` : ''}`);
  for (const k of kids) if (!nodes[k].leaf) show(k, depth + 1);
}
show('la', 0);
