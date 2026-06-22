// The Board: one node's interactive puzzle. Owns the SVG, the pieces, and an
// explicit phase machine (building → intro → play → solved). All the hard parts
// the rewrite was meant to tame live here, but bounded and named: the drag/snap
// state machine, the explode intro, solved detection, and the camera zoom.
//
// The Board talks to its host only through callbacks, so navigation, chrome, and
// debug controls stay outside it.
import { svgEl, shuffle } from '../ui/dom.js';
import { store } from '../store.js';
import { isAdjacent } from './tree.js';
import { colorForIndex } from './palette.js';
import {
  VB_W,
  fullVB,
  pieceBox,
  projectChildren,
  scatterTranslate,
  facingInfo,
  ringContains,
} from './geometry.js';
import { Piece } from './piece.js';
import { labelOf } from './tree.js';
import { layoutLabels } from './labels.js';

const SNAP = 150; // connection radius, in board user units
const MAGNET = 290; // distance at which a piece starts to "feel" its connection
const ZOOM_MS = 580;
const SHUFFLE_MS = 620; // piece fly time; must outlast the CSS transform transition
const SETTLE_MS = 300; // spring-back time after panning a solved map
const SNAP_MS = 150; // the "click" pull-in when a piece connects
const TAP_SLOP = 22; // movement under this (user units) counts as a tap, not a drag
const PINCH_IN = 0.72; // pinch ratio that triggers zoom out
const PINCH_OUT = 1.34; // spread ratio that triggers zoom in

// Detects a shake from a stream of pointer positions: enough quick changes of
// direction within a short window, in ANY direction (a reversal is when the
// velocity flips by more than ~115°). Units are board user-space.
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

export class Board {
  #pendingTimer = 0; // a scheduled end-of-animation callback we may need to cancel

  // cbs: { onRemaining(n,total), onHint(text), onSolved(zoomable),
  //        onZoomInto(childId), onToast(msg), onSelectLeaf(id), onControls(j,s) }
  constructor(nodeId, cbs = {}) {
    this.nodeId = nodeId;
    this.cbs = cbs;
    this.pieces = [];
    this.phase = 'building';
    this.pointers = new Map(); // active pointerId -> {x,y} in board user space
    this.gesture = null; // current gesture: piece drag, pan, or pinch
    this.glowing = new Set(); // pieces currently showing a connection glow
    this.vbH = VB_W;
    this.svg = this.#initSvg();
  }

  #initSvg() {
    const svg = svgEl('svg', { class: 'jig', preserveAspectRatio: 'xMidYMid meet' });
    this.pieceLayer = svgEl('g');
    // Connection-edge glow sits above the pieces; labels above everything, so a
    // label is never painted over by a neighbouring piece's fill.
    this.glowLayer = svgEl('g', { class: 'jig-glows' });
    // A faint dashed line drawn between the two glowing edges as they near.
    this.connectorEl = svgEl('line', { class: 'jig-connector' });
    this.connectorEl.style.display = 'none';
    this.glowLayer.append(this.connectorEl);
    this.labelLayer = svgEl('g', { class: 'jig-labels' });
    this.fxLayer = svgEl('g', { class: 'jig-fx' }); // snap sparks, above everything
    svg.append(this.pieceLayer, this.glowLayer, this.labelLayer, this.fxLayer);
    // All gestures (piece drag, pan, pinch) are driven from the SVG root so we
    // can track multiple pointers; pieces are hit-tested from the event target.
    svg.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
    svg.addEventListener('pointermove', (e) => this.#onPointerMove(e));
    const up = (e) => this.#onPointerUp(e);
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    return svg;
  }

  // --- build & lifecycle ---------------------------------------------------

  // Create the pieces for `vbH` (the measured board aspect), placed assembled.
  build(vbH) {
    this.vbH = vbH;
    this.svg.setAttribute('viewBox', `0 0 ${VB_W} ${vbH}`);
    const geoms = projectChildren(this.nodeId, VB_W, vbH);
    const pieces = geoms.map(
      (geom, i) => new Piece(geom, { label: labelOf(geom.id), color: colorForIndex(i) }),
    );
    // Lay all labels out together so they can dodge each other and the small
    // pieces become leader-line callouts.
    const plans = layoutLabels(
      pieces.map((p) => ({ id: p.id, label: labelOf(p.id), geom: p.geom })),
      VB_W,
      vbH,
    );
    pieces.forEach((piece) => {
      piece.setLabel(plans.get(piece.id));
      piece.moveTo(0, 0); // start at the true (assembled) position
      this.pieceLayer.append(piece.g);
      this.glowLayer.append(piece.glowEl);
      this.labelLayer.append(piece.labelEl);
      this.pieces.push(piece);
    });
  }

  // Begin the level already assembled — we never auto-jumble; the player decides
  // when to scramble. `zoomOutFrom` reverse-zooms from the child we arrived from.
  start({ zoomOutFrom = null } = {}) {
    this.#snapAll();
    this.#enterSolved(false);
    if (zoomOutFrom) {
      const from = this.pieces.find((p) => p.id === zoomOutFrom);
      if (from) this.#animateZoom(this.#boxFor(from), fullVB(this.vbH));
    }
  }

  // Burst the assembled map apart into loose pieces for the player to rebuild.
  // Triggered by the Jumble button — there's no automatic scatter.
  jumble() {
    if (this.phase !== 'solved' && this.phase !== 'play') return;
    this.#cancelPending();
    this.#assignScatter();
    this.phase = 'jumbling';
    this.pieces.forEach((p) => p.unlock());
    this.#emitRemaining();
    this.#emitControls(); // mid-animation: both controls off
    this.cbs.onHint?.('Drag the neighbors together.');
    // Animate from assembled (0,0) out to the scatter spots.
    this.#animatePieces(
      (p) => [0, 0],
      (p) => [p.scatterTx, p.scatterTy],
      () => {
        this.phase = 'play';
        this.#emitControls();
      },
    );
  }

  // Snap everything home (the Solve button — gave up, or just want to move on).
  // No toast: a hand-assembled solve earns the celebration; this one doesn't.
  solve() {
    if (this.phase === 'solved' || this.phase === 'building') return;
    this.#cancelPending();
    this.phase = 'solving';
    this.#emitControls(); // mid-animation: both controls off
    // Fly every piece in to its true position, then lock + mark solved.
    this.#animatePieces(null, () => [0, 0], () => {
      this.#snapAll();
      this.#enterSolved(false);
    });
  }

  // Run a transform transition on every piece: place them at `from` (if given),
  // flush layout so the browser commits that as the start, switch to `to`, and
  // call `done` once the CSS transition has run. Transitions the CSS `transform`
  // PROPERTY (not the SVG attribute) so it animates on Safari/Firefox too.
  #animatePieces(from, to, done) {
    this.pieces.forEach((p) => {
      if (from) {
        const [fx, fy] = from(p);
        p.moveTo(fx, fy);
      }
      p.setExploding(true);
    });
    this.svg.getBoundingClientRect(); // force reflow → start state is committed
    this.pieces.forEach((p) => {
      const [tx, ty] = to(p);
      p.moveTo(tx, ty);
    });
    this.#pendingTimer = setTimeout(() => {
      this.pieces.forEach((p) => p.setExploding(false));
      done?.();
    }, SHUFFLE_MS);
  }

  #cancelPending() {
    if (this.#pendingTimer) {
      clearTimeout(this.#pendingTimer);
      this.#pendingTimer = 0;
    }
  }

  // Give each piece a fresh scatter target (shuffled, so a re-jumble looks new).
  #assignScatter() {
    shuffle(this.pieces).forEach((p, k, arr) => {
      const [tx, ty] = scatterTranslate(p.geom, k, arr.length, this.vbH);
      p.scatterTx = tx;
      p.scatterTy = ty;
    });
  }

  // --- snapping ------------------------------------------------------------

  #lockedPieces() {
    return this.pieces.filter((p) => p.locked);
  }

  // If `piece` is currently in a spot where it may connect, return where to lock
  // it ({ tx, ty }, plus an optional `seed` loose piece to lock alongside it for
  // the very first connection). Otherwise null. A connection always requires
  // TRUE border adjacency to whatever it's joining — never bridge a gap.
  #wouldConnect(piece) {
    const locked = this.#lockedPieces();
    if (locked.length) {
      const anchor = locked[0]; // all locked pieces share one translate
      const positioned = Math.hypot(piece.tx - anchor.tx, piece.ty - anchor.ty) < SNAP;
      if (positioned && locked.some((l) => isAdjacent(piece.id, l.id))) {
        return { tx: anchor.tx, ty: anchor.ty };
      }
      return null;
    }
    // No pieces placed yet: two loose neighbours can start the map together.
    for (const other of this.pieces) {
      if (other === piece || other.locked) continue;
      if (
        Math.hypot(piece.tx - other.tx, piece.ty - other.ty) < SNAP &&
        isAdjacent(piece.id, other.id)
      ) {
        return { tx: other.tx, ty: other.ty, seed: other };
      }
    }
    return null;
  }

  #place(piece, res) {
    // Where do the pieces join? Use the shared-edge midpoint for the snap spark.
    const m = this.#glowTarget(piece);
    let spark = null;
    if (m) {
      const info = facingInfo(piece.geom.ring, [res.tx, res.ty], m.target.geom.ring, [m.target.tx, m.target.ty]);
      if (info.mid) spark = [info.mid[0] + res.tx, info.mid[1] + res.ty];
    }
    // Pull it the last bit into place with a quick eased "click", then lock.
    piece.setSnapping(true);
    this.svg.getBoundingClientRect(); // commit current position as the start
    piece.moveTo(res.tx, res.ty);
    piece.lock();
    if (res.seed) res.seed.lock();
    setTimeout(() => piece.setSnapping(false), SNAP_MS + 40);
    if (spark) this.#snapBurst(spark);
    store.markSeen(piece.id);
    this.#refresh();
  }

  // A burst of lines radiating from the join, plus a quick expanding ring — the
  // satisfying "snap".
  #snapBurst([px, py]) {
    const g = svgEl('g', { class: 'jig-burst' });
    const ring = svgEl('circle', { class: 'jig-burst-ring', cx: 0, cy: 0, r: 30 });
    g.append(ring);
    const N = 10;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      g.append(svgEl('line', {
        x1: (Math.cos(a) * 18).toFixed(1), y1: (Math.sin(a) * 18).toFixed(1),
        x2: (Math.cos(a) * 64).toFixed(1), y2: (Math.sin(a) * 64).toFixed(1),
      }));
    }
    this.fxLayer.append(g);
    const t0 = performance.now();
    const dur = 420;
    const ease = (t) => 1 - Math.pow(1 - t, 2);
    const frame = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const s = 0.45 + ease(k) * 1.45;
      g.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) scale(${s.toFixed(3)})`;
      g.style.opacity = (1 - k * k).toFixed(3);
      if (k < 1) requestAnimationFrame(frame);
      else g.remove();
    };
    requestAnimationFrame(frame);
  }

  #snapAll() {
    this.pieces.forEach((p) => {
      p.moveTo(0, 0);
      p.lock();
    });
  }

  #refresh() {
    this.#emitRemaining();
    if (this.pieces.every((p) => p.locked) && this.phase !== 'solved') {
      this.#enterSolved(true);
    } else {
      this.#emitControls();
    }
  }

  #emitRemaining() {
    const remaining = this.pieces.filter((p) => !p.locked).length;
    this.cbs.onRemaining?.(remaining, this.pieces.length);
  }

  // Tell the host whether a Solve shortcut makes sense — only while assembling
  // (an already-solved board has nothing to solve). Scrambling is by shake, so
  // there's no Jumble control to manage.
  #emitControls() {
    this.cbs.onControls?.(this.phase === 'play');
  }

  #enterSolved(withToast) {
    this.phase = 'solved';
    const zoomable = this.pieces.some((p) => p.zoomable);
    // Groups become zoom targets; leaves become tap-for-info targets.
    this.pieces.forEach((p) => (p.zoomable ? p.markZoomable() : p.markSelectable()));
    this.cbs.onSolved?.(zoomable);
    this.#emitControls();
    if (withToast) this.cbs.onToast?.(`${labelOf(this.nodeId)} solved!`);
  }

  // --- input / gestures ----------------------------------------------------
  // Everything is driven from a small pointer map on the SVG root, so we can tell
  // apart: a single-pointer piece drag (assembling), a single-pointer press on a
  // solved map (tap to zoom/info, or drag to pan — and shake to scramble), and a
  // two-pointer pinch (spread = zoom in, pinch = zoom out).

  #toUser(evt) {
    const pt = this.svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const u = pt.matrixTransform(this.svg.getScreenCTM().inverse());
    return [u.x, u.y];
  }

  // The piece under a pointer event (walk up from the hit path to its group).
  #pieceFromEvent(e) {
    let el = e.target;
    while (el && el !== this.svg) {
      if (el.classList && el.classList.contains('jig-piece')) {
        return this.pieces.find((p) => p.g === el) || null;
      }
      el = el.parentNode;
    }
    return null;
  }

  // The piece whose shape covers board point (ux,uy) — for the pinch midpoint.
  #pieceAt(ux, uy) {
    for (const p of this.pieces) {
      if (ringContains(p.geom.ring, ux - p.tx, uy - p.ty)) return p;
    }
    return null;
  }

  #onPointerDown(e) {
    if (this.phase !== 'play' && this.phase !== 'solved') return; // not mid-animation
    e.preventDefault();
    try {
      this.svg.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events (tests) may have no real pointer to capture */
    }
    const [ux, uy] = this.#toUser(e);
    this.pointers.set(e.pointerId, { x: ux, y: uy });

    if (this.pointers.size >= 2) {
      this.#beginPinch();
      return;
    }
    const piece = this.#pieceFromEvent(e);
    if (this.phase === 'play') {
      this.gesture = piece ? this.#beginPieceDrag(piece, ux, uy) : null;
    } else {
      this.#beginSolvedGesture(piece, ux, uy); // tap, pan, or shake
    }
  }

  #onPointerMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const [ux, uy] = this.#toUser(e);
    this.pointers.set(e.pointerId, { x: ux, y: uy });
    const g = this.gesture;
    if (!g) return;
    if (g.type === 'pinch') this.#updatePinch();
    else if (g.type === 'piece') this.#movePieceDrag(ux, uy);
    else if (g.type === 'pan') this.#movePan(ux, uy);
  }

  #onPointerUp(e) {
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (!g) return;
    if (g.type === 'pinch') {
      // ignore the remainder until every finger is up (avoids a stray pan)
      this.gesture = this.pointers.size > 0 ? { type: 'dead' } : null;
      return;
    }
    if (g.type === 'dead') {
      if (this.pointers.size === 0) this.gesture = null;
      return;
    }
    if (g.type === 'piece') this.#endPieceDrag();
    else if (g.type === 'pan') this.#endPan();
    this.gesture = null;
  }

  // --- pinch (two fingers) ---
  #beginPinch() {
    this.#abortSingleGesture();
    const [a, b] = [...this.pointers.values()];
    this.gesture = {
      type: 'pinch',
      startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      fired: false,
    };
  }

  #updatePinch() {
    const g = this.gesture;
    if (g.fired || this.pointers.size < 2) return;
    const [a, b] = [...this.pointers.values()];
    const ratio = Math.hypot(a.x - b.x, a.y - b.y) / g.startDist;
    if (ratio >= PINCH_OUT) {
      g.fired = true;
      if (this.phase === 'solved') {
        const piece = this.#pieceAt(g.mid.x, g.mid.y);
        if (piece && piece.zoomable) this.#zoomInto(piece);
      }
    } else if (ratio <= PINCH_IN) {
      g.fired = true;
      this.cbs.onZoomOut?.();
    }
  }

  #abortSingleGesture() {
    const g = this.gesture;
    if (!g) return;
    if (g.type === 'piece') {
      if (g.mode === 'free') {
        g.piece.setDragging(false);
        this.#clearGlow();
      } else {
        g.starts.forEach((s) => s.p.setDragging(false));
      }
    } else if (g.type === 'pan' && g.moved && !g.exploded) {
      this.pieces.forEach((p) => p.setDragging(false));
      this.#springBack();
    }
    this.gesture = null;
  }

  // --- single-pointer piece drag (assembling) ---
  #beginPieceDrag(piece, ux, uy) {
    if (piece.locked) {
      const group = this.#lockedPieces(); // drag the whole assembled cluster
      group.forEach((p) => p.setDragging(true));
      return { type: 'piece', mode: 'group', ux, uy, starts: group.map((p) => ({ p, tx: p.tx, ty: p.ty })) };
    }
    this.pieceLayer.append(piece.g); // raise above siblings
    this.glowLayer.append(piece.glowEl);
    this.labelLayer.append(piece.labelEl);
    piece.setDragging(true);
    return { type: 'piece', mode: 'free', piece, ux, uy, tx: piece.tx, ty: piece.ty };
  }

  #movePieceDrag(ux, uy) {
    const g = this.gesture;
    const dx = ux - g.ux;
    const dy = uy - g.uy;
    if (g.mode === 'free') {
      g.piece.moveTo(g.tx + dx, g.ty + dy);
      this.#updateGlow(g.piece);
    } else {
      for (const s of g.starts) s.p.moveTo(s.tx + dx, s.ty + dy);
    }
  }

  #endPieceDrag() {
    const g = this.gesture;
    if (g.mode === 'free') {
      g.piece.setDragging(false);
      this.#clearGlow();
      const res = this.#wouldConnect(g.piece);
      if (res) this.#place(g.piece, res);
    } else {
      g.starts.forEach((s) => s.p.setDragging(false));
    }
  }

  // --- solved-map press: tap, pan, or shake-to-scramble ---
  #beginSolvedGesture(piece, ux, uy) {
    this.gesture = {
      type: 'pan',
      piece,
      ux,
      uy,
      moved: false,
      exploded: false,
      starts: this.pieces.map((p) => ({ p, tx: p.tx, ty: p.ty })),
      shake: new ShakeDetector(),
    };
  }

  #movePan(ux, uy) {
    const g = this.gesture;
    const dx = ux - g.ux;
    const dy = uy - g.uy;
    if (!g.moved && Math.hypot(dx, dy) > TAP_SLOP) {
      g.moved = true;
      this.pieces.forEach((p) => p.setDragging(true));
    }
    if (g.moved) for (const s of g.starts) s.p.moveTo(s.tx + dx, s.ty + dy);
    g.shake.push(ux, uy, performance.now());
    if (g.moved && g.shake.shaking()) {
      g.exploded = true;
      this.pieces.forEach((p) => p.setDragging(false));
      this.gesture = null;
      this.jumble(); // shake it apart
    }
  }

  #endPan() {
    const g = this.gesture;
    if (!g.moved) {
      // A tap: groups zoom in, leaves open their info card.
      if (g.piece && g.piece.zoomable) this.#zoomInto(g.piece);
      else if (g.piece) this.cbs.onSelectLeaf?.(g.piece.id);
    } else if (!g.exploded) {
      this.pieces.forEach((p) => p.setDragging(false));
      this.#springBack(); // panned but not shaken — settle the map back home
    }
  }

  #springBack() {
    this.pieces.forEach((p) => p.setSettling(true));
    this.svg.getBoundingClientRect(); // reflow so the transition runs
    this.pieces.forEach((p) => p.moveTo(0, 0));
    setTimeout(() => this.pieces.forEach((p) => p.setSettling(false)), SETTLE_MS);
  }

  // Called by the app on a device shake (phone) — scramble if we're solved.
  shakeToScramble() {
    if (this.phase === 'solved') this.jumble();
  }

  // --- connection glow -----------------------------------------------------
  // As a loose piece nears where it would connect, the EDGE that will mate lights
  // up on both pieces — stronger the closer they get, full at the snap radius.

  // The piece this one would connect to, and how far (the snap metric), or null.
  #glowTarget(piece) {
    const locked = this.#lockedPieces();
    if (locked.length) {
      const neighbours = locked.filter((l) => isAdjacent(piece.id, l.id));
      if (!neighbours.length) return null;
      const anchor = locked[0]; // all locked pieces share one translate
      const dist = Math.hypot(piece.tx - anchor.tx, piece.ty - anchor.ty);
      let target = neighbours[0];
      let best = Infinity;
      for (const l of neighbours) {
        const d = Math.hypot(piece.centerX - l.centerX, piece.centerY - l.centerY);
        if (d < best) {
          best = d;
          target = l;
        }
      }
      return { target, dist };
    }
    // No pieces placed yet: home toward the nearest adjacent loose neighbour.
    let target = null;
    let dist = Infinity;
    for (const other of this.pieces) {
      if (other === piece || other.locked || !isAdjacent(piece.id, other.id)) continue;
      const d = Math.hypot(piece.tx - other.tx, piece.ty - other.ty);
      if (d < dist) {
        dist = d;
        target = other;
      }
    }
    return target ? { target, dist } : null;
  }

  #updateGlow(piece) {
    const next = new Map();
    let connector = null;
    const m = this.#glowTarget(piece);
    if (m && m.dist < MAGNET) {
      const glow = Math.max(0, Math.min(1, (MAGNET - m.dist) / (MAGNET - SNAP)));
      // Light up the TRUE shared border: compute it with the piece placed where
      // it will SNAP (the target's translate), not where it's currently dragged,
      // so only the correct edge glows however you approach.
      const connectT = [m.target.tx, m.target.ty];
      const aInfo = facingInfo(piece.geom.ring, connectT, m.target.geom.ring, connectT);
      const bInfo = facingInfo(m.target.geom.ring, connectT, piece.geom.ring, connectT);
      next.set(piece, { glow, d: aInfo.d });
      next.set(m.target, { glow, d: bInfo.d });
      // A faint line joining the two glowing edges (in board world coords).
      if (aInfo.mid && bInfo.mid) {
        connector = {
          glow,
          x1: aInfo.mid[0] + piece.tx, y1: aInfo.mid[1] + piece.ty,
          x2: bInfo.mid[0] + m.target.tx, y2: bInfo.mid[1] + m.target.ty,
        };
      }
    }
    for (const p of this.glowing) if (!next.has(p)) p.setGlow(0, '');
    for (const [p, v] of next) p.setGlow(v.glow, v.d);
    this.glowing = new Set(next.keys());
    this.#setConnector(connector);
  }

  #setConnector(c) {
    if (c) {
      this.connectorEl.setAttribute('x1', c.x1.toFixed(1));
      this.connectorEl.setAttribute('y1', c.y1.toFixed(1));
      this.connectorEl.setAttribute('x2', c.x2.toFixed(1));
      this.connectorEl.setAttribute('y2', c.y2.toFixed(1));
      this.connectorEl.style.setProperty('--glow', c.glow.toFixed(3));
      this.connectorEl.style.display = '';
    } else {
      this.connectorEl.style.display = 'none';
    }
  }

  #clearGlow() {
    for (const p of this.glowing) p.setGlow(0, '');
    this.glowing.clear();
    this.#setConnector(null);
  }

  // --- camera zoom ---------------------------------------------------------

  // A zoom box around a piece at its CURRENT position (so it's accurate even if
  // the assembled map ended up off-centre).
  #boxFor(piece) {
    const { geom, tx, ty } = piece;
    return pieceBox({ minX: geom.minX + tx, minY: geom.minY + ty, w: geom.w, h: geom.h });
  }

  #zoomInto(piece) {
    if (!piece.zoomable) return;
    this.phase = 'zooming';
    this.pieces.forEach((p) => p !== piece && p.fadeOut());
    this.#animateZoom(fullVB(this.vbH), this.#boxFor(piece), () =>
      this.cbs.onZoomInto?.(piece.id),
    );
  }

  #animateZoom(from, to, onDone) {
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const frame = (now) => {
      const k = Math.min(1, (now - t0) / ZOOM_MS);
      const e = ease(k);
      this.svg.setAttribute('viewBox', from.map((s, i) => (s + (to[i] - s) * e).toFixed(1)).join(' '));
      if (k < 1) requestAnimationFrame(frame);
      else onDone?.();
    };
    requestAnimationFrame(frame);
  }
}
