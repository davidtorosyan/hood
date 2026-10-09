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
export const ROADS_DRIVES = 2; // a short tutorial; testers found road-following too easy
export const tierOf = (index) => (index < ROADS_DRIVES ? 'roads' : 'blind');

// How close (board units) a carried freeway must be to click in: forgiving
// while you learn the game, tighter as you go (testers found a fixed
// tolerance too strict at first and too loose later). ~34 → 28 → 23px.
export const acceptFor = (index) => (index < 6 ? 80 : index < 20 ? 66 : 55);

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
// 1 → which way to move it, 2 → the places it runs through (labelled on the
// map), 3+ → a dashed outline of exactly where it goes.
export const placeHint = (misses) => (misses >= 3 ? 'ghost' : misses === 2 ? 'via' : misses === 1 ? 'dir' : null);

// Magnetism for a held shape: within `radius` of its true spot it's pulled
// in (the closer, the stronger — no jump at the edge).
export function pull(dx, dy, radius) {
  const d = Math.hypot(dx, dy);
  if (d >= radius || d === 0) return [dx, dy];
  const k = 0.25 + 0.75 * (d / radius);
  return [dx * k, dy * k];
}

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

// --- The abstract board (v4): each leg becomes an ARROW on a grid ---
// legs: [[x0, y0], [x1, y1]] per leg, in km with y pointing DOWN (screen
// style). Each leg snaps to one of 8 directions and a whole number of grid
// steps, sized so the whole drive spans about `span` steps. The arrows chain
// exactly: each starts where the last ended. Returns [{ dir: [dx, dy],
// len, from: [gx, gy], to: [gx, gy] }].
export function arrowsFor(legs, span = 6) {
  const extent = Math.max(
    ...legs.map(([[x0, y0], [x1, y1]]) => Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))),
    1e-6,
  );
  const total = legs.reduce((s, [[x0, y0], [x1, y1]]) => s + Math.hypot(x1 - x0, y1 - y0), 0);
  const unit = Math.max(extent, total / legs.length) / Math.max(1, span / legs.length) || 1;
  let at = [0, 0];
  return legs.map(([[x0, y0], [x1, y1]]) => {
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const k = Math.round(ang / (Math.PI / 4));
    const dir = [Math.round(Math.cos((k * Math.PI) / 4)), Math.round(Math.sin((k * Math.PI) / 4))];
    const step = Math.hypot(dir[0], dir[1]) * unit; // a diagonal step is √2 longer
    const len = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    const from = at;
    at = [at[0] + dir[0] * len, at[1] + dir[1] * len];
    return { dir, len, from, to: at };
  });
}

// "north", "southeast"… for an arrow direction [dx, dy] (y down).
export const dirName = ([dx, dy]) =>
  ({ '0,-1': 'north', '1,-1': 'northeast', '1,0': 'east', '1,1': 'southeast', '0,1': 'south', '-1,1': 'southwest', '-1,0': 'west', '-1,-1': 'northwest' })[`${dx},${dy}`];
