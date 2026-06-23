// Builds the zoomable jigsaw hierarchy + geometry the app ships:
//   src/data/hierarchy.json       — the tree of nodes (regions → groups → hoods)
//   src/data/puzzle-shapes.json    — simplified polygon for every node
//   src/data/puzzle-adjacency.json — which sibling pieces border each other
//
// Every node holds at most CAP children. A region with more neighborhoods than
// that is split into contiguous, capped sub-groups (recursively) until the leaves
// are individual neighborhoods. A node's shape is the union of its descendant
// neighborhoods, so children always tile their parent exactly.
//
// Run: node scripts/build-puzzle-shapes.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import simplify from '@turf/simplify';
import union from '@turf/union';
import booleanIntersects from '@turf/boolean-intersects';
import { featureCollection } from '@turf/helpers';
import rewind from '@mapbox/geojson-rewind';
import { REGION_GROUPS } from '../src/data/regions.js';
import { PLACES } from '../src/data/places.js';

// Every puzzle (a node you assemble) must have between MIN and MAX pieces.
const MIN = 3;
const MAX = 7;
const TOLERANCE = 0.0006;
const PRECISION = 5;
const round = (n) => Number(n.toFixed(PRECISION));

const boundaries = JSON.parse(readFileSync('src/data/boundaries.json', 'utf8'));
const centroids = JSON.parse(readFileSync('src/data/centroids.json', 'utf8'));
const byName = new Map(boundaries.features.map((f) => [f.properties.name, f]));
const names = Object.values(REGION_GROUPS).flat();

function largestRingGeometry(geom) {
  const rings = geom.type === 'Polygon' ? [geom.coordinates[0]] : geom.coordinates.map((p) => p[0]);
  const area = (ring) =>
    Math.abs(ring.reduce((s, [x, y], i) => {
      const [x2, y2] = ring[(i + 1) % ring.length];
      return s + (x * y2 - x2 * y);
    }, 0)) / 2;
  return { type: 'Polygon', coordinates: [rings.sort((a, b) => area(b) - area(a))[0]] };
}

const polyCache = new Map();
const poly = (name) => {
  if (!polyCache.has(name)) {
    polyCache.set(name, { type: 'Feature', properties: {}, geometry: largestRingGeometry(byName.get(name).geometry) });
  }
  return polyCache.get(name);
};
const ringOf = (name) => poly(name).geometry.coordinates[0];
const ringArea = (ring) =>
  Math.abs(ring.reduce((s, [x, y], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length];
    return s + (x * y2 - x2 * y);
  }, 0)) / 2;
const bboxOf = (name) => {
  const xs = ringOf(name).map((p) => p[0]);
  const ys = ringOf(name).map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const dist = (a, b) => Math.hypot(centroids[a][0] - centroids[b][0], centroids[a][1] - centroids[b][1]);

// --- neighbourhood adjacency (shared borders) ------------------------------
const bb = Object.fromEntries(names.map((n) => [n, bboxOf(n)]));
const overlap = (a, b) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
const adj = Object.fromEntries(names.map((n) => [n, new Set()]));
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const a = names[i];
    const b = names[j];
    if (overlap(bb[a], bb[b]) && booleanIntersects(poly(a), poly(b))) {
      adj[a].add(b);
      adj[b].add(a);
    }
  }
}

// --- connected, balanced partition of a member set into k groups -----------
function farthestFirst(members, k) {
  const chosen = [[...members].sort((a, b) => centroids[a][0] - centroids[b][0])[0]];
  while (chosen.length < k) {
    let best = null;
    let bd = -1;
    for (const m of members) {
      if (chosen.includes(m)) continue;
      const d = Math.min(...chosen.map((c) => dist(m, c)));
      if (d > bd) {
        bd = d;
        best = m;
      }
    }
    chosen.push(best);
  }
  return chosen;
}

// How many child pieces (k, in [MIN,MAX]) to split M areas into. Requires every
// resulting group size to be a valid puzzle size — in [MIN,MAX] (a leaf puzzle)
// or >= MIN+MAX+2 = 9 (recurses further) — i.e. never 1, 2, or 8 (sizes that
// can't form a valid sub-tree). Prefers splits whose children are leaf-puzzles
// (shallower) and well balanced.
function chooseK(M) {
  const cands = [];
  for (let k = MIN; k <= Math.min(MAX, M); k++) {
    const lo = Math.floor(M / k);
    const hi = Math.ceil(M / k);
    const ok = [lo, hi].every((s) => (s >= MIN && s <= MAX) || s >= 9);
    if (ok) cands.push({ k, spread: hi - lo, leafable: hi <= MAX ? 0 : 1 });
  }
  if (!cands.length) return MIN; // unreachable for M>=9 (M=8 never reaches here)
  // Prefer shallower (leaf-able) splits, then fuller puzzles (~6 pieces, so a
  // big region doesn't open into just 3 big chunks), then well balanced.
  cands.sort((a, b) => a.leafable - b.leafable || Math.abs(a.k - 6) - Math.abs(b.k - 6) || a.spread - b.spread);
  return cands[0].k;
}

// Partition members into k CONNECTED, balanced groups: seed with farthest-first
// points, then repeatedly grow the smallest group that can still reach an
// unassigned neighbour. Growing the smallest keeps sizes within ±1, so they land
// in chooseK's valid band (no stray 1/2/8-piece groups).
function partition(members, k) {
  const pool = new Set(members);
  const seeds = farthestFirst(members, k);
  const groups = seeds.map((s) => [s]);
  const assigned = new Set(seeds);

  while (assigned.size < members.length) {
    let pick = -1;
    let pickMember = null;
    let pickSize = Infinity;
    let pickDist = Infinity;
    for (let i = 0; i < k; i++) {
      let bestM = null;
      let bestD = Infinity;
      for (const m of groups[i]) {
        for (const nb of adj[m]) {
          if (assigned.has(nb) || !pool.has(nb)) continue;
          const d = dist(nb, seeds[i]);
          if (d < bestD) { bestD = d; bestM = nb; }
        }
      }
      if (bestM == null) continue;
      if (groups[i].length < pickSize || (groups[i].length === pickSize && bestD < pickDist)) {
        pick = i; pickMember = bestM; pickSize = groups[i].length; pickDist = bestD;
      }
    }
    if (pick < 0) break; // remaining members are disconnected from every group
    groups[pick].push(pickMember);
    assigned.add(pickMember);
  }
  // Stragglers (only if the set were disconnected): drop into an adjacent group.
  for (const m of members) {
    if (assigned.has(m)) continue;
    let bi = groups.findIndex((g) => g.some((x) => adj[x].has(m)));
    if (bi < 0) {
      let bd = Infinity;
      groups.forEach((g, i) => { const d = dist(m, seeds[i]); if (d < bd) { bd = d; bi = i; } });
    }
    groups[bi].push(m);
    assigned.add(m);
  }
  // Seed-growth can starve a cornered group (size 2) while another balloons
  // (size 8). Rebalance so every group lands in [lo, hi] — moving boundary
  // members between adjacent groups, never disconnecting the donor.
  rebalance(groups, Math.floor(members.length / k), Math.ceil(members.length / k));
  return groups;
}

// Is `group` still one connected piece if `drop` is removed from it?
function stillConnected(group, drop) {
  const set = new Set(group);
  set.delete(drop);
  if (set.size <= 1) return true;
  const [start] = set;
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const x = stack.pop();
    for (const nb of adj[x]) if (set.has(nb) && !seen.has(nb)) { seen.add(nb); stack.push(nb); }
  }
  return seen.size === set.size;
}

function rebalance(groups, lo, hi) {
  const indexOf = new Map();
  groups.forEach((g, i) => g.forEach((m) => indexOf.set(m, i)));
  const move = (m, from, to) => {
    groups[from].splice(groups[from].indexOf(m), 1);
    groups[to].push(m);
    indexOf.set(m, to);
  };
  for (let guard = 0; guard < 2000; guard++) {
    let changed = false;
    for (let i = 0; i < groups.length; i++) {
      // too small → pull a removable boundary member from a larger adjacent group
      if (groups[i].length < lo) {
        for (const m of groups[i]) {
          let take = null;
          let donor = -1;
          for (const nb of adj[m]) {
            const j = indexOf.get(nb);
            if (j === undefined || j === i || groups[j].length <= lo) continue;
            if (stillConnected(groups[j], nb)) { take = nb; donor = j; break; }
          }
          if (take != null) { move(take, donor, i); changed = true; break; }
        }
      }
      // too big → push a removable boundary member to a smaller adjacent group
      if (groups[i].length > hi) {
        for (const m of groups[i]) {
          let to = -1;
          for (const nb of adj[m]) {
            const j = indexOf.get(nb);
            if (j !== undefined && j !== i && groups[j].length < hi) { to = j; break; }
          }
          if (to >= 0 && stillConnected(groups[i], m)) { move(m, i, to); changed = true; break; }
        }
      }
    }
    if (!changed) break;
  }
}

// --- naming -----------------------------------------------------------------
const TOP_REGIONS = Object.keys(REGION_GROUPS);
const RESERVED = new Set(TOP_REGIONS); // never name a group after a region
const usedLabels = new Set();
// Prominence for picking a group's name: by population (recognizable), then by
// geographic size as a tiebreaker.
const prominence = (name) => [PLACES[name]?.pop ?? 0, ringArea(ringOf(name))];
const moreProminent = (a, b) => {
  const [pa, ra] = prominence(a);
  const [pb, rb] = prominence(b);
  return pb - pa || rb - ra;
};

// Hand-authored, evocative names for every generated group, keyed by the exact
// set of areas it contains (stable regardless of the auto-label). If the
// partition ever changes, build:shapes warns about any group not covered here so
// it can be renamed. `{ name: [areas...] }` for readability; inverted below.
const GROUP_NAMES = {
  // --- San Gabriel Valley (first zoom) ---
  'Glendale & Northeast L.A.': ['Atwater Village', 'Cypress Park', 'Eagle Rock', 'Elysian Valley', 'Glassell Park', 'Glendale', 'Highland Park', 'La Cañada Flintridge', 'La Crescenta-Montrose', 'Lincoln Heights', 'Mount Washington'],
  'The Foothill Cities': ['Arcadia', 'East Pasadena', 'East San Gabriel', 'Irwindale', 'Mayflower Village', 'Monrovia', 'North El Monte', 'San Marino', 'San Pasqual', 'Sierra Madre', 'Temple City'],
  'The East Foothills': ['Azusa', 'Bradbury', 'Charter Oak', 'Citrus', 'Covina', 'Duarte', 'Glendora', 'Ramona', 'San Dimas', 'West San Dimas'],
  'Pasadena & the Eastside': ['Alhambra', 'Altadena', 'Boyle Heights', 'East Los Angeles', 'El Sereno', 'Montecito Heights', 'Monterey Park', 'Pasadena', 'San Gabriel', 'South Pasadena', 'South San Gabriel'],
  'The Puente Valley': ['Baldwin Park', 'El Monte', 'La Puente', 'Rosemead', 'South El Monte', 'South San Jose Hills', 'Valinda', 'West Covina', 'West Puente Valley', 'Whittier Narrows'],
  'The Pomona Valley': ['Avocado Heights', 'Claremont', 'Diamond Bar', 'Hacienda Heights', 'Industry', 'La Verne', 'Pomona', 'Rowland Heights', 'South Diamond Bar', 'Walnut'],
  // SGV deeper
  'The Verdugos': ['Glendale', 'La Cañada Flintridge', 'La Crescenta-Montrose'],
  'Eagle Rock & Atwater Village': ['Atwater Village', 'Eagle Rock', 'Elysian Valley', 'Glassell Park'],
  'Highland Park & Lincoln Heights': ['Cypress Park', 'Highland Park', 'Lincoln Heights', 'Mount Washington'],
  'Monrovia & Irwindale': ['Irwindale', 'Mayflower Village', 'Monrovia'],
  'Arcadia & Sierra Madre': ['Arcadia', 'East Pasadena', 'North El Monte', 'Sierra Madre'],
  'San Marino & Temple City': ['East San Gabriel', 'San Marino', 'San Pasqual', 'Temple City'],
  'Azusa & Duarte': ['Azusa', 'Bradbury', 'Duarte'],
  'Covina & Citrus': ['Citrus', 'Covina', 'Ramona'],
  'Glendora & San Dimas': ['Charter Oak', 'Glendora', 'San Dimas', 'West San Dimas'],
  'Alhambra & San Gabriel': ['Alhambra', 'Monterey Park', 'San Gabriel', 'South San Gabriel'],
  'Pasadena & Altadena': ['Altadena', 'Pasadena', 'South Pasadena'],
  'The Eastside': ['Boyle Heights', 'East Los Angeles', 'El Sereno', 'Montecito Heights'],
  'Baldwin Park & La Puente': ['Baldwin Park', 'La Puente', 'West Puente Valley'],
  'El Monte & Rosemead': ['El Monte', 'Rosemead', 'South El Monte', 'Whittier Narrows'],
  'West Covina & Valinda': ['South San Jose Hills', 'Valinda', 'West Covina'],
  'Pomona & Claremont': ['Claremont', 'La Verne', 'Pomona'],
  'Diamond Bar & Rowland Heights': ['Diamond Bar', 'Rowland Heights', 'South Diamond Bar'],
  'Hacienda Heights & Walnut': ['Avocado Heights', 'Hacienda Heights', 'Industry', 'Walnut'],
  // --- San Fernando Valley ---
  'The Northeast Valley': ['Burbank', 'Hansen Dam', 'Lake View Terrace', 'Shadow Hills', 'Sun Valley', 'Sunland', 'Tujunga'],
  'The Western Hills': ['Agoura Hills', 'Calabasas', 'Hidden Hills', 'Westlake Village'],
  'The Southeast Valley': ['North Hollywood', 'Sherman Oaks', 'Studio City', 'Toluca Lake', 'Universal City', 'Valley Glen', 'Valley Village'],
  'The North Valley': ['Arleta', 'Granada Hills', 'Mission Hills', 'North Hills', 'Pacoima', 'Panorama City', 'San Fernando', 'Sylmar'],
  'The Central Valley': ['Encino', 'Lake Balboa', 'Northridge', 'Reseda', 'Sepulveda Basin', 'Van Nuys', 'Winnetka'],
  'The West Valley': ['Canoga Park', 'Chatsworth', 'Chatsworth Reservoir', 'Porter Ranch', 'Tarzana', 'West Hills', 'Woodland Hills'],
  'Granada Hills & Mission Hills': ['Granada Hills', 'Mission Hills', 'North Hills'],
  'Pacoima & Panorama City': ['Arleta', 'Pacoima', 'Panorama City'],
  // --- Central L.A. ---
  'Downtown & Chinatown': ['Chinatown', 'Downtown', 'Elysian Park'],
  'Hollywood & Los Feliz': ['Griffith Park', 'Hollywood', 'Hollywood Hills', 'Los Feliz'],
  'Koreatown & Pico-Union': ['Koreatown', 'Larchmont', 'Pico-Union', 'Windsor Square'],
  'The Wilshire District': ['Carthay', 'Hancock Park', 'Mid-City', 'Mid-Wilshire'],
  'West Hollywood & Fairfax': ['Beverly Grove', 'Fairfax', 'Hollywood Hills West', 'West Hollywood'],
  'Echo Park & Silver Lake': ['East Hollywood', 'Echo Park', 'Silver Lake', 'Westlake'],
  // --- Westside & Coast ---
  'West L.A. & Brentwood': ['Bel-Air', 'Brentwood', 'Mar Vista', 'Sawtelle', 'Veterans Administration'],
  'Century City & Palms': ['Beverlywood', 'Century City', 'Cheviot Hills', 'Palms', 'Pico-Robertson'],
  'Santa Monica & the Coast': ['Culver City', 'Pacific Palisades', 'Santa Monica', 'Venice'],
  'Playa & the Marina': ['Del Rey', 'Marina del Rey', 'Playa Vista', 'Playa del Rey', 'Westchester'],
  'Westwood & Beverly Hills': ['Beverly Crest', 'Beverly Hills', 'Rancho Park', 'West Los Angeles', 'Westwood'],
  // --- South Bay & Harbor ---
  'Carson & Gardena': ['Carson', 'Gardena', 'Harbor Gateway', 'West Carson'],
  'Inglewood & Hawthorne': ['Alondra Park', 'Hawthorne', 'Inglewood', 'Lennox'],
  'El Segundo & Manhattan Beach': ['Del Aire', 'El Segundo', 'Manhattan Beach'],
  'The Palos Verdes Peninsula': ['Palos Verdes Estates', 'Rancho Palos Verdes', 'Rolling Hills', 'Rolling Hills Estates'],
  'The Harbor': ['Harbor City', 'Lomita', 'San Pedro', 'Wilmington'],
  'The Beach Cities': ['Hermosa Beach', 'Lawndale', 'Redondo Beach', 'Torrance'],
  // --- South L.A. ---
  'The Crenshaw District': ['Baldwin Hills/Crenshaw', 'Jefferson Park', 'Ladera Heights', 'Leimert Park', 'View Park-Windsor Hills', 'West Adams'],
  'Bell & Maywood': ['Bell', 'Cudahy', 'Maywood', 'Vernon'],
  'Huntington Park & Florence': ['Central-Alameda', 'Florence-Firestone', 'Green Meadows', 'Huntington Park', 'Walnut Park', 'Watts'],
  'The Vermont Corridor': ['Chesterfield Square', 'Gramercy Park', 'Harvard Park', 'Hyde Park', 'Manchester Square', 'Vermont Square', 'Vermont-Slauson'],
  'Exposition Park & USC': ['Adams-Normandie', 'Arlington Heights', 'Exposition Park', 'Harvard Heights', 'Historic South-Central', 'South Park', 'University Park'],
  'Willowbrook & Athens': ['Athens', 'Broadway-Manchester', 'Florence', 'Vermont Knolls', 'Vermont Vista', 'Westmont', 'Willowbrook'],
  // --- Gateway Cities ---
  'Greater Compton': ['Compton', 'East Compton', 'Rancho Dominguez', 'West Compton'],
  'The Southeast Cities': ['Bellflower', 'Downey', 'Lynwood', 'Paramount', 'South Gate'],
  'Long Beach & Lakewood': ['Cerritos', 'Hawaiian Gardens', 'Lakewood', 'Long Beach', 'Signal Hill'],
  'Norwalk & Santa Fe Springs': ['Artesia', 'Norwalk', 'Santa Fe Springs', 'South Whittier', 'West Whittier-Los Nietos'],
  'Montebello & Pico Rivera': ['Bell Gardens', 'Commerce', 'Montebello', 'North Whittier', 'Pico Rivera'],
  'Whittier & La Mirada': ['East La Mirada', 'La Habra Heights', 'La Mirada', 'Whittier'],
};
// Invert to a member-set key → name lookup, and flag accidental duplicate names.
const keyToName = new Map();
{
  const seen = new Set();
  for (const [name, areas] of Object.entries(GROUP_NAMES)) {
    if (seen.has(name)) throw new Error(`duplicate group name: ${name}`);
    seen.add(name);
    keyToName.set([...areas].sort().join('|'), name);
  }
}
const uncovered = [];

// Name a group: prefer its hand-authored name (by member set); otherwise fall
// back to "<most prominent> area" (and record it so build:shapes can warn).
function nameGroup(members) {
  const hand = keyToName.get([...members].sort().join('|'));
  if (hand) return hand;
  const ranked = [...members].sort(moreProminent);
  uncovered.push(`${ranked[0]} area [${members.length}]: ${[...members].sort().join(', ')}`);
  let label = `${ranked[0]} area`;
  let n = 2;
  while (usedLabels.has(label)) label = `${ranked[0]} area ${++n}`;
  usedLabels.add(label);
  return label;
}

// --- build the tree --------------------------------------------------------
const nodes = {};
const nodeHoods = new Map(); // id -> [neighborhood names]

const leaf = (id, name, parent) => {
  nodes[name] = { id: name, label: name, parent, leaf: true };
  nodeHoods.set(name, [name]);
};

// Build the puzzle for `members` under node `id`. Every node ends up with
// MIN..MAX children: a small set becomes a leaf puzzle (each member a piece);
// a larger set splits into balanced connected groups. A lone leftover member is
// attached directly as a leaf piece (mixing) so we never make a 1-piece group.
function build(id, label, parent, members) {
  const node = { id, label, parent, children: [] };
  nodes[id] = node;
  nodeHoods.set(id, members);

  if (members.length <= MAX) {
    for (const name of members) {
      leaf(id, name, id);
      node.children.push(name);
    }
    return;
  }

  const groups = partition(members, chooseK(members.length));
  for (const g of groups) {
    if (g.length <= 2) {
      // Too small to be its own puzzle — its area(s) ride along as individual
      // leaf pieces of THIS puzzle (mixing groups and lone areas), so we never
      // make a 1- or 2-piece sub-puzzle.
      for (const name of g) {
        leaf(id, name, id);
        node.children.push(name);
      }
    } else {
      const childLabel = nameGroup(g);
      const gid = `${id} › ${childLabel}`;
      build(gid, childLabel, id, g);
      node.children.push(gid);
    }
  }
}

nodes.la = { id: 'la', label: 'LA County', parent: null, children: [] };
nodeHoods.set('la', TOP_REGIONS.flatMap((r) => REGION_GROUPS[r]));
for (const region of TOP_REGIONS) {
  build(region, region, 'la', REGION_GROUPS[region]);
  nodes.la.children.push(region);
}

// --- shapes (union of each node's neighborhoods) ---------------------------
function unionHoods(hoods) {
  let u = poly(hoods[0]);
  for (let i = 1; i < hoods.length; i++) u = union(featureCollection([u, poly(hoods[i])]));
  return u;
}
const shapes = {};
for (const id of Object.keys(nodes)) {
  if (id === 'la') continue;
  const feat = unionHoods(nodeHoods.get(id));
  const single = { type: 'Feature', properties: {}, geometry: structuredClone(largestRingGeometry(feat.geometry)) };
  rewind(single, true);
  const s = simplify(single, { tolerance: TOLERANCE, highQuality: true, mutate: true });
  shapes[id] = s.geometry.coordinates[0].map(([x, y]) => [round(x), round(y)]);
}

// --- sibling adjacency -----------------------------------------------------
const adjacency = {};
for (const id of Object.keys(nodes)) if (id !== 'la') adjacency[id] = [];
const touch = (a, b) => nodeHoods.get(a).some((x) => nodeHoods.get(b).some((y) => adj[x].has(y) || x === y));
for (const node of Object.values(nodes)) {
  const kids = node.children || [];
  for (let i = 0; i < kids.length; i++) {
    for (let j = i + 1; j < kids.length; j++) {
      if (touch(kids[i], kids[j])) {
        adjacency[kids[i]].push(kids[j]);
        adjacency[kids[j]].push(kids[i]);
      }
    }
  }
}

// --- write -----------------------------------------------------------------
const hierarchy = {
  root: 'la',
  nodes: Object.fromEntries(
    Object.values(nodes).map((n) => [n.id, { label: n.label, parent: n.parent, children: n.children, leaf: !!n.leaf }]),
  ),
};
writeFileSync('src/data/hierarchy.json', JSON.stringify(hierarchy));
writeFileSync('src/data/puzzle-shapes.json', JSON.stringify(shapes));
writeFileSync('src/data/puzzle-adjacency.json', JSON.stringify(adjacency));

// --- report ----------------------------------------------------------------
console.log(`Nodes: ${Object.keys(nodes).length} | shapes: ${Object.keys(shapes).length}`);
console.log(`Shapes size: ${(readFileSync('src/data/puzzle-shapes.json').length / 1024).toFixed(1)}KB\n`);
let problems = 0;
function show(id, depth) {
  const n = nodes[id];
  const kids = n.children || [];
  const isolated = kids.filter((k) => kids.length > 1 && !kids.some((o) => o !== k && adjacency[k].includes(o)));
  const badSize = kids.length < MIN || kids.length > MAX;
  const flags = `${badSize ? `  ⚠ ${kids.length} PIECES` : ''}${isolated.length ? `  ⚠ isolated: ${isolated.join(', ')}` : ''}`;
  if (badSize || isolated.length) problems += 1;
  console.log(`${'  '.repeat(depth)}${n.label} (${kids.length})${flags}`);
  for (const k of kids) if (!nodes[k].leaf) show(k, depth + 1);
}
show('la', 0);
console.log(problems ? `\n⚠ ${problems} node(s) violate the 3–7 / connected rule` : '\n✓ every puzzle has 3–7 connected pieces');
if (uncovered.length) console.log(`\n⚠ ${uncovered.length} group(s) without a hand-name (rename in GROUP_NAMES):\n  ${uncovered.join('\n  ')}`);
else console.log('✓ every group has a hand-authored name');
