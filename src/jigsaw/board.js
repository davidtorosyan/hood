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

const SNAP = 150; // connection radius, in board user units
const ZOOM_MS = 580;

export class Board {
  // cbs: { onRemaining(n,total), onHint(text), onSolved(zoomable),
  //        onZoomInto(childId), onToast(msg) }
  constructor(nodeId, cbs = {}) {
    this.nodeId = nodeId;
    this.cbs = cbs;
    this.pieces = [];
    this.phase = 'building';
    this.drag = null;
    this.vbH = VB_W;
    this.svg = this.#initSvg();
  }

  #initSvg() {
    const svg = svgEl('svg', { class: 'jig', preserveAspectRatio: 'xMidYMid meet' });
    this.pieceLayer = svgEl('g');
    svg.append(this.pieceLayer);
    svg.addEventListener('pointermove', (e) => this.#onMove(e));
    const end = () => this.#endDrag();
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    return svg;
  }

  // --- build & lifecycle ---------------------------------------------------

  // Create the pieces for `vbH` (the measured board aspect) and scatter them.
  build(vbH) {
    this.vbH = vbH;
    this.svg.setAttribute('viewBox', `0 0 ${VB_W} ${vbH}`);
    const geoms = projectChildren(this.nodeId, VB_W, vbH);
    const pieces = geoms.map(
      (geom, i) => new Piece(geom, { label: labelOf(geom.id), color: colorForIndex(i) }),
    );
    shuffle(pieces).forEach((piece, k, arr) => {
      const [tx, ty] = scatterTranslate(piece.geom, k, arr.length, vbH);
      piece.moveTo(tx, ty);
      piece.g.addEventListener('pointerdown', (e) => this.#startDrag(piece, e));
      this.pieceLayer.append(piece.g);
      this.pieces.push(piece);
    });
    this.#emitRemaining();
  }

  // Begin the puzzle. `assembled` shows it already solved (used for skip-intro
  // and when arriving from a child); `zoomOutFrom` reverse-zooms from that child.
  start({ assembled = false, zoomOutFrom = null } = {}) {
    if (assembled) {
      this.#snapAll();
      this.#enterSolved(false);
      if (zoomOutFrom) {
        const from = this.pieces.find((p) => p.id === zoomOutFrom);
        if (from) this.#animateZoom(this.#boxFor(from), fullVB(this.vbH));
      }
    } else {
      this.#playIntro();
    }
  }

  // Show assembled, burst apart to the scatter spots, then hand control over.
  #playIntro() {
    this.phase = 'intro';
    this.cbs.onHint?.('Putting the map together…');
    this.pieces.forEach((p) => {
      p.setExploding(true);
      p.g.setAttribute('transform', 'translate(0 0)'); // start assembled
    });
    requestAnimationFrame(() => {
      setTimeout(() => {
        this.pieces.forEach((p) => p.applyTransform()); // fly out to scatter
        this.cbs.onHint?.('Fit the pieces back together.');
        setTimeout(() => {
          this.pieces.forEach((p) => p.setExploding(false));
          this.phase = 'play';
        }, 650);
      }, 850);
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
    }
  }

  #emitRemaining() {
    const remaining = this.pieces.filter((p) => !p.locked).length;
    this.cbs.onRemaining?.(remaining, this.pieces.length);
  }

  #enterSolved(withToast) {
    this.phase = 'solved';
    const zoomable = this.pieces.some((p) => p.zoomable);
    if (zoomable) this.pieces.forEach((p) => p.markZoomable());
    this.cbs.onSolved?.(zoomable);
    if (withToast) this.cbs.onToast?.(`${labelOf(this.nodeId)} solved!`);
  }

  // Debug: jump straight to solved. `instant` skips the toast/celebration.
  forceSolve() {
    if (this.phase === 'solved') return;
    this.#snapAll();
    this.#enterSolved(false);
  }

  // Debug: auto-solve only if we're already in play (mirrors the old "Solve").
  solveAll() {
    if (this.phase !== 'play') return;
    this.#snapAll();
    this.#refresh();
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
    // When solved, pieces become zoom targets instead of draggable.
    if (this.phase === 'solved') {
      if (piece.zoomable) {
        e.preventDefault();
        this.#zoomInto(piece);
      }
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
      this.pieceLayer.append(piece.g); // raise above siblings
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
      piece.setNear(!!this.#wouldConnect(piece));
    } else {
      for (const s of this.drag.starts) s.p.moveTo(s.tx + dx, s.ty + dy);
    }
  }

  #endDrag() {
    if (!this.drag) return;
    if (this.drag.mode === 'free') {
      const piece = this.drag.piece;
      piece.setDragging(false);
      piece.setNear(false);
      const res = this.#wouldConnect(piece);
      if (res) this.#place(piece, res);
    } else {
      this.drag.starts.forEach((s) => s.p.setDragging(false));
    }
    this.drag = null;
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
    this.pieces.forEach((p) => {
      if (p === piece) return;
      p.g.style.transition = 'opacity 0.4s ease';
      p.g.style.opacity = '0';
    });
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
