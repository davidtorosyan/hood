// The "Rebuild LA" overworld: the whole county drawn place by place. What
// you've rebuilt is in colour, the rest is fog, and what you can build next
// glows — tap it on the map or pick it from the list below to play it.
import { el, svgEl, clear } from '../ui/dom.js';
import { ROOT, childrenOf, leavesOf, labelOf, pathIds } from '../jigsaw/tree.js';
import { projectAll, mapAspectOf } from '../jigsaw/geometry.js';
import { colorForIndex } from '../jigsaw/palette.js';
import { store } from '../store.js';
import { builtLeaves, frontier, offers, progress, finished } from './state.js';

// The board fits the county's real shape, so there's no dead band around it.
const W = 1000;
const H = Math.round(W / mapAspectOf(ROOT));
const ALL_PLACES = leavesOf(ROOT);
const REGIONS = childrenOf(ROOT);
const regionColor = (leaf) => colorForIndex(REGIONS.indexOf(pathIds(leaf)[1]));

// Where a puzzle sits, for its card: "San Gabriel Valley" / "West San Gabriel · SGV".
const whereOf = (id) => pathIds(id).slice(1, -1).reverse().map(labelOf).join(' · ') || 'LA County';

// onBack: home · onPlay(id): play that puzzle · onExplore: open Explore mode
export function renderOverworld(app, { onBack, onPlay, onExplore }) {
  const { links, picks } = offers();
  const front = frontier();
  const have = builtLeaves();
  const fresh = new Set(store.campaign.get('fresh') ? leavesOf(store.campaign.get('fresh')) : []);
  store.campaign.set('fresh', null); // flash it once
  const { built: nBuilt, total } = progress();
  const started = have.size > 0;

  // Which puzzle a tap on a place means: an offered/frontier build, or a link.
  const candidates = [...links, ...picks, ...front.filter((id) => !picks.includes(id))];
  const owner = new Map();
  for (const id of candidates) for (const l of leavesOf(id)) if (!owner.has(l)) owner.set(l, id);

  // --- the map ---
  const svg = svgEl('svg', { class: 'ow-map', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Map of what you have rebuilt' });
  const outlineIds = [...links, ...picks];
  const { places, outlines } = projectAll(ALL_PLACES, [10, 10, W - 10, H - 10], outlineIds);
  const placeLayer = svgEl('g');
  for (const p of places) {
    const cls = have.has(p.id)
      ? `ow-built${fresh.has(p.id) ? ' ow-fresh' : ''}`
      : owner.has(p.id)
        ? picks.includes(owner.get(p.id)) ? 'ow-offer' : 'ow-frontier'
        : 'ow-fog';
    const path = svgEl('path', { d: p.d, class: `ow-place ${cls}` });
    if (have.has(p.id)) path.style.setProperty('--fill', regionColor(p.id));
    path.dataset.place = p.id;
    placeLayer.append(path);
  }
  const outlineLayer = svgEl('g', { class: 'ow-outlines' });
  for (const o of outlines) {
    outlineLayer.append(svgEl('path', { d: o.d, class: `ow-outline ${links.includes(o.id) ? 'link' : 'offer'}`, 'data-puzzle': o.id }));
  }
  svg.append(placeLayer, outlineLayer);

  // --- the list of what's next ---
  const cards = new Map();
  const card = (id, kind) => {
    const n = childrenOf(id).length;
    const sub = kind === 'link'
      ? `${n} pieces you've built · ${whereOf(id)}`
      : `${n} places · ${whereOf(id)}`;
    const btn = el('button', { class: `ow-card ${kind}`, onClick: () => onPlay(id) }, [
      el('span', { class: 'ow-card-icon', 'aria-hidden': 'true' }, kind === 'link' ? '🔗' : '🧩'),
      el('span', { class: 'ow-card-text' }, [
        el('b', {}, kind === 'link' ? `Connect ${labelOf(id)}` : `Build ${labelOf(id)}`),
        el('span', { class: 'ow-card-sub' }, sub),
      ]),
      el('span', { class: 'ow-card-go', 'aria-hidden': 'true' }, '▶'),
    ]);
    cards.set(id, btn);
    return btn;
  };
  const list = el('div', { class: 'ow-list' }, [
    ...links.map((id) => card(id, 'link')),
    ...picks.map((id) => card(id, 'build')),
  ]);

  // Tap the map: select what's there (bringing its card into view).
  svg.addEventListener('click', (e) => {
    const leaf = e.target?.dataset?.place;
    const id = leaf && owner.get(leaf);
    if (!id) return;
    if (!cards.has(id)) list.prepend(card(id, links.includes(id) ? 'link' : 'build'));
    for (const [cid, c] of cards) c.classList.toggle('selected', cid === id);
    for (const o of outlineLayer.children) o.classList.toggle('selected', o.dataset.puzzle === id);
    cards.get(id).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  const intro = finished()
    ? el('div', { class: 'ow-intro done' }, [
        el('b', {}, '🎉 LA is whole again!'),
        el('span', {}, 'Every piece is back where it belongs. Nice work.'),
        el('button', { class: 'btn ow-explore', onClick: onExplore }, 'Explore the map'),
      ])
    : started
      ? el('div', { class: 'ow-intro' }, [
          el('div', { class: 'ow-count' }, [el('b', {}, `${nBuilt}`), ` of ${total} puzzles rebuilt`]),
          el('div', { class: 'pg-bar' }, [el('div', { class: 'pg-bar-fill', style: `width:${(100 * nBuilt) / total}%` })]),
          el('span', { class: 'ow-hint' }, links.length ? 'Connect what you’ve built, or keep growing outward.' : 'Keep growing outward from what you’ve built.'),
        ])
      : el('div', { class: 'ow-intro' }, [
          el('b', {}, 'Oh no — LA’s been scrambled!'),
          el('span', {}, 'Rebuild it piece by piece. Pick a spot to start; the map grows outward from there.'),
        ]);

  clear(app);
  app.append(
    el('div', { class: 'screen' }, [
      el('div', { class: 'topbar' }, [
        el('button', { class: 'icon-btn', onClick: onBack, 'aria-label': 'Home' }, '⌂'),
        el('span', { class: 'topbar-title' }, 'Rebuild LA'),
      ]),
      el('div', { class: 'screen-body ow-body' }, [
        intro,
        el('div', { class: 'ow-map-wrap' }, [svg]),
        finished() ? null : el('h2', { class: 'pg-h' }, started ? 'Up next' : 'Where to start?'),
        finished() ? null : list,
      ]),
    ]),
  );
}

// For the puzzle screen's tray: "🧩 12 of 69 puzzles rebuilt".
export function campaignLine() {
  const { built: n, total } = progress();
  return `🧩 ${n} of ${total} puzzles rebuilt`;
}

