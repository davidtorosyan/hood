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
} from './geometry.js';
import { Piece } from './piece.js';
import { labelOf } from './tree.js';
import { layoutLabels } from './labels.js';

const SNAP = 150; // connection radius, in board user units
const MAGNET = 440; // distance at which a piece starts to "feel" its connection
const ZOOM_MS = 580;
const SHUFFLE_MS = 620; // piece fly time; must outlast the CSS transform transition

export class Board {
  #pendingTimer = 0; // a scheduled end-of-animation callback we may need to cancel

  // cbs: { onRemaining(n,total), onHint(text), onSolved(zoomable),
  //        onZoomInto(childId), onToast(msg), onSelectLeaf(id), onControls(j,s) }
  constructor(nodeId, cbs = {}) {
    this.nodeId = nodeId;
    this.cbs = cbs;
    this.pieces = [];
    this.phase = 'building';
    this.drag = null;
    this.glowing = new Set(); // pieces currently showing a magnet glow
    this.vbH = VB_W;
    this.svg = this.#initSvg();
  }

  #initSvg() {
    const svg = svgEl('svg', { class: 'jig', preserveAspectRatio: 'xMidYMid meet' });
    this.pieceLayer = svgEl('g');
    // Labels live in their own layer above every piece, so a label is never
    // painted over by a neighbouring piece's fill.
    this.labelLayer = svgEl('g', { class: 'jig-labels' });
    svg.append(this.pieceLayer, this.labelLayer);
    svg.addEventListener('pointermove', (e) => this.#onMove(e));
    const end = () => this.#endDrag();
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
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
      piece.g.addEventListener('pointerdown', (e) => this.#startDrag(piece, e));
      this.pieceLayer.append(piece.g);
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
    piece.moveTo(res.tx, res.ty);
    piece.lock();
    if (res.seed) res.seed.lock();
    store.markSeen(piece.id);
    this.#refresh();
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

  // Tell the host which controls make sense now: you can't Jumble an already-
  // fully-jumbled board (nothing placed), nor Solve an already-solved one.
  #emitControls() {
    const locked = this.pieces.filter((p) => p.locked).length;
    let canJumble = false;
    let canSolve = false;
    if (this.phase === 'solved') canJumble = true;
    else if (this.phase === 'play') {
      canJumble = locked > 0;
      canSolve = true;
    }
    this.cbs.onControls?.(canJumble, canSolve);
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

  // --- dragging ------------------------------------------------------------

  #toUser(evt) {
    const pt = this.svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const u = pt.matrixTransform(this.svg.getScreenCTM().inverse());
    return [u.x, u.y];
  }

  #startDrag(piece, e) {
    // When solved, a piece is a target, not draggable: a group zooms in, a leaf
    // (individual neighborhood) opens its info card.
    if (this.phase === 'solved') {
      e.preventDefault();
      if (piece.zoomable) this.#zoomInto(piece);
      else this.cbs.onSelectLeaf?.(piece.id);
      return;
    }
    if (this.phase !== 'play') return;
    e.preventDefault();
    const [ux, uy] = this.#toUser(e);
    if (piece.locked) {
      // Drag the whole assembled cluster together.
      const group = this.#lockedPieces();
      group.forEach((p) => p.setDragging(true));
      this.drag = { mode: 'group', ux, uy, starts: group.map((p) => ({ p, tx: p.tx, ty: p.ty })) };
    } else {
      this.pieceLayer.append(piece.g); // raise above sibling pieces
      this.labelLayer.append(piece.labelEl); // and its label above sibling labels
      piece.setDragging(true);
      this.drag = { mode: 'free', piece, ux, uy, tx: piece.tx, ty: piece.ty };
    }
    // Capture on the stable SVG root, NOT the piece — re-parenting a piece would
    // cancel capture and drop the drag mid-gesture on touch.
    this.svg.setPointerCapture(e.pointerId);
  }

  #onMove(e) {
    if (!this.drag) return;
    const [ux, uy] = this.#toUser(e);
    const dx = ux - this.drag.ux;
    const dy = uy - this.drag.uy;
    if (this.drag.mode === 'free') {
      const piece = this.drag.piece;
      piece.moveTo(this.drag.tx + dx, this.drag.ty + dy);
      this.#updateMagnet(piece);
    } else {
      for (const s of this.drag.starts) s.p.moveTo(s.tx + dx, s.ty + dy);
    }
  }

  #endDrag() {
    if (!this.drag) return;
    if (this.drag.mode === 'free') {
      const piece = this.drag.piece;
      piece.setDragging(false);
      this.#clearGlow();
      const res = this.#wouldConnect(piece);
      if (res) this.#place(piece, res);
    } else {
      this.drag.starts.forEach((s) => s.p.setDragging(false));
    }
    this.drag = null;
  }

  // --- magnetic glow -------------------------------------------------------
  // As a loose piece nears the spot where it would connect, it and the piece
  // it's joining glow along their border — stronger the closer they get, full
  // at the snap radius — so you can feel the connection before releasing.

  // The piece this one would connect to, and how far (in the same metric the
  // snap uses), or null if there's no eligible neighbour to home in on.
  #magnetTarget(piece) {
    const locked = this.#lockedPieces();
    if (locked.length) {
      const neighbours = locked.filter((l) => isAdjacent(piece.id, l.id));
      if (!neighbours.length) return null;
      const anchor = locked[0]; // all locked pieces share one translate
      const dist = Math.hypot(piece.tx - anchor.tx, piece.ty - anchor.ty);
      // Glow the adjacent placed piece whose shape is nearest right now.
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

  #updateMagnet(piece) {
    const next = new Map();
    const m = this.#magnetTarget(piece);
    if (m && m.dist < MAGNET) {
      const glow = Math.max(0, Math.min(1, (MAGNET - m.dist) / (MAGNET - SNAP)));
      next.set(piece, glow);
      if (m.target) next.set(m.target, glow);
    }
    for (const p of this.glowing) if (!next.has(p)) p.setGlow(0);
    for (const [p, g] of next) p.setGlow(g);
    this.glowing = new Set(next.keys());
  }

  #clearGlow() {
    for (const p of this.glowing) p.setGlow(0);
    this.glowing.clear();
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
