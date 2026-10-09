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

// How much the board helps. The first drives outline each leg's slot on the
// road (a matching game: which freeway is this road?); later ones only mark
// where the leg starts, so you place it from what you know.
export const GUIDED_DRIVES = 12;
export const tierOf = (index) => (index < GUIDED_DRIVES ? 'guided' : 'open');

// The next leg to place: the first unplaced one in driving order.
export const nextLeg = (placed, n) => {
  for (let i = 0; i < n; i++) if (!placed.has(i)) return i;
  return n;
};
// How far the car can drive: legs placed contiguously from the start.
export const drivable = (placed, n) => nextLeg(placed, n);

// Magnetism: within `radius` of its true spot, a held piece is pulled toward
// it (the closer, the stronger), so it visibly wants to click in.
export function pull(dx, dy, radius) {
  const d = Math.hypot(dx, dy);
  if (d >= radius || d === 0) return [dx, dy];
  const k = 0.3 + 0.7 * (d / radius); // 1 at the edge (no jump), 0.3 right on it
  return [dx * k, dy * k];
}
export const near = (dx, dy, radius) => Math.hypot(dx, dy) < radius;

// Misses on the current leg → help, one step at a time, never stuck:
// 1 → where it runs ("through X, Y"), 2 → show its slot / pulse the right
// piece, 3+ → name it outright.
export const legHint = (misses) => (misses >= 3 ? 'name' : misses === 2 ? 'slot' : misses === 1 ? 'via' : null);
