// Label layout for a whole level at once. Every label sits ON its piece at ONE
// uniform font size, so all names read at the same scale and each name stays
// with its shape. Each label starts at its piece's roomiest interior point; when
// that box would collide with a label already placed, it slides to the next-best
// interior anchor that's clear (e.g. "Westside" vs "Central L.A." on the county
// map). The <text> renders in a top layer above the pieces, so a name is never
// painted over by a neighbouring shape.

const CHAR_W = 0.6; // average bold glyph width as a fraction of the font size
const LINE_H = 1.02;

// Split a label into up to two lines of roughly equal length.
export function wrapLabel(str) {
  const words = str.split(' ');
  if (words.length <= 1) return [str];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length;
    const b = words.slice(i).join(' ').length;
    if (Math.abs(a - b) < bestDiff) {
      bestDiff = Math.abs(a - b);
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

// Per-line boxes for a label centred at (x, y): a wide line over a narrow one
// shouldn't count as one big rectangle.
export function labelBoxes(lines, fs, x, y) {
  const lh = fs * LINE_H;
  return lines.map((ln, i) => {
    const w = ln.length * fs * CHAR_W;
    const cy = y + (i - (lines.length - 1) / 2) * lh;
    return [x - w / 2, cy - lh / 2, x + w / 2, cy + lh / 2];
  });
}

const overlapArea = (a, b) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

// Plan labels for every piece in a level. `items` is [{ id, label, geom }] where
// geom.anchors is a list of interior [x, y] candidates, best first. Returns
// Map<id, { lines, fs, lineHeight, x, y }>.
export function layoutLabels(items, fs) {
  const plans = new Map();
  const taken = []; // boxes of labels placed so far
  // Small pieces first: they have the fewest good spots, so they choose first.
  const order = [...items].sort((a, b) => a.geom.w * a.geom.h - b.geom.w * b.geom.h);
  for (const { id, label, geom } of order) {
    const lines = wrapLabel(label);
    let best = null;
    geom.anchors.forEach(([x, y], rank) => {
      const boxes = labelBoxes(lines, fs, x, y);
      let hit = 0;
      for (const b of boxes) for (const t of taken) hit += overlapArea(b, t);
      // Collisions dominate; among clear spots, prefer the roomiest (lowest rank).
      const cost = hit * 10 + rank;
      if (!best || cost < best.cost) best = { cost, x, y, boxes };
    });
    taken.push(...best.boxes);
    plans.set(id, { lines, fs, lineHeight: fs * LINE_H, x: best.x, y: best.y });
  }
  return plans;
}
