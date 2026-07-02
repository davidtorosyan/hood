// Area + population for any node, aggregated over its leaf descendants. Area is
// computed from each leaf's boundary polygon (d3's spherical geoArea); population
// comes from the hand-authored per-leaf figures. Both roll up the hierarchy, so a
// group/region/county reports the sum of everything under it.
import { geoArea } from 'd3-geo';
import { childrenOf, hasChildren, shapeOf } from './tree.js';
import { PLACES } from '../data/places.js';

const EARTH_R_MI = 3958.8; // mean Earth radius, miles

// Leaf descendants of `id` (or [id] itself if it's already a leaf).
function leavesOf(id) {
  return hasChildren(id) ? childrenOf(id).flatMap(leavesOf) : [id];
}

// Area (sq mi) of one leaf from its boundary. geoArea returns steradians; a small
// region can come back as the sphere's complement, so take the smaller. Cached.
const leafArea = new Map();
function areaOfLeaf(id) {
  if (leafArea.has(id)) return leafArea.get(id);
  let a = geoArea({ type: 'Polygon', coordinates: [shapeOf(id)] });
  a = Math.min(a, 4 * Math.PI - a);
  const mi2 = a * EARTH_R_MI * EARTH_R_MI;
  leafArea.set(id, mi2);
  return mi2;
}

// Aggregate { area (sq mi), pop } for a node, summed over its leaves. Cached.
const cache = new Map();
export function statsOf(id) {
  if (cache.has(id)) return cache.get(id);
  let area = 0;
  let pop = 0;
  for (const leaf of leavesOf(id)) {
    area += areaOfLeaf(leaf);
    pop += PLACES[leaf]?.pop || 0;
  }
  const s = { area, pop };
  cache.set(id, s);
  return s;
}

// Area number (no unit): a decimal for tiny places, a comma-grouped integer else.
export const fmtArea = (a) => (a < 10 ? a.toFixed(1) : Math.round(a).toLocaleString('en-US'));

// Compact population: 3.8M / 180k / 900.
export const fmtPeople = (p) =>
  p >= 1e6 ? (p / 1e6).toFixed(p >= 1e7 ? 0 : 1) + 'M' : p >= 1e3 ? Math.round(p / 1e3) + 'k' : `${p}`;
