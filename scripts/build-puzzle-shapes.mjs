// Extracts and simplifies the polygons used by the Jigsaw mode into a small
// runtime file (src/data/puzzle-shapes.json). We only ship shapes for
// neighborhoods that actually appear in a puzzle, lightly simplified, so the
// "stylized jigsaw piece" look stays clean and the bundle stays small.
//
// Run: node scripts/build-puzzle-shapes.mjs   (after editing src/data/puzzles.js)
import { readFileSync, writeFileSync } from 'node:fs';
import simplify from '@turf/simplify';
import { PUZZLES } from '../src/data/puzzles.js';

const boundaries = JSON.parse(readFileSync('src/data/boundaries.json', 'utf8'));
const byName = new Map(boundaries.features.map((f) => [f.properties.name, f]));

const TOLERANCE = 0.0006; // degrees (~60m) — stylized but still recognizable
const PRECISION = 5;
const round = (n) => Number(n.toFixed(PRECISION));

// Keep only the largest ring of each polygon — jigsaw pieces read better as a
// single clean shape than as a neighborhood plus its slivers/islands.
function largestRingGeometry(geom) {
  let rings;
  if (geom.type === 'Polygon') rings = [geom.coordinates[0]];
  else rings = geom.coordinates.map((poly) => poly[0]); // outer ring of each part
  const area = (ring) => Math.abs(ring.reduce((s, [x, y], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length];
    return s + (x * y2 - x2 * y);
  }, 0)) / 2;
  const biggest = rings.sort((a, b) => area(b) - area(a))[0];
  return { type: 'Polygon', coordinates: [biggest] };
}

const names = [...new Set(PUZZLES.flatMap((p) => p.members))];
const shapes = {};

for (const name of names) {
  const feature = byName.get(name);
  if (!feature) throw new Error(`Puzzle neighborhood not in boundaries: ${name}`);
  const single = { type: 'Feature', properties: {}, geometry: largestRingGeometry(feature.geometry) };
  const simplified = simplify(single, { tolerance: TOLERANCE, highQuality: true, mutate: true });
  const ring = simplified.geometry.coordinates[0].map(([x, y]) => [round(x), round(y)]);
  shapes[name] = ring;
}

writeFileSync('src/data/puzzle-shapes.json', JSON.stringify(shapes));
const pts = Object.values(shapes).reduce((s, r) => s + r.length, 0);
console.log(`Wrote ${names.length} puzzle shapes (${pts} total points) to src/data/puzzle-shapes.json`);
console.log(`Size: ${(readFileSync('src/data/puzzle-shapes.json').length / 1024).toFixed(1)}KB`);
