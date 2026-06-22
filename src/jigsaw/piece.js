// One puzzle piece. Its visual is split into two elements that move together:
//   - `g`        — the draggable BODY (shape + faint inner subdivisions). Lives
//                  in the board's piece layer; carries all the state classes.
//   - `labelEl`  — the label group (text, plus a leader line for callouts). Lives
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
    this.locked = false;
    this.labelEl = null;
    this.g = this.#buildBody(geom, color, label);
  }

  #buildBody(geom, color, label) {
    const g = svgEl('g', { class: `jig-piece ${geom.zoomable ? 'zoomy' : 'leaf'}` });
    g.dataset.cx = geom.cx.toFixed(1);
    g.dataset.cy = geom.cy.toFixed(1);
    g.dataset.name = label; // identity for the screenshot harness
    g.style.setProperty('--fill', color);
    g.append(svgEl('path', { d: geom.d, class: 'jig-shape' }));
    if (geom.inner) {
      for (const d of geom.inner) g.append(svgEl('path', { d, class: 'jig-inner' }));
    }
    return g;
  }

  // Build the label element from a layout plan (see layoutLabels). Sets labelEl.
  setLabel(plan) {
    const wrap = svgEl('g', { class: `jig-label-wrap${plan.callout ? ' callout' : ''}` });
    if (plan.callout) {
      wrap.append(svgEl('line', {
        class: 'jig-leader',
        x1: plan.anchorX.toFixed(1), y1: plan.anchorY.toFixed(1),
        x2: plan.x.toFixed(1), y2: plan.y.toFixed(1),
      }));
      wrap.append(svgEl('circle', {
        class: 'jig-dot', cx: plan.anchorX.toFixed(1), cy: plan.anchorY.toFixed(1), r: 3.5,
      }));
    }
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
    wrap.append(text);
    this.labelEl = wrap;
    this.applyTransform(); // keep the new label in sync with the piece position
    return wrap;
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
    this.g.dataset.tx = this.tx.toFixed(1); // exposed for the screenshot harness
    this.g.dataset.ty = this.ty.toFixed(1);
  }

  lock() {
    this.locked = true;
    this.g.classList.add('placed');
    this.g.classList.remove('jig-near', 'exploding', 'dragging');
    this.labelEl.classList.remove('exploding');
  }

  // Return to a loose state (used when the player jumbles an assembled map).
  unlock() {
    this.locked = false;
    this.g.classList.remove('placed', 'zoomable', 'selectable', 'jig-near', 'dragging');
  }

  // --- transient visual state ---------------------------------------------
  setNear(on) {
    this.g.classList.toggle('jig-near', on && !this.locked);
  }

  setDragging(on) {
    this.g.classList.toggle('dragging', on);
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

  // Fade the piece (body + label) out — used for the siblings when zooming in.
  fadeOut() {
    for (const el of [this.g, this.labelEl]) {
      el.style.transition = 'opacity 0.4s ease';
      el.style.opacity = '0';
    }
  }

  // Centre of this piece in board user-space, given its current translate.
  get centerX() {
    return this.geom.cx + this.tx;
  }
  get centerY() {
    return this.geom.cy + this.ty;
  }
}
