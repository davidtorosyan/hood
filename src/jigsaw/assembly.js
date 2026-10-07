// The rules of guided assembly, pure (no DOM) so they're unit-testable.
//
// A puzzle starts with one ANCHOR piece already on the map. The game then asks
// for the remaining pieces one at a time, by name, in an order where every piece
// it asks for borders something already placed, so there's always a real edge to
// fit it against. Every level's pieces form one connected group (the build
// script guarantees it), so such an order always exists.

// Pick the anchor: a random piece, preferring ones with at least two neighbours
// so the first few asks have somewhere to go. `adj(id)` lists an id's neighbours.
export function pickAnchor(ids, adj, rand = Math.random) {
  const roomy = ids.filter((id) => adj(id).length >= 2);
  const pool = roomy.length ? roomy : ids;
  return pool[Math.floor(rand() * pool.length)];
}

// A random order for the non-anchor pieces where each borders an earlier piece
// (or the anchor). If the graph were ever disconnected, the stragglers are
// appended at the end rather than dropped.
export function placementOrder(ids, anchor, adj, rand = Math.random) {
  const placed = new Set([anchor]);
  const order = [];
  const remaining = new Set(ids.filter((id) => id !== anchor));
  while (remaining.size) {
    const frontier = [...remaining].filter((id) => adj(id).some((n) => placed.has(n)));
    const pool = frontier.length ? frontier : [...remaining];
    const next = pool[Math.floor(rand() * pool.length)];
    order.push(next);
    placed.add(next);
    remaining.delete(next);
  }
  return order;
}

// How close (in board units) a dropped piece's translate must be to its true spot
// to snap. Scales with the smaller of the two mating pieces, so a small piece
// only connects when its edge genuinely meets the map. `a`/`b` have {w, h}.
export const SNAP = { snapFrac: 0.5, magnetFrac: 0.72, snapMin: 48, snapMax: 150, magnetMin: 74, magnetMax: 210 };

export function mateRadius(a, b) {
  const s = Math.min(a.w, a.h, b.w, b.h);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return {
    snap: clamp(s * SNAP.snapFrac, SNAP.snapMin, SNAP.snapMax),
    magnet: clamp(s * SNAP.magnetFrac, SNAP.magnetMin, SNAP.magnetMax),
  };
}

// The placed neighbour a target piece should connect to (and be hinted toward):
// the one giving the most forgiving connection (largest magnet), i.e. usually
// the biggest neighbour. `geomOf(id)` returns {w, h}. Null if none is placed.
export function bestMate(target, placed, adj, geomOf) {
  let best = null;
  for (const n of adj(target)) {
    if (!placed.has(n)) continue;
    const r = mateRadius(geomOf(target), geomOf(n));
    if (!best || r.magnet > best.magnet) best = { id: n, ...r };
  }
  return best;
}

// Does a target dropped at translate (tx, ty) snap? Placed pieces all sit at
// translate (0,0), so it's just the distance from home against the mate's reach.
export function dropSnaps(tx, ty, mate) {
  return !!mate && Math.hypot(tx, ty) < mate.magnet;
}

// Connection-glow strength 0..1 for a target at (tx, ty): 0 outside the magnet
// radius, rising to 1 at the snap radius.
export function glowStrength(tx, ty, mate) {
  if (!mate) return 0;
  const d = Math.hypot(tx, ty);
  if (d >= mate.magnet) return 0;
  return Math.max(0, Math.min(1, (mate.magnet - d) / (mate.magnet - mate.snap)));
}

// Which hint to show after `misses` failed drops of the current target:
//   0–1 → none (just try again), 2 → name a placed neighbour, 3+ → also show a
//   ghost outline of where it goes.
export function hintLevel(misses) {
  if (misses >= 3) return 'ghost';
  if (misses >= 2) return 'neighbor';
  return 'none';
}
