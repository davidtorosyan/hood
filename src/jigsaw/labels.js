// Label layout for a whole level at once. Each piece's name is wrapped to up to
// two balanced lines and sized to the piece. But labels also have to not collide
// with EACH OTHER, and small/thin pieces can't hold their name legibly — so this
// runs a greedy pass over all the level's pieces:
//   - Big pieces are placed first and keep their name centred inside.
//   - A label that won't fit its piece, or would overlap an already-placed
//     label, becomes a CALLOUT: the text moves out to open space (pushed away
//     from the board centre, dodging placed labels) with a leader line back.
// The <text> renders in a top layer, so it's never painted over by a piece.

const FLOOR = 20; // smallest font (user units) we'll place INSIDE a piece
const MAX = 54; // largest inside font
const CALLOUT_FS = 24; // font for callout labels (they sit in open space)

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

// Largest font at which `lines` fit inside a piece of size w × h.
function fitFont(lines, w, h) {
  const maxChars = Math.max(...lines.map((l) => l.length));
  const byWidth = (w * 0.94) / (maxChars * 0.56);
  const byHeight = (h * 0.6) / lines.length;
  return Math.min(byWidth, byHeight);
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
// and (x, y) is the text centre (anchor* the leader origin, only for callouts).
export function layoutLabels(items, vbW, vbH) {
  const plans = new Map();
  const placed = []; // accepted labels (each an array of line-boxes)

  // Place larger pieces first — they're the natural anchors; smaller, more
  // crowded pieces yield to callouts.
  const order = [...items].sort((a, b) => b.geom.w * b.geom.h - a.geom.w * a.geom.h);

  for (const { id, label, geom } of order) {
    const lines = wrapLabel(label);
    const fit = fitFont(lines, geom.w, geom.h);

    // Keep it inside the piece when it both fits and its lines don't actually
    // collide with a label already placed. Otherwise it falls through to a
    // callout — and since bigger pieces go first, the smaller piece is the one
    // that yields.
    if (fit >= FLOOR) {
      const fs = clamp(fit, FLOOR, MAX);
      const lh = fs * 1.02;
      const boxes = lineBoxes(lines, fs, geom.cx, geom.cy, lh);
      if (!placed.some((p) => labelsCollide(boxes, p))) {
        placed.push(boxes);
        plans.set(id, { callout: false, lines, fs, lineHeight: lh, x: geom.cx, y: geom.cy });
        continue;
      }
    }

    // Otherwise a callout: push the label outward (away from board centre),
    // trying angles and distances until it clears the labels already placed.
    const fs = CALLOUT_FS;
    const lineHeight = fs * 1.02;
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
    const basePush = Math.max(geom.w, geom.h) / 2 + 30 + (lines.length * lineHeight) / 2;
    const m = 64;

    let chosen = null;
    for (const extra of [0, 40, 80, 120, 170]) {
      for (const ang of [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35]) {
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const rx = ux * ca - uy * sa;
        const ry = ux * sa + uy * ca;
        const x = clamp(geom.cx + rx * (basePush + extra), m, vbW - m);
        const y = clamp(geom.cy + ry * (basePush + extra), m, vbH - m);
        const boxes = lineBoxes(lines, fs, x, y, lineHeight);
        if (!placed.some((p) => labelsCollide(boxes, p))) {
          chosen = { x, y, boxes };
          break;
        }
      }
      if (chosen) break;
    }
    if (!chosen) {
      const x = clamp(geom.cx + ux * basePush, m, vbW - m);
      const y = clamp(geom.cy + uy * basePush, m, vbH - m);
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
