// Google's encoded-polyline format at 5 decimals (~1 m): each coordinate is a
// zig-zag, variable-length delta from the previous one, packed into printable
// ASCII. The puzzle shapes ship this way — same precision as plain JSON
// numbers, a fraction of the size. Rings are [lng, lat] pairs.
const SCALE = 1e5;

export function encodeRing(ring) {
  let out = '';
  let px = 0;
  let py = 0;
  for (const [lng, lat] of ring) {
    const x = Math.round(lng * SCALE);
    const y = Math.round(lat * SCALE);
    out += encodeNum(y - py) + encodeNum(x - px); // lat first, as the format does
    px = x;
    py = y;
  }
  return out;
}

function encodeNum(n) {
  let v = n < 0 ? ~(n << 1) : n << 1;
  let s = '';
  while (v >= 0x20) {
    s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return s + String.fromCharCode(v + 63);
}

export function decodeRing(str) {
  const ring = [];
  let i = 0;
  let x = 0;
  let y = 0;
  const next = () => {
    let shift = 0;
    let result = 0;
    let b;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    y += next();
    x += next();
    ring.push([x / SCALE, y / SCALE]);
  }
  return ring;
}
