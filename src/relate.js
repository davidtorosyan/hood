// Relationship logic shared by the modes: how close is one neighborhood to
// another, and how to phrase regions. This is where partial credit lives.
import { BY_NAME } from './data/neighborhoods.js';
import { distanceBetween } from './geo.js';

const ADJACENT_KM = 4.5;

// Treats two neighborhoods as adjacent if either lists the other as nearby, or
// their centroids are close. Handles `nearby` entries outside our card set too.
export function areAdjacent(a, b) {
  const A = BY_NAME[a];
  const B = BY_NAME[b];
  if (A?.nearby.includes(b) || B?.nearby.includes(a)) return true;
  return distanceBetween(a, b) < ADJACENT_KM;
}

// Graded closeness of a guess to the answer — the heart of "partial credit".
export function closeness(guess, answer) {
  if (guess === answer) return { level: 'exact', label: 'Exact!' };
  const g = BY_NAME[guess];
  const a = BY_NAME[answer];
  if (g && a) {
    if (areAdjacent(guess, answer)) return { level: 'adjacent', label: 'Right next door' };
    if (g.cluster === a.cluster) return { level: 'cluster', label: 'Same cluster' };
    if (g.region === a.region) return { level: 'region', label: 'Right region' };
  }
  return { level: 'far', label: 'Not close' };
}

// Short adjective phrase for a region, for prompts like "Which is more Valley?"
export function regionPhrase(region) {
  return (
    {
      'San Fernando Valley': 'Valley',
      'Northeast LA': 'Northeast LA',
      'Central LA': 'Central',
      'South LA': 'South LA',
    }[region] ?? region
  );
}
