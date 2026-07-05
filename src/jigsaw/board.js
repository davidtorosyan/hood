// The Board: one node's interactive puzzle. Owns the SVG, the pieces, and an
// explicit phase machine (building → intro → play → solved). All the hard parts
// the rewrite was meant to tame live here, but bounded and named: the drag/snap
// state machine, the explode intro, solved detection, and the camera zoom.
//
// The Board talks to its host only through callbacks, so navigation, chrome, and
// debug controls stay outside it.
import { el, svgEl, shuffle } from '../ui/dom.js';
import { store } from '../store.js';
import { isAdjacent } from './tree.js';
import { colorForIndex } from './palette.js';
import {
  VB_W,
  FILL,
  CANVAS_INSET,
  layoutFor,
  fullVB,
  projectChildren,
  trayScatter,
  facingInfo,
  ringContains,
} from './geometry.js';

// A precise pointer (mouse/trackpad) doesn't obscure the piece under it, so on
// desktop we drag pieces directly — no "paddle" lift that keeps a fingertip clear.
const HAS_MOUSE = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
import { Piece } from './piece.js';
import { labelOf } from './tree.js';
import { layoutLabels, wrapLabel } from './labels.js';

// The connection radius scales with the SMALLER mating piece, so a small piece
// only connects when its shared edge is genuinely close — not whenever it drifts
// within a big fixed radius (which, for a small piece, meant the glow fired even
// while it overlapped the map from the wrong side, borders not facing).
const SNAP_FRAC = 0.5; // snap radius as a fraction of the smaller piece's min dimension
const MAGNET_FRAC = 0.72; // where the glow starts to feel the connection
const SNAP_MIN = 48;
const SNAP_MAX = 150;
const MAGNET_MIN = 74;
const MAGNET_MAX = 210;
const PADDLE_LIFT = 300; // how far above the finger a held piece floats (user units)
const ZOOM_MS = 580;
const COLLAPSE_MS = 450; // pieces smoosh into the parent region before zooming out
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

  // cbs: { onHint(text), onSolved(zoomable), onPersist(),
  //        onZoomInto(childId), onToast(msg), onSelectLeaf(id), onAction(mode) }
  constructor(nodeId, cbs = {}) {
    this.nodeId = nodeId;
    this.cbs = cbs;
    this.pieces = [];
    this.phase = 'building';
    this.pointers = new Map(); // active pointerId -> {x,y} in board user space
    this.gesture = null; // current gesture: piece drag, pan, or pinch
    this.glowing = new Set(); // pieces currently showing a connection glow
    this.seed = null; // the anchor piece left in place to build around after a scramble
    this.lift = HAS_MOUSE ? 0 : PADDLE_LIFT; // no paddle lift when dragging with a mouse
    this.layout = layoutFor(VB_W); // updated per measured aspect in build()
    this.vbH = VB_W;
    this.svg = this.#initSvg();
    this.root = this.#initStage(); // the two fixed canvas panels + the svg over them
  }

  // The board stage: two fixed CSS panels (the build canvas + the tray canvas,
  // always present) with the transparent SVG layered over them. The panels are
  // chrome — they don't zoom with the camera. Positions are set in #positionPanels
  // once the board is measured (they depend on portrait vs landscape).
  #initStage() {
    this.buildPanel = el('div', { class: 'jig-canvas jig-canvas-build' });
    this.trayPanel = el('div', { class: 'jig-canvas jig-canvas-tray' });
    this.trayHint = el('div', { class: 'jig-tray-hint' }, '');
    // The solved-board tray content — the Scramble button plus the "what next"
    // tips beneath it. It sits ABOVE the svg so the button is clickable; the svg
    // captures everything else. Shown once the map is solved.
    this.scrambleBtn = el('button', { class: 'jig-btn jig-scramble', onClick: () => this.jumble() }, '🔀 Scramble');
    this.tipZoom = el('div', { class: 'jig-tip' }, '');
    this.traySolved = el('div', { class: 'jig-tray-solved' }, [this.scrambleBtn, this.tipZoom]);
    this.trayHint.style.display = 'none';
    this.traySolved.style.display = 'none';
    return el('div', { class: 'jig-stage' }, [
      this.buildPanel, this.trayPanel, this.trayHint, this.svg, this.traySolved,
    ]);
  }

  // Position the two panels (and the tray content) for the current layout —
  // stacked for a portrait board, side-by-side for a landscape one.
  #positionPanels() {
    const pct = (v) => `${(v * 100).toFixed(2)}%`;
    const [bx0, by0, bx1, by1] = this.layout.build;
    const [tx0, ty0, tx1, ty1] = this.layout.tray;
    const box = (elm, [x0, y0, x1, y1]) => Object.assign(elm.style, {
      left: pct(x0), right: pct(1 - x1), top: pct(y0), bottom: pct(1 - y1), height: 'auto',
    });
    box(this.buildPanel, this.layout.build);
    box(this.trayPanel, this.layout.tray);
    // Tray content spans the tray's width, centred in it.
    Object.assign(this.traySolved.style, {
      left: pct(tx0), right: pct(1 - tx1), top: pct((ty0 + ty1) / 2), transform: 'translateY(-50%)',
    });
    // The "drag pieces …" hint: in the gap for portrait, at the top of the tray
    // strip for landscape.
    if (this.layout.wide) {
      this.trayHint.textContent = 'drag pieces over to the map';
      Object.assign(this.trayHint.style, { left: pct(tx0), right: pct(1 - tx1), top: pct(ty0 + 0.05) });
    } else {
      this.trayHint.textContent = 'drag pieces up to build';
      Object.assign(this.trayHint.style, { left: pct(bx0), right: pct(1 - bx1), top: pct((by1 + ty0) / 2) });
    }
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
    // The drag "paddle": a dot at the finger and a stick up to the lifted piece,
    // so a held piece floats clear of the thumb. Lives on top; hidden by default.
    this.paddleEl = svgEl('g', { class: 'jig-paddle' });
    this.paddleLine = svgEl('line', { class: 'jig-paddle-line' });
    this.paddleDot = svgEl('circle', { class: 'jig-paddle-dot', r: 30 });
    this.paddleEl.append(this.paddleLine, this.paddleDot);
    this.paddleEl.style.display = 'none';
    svg.append(this.pieceLayer, this.glowLayer, this.labelLayer, this.fxLayer, this.paddleEl);
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
  build(vbH, mode) {
    this.vbH = vbH;
    this.layout = layoutFor(vbH); // portrait (stacked) or landscape (side by side)
    this.#positionPanels();
    this.svg.setAttribute('viewBox', `0 0 ${VB_W} ${vbH}`);
    const geoms = projectChildren(this.nodeId, vbH, mode);
    const pieces = geoms.map(
      (geom, i) => new Piece(geom, { label: labelOf(geom.id), color: colorForIndex(i) }),
    );
    // Label size scales with the build canvas width, so names stay proportional to
    // the map whether it fills a wide (portrait) or a narrower (landscape) canvas.
    const buildW = (this.layout.build[2] - this.layout.build[0]) * VB_W;
    const fs = Math.max(18, Math.min(34, (33 * buildW) / 950));
    const plans = layoutLabels(
      pieces.map((p) => ({ id: p.id, label: labelOf(p.id), geom: p.geom })),
      fs,
    );
    pieces.forEach((piece) => {
      piece.setLabel(plans.get(piece.id));
      piece.moveTo(0, 0); // start at the true (assembled) position
      this.pieceLayer.append(piece.g);
      this.glowLayer.append(piece.glowEl);
      this.labelLayer.append(piece.labelEl);
      this.pieces.push(piece);
    });
    this.#initClusters();
  }

  // Begin the level. Normally already assembled (the player decides when to
  // scramble); `restore` re-hydrates a saved in-progress puzzle instead.
  // `zoomOutFrom` reverse-zooms from the child we arrived from.
  start({ zoomOutFrom = null, restore = null } = {}) {
    if (restore && restore.phase === 'play') {
      this.#restorePlay(restore);
    } else {
      this.#snapAll();
      this.#enterSolved({ played: false }); // loaded assembled — not "solved by you"
    }
    if (zoomOutFrom) {
      const from = this.pieces.find((p) => p.id === zoomOutFrom);
      if (from) this.#animateZoom(this.#boxFor(from), fullVB(this.vbH));
    }
  }

  // Serialize the puzzle for persistence: null when solved (a reload rebuilds it
  // assembled), otherwise the seed + every piece's position and whether it's part
  // of the resolved section, so an in-progress scramble comes back intact.
  serialize() {
    // 'jumbling' counts: the pieces are already at their scatter targets.
    if (this.phase !== 'play' && this.phase !== 'jumbling') return null;
    const resolved = this.#resolved();
    const pieces = {};
    for (const p of this.pieces) {
      pieces[p.id] = [Math.round(p.tx), Math.round(p.ty), p.cluster === resolved ? 1 : 0];
    }
    return { phase: 'play', seed: this.seed?.id ?? null, pieces };
  }

  // Re-hydrate a saved in-progress scramble. Falls back to assembled if the saved
  // pieces don't match this node (e.g. the data changed under an old save).
  #restorePlay(saved) {
    const byId = new Map(this.pieces.map((p) => [p.id, p]));
    if (!saved.pieces || !this.pieces.every((p) => saved.pieces[p.id])) {
      this.#snapAll();
      this.#enterSolved({ played: false });
      return;
    }
    const resolved = new Set();
    for (const p of this.pieces) {
      const [tx, ty, placed] = saved.pieces[p.id];
      p.moveTo(tx, ty);
      if (placed) resolved.add(p);
    }
    this.seed = byId.get(saved.seed) || null;
    if (this.seed) resolved.add(this.seed);
    for (const p of this.pieces) {
      if (resolved.has(p)) {
        p.cluster = resolved;
        p.setPlaced(true);
      } else {
        p.cluster = new Set([p]);
        p.setPlaced(false);
      }
    }
    if (this.seed) this.seed.g.classList.add('seed');
    this.phase = 'play';
    this.trayHint.style.display = '';
    this.traySolved.style.display = 'none';
    this.cbs.onHint?.('');
    this.#emitProgress();
    this.#emitControls();
  }

  #persist() {
    this.cbs.onPersist?.();
  }

  // Burst the assembled map apart into loose pieces for the player to rebuild.
  // One piece — the seed — is left in place (in the build canvas) as the anchor to
  // build around; the rest scatter into the tray below. Triggered by the Scramble
  // button (or a shake) — there's no automatic scatter.
  jumble() {
    if (this.phase !== 'solved' && this.phase !== 'play') return;
    this.#cancelPending();
    this.#assignSeedScatter();
    this.phase = 'jumbling';
    this.pieces.forEach((p) => p.reset());
    this.#initClusters(); // every piece back to its own loose cluster
    // The seed reads as already-placed (its map colour + a highlight), so it's
    // clearly the thing to build onto.
    this.seed.setPlaced(true);
    this.seed.g.classList.add('seed');
    // The "drag pieces …" hint shows in the portrait gap; in landscape the tray is
    // full of pieces and the split is self-evident, so skip it.
    this.trayHint.style.display = this.layout.wide ? 'none' : '';
    this.traySolved.style.display = 'none';
    this.#emitProgress();
    this.#emitControls(); // mid-animation: both controls off
    this.cbs.onHint?.('');
    // Animate from assembled (0,0) out to the scatter spots.
    this.#animatePieces(
      (p) => [0, 0],
      (p) => [p.scatterTx, p.scatterTy],
      () => {
        this.phase = 'play';
        this.#emitControls();
        this.#persist();
      },
    );
    this.#persist(); // save the scramble immediately (pieces are already at target)
  }

  // Snap everything home (the Solve button — gave up, or just want to move on).
  // No toast: a hand-assembled solve earns the celebration; this one doesn't.
  solve() {
    if (this.phase === 'solved' || this.phase === 'building') return;
    this.#cancelPending();
    this.phase = 'solving';
    this.#emitControls();
    // Fly every piece in to its true position, then lock + mark solved. The Solve
    // button counts as the player solving it, so cue the next step.
    this.#animatePieces(null, () => [0, 0], () => {
      this.#snapAll();
      this.#enterSolved({ played: true });
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

  // Choose the seed (the most central piece) and assign scatter targets. The map
  // already lives in the build canvas (translate 0), so the seed stays put as the
  // anchor; everyone else scatters down into the tray. Pieces snap to the seed's
  // translate (0), so the map reassembles right where it sits.
  #assignSeedScatter() {
    const [bx0, by0, bx1, by1] = this.layout.build;
    const cx0 = ((bx0 + bx1) / 2) * VB_W; // build-canvas centre
    const cy0 = ((by0 + by1) / 2) * this.vbH;
    const dist2 = (p) => (p.geom.cx - cx0) ** 2 + (p.geom.cy - cy0) ** 2;
    this.seed = this.pieces.reduce((best, p) => (dist2(p) < dist2(best) ? p : best));
    this.seed.scatterTx = 0;
    this.seed.scatterTy = 0;
    const loose = shuffle(this.pieces.filter((p) => p !== this.seed));
    loose.forEach((p, k, arr) => {
      const [tx, ty] = trayScatter(p.geom, k, arr.length, this.vbH);
      p.scatterTx = tx;
      p.scatterTy = ty;
    });
  }

  // --- clusters & snapping -------------------------------------------------
  // Pieces form CLUSTERS — sub-assemblies that move and snap as a unit. Every
  // piece in a cluster shares one translate (so they sit in their correct
  // relative positions). You can build several clusters independently and then
  // merge them, just like a real jigsaw.

  #initClusters() {
    for (const p of this.pieces) p.cluster = new Set([p]);
  }

  #allClusters() {
    return new Set(this.pieces.map((p) => p.cluster));
  }

  #clusterTx(cluster) {
    const p = cluster.values().next().value;
    return [p.tx, p.ty];
  }

  #mergeClusters(a, b) {
    if (a === b) return a;
    for (const p of b) {
      a.add(p);
      p.cluster = a;
    }
    return a;
  }

  // The "resolved section": the cluster holding the seed — the part of the map
  // already assembled. Loose pieces only ever join THIS, never each other.
  #resolved() {
    return this.seed?.cluster ?? null;
  }

  // Merge into the resolved section any cluster that's now adjacent AND aligned
  // (same translate) with it. Only the resolved section is magnetic, so loose
  // pieces never fuse with one another — you build outward from the seed.
  #settleClusters() {
    const resolved = this.#resolved();
    if (!resolved) return;
    let merged = true;
    while (merged) {
      merged = false;
      const [ax, ay] = this.#clusterTx(resolved);
      for (const c of this.#allClusters()) {
        if (c === resolved) continue;
        const [bx, by] = this.#clusterTx(c);
        if (Math.hypot(ax - bx, ay - by) > 1) continue; // not aligned
        let adj = false;
        for (const a of resolved) {
          for (const b of c) if (isAdjacent(a.id, b.id)) { adj = true; break; }
          if (adj) break;
        }
        if (adj) {
          this.#mergeClusters(resolved, c);
          merged = true;
          break;
        }
      }
    }
  }

  // On drop: snap the dragged cluster onto the resolved section if it can join it
  // (a dragged piece adjacent to a resolved piece, within the MAGNET radius of its
  // true offset — i.e. anywhere the connection glow was showing), then merge
  // everything that lines up. Only the resolved section is a snap target — loose
  // pieces don't join each other.
  #dropCluster(cluster, dragged) {
    const resolved = this.#resolved();
    const [tx, ty] = this.#clusterTx(cluster);
    let best = null;
    if (resolved && cluster !== resolved) {
      for (const c of resolved) {
        let src = null;
        for (const d of cluster) if (isAdjacent(d.id, c.id)) { src = d; break; }
        if (!src) continue;
        const dist = Math.hypot(tx - c.tx, ty - c.ty);
        const { magnet } = this.#mateRadius(src, c); // any glow at all → close enough
        // resolved pieces share a translate (dist ties) — prefer the roomiest reach.
        if (dist < magnet && (!best || magnet > best.magnet)) best = { c, dist, magnet };
      }
    }
    if (best) {
      const dx = best.c.tx - tx;
      const dy = best.c.ty - ty;
      const spark = this.#sharedMidpoint(cluster, best.c, dx, dy);
      // Pull the cluster the last bit in with a quick eased "click".
      for (const p of cluster) p.setSnapping(true);
      this.svg.getBoundingClientRect();
      for (const p of cluster) p.moveTo(p.tx + dx, p.ty + dy);
      setTimeout(() => { for (const p of cluster) p.setSnapping(false); }, SNAP_MS + 40);
      this.#settleClusters();
      if (spark) this.#snapBurst(spark);
      for (const p of dragged) store.markSeen(p.id);
    }
    this.#refresh();
    if (best) this.#persist(); // a piece connected — that's worth saving
    return !!best;
  }

  // World point where a snapping cluster meets piece `c` (its shared edge mid),
  // for the snap spark. dx,dy is the snap offset just applied to the cluster.
  #sharedMidpoint(cluster, c, dx, dy) {
    let src = null;
    let bestD = Infinity;
    for (const d of cluster) {
      if (!isAdjacent(d.id, c.id)) continue;
      const cd = Math.hypot(d.geom.cx + d.tx + dx - (c.geom.cx + c.tx), d.geom.cy + d.ty + dy - (c.geom.cy + c.ty));
      if (cd < bestD) { bestD = cd; src = d; }
    }
    if (!src) return null;
    const info = facingInfo(src.geom.ring, [c.tx, c.ty], c.geom.ring, [c.tx, c.ty]);
    return info.mid ? [info.mid[0] + c.tx, info.mid[1] + c.ty] : null;
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

  // Assemble everything into one cluster at the origin (Solve / load-assembled).
  #snapAll() {
    const all = new Set(this.pieces);
    this.pieces.forEach((p) => {
      p.moveTo(0, 0);
      p.cluster = all;
      p.setPlaced(true);
    });
  }

  #refresh() {
    this.#emitProgress();
    // A piece shows its map colour once it's in a multi-piece cluster — or if it's
    // the lone seed, which reads as placed from the start.
    for (const p of this.pieces) p.setPlaced(p.cluster.size > 1 || p === this.seed);
    if (this.#allClusters().size === 1 && this.phase === 'play') {
      this.#enterSolved({ played: true, toast: true });
    } else {
      this.#emitControls();
    }
  }

  // Tag each piece with its cluster id + size — exposed via data-* for the
  // screenshot harness to read assembly progress.
  #emitProgress() {
    const ids = new Map();
    for (const p of this.pieces) {
      if (!ids.has(p.cluster)) ids.set(p.cluster, ids.size);
      p.g.dataset.cluster = ids.get(p.cluster);
      p.g.dataset.csize = p.cluster.size;
    }
  }

  // Tell the host which label the one action button wears: Solve while assembling
  // (or about to), Scramble otherwise.
  #emitControls() {
    const mode = this.phase === 'play' || this.phase === 'jumbling' ? 'solve' : 'scramble';
    this.cbs.onAction?.(mode);
  }

  // `played` = the player actually solved this board this visit (vs. it loading
  // already assembled); the host only cues "tap to zoom" once they've played.
  #enterSolved({ played = false, toast = false } = {}) {
    this.phase = 'solved';
    this.trayHint.style.display = 'none'; // the tray is empty now; keep the panels...
    const zoomable = this.pieces.some((p) => p.zoomable);
    // ...and show the Scramble button + the "what next" tips in the tray.
    this.tipZoom.textContent = zoomable ? '👆 Tap a piece to zoom in' : '👆 Tap a piece for its card';
    this.traySolved.style.display = '';
    this.seed = null;
    // Groups become zoom targets; leaves become tap-for-info targets.
    this.pieces.forEach((p) => (p.zoomable ? p.markZoomable() : p.markSelectable()));
    this.cbs.onSolved?.(zoomable, played);
    this.#emitControls();
    this.#persist(); // solved → save the node (board rebuilds assembled on reload)
    if (toast) this.cbs.onToast?.(`${labelOf(this.nodeId)} solved!`);
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
      // Only loose pieces are draggable — the assembled (resolved) map is fixed.
      const loose = piece && piece.cluster !== this.#resolved();
      this.gesture = loose ? this.#beginPieceDrag(piece, ux, uy) : null;
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
      g.starts.forEach((s) => {
        s.p.setDragging(false);
        s.p.moveTo(s.tx, s.ty); // drop the paddle lift back to where the drag began
      });
      this.#hidePaddle();
      this.#clearGlow();
    } else if (g.type === 'pan' && g.moved && !g.exploded) {
      this.pieces.forEach((p) => p.setDragging(false));
      this.#springBack();
    }
    this.gesture = null;
  }

  // --- single-pointer cluster drag (assembling) ---
  // Grab a piece and you drag its whole cluster — a lone piece or a sub-assembly.
  // On touch the cluster floats up by `lift` above the finger so you can see what
  // you're holding (a paddle marks the finger + lift); with a mouse `lift` is 0
  // and the piece just follows the cursor.
  #beginPieceDrag(piece, ux, uy) {
    const cluster = piece.cluster;
    const starts = [...cluster].map((p) => ({ p, tx: p.tx, ty: p.ty }));
    for (const p of cluster) {
      this.pieceLayer.append(p.g); // raise the whole cluster above the rest
      this.glowLayer.append(p.glowEl);
      this.labelLayer.append(p.labelEl);
      p.setDragging(true);
      if (this.lift) p.moveTo(p.tx, p.ty - this.lift); // lift clear of the thumb
    }
    if (this.lift) this.#showPaddle(ux, uy);
    return { type: 'piece', ux, uy, cluster, starts, moved: false };
  }

  #movePieceDrag(ux, uy) {
    const g = this.gesture;
    const dx = ux - g.ux;
    const dy = uy - g.uy;
    if (!g.moved && Math.hypot(dx, dy) > 2) g.moved = true;
    for (const s of g.starts) s.p.moveTo(s.tx + dx, s.ty + dy - this.lift);
    if (this.lift) this.#updatePaddle(ux, uy);
    this.#updateGlow(g.cluster);
  }

  #endPieceDrag() {
    const g = this.gesture;
    this.#hidePaddle();
    for (const s of g.starts) s.p.setDragging(false);
    this.#clearGlow();
    // A tap with no real drag: just drop the lift and leave the piece where it was.
    if (!g.moved) {
      for (const s of g.starts) s.p.moveTo(s.tx, s.ty);
      return;
    }
    const snapped = this.#dropCluster(g.cluster, g.starts.map((s) => s.p));
    // Missed the map? The piece springs straight back down to its spot in the tray
    // — loose pieces always live in the bottom, never floating up top.
    if (!snapped) this.#returnToTray(g.cluster);
  }

  // Spring a dropped-but-unconnected cluster back to its tray spot. Not a real
  // event — the piece is right back where it was — so nothing to save.
  #returnToTray(cluster) {
    for (const p of cluster) p.setSettling(true);
    this.svg.getBoundingClientRect(); // reflow so the transition runs
    for (const p of cluster) p.moveTo(p.scatterTx, p.scatterTy);
    setTimeout(() => { for (const p of cluster) p.setSettling(false); }, SETTLE_MS);
  }

  // --- the drag paddle ---
  #showPaddle(ux, uy) {
    this.paddleEl.style.display = '';
    this.#updatePaddle(ux, uy);
  }

  #updatePaddle(ux, uy) {
    this.paddleDot.setAttribute('cx', ux.toFixed(1));
    this.paddleDot.setAttribute('cy', uy.toFixed(1));
    this.paddleLine.setAttribute('x1', ux.toFixed(1));
    this.paddleLine.setAttribute('y1', uy.toFixed(1));
    this.paddleLine.setAttribute('x2', ux.toFixed(1));
    this.paddleLine.setAttribute('y2', (uy - this.lift).toFixed(1));
  }

  #hidePaddle() {
    this.paddleEl.style.display = 'none';
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

  // The best join the dragged CLUSTER could make: a cross-cluster adjacent pair
  // (source piece in the cluster, target piece outside it), nearest in translate
  // distance — i.e. closest to its correct relative position. The translate
  // metric means the glow only appears when the shared borders are actually being
  // brought together, not when an (in-map) neighbour happens to sit elsewhere.
  // The snap + magnet radii for mating piece `a` with piece `b`, scaled to the
  // smaller piece so the connection is proportional (small pieces connect tightly,
  // and only when their edges genuinely face — not from across the piece).
  #mateRadius(a, b) {
    const s = Math.min(a.geom.w, a.geom.h, b.geom.w, b.geom.h);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    return {
      snap: clamp(s * SNAP_FRAC, SNAP_MIN, SNAP_MAX),
      magnet: clamp(s * MAGNET_FRAC, MAGNET_MIN, MAGNET_MAX),
    };
  }

  #glowTarget(cluster) {
    const resolved = this.#resolved();
    if (!resolved || cluster === resolved) return null; // only loose → resolved glows
    const [tx, ty] = this.#clusterTx(cluster);
    let best = null;
    for (const c of resolved) {
      let src = null;
      for (const d of cluster) if (isAdjacent(d.id, c.id)) { src = d; break; }
      if (!src) continue;
      const dist = Math.hypot(tx - c.tx, ty - c.ty);
      const { snap, magnet } = this.#mateRadius(src, c);
      // resolved pieces share a translate (dist ties) — prefer the pair with the
      // most permissive (largest) magnet, i.e. the bigger neighbour's edge.
      if (!best || magnet > best.magnet) best = { source: src, target: c, dist, snap, magnet };
    }
    return best;
  }

  #updateGlow(cluster) {
    const next = new Map();
    let connector = null;
    const m = this.#glowTarget(cluster);
    if (m && m.dist < m.magnet) {
      const glow = Math.max(0, Math.min(1, (m.magnet - m.dist) / (m.magnet - m.snap)));
      // Light up the TRUE shared border: compute it with the source piece placed
      // where it will SNAP (the target's translate), not where it's currently
      // dragged, so only the correct edge glows however you approach.
      const connectT = [m.target.tx, m.target.ty];
      const aInfo = facingInfo(m.source.geom.ring, connectT, m.target.geom.ring, connectT);
      const bInfo = facingInfo(m.target.geom.ring, connectT, m.source.geom.ring, connectT);
      next.set(m.source, { glow, d: aInfo.d });
      next.set(m.target, { glow, d: bInfo.d });
      // A faint line joining the two glowing edges (in board world coords).
      if (aInfo.mid && bInfo.mid) {
        connector = {
          glow,
          x1: aInfo.mid[0] + m.source.tx, y1: aInfo.mid[1] + m.source.ty,
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

  // The viewBox to zoom a piece to. Rather than filling the whole board (which
  // would bleed the map down into the tray), it FRAMES the piece inside the build
  // canvas — the same region the next level's map will occupy — so a zoom keeps
  // everything in the top canvas and lands seamlessly on the child.
  #boxFor(piece) {
    const { geom, tx, ty } = piece;
    const px = geom.minX + tx;
    const py = geom.minY + ty;
    // Fit the piece to FILL of the build-canvas fraction — the exact same fraction
    // the child level's map fills — so the region is the same size across the
    // zoom handoff (no size jump / "jitter").
    const [fx0, fy0, fx1, fy1] = this.layout.build;
    const fw = (fx1 - fx0) * FILL, fh = (fy1 - fy0) * FILL;
    const aspect = VB_W / this.vbH; // board (and viewBox) width : height
    const vw = Math.max(geom.w / fw, (geom.h / fh) * aspect);
    const vh = vw / aspect;
    const vx = px + geom.w / 2 - ((fx0 + fx1) / 2) * vw;
    const vy = py + geom.h / 2 - ((fy0 + fy1) / 2) * vh;
    return [vx, vy, vw, vh];
  }

  #zoomInto(piece) {
    if (!piece.zoomable) return;
    this.phase = 'zooming';
    this.traySolved.style.display = 'none'; // don't float it over the zooming map
    this.pieces.forEach((p) => p !== piece && p.fadeOut());
    this.#animateZoom(fullVB(this.vbH), this.#boxFor(piece), () =>
      this.cbs.onZoomInto?.(piece.id),
    );
  }

  // Programmatic camera zoom into a child by id, then call `onArrived` — used by
  // the search fly-through to descend level by level. Like a tap-zoom but with an
  // explicit callback instead of the onZoomInto wiring.
  zoomToChild(childId, onArrived) {
    const piece = this.pieces.find((p) => p.id === childId);
    if (!piece) return onArrived?.();
    this.phase = 'zooming';
    this.traySolved.style.display = 'none';
    this.pieces.forEach((p) => p !== piece && p.fadeOut());
    this.#animateZoom(fullVB(this.vbH), this.#boxFor(piece), () => onArrived?.());
  }

  // Briefly pulse a piece to draw the eye — used when a search lands on the board
  // that contains the searched place, so you can spot it.
  flashPiece(id) {
    this.pieces.find((p) => p.id === id)?.flash();
  }

  // Step one of a zoom-OUT: smoosh the assembled pieces into a single solid shape
  // of the given colour (the parent's colour for this region), then run `onDone`
  // (which renders the parent and camera-zooms out). Only meaningful once solved;
  // otherwise it just hands straight off.
  collapse(color, name, onDone) {
    if (this.phase !== 'solved') return void onDone();
    this.#cancelPending();
    this.phase = 'zooming';
    this.traySolved.style.display = 'none';
    for (const p of this.pieces) p.g.classList.add('collapsing');
    this.#showCollapseName(name);
    this.svg.getBoundingClientRect(); // commit the start colours so the morph runs
    for (const p of this.pieces) p.collapse(color);
    this.#pendingTimer = setTimeout(onDone, COLLAPSE_MS);
  }

  // The merged region's own name, fading in centred over the collapsing shape (as
  // the individual piece labels fade out).
  #showCollapseName(name) {
    let sx = 0;
    let sy = 0;
    for (const p of this.pieces) { sx += p.geom.cx; sy += p.geom.cy; }
    const cx = sx / this.pieces.length;
    const cy = sy / this.pieces.length;
    const lines = wrapLabel(name);
    const fs = 42;
    const lh = fs * 1.05;
    const text = svgEl('text', { class: 'jig-collapse-name', 'text-anchor': 'middle' });
    text.style.fontSize = `${fs}px`;
    lines.forEach((ln, i) => {
      const ts = svgEl('tspan', {
        x: cx.toFixed(1),
        y: (cy + (i - (lines.length - 1) / 2) * lh).toFixed(1),
        'dominant-baseline': 'central',
      });
      ts.textContent = ln;
      text.append(ts);
    });
    text.style.opacity = '0';
    this.labelLayer.append(text);
    this.svg.getBoundingClientRect();
    text.style.transition = 'opacity 0.3s ease 0.06s';
    text.style.opacity = '1';
  }

  #animateZoom(from, to, onDone) {
    // Commit the start frame immediately so there's no flash of the un-zoomed view
    // before the animation's first rAF (the source of the zoom-out "jitter").
    this.svg.setAttribute('viewBox', from.map((v) => v.toFixed(1)).join(' '));
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
