// Processes the raw LA Times "Mapping L.A." neighborhood GeoJSON into a compact
// boundaries file the app ships: rounded coordinates + a precomputed centroid
// (used for "pin it on the map" distance scoring).
//
// Source: LA Times Mapping L.A. neighborhood boundaries (via LA GeoHub).
// Run: node scripts/build-boundaries.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { geoCentroid } from 'd3-geo';
import rewind from '@mapbox/geojson-rewind';

const RAW = 'la_hoods_raw.geojson';
const OUT = 'src/data/boundaries.json';
const PRECISION = 5; // ~1.1m at LA's latitude — plenty for a map game

const round = (n) => Number(n.toFixed(PRECISION));
const roundRing = (ring) => ring.map(([x, y]) => [round(x), round(y)]);

function roundGeometry(geom) {
  if (geom.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geom.coordinates.map(roundRing) };
  }
  if (geom.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geom.coordinates.map((poly) => poly.map(roundRing)),
    };
  }
  throw new Error(`Unsupported geometry: ${geom.type}`);
}

// Some source polygons (e.g. San Pedro's harbor rings) have reversed winding,
// which d3-geo's spherical math reads as "covers the whole globe" — breaking
// both rendering and geoContains hit-testing. d3-geo wants clockwise exterior
// rings, so rewind every polygon that way before processing.
const raw = rewind(JSON.parse(readFileSync(RAW, 'utf8')), true);

const features = raw.features
  .map((f) => {
    const [cx, cy] = geoCentroid(f);
    return {
      type: 'Feature',
      properties: {
        name: f.properties.name,
        centroid: [round(cx), round(cy)],
      },
      geometry: roundGeometry(f.geometry),
    };
  })
  .sort((a, b) => a.properties.name.localeCompare(b.properties.name));

const out = { type: 'FeatureCollection', features };

mkdirSync('src/data', { recursive: true });
writeFileSync(OUT, JSON.stringify(out));

const before = readFileSync(RAW).length;
const after = readFileSync(OUT).length;
console.log(`Wrote ${features.length} neighborhoods to ${OUT}`);
console.log(`Size: ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB`);
