// Read-only access to the generated puzzle tree: the nesting of nodes
// (LA regions → groups → neighborhoods), each node's simplified shape, and which
// sibling pieces truly border each other. All three artifacts are produced by
// scripts/build-puzzle-shapes.mjs from src/data/regions.js.
import hierarchy from '../data/hierarchy.json';
import shapes from '../data/puzzle-shapes.json';
import adjacency from '../data/puzzle-adjacency.json';
import neighbors from '../data/neighbors.json';
import { decodeRing } from './polyline.js';

export const NODES = hierarchy.nodes;
export const ROOT = hierarchy.root;

export const labelOf = (id) => NODES[id].label;
export const childrenOf = (id) => NODES[id].children || [];
export const hasChildren = (id) => childrenOf(id).length > 0;
// Shapes ship as encoded polylines; decode each once, on first use.
const decoded = new Map();
export const shapeOf = (id) => {
  if (!decoded.has(id)) decoded.set(id, decodeRing(shapes[id]));
  return decoded.get(id);
};

// The sibling pieces that share a real border with `id` (so they can connect).
export const adjacentIds = (id) => adjacency[id] || [];

// The chain of ids from the root down to (and including) `id` — for breadcrumbs
// and for working out which child to zoom out from when jumping up levels.
export function pathIds(id) {
  const out = [];
  for (let cur = id; cur; cur = NODES[cur].parent) out.unshift(cur);
  return out;
}

// Flat index of everything searchable: regions, groups, and individual places.
// (Nodes are keyed by id in the hierarchy — the key IS the id; there's no id field.)
// `within` is the chain of containing areas below the county, innermost first
// ("Pasadena area · San Gabriel Valley").
export const SEARCH_ITEMS = Object.entries(NODES)
  .filter(([id]) => id !== ROOT)
  .map(([id, n]) => ({
    id,
    label: n.label,
    kind: n.parent === ROOT ? 'region' : n.children?.length ? 'group' : 'place',
    within: pathIds(id).slice(1, -1).reverse().map(labelOf).join(' · '),
  }));

// The places (leaves) inside `id` — itself if it's a place. Cached.
const leafCache = new Map();
export function leavesOf(id) {
  if (!leafCache.has(id)) leafCache.set(id, hasChildren(id) ? childrenOf(id).flatMap(leavesOf) : [id]);
  return leafCache.get(id);
}

// The areas AROUND `id` at its own level of the tree, across group lines: every
// node at the same depth with a place that borders one of `id`'s places. Shown as
// faint context around a zoomed-in map, so you can see where you are. Cached.
const contextCache = new Map();
export function contextOf(id) {
  if (!contextCache.has(id)) {
    const depth = pathIds(id).length;
    const near = new Set(leavesOf(id).flatMap((l) => neighbors[l] || []));
    const out = Object.keys(NODES).filter(
      (o) => o !== id && o !== ROOT && pathIds(o).length === depth && leavesOf(o).some((l) => near.has(l)),
    );
    contextCache.set(id, out.filter((o) => !leavesOf(id).includes(o)));
  }
  return contextCache.get(id);
}
