// Freeways: a freeway's sign — interstate (blue/red), US route (white),
// state route (green) — drawn at [ax, ay].
import { svgEl } from '../ui/dom.js';
import { REFS } from './puzzles.js';

export function shield(ref, [ax, ay], scale = 1) {
  const kind = REFS[ref]?.kind || 'CA';
  const w = (ref.length >= 3 ? 70 : 56) * scale;
  const h = 48 * scale;
  const g = svgEl('g', { class: `fw-shield ${kind}` });
  g.append(
    svgEl('rect', { x: ax - w / 2, y: ay - h / 2, width: w, height: h, rx: (kind === 'US' ? 8 : 12) * scale }),
    kind === 'I' ? svgEl('rect', { x: ax - w / 2, y: ay - h / 2, width: w, height: 13 * scale, rx: 6 * scale, class: 'fw-shield-top' }) : '',
    Object.assign(svgEl('text', { x: ax, y: ay + (kind === 'I' ? 15 : 11) * scale, 'text-anchor': 'middle', style: `font-size:${24 * scale}px` }), { textContent: ref }),
  );
  return g;
}
