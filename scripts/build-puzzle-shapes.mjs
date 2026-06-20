// Builds the geometry the Jigsaw mode ships:
//   src/data/puzzle-shapes.json    — simplified polygon per piece
//   src/data/puzzle-adjacency.json — which pieces truly border each other
//
// Neighborhood pieces come straight from boundaries.json. Region pieces (the
// "LA regions" puzzle) are the union of each region's neighborhoods (see
// src/data/regions.js). Only pieces used by a puzzle are shipped, lightly
// simplified, so the look stays clean and the bundle stays small.
//
// Run: node scripts/build-puzzle-shapes.mjs   (after editing puzzles/regions)
import { readFileSync, writeFileSync } from 'node:fs';
import simplify from '@turf/simplify';
import union from '@turf/union';
import booleanIntersects from '@turf/boolean-intersects';
import { featureCollection } from '@turf/helpers';
import rewind from '@mapbox/geojson-rewind';
import { PUZZLES } from '../src/data/puzzles.js';
import { REGION_GROUPS } from '../src/data/regions.js';

const boundaries = JSON.parse(readFileSync('src/data/boundaries.json', 'utf8'));
const byName = new Map(boundaries.features.map((f) => [f.properties.name, f]));

const TOLERANCE = 0.0006; // degrees (~60m) — stylized but still recognizable
const PRECISION = 5;
const round = (n) => Number(n.toFixed(PRECISION));

// Keep only the largest ring of a polygon/multipolygon — pieces read better as a
// single clean shape than as a neighborhood plus its slivers/islands.
function largestRingGeometry(geom) {
  let rings;
  if (geom.type === 'Polygon') rings = [geom.coordinates[0]];
  else rings = geom.coordinates.map((poly) => poly[0]);
  const area = (ring) => Math.abs(ring.reduce((s, [x, y], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length];
    return s + (x * y2 - x2 * y);
  }, 0)) / 2;
  const biggest = rings.sort((a, b) => area(b) - area(a))[0];
  return { type: 'Polygon', coordinates: [biggest] };
}

// Union all of a region's neighborhoods into one Feature.
function unionRegion(region) {
  const feats = REGION_GROUPS[region].map((n) => {
    const f = byName.get(n);
    if (!f) throw new Error(`Region ${region} references unknown neighborhood: ${n}`);
    return f;
  });
  let u = feats[0];
  for (let i = 1; i < feats.length; i++) {
    u = union(featureCollection([u, feats[i]]));
  }
  return u;
}

// polys: name -> Feature (un-simplified, exact borders) used for adjacency.
// shapes: name -> simplified ring (rendered geometry).
const polys = {};
const shapes = {};

function addPiece(name, feature) {
  polys[name] = feature;
  const single = { type: 'Feature', properties: {}, geometry: structuredClone(largestRingGeometry(feature.geometry)) };
  // Force clockwise exterior rings — d3-geo's spherical math reads CCW rings
  // (what turf's union emits) as "covers the whole globe", which collapses the
  // projection. Matches the winding used in build-boundaries.mjs.
  rewind(single, true);
  const simplified = simplify(single, { tolerance: TOLERANCE, highQuality: true, mutate: true });
  shapes[name] = simplified.geometry.coordinates[0].map(([x, y]) => [round(x), round(y)]);
}

for (const puzzle of PUZZLES) {
  for (const member of puzzle.members) {
    if (shapes[member]) continue;
    addPiece(member, puzzle.regionPuzzle ? unionRegion(member) : byName.get(member));
  }
}

// Adjacency: two pieces are adjacent if their polygons touch. Only computed for
// pairs that share a puzzle.
const adjacency = Object.fromEntries(Object.keys(shapes).map((n) => [n, []]));
for (const puzzle of PUZZLES) {
  const m = puzzle.members;
  for (let i = 0; i < m.length; i++) {
    for (let j = i + 1; j < m.length; j++) {
      if (booleanIntersects(polys[m[i]], polys[m[j]])) {
        adjacency[m[i]].push(m[j]);
        adjacency[m[j]].push(m[i]);
      }
    }
  }
}
// De-dupe (a pair could appear via more than one puzzle).
for (const k of Object.keys(adjacency)) adjacency[k] = [...new Set(adjacency[k])];

writeFileSync('src/data/puzzle-shapes.json', JSON.stringify(shapes));
writeFileSync('src/data/puzzle-adjacency.json', JSON.stringify(adjacency));
const pts = Object.values(shapes).reduce((s, r) => s + r.length, 0);
console.log(`Wrote ${Object.keys(shapes).length} pieces (${pts} pts) to puzzle-shapes.json`);
console.log(`Size: ${(readFileSync('src/data/puzzle-shapes.json').length / 1024).toFixed(1)}KB`);
console.log('\nAdjacency by puzzle:');
for (const p of PUZZLES) {
  // Flag any member with no in-puzzle neighbors — that piece couldn't attach.
  const isolated = p.members.filter((m) => !p.members.some((o) => o !== m && adjacency[m].includes(o)));
  console.log(`  ${p.title}${isolated.length ? `  ⚠ ISOLATED: ${isolated.join(', ')}` : ''}`);
  for (const m of p.members) console.log(`    ${m} → ${adjacency[m].filter((x) => p.members.includes(x)).join(', ') || '(none)'}`);
}
