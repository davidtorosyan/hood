// Visual effects layered over the pieces. None of these hold game state; the
// Board decides when to show them.
//   - EdgeGlow: the shared border lighting up as a held piece nears its spot,
//     plus a faint dashed tether between the two glowing edges.
//   - snapBurst: the spark at the join when a piece clicks in.
//   - Paddle: on touch, a held piece floats above the thumb on a little stick.
//   - ghost: a dashed outline of where the asked-for piece goes (a late hint).
//   - Coach: an animated finger demonstrating the first drag of all time.
//   - collapseName: the parent region's name fading in on zoom-out.
import { svgEl } from '../ui/dom.js';
import { facingInfo } from './geometry.js';
import { wrapLabel } from './labels.js';

const f1 = (v) => v.toFixed(1);

export class EdgeGlow {
  constructor(layer) {
    this.layer = layer;
    this.connector = svgEl('line', { class: 'jig-connector' });
    this.connector.style.display = 'none';
    layer.append(this.connector);
    this.lit = [];
    // The shared edge between two pieces depends only on the pair (both sit at
    // their true positions when it's computed), so compute it once per pair.
    // It's O(|A|·|B|) — far too slow to redo on every finger move.
    this.cache = new Map();
  }

  #edges(a, b) {
    const key = `${a.id}|${b.id}`;
    let v = this.cache.get(key);
    if (!v) {
      v = {
        a: facingInfo(a.geom.ring, [0, 0], b.geom.ring, [0, 0]),
        b: facingInfo(b.geom.ring, [0, 0], a.geom.ring, [0, 0]),
      };
      this.cache.set(key, v);
    }
    return v;
  }

  // The world point where `a` (at its true spot) meets `b`, for the snap spark.
  joinPoint(a, b) {
    return this.#edges(a, b).a.mid;
  }

  // Light the edge between held piece `a` and placed piece `b` at strength 0..1.
  show(a, b, strength) {
    if (strength <= 0) return this.clear();
    const e = this.#edges(a, b);
    a.setGlow(strength, e.a.d);
    b.setGlow(strength, e.b.d);
    for (const p of this.lit) if (p !== a && p !== b) p.setGlow(0, '');
    this.lit = [a, b];
    if (e.a.mid && e.b.mid) {
      const c = this.connector;
      c.setAttribute('x1', f1(e.a.mid[0] + a.tx));
      c.setAttribute('y1', f1(e.a.mid[1] + a.ty));
      c.setAttribute('x2', f1(e.b.mid[0] + b.tx));
      c.setAttribute('y2', f1(e.b.mid[1] + b.ty));
      c.style.setProperty('--glow', strength.toFixed(3));
      c.style.display = '';
    }
  }

  clear() {
    for (const p of this.lit) p.setGlow(0, '');
    this.lit = [];
    this.connector.style.display = 'none';
  }
}

// A burst of lines radiating from the join, plus a quick expanding ring.
export function snapBurst(layer, sched, [px, py]) {
  const g = svgEl('g', { class: 'jig-burst' });
  g.append(svgEl('circle', { class: 'jig-burst-ring', cx: 0, cy: 0, r: 30 }));
  const N = 10;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    g.append(svgEl('line', {
      x1: f1(Math.cos(a) * 18), y1: f1(Math.sin(a) * 18),
      x2: f1(Math.cos(a) * 64), y2: f1(Math.sin(a) * 64),
    }));
  }
  layer.append(g);
  const ease = (t) => 1 - Math.pow(1 - t, 2);
  sched.animate(
    420,
    (k) => {
      const s = 0.45 + ease(k) * 1.45;
      g.style.transform = `translate(${f1(px)}px, ${f1(py)}px) scale(${s.toFixed(3)})`;
      g.style.opacity = (1 - k * k).toFixed(3);
    },
    () => g.remove(),
  );
}

// The drag paddle: a dot at the finger and a stick up to the lifted piece.
export class Paddle {
  constructor(layer, lift) {
    this.lift = lift;
    this.el = svgEl('g', { class: 'jig-paddle' });
    this.line = svgEl('line', { class: 'jig-paddle-line' });
    this.dot = svgEl('circle', { class: 'jig-paddle-dot', r: 30 });
    this.el.append(this.line, this.dot);
    this.el.style.display = 'none';
    layer.append(this.el);
  }
  // `to`: where the stick ends (default: straight up by `lift`).
  show(at, to) {
    this.el.style.display = '';
    this.move(at, to);
  }
  move([x, y], [tx, ty] = [x, y - this.lift]) {
    this.dot.setAttribute('cx', f1(x));
    this.dot.setAttribute('cy', f1(y));
    this.line.setAttribute('x1', f1(x));
    this.line.setAttribute('y1', f1(y));
    this.line.setAttribute('x2', f1(tx));
    this.line.setAttribute('y2', f1(ty));
  }
  hide() {
    this.el.style.display = 'none';
  }
}

// A dashed outline of a piece at its true spot — "it goes here".
export function ghost(layer, piece) {
  const p = svgEl('path', { class: 'jig-ghost', d: piece.geom.d });
  layer.append(p);
  return p;
}

// The first-ever placement gets a demo: a finger presses on the piece in the
// tray, carries it up to its spot, lifts, and repeats a couple of times.
export class Coach {
  constructor(layer, sched) {
    this.layer = layer;
    this.sched = sched;
    this.el = null;
    this.anim = null;
  }
  // from/to: world points (the piece in the tray → its true spot).
  play(from, to, loops = 3) {
    this.stop();
    const g = svgEl('g', { class: 'jig-coach' });
    const t = svgEl('text', { 'text-anchor': 'middle', 'dominant-baseline': 'hanging' });
    t.textContent = '👆';
    g.append(t);
    this.layer.append(g);
    this.el = g;
    const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
    let n = 0;
    const run = () => {
      this.anim = this.sched.animate(
        1900,
        (k) => {
          // 0–15%: fade in on the piece · 15–75%: travel · 75–100%: fade out
          const m = k < 0.15 ? 0 : k > 0.75 ? 1 : ease((k - 0.15) / 0.6);
          const x = from[0] + (to[0] - from[0]) * m;
          const y = from[1] + (to[1] - from[1]) * m;
          const o = k < 0.12 ? k / 0.12 : k > 0.82 ? Math.max(0, (1 - k) / 0.18) : 1;
          g.style.transform = `translate(${f1(x)}px, ${f1(y)}px)`;
          g.style.opacity = o.toFixed(2);
        },
        () => {
          if (++n < loops) this.anim = this.sched.after(350, run);
          else this.stop();
        },
      );
    };
    run();
  }
  stop() {
    if (this.anim?.cancel) this.anim.cancel();
    else if (this.anim) this.sched.cancel(this.anim);
    this.anim = null;
    this.el?.remove();
    this.el = null;
  }
}

// The merged region's own name, fading in centred over a collapsing level.
export function collapseName(layer, name, [cx, cy]) {
  const lines = wrapLabel(name);
  const fs = 42;
  const lh = fs * 1.05;
  const text = svgEl('text', { class: 'jig-collapse-name', 'text-anchor': 'middle' });
  text.style.fontSize = `${fs}px`;
  lines.forEach((ln, i) => {
    const ts = svgEl('tspan', {
      x: f1(cx),
      y: f1(cy + (i - (lines.length - 1) / 2) * lh),
      'dominant-baseline': 'central',
    });
    ts.textContent = ln;
    text.append(ts);
  });
  text.style.opacity = '0';
  layer.append(text);
  text.getBoundingClientRect(); // commit opacity 0 so the fade runs
  text.style.transition = 'opacity 0.3s ease 0.06s';
  text.style.opacity = '1';
  return text;
}
