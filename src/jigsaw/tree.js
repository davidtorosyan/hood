// Read-only access to the generated puzzle tree: the nesting of nodes
// (LA regions → groups → neighborhoods), each node's simplified shape, and which
// sibling pieces truly border each other. All three artifacts are produced by
// scripts/build-puzzle-shapes.mjs from src/data/regions.js.
import hierarchy from '../data/hierarchy.json';
import shapes from '../data/puzzle-shapes.json';
import adjacency from '../data/puzzle-adjacency.json';

export const NODES = hierarchy.nodes;
export const ROOT = hierarchy.root;

export const node = (id) => NODES[id];
export const labelOf = (id) => NODES[id].label;
export const parentOf = (id) => NODES[id].parent;
export const childrenOf = (id) => NODES[id].children || [];
export const hasChildren = (id) => childrenOf(id).length > 0;
export const shapeOf = (id) => shapes[id];

// True iff pieces a and b share a real border (so they're allowed to snap).
export const isAdjacent = (a, b) => adjacency[a]?.includes(b) ?? false;

// The chain of ids from the root down to (and including) `id` — for breadcrumbs
// and for working out which child to zoom out from when jumping up levels.
export function pathIds(id) {
  const out = [];
  for (let cur = id; cur; cur = NODES[cur].parent) out.unshift(cur);
  return out;
}
