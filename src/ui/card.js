// The compact learning card — the core teaching artifact, shown on reveals and
// in Browse. Deliberately scannable: region, nearby, anchors, identity,
// confusions, and a mental hook.
import { el } from './dom.js';
import { CLUSTERS } from '../data/neighborhoods.js';

function row(label, value) {
  return el('div', { class: 'card-row' }, [
    el('span', { class: 'card-label' }, label),
    el('span', { class: 'card-value' }, value),
  ]);
}

function chips(label, names) {
  if (!names || names.length === 0) return null;
  return el('div', { class: 'card-row' }, [
    el('span', { class: 'card-label' }, label),
    el(
      'span',
      { class: 'card-chips' },
      names.map((n) => el('span', { class: 'chip' }, n)),
    ),
  ]);
}

export function learningCard(n, { compact = false } = {}) {
  return el('div', { class: 'lcard' }, [
    el('div', { class: 'lcard-head' }, [
      el('h2', { class: 'lcard-name' }, n.name),
      el('span', { class: 'lcard-region' }, n.region),
    ]),
    el('p', { class: 'lcard-hook' }, [el('span', { class: 'hook-mark' }, '🧭 '), n.hook]),
    chips('Near', n.nearby),
    chips('Anchors', n.anchors),
    compact ? null : el('p', { class: 'lcard-identity' }, n.identity),
    compact ? null : chips('Confused with', n.confusions),
    compact ? null : row('Cluster', CLUSTERS[n.cluster] ?? n.cluster),
  ]);
}
