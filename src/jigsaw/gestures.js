// Pointer input for a Board, turned into a few high-level gestures. Everything
// is driven from the SVG ROOT (pointer capture lives there, not on the dragged
// piece — capturing on a moving element breaks on iOS), with a small pointer map
// so we can tell apart:
//   - while playing: press-and-drag a piece (`grab` / `drag` / `drop`)
//   - on a solved map: a tap (`tap`), a one-finger pan that springs back
//     (`pan` / `panEnd`), or a shake while panning (`shake`)
//   - either way: a two-finger pinch (`pinch('in' | 'out', midpoint)`)
// A `pointercancel` (the OS took the touch: a system swipe, an incoming call)
// ABORTS the gesture instead of completing it, so it never counts as a tap/drop.

const TAP_SLOP = 22; // movement under this (user units) counts as a tap, not a drag
const PINCH_IN = 0.72; // pinch ratio that triggers zoom out
const PINCH_OUT = 1.34; // spread ratio that triggers zoom in

// Detects a shake from a stream of positions: enough quick changes of direction
// within a short window, in ANY direction (a reversal is when the velocity flips
// by more than ~115°). Units are board user-space.
class ShakeDetector {
  constructor() {
    this.samples = [];
  }
  push(x, y, t) {
    this.samples.push({ x, y, t });
    const cut = t - 450;
    while (this.samples.length && this.samples[0].t < cut) this.samples.shift();
  }
  shaking() {
    const s = this.samples;
    let reversals = 0;
    let amp = 0;
    let pvx = 0;
    let pvy = 0;
    for (let i = 1; i < s.length; i++) {
      const vx = s[i].x - s[i - 1].x;
      const vy = s[i].y - s[i - 1].y;
      const mag = Math.hypot(vx, vy);
      if (mag < 14) continue;
      amp += mag;
      const pmag = Math.hypot(pvx, pvy);
      if (pmag && (vx * pvx + vy * pvy) / (mag * pmag) < -0.4) reversals += 1;
      pvx = vx;
      pvy = vy;
    }
    return reversals >= 3 && amp > 480;
  }
}

export class Gestures {
  // h: { mode() → 'play' | 'solved' | null (null = ignore input),
  //      pieceOf(eventTarget) → piece | null,
  //      grab(piece, pt) → bool, drag(pt), drop(), cancelDrag(),
  //      tap(piece), tapEmpty(target) (a tap off the pieces), pan(dx, dy),
  //      panEnd(), shake(), pinch(dir, pt) }
  constructor(svg, h) {
    this.svg = svg;
    this.h = h;
    this.pointers = new Map(); // pointerId → [x, y] in board user space
    this.g = null; // the current gesture
    svg.addEventListener('pointerdown', (e) => this.#down(e));
    svg.addEventListener('pointermove', (e) => this.#move(e));
    svg.addEventListener('pointerup', (e) => this.#up(e));
    svg.addEventListener('pointercancel', (e) => this.#cancel(e));
    // iOS Safari: a pinch on the board is ours, not a page zoom (page zoom stays
    // available everywhere else, for accessibility).
    svg.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  // Abandon whatever's in progress (phase changed under it, board torn down).
  reset() {
    this.#abort();
    this.pointers.clear();
  }

  #toUser(e) {
    const pt = this.svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const u = pt.matrixTransform(this.svg.getScreenCTM().inverse());
    return [u.x, u.y];
  }

  #down(e) {
    const mode = this.h.mode();
    if (!mode) return; // mid-animation
    e.preventDefault();
    try {
      this.svg.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events (tests) may have no real pointer to capture */
    }
    const pt = this.#toUser(e);
    this.pointers.set(e.pointerId, pt);
    if (this.pointers.size >= 2) {
      this.#abort();
      const [a, b] = [...this.pointers.values()];
      this.g = {
        type: 'pinch',
        start: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1,
        mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        fired: false,
      };
      return;
    }
    const piece = this.h.pieceOf(e.target);
    if (mode === 'play') {
      if (piece) this.g = this.h.grab(piece, pt) ? { type: 'drag' } : null;
      else this.g = { type: 'tap', target: e.target, start: pt }; // e.g. a context area
    } else {
      this.g = { type: 'pan', piece, target: e.target, start: pt, moved: false, shake: new ShakeDetector() };
    }
  }

  #move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const pt = this.#toUser(e);
    this.pointers.set(e.pointerId, pt);
    const g = this.g;
    if (!g) return;
    if (g.type === 'pinch') {
      if (g.fired || this.pointers.size < 2) return;
      const [a, b] = [...this.pointers.values()];
      const ratio = Math.hypot(a[0] - b[0], a[1] - b[1]) / g.start;
      if (ratio >= PINCH_OUT || ratio <= PINCH_IN) {
        g.fired = true;
        this.h.pinch(ratio >= PINCH_OUT ? 'out' : 'in', g.mid);
      }
    } else if (g.type === 'drag') {
      this.h.drag(pt);
    } else if (g.type === 'tap') {
      if (Math.hypot(pt[0] - g.start[0], pt[1] - g.start[1]) > TAP_SLOP) this.g = { type: 'dead' };
    } else if (g.type === 'pan') {
      const dx = pt[0] - g.start[0];
      const dy = pt[1] - g.start[1];
      if (!g.moved && Math.hypot(dx, dy) > TAP_SLOP) g.moved = true;
      if (!g.moved) return;
      this.h.pan(dx, dy);
      g.shake.push(pt[0], pt[1], performance.now());
      if (g.shake.shaking()) {
        this.g = { type: 'dead' };
        this.h.shake();
      }
    }
  }

  #up(e) {
    this.pointers.delete(e.pointerId);
    const g = this.g;
    if (!g) return;
    if (g.type === 'pinch' || g.type === 'dead') {
      // ignore the remainder until every finger is up (avoids a stray tap/pan)
      this.g = this.pointers.size > 0 ? { type: 'dead' } : null;
      return;
    }
    this.g = null;
    if (g.type === 'drag') this.h.drop();
    else if (g.type === 'tap') this.h.tapEmpty(g.target);
    else if (g.type === 'pan') {
      if (g.moved) this.h.panEnd();
      else if (g.piece) this.h.tap(g.piece);
      else this.h.tapEmpty(g.target); // (the down target: capture retargets up events)
    }
  }

  #cancel(e) {
    this.pointers.delete(e.pointerId);
    this.#abort();
    if (this.pointers.size) this.g = { type: 'dead' };
  }

  #abort() {
    const g = this.g;
    this.g = null;
    if (!g) return;
    if (g.type === 'drag') this.h.cancelDrag();
    else if (g.type === 'pan' && g.moved) this.h.panEnd();
  }
}
