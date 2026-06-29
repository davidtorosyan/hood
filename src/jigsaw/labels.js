// Label layout for a whole level at once. Every label sits ON its piece, centred
// on the piece's visual centre, at ONE uniform font size — so all names read at
// the same scale and each name stays with its shape. The <text> still renders in
// a top layer above the pieces, so a name is never painted over by a neighbour.

const UNIFORM_FS = 33; // one size for every label

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

// Plan labels for every piece in a level. `items` is [{ id, label, geom }];
// returns Map<id, plan> where plan is { callout, lines, fs, lineHeight, x, y }.
// Every label is centred on its piece's visual centre (no callouts/leaders).
export function layoutLabels(items /* , vbW, vbH */) {
  const plans = new Map();
  const fs = UNIFORM_FS;
  const lineHeight = fs * 1.02;
  for (const { id, label, geom } of items) {
    plans.set(id, {
      callout: false,
      lines: wrapLabel(label),
      fs,
      lineHeight,
      x: geom.cx,
      y: geom.cy,
    });
  }
  return plans;
}
