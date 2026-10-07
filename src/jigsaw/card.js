// The place card: a modal that pops up when you tap an individual place (a leaf
// piece) on a solved map. Shows the name, what kind of place it is, where it
// sits (group · region), an approximate population and area, a small outline of
// its boundary, a fun fact when we have one, and the places it borders.
import { geoMercator } from 'd3-geo';
import { el, svgEl } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import NEIGHBORS from '../data/neighbors.json';
import { labelOf, pathIds, shapeOf } from './tree.js';
import { PLACES } from '../data/places.js';
import { statsOf, fmtArea } from './stats.js';

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

// Show the card for place `id`. Its neighbours are tappable: each opens that
// place's card instead (wandering next door is half the fun — and it's exactly
// the "what's near what" being learned). Returns a close function.
export function showCard(id) {
  const info = PLACES[id] || {};
  const path = pathIds(id); // la › region › (group ›) … › place
  const region = labelOf(path[1]);
  const group = path.length > 3 ? labelOf(path[path.length - 2]) : null;
  const pop = fmtPop(info.pop);
  const area = `${fmtArea(statsOf(id).area)} sq mi`;
  const near = NEIGHBORS[id] || [];

  let close = () => {};
  const hop = (n) => {
    close();
    showCard(n);
  };
  const closeBtn = el('button', { class: 'card-close', onClick: () => close(), 'aria-label': 'Close' }, '✕');
  const card = el('div', { class: 'card' }, [
    closeBtn,
    shapeThumb(id),
    el('h2', { class: 'card-name' }, labelOf(id)),
    el('div', { class: 'card-meta' }, [
      el('span', { class: 'card-chip' }, info.type || 'Neighborhood of L.A.'),
      el('span', { class: 'card-chip card-region' }, group ? `${group} · ${region}` : region),
    ]),
    el('div', { class: 'card-pop' },
      pop
        ? [el('b', {}, pop), ' residents · ', el('b', {}, area)]
        : [el('b', {}, 'Mostly parkland'), ' · ', el('b', {}, area)],
    ),
    info.fact ? el('p', { class: 'card-fact' }, info.fact) : null,
    near.length
      ? el('div', { class: 'card-near' }, [
          el('div', { class: 'card-near-title' }, 'Borders'),
          el('div', { class: 'card-near-list' },
            near.map((n) => el('button', { class: 'card-near-chip', onClick: () => hop(n) }, n)),
          ),
        ])
      : null,
  ]);
  close = openModal(card, { label: labelOf(id), focus: closeBtn });
  return close;
}
