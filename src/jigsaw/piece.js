// One puzzle piece: its SVG group (shape + faint inner subdivisions + label) and
// its placement state (tx/ty translate, whether it's locked into place). The
// Board owns the drag/snap logic and calls these small methods to reflect state
// — keeping all DOM-class bookkeeping for a piece in one place.
import { svgEl } from '../ui/dom.js';
import { wrapLabel, labelFont } from './labels.js';

export class Piece {
  // geom: a record from projectChildren(); meta: { label, color }.
  constructor(geom, { label, color }) {
    this.id = geom.id;
    this.geom = geom;
    this.zoomable = geom.zoomable;
    this.tx = 0;
    this.ty = 0;
    this.locked = false;
    this.g = this.#build(geom, label, color);
  }

  #build(geom, label, color) {
    const g = svgEl('g', { class: `jig-piece ${geom.zoomable ? 'zoomy' : 'leaf'}` });
    g.dataset.cx = geom.cx.toFixed(1);
    g.dataset.cy = geom.cy.toFixed(1);
    g.style.setProperty('--fill', color);

    g.append(svgEl('path', { d: geom.d, class: 'jig-shape' }));

    // Faint outlines of this piece's own children — signals it breaks down.
    if (geom.inner) {
      for (const d of geom.inner) g.append(svgEl('path', { d, class: 'jig-inner' }));
    }

    g.append(this.#label(geom, label));
    return g;
  }

  #label(geom, label) {
    const lines = wrapLabel(label);
    const { fs, lineHeight } = labelFont(geom, lines);
    const text = svgEl('text', { class: 'jig-label', 'text-anchor': 'middle' });
    text.style.fontSize = `${fs.toFixed(1)}px`;
    text.style.strokeWidth = `${(fs * 0.2).toFixed(1)}px`;
    lines.forEach((ln, i) => {
      const ts = svgEl('tspan', {
        x: geom.cx,
        y: (geom.cy + (i - (lines.length - 1) / 2) * lineHeight).toFixed(1),
        'dominant-baseline': 'central',
      });
      ts.textContent = ln;
      text.append(ts);
    });
    return text;
  }

  // --- placement -----------------------------------------------------------
  moveTo(tx, ty) {
    this.tx = tx;
    this.ty = ty;
    this.applyTransform();
  }

  applyTransform() {
    this.g.setAttribute('transform', `translate(${this.tx.toFixed(1)} ${this.ty.toFixed(1)})`);
  }

  lock() {
    this.locked = true;
    this.g.classList.add('placed');
    this.g.classList.remove('jig-near', 'exploding', 'dragging');
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
  }

  markZoomable() {
    if (this.zoomable) this.g.classList.add('zoomable');
  }

  // Centre of this piece in board user-space, given its current translate —
  // used to aim a simulated/real grab and to compute zoom boxes.
  get centerX() {
    return this.geom.cx + this.tx;
  }
  get centerY() {
    return this.geom.cy + this.ty;
  }
}
