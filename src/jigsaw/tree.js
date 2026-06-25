// Read-only access to the generated puzzle tree: the nesting of nodes
// (LA regions → groups → neighborhoods), each node's simplified shape, and which
// sibling pieces truly border each other. All three artifacts are produced by
// scripts/build-puzzle-shapes.mjs from src/data/regions.js.
import hierarchy from '../data/hierarchy.json';
import shapes from '../data/puzzle-shapes.json';
import shapesSimple from '../data/puzzle-shapes-simple.json';
import adjacency from '../data/puzzle-adjacency.json';

export const NODES = hierarchy.nodes;
export const ROOT = hierarchy.root;

export const node = (id) => NODES[id];
export const labelOf = (id) => NODES[id].label;
export const parentOf = (id) => NODES[id].parent;
export const childrenOf = (id) => NODES[id].children || [];
export const hasChildren = (id) => childrenOf(id).length > 0;
// `mode === 'simple'` swaps in the low-poly, topology-simplified geometry.
export const shapeOf = (id, mode) => (mode === 'simple' ? shapesSimple : shapes)[id];

// True iff pieces a and b share a real border (so they're allowed to snap).
export const isAdjacent = (a, b) => adjacency[a]?.includes(b) ?? false;

// The chain of ids from the root down to (and including) `id` — for breadcrumbs
// and for working out which child to zoom out from when jumping up levels.
export function pathIds(id) {
  const out = [];
  for (let cur = id; cur; cur = NODES[cur].parent) out.unshift(cur);
  return out;
}

// The top-level region that contains `id` (for search: jumping to a place lands
// you in its region). For a region it's the region itself; path is [la, region…].
export const topRegionOf = (id) => pathIds(id)[1] ?? id;

// Flat index of everything searchable: regions, groups, and individual places.
// `kind` distinguishes them; `regionId/regionLabel` is the jump target + subtitle.
// (Nodes are keyed by id in the hierarchy — the key IS the id; there's no id field.)
export const SEARCH_ITEMS = Object.entries(NODES)
  .filter(([id]) => id !== ROOT)
  .map(([id, n]) => {
    const regionId = topRegionOf(id);
    return {
      id,
      label: n.label,
      kind: n.parent === ROOT ? 'region' : (n.children?.length ? 'group' : 'place'),
      regionId,
      regionLabel: NODES[regionId].label,
    };
  });
