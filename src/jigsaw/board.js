// The Board: one node's interactive puzzle. It owns the SVG, the pieces, and an
// explicit phase machine:
//
//   building → solved ⇄ play          (the steady states)
//              ↘ intro → scattering → play → (solving) → solved
//              ↘ zooming → (destroyed by the host on arrival)
//
// GUIDED ASSEMBLY: a puzzle starts with one anchor piece on the map and the rest
// in the tray. The game asks for one piece at a time BY NAME ("Place ▸ Burbank"),
// in an order where each ask borders something already placed. Only the asked-for
// piece can be picked up; grabbing another wiggles it and says its name. Missed
// drops escalate gentle hints (a named neighbour, then a ghost outline). This
// makes the names unavoidable and keeps players pushing on one piece.
//
// The Board talks to its host only through callbacks, and every deferred
// effect runs on its Scheduler, so destroy() leaves nothing behind.
import { svgEl } from '../ui/dom.js';
import { store } from '../store.js';
import { adjacentIds, labelOf } from './tree.js';
import { colorForIndex } from './palette.js';
import { VB_W, layoutFor, rectToUser, fullVB, packTray } from './layout.js';
import { projectChildren, fitProjection, projectContext, fillFor, mapAspectOf, ringContains } from './geometry.js';
import { layoutLabels, labelBoxes } from './labels.js';
import { Piece } from './piece.js';
import { Scheduler } from './scheduler.js';
import { Gestures } from './gestures.js';
import { Stage } from './stage.js';
import { EdgeGlow, Paddle, Coach, snapBurst, ghost, collapseName } from './fx.js';
import { progressLine } from '../progress.js';
import { pickAnchor, placementOrder, bestMate, dropSnaps, glowStrength, hintLevel } from './assembly.js';

// A precise pointer (mouse/trackpad) doesn't hide the piece under it, so on
// desktop pieces are dragged directly — no "paddle" lift clear of a fingertip.
const HAS_MOUSE = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
const REDUCED_MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const PROMPT_PX = 62; // CSS px of room for the "Place ▸ X" prompt
const PADDLE_LIFT = 300; // how far above the finger a held piece floats (user units)
export const ZOOM_MS = REDUCED_MOTION ? 1 : 580;
const COLLAPSE_MS = REDUCED_MOTION ? 1 : 450; // pieces smoosh into the parent before zooming out
const SCATTER_MS = 620; // piece fly time; must outlast the CSS transform transition
const SETTLE_MS = 300; // spring-back after a pan or a missed drop
const SNAP_MS = 150; // the "click" pull-in when a piece connects
const NEXT_ASK_MS = 320; // a beat after a snap before the next ask
const FIND_HINT_MS = 9000; // no right grab for this long → pulse the asked-for piece
const INTRO_MS = 750; // an unsolved level shows assembled this long, then breaks apart

export class Board {
  // cbs: { onPersist(), onZoomInto(childId), onZoomOut(), onGoTo(id), onSelectLeaf(id),
  //        onAction('solve' | 'up' | 'busy'), onEvent(name, data) }
  // opts: { book: the progress ledger to read/write (store.explore by default),
  //         campaign: true → a "Rebuild LA" puzzle: no zooming into pieces or
  //         flying off via context; the solved tray offers "Back to the map" }
  constructor(nodeId, cbs = {}, { book = store.explore, campaign = false } = {}) {
    this.nodeId = nodeId;
    this.cbs = cbs;
    this.book = book;
    this.campaign = campaign;
    this.pieces = [];
    this.byId = new Map();
    this.phase = 'building';
    this.sched = new Scheduler();
    this.lift = HAS_MOUSE ? 0 : PADDLE_LIFT;
    this.run = null; // the guided run: { anchor, order, step, misses, finds, findTimer }
    this.held = null; // the piece being dragged: { piece, start, moved, startPt }
    this.ghostEl = null;
    // In the campaign the tray's button leads back to the overworld instead.
    this.stage = new Stage({ onReplay: () => (this.campaign ? this.cbs.onDone?.() : this.scramble()) });
    this.svg = this.#initSvg();
    this.root = this.stage.mount(this.svg);
    this.gestures = new Gestures(this.svg, this.#gestureHandlers());
  }

  #initSvg() {
    const svg = svgEl('svg', { class: 'jig', preserveAspectRatio: 'xMidYMid meet' });
    // The surrounding areas (faint, named, tappable), clipped to the build canvas.
    this.clipRect = svgEl('rect');
    this.clipId = `jig-clip-${Math.random().toString(36).slice(2, 8)}`;
    const clip = svgEl('clipPath', { id: this.clipId });
    clip.append(this.clipRect);
    const defs = svgEl('defs');
    defs.append(clip);
    this.contextLayer = svgEl('g', { class: 'jig-context', 'clip-path': `url(#${this.clipId})` });
    this.contextShapes = svgEl('g');
    this.contextLabels = svgEl('g', { class: 'jig-ctx-labels' }); // names above every context shape
    this.contextLayer.append(this.contextShapes, this.contextLabels);
    this.hintLayer = svgEl('g', { class: 'jig-hints' }); // ghost outlines, under the pieces
    this.pieceLayer = svgEl('g');
    this.glowLayer = svgEl('g', { class: 'jig-glows' });
    this.labelLayer = svgEl('g', { class: 'jig-labels' }); // above every piece
    this.fxLayer = svgEl('g', { class: 'jig-fx' }); // sparks, paddle, coach
    svg.append(defs, this.contextLayer, this.hintLayer, this.pieceLayer, this.glowLayer, this.labelLayer, this.fxLayer);
    this.glow = new EdgeGlow(this.glowLayer);
    this.paddle = new Paddle(this.fxLayer, PADDLE_LIFT);
    this.coach = new Coach(this.fxLayer, this.sched);
    return svg;
  }

  // --- build & lifecycle ---------------------------------------------------

  // Create the pieces for a board `vbH` user units tall (its measured aspect)
  // and `pxWidth` CSS pixels wide, placed assembled.
  build(vbH, pxWidth = 360) {
    this.vbH = vbH;
    this.gap = (PROMPT_PX * VB_W) / pxWidth; // prompt room, in user units
    this.pxWidth = pxWidth;
    this.fill = fillFor(this.nodeId);
    this.layout = layoutFor(vbH, mapAspectOf(this.nodeId), this.gap, this.fill);
    this.stage.place(this.layout);
    this.svg.setAttribute('viewBox', `0 0 ${VB_W} ${vbH}`);
    const buildRect = rectToUser(this.layout.build, vbH);
    const proj = fitProjection(this.nodeId, buildRect, this.fill);
    const geoms = projectChildren(this.nodeId, buildRect, this.fill, proj);
    this.pieces = geoms.map((geom, i) => new Piece(geom, { label: labelOf(geom.id), color: colorForIndex(i) }));
    // Label size scales with the build canvas width, so names stay proportional
    // to the map in a wide (portrait) or narrower (landscape) canvas.
    const fs = Math.max(18, Math.min(34, (33 * (buildRect[2] - buildRect[0])) / 950));
    const plans = layoutLabels(this.pieces.map((p) => ({ id: p.id, label: labelOf(p.id), geom: p.geom })), fs);
    for (const piece of this.pieces) {
      const plan = plans.get(piece.id);
      piece.setLabel(plan, { done: piece.zoomable && this.book.isSolved(piece.id) });
      piece.labelBoxes = labelBoxes(plan.lines, plan.fs, plan.x, plan.y);
      piece.moveTo(0, 0);
      this.pieceLayer.append(piece.g);
      this.glowLayer.append(piece.glowEl);
      this.labelLayer.append(piece.labelEl);
      this.byId.set(piece.id, piece);
    }
    this.#buildContext(proj, buildRect, fs * 0.72);
  }

  // Faint outlines of the areas around this one, each named and tappable.
  #buildContext(proj, [x0, y0, x1, y1], fs) {
    const r = (14 * VB_W) / this.pxWidth; // match the canvas panel's rounded corners
    for (const [k, v] of Object.entries({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: r }))
      this.clipRect.setAttribute(k, v.toFixed(1));
    const inset = fs * 0.4;
    // Context names must never sit on the map: a spot is usable only if its
    // label box stays clear of every piece and every name placed so far.
    const taken = this.pieces.flatMap((p) => p.labelBoxes);
    const onMap = ([bx0, by0, bx1, by1]) => {
      const pts = []; // a 5×3 grid over the label box
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) pts.push([bx0 + ((bx1 - bx0) * i) / 4, by0 + ((by1 - by0) * j) / 2]);
      return this.pieces.some((p) => pts.some(([x, y]) => ringContains(p.geom.ring, x, y)));
    };
    const hits = (b) => taken.some((t) => b[0] < t[2] && b[2] > t[0] && b[1] < t[3] && b[3] > t[1]);
    for (const c of projectContext(this.nodeId, proj, [x0 + inset, y0 + inset, x1 - inset, y1 - inset], fs * 0.55)) {
      const g = svgEl('g', { class: 'jig-ctx' });
      g.dataset.ctx = c.id;
      g.append(svgEl('path', { d: c.dFull, class: 'jig-ctx-shape' }));
      const name = labelOf(c.id);
      const spot = c.anchors
        // (Measured a little generously: the width estimate runs short.)
        .map(([x, y]) => ({ x, y, box: labelBoxes([name], fs * 1.12, x, y)[0] }))
        .find(
          ({ box }) =>
            box[0] >= x0 + inset && box[2] <= x1 - inset && box[1] >= y0 && box[3] <= y1 && !onMap(box) && !hits(box),
        );
      if (spot) {
        taken.push(spot.box);
        const t = svgEl('text', { class: 'jig-ctx-label', 'text-anchor': 'middle', 'dominant-baseline': 'central' });
        t.setAttribute('x', spot.x.toFixed(1));
        t.setAttribute('y', spot.y.toFixed(1));
        t.style.fontSize = `${fs.toFixed(1)}px`;
        t.textContent = name;
        t.dataset.ctx = c.id;
        this.contextLabels.append(t);
      }
      this.contextShapes.append(g);
    }
  }

  // Begin the level. `restore` re-hydrates a saved puzzle in progress; otherwise
  // it starts assembled, and with `autoPlay` it breaks apart into play after a
  // beat (so a new puzzle starts itself). `zoomOutFrom` reverse-zooms from the
  // child we came up from.
  // `arrived`: we zoomed in from the parent — the context shapes were already on
  // screen (the parent's siblings turned into them), so only their names fade in.
  start({ zoomOutFrom = null, restore = null, autoPlay = false, arrived = false } = {}) {
    if (arrived) this.contextLabels.classList.add('arriving');
    const restored = restore?.phase === 'play' && this.#restorePlay(restore);
    if (!restored) {
      this.#assembleAll();
      if (autoPlay) {
        this.phase = 'intro'; // assembled, about to break apart; input waits
        this.stage.hideSolved();
        this.#emitAction();
        this.sched.after(INTRO_MS + (zoomOutFrom ? ZOOM_MS : 0), () => this.scramble());
      } else {
        this.#enterSolved();
      }
    }
    if (zoomOutFrom) {
      const from = this.byId.get(zoomOutFrom);
      if (from) {
        // The siblings start as grey context (as they looked a moment ago, one
        // level down) and warm up to their colours as the camera pulls back.
        const others = this.pieces.filter((p) => p !== from && p.placed);
        for (const p of others) p.setContextLook(true);
        this.svg.getBoundingClientRect(); // commit the grey so the warm-up animates
        for (const p of others) p.setContextLook(false);
        this.contextLabels.classList.add('arriving');
        this.#clipDuringZoom(this.#childLayout(from).build, this.layout.build);
        this.#animateCamera(this.#boxFor(from), fullVB(this.vbH));
      }
    }
  }

  // Tear down: stop every timer/animation and ignore further input. The host
  // calls this before replacing the board.
  destroy() {
    this.phase = 'destroyed';
    this.sched.dispose();
    this.gestures.reset();
    this.coach.stop();
  }

  // Is the board idle (nothing animating, not mid-drag)? The search fly-through
  // only takes its next step from an idle board.
  idle() {
    // (The intro and the scatter count: navigating away just abandons them.)
    return ['solved', 'play', 'intro', 'scattering'].includes(this.phase) && !this.held;
  }

  // Serialize for persistence: null when solved (a reload rebuilds it assembled),
  // otherwise the run (anchor, order, how far along). Loose pieces' tray spots
  // aren't saved — they're re-packed on restore, since the board may come back
  // a different size (rotated phone, resized window).
  serialize() {
    if (!this.run || (this.phase !== 'play' && this.phase !== 'scattering')) return null;
    const { anchor, order, step, flawless } = this.run;
    return { phase: 'play', anchor, order, step, flawless };
  }

  #restorePlay(saved) {
    const { anchor, order, step } = saved;
    const ids = new Set(this.pieces.map((p) => p.id));
    // Every ask must border something placed before it, or it could never snap.
    const connected = () => {
      const seen = new Set([anchor]);
      return order.every((id) => adjacentIds(id).some((n) => seen.has(n)) && seen.add(id));
    };
    const valid =
      ids.has(anchor) &&
      Array.isArray(order) &&
      order.length === ids.size - 1 &&
      new Set(order).size === order.length &&
      order.every((id) => ids.has(id) && id !== anchor) &&
      Number.isInteger(step) &&
      step >= 0 &&
      step < order.length &&
      connected();
    if (!valid) return false; // data changed under an old save → start assembled
    const placed = new Set([anchor, ...order.slice(0, step)]);
    for (const p of this.pieces) {
      p.reset();
      p.setPlaced(placed.has(p.id));
      p.homeTx = 0;
      p.homeTy = 0;
    }
    this.#packLoose();
    for (const p of this.pieces) p.moveTo(p.homeTx, p.homeTy);
    this.byId.get(anchor).g.classList.add('anchor');
    // flawless carries over from the save (older saves: unknown → doesn't count).
    const coaching = !store.coached();
    this.run = { anchor, order, step, misses: 0, finds: 0, flawless: saved.flawless === true, coaching };
    this.phase = 'play';
    this.stage.hideSolved();
    this.#emitAction();
    this.#ask();
    return true;
  }

  #persist() {
    if (this.phase !== 'destroyed') this.cbs.onPersist?.();
  }

  // The top-right button: Solve while a puzzle is on (or about to be), Zoom out
  // on a solved map, and disabled mid-animation (a second tap on Solve mustn't
  // turn into a Zoom out).
  #emitAction() {
    const playing = ['play', 'scattering', 'intro'].includes(this.phase);
    this.cbs.onAction?.(playing ? 'solve' : this.phase === 'solved' ? 'up' : 'busy');
  }

  // Pack every loose (unplaced) piece into the tray: sets their homeTx/Ty.
  #packLoose() {
    const loose = this.pieces.filter((p) => !p.placed);
    const homes = packTray(
      loose.map((p) => ({ box: p.extent(p.labelBoxes), labels: p.labelBoxes })),
      rectToUser(this.layout.tray, this.vbH),
    );
    loose.forEach((p, i) => ([p.homeTx, p.homeTy] = homes[i]));
  }

  // --- starting a run --------------------------------------------------------

  // Break the assembled map apart: the anchor stays on the map, the rest fly
  // into the tray, then the first piece is asked for. (Play again / a shake /
  // an unsolved level's intro.)
  scramble() {
    if (!['solved', 'play', 'intro'].includes(this.phase)) return;
    this.sched.cancelAll();
    this.#clearHints();
    this.coach.stop();
    const ids = this.pieces.map((p) => p.id);
    const anchor = pickAnchor(ids, adjacentIds);
    const order = placementOrder(ids, anchor, adjacentIds);
    // coaching: the first-ever run keeps the bold, spelled-out prompt throughout.
    this.run = { anchor, order, step: 0, misses: 0, finds: 0, flawless: true, coaching: !store.coached() };
    this.cbs.onEvent?.('puzzle-start');

    for (const p of this.pieces) {
      p.reset();
      p.setPlaced(p.id === anchor);
      p.homeTx = 0;
      p.homeTy = 0;
    }
    this.#packLoose();
    this.byId.get(anchor).g.classList.add('anchor');

    this.phase = 'scattering';
    this.stage.hideSolved();
    this.#emitAction();
    this.#animatePieces(
      () => [0, 0],
      (p) => [p.homeTx, p.homeTy],
      () => {
        this.phase = 'play';
        this.#emitAction();
        this.#ask();
        this.#persist();
      },
    );
    this.#persist(); // pieces are already headed to their spots
  }

  // Snap everything home (the Solve button — gave up, or just want to move on).
  solve() {
    if (this.phase === 'intro') {
      // Not even started: just settle on the assembled map.
      this.sched.cancelAll();
      this.book.markDone(this.nodeId, 'skipped');
      this.cbs.onEvent?.('puzzle-skip');
      return this.#enterSolved();
    }
    if (this.phase !== 'play' && this.phase !== 'scattering') return;
    this.sched.cancelAll();
    this.#cancelHeld();
    this.#clearHints();
    this.coach.stop();
    this.stage.hidePrompt();
    this.phase = 'solving';
    this.#emitAction();
    this.cbs.onEvent?.('puzzle-skip');
    this.#animatePieces(null, () => [0, 0], () => {
      this.#assembleAll();
      this.book.markDone(this.nodeId, 'skipped');
      this.#enterSolved();
    });
  }

  // Run a transform transition on every piece: place them at `from` (if given),
  // force a reflow so the browser commits that as the start, switch to `to`, and
  // call `done` once the CSS transition has run. Transitions the CSS `transform`
  // PROPERTY (not the SVG attribute) so it animates on Safari/Firefox too.
  #animatePieces(from, to, done) {
    for (const p of this.pieces) {
      if (from) p.moveTo(...from(p));
      p.setExploding(true);
    }
    this.svg.getBoundingClientRect();
    for (const p of this.pieces) p.moveTo(...to(p));
    this.sched.after(SCATTER_MS, () => {
      for (const p of this.pieces) p.setExploding(false);
      done?.();
    });
  }

  #assembleAll() {
    for (const p of this.pieces) {
      p.moveTo(0, 0);
      p.setPlaced(true);
    }
  }

  // --- the guided run ------------------------------------------------------

  #target() {
    return this.run ? this.byId.get(this.run.order[this.run.step]) : null;
  }

  #placedIds() {
    return new Set(this.pieces.filter((p) => p.placed).map((p) => p.id));
  }

  #mate(target) {
    return bestMate(target.id, this.#placedIds(), adjacentIds, (id) => this.byId.get(id).geom);
  }

  // Ask for the next piece by name.
  #ask() {
    const t = this.#target();
    if (!t) return;
    const { step, order } = this.run;
    this.run.misses = 0;
    this.run.finds = 0;
    this.run.ready = true; // the asked-for piece can be picked up now
    const firstEver = this.run.coaching;
    const mate = this.byId.get(this.#mate(t)?.id);
    // The very first ask of all time spells out the move.
    const sub = firstEver && mate ? `Drag it ${this.layout.wide ? 'over' : 'up'} next to ${labelOf(mate.id)}` : '';
    this.stage.ask(labelOf(t.id), step + 2, order.length + 1, sub, { quiet: !firstEver });
    if (firstEver && step === 0) {
      this.coach.play(
        [t.geom.cx + t.homeTx, t.geom.cy + t.homeTy],
        [t.geom.cx, t.geom.cy],
      );
    }
    // Can't find it after a while? Pulse it in the tray.
    this.sched.cancel(this.run.findTimer);
    this.run.findTimer = this.sched.after(FIND_HINT_MS, () => this.#target() === t && !this.held && t.pulse());
  }

  // A piece was pressed during play.
  #grab(piece, pt) {
    // Placed pieces stay put; and between a snap and the next ask, nothing moves
    // (the next target would otherwise be grabbable before it's been named).
    if (piece.placed || !this.run.ready) return false;
    const t = this.#target();
    if (piece !== t) {
      // Not this one — but you learn a name either way.
      piece.wiggle();
      this.run.finds += 1;
      this.run.flawless = false;
      this.stage.nope(`That's ${labelOf(piece.id)}`);
      if (this.run.finds >= 2) t.pulse();
      return false;
    }
    this.coach.stop();
    this.sched.cancel(this.run.findTimer);
    // Raise it above everything and lift it clear of the thumb.
    this.pieceLayer.append(piece.g);
    this.glowLayer.append(piece.glowEl);
    this.labelLayer.append(piece.labelEl);
    piece.setDragging(true);
    piece.moveTo(piece.tx, piece.ty - this.lift);
    if (this.lift) this.paddle.show(pt);
    this.held = { piece, start: [piece.homeTx, piece.homeTy], startPt: pt, moved: false, mate: this.#mate(piece) };
    return true;
  }

  #drag(pt) {
    const h = this.held;
    if (!h) return;
    const dx = pt[0] - h.startPt[0];
    const dy = pt[1] - h.startPt[1];
    if (!h.moved && Math.hypot(dx, dy) > 2) h.moved = true;
    h.piece.moveTo(h.start[0] + dx, h.start[1] + dy - this.lift);
    if (this.lift) this.paddle.move(pt);
    const mate = h.mate && this.byId.get(h.mate.id);
    if (mate) this.glow.show(h.piece, mate, glowStrength(h.piece.tx, h.piece.ty, h.mate));
  }

  #drop() {
    const h = this.held;
    if (!h) return;
    this.held = null;
    const { piece } = h;
    this.paddle.hide();
    this.glow.clear();
    piece.setDragging(false);
    if (h.moved && dropSnaps(piece.tx, piece.ty, h.mate)) {
      this.#place(piece, this.byId.get(h.mate.id));
      return;
    }
    // Missed (or just tapped): spring back to its tray spot.
    this.#settle(piece, [piece.homeTx, piece.homeTy]);
    if (h.moved) {
      this.run.misses += 1;
      this.run.flawless = false;
      this.#hint();
    }
  }

  // Abandon a drag without counting it (the OS cancelled the touch).
  #cancelHeld() {
    const h = this.held;
    if (!h) return;
    this.held = null;
    this.paddle.hide();
    this.glow.clear();
    h.piece.setDragging(false);
    h.piece.moveTo(h.piece.homeTx, h.piece.homeTy);
  }

  // Escalating help after missed drops of the current piece.
  #hint() {
    const t = this.#target();
    const level = hintLevel(this.run.misses);
    if (level === 'none') return;
    const mate = this.byId.get(this.#mate(t)?.id);
    if (mate) {
      mate.pulse();
      this.stage.setSub(
        level === 'ghost' ? 'It goes in the dashed outline' : `Hint: it borders ${labelOf(mate.id)}`,
      );
    }
    if (level === 'ghost' && !this.ghostEl) this.ghostEl = ghost(this.hintLayer, t);
    this.cbs.onEvent?.(`hint-${level}`);
  }

  #clearHints() {
    this.ghostEl?.remove();
    this.ghostEl = null;
  }

  // The asked-for piece connects: click it in, spark, then ask for the next.
  #place(piece, mate) {
    piece.setSnapping(true);
    this.svg.getBoundingClientRect();
    piece.moveTo(0, 0);
    piece.setPlaced(true);
    piece.homeTx = 0;
    piece.homeTy = 0;
    this.sched.after(SNAP_MS + 40, () => piece.setSnapping(false));
    const join = this.glow.joinPoint(piece, mate);
    if (join && !REDUCED_MOTION) snapBurst(this.fxLayer, this.sched, join);
    this.#clearHints();
    if (!store.coached()) store.markCoached();
    this.run.step += 1;
    this.run.ready = false;
    this.cbs.onEvent?.('piece-placed');
    if (this.run.step >= this.run.order.length) {
      // Done. Leave 'play' right away so leaving in the next beat can't keep a
      // stale in-progress save, and Solve can't fire on a finished map.
      this.phase = 'solving';
      this.#emitAction();
      this.stage.hidePrompt();
      this.book.markDone(this.nodeId, 'solved');
      this.#persist();
      this.cbs.onEvent?.('puzzle-solved', {
        id: this.nodeId,
        flawless: this.run.flawless,
        size: this.pieces.length,
      });
      this.sched.after(SNAP_MS, () => this.#enterSolved({ justSolved: true }));
      return;
    }
    this.#persist();
    this.sched.after(NEXT_ASK_MS, () => this.#ask());
  }

  // Ease a piece to a spot (a missed drop springing back, a pan settling).
  #settle(piece, [tx, ty]) {
    piece.setSettling(true);
    this.svg.getBoundingClientRect(); // reflow so the transition runs
    piece.moveTo(tx, ty);
    this.sched.after(SETTLE_MS, () => piece.setSettling(false));
  }

  // --- solved --------------------------------------------------------------

  #enterSolved({ justSolved = false } = {}) {
    this.phase = 'solved';
    this.run = null;
    this.stage.hidePrompt();
    const zoomable = this.pieces.some((p) => p.zoomable);
    // Not played yet: Play is the call to action. Played: a quieter Play again.
    const fresh = !this.book.progress(this.nodeId);
    this.stage.replayBtn.textContent = this.campaign ? '🗺️ Back to the map' : fresh ? '▶ Play this puzzle' : '🔀 Play again';
    this.stage.replayBtn.classList.toggle('primary', fresh || this.campaign);
    const chips = this.pieces.map((p) => ({
      label: labelOf(p.id),
      done: p.zoomable && this.book.isSolved(p.id),
      wip: p.zoomable && !!this.book.puzzle(p.id),
      onClick: () => this.#open(p),
    }));
    const tip = this.campaign
      ? zoomable ? '' : '👆 Tap a place to learn about it'
      : zoomable ? '👆 Tap a piece to zoom in' : '👆 Tap a piece to learn about it';
    const progress = this.cbs.progressLine?.() ?? progressLine(this.nodeId);
    this.stage.showSolved({ tip, chips: this.campaign && zoomable ? [] : chips, progress });
    if (justSolved) this.stage.celebrate(labelOf(this.nodeId));
    for (const p of this.pieces) {
      p.g.classList.remove('anchor');
      if (p.zoomable) p.markZoomable();
      else p.markSelectable();
    }
    this.#emitAction();
    this.#persist();
  }

  // Open a piece on a solved map: groups zoom in, places show their card.
  #open(piece) {
    if (this.phase !== 'solved') return;
    if (piece.zoomable) return this.campaign ? undefined : this.zoomInto(piece.id); // campaign: stay put

    this.cbs.onEvent?.('card-open');
    this.cbs.onSelectLeaf?.(piece.id);
  }

  // --- gestures ------------------------------------------------------------

  #gestureHandlers() {
    return {
      mode: () => (this.phase === 'play' ? 'play' : this.phase === 'solved' ? 'solved' : null),
      pieceOf: (target) => {
        for (let el = target; el && el !== this.svg; el = el.parentNode) {
          if (el.classList?.contains('jig-piece')) return this.pieces.find((p) => p.g === el) || null;
        }
        return null;
      },
      grab: (piece, pt) => this.#grab(piece, pt),
      drag: (pt) => this.#drag(pt),
      drop: () => this.#drop(),
      cancelDrag: () => this.#cancelHeld(),
      tap: (piece) => this.#open(piece),
      // A tap on a surrounding area goes there.
      // Mid-puzzle only the NAME counts (a deliberate target) — a near-miss
      // beside the map mustn't whisk you away from the puzzle.
      tapEmpty: (target) => {
        if (this.campaign) return; // no flying off mid-campaign
        const hit = target?.closest?.('[data-ctx]');
        if (!hit || (this.phase === 'play' && !hit.classList.contains('jig-ctx-label'))) return;
        this.cbs.onGoTo?.(hit.dataset.ctx);
      },
      pan: (dx, dy) => {
        for (const p of this.pieces) {
          p.setDragging(true);
          p.moveTo(dx, dy);
        }
      },
      panEnd: () => {
        for (const p of this.pieces) {
          p.setDragging(false);
          this.#settle(p, [0, 0]);
        }
      },
      shake: () => {
        for (const p of this.pieces) p.setDragging(false);
        // The campaign doesn't re-scramble a built area: just let it settle.
        if (this.campaign) return void this.pieces.forEach((p) => this.#settle(p, [0, 0]));
        this.scramble();
      },
      pinch: (dir, [mx, my]) => {
        if (dir === 'in') return this.cbs.onZoomOut?.();
        if (this.phase !== 'solved') return;
        const piece = this.pieces.find((p) => ringContains(p.geom.ring, mx - p.tx, my - p.ty));
        if (piece?.zoomable && !this.campaign) this.zoomInto(piece.id);
      },
    };
  }

  // --- camera --------------------------------------------------------------

  // The viewBox that frames `piece` exactly where (and how big) the child
  // level's map will sit — the child's build canvas, sized by the child map's
  // aspect — so the zoom hands off to the next level with no jump.
  #boxFor(piece) {
    const { geom, tx, ty } = piece;
    const fill = fillFor(piece.id);
    const child = this.#childLayout(piece);
    const [fx0, fy0, fx1, fy1] = child.build;
    const fw = (fx1 - fx0) * fill;
    const fh = (fy1 - fy0) * fill;
    const aspect = VB_W / this.vbH;
    const vw = Math.max(geom.w / fw, (geom.h / fh) * aspect);
    const vh = vw / aspect;
    const vx = geom.minX + tx + geom.w / 2 - ((fx0 + fx1) / 2) * vw;
    const vy = geom.minY + ty + geom.h / 2 - ((fy0 + fy1) / 2) * vh;
    return [vx, vy, vw, vh];
  }

  // Camera-zoom into a child, fading its siblings, then hand off: `onArrived`
  // if given (the search fly-through), else the host's onZoomInto.
  zoomInto(childId, onArrived) {
    const piece = this.byId.get(childId);
    if (!piece?.zoomable || this.phase !== 'solved') return void onArrived?.();
    this.phase = 'zooming';
    this.gestures.reset();
    this.#emitAction();
    this.stage.hideSolved();
    // The siblings turn into the next level's grey context (it'll be drawn
    // there too), and this level's own context stays put — no pop on arrival.
    this.contextLabels.classList.add('fading');
    this.cbs.onEvent?.('zoom-in');
    for (const p of this.pieces) if (p !== piece) p.setContextLook(true);
    this.#clipDuringZoom(this.layout.build, this.#childLayout(piece).build);
    this.#animateCamera(fullVB(this.vbH), this.#boxFor(piece), () =>
      onArrived ? onArrived() : this.cbs.onZoomInto?.(childId),
    );
  }

  // Step one of a zoom-OUT: smoosh the pieces into one solid shape in the
  // parent's colour for this region, with its name, then `onDone` (the host
  // renders the parent, which camera-zooms out). Straight to onDone otherwise.
  collapse(color, name, onDone) {
    if (this.phase !== 'solved') return void onDone();
    this.sched.cancelAll();
    this.phase = 'zooming';
    this.gestures.reset();
    this.#emitAction();
    this.stage.hideSolved();
    this.contextLabels.classList.add('fading'); // the shapes stay: the parent draws them too
    for (const p of this.pieces) p.g.classList.add('collapsing');
    const cx = this.pieces.reduce((s, p) => s + p.geom.cx, 0) / this.pieces.length;
    const cy = this.pieces.reduce((s, p) => s + p.geom.cy, 0) / this.pieces.length;
    collapseName(this.labelLayer, name, [cx, cy]);
    this.svg.getBoundingClientRect(); // commit the start colours so the morph runs
    for (const p of this.pieces) p.collapse(color);
    this.sched.after(COLLAPSE_MS, onDone);
  }

  // Pulse a piece to draw the eye (a search just landed on it).
  flashPiece(id) {
    this.byId.get(id)?.flash();
  }

  // The layout `piece`'s own level will have (its map's aspect + fill).
  #childLayout(piece) {
    return layoutFor(this.vbH, mapAspectOf(piece.id), this.gap, fillFor(piece.id));
  }

  // While the camera zooms, keep the map inside the build canvas ON SCREEN
  // (morphing from one level's canvas to the next's), so the grey context never
  // spills over the tray and then gets cut off at the handoff.
  #clipDuringZoom(from, to) {
    const pct = (v) => `${(v * 100).toFixed(2)}%`;
    const inset = ([x0, y0, x1, y1]) =>
      `inset(${pct(y0)} ${pct(1 - x1)} ${pct(1 - y1)} ${pct(x0)} round 14px)`; // the panel's corners
    const s = this.svg.style;
    s.transition = 'none';
    s.clipPath = inset(from);
    this.svg.getBoundingClientRect(); // commit the start
    s.transition = `clip-path ${ZOOM_MS}ms cubic-bezier(0.33, 1, 0.68, 1)`;
    s.clipPath = inset(to);
    this.sched.after(ZOOM_MS + 40, () => {
      s.transition = '';
      s.clipPath = '';
    });
  }

  #animateCamera(from, to, onDone) {
    const set = (vb) => this.svg.setAttribute('viewBox', vb.map((v) => v.toFixed(1)).join(' '));
    // Commit the start frame now so there's no flash of the un-zoomed view.
    set(from);
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    this.sched.animate(
      ZOOM_MS,
      (k) => set(from.map((s, i) => s + (to[i] - s) * ease(k))),
      onDone,
    );
  }
}

