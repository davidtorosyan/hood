// Freeways: the small rules, pure (no DOM, no data imports — unit-tested).

// Which puzzle to play next: the first unsolved one after `from` (wrapping),
// so play walks the easy → hard order and skipped ones come back around.
export function nextIndex(isSolved, from, n, idAt) {
  for (let k = 1; k <= n; k++) {
    const i = (from + k + n) % n;
    if (!isSolved(idAt(i))) return i;
  }
  return (from + 1 + n) % n; // all solved: just keep going round
}

// How much the board helps. The first drives dash each leg's road (a naming
// game: which freeway is this road?); later ones only park the car where the
// leg starts, so you find the road too.
export const GUIDED_DRIVES = 8;
export const tierOf = (index) => (index < GUIDED_DRIVES ? 'guided' : 'open');

// The next leg to place: the first unplaced one in driving order.
export const nextLeg = (placed, n) => {
  for (let i = 0; i < n; i++) if (!placed.has(i)) return i;
  return n;
};
// How far the car can drive: legs placed contiguously from the start.
export const drivable = (placed, n) => nextLeg(placed, n);

// Misses on the current leg → help, one step at a time, never stuck:
// 1 → where it runs ("through X, Y", labelled on the map), 2 → show its
// road / pulse the right sign, 3+ → name it outright.
export const legHint = (misses) => (misses >= 3 ? 'name' : misses === 2 ? 'slot' : misses === 1 ? 'via' : null);

// The closest point on a polyline to `p`: { d, point }. (Drops and magnetism
// are about "how near the road is this sign?")
export function nearestOnLine([px, py], pts) {
  let best = { d: Infinity, point: pts[0] };
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const L2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L2)) : 0;
    const q = [ax + (bx - ax) * t, ay + (by - ay) * t];
    const d = Math.hypot(px - q[0], py - q[1]);
    if (d < best.d) best = { d, point: q };
  }
  if (pts.length === 1) best = { d: Math.hypot(px - pts[0][0], py - pts[0][1]), point: pts[0] };
  return best;
}

// A held sign near its road slides toward it (the closer, the stronger).
export function magnet(p, target, d, radius) {
  if (d >= radius) return p;
  const k = 0.75 * (1 - d / radius);
  return [p[0] + (target[0] - p[0]) * k, p[1] + (target[1] - p[1]) * k];
}
