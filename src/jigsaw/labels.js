// Piece labels: wrap to up to two balanced lines and auto-size to the piece, so
// a name is readable whether it sits on a tiny neighbourhood or a big region. A
// single fixed font size across very different piece sizes reads poorly.

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

// Pick a font size that fits `lines` inside a piece of size p.w × p.h.
export function labelFont(p, lines) {
  const maxChars = Math.max(...lines.map((l) => l.length));
  const byWidth = (p.w * 0.94) / (maxChars * 0.56);
  const byHeight = (p.h * 0.6) / lines.length;
  const fs = Math.max(20, Math.min(54, byWidth, byHeight));
  return { fs, lineHeight: fs * 1.02 };
}
