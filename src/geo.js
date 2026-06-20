// Proximity helpers built on neighborhood centroids. Used to generate and check
// "which is closer to X?" questions — no map is ever shown.
import { geoDistance } from 'd3-geo';
import centroids from './data/centroids.json';

const EARTH_KM = 6371;

export function hasCentroid(name) {
  return name in centroids;
}

// Great-circle km between two neighborhoods' centroids. Infinity if either is
// unknown (e.g. a `nearby` entry outside the City of LA, like Glendale).
export function distanceBetween(a, b) {
  const ca = centroids[a];
  const cb = centroids[b];
  if (!ca || !cb) return Infinity;
  return geoDistance(ca, cb) * EARTH_KM;
}
