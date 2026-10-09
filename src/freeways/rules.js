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

// How much the map helps. Early drives show the whole freeway network as
// grey roads to line a shape up against; later ones hide it, so you place
// each freeway from where the places are.
export const ROADS_DRIVES = 16;
export const tierOf = (index) => (index < ROADS_DRIVES ? 'roads' : 'blind');

// "northeast", "south"… from a leg's start to its end (screen coords: y down).
export function compass([x0, y0], [x1, y1]) {
  const deg = (Math.atan2(-(y1 - y0), x1 - x0) * 180) / Math.PI; // 0 = east, 90 = north
  const names = ['east', 'northeast', 'north', 'northwest', 'west', 'southwest', 'south', 'southeast'];
  return names[((Math.round(deg / 45) % 8) + 8) % 8];
}

// The next leg to place: the first unplaced one in driving order.
export const nextLeg = (placed, n) => {
  for (let i = 0; i < n; i++) if (!placed.has(i)) return i;
  return n;
};
// How far the car can drive: legs placed contiguously from the start.
export const drivable = (placed, n) => nextLeg(placed, n);

// Misses placing one freeway → help, one step at a time, never stuck:
// 1 → which way it heads and the places it runs through (labelled on the
// map), 2+ → a dashed outline of exactly where it goes.
export const placeHint = (misses) => (misses >= 2 ? 'ghost' : misses === 1 ? 'via' : null);

// Magnetism for a held shape: within `radius` of its true spot it's pulled
// in (the closer, the stronger — no jump at the edge), and it clicks in
// within `snap`.
export function pull(dx, dy, radius) {
  const d = Math.hypot(dx, dy);
  if (d >= radius || d === 0) return [dx, dy];
  const k = 0.35 + 0.65 * (d / radius);
  return [dx * k, dy * k];
}
export const snaps = (dx, dy, snap) => Math.hypot(dx, dy) <= snap;

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
