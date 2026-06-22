// The neighborhood info card: a modal that pops up centered over the board when
// you tap an individual neighborhood (a leaf piece) on a solved map. Shows the
// name, what kind of place it is, its region, an approximate population, a small
// outline of its boundary, and a fun fact when we have one.
import { geoMercator } from 'd3-geo';
import { el, svgEl } from '../ui/dom.js';
import { labelOf, pathIds, shapeOf } from './tree.js';
import { PLACES } from '../data/places.js';

// Render the leaf's boundary as a small centered outline.
function shapeThumb(id) {
  const W = 150;
  const H = 116;
  const ring = shapeOf(id);
  const fc = {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
  const proj = geoMercator().fitExtent([[14, 12], [W - 14, H - 12]], fc);
  const d = 'M' + ring.map((c) => proj(c)).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z';
  const svg = svgEl('svg', { class: 'card-shape', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  svg.append(svgEl('path', { d, class: 'card-shape-path' }));
  return svg;
}

const fmtPop = (pop) =>
  pop == null ? null : `~${pop.toLocaleString('en-US')}`;

// Show the card for leaf `id` inside `host`. Returns a close function.
export function showCard(host, id) {
  const info = PLACES[id] || {};
  const region = labelOf(pathIds(id)[1]); // top-level region (la › region › … › leaf)

  const backdrop = el('div', { class: 'card-backdrop' });
  const close = () => {
    backdrop.classList.remove('show');
    setTimeout(() => backdrop.remove(), 200);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => e.key === 'Escape' && close();

  const pop = fmtPop(info.pop);
  const card = el('div', { class: 'card', role: 'dialog', 'aria-label': labelOf(id) }, [
    el('button', { class: 'card-close', onClick: close, 'aria-label': 'Close' }, '✕'),
    shapeThumb(id),
    el('h2', { class: 'card-name' }, labelOf(id)),
    el('div', { class: 'card-meta' }, [
      el('span', { class: 'card-chip' }, info.type || 'Neighborhood of L.A.'),
      el('span', { class: 'card-chip card-region' }, region),
    ]),
    el('div', { class: 'card-pop' },
      pop
        ? [el('b', {}, pop), ' residents (approx.)']
        : [el('b', {}, 'Mostly parkland'), ' — few residents'],
    ),
    info.fact ? el('p', { class: 'card-fact' }, info.fact) : null,
  ]);

  backdrop.append(card);
  // Close when tapping the backdrop, but not when tapping the card itself.
  backdrop.addEventListener('click', (e) => e.target === backdrop && close());
  document.addEventListener('keydown', onKey);

  host.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('show'));
  return close;
}
