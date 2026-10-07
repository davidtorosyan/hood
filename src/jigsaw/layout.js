// Pure board layout (no DOM, no data): how the board splits into the build
// canvas, the prompt band, and the tray — and where loose pieces wait in the
// tray. Unit-tested in test/layout.test.js.

export const VB_W = 1000; // user-space board width; height derived from aspect
export const FILL = 0.9; // fraction of the build canvas the assembled map fills
// …a little less when the surrounding areas are drawn around it, so a ring of
// that context shows.
export const FILL_CONTEXT = 0.86;

// The board is split into two canvases: a "build" canvas (where the map lives)
// and a "tray" canvas (loose pieces), plus room for the "Place ▸ X" prompt
// between them. Rather than one fixed split, we try a range of layouts —
// stacked (build on top) and side by side (build on the left) — and keep the
// one that shows the map BIGGEST while still leaving the tray enough room for
// the loose pieces (they're the same scale as the map, so a tray much smaller
// than the map means pieces pile on top of each other). So the wide county map
// stacks even on a desktop, and a tall map on a phone gets a taller canvas.
// Rects are [x0, y0, x1, y1] fractions of the board.
const INSET = 0.025; // canvases inset from the board edges
export const PROMPT_GAP = 175; // default prompt room, in user units
const TRAY_ROOM = 1.3; // tray area needed, as a multiple of the map's bbox area

// `mapAspect` = the assembled map's width / height. `gap` = prompt room in user
// units (the Board passes ~60 CSS px' worth for its measured size). `fill` = the
// fraction of the build canvas the map fills.
export function layoutFor(vbH, mapAspect = 1, gap = PROMPT_GAP, fill = FILL) {
  const i = INSET;
  const W = VB_W;
  const H = vbH;
  const mapSize = ([x0, y0, x1, y1]) => {
    const bw = (x1 - x0) * W * fill;
    const bh = (y1 - y0) * H * fill;
    const mw = Math.min(bw, bh * mapAspect);
    return { mw, area: (mw * mw) / mapAspect };
  };
  const areaOf = ([x0, y0, x1, y1]) => Math.max(0, x1 - x0) * W * Math.max(0, y1 - y0) * H;
  const cands = [];
  const gy = gap / H;
  for (let f = 0.28; f <= 0.66; f += 0.02) {
    const split = i + f;
    cands.push({ wide: false, build: [i, i, 1 - i, split], tray: [i, split + gy, 1 - i, 1 - i] });
  }
  if (W / H > 1.05) {
    for (let s = 0.4; s <= 0.72; s += 0.02) {
      cands.push({ wide: true, build: [i, i, s, 1 - i], tray: [s + 0.03, i + gy, 1 - i, 1 - i] });
    }
  }
  let best = null;
  for (const c of cands) {
    const { mw, area } = mapSize(c.build);
    const room = areaOf(c.tray) / (TRAY_ROOM * area);
    // Feasible layouts compete on map size (in ~1% steps), then on tray room —
    // once the map is as big as it gets, extra build height is just empty.
    // Infeasible ones compete on how close they come.
    const score = room >= 1 ? 1e6 + Math.floor(mw / 10) * 10 + Math.min(room, 5) : room * 1e3 + mw * 1e-3;
    if (!best || score > best.score) best = { ...c, score };
  }
  const { score, ...layout } = best;
  return layout;
}

export const rectToUser = ([x0, y0, x1, y1], vbH) => [x0 * VB_W, y0 * vbH, x1 * VB_W, y1 * vbH];

export const fullVB = (vbH) => [0, 0, VB_W, vbH];

// Where the loose pieces wait: packed into the tray canvas so they overlap as
// little as possible — and their NAMES not at all if it can be helped (the
// player has to find each piece by name). Greedy, biggest first: try a spread of
// candidate spots and keep the cheapest, where covering a label costs far more
// than shapes overlapping. `items` are { box, labels } in each piece's own
// (assembled) coords: its extent and its label line boxes. Returns the
// translate for each, in order.
export function packTray(items, trayRect, rand = Math.random) {
  const [x0, y0, x1, y1] = trayRect;
  const m = VB_W * 0.012; // breathing room around each piece and the tray edge
  const LABEL_COST = 25;
  const order = items.map((b, i) => i).sort((a, b) => area(items[b].box) - area(items[a].box));
  const placed = []; // { box, labels } in board coords, already packed
  const out = new Array(items.length);
  const shift = (b, dx, dy) => [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy];
  for (const i of order) {
    const { box, labels } = items[i];
    const [bx0, by0, bx1, by1] = box;
    const w = bx1 - bx0 + 2 * m;
    const h = by1 - by0 + 2 * m;
    // Range for the box's top-left corner (centre it on any axis it can't fit).
    const lo = (a0, a1, size) => (a1 - a0 >= size ? [a0, a1 - size] : [(a0 + a1 - size) / 2, (a0 + a1 - size) / 2]);
    const [gx0, gx1] = lo(x0, x1, w);
    const [gy0, gy1] = lo(y0, y1, h);
    let best = null;
    let ties = 0;
    const G = 8;
    for (let a = 0; a <= G; a++) {
      for (let b = 0; b <= G; b++) {
        const jx = (rand() - 0.5) * 0.5;
        const jy = (rand() - 0.5) * 0.5;
        const left = gx0 + ((gx1 - gx0) * Math.min(G, Math.max(0, a + jx))) / G;
        const top = gy0 + ((gy1 - gy0) * Math.min(G, Math.max(0, b + jy))) / G;
        const dx = left + m - bx0;
        const dy = top + m - by0;
        const cand = { box: [left, top, left + w, top + h], labels: labels.map((l) => shift(l, dx, dy)) };
        let cost = 0;
        for (const p of placed) {
          cost += overlap(cand.box, p.box);
          for (const l of cand.labels) cost += LABEL_COST * overlap(l, p.box);
          for (const l of p.labels) cost += LABEL_COST * overlap(l, cand.box);
        }
        // Least cost wins; equal spots are chosen uniformly (reservoir
        // sampling), so pieces scatter across the tray instead of piling top-left.
        if (!best || cost < best.cost - 1e-6) {
          best = { cost, cand, dx, dy };
          ties = 1;
        } else if (Math.abs(cost - best.cost) < 1e-6 && rand() < 1 / ++ties) {
          best = { cost, cand, dx, dy };
        }
      }
    }
    placed.push(best.cand);
    out[i] = [best.dx, best.dy];
  }
  return out;
}

const area = ([x0, y0, x1, y1]) => (x1 - x0) * (y1 - y0);
const overlap = (a, b) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
