// Read-only access to the generated puzzle tree: the nesting of nodes
// (LA regions → groups → neighborhoods), each node's simplified shape, and which
// sibling pieces truly border each other. All three artifacts are produced by
// scripts/build-puzzle-shapes.mjs from src/data/regions.js.
import hierarchy from '../data/hierarchy.json';
import shapes from '../data/puzzle-shapes.json';
import adjacency from '../data/puzzle-adjacency.json';

export const NODES = hierarchy.nodes;
export const ROOT = hierarchy.root;

export const labelOf = (id) => NODES[id].label;
export const childrenOf = (id) => NODES[id].children || [];
export const hasChildren = (id) => childrenOf(id).length > 0;
export const shapeOf = (id) => shapes[id];

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
