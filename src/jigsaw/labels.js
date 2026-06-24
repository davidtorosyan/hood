// Label layout for a whole level at once. EVERY label sits OFF its piece (a
// callout with a leader line) at ONE uniform font size — so the name never
// overlaps the shape and all names read at the same scale. Labels are pushed out
// from the board centre and de-collided against each other; the <text> renders
// in a top layer above the pieces.

const UNIFORM_FS = 33; // one size for every label, now that they're all off-piece

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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

// Model a label as one box PER LINE — each line at its own y with its own real
// width — rather than a single rectangle. A two-line label like "Central / LA"
// has a wide first line and a narrow second line; a single padded rectangle
// massively over-states its footprint and reports false collisions with
// neighbours. Per-line boxes track the actual inked text.
function lineBoxes(lines, fs, x, y, lineHeight) {
  const n = lines.length;
  return lines.map((ln, i) => ({
    x,
    y: y + (i - (n - 1) / 2) * lineHeight,
    w: ln.length * 0.52 * fs + 4,
    h: fs * 0.72 + 2, // ~cap height — avoids counting a few-unit graze as a collision
  }));
}

const boxOverlap = (a, b) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;

// Two labels collide if any of their lines overlap.
const labelsCollide = (a, b) => a.some((la) => b.some((lb) => boxOverlap(la, lb)));

// Plan labels for every piece in a level. `items` is [{ id, label, geom }];
// returns Map<id, plan> where plan is
//   { callout, lines, fs, lineHeight, x, y, anchorX, anchorY }
// (x, y) is the text centre; (anchorX, anchorY) the leader origin on the piece.
// EVERY label is a callout now — pushed off its piece to open space at one size.
export function layoutLabels(items, vbW, vbH) {
  const plans = new Map();
  const placed = []; // accepted labels (each an array of line-boxes)

  // Place larger pieces first — their labels claim space; smaller, more crowded
  // pieces get pushed further out to dodge them.
  const order = [...items].sort((a, b) => b.geom.w * b.geom.h - a.geom.w * a.geom.h);

  const fs = UNIFORM_FS;
  const lineHeight = fs * 1.02;
  const m = 56; // keep labels off the very edge

  for (const { id, label, geom } of order) {
    const lines = wrapLabel(label);

    // Keep the whole label on-board: clamp its CENTRE allowing for its own half
    // width/height, so a wide name near an edge never gets clipped.
    const halfW = (Math.max(...lines.map((l) => l.length)) * 0.52 * fs) / 2 + 4;
    const halfH = (lines.length * lineHeight) / 2 + 4;
    const clampX = (v) => clamp(v, Math.min(m + halfW, vbW / 2), Math.max(vbW - m - halfW, vbW / 2));
    const clampY = (v) => clamp(v, Math.min(m + halfH, vbH / 2), Math.max(vbH - m - halfH, vbH / 2));

    // Push the label outward (away from board centre) until it's off its own
    // piece and clear of every label already placed; try angles + distances.
    let dx = geom.cx - vbW / 2;
    let dy = geom.cy - vbH / 2;
    let len = Math.hypot(dx, dy);
    if (len < 1) {
      dx = 0;
      dy = -1;
      len = 1;
    }
    const ux = dx / len;
    const uy = dy / len;
    const basePush = Math.max(geom.w, geom.h) / 2 + 26 + (lines.length * lineHeight) / 2;

    let chosen = null;
    for (const extra of [0, 36, 76, 120, 170, 230, 300]) {
      for (const ang of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.0, -2.0]) {
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const rx = ux * ca - uy * sa;
        const ry = ux * sa + uy * ca;
        const x = clampX(geom.cx + rx * (basePush + extra));
        const y = clampY(geom.cy + ry * (basePush + extra));
        const boxes = lineBoxes(lines, fs, x, y, lineHeight);
        if (!placed.some((p) => labelsCollide(boxes, p))) {
          chosen = { x, y, boxes };
          break;
        }
      }
      if (chosen) break;
    }
    if (!chosen) {
      const x = clampX(geom.cx + ux * basePush);
      const y = clampY(geom.cy + uy * basePush);
      chosen = { x, y, boxes: lineBoxes(lines, fs, x, y, lineHeight) };
    }

    placed.push(chosen.boxes);
    plans.set(id, {
      callout: true, lines, fs, lineHeight,
      x: chosen.x, y: chosen.y, anchorX: geom.cx, anchorY: geom.cy,
    });
  }

  return plans;
}
