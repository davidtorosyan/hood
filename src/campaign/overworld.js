// The "Rebuild LA" overworld: an empty county outline — the board — that you
// fill in. Built places are in colour; each built-but-unlinked puzzle is its
// own outlined "island", and connecting a district merges its islands into
// one. Open slots (what you can build next) show as whole puzzle shapes —
// tap one on the map or pick it from the list below to play it.
import { el, svgEl, clear } from '../ui/dom.js';
import { ROOT, childrenOf, leavesOf, labelOf, pathIds } from '../jigsaw/tree.js';
import { projectAll, mapAspectOf } from '../jigsaw/geometry.js';
import { colorForIndex } from '../jigsaw/palette.js';
import { store } from '../store.js';
import { builtLeaves, districtProgress, frontier, offers, progress, finished, topBuilt } from './state.js';

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

  const slots = [...picks, ...front.filter((id) => !picks.includes(id))];

  // --- the map ---
  const svg = svgEl('svg', { class: 'ow-map', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Map of what you have rebuilt' });
  const { pathOf } = projectAll(REGIONS, [10, 10, W - 10, H - 10]);
  const layer = (cls) => svgEl('g', cls ? { class: cls } : {});
  // The empty board: the county's silhouette. Each region is stroked, then
  // filled on top without a stroke, so only the outer edge shows.
  const board = layer('ow-board');
  for (const r of REGIONS) board.append(svgEl('path', { d: pathOf(r), class: 'ow-board-edge' }));
  for (const r of REGIONS) board.append(svgEl('path', { d: pathOf(r), class: 'ow-board-fill' }));
  // Open slots, whole (their insides are still a mystery).
  const slotLayer = layer();
  for (const id of slots) {
    slotLayer.append(svgEl('path', { d: pathOf(id), class: `ow-slot${picks.includes(id) ? ' offer' : ''}`, 'data-puzzle': id }));
  }
  // What you've built, place by place, then an outline around each island.
  const builtLayer = layer();
  for (const leaf of ALL_PLACES) {
    if (!have.has(leaf)) continue;
    const path = svgEl('path', { d: pathOf(leaf), class: `ow-place${fresh.has(leaf) ? ' ow-fresh' : ''}` });
    path.style.setProperty('--fill', regionColor(leaf));
    path.dataset.place = leaf;
    builtLayer.append(path);
  }
  const islandLayer = layer('ow-outlines');
  for (const id of topBuilt()) islandLayer.append(svgEl('path', { d: pathOf(id), class: 'ow-island' }));
  for (const id of links) islandLayer.append(svgEl('path', { d: pathOf(id), class: 'ow-outline link', 'data-puzzle': id }));
  svg.append(board, slotLayer, builtLayer, islandLayer);

  // Which puzzle a tap means: a slot, or a link over built places.
  const linkOf = new Map();
  for (const id of links) for (const l of leavesOf(id)) if (!linkOf.has(l)) linkOf.set(l, id);
  const tapped = (t) => t?.dataset?.puzzle || linkOf.get(t?.dataset?.place);

  // --- the list of what's next ---
  const cards = new Map();
  const card = (id, kind) => {
    const n = childrenOf(id).length;
    let sub;
    if (kind === 'link') sub = `Join your ${n} built pieces into one · ${whereOf(id)}`;
    else if (!started) sub = `${n} places · ${whereOf(id)}`;
    else {
      const d = districtProgress(id);
      sub = `${n} places · ${labelOf(d.parent)} · ${d.built} of ${d.total} built`;
    }
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
    const id = tapped(e.target);
    if (!id) return;
    if (!cards.has(id)) list.prepend(card(id, links.includes(id) ? 'link' : 'build'));
    for (const [cid, c] of cards) c.classList.toggle('selected', cid === id);
    for (const o of svg.querySelectorAll('[data-puzzle]')) o.classList.toggle('selected', o.dataset.puzzle === id);
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
          links.length
            ? el('span', { class: 'ow-hint link' }, `🔗 Every piece of ${labelOf(links[0])} is built — connect them!`)
            : el('span', { class: 'ow-hint' }, 'Finish a district and you can connect its pieces into one.'),
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

