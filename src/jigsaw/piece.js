// One puzzle piece. Its visual is split into two elements that move together:
//   - `g`        — the draggable BODY (shape + faint inner subdivisions). Lives
//                  in the board's piece layer; carries all the state classes.
//   - `labelEl`  — the label group (the name). Lives
//                  in the board's LABEL layer, which sits above every piece, so a
//                  label is never painted over by a neighbouring piece.
// Both share the same transform, so the label tracks the piece as it moves.
import { svgEl } from '../ui/dom.js';

export class Piece {
  // geom: a record from projectChildren(); meta: { label, color }. The label
  // element is built later via setLabel(plan), once the board has laid labels out
  // collectively (so they can dodge each other).
  constructor(geom, { label, color }) {
    this.id = geom.id;
    this.geom = geom;
    this.zoomable = geom.zoomable;
    this.tx = 0;
    this.ty = 0;
    this.placed = false; // on the map (vs loose in the tray)
    this.homeTx = 0; // its spot in the tray while loose
    this.homeTy = 0;
    this.labelEl = null;
    this.g = this.#buildBody(geom, color, label);
    // A glowing overlay of just the edge facing a piece we're connecting to.
    // Lives in the board's glow layer; rides this piece's transform.
    this.glowEl = svgEl('path', { class: 'jig-glow' });
    this.glowEl.style.display = 'none';
  }

  #buildBody(geom, color, label) {
    const g = svgEl('g', { class: `jig-piece ${geom.zoomable ? 'zoomy' : 'leaf'}` });
    g.dataset.cx = geom.cx.toFixed(1);
    g.dataset.cy = geom.cy.toFixed(1);
    g.dataset.name = label; // identity for the screenshot harness
    g.style.setProperty('--fill', color);
    // Just the piece's own outline — no inner subdivision lines (they blurred the
    // boundaries between pieces). Zoomability is shown by piece weight instead.
    g.append(svgEl('path', { d: geom.d, class: 'jig-shape' }));
    return g;
  }

  // Build the label element from a layout plan (see layoutLabels). `done` adds
  // a small ✓ — this piece's own puzzle has been solved. Sets labelEl.
  setLabel(plan, { done = false } = {}) {
    const wrap = svgEl('g', { class: 'jig-label-wrap' });
    const text = svgEl('text', { class: 'jig-label', 'text-anchor': 'middle' });
    text.style.fontSize = `${plan.fs.toFixed(1)}px`;
    text.style.strokeWidth = `${(plan.fs * 0.2).toFixed(1)}px`;
    plan.lines.forEach((ln, i) => {
      const ts = svgEl('tspan', {
        x: plan.x.toFixed(1),
        y: (plan.y + (i - (plan.lines.length - 1) / 2) * plan.lineHeight).toFixed(1),
        'dominant-baseline': 'central',
      });
      ts.textContent = ln;
      text.append(ts);
    });
    if (done) {
      const check = svgEl('tspan', { class: 'jig-check', dx: (plan.fs * 0.15).toFixed(1) });
      check.textContent = '✓';
      text.append(check);
    }
    wrap.append(text);
    this.labelEl = wrap;
    this.applyTransform(); // keep the new label in sync with the piece position
    return wrap;
  }

  // The piece's extent [minX, minY, maxX, maxY] including its label, in its
  // assembled coordinates — used to pack the tray without hiding names.
  extent(labelBoxes) {
    const { minX, minY, w, h } = this.geom;
    let box = [minX, minY, minX + w, minY + h];
    for (const b of labelBoxes) {
      box = [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])];
    }
    return box;
  }

  // --- placement -----------------------------------------------------------
  moveTo(tx, ty) {
    this.tx = tx;
    this.ty = ty;
    this.applyTransform();
  }

  applyTransform() {
    // Use the CSS `transform` PROPERTY, not the SVG `transform` attribute: only
    // the CSS property animates via CSS transitions in Safari/Firefox. The body
    // and the label share the transform so they move as one.
    const t = `translate(${this.tx.toFixed(1)}px, ${this.ty.toFixed(1)}px)`;
    this.g.style.transform = t;
    if (this.labelEl) this.labelEl.style.transform = t;
    this.glowEl.style.transform = t;
    this.g.dataset.tx = this.tx.toFixed(1); // exposed for the screenshot harness
    this.g.dataset.ty = this.ty.toFixed(1);
  }

  // "Placed" = on the map → shows its map colour (vs the grey of a loose piece).
  setPlaced(on) {
    this.placed = on;
    this.g.classList.toggle('placed', on);
    if (on) {
      this.g.classList.remove('exploding', 'dragging');
      this.labelEl.classList.remove('exploding');
    }
  }

  // Back to a loose look (used when the player scrambles an assembled map).
  reset() {
    this.g.classList.remove('placed', 'zoomable', 'selectable', 'dragging', 'anchor', 'hinted');
    this.setGlow(0, '');
  }

  // --- transient visual state ---------------------------------------------
  // Light up the facing edge `d` (in this piece's local coords) at strength
  // 0..1, as it nears a connection. d='' / g<=0 clears it.
  setGlow(g, d) {
    if (g > 0 && d) {
      this.glowEl.setAttribute('d', d);
      this.glowEl.style.setProperty('--glow', g.toFixed(3));
      this.glowEl.style.display = '';
    } else {
      this.glowEl.style.display = 'none';
      this.glowEl.removeAttribute('d');
    }
  }

  setDragging(on) {
    this.g.classList.toggle('dragging', on);
  }

  // Briefly transition the transform — used to spring the map back after a pan.
  setSettling(on) {
    this.g.classList.toggle('settling', on);
    this.labelEl.classList.toggle('settling', on);
  }

  // The quick eased "click" as a piece pulls the last bit into place.
  setSnapping(on) {
    this.g.classList.toggle('snapping', on);
    this.labelEl.classList.toggle('snapping', on);
  }

  setExploding(on) {
    this.g.classList.toggle('exploding', on);
    this.labelEl.classList.toggle('exploding', on);
  }

  markZoomable() {
    if (this.zoomable) this.g.classList.add('zoomable');
  }

  // A leaf piece on a solved board: tappable to open its info card.
  markSelectable() {
    this.g.classList.add('selectable');
  }

  // Smoosh this piece into the combined parent region: its fill morphs to the
  // shared `color`, its border melts into that fill (so the seams between pieces
  // vanish), and its label fades — leaving one solid shape. Used on zoom-out. The
  // Board adds the `.collapsing` class (with the transition) first, then calls this.
  collapse(color) {
    this.g.style.setProperty('--fill', color);
    this.labelEl.style.transition = 'opacity 0.26s ease';
    this.labelEl.style.opacity = '0';
  }

  // Pulse the piece a few times to draw the eye (a search just landed on it).
  flash() {
    this.#restartClass('flash', 1700);
  }

  // Fade the piece (body + label) out — used for the siblings when zooming in.
  fadeOut() {
    for (const el of [this.g, this.labelEl]) {
      el.style.transition = 'opacity 0.4s ease';
      el.style.opacity = '0';
    }
  }

  // A quick side-to-side shake: "not this one".
  wiggle() {
    this.#restartClass('wiggle', 450);
  }

  // A soft pulse that says "this one" — the find-it hint in the tray, or the
  // neighbour named in a placement hint.
  pulse() {
    this.#restartClass('pulse', 1900);
  }

  #restartClass(cls, ms) {
    this.g.classList.remove(cls);
    void this.g.getBoundingClientRect(); // restart the CSS animation from the top
    this.g.classList.add(cls);
    clearTimeout(this[`_${cls}`]);
    this[`_${cls}`] = setTimeout(() => this.g.classList.remove(cls), ms);
  }
}
