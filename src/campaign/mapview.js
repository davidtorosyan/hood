// The Rebuild LA map's camera: an <svg> of the county you can pan, pinch and
// zoom, with names that appear as there's room for them, and smooth flights
// between areas (zoom out of the puzzle you just built, pan, zoom into the
// next). Only drawing + input; the overworld decides what's on it.
//
// The camera is the svg's viewBox. Flights interpolate its centre linearly and
// its size in log space, so a zoom feels even. Every frame and timer goes
// through the given Scheduler, so leaving the screen cancels it all.

const EASE = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const TAP_SLOP = 8; // px: more movement than this is a pan, not a tap
const LABEL_PX = 13; // on-screen label size

export class MapView {
  // svg: the map (its viewBox spans [0,0,W,H] at full view). sched: Scheduler.
  // onTap(target, [x, y]): a tap (not a pan) on the map, with the svg point.
  // onView(box): the camera moved. onTouch(): a finger/mouse went down on it.
  constructor(svg, { W, H, sched, onTap, onView, onTouch }) {
    this.svg = svg;
    this.W = W;
    this.H = H;
    this.sched = sched;
    this.onTap = onTap;
    this.onView = onView;
    this.onTouch = onTouch;
    // Zoomed in enough to see places (else: the groups they make). Set by the
    // owner from onView; place names only show in detail, group names only out of it.
    this.detail = false;
    this.box = [0, 0, W, H];
    this.flight = null;
    this.labels = []; // { el, x, y, size, text, tier, group }
    this.labelLayer = null;
    this.#bindInput();
  }

  // The viewport's aspect (width / height) in screen pixels.
  #aspect() {
    const r = this.svg.getBoundingClientRect();
    return r.width && r.height ? r.width / r.height : this.W / this.H;
  }

  // Grow box [x, y, w, h] to the viewport's aspect (centred), so what you
  // asked to see is what fits.
  fit([x, y, w, h], pad = 0.12) {
    const [cx, cy] = [x + w / 2, y + h / 2];
    w *= 1 + pad * 2;
    h *= 1 + pad * 2;
    const a = this.#aspect();
    if (w / h < a) w = h * a;
    else h = w / a;
    return [cx - w / 2, cy - h / 2, w, h];
  }

  full() {
    return this.fit([0, 0, this.W, this.H], 0.01);
  }

  set([x, y, w, h]) {
    this.box = [x, y, w, h];
    this.svg.setAttribute('viewBox', `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
    this.onView?.(this.box);
    this.#updateLabels();
  }

  // Fly to `to` over `ms`, then onDone. Zooming between two far-apart areas
  // goes out to a box holding both first ("zoom out, pan, zoom in").
  flyTo(to, ms = 900, onDone) {
    this.flight?.cancel?.();
    const from = this.box;
    const holds = (a, b) => a[0] <= b[0] && a[1] <= b[1] && a[0] + a[2] >= b[0] + b[2] && a[1] + a[3] >= b[1] + b[3];
    const far = !holds(from, to) && !holds(to, from);
    if (far) {
      const x0 = Math.min(from[0], to[0]);
      const y0 = Math.min(from[1], to[1]);
      const mid = this.fit([x0, y0, Math.max(from[0] + from[2], to[0] + to[2]) - x0, Math.max(from[1] + from[3], to[1] + to[3]) - y0], 0.05);
      return this.#fly(from, mid, ms * 0.6, () => this.#fly(mid, to, ms * 0.7, onDone));
    }
    this.#fly(from, to, ms, onDone);
  }

  // The box a fraction t of the way from a to b (log-size, linear centre).
  static lerp(a, b, t) {
    const w = Math.exp(Math.log(a[2]) + (Math.log(b[2]) - Math.log(a[2])) * t);
    const h = w / (b[2] / b[3]);
    const cx = a[0] + a[2] / 2 + (b[0] + b[2] / 2 - a[0] - a[2] / 2) * t;
    const cy = a[1] + a[3] / 2 + (b[1] + b[3] / 2 - a[1] - a[3] / 2) * t;
    return [cx - w / 2, cy - h / 2, w, h];
  }

  #fly(a, b, ms, onDone) {
    const ca = [a[0] + a[2] / 2, a[1] + a[3] / 2];
    const cb = [b[0] + b[2] / 2, b[1] + b[3] / 2];
    const la = Math.log(a[2]);
    const lb = Math.log(b[2]);
    const asp = b[2] / b[3];
    this.flight = this.sched.animate(ms, (k) => {
      const e = EASE(k);
      const w = Math.exp(la + (lb - la) * e);
      const h = w / asp;
      const cx = ca[0] + (cb[0] - ca[0]) * e;
      const cy = ca[1] + (cb[1] - ca[1]) * e;
      this.set([cx - w / 2, cy - h / 2, w, h]);
    }, () => {
      this.flight = null;
      this.set(b);
      onDone?.();
    });
  }

  // How many screen px one svg unit is right now.
  scale() {
    const r = this.svg.getBoundingClientRect();
    return r.width ? Math.min(r.width / this.box[2], r.height / this.box[3]) : 1;
  }

  // --- names: shown when there's room for them on screen ---
  // items: { x, y, size (the shape's width, svg units), text, tier, group }.
  // tier 0 = a built puzzle's name, 1 = a place's. A puzzle's name gives way
  // once its places' names fit.
  setLabels(layer, items) {
    this.labelLayer = layer;
    layer.replaceChildren();
    this.labels = items.map((it) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      el.setAttribute('class', `ow-label tier${it.tier}`);
      el.setAttribute('text-anchor', 'middle');
      el.setAttribute('dominant-baseline', 'central');
      el.textContent = it.text;
      layer.append(el);
      return { ...it, el };
    });
    this.#updateLabels();
  }

  #updateLabels() {
    if (!this.labels.length) return;
    const px = this.scale();
    const fs = LABEL_PX / px; // svg units for a LABEL_PX label
    const fits = (it) => it.size * px > it.text.length * LABEL_PX * 0.55 + 10;
    for (const it of this.labels) {
      const show = fits(it) && (it.tier === 1) === this.detail;
      it.el.style.display = show ? '' : 'none';
      if (!show) continue;
      it.el.setAttribute('x', it.x.toFixed(1));
      it.el.setAttribute('y', it.y.toFixed(1));
      it.el.style.fontSize = `${(it.tier ? fs : fs * 1.1).toFixed(2)}px`;
      it.el.style.strokeWidth = `${(fs * 0.28).toFixed(2)}px`;
    }
  }

  // --- input: drag to pan, pinch / wheel to zoom, tap ---
  #bindInput() {
    const svg = this.svg;
    const pts = new Map();
    let start = null; // { box, pts: Map copy, moved }
    // The svg point under screen point (cx, cy) when the camera is `box`
    // (the viewBox is letterboxed into the element: preserveAspectRatio meet).
    const pointIn = (box, cx, cy) => {
      const r = svg.getBoundingClientRect();
      const s = Math.min(r.width / box[2], r.height / box[3]);
      return [box[0] + (cx - r.left - (r.width - box[2] * s) / 2) / s, box[1] + (cy - r.top - (r.height - box[3] * s) / 2) / s];
    };
    // The box of size w×h that puts svg point p under screen point (cx, cy).
    const boxWith = (p, cx, cy, w, h) => {
      const r = svg.getBoundingClientRect();
      const s = Math.min(r.width / w, r.height / h);
      return [p[0] - (cx - r.left - (r.width - w * s) / 2) / s, p[1] - (cy - r.top - (r.height - h * s) / 2) / s, w, h];
    };
    const toSvg = (cx, cy) => pointIn(this.box, cx, cy);
    this.toSvg = toSvg;
    const clamp = ([x, y, w, h]) => {
      const f = this.full();
      w = Math.min(w, f[2]);
      h = Math.min(h, f[3]);
      const minW = f[2] / 30;
      if (w < minW) {
        const k = minW / w;
        x -= (w * (k - 1)) / 2;
        y -= (h * (k - 1)) / 2;
        w *= k;
        h *= k;
      }
      x = Math.max(f[0] - w * 0.25, Math.min(f[0] + f[2] - w * 0.75, x));
      y = Math.max(f[1] - h * 0.25, Math.min(f[1] + f[3] - h * 0.75, y));
      return [x, y, w, h];
    };
    svg.addEventListener('pointerdown', (e) => {
      this.flight?.cancel?.();
      this.flight = null;
      this.onTouch?.();
      svg.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      start = { box: [...this.box], pts: new Map(pts), moved: start?.moved && pts.size > 1, target: e.target };
    });
    svg.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || !start) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) {
        const [x0, y0] = start.pts.get(e.pointerId) ?? [e.clientX, e.clientY];
        const dx = e.clientX - x0;
        const dy = e.clientY - y0;
        if (!start.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
        start.moved = true;
        const p = pointIn(start.box, x0, y0);
        this.set(clamp(boxWith(p, e.clientX, e.clientY, start.box[2], start.box[3])));
      } else if (pts.size === 2 && start.pts.size === 2) {
        start.moved = true;
        const [a0, b0] = [...start.pts.values()];
        const [a1, b1] = [...pts.values()];
        const d0 = Math.hypot(a0[0] - b0[0], a0[1] - b0[1]) || 1;
        const d1 = Math.hypot(a1[0] - b1[0], a1[1] - b1[1]) || 1;
        const k = d0 / d1;
        // Keep the svg point under the pinch's first midpoint under the new one.
        const m0 = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2];
        const m1 = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
        const p = pointIn(start.box, ...m0);
        this.set(clamp(boxWith(p, ...m1, start.box[2] * k, start.box[3] * k)));
      }
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size) {
        start = { box: [...this.box], pts: new Map(pts), moved: true };
        return;
      }
      const tapped = start && !start.moved && e.type === 'pointerup';
      const target = start?.target;
      start = null;
      if (tapped) this.onTap?.(target, toSvg(e.clientX, e.clientY));
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.flight?.cancel?.();
      this.flight = null;
      this.onTouch?.();
      const k = Math.exp(e.deltaY * 0.002);
      const [px, py] = toSvg(e.clientX, e.clientY);
      const [x, y, w, h] = this.box;
      this.set(clamp([px - (px - x) * k, py - (py - y) * k, w * k, h * k]));
    }, { passive: false });
  }
}
